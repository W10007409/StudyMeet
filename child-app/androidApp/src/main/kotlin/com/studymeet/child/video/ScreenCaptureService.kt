package com.studymeet.child.video

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * 화면 캡처가 살아있는 동안 앱을 포그라운드에 묶어두는 서비스.
 *
 * Android 10(Q)부터 [android.media.projection.MediaProjectionManager.getMediaProjection] 은
 * `mediaProjection` 타입 포그라운드 서비스가 **이미 실행 중일 때만** 호출할 수 있다.
 * Android 14(UPSIDE_DOWN_CAKE)부터는 이 규칙이 강제되어, 서비스를 먼저 띄우지 않으면
 * SecurityException 이 발생한다.
 *
 * 이 서비스는 캡처 파이프라인을 직접 소유하지 않는다. 오직 프로세스 우선순위와
 * 사용자에게 보이는 알림만 책임진다. 실제 인코딩은 [ScreenCaptureManager] 가 담당한다.
 */
class ScreenCaptureService : Service() {

    inner class LocalBinder : Binder() {
        val service: ScreenCaptureService get() = this@ScreenCaptureService
    }

    private val binder = LocalBinder()

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForeground 는 반드시 서비스 시작 직후(ANR 타임아웃 내)에 호출되어야 한다.
        try {
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            Log.d(TAG, "✅ 화면 공유 포그라운드 서비스 시작")
        } catch (e: Exception) {
            // Android 14+ 에서 백그라운드 시작 제한에 걸리면 여기로 떨어진다.
            Log.e(TAG, "❌ startForeground 실패: ${e.message}", e)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        Log.d(TAG, "화면 공유 포그라운드 서비스 종료")
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "화면 공유",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "수업 중 화면을 선생님에게 공유합니다"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("수업 화면 공유 중")
            .setContentText("선생님에게 화면이 전송되고 있습니다")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "ScreenCaptureService"
        private const val CHANNEL_ID = "screen_capture_channel"
        private const val NOTIFICATION_ID = 4801

        fun intent(context: Context): Intent = Intent(context, ScreenCaptureService::class.java)
    }
}
