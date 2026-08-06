package com.wjthinkbig.studymeet.spike

import android.Manifest
import android.os.Bundle
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
            } catch (e: Exception) {
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
                is RoomEvent.Disconnected -> statusText.text = "연결 끊김"
                else -> Unit
            }
        }
    }

    override fun onDestroy() {
        room.disconnect()
        super.onDestroy()
    }
}
