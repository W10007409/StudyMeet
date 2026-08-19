package com.studymeet.child.video

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.Surface
import android.view.WindowManager
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * MediaProjection 으로 전체 화면을 캡처해 H.264 로 인코딩한다.
 *
 * ### 왜 CAPTURE_VIDEO_OUTPUT 이 아닌가
 * `android.permission.CAPTURE_VIDEO_OUTPUT` 은 `signature|privileged` 권한이다.
 * 플랫폼 서명 키로 서명됐거나 `/system/priv-app` 에 설치된 앱만 획득할 수 있고,
 * 일반 앱은 매니페스트에 선언해도 절대 부여받지 못한다.
 * 일반 배포 앱이 화면을 캡처하는 유일한 합법적 경로는 MediaProjection 이며,
 * 이 API 는 권한 대신 사용자 동의 다이얼로그를 요구한다.
 *
 * ### 사용 흐름
 * ```
 * val manager = ScreenCaptureManager(activity, sender)
 * // 1. 동의 인텐트를 띄운다
 * launcher.launch(manager.createPermissionIntent())
 * // 2. 결과를 넘긴다 — 포그라운드 서비스 기동 후 캡처가 시작된다
 * manager.onPermissionResult(result.resultCode, result.data)
 * // 3. 정리
 * manager.stop()
 * ```
 */
