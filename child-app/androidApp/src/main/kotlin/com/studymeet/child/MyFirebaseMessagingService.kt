package com.studymeet.child

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "메시지 수신")

        // 데이터 메시지 처리
        remoteMessage.data.let {
            if (it.isNotEmpty()) {
                Log.d(TAG, "데이터: $it")
                handleDataMessage(it)
            }
        }

        // 알림 메시지 처리
        remoteMessage.notification?.let {
            Log.d(TAG, "제목: ${it.title}, 본문: ${it.body}")
            showNotification(it.title, it.body, remoteMessage.data)
        }
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "새 FCM 토큰: $token")
        // TODO: Backend에 토큰 저장
        sendTokenToServer(token)
    }

    private fun handleDataMessage(data: Map<String, String>) {
        val messageType = data["type"] ?: return

        when (messageType) {
            "lesson_request" -> {
                val roomCode = data["roomCode"]
                val teacherName = data["teacherName"] ?: "선생님"
                Log.d(TAG, "수업 요청: $teacherName, 방코드: $roomCode")

                // MainActivity에 데이터 전달
                val intent = Intent(this, MainActivity::class.java).apply {
                    putExtra("type", "lesson_request")
                    putExtra("roomCode", roomCode)
                    putExtra("teacherName", teacherName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                startActivity(intent)
            }
        }
    }

    private fun showNotification(title: String?, body: String?, data: Map<String, String>) {
        val channelId = "lesson_request_channel"
        createNotificationChannel(channelId)

        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("type", data["type"])
            putExtra("roomCode", data["roomCode"])
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title ?: "수업 요청")
            .setContentText(body ?: "선생님이 수업을 요청했습니다")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(channelId: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "수업 요청"
            val descriptionText = "선생님의 수업 요청 알림"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(channelId, name, importance).apply {
                description = descriptionText
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun sendTokenToServer(token: String) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val client = OkHttpClient()
                val requestBody = FormBody.Builder()
                    .add("customerNumber", "TEST-CHILD-001")
                    .add("token", token)
                    .add("platform", "android")
                    .add("appVersion", "0.1.0")
                    .build()

                val request = Request.Builder()
                    .url("http://192.168.12.99:3000/devices")
                    .post(requestBody)
                    .build()

                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.d(TAG, "서버에 토큰 저장 성공: $token")
                } else {
                    Log.e(TAG, "서버에 토큰 저장 실패: ${response.code}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "토큰 전송 오류", e)
            }
        }
    }

    companion object {
        private const val TAG = "FCM"
        private const val NOTIFICATION_ID = 1001
    }
}
