package com.wjthinkbig.studymeet.spike

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Task 4의 중계 서버에 붙는 최소 클라이언트.
 * 서버가 만들어 보내는 메시지는 ready와 peer-left 둘뿐이고, 나머지는 상대가 보낸 것이다.
 */
class SignalingClient(
    private val url: String,
    private val onReady: () -> Unit,
    private val onMessage: (JSONObject) -> Unit,
    private val onPeerLeft: () -> Unit,
) {
    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    fun connect() {
        socket = client.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "ready" -> onReady()
                        "peer-left" -> onPeerLeft()
                        else -> onMessage(json)
                    }
                }
            },
        )
    }

    fun send(json: String) {
        socket?.send(json)
    }

    fun close() {
        socket?.close(1000, null)
        socket = null
    }
}
