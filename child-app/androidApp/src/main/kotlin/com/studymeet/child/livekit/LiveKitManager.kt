package com.studymeet.child.livekit

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class LiveKitManager(private val context: Context) {

    private val TAG = "LiveKitManager"
    private val LIVEKIT_URL = "wss://helpmanager-cgkgdjae.livekit.cloud"
    private val TOKEN_API = "http://192.168.19.46:3000/api/livekit/token"

    private var room: Room? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    fun connect(roomName: String, identity: String, onConnected: () -> Unit) {
        scope.launch {
            try {
                // 1. Get token from backend
                val token = withContext(Dispatchers.IO) { fetchToken(roomName, identity) }
                if (token == null) {
                    Log.e(TAG, "Failed to get LiveKit token")
                    return@launch
                }

                // 2. Create and connect room
                val lkRoom = LiveKit.create(context)
                room = lkRoom

                lkRoom.connect(LIVEKIT_URL, token)
                Log.d(TAG, "Connected to LiveKit room: $roomName")

                onConnected()
            } catch (e: Exception) {
                Log.e(TAG, "LiveKit connection failed: ${e.message}", e)
            }
        }
    }

    fun enableCamera() {
        scope.launch {
            try {
                room?.localParticipant?.setCameraEnabled(true)
                Log.d(TAG, "Camera enabled")
            } catch (e: Exception) {
                Log.e(TAG, "Camera enable failed: ${e.message}")
            }
        }
    }

    fun enableMicrophone() {
        scope.launch {
            try {
                room?.localParticipant?.setMicrophoneEnabled(true)
                Log.d(TAG, "Microphone enabled")
            } catch (e: Exception) {
                Log.e(TAG, "Microphone enable failed: ${e.message}")
            }
        }
    }

    fun startScreenShare(mediaProjectionData: Intent?) {
        if (mediaProjectionData == null) return
        scope.launch {
            try {
                // Create notification channel required by LiveKit's ScreenCaptureService foreground notification
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val channel = android.app.NotificationChannel(
                        "livekit_screen_capture",
                        "화면 공유",
                        android.app.NotificationManager.IMPORTANCE_LOW
                    )
                    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                    nm.createNotificationChannel(channel)
                }
                room?.localParticipant?.setScreenShareEnabled(true, mediaProjectionData)
                Log.d(TAG, "Screen share started")
            } catch (e: Exception) {
                Log.e(TAG, "Screen share failed: ${e.message}", e)
            }
        }
    }

    fun disconnect() {
        room?.disconnect()
        room = null
        scope.cancel()
        Log.d(TAG, "Disconnected from LiveKit")
    }

    private fun fetchToken(roomName: String, identity: String): String? {
        return try {
            val client = OkHttpClient()
            val json = JSONObject().apply {
                put("room", roomName)
                put("identity", identity)
                put("role", "child")
            }
            val body = json.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(TOKEN_API)
                .post(body)
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val responseBody = response.body?.string()
                JSONObject(responseBody ?: "").optString("token", null)
            } else {
                Log.e(TAG, "Token request failed: ${response.code}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Token fetch error: ${e.message}")
            null
        }
    }
}
