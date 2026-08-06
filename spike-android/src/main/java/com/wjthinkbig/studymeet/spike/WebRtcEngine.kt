package com.wjthinkbig.studymeet.spike

import android.content.Context
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
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
            cam.stopCapture()
        }
    }

    fun release() {
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
