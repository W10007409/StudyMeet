package com.studymeet.child.video

import android.util.Base64
import android.util.Log
import com.google.gson.JsonObject
import com.studymeet.child.signaling.SignalingClient
import java.util.concurrent.atomic.AtomicLong

/**
 * 인코딩된 H.264 프레임을 원격 피어로 내보낸다.
 *
 * ### 전송 경로에 대한 사실 관계
 * 이 앱에는 아직 WebRTC PeerConnection 이 없다. `androidApp/build.gradle.kts` 의
 * `org.webrtc:google-webrtc` 의존성이 호환성 문제로 주석 처리되어 있고,
 * 현재 살아있는 유일한 미디어 경로는 시그널링 WebSocket 을 통한 JSON 릴레이다.
 * (카메라 영상도 `camera_frame` 타입으로 base64 JPEG 를 이 경로로 보내고 있다.)
 *
 * 그래서 이 클래스는 두 층으로 나뉜다.
 *
 * - [VideoTransport] — 프레임이 나가는 구멍. 캡처 파이프라인은 이 너머를 알지 못한다.
 * - [SignalingVideoTransport] — 지금 동작하는 구현. WebSocket 으로 프레임을 릴레이한다.
 *
 * WebRTC 의존성이 복구되면 [VideoTransport] 를 구현하는 클래스를 하나 더 만들어
 * 생성자에 끼워넣기만 하면 된다. [ScreenCaptureManager] 와 MainActivity 는 그대로다.
 * 그 구현이 해야 할 일은 파일 하단 주석에 정리해두었다.
 */
class WebRTCVideoSender(
    private val transport: VideoTransport
) : EncodedVideoSink {

    /** 프레임이 실제로 빠져나가는 지점. */
    interface VideoTransport {
        /** 전송 준비 여부. false 면 프레임은 조용히 버려진다. */
        fun isReady(): Boolean

        /** 아직 전송되지 못하고 큐에 쌓인 바이트 수. 백프레셔 판단에 쓰인다. */
        fun queuedBytes(): Long

        fun sendVideoFormat(csdBase64: String, width: Int, height: Int)

        fun sendVideoFrame(dataBase64: String, isKeyFrame: Boolean, timestampUs: Long)

        fun sendVideoEnded(reason: String?)
    }

    /** 캡처가 끝났을 때 호출자에게 알린다. */
    var onEnded: ((String?) -> Unit)? = null

    /** false 로 두면 프레임을 만들되 보내지는 않는다 (화면 공유 일시 중지). */
    @Volatile
    var isEnabled: Boolean = true

    private var cachedCsd: String? = null
    private var width = 0
    private var height = 0

    private val framesSent = AtomicLong(0)
    private val framesDropped = AtomicLong(0)
    private var bytesSent = 0L

    // ---------------------------------------------------------------------
    // EncodedVideoSink
    // ---------------------------------------------------------------------

    override fun onVideoFormat(csd: ByteArray, width: Int, height: Int) {
        this.width = width
        this.height = height
        val encoded = Base64.encodeToString(csd, Base64.NO_WRAP)
        cachedCsd = encoded

        if (!transport.isReady()) {
            // 아직 연결 전이라면 보관만 해둔다. 연결되면 resendFormat() 이 내보낸다.
            Log.d(TAG, "전송 준비 전 - SPS/PPS 보관 (${csd.size} bytes)")
            return
        }
        transport.sendVideoFormat(encoded, width, height)
        Log.d(TAG, "✅ 스트림 헤더 전송: ${csd.size} bytes, ${width}x$height")
    }

    override fun onEncodedFrame(data: ByteArray, isKeyFrame: Boolean, presentationTimeUs: Long) {
        if (!isEnabled || !transport.isReady()) {
            framesDropped.incrementAndGet()
            return
        }

        // 백프레셔. 릴레이가 밀리면 큐가 무한정 자라 지연이 누적된다.
        // 키프레임은 스트림 복구의 기준점이므로 마지막까지 지킨다.
        val queued = transport.queuedBytes()
        if (queued > QUEUE_HARD_LIMIT_BYTES) {
            framesDropped.incrementAndGet()
            if (framesDropped.get() % 30 == 0L) {
                Log.w(TAG, "⚠️ 전송 큐 포화 (${queued / 1024}KB) - 프레임 드롭 중")
            }
            return
        }
        if (!isKeyFrame && queued > QUEUE_SOFT_LIMIT_BYTES) {
            framesDropped.incrementAndGet()
            return
        }

        val encoded = Base64.encodeToString(data, Base64.NO_WRAP)
        transport.sendVideoFrame(encoded, isKeyFrame, presentationTimeUs)

        val count = framesSent.incrementAndGet()
        bytesSent += data.size
        if (count % 90 == 0L) {
            Log.d(
                TAG,
                "화면 프레임 #$count 전송 (누적 ${bytesSent / 1024}KB, 드롭 ${framesDropped.get()})"
            )
        }
    }

    override fun onVideoEnded(reason: String?) {
        Log.d(TAG, "화면 스트리밍 종료: reason=$reason, 전송 ${framesSent.get()}프레임")
        if (transport.isReady()) {
            transport.sendVideoEnded(reason)
        }
        cachedCsd = null
        framesSent.set(0)
        framesDropped.set(0)
        bytesSent = 0L
        onEnded?.invoke(reason)
    }

    /**
     * 보관해둔 SPS/PPS 를 다시 내보낸다.
     * 수신자가 늦게 합류했거나 재연결됐을 때 호출한다. 이어서
     * [ScreenCaptureManager.requestKeyFrame] 을 부르면 즉시 화면이 뜬다.
     */
    fun resendFormat(): Boolean {
        val csd = cachedCsd ?: return false
        if (!transport.isReady()) return false
        transport.sendVideoFormat(csd, width, height)
        Log.d(TAG, "스트림 헤더 재전송")
        return true
    }

    companion object {
        private const val TAG = "WebRTCVideoSender"

        /** 이 이상 밀리면 P 프레임을 버린다. */
        private const val QUEUE_SOFT_LIMIT_BYTES = 512L * 1024

        /** 이 이상 밀리면 키프레임까지 버린다. 지연 누적이 화질보다 나쁘다. */
        private const val QUEUE_HARD_LIMIT_BYTES = 2L * 1024 * 1024
    }
}

