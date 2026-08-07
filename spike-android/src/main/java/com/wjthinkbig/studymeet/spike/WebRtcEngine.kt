package com.wjthinkbig.studymeet.spike

import android.content.Context
import org.json.JSONObject
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoSink
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * 로컬 카메라 트랙만 다루는 최소 엔진.
 * PIP가 위협하는 것은 캡처 라이프사이클이므로, 이 측정에는 PeerConnection이 필요 없다.
 */
class WebRtcEngine(
    private val context: Context,
    val eglBase: EglBase,
) {
    companion object {
        // 설계 §3.1의 기본 화질. 얼굴 확인이 목적이라 270p로 충분하다.
        const val WIDTH = 480
        const val HEIGHT = 270
        const val FPS = 24
    }

    private var factory: PeerConnectionFactory? = null
    private var capturer: CameraVideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceHelper: SurfaceTextureHelper? = null
    private var localTrack: VideoTrack? = null
    @Volatile
    private var peerConnection: PeerConnection? = null
    private val candidateLock = Any()
    private var remoteDescriptionSet = false
    private val pendingCandidates = mutableListOf<IceCandidate>()

    /** 전면 카메라를 열고 트랙을 만들어 sink와 preview에 붙인다. 성공하면 true. */
    fun startLocalCamera(sink: VideoSink, preview: SurfaceViewRenderer): Boolean {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions()
        )

        val pcFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
        factory = pcFactory

        val enumerator = Camera2Enumerator(context)
        val frontName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()
            ?: return false

        val cam = enumerator.createCapturer(frontName, null) ?: return false
        capturer = cam

        val helper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
        surfaceHelper = helper

        val source = pcFactory.createVideoSource(cam.isScreencast)
        videoSource = source
        cam.initialize(helper, context, source.capturerObserver)
        cam.startCapture(WIDTH, HEIGHT, FPS)

        val track = pcFactory.createVideoTrack("local_video", source)
        track.addSink(sink)
        track.addSink(preview)
        localTrack = track
        return true
    }

    /**
     * 카메라 캡처를 멈추거나 재개한다.
     * 트랙을 파괴하지 않으므로 sink 재부착이 필요 없다.
     */
    fun setCameraEnabled(enabled: Boolean) {
        val cam = capturer ?: return
        if (enabled) {
            cam.startCapture(WIDTH, HEIGHT, FPS)
        } else {
            try {
                cam.stopCapture()
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
    }

    /**
     * 상대와 연결한다. isCaller 쪽이 offer를 만든다.
     * 시그널링 서버의 ready 이후에 호출한다.
     */
    fun connectPeer(
        isCaller: Boolean,
        signaling: SignalingClient,
        remoteSinks: List<VideoSink>,
    ) {
        val pcFactory = factory ?: return
        // TURN은 빌드 타임에 선택적이다. local.properties에 turn.url이 없으면
        // STUN만으로 동작한다 — 이것이 릴레이 비율 측정의 "before" 절반이다.
        val iceServers = buildList {
            add(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302")
                    .createIceServer()
            )
            if (BuildConfig.TURN_URL.isNotBlank()) {
                add(
                    PeerConnection.IceServer.builder(BuildConfig.TURN_URL)
                        .setUsername(BuildConfig.TURN_USER)
                        .setPassword(BuildConfig.TURN_PASS)
                        .createIceServer()
                )
            }
        }

        val pc = pcFactory.createPeerConnection(
            PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            },
            object : PeerConnection.Observer {
                override fun onIceCandidate(candidate: IceCandidate) {
                    signaling.send(
                        JSONObject()
                            .put("type", "candidate")
                            .put("candidate", candidate.sdp)
                            .put("sdpMid", candidate.sdpMid)
                            .put("sdpMLineIndex", candidate.sdpMLineIndex)
                            .toString()
                    )
                }

                override fun onTrack(transceiver: org.webrtc.RtpTransceiver) {
                    val track = transceiver.receiver.track() as? VideoTrack ?: return
                    // 프레임 카운터와 화면 렌더러 둘 다 붙인다.
                    remoteSinks.forEach { track.addSink(it) }
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    // 설계 §4.3의 이탈 교차 확인 경로. 스파이크에서는 로그만 남긴다.
                    android.util.Log.i("PipSpike", "iceConnectionState=$state")
                    if (state != PeerConnection.IceConnectionState.CONNECTED) return

                    // getStats 콜백은 비동기로 온다. release()가 그 사이 peerConnection을
                    // null로 만들 수 있으므로 호출 시점에 로컬로 스냅샷한다.
                    val pc = peerConnection
                    if (pc == null) {
                        android.util.Log.w(
                            "PipSpike",
                            "selectedCandidatePair localType=NONE_FOUND reason=peerConnectionReleased",
                        )
                        return
                    }
                    pc.getStats { report ->
                        // RTCStats.type/members, RTCStatsReport.statsMap 접근자 이름과
                        // "candidate-pair"/"state"/"succeeded"/"localCandidateId"/"candidateType"
                        // 멤버 키는 io.github.webrtc-sdk:android:144.7559.09의 classes.jar(javap)와
                        // libjingle_peerconnection_so.so 문자열 상수로 확인했다 (task-6-report.md 참고).
                        val succeededPairs = report.statsMap.values.filter {
                            it.type == "candidate-pair" && it.members["state"] == "succeeded"
                        }
                        if (succeededPairs.isEmpty()) {
                            // CONNECTED인데 succeeded pair가 없다 — 태블릿에서 보는 사람이
                            // "측정 실패"와 "relay 없음"을 헷갈리면 안 되므로 명시적으로 남긴다.
                            android.util.Log.w(
                                "PipSpike",
                                "selectedCandidatePair localType=NONE_FOUND reason=noSucceededPairInStats",
                            )
                            return@getStats
                        }
                        succeededPairs.forEach { pair ->
                            val localId = pair.members["localCandidateId"] as? String
                            val local = localId?.let { report.statsMap[it] }
                            val candidateType = local?.members?.get("candidateType") as? String
                            // host=같은 LAN 직결, srflx=STUN NAT 통과, relay=TURN 중계(서버 대역폭 사용).
                            val localType = candidateType ?: "TYPE_UNKNOWN"
                            android.util.Log.i(
                                "PipSpike",
                                "selectedCandidatePair localType=$localType",
                            )
                        }
                    }
                }

                override fun onSignalingChange(state: PeerConnection.SignalingState) {}
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
                override fun onAddStream(stream: org.webrtc.MediaStream) {}
                override fun onRemoveStream(stream: org.webrtc.MediaStream) {}
                override fun onDataChannel(channel: org.webrtc.DataChannel) {}
                override fun onRenegotiationNeeded() {}
            },
        ) ?: return

        peerConnection = pc
        localTrack?.let { pc.addTrack(it, listOf("stream")) }

        if (isCaller) {
            pc.createOffer(
                object : SimpleSdpObserver() {
                    override fun onCreateSuccess(sdp: SessionDescription) {
                        pc.setLocalDescription(SimpleSdpObserver(), sdp)
                        signaling.send(
                            JSONObject()
                                .put("type", "offer")
                                .put("sdp", sdp.description)
                                .toString()
                        )
                    }
                },
                MediaConstraints(),
            )
        }
    }

    /** 시그널링으로 받은 메시지를 처리한다. */
    fun handleSignal(json: JSONObject, signaling: SignalingClient) {
        val pc = peerConnection ?: return
        when (json.getString("type")) {
            "offer" -> {
                pc.setRemoteDescription(
                    object : SimpleSdpObserver() {
                        override fun onSetSuccess() {
                            flushPendingCandidates(pc)
                        }
                    },
                    SessionDescription(SessionDescription.Type.OFFER, json.getString("sdp")),
                )
                pc.createAnswer(
                    object : SimpleSdpObserver() {
                        override fun onCreateSuccess(sdp: SessionDescription) {
                            pc.setLocalDescription(SimpleSdpObserver(), sdp)
                            signaling.send(
                                JSONObject()
                                    .put("type", "answer")
                                    .put("sdp", sdp.description)
                                    .toString()
                            )
                        }
                    },
                    MediaConstraints(),
                )
            }
            "answer" -> pc.setRemoteDescription(
                object : SimpleSdpObserver() {
                    override fun onSetSuccess() {
                        flushPendingCandidates(pc)
                    }
                },
                SessionDescription(SessionDescription.Type.ANSWER, json.getString("sdp")),
            )
            "candidate" -> queueOrAddCandidate(
                pc,
                IceCandidate(
                    json.getString("sdpMid"),
                    json.getInt("sdpMLineIndex"),
                    json.getString("candidate"),
                ),
            )
        }
    }

    /** 원격 description이 적용된 뒤에만 후보를 넣을 수 있다. 그 전에 온 것은 모아 두었다 흘려보낸다. */
    private fun queueOrAddCandidate(pc: PeerConnection, candidate: IceCandidate) {
        val addNow = synchronized(candidateLock) {
            if (remoteDescriptionSet) {
                true
            } else {
                pendingCandidates.add(candidate)
                false
            }
        }
        // 네이티브 호출은 락 밖에서 한다. addIceCandidate는 libwebrtc 시그널링 스레드를
        // 블로킹하는데, flushPendingCandidates를 부르는 onSetSuccess도 같은 스레드에서 온다.
        if (addNow) addCandidateLogged(pc, candidate)
    }

    private fun flushPendingCandidates(pc: PeerConnection) {
        val drained = synchronized(candidateLock) {
            remoteDescriptionSet = true
            val copy = pendingCandidates.toList()
            pendingCandidates.clear()
            copy
        }
        drained.forEach { addCandidateLogged(pc, it) }
    }

    /**
     * 거부된 후보는 조용히 사라지면 안 된다.
     * 릴레이 비율 측정에서 구현 결함과 실제 NAT 실패를 구분할 수 없게 된다.
     */
    private fun addCandidateLogged(pc: PeerConnection, candidate: IceCandidate) {
        if (!pc.addIceCandidate(candidate)) {
            android.util.Log.w("PipSpike", "addIceCandidate rejected: ${candidate.sdp}")
        }
    }

    fun release() {
        peerConnection?.dispose()
        peerConnection = null
        synchronized(candidateLock) {
            pendingCandidates.clear()
            remoteDescriptionSet = false
        }
        try {
            capturer?.stopCapture()
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        capturer?.dispose()
        localTrack?.dispose()
        videoSource?.dispose()
        surfaceHelper?.dispose()
        factory?.dispose()
        capturer = null
        localTrack = null
        videoSource = null
        surfaceHelper = null
        factory = null
    }
}

/** SdpObserver의 네 메서드를 매번 쓰지 않기 위한 기본 구현. */
open class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {
        android.util.Log.w("PipSpike", "createSdp failed: $error")
    }
    override fun onSetFailure(error: String?) {
        android.util.Log.w("PipSpike", "setSdp failed: $error")
    }
}
