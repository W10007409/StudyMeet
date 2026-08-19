package com.studymeet.child.signaling

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

interface SignalingListener {
    fun onReady()
    fun onError(error: String)
    fun onMessage(data: String)
}

class SignalingClient(
    private val serverUrl: String,
    private val listener: SignalingListener
) : WebSocketListener() {

    private var webSocket: WebSocket? = null
    private val gson = Gson()
    private val TAG = "SignalingClient"

    @Volatile
    private var connected = false

    fun connect(roomCode: String) {
        try {
            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build()

            val request = Request.Builder()
                .url("$serverUrl/ws?room=${java.net.URLEncoder.encode(roomCode, "UTF-8")}")
                .build()

            webSocket = client.newWebSocket(request, this)
            Log.d(TAG, "Connecting to signaling server: $serverUrl/lesson/$roomCode")
        } catch (e: Exception) {
            Log.e(TAG, "Connection error: ${e.message}")
            listener.onError(e.message ?: "Unknown error")
        }
    }

    override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
        connected = true
        Log.d(TAG, "✅ Connected to signaling server")
        listener.onReady()
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        try {
            val json = gson.fromJson(text, JsonObject::class.java)
            Log.d(TAG, "Message from server: ${json.get("type")?.asString}")
            listener.onMessage(text)
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing message: ${e.message}")
        }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
        connected = false
        Log.e(TAG, "❌ WebSocket failure: ${t.message}")
        listener.onError(t.message ?: "WebSocket error")
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        connected = false
        Log.d(TAG, "WebSocket closed: $reason")
    }

    fun sendMessage(type: String, data: Map<String, String> = emptyMap()) {
        try {
            val json = JsonObject()
            json.addProperty("type", type)
            data.forEach { (key, value) ->
                json.addProperty(key, value)
            }
            webSocket?.send(json.toString())
            Log.d(TAG, "Sent message type: $type")
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message: ${e.message}")
        }
    }

    /** 소켓이 열려 있는지. 프레임 전송 전에 확인해 조용한 유실을 막는다. */
    fun isConnected(): Boolean = connected && webSocket != null

    /**
     * 아직 전송되지 못하고 OkHttp 내부 큐에 쌓인 바이트 수.
     *
     * 30fps 영상처럼 소켓 처리량을 넘길 수 있는 스트림에서 백프레셔 판단에 쓴다.
     * 이 값을 무시하면 큐가 무한정 자라 지연이 누적되고 결국 메모리를 잡아먹는다.
     */
    fun queuedBytes(): Long = webSocket?.queueSize() ?: 0L

    /**
     * 미리 만들어둔 JSON 객체를 그대로 보낸다.
     *
     * [sendMessage] 와 달리 값이 String 으로 한정되지 않고 호출마다 로그를 남기지 않는다.
     * 초당 수십 개가 나가는 영상 프레임에는 이쪽을 써야 한다.
     *
     * @return 전송 큐에 실렸으면 true.
     */
    fun sendJson(json: JsonObject): Boolean {
        val socket = webSocket ?: return false
        return try {
            socket.send(json.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Error sending JSON: ${e.message}")
            false
        }
    }

    fun disconnect() {
        try {
            connected = false
            webSocket?.close(1000, "Client disconnecting")
            webSocket = null
            Log.d(TAG, "Disconnected from signaling server")
        } catch (e: Exception) {
            Log.e(TAG, "Error disconnecting: ${e.message}")
        }
    }
}
