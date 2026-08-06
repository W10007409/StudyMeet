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
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.launch

class SpikeActivity : AppCompatActivity() {

    companion object {
        /** 로컬 카메라 프레임 카운터. 계측 테스트가 이 값을 읽는다. */
        val localFrames = FrameCounter("local")
        /** 원격 참가자 프레임 카운터. */
        val remoteFrames = FrameCounter("remote")
    }

    private lateinit var room: Room
    private lateinit var remoteRenderer: SurfaceViewRenderer
    private lateinit var localRenderer: SurfaceViewRenderer
    private lateinit var statusText: TextView

    /** PIP는 접속이 성립한 뒤에만 의미가 있다. 권한 다이얼로그가 뜰 때도 onUserLeaveHint가 불린다. */
    private var isConnected = false

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: AndroidIntent?) {
            when (intent?.action) {
                AndroidIntent.ACTION_SCREEN_OFF -> setCameraEnabled(false)
                AndroidIntent.ACTION_SCREEN_ON -> setCameraEnabled(true)
            }
        }
    }

    private fun setCameraEnabled(enabled: Boolean) {
        lifecycleScope.launch {
            room.localParticipant.setCameraEnabled(enabled)
        }
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            if (granted.values.all { it }) {
                connect()
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

        room = LiveKit.create(
            appContext = applicationContext,
            options = RoomOptions(
                adaptiveStream = false,
                dynacast = false,
                videoTrackCaptureDefaults = LocalVideoTrackOptions(
                    position = CameraPosition.FRONT,
                    captureParams = VideoCaptureParameter(
                        width = 640,
                        height = 360,
                        maxFps = 24,
                    ),
                ),
            ),
        )
        room.initVideoRenderer(remoteRenderer)
        room.initVideoRenderer(localRenderer)

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

    private fun connect() {
        if (BuildConfig.LIVEKIT_URL.isBlank() || BuildConfig.LIVEKIT_TOKEN.isBlank()) {
            statusText.text = "local.properties에 livekit.url / livekit.token.android 필요"
            return
        }

        localFrames.reset()
        remoteFrames.reset()

        lifecycleScope.launch {
            launch { observeEvents() }

            try {
                statusText.text = "접속 중…"
                ClassForegroundService.start(this@SpikeActivity)
                room.connect(BuildConfig.LIVEKIT_URL, BuildConfig.LIVEKIT_TOKEN)

                room.localParticipant.setMicrophoneEnabled(true)
                room.localParticipant.setCameraEnabled(true)

                val local = room.localParticipant.getTrackPublication(
                    io.livekit.android.room.track.Track.Source.CAMERA
                )?.track as? LocalVideoTrack

                local?.let {
                    it.addRenderer(localRenderer)
                    it.addRenderer(localFrames)
                }
                statusText.text = "접속됨"
                isConnected = true
            } catch (e: Exception) {
                ClassForegroundService.stop(this@SpikeActivity)
                isConnected = false
                statusText.text = "접속 실패: ${e.message}"
            }
        }
    }

    private suspend fun observeEvents() {
        room.events.collect { event ->
            when (event) {
                is RoomEvent.TrackSubscribed -> {
                    (event.track as? VideoTrack)?.let {
                        it.addRenderer(remoteRenderer)
                        it.addRenderer(remoteFrames)
                    }
                }
                is RoomEvent.Disconnected -> {
                    isConnected = false
                    statusText.text = "연결 끊김"
                }
                else -> Unit
            }
        }
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
        if (isConnected) enterPipNow()
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
        room.disconnect()
        ClassForegroundService.stop(this)
        super.onDestroy()
    }
}