/**
 * 현재 동작하는 전송 구현. 시그널링 WebSocket 으로 프레임을 릴레이한다.
 *
 * 시그널링 서버(`signaling/server.js`)는 메시지를 해석하지 않고 같은 방의
 * 다른 피어에게 그대로 넘기므로, 새 메시지 타입을 추가해도 서버 수정이 필요 없다.
 *
 * 내보내는 메시지:
 * - `screen_format` — `{ csd, width, height, codec: "h264" }`
 * - `screen_frame`  — `{ data, key, ts }`
 * - `screen_ended`  — `{ reason }`
 */
class SignalingVideoTransport(
    private val clientProvider: () -> SignalingClient?
) : WebRTCVideoSender.VideoTransport {

    override fun isReady(): Boolean = clientProvider()?.isConnected() == true

    override fun queuedBytes(): Long = clientProvider()?.queuedBytes() ?: 0L

    override fun sendVideoFormat(csdBase64: String, width: Int, height: Int) {
        val json = JsonObject().apply {
            addProperty("type", "screen_format")
            addProperty("codec", "h264")
            addProperty("csd", csdBase64)
            addProperty("width", width)
            addProperty("height", height)
        }
        clientProvider()?.sendJson(json)
    }

    override fun sendVideoFrame(dataBase64: String, isKeyFrame: Boolean, timestampUs: Long) {
        val json = JsonObject().apply {
            addProperty("type", "screen_frame")
            addProperty("data", dataBase64)
            addProperty("key", isKeyFrame)
            addProperty("ts", timestampUs)
        }
        clientProvider()?.sendJson(json)
    }

    override fun sendVideoEnded(reason: String?) {
        val json = JsonObject().apply {
            addProperty("type", "screen_ended")
            addProperty("reason", reason ?: "stopped")
        }
        clientProvider()?.sendJson(json)
    }
}

/*
 * ---------------------------------------------------------------------------
 * WebRTC 경로를 되살릴 때
 * ---------------------------------------------------------------------------
 *
 * 1. androidApp/build.gradle.kts 에서 WebRTC 의존성 주석을 해제한다.
 *    google-webrtc 는 JCenter 종료 이후 방치됐으므로 유지보수되는 아티팩트를 쓴다:
 *      implementation("io.github.webrtc-sdk:android:114.5735.02")
 *
 * 2. 여기서 갈림길이 하나 있다. WebRTC 는 자체 인코더를 갖고 있어서, 보통은
 *    이미 인코딩된 H.264 를 밀어넣는 게 아니라 **원본 프레임**을 넘긴다.
 *
 *    (A) 권장 — WebRTC 에게 인코딩을 맡긴다:
 *        ScreenCapturerAndroid 가 MediaProjection 을 직접 다루므로
 *        ScreenCaptureManager 의 MediaCodec 계층이 통째로 필요 없어진다.
 *
 *          val capturer = ScreenCapturerAndroid(permissionResultData, object : MediaProjection.Callback() {})
 *          val source = factory.createVideoSource(true)  // isScreencast = true
 *          capturer.initialize(surfaceTextureHelper, context, source.capturerObserver)
 *          capturer.startCapture(width, height, 30)
 *          val track = factory.createVideoTrack("screen", source)
 *          peerConnection.addTrack(track, listOf("stream-id"))
 *
 *        isScreencast=true 는 인코더에게 "정지 화면이 많고 디테일이 중요하다"고 알려
 *        움직임이 없을 때 비트레이트를 떨어뜨리고 해상도를 유지하게 한다.
 *
 *    (B) 이미 인코딩된 프레임을 그대로 보내야 한다면 커스텀 VideoEncoder 를
 *        VideoEncoderFactory 에 등록해 이 클래스의 프레임을 전달해야 한다.
 *        훨씬 복잡하고, MediaCodec 을 두 번 거치지 않는다는 것 외엔 이점이 적다.
 *
 * 3. 어느 쪽이든 MainActivity 는 바뀌지 않는다. (A) 를 택하면
 *    ScreenCaptureManager 자리에 WebRTC 캡처러를 넣고,
 *    (B) 를 택하면 VideoTransport 구현만 교체한다.
 */