class ScreenCaptureManager(
    private val activity: Activity,
    private val sink: EncodedVideoSink,
    private val config: Config = Config()
) {

    /**
     * @param frameRate 목표 프레임레이트. 화면이 정지해 있으면 인코더는 이보다 적게 뱉는다.
     * @param maxWidth  0 이면 원본 해상도 그대로. 0 보다 크면 이 폭에 맞춰 축소한다.
     *                  원본 해상도 + 30fps 는 릴레이 대역폭을 크게 잡아먹으므로
     *                  네트워크가 좁을 때 여기서 조인다.
     * @param bitRate   0 이면 해상도로부터 자동 산출.
     * @param keyFrameIntervalSec IDR 간격. 늦게 합류한 수신자의 대기 시간을 결정한다.
     */
    data class Config(
        val frameRate: Int = 30,
        val maxWidth: Int = 0,
        val bitRate: Int = 0,
        val keyFrameIntervalSec: Int = 1
    )

    private val appContext: Context = activity.applicationContext

    private var projectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var encoder: MediaCodec? = null
    private var inputSurface: Surface? = null

    private var encoderThread: HandlerThread? = null
    private var encoderHandler: Handler? = null

    /** 서비스가 붙은 뒤에 프로젝션을 만들기 위해 결과를 잠시 보관한다. */
    private var pendingResultCode: Int = Activity.RESULT_CANCELED
    private var pendingResultData: Intent? = null
    private var serviceBound = false

    private val running = AtomicBoolean(false)
    private val formatDelivered = AtomicBoolean(false)

    private var captureWidth = 0
    private var captureHeight = 0

    /** 인코더가 CODEC_CONFIG 로 준 SPS/PPS. 재시작 없이 재전송할 수 있도록 들고 있는다. */
    private var codecSpecificData: ByteArray? = null

    val isRunning: Boolean get() = running.get()

    /**
     * 지금 인코더로 나가고 있는 프레임 크기. 캡처 중이 아니면 null.
     *
     * 원격 터치의 좌표 복원에 필요하다. 선생님 웹은 좌표를 **프레임 기준** 0~1 로 보내는데,
     * [resolveCaptureSize] 의 16배수 정렬과 축소 때문에 이 크기는 화면 크기와 다르다.
     * 그 차이를 되돌리는 계산은 [com.studymeet.child.input.CaptureGeometry] 에 있다.
     */
    val frameSize: Pair<Int, Int>?
        get() = if (running.get() && captureWidth > 0 && captureHeight > 0) {
            captureWidth to captureHeight
        } else {
            null
        }

    // ---------------------------------------------------------------------
    // 1단계: 사용자 동의
    // ---------------------------------------------------------------------

    /**
     * 시스템 화면 캡처 동의 다이얼로그를 띄우는 인텐트를 만든다.
     * 이 인텐트는 반드시 `startActivityForResult` / `ActivityResultLauncher` 로 실행해야 한다.
     */
    fun createPermissionIntent(): Intent {
        val manager = projectionManager ?: (
            activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            ).also { projectionManager = it }
        return manager.createScreenCaptureIntent()
    }

    // ---------------------------------------------------------------------
    // 2단계: 동의 결과 → 포그라운드 서비스 → 캡처 시작
    // ---------------------------------------------------------------------

    /**
     * 동의 다이얼로그 결과를 전달한다.
     *
     * MediaProjection 토큰은 포그라운드 서비스가 **이미 실행 중일 때만** 사용할 수 있으므로
     * 결과를 보관해두고 서비스가 연결된 뒤에 실제 캡처를 시작한다.
     */
    fun onPermissionResult(resultCode: Int, data: Intent?) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            Log.w(TAG, "사용자가 화면 공유를 거부했습니다")
            sink.onVideoEnded("permission_denied")
            return
        }
        if (running.get()) {
            Log.w(TAG, "이미 캡처 중입니다 - 요청 무시")
            return
        }

        pendingResultCode = resultCode
        pendingResultData = data

        try {
            val intent = ScreenCaptureService.intent(appContext)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent)
            } else {
                appContext.startService(intent)
            }
            // 바인딩 콜백은 서비스가 startForeground 를 마친 뒤에 도착하므로
            // 여기서 프로젝션을 만들면 Android 14+ 의 SecurityException 을 피할 수 있다.
            serviceBound = appContext.bindService(intent, serviceConnection, 0)
            if (!serviceBound) {
                Log.e(TAG, "❌ 화면 공유 서비스 바인딩 실패")
                cleanupAfterFailure("service_bind_failed")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 포그라운드 서비스 시작 실패: ${e.message}", e)
            cleanupAfterFailure("foreground_service_failed")
        }
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val code = pendingResultCode
            val data = pendingResultData
            pendingResultData = null
            if (data == null) return
            startCapture(code, data)
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.w(TAG, "화면 공유 서비스 연결이 끊어졌습니다")
            stop()
        }
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        try {
            val manager = projectionManager ?: (
                activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                ).also { projectionManager = it }

            val projection = manager.getMediaProjection(resultCode, data)
            if (projection == null) {
                Log.e(TAG, "❌ MediaProjection 생성 실패 (null)")
                cleanupAfterFailure("projection_null")
                return
            }
            mediaProjection = projection

            val thread = HandlerThread("ScreenEncoder").apply { start() }
            encoderThread = thread
            val handler = Handler(thread.looper)
            encoderHandler = handler

            // API 34+ 는 콜백 등록을 강제한다. 그 이전에도 사용자가 시스템 UI에서
            // 공유를 중단했을 때를 잡아내려면 필요하다.
            projection.registerCallback(projectionCallback, handler)

            val (width, height) = resolveCaptureSize()
            captureWidth = width
            captureHeight = height

            val codec = createEncoder(width, height, handler)
            encoder = codec
            inputSurface = codec.createInputSurface()
            codec.start()

            virtualDisplay = projection.createVirtualDisplay(
                VIRTUAL_DISPLAY_NAME,
                width,
                height,
                activity.resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC,
                inputSurface,
                null,
                handler
            )

            if (virtualDisplay == null) {
                Log.e(TAG, "❌ VirtualDisplay 생성 실패")
                cleanupAfterFailure("virtual_display_null")
                return
            }

            running.set(true)
            Log.d(TAG, "✅ 화면 캡처 시작: ${width}x$height @ ${config.frameRate}fps")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 화면 캡처 시작 실패: ${e.message}", e)
            cleanupAfterFailure("start_failed:${e.javaClass.simpleName}")
        }
    }

    // ---------------------------------------------------------------------
    // 인코더 구성
    // ---------------------------------------------------------------------

    /**
     * 캡처 해상도를 정한다.
     *
     * 대부분의 하드웨어 H.264 인코더는 16의 배수 폭/높이를 요구하므로 원본 해상도를
     * 그대로 쓰더라도 정렬은 반드시 거쳐야 한다. 정렬하지 않으면 초록 줄무늬가 생기거나
     * configure() 자체가 실패한다.
     */
    private fun resolveCaptureSize(): Pair<Int, Int> {
        var width: Int
        var height: Int

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = activity.windowManager.currentWindowMetrics.bounds
            width = bounds.width()
            height = bounds.height()
        } else {
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            (activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
                .defaultDisplay.getRealMetrics(metrics)
            width = metrics.widthPixels
            height = metrics.heightPixels
        }

        if (config.maxWidth > 0 && width > config.maxWidth) {
            val scale = config.maxWidth.toFloat() / width
            width = config.maxWidth
            height = (height * scale).toInt()
        }

        return align16(width) to align16(height)
    }

    private fun align16(value: Int): Int = (value / 16) * 16

    private fun resolveBitRate(width: Int, height: Int): Int {
        if (config.bitRate > 0) return config.bitRate
        // 화면 공유는 카메라 영상보다 정적이라 픽셀당 비트를 낮게 잡아도 충분하다.
        val estimated = (width.toLong() * height * config.frameRate * 0.06).toLong()
        return estimated.coerceIn(800_000L, 6_000_000L).toInt()
    }

    private fun createEncoder(width: Int, height: Int, handler: Handler): MediaCodec {
        val codec = MediaCodec.createEncoderByType(MIME_TYPE)
        codec.setCallback(encoderCallback, handler)

        // 프로파일/레벨 지정은 일부 기기에서 configure 를 실패시킨다.
        // 먼저 지연시간 최적화를 모두 켠 포맷으로 시도하고, 실패하면 최소 포맷으로 물러난다.
        try {
            codec.configure(
                buildFormat(width, height, lowLatency = true),
                null,
                null,
                MediaCodec.CONFIGURE_FLAG_ENCODE
            )
            return codec
        } catch (e: Exception) {
            Log.w(TAG, "저지연 포맷 configure 실패, 기본 포맷으로 재시도: ${e.message}")
        }

        // 실패한 코덱 인스턴스는 재사용할 수 없다.
        runCatching { codec.release() }

        val fallback = MediaCodec.createEncoderByType(MIME_TYPE)
        fallback.setCallback(encoderCallback, handler)
        fallback.configure(
            buildFormat(width, height, lowLatency = false),
            null,
            null,
            MediaCodec.CONFIGURE_FLAG_ENCODE
        )
        return fallback
    }

    private fun buildFormat(width: Int, height: Int, lowLatency: Boolean): MediaFormat {
        val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
            // Surface 입력이므로 색 포맷은 항상 이 값이어야 한다.
            setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface
            )
            setInteger(MediaFormat.KEY_BIT_RATE, resolveBitRate(width, height))
            setInteger(MediaFormat.KEY_FRAME_RATE, config.frameRate)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, config.keyFrameIntervalSec)

            // 화면이 정지해 있어도 이 간격마다 직전 프레임을 반복 인코딩한다.
            // 이게 없으면 정지 화면에서 스트림이 완전히 멎어 수신 측이 끊긴 것으로 오인한다.
            setLong(
                MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER,
                1_000_000L / config.frameRate
            )
        }

        if (!lowLatency) return format

        // --- 지연시간 최소화 ---
        // B 프레임은 미래 프레임을 기다리므로 실시간 전송에서는 순수한 지연 요인이다.
        format.setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0)
        // Baseline 프로파일은 B 프레임 자체가 없고 디코더 호환성이 가장 넓다.
        format.setInteger(
            MediaFormat.KEY_PROFILE,
            MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // 0 = 실시간 우선순위. 인코더가 프레임을 쌓아두지 않고 즉시 처리한다.
            format.setInteger(MediaFormat.KEY_PRIORITY, 0)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // 1 = 프레임 하나가 들어가면 하나가 바로 나온다.
            format.setInteger(MediaFormat.KEY_LATENCY, 1)
        }
        return format
    }

    // ---------------------------------------------------------------------
    // 인코더 콜백 — 여기서 프레임이 흘러나간다
    // ---------------------------------------------------------------------

    private val encoderCallback = object : MediaCodec.Callback() {

        override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {
            // Surface 입력 모드에서는 호출되지 않는다.
        }

        override fun onOutputBufferAvailable(
            codec: MediaCodec,
            index: Int,
            info: MediaCodec.BufferInfo
        ) {
            try {
                val buffer = codec.getOutputBuffer(index)
                if (buffer == null) {
                    codec.releaseOutputBuffer(index, false)
                    return
                }
                handleOutputBuffer(buffer, info)
                codec.releaseOutputBuffer(index, false)
            } catch (e: IllegalStateException) {
                // stop() 과 경합하면 코덱이 이미 해제된 상태일 수 있다. 정상 종료 경로다.
                Log.d(TAG, "출력 버퍼 처리 중 코덱이 종료됨: ${e.message}")
            } catch (e: Exception) {
                Log.e(TAG, "출력 버퍼 처리 실패: ${e.message}", e)
                runCatching { codec.releaseOutputBuffer(index, false) }
            }
        }

        override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
            // SPS/PPS 가 CODEC_CONFIG 버퍼 대신 여기로 오는 기기가 있다.
            deliverFormatFrom(format)
        }

        override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
            Log.e(TAG, "❌ 인코더 오류 (recoverable=${e.isRecoverable}): ${e.message}", e)
            if (e.isRecoverable) {
                runCatching { codec.start() }
                    .onFailure { stopInternal("encoder_unrecoverable") }
            } else {
                stopInternal("encoder_error")
            }
        }
    }

    private fun handleOutputBuffer(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (info.size <= 0) return

        buffer.position(info.offset)
        buffer.limit(info.offset + info.size)

        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            // 미디어 데이터가 아니라 스트림 헤더다. 프레임으로 흘려보내면 안 된다.
            val csd = ByteArray(info.size)
            buffer.get(csd)
            codecSpecificData = csd
            if (formatDelivered.compareAndSet(false, true)) {
                sink.onVideoFormat(csd, captureWidth, captureHeight)
            }
            return
        }

        val isKeyFrame = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0

        // 헤더가 아직 안 나갔는데 프레임이 먼저 도착하는 기기가 있다. 순서를 보정한다.
        if (!formatDelivered.get()) {
            codecSpecificData?.let { csd ->
                if (formatDelivered.compareAndSet(false, true)) {
                    sink.onVideoFormat(csd, captureWidth, captureHeight)
                }
            }
        }

        val frame = ByteArray(info.size)
        buffer.get(frame)
        sink.onEncodedFrame(frame, isKeyFrame, info.presentationTimeUs)
    }

    private fun deliverFormatFrom(format: MediaFormat) {
        if (formatDelivered.get()) return
        val sps = format.getByteBuffer("csd-0") ?: return
        val pps = format.getByteBuffer("csd-1")

        val spsBytes = ByteArray(sps.remaining()).also { sps.get(it) }
        val ppsBytes = pps?.let { ByteArray(it.remaining()).also { arr -> it.get(arr) } }
        val csd = if (ppsBytes != null) spsBytes + ppsBytes else spsBytes

        codecSpecificData = csd
        if (formatDelivered.compareAndSet(false, true)) {
            sink.onVideoFormat(csd, captureWidth, captureHeight)
        }
    }

    // ---------------------------------------------------------------------
    // 제어 & 정리
    // ---------------------------------------------------------------------

    /**
     * 다음 프레임을 즉시 키프레임으로 만들도록 인코더에 요청한다.
     * 수신자가 새로 합류했을 때 IDR 간격만큼 기다리지 않게 해준다.
     */
    fun requestKeyFrame() {
        if (!running.get()) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val params = android.os.Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0)
            }
            encoder?.setParameters(params)
        } catch (e: Exception) {
            Log.w(TAG, "키프레임 요청 실패: ${e.message}")
        }
    }

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            Log.d(TAG, "시스템에서 화면 공유가 중단되었습니다")
            stopInternal("projection_stopped")
        }
    }

    /** 캡처를 중단하고 모든 리소스를 해제한다. 여러 번 호출해도 안전하다. */
    fun stop() = stopInternal(null)

    private fun cleanupAfterFailure(reason: String) {
        stopInternal(reason)
    }

    private fun stopInternal(reason: String?) {
        val wasRunning = running.getAndSet(false)

        // 해제 순서가 중요하다. 픽셀 공급원(VirtualDisplay)을 먼저 끊어야
        // 이미 해제된 Surface 로 프레임이 들어가는 것을 막을 수 있다.
        runCatching { virtualDisplay?.release() }
            .onFailure { Log.w(TAG, "VirtualDisplay 해제 실패: ${it.message}") }
        virtualDisplay = null

        runCatching {
            encoder?.let {
                it.stop()
                it.release()
            }
        }.onFailure { Log.w(TAG, "인코더 해제 실패: ${it.message}") }
        encoder = null

        runCatching { inputSurface?.release() }
            .onFailure { Log.w(TAG, "Surface 해제 실패: ${it.message}") }
        inputSurface = null

        runCatching {
            mediaProjection?.let {
                it.unregisterCallback(projectionCallback)
                it.stop()
            }
        }.onFailure { Log.w(TAG, "MediaProjection 해제 실패: ${it.message}") }
        mediaProjection = null

        if (serviceBound) {
            runCatching { appContext.unbindService(serviceConnection) }
                .onFailure { Log.w(TAG, "서비스 언바인딩 실패: ${it.message}") }
            serviceBound = false
        }
        runCatching { appContext.stopService(ScreenCaptureService.intent(appContext)) }

        // 코덱 콜백이 이 스레드에서 돌기 때문에 코덱을 해제한 뒤에 종료해야 한다.
        runCatching { encoderThread?.quitSafely() }
        encoderThread = null
        encoderHandler = null

        pendingResultData = null
        pendingResultCode = Activity.RESULT_CANCELED
        formatDelivered.set(false)
        codecSpecificData = null

        if (wasRunning || reason != null) {
            sink.onVideoEnded(reason)
        }
        Log.d(TAG, "화면 캡처 정리 완료 (reason=$reason)")
    }

    companion object {
        private const val TAG = "ScreenCaptureManager"
        private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val VIRTUAL_DISPLAY_NAME = "StudyMeetScreen"
    }
}
