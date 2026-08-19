package com.studymeet.child

import android.Manifest
import android.app.AlertDialog
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.Rational
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.studymeet.child.input.RemoteInputHandler
import com.studymeet.child.signaling.SignalingClient
import com.studymeet.child.signaling.SignalingListener
import com.studymeet.child.video.CameraFrameEncoder
import com.studymeet.child.video.FrameEncodedListener
import com.studymeet.child.video.RemoteVideoView
import com.studymeet.child.video.ScreenCaptureManager
import com.studymeet.child.video.SignalingVideoTransport
import com.studymeet.child.video.WebRTCVideoSender
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity(), SignalingListener, FrameEncodedListener {

    private var isPiPMode = false
    private var currentRoomCode: String? = null
    private var isInCall = false
    private var isCameraEnabled = true
    private var isActivityResumed = false
    private val TAG = "MainActivity"

    private lateinit var cameraExecutor: ExecutorService
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: androidx.camera.core.Camera? = null
    private var signalingClient: SignalingClient? = null
    private var remoteVideoView: RemoteVideoView? = null
    private var frameEncoder: CameraFrameEncoder? = null

    // --- 화면 공유 ---
    private var screenCaptureManager: ScreenCaptureManager? = null
    private var videoSender: WebRTCVideoSender? = null
    private var isScreenSharing = false

    // --- 원격 터치 입력 ---
    private var remoteInput: RemoteInputHandler? = null

    /**
     * 시스템 화면 캡처 동의 다이얼로그의 결과 수신구.
     *
     * onCreate 이전에 등록되어야 하므로 프로퍼티 초기화 시점에 만든다.
     * onStart 이후에 registerForActivityResult 를 부르면 IllegalStateException 이 난다.
     */
    private val screenCaptureLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            screenCaptureManager?.onPermissionResult(result.resultCode, result.data)
        }

    private val signalingServerUrl = "ws://192.168.219.123:3000"
    private val testRoomCode = "room-test-001"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        Log.d(TAG, "App started")

        cameraExecutor = Executors.newSingleThreadExecutor()

        setupRoomCodeInput()
        setupPiPListener()
        setupFirebase()
        setupRemoteInput()
        requestCameraPermission()

        checkIntentData(intent)
    }

    private fun setupFirebase() {
        Log.d(TAG, "Firebase 초기화 시작...")

        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d(TAG, "✅ FCM Token 획득 성공: $token")
            } else {
                Log.e(TAG, "❌ FCM Token 획득 실패", task.exception)
            }
        }.addOnFailureListener { exception ->
            Log.e(TAG, "❌ FCM Token 실패 리스너", exception)
        }
    }

    private fun requestCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA)
        } else {
            startCamera()
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener(Runnable {
            try {
                cameraProvider = cameraProviderFuture.get()
                bindCameraPreview()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get camera provider: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCameraPreview() {
        val preview = Preview.Builder().build()
        val previewView = findViewById<PreviewView>(R.id.local_preview)

        preview.setSurfaceProvider(previewView.surfaceProvider)

        // ImageAnalysis for frame capture and encoding
        frameEncoder = CameraFrameEncoder(this)
        val imageAnalysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(cameraExecutor) { image ->
                    frameEncoder?.encodeFrame(image)
                }
            }

        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
            .build()

        try {
            cameraProvider?.unbindAll()
            camera = cameraProvider?.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)
            Log.d(TAG, "✅ Camera bound successfully with frame analysis")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Camera binding failed: ${e.message}")
        }
    }

    private fun checkIntentData(intent: Intent?) {
        val type = intent?.getStringExtra("type")
        val roomCode = intent?.getStringExtra("roomCode")
        val teacherName = intent?.getStringExtra("teacherName") ?: "선생님"

        if (type == "lesson_request" && roomCode != null) {
            showLessonRequestDialog(roomCode, teacherName)
        }
    }

    private fun showLessonRequestDialog(roomCode: String, teacherName: String) {
        AlertDialog.Builder(this)
            .setTitle("수업 요청")
            .setMessage("$teacherName 선생님이 수업을 요청했습니다")
            .setPositiveButton("입장하기") { _, _ ->
                joinRoomFromPush(roomCode)
            }
            .setNegativeButton("거절", null)
            .show()
    }

    private fun joinRoomFromPush(roomCode: String) {
        currentRoomCode = roomCode
        joinRoom(roomCode)
        findViewById<LinearLayout>(R.id.entry_ui).visibility = View.GONE
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        checkIntentData(intent)
    }

    private fun setupRoomCodeInput() {
        val roomCodeInput = findViewById<EditText>(R.id.room_code_input)
        val joinButton = findViewById<Button>(R.id.join_room_button)

        // 테스트 모드: 기본값으로 테스트 방 코드 설정
        roomCodeInput.setText(testRoomCode)

        joinButton.setOnClickListener {
            val roomCode = roomCodeInput.text.toString().trim()
            if (roomCode.isNotEmpty()) {
                currentRoomCode = roomCode
                joinRoom(roomCode)
                findViewById<LinearLayout>(R.id.entry_ui).visibility = View.GONE
            } else {
                Log.w(TAG, "방 코드를 입력하세요")
            }
        }
    }

    private fun joinRoom(roomCode: String) {
        Log.d(TAG, "방 입장: $roomCode")
        isInCall = true

        findViewById<PreviewView>(R.id.local_preview).visibility = View.VISIBLE
        findViewById<LinearLayout>(R.id.call_controls).visibility = View.VISIBLE

        setupCallControls()

        // Connect to signaling server
        signalingClient = SignalingClient(signalingServerUrl, this)
        signalingClient?.connect(roomCode)

        startScreenSharing()
        updateRemoteInputEnabled()

        Log.d(TAG, "✅ 방 입장 - 카메라 표시 및 신호 서버 연결 시작")
    }

    // =====================================================================
    // 원격 터치 입력
    // =====================================================================

    /**
     * 선생님이 화면을 눌렀을 때 그 터치를 이 앱의 View 에 그대로 넣어주는 경로를 만든다.
     *
     * 접근성 서비스나 특수 권한은 쓰지 않는다. 자기 창에 이벤트를 넣는 것뿐이라
     * `dispatchTouchEvent` 로 충분하다. 대신 이 앱 밖(홈, 다른 앱)은 조작되지 않는다.
     */
    private fun setupRemoteInput() {
        val handler = RemoteInputHandler(this)

        // 좌표는 "영상 프레임" 기준으로 오므로 실제 프레임 크기를 알아야 한다.
        // 화면 크기를 그냥 곱하면 인코더 16배수 정렬만큼 어긋난다.
        handler.frameSizeProvider = { screenCaptureManager?.frameSize }

        handler.listener = object : RemoteInputHandler.Listener {
            override fun onDropped(reason: String) {
                Log.v(TAG, "원격 입력 무시: $reason")
            }
        }

        remoteInput = handler
        updateRemoteInputEnabled()
    }

    /**
     * 원격 입력을 받아도 되는 상태인지 다시 판단한다.
     *
     * 통화 중이 아닐 때, 화면이 가려졌을 때, PiP 축소 상태일 때는 받지 않는다.
     * PiP 에서는 창 크기가 화면과 전혀 달라 좌표가 의미를 잃고,
     * 정지 상태의 액티비티에 터치를 넣어봐야 사용자에게 보이지도 않는다.
     */
    private fun updateRemoteInputEnabled() {
        val allowed = isInCall && isActivityResumed && !isPiPMode
        val handler = remoteInput ?: return
        if (handler.isEnabled == allowed) return
        handler.isEnabled = allowed
        Log.d(TAG, "원격 터치 ${if (allowed) "허용" else "차단"} (${handler.stats()})")
    }

    // =====================================================================
    // 화면 공유
    // =====================================================================

    /**
     * 화면 공유를 시작한다.
     *
     * 실제 캡처는 사용자가 시스템 동의 다이얼로그를 수락한 뒤에야 시작되므로,
     * 이 메서드는 다이얼로그를 띄우는 것까지만 책임진다.
     */
    private fun startScreenSharing() {
        if (isScreenSharing) {
            Log.d(TAG, "이미 화면 공유 중입니다")
            return
        }

        // Android 13+ 에서는 알림 권한이 없으면 캡처 중 알림이 보이지 않는다.
        // 서비스 자체는 동작하므로 결과를 기다리지 않고 진행한다.
        ensureNotificationPermission()

        val sender = WebRTCVideoSender(
            SignalingVideoTransport { signalingClient }
        ).also { videoSender = it }

        sender.onEnded = { reason ->
            runOnUiThread { onScreenSharingEnded(reason) }
        }

        val manager = ScreenCaptureManager(
            activity = this,
            sink = sender,
            config = ScreenCaptureManager.Config(
                frameRate = 30,
                // 0 = 원본 해상도. 태블릿 원본 해상도 30fps 는 릴레이 대역폭을
                // 크게 잡아먹으므로, 네트워크가 좁으면 1280 정도로 조인다.
                maxWidth = 0,
                keyFrameIntervalSec = 1
            )
        ).also { screenCaptureManager = it }

        try {
            screenCaptureLauncher.launch(manager.createPermissionIntent())
            isScreenSharing = true
            Log.d(TAG, "화면 공유 동의 요청")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 화면 캡처 동의 요청 실패: ${e.message}", e)
            releaseScreenSharing()
        }
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_NOTIFICATIONS
            )
        }
    }

    /** 사용자 거부, 시스템 중단, 인코더 오류 등 모든 종료 경로가 여기로 모인다. */
    private fun onScreenSharingEnded(reason: String?) {
        Log.d(TAG, "화면 공유 종료: $reason")
        releaseScreenSharing()
        findViewById<Button>(R.id.toggle_screen_button)?.text = "화면 공유 시작"
    }

    private fun releaseScreenSharing() {
        isScreenSharing = false
        // stop() 은 sink.onVideoEnded 를 다시 부를 수 있다.
        // 콜백을 먼저 끊어야 재진입 루프가 생기지 않는다.
        videoSender?.onEnded = null
        screenCaptureManager?.stop()
        screenCaptureManager = null
        videoSender = null
    }

    private fun toggleScreenSharing(button: Button) {
        if (isScreenSharing) {
            releaseScreenSharing()
            button.text = "화면 공유 시작"
        } else {
            startScreenSharing()
            button.text = "화면 공유 중지"
        }
    }

    private fun setupCallControls() {
        val endCallBtn = findViewById<Button>(R.id.end_call_button)
        val toggleCameraBtn = findViewById<Button>(R.id.toggle_camera_button)
        val toggleScreenBtn = findViewById<Button>(R.id.toggle_screen_button)

        endCallBtn.setOnClickListener {
            endCall()
        }

        toggleCameraBtn.setOnClickListener {
            toggleCamera(toggleCameraBtn)
        }

        toggleScreenBtn.setOnClickListener {
            toggleScreenSharing(toggleScreenBtn)
        }
    }

    private fun toggleCamera(button: Button) {
        isCameraEnabled = !isCameraEnabled
        button.text = if (isCameraEnabled) "카메라 OFF" else "카메라 ON"
        Log.d(TAG, "카메라: ${if (isCameraEnabled) "ON" else "OFF"}")
    }

    private fun endCall() {
        isInCall = false
        isCameraEnabled = true

        // 선생님 손가락이 눌린 채로 통화가 끝나면 뷰가 눌린 상태로 굳는다. 먼저 떼어낸다.
        updateRemoteInputEnabled()

        releaseScreenSharing()

        signalingClient?.disconnect()
        signalingClient = null

        findViewById<PreviewView>(R.id.local_preview).visibility = View.GONE
        findViewById<LinearLayout>(R.id.call_controls).visibility = View.GONE
        findViewById<LinearLayout>(R.id.entry_ui).visibility = View.VISIBLE

        currentRoomCode = null
        Log.d(TAG, "통화 종료")
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQUEST_CAMERA -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    startCamera()
                }
            }
            REQUEST_NOTIFICATIONS -> {
                val granted = grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED
                // 거부되어도 캡처는 계속된다. 알림만 보이지 않는다.
                Log.d(TAG, "알림 권한: ${if (granted) "허용" else "거부"}")
            }
        }
    }

    // SignalingListener implementation
    override fun onReady() {
        Log.d(TAG, "✅ Signaling server ready")
        signalingClient?.sendMessage("ready", mapOf("roomCode" to (currentRoomCode ?: "")))

        // 상대가 방금 합류했다. 디코더는 SPS/PPS 와 키프레임이 있어야 화면을 그릴 수 있는데
        // 둘 다 이미 지나갔을 수 있으므로 다시 내보낸다.
        if (videoSender?.resendFormat() == true) {
            screenCaptureManager?.requestKeyFrame()
        }
    }

    override fun onError(error: String) {
        Log.e(TAG, "❌ Signaling error: $error")
        // 연결이 down 과 up 사이에서 끊기면 up 이 영원히 오지 않는다.
        remoteInput?.cancelAll("signaling_error")
    }

    override fun onMessage(data: String) {
        // 원격 터치가 가장 먼저다. move 는 초당 수십 개가 들어오므로 로그를 먼저 찍으면
        // 로그 자체가 지연 요인이 된다. 핸들러가 소비한 메시지는 여기서 끝낸다.
        if (remoteInput?.handleMessage(data) == true) return

        Log.d(TAG, "📨 Message from signaling server: ${data.take(200)}")
    }

    // FrameEncodedListener implementation
    override fun onFrameEncoded(base64Data: String) {
        if (isInCall && isCameraEnabled) {
            signalingClient?.sendMessage("camera_frame", mapOf("data" to base64Data))
        }
    }

    private fun setupPiPListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Log.d(TAG, "PiP support enabled")
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !isPiPMode && isInCall) {
            enterPiP()
        }
    }

    private fun enterPiP() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .build()
                enterPictureInPictureMode(params)
                isPiPMode = true
                Log.d(TAG, "✅ PiP mode entered")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to enter PiP: ${e.message}")
            }
        }
    }

    private fun exitPiP() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPiPMode) {
            isPiPMode = false
            Log.d(TAG, "✅ PiP mode exited")
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode)
        isPiPMode = isInPictureInPictureMode
        // PiP 창은 화면과 크기가 전혀 달라 원격 좌표를 그대로 쓸 수 없다.
        updateRemoteInputEnabled()
        Log.d(TAG, "PiP mode changed: $isInPictureInPictureMode")
    }

    override fun onResume() {
        super.onResume()
        isActivityResumed = true
        updateRemoteInputEnabled()
    }

    override fun onPause() {
        super.onPause()
        isActivityResumed = false
        // 화면이 가려지는 순간 눌려 있던 원격 포인터를 정리한다.
        updateRemoteInputEnabled()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                if (isPiPMode) {
                    exitPiP()
                    true
                } else if (isInCall) {
                    endCall()
                    true
                } else {
                    super.onKeyDown(keyCode, event)
                }
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // 화면 캡처를 먼저 정리한다. VirtualDisplay 와 포그라운드 서비스는
        // 액티비티가 사라져도 살아남기 때문에 여기서 놓치면 그대로 누수된다.
        releaseScreenSharing()
        remoteInput?.release()
        remoteInput = null
        signalingClient?.disconnect()
        cameraExecutor.shutdown()
    }

    companion object {
        private const val REQUEST_CAMERA = 101
        private const val REQUEST_NOTIFICATIONS = 102
    }
}
