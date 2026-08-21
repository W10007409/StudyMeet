package com.studymeet.teacher

import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.studymeet.teacher.overlay.DrawingView
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LessonActivity : AppCompatActivity() {

    private val TAG = "TeacherLesson"
    private val SIGNALING_URL = "ws://192.168.19.46:3000"
    private val LIVEKIT_URL = "wss://helpmanager-cgkgdjae.livekit.cloud"
    private val TOKEN_API = "http://192.168.19.46:3000/api/livekit/token"

    private var room: Room? = null
    private var signalingWs: WebSocket? = null
    private var roomCode: String = ""
    private var touchEnabled = true
    private var drawingEnabled = false
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val gson = Gson()

    // Views
    private lateinit var studentRenderer: SurfaceViewRenderer
    private lateinit var teacherRenderer: SurfaceViewRenderer
    private lateinit var drawingView: DrawingView
    private lateinit var touchOverlay: View
    private lateinit var connectionStatus: TextView
    private lateinit var messagesContainer: LinearLayout
    private lateinit var messagesScroll: ScrollView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_lesson)

        roomCode = intent.getStringExtra("roomCode") ?: "room-test-001"

        initViews()
        setupControls()
        connectLiveKit()
        connectSignaling()
    }

    private fun initViews() {
        studentRenderer = findViewById(R.id.student_screen_renderer)
        teacherRenderer = findViewById(R.id.teacher_camera_renderer)
        drawingView = findViewById(R.id.drawing_overlay)
        touchOverlay = findViewById(R.id.touch_overlay)
        connectionStatus = findViewById(R.id.connection_status)
        messagesContainer = findViewById(R.id.messages_container)
        messagesScroll = findViewById(R.id.messages_scroll)

        findViewById<TextView>(R.id.student_name_text).text = "수업: $roomCode"

        // Init renderers
        studentRenderer.init(null, null)
        teacherRenderer.init(null, null)

        setupTouchOverlay()
    }

    private fun setupControls() {
        val endBtn = findViewById<Button>(R.id.end_lesson_button)
        val touchBtn = findViewById<Button>(R.id.touch_toggle_button)
        val drawBtn = findViewById<Button>(R.id.draw_toggle_button)
        val clearBtn = findViewById<Button>(R.id.clear_draw_button)
        val sendMsgBtn = findViewById<Button>(R.id.send_message_button)
        val msgInput = findViewById<EditText>(R.id.message_input)

        endBtn.setOnClickListener {
            sendWsMessage("end_call", emptyMap())
            finish()
        }

        touchBtn.setOnClickListener {
            touchEnabled = !touchEnabled
            drawingEnabled = false
            updateToolButtons(touchBtn, drawBtn)
        }

        drawBtn.setOnClickListener {
            drawingEnabled = !drawingEnabled
            touchEnabled = false
            drawingView.visibility = if (drawingEnabled) View.VISIBLE else View.GONE
            drawingView.setDrawingEnabled(drawingEnabled)
            updateToolButtons(touchBtn, drawBtn)
        }

        clearBtn.setOnClickListener {
            drawingView.clear()
            sendWsMessage("draw_clear", emptyMap())
        }

        sendMsgBtn.setOnClickListener {
            val text = msgInput.text.toString().trim()
            if (text.isNotEmpty()) {
                addMessage("선생님", text)
                sendWsMessage("pad_input", mapOf("text" to text, "from" to "teacher"))
                msgInput.setText("")
            }
        }

        msgInput.setOnEditorActionListener { _, _, _ ->
            sendMsgBtn.performClick()
            true
        }
    }

    private fun updateToolButtons(touchBtn: Button, drawBtn: Button) {
        touchBtn.setTextColor(if (touchEnabled) getColor(R.color.accent) else getColor(R.color.text_secondary))
        drawBtn.setTextColor(if (drawingEnabled) getColor(R.color.accent) else getColor(R.color.text_secondary))
    }

    private fun setupTouchOverlay() {
        touchOverlay.setOnTouchListener { _, event ->
            if (!touchEnabled) return@setOnTouchListener false

            val nx = event.x / touchOverlay.width.toFloat()
            val ny = event.y / touchOverlay.height.toFloat()

            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    sendWsMessage("touch_input", mapOf(
                        "x" to nx.toString(), "y" to ny.toString(),
                        "action" to "down", "pointerId" to "0", "pointerType" to "touch"
                    ))
                }
                MotionEvent.ACTION_MOVE -> {
                    sendWsMessage("touch_input", mapOf(
                        "x" to nx.toString(), "y" to ny.toString(),
                        "action" to "move", "pointerId" to "0", "pointerType" to "touch"
                    ))
                }
                MotionEvent.ACTION_UP -> {
                    sendWsMessage("touch_input", mapOf(
                        "x" to nx.toString(), "y" to ny.toString(),
                        "action" to "up", "pointerId" to "0", "pointerType" to "touch"
                    ))
                    sendWsMessage("touch_input", mapOf(
                        "x" to nx.toString(), "y" to ny.toString(),
                        "action" to "click", "pointerId" to "0", "pointerType" to "touch"
                    ))
                }
            }
            true
        }
    }

    // --- LiveKit ---

    private fun connectLiveKit() {
        scope.launch {
            try {
                val token = withContext(Dispatchers.IO) { fetchLiveKitToken() }
                if (token == null) {
                    connectionStatus.text = "토큰 발급 실패"
                    return@launch
                }

                val lkRoom = LiveKit.create(applicationContext)
                room = lkRoom

                lkRoom.initVideoRenderer(studentRenderer)
                lkRoom.initVideoRenderer(teacherRenderer)

                lkRoom.connect(LIVEKIT_URL, token)
                connectionStatus.text = "연결됨"

                lkRoom.localParticipant.setCameraEnabled(true)
                lkRoom.localParticipant.setMicrophoneEnabled(true)

                // 로컬 카메라 표시
                val localVideo = lkRoom.localParticipant.getTrackPublication(
                    io.livekit.android.room.track.Track.Source.CAMERA
                )?.track as? VideoTrack
                localVideo?.addRenderer(teacherRenderer)

                // 원격 트랙 감시 (폴링)
                launch {
                    while (true) {
                        delay(2000)
                        lkRoom.remoteParticipants.values.forEach { participant ->
                            participant.trackPublications.values.forEach { pub ->
                                val track = pub.track
                                if (track is VideoTrack && pub.source == io.livekit.android.room.track.Track.Source.SCREEN_SHARE) {
                                    runOnUiThread {
                                        track.addRenderer(studentRenderer)
                                        connectionStatus.text = "화면 공유 수신 중"
                                    }
                                }
                            }
                        }
                    }
                }

                Log.d(TAG, "LiveKit connected")
            } catch (e: Exception) {
                Log.e(TAG, "LiveKit error: ${e.message}", e)
                connectionStatus.text = "연결 오류"
            }
        }
    }

    private fun fetchLiveKitToken(): String? {
        return try {
            val client = OkHttpClient()
            val json = JSONObject().apply {
                put("room", roomCode)
                put("identity", "teacher-${System.currentTimeMillis()}")
                put("role", "teacher")
            }
            val body = json.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder().url(TOKEN_API).post(body).build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                JSONObject(response.body?.string() ?: "").optString("token", null)
            } else null
        } catch (e: Exception) {
            Log.e(TAG, "Token error: ${e.message}")
            null
        }
    }

    // --- WebSocket Signaling ---

    private fun connectSignaling() {
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        val request = Request.Builder()
            .url("$SIGNALING_URL/ws?room=$roomCode")
            .build()

        signalingWs = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = gson.fromJson(text, JsonObject::class.java)
                    val type = json.get("type")?.asString ?: return

                    when (type) {
                        "pad_input" -> {
                            val msgText = json.get("text")?.asString ?: return
                            val from = json.get("from")?.asString ?: "학생"
                            if (from != "teacher") {
                                runOnUiThread { addMessage("학생", msgText) }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "WS message error: ${e.message}")
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error: ${t.message}")
            }
        })
    }

    private fun sendWsMessage(type: String, data: Map<String, String>) {
        try {
            val json = JsonObject()
            json.addProperty("type", type)
            data.forEach { (k, v) -> json.addProperty(k, v) }
            signalingWs?.send(json.toString())
        } catch (e: Exception) {
            Log.e(TAG, "WS send error: ${e.message}")
        }
    }

    // --- Messages ---

    private fun addMessage(from: String, text: String) {
        val bubble = TextView(this).apply {
            this.text = "$from: $text"
            textSize = 13f
            setTextColor(resources.getColor(R.color.text_primary, null))
            setBackgroundColor(if (from == "선생님") 0xFF1A2634.toInt() else 0xFF0F1923.toInt())
            setPadding(16, 8, 16, 8)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.bottomMargin = 4
            layoutParams = params
        }
        messagesContainer.addView(bubble)
        messagesScroll.post { messagesScroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    // --- Lifecycle ---

    override fun onDestroy() {
        super.onDestroy()
        room?.disconnect()
        signalingWs?.close(1000, "leaving")
        studentRenderer.release()
        teacherRenderer.release()
        scope.cancel()
    }
}
