package com.wjthinkbig.studymeet.spike

import android.Manifest
import android.app.PictureInPictureParams
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent as AndroidIntent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Bundle
import android.util.Rational
import android.view.View
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.webrtc.EglBase
import org.webrtc.SurfaceViewRenderer

class SpikeActivity : AppCompatActivity() {

    companion object {
        /** 로컬 카메라 프레임 카운터. 계측 테스트가 이 값을 읽는다. */
        val localFrames = FrameCounter("local")
        /** 원격 참가자 프레임 카운터. */
        val remoteFrames = FrameCounter("remote")
    }

    private lateinit var engine: WebRtcEngine
    private val eglBase: EglBase = EglBase.create()

    private lateinit var remoteRenderer: SurfaceViewRenderer
    private lateinit var localRenderer: SurfaceViewRenderer
    private lateinit var statusText: TextView

    /** 카메라 토글을 직렬화한다. 순서가 뒤집히면 화면이 꺼진 채 카메라가 켜질 수 있다. */
    private val cameraMutex = Mutex()

    @Volatile
    private var desiredCameraEnabled = true

    /** PIP는 카메라가 살아난 뒤에만 의미가 있다. 권한 다이얼로그가 뜰 때도 onUserLeaveHint가 불린다. */
    private var isStarted = false

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: AndroidIntent?) {
            when (intent?.action) {
                AndroidIntent.ACTION_SCREEN_OFF -> setCameraEnabled(false)
                AndroidIntent.ACTION_SCREEN_ON -> setCameraEnabled(true)
            }
        }
    }

    private fun setCameraEnabled(enabled: Boolean) {
        desiredCameraEnabled = enabled
        lifecycleScope.launch {
            cameraMutex.withLock {
                engine.setCameraEnabled(desiredCameraEnabled)
            }
        }
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            if (granted.values.all { it }) {
                startCamera()
            } else {
                statusText.text = "권한 거부됨"
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_spike)

        remoteRenderer = findViewById(R.id.remoteRenderer)
        localRenderer = findViewById(R.id.localRenderer)
        statusText = findViewById(R.id.statusText)

        engine = WebRtcEngine(applicationContext, eglBase)
        remoteRenderer.init(eglBase.eglBaseContext, null)
        localRenderer.init(eglBase.eglBaseContext, null)

        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS,
            )
        )

        registerReceiver(
            screenReceiver,
            IntentFilter().apply {
                addAction(AndroidIntent.ACTION_SCREEN_OFF)
                addAction(AndroidIntent.ACTION_SCREEN_ON)
            },
        )
    }

    private fun startCamera() {
        localFrames.reset()
        remoteFrames.reset()

        ClassForegroundService.start(this)

        val ok = engine.startLocalCamera(sink = localFrames, preview = localRenderer)
        if (!ok) {
            ClassForegroundService.stop(this)
            statusText.text = "카메라 시작 실패"
            return
        }
        isStarted = true
        statusText.text = "카메라 동작 중"
    }

    /** PIP 진입. 성공하면 true. */
    fun enterPipNow(): Boolean {
        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .build()
        return enterPictureInPictureMode(params)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (isStarted) enterPipNow()
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // PIP에서는 선생님 영상만 남긴다. 나머지는 숨긴다.
        val hidden = if (isInPictureInPictureMode) View.GONE else View.VISIBLE
        localRenderer.visibility = hidden
        statusText.visibility = hidden
    }

    override fun onDestroy() {
        unregisterReceiver(screenReceiver)
        engine.release()
        eglBase.release()
        ClassForegroundService.stop(this)
        super.onDestroy()
    }
}
