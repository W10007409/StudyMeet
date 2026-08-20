package com.studymeet.child

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.core.app.NotificationCompat

/**
 * 선생님 카메라를 시스템 오버레이(TYPE_APPLICATION_OVERLAY)로 표시하는 서비스.
 *
 * 화면 공유 중에도 다른 앱 위에 떠 있어야 하므로 액티비티가 아닌
 * WindowManager 오버레이를 사용한다. 드래그로 위치를 옮길 수 있고,
 * "통화종료" 버튼을 누르면 MainActivity 에 END_CALL 브로드캐스트를 보낸다.
 */
class TeacherOverlayService : Service() {

    companion object {
        private const val TAG = "TeacherOverlay"
        private const val CHANNEL_ID = "teacher_overlay_channel"
        private const val NOTIFICATION_ID = 2001

        const val ACTION_END_CALL = "com.studymeet.child.END_CALL"

        /**
         * 오버레이에 표시할 비트맵을 전달한다.
         * 서비스가 살아 있을 때만 쓴다. 바인딩 없이 static 참조로 간단히 넘긴다.
         */
        @Volatile
        private var instance: TeacherOverlayService? = null

        fun updateFrame(bitmap: Bitmap) {
            instance?.showFrame(bitmap)
        }
    }

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private var teacherImageView: ImageView? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        createOverlay()
        Log.d(TAG, "오버레이 서비스 시작")
    }

    override fun onDestroy() {
        instance = null
        removeOverlay()
        Log.d(TAG, "오버레이 서비스 종료")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ─────────────────────────────────────────────
    // 알림 채널 / 포그라운드 알림
    // ─────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "선생님 카메라 오버레이",
                NotificationManager.IMPORTANCE_LOW
            )
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("수업 중")
            .setContentText("선생님 카메라가 표시되고 있습니다")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
    }

    // ─────────────────────────────────────────────
    // 오버레이 생성 / 제거
    // ─────────────────────────────────────────────

    private fun createOverlay() {
        val density = resources.displayMetrics.density

        // 컨테이너: 세로 LinearLayout (이미지 + 버튼)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xCC000000.toInt())
            setPadding(
                (4 * density).toInt(),
                (4 * density).toInt(),
                (4 * density).toInt(),
                (4 * density).toInt()
            )
        }

        // 선생님 카메라 ImageView (160x120dp)
        val imgW = (160 * density).toInt()
        val imgH = (120 * density).toInt()
        teacherImageView = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(0xFF222222.toInt())
            layoutParams = LinearLayout.LayoutParams(imgW, imgH)
        }
        container.addView(teacherImageView)

        // 통화종료 버튼
        val endCallBtn = Button(this).apply {
            text = "통화종료"
            textSize = 12f
            setBackgroundColor(0xFFFF4444.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = (4 * density).toInt()
            }
            setOnClickListener {
                sendBroadcast(Intent(ACTION_END_CALL).setPackage(packageName))
            }
        }
        container.addView(endCallBtn)

        // WindowManager 레이아웃 파라미터
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (16 * density).toInt()
            y = (100 * density).toInt()
        }

        // 드래그 처리
        setupDrag(container, params)

        windowManager.addView(container, params)
        overlayView = container
    }

    private fun setupDrag(view: View, params: WindowManager.LayoutParams) {
        var startX = 0
        var startY = 0
        var startTouchX = 0f
        var startTouchY = 0f

        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x
                    startY = params.y
                    startTouchX = event.rawX
                    startTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = startX + (event.rawX - startTouchX).toInt()
                    params.y = startY + (event.rawY - startTouchY).toInt()
                    windowManager.updateViewLayout(overlayView, params)
                    true
                }
                else -> false
            }
        }
    }

    private fun removeOverlay() {
        overlayView?.let {
            try {
                windowManager.removeView(it)
            } catch (e: Exception) {
                Log.w(TAG, "오버레이 제거 실패: ${e.message}")
            }
        }
        overlayView = null
        teacherImageView = null
    }

    // ─────────────────────────────────────────────
    // 프레임 수신
    // ─────────────────────────────────────────────

    private fun showFrame(bitmap: Bitmap) {
        teacherImageView?.post {
            teacherImageView?.setImageBitmap(bitmap)
        }
    }
}
