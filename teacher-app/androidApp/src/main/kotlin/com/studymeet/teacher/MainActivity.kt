package com.studymeet.teacher

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private val TAG = "TeacherMain"
    private val API_BASE = "http://192.168.19.46:3000"
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val customerInput = findViewById<EditText>(R.id.customer_number_input)
        val roomInput = findViewById<EditText>(R.id.room_code_input)
        val pushBtn = findViewById<Button>(R.id.send_push_button)
        val joinBtn = findViewById<Button>(R.id.join_room_button)
        val statusText = findViewById<TextView>(R.id.status_text)

        // Default test values
        customerInput.setText("TEST-CHILD-001")
        roomInput.setText("room-test-001")

        pushBtn.setOnClickListener {
            val customer = customerInput.text.toString().trim()
            val room = roomInput.text.toString().trim()
            if (customer.isEmpty() || room.isEmpty()) {
                Toast.makeText(this, "고객번호와 수업 코드를 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            sendPush(customer, room, statusText)
        }

        joinBtn.setOnClickListener {
            val room = roomInput.text.toString().trim()
            if (room.isEmpty()) {
                Toast.makeText(this, "수업 코드를 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val intent = Intent(this, LessonActivity::class.java)
            intent.putExtra("roomCode", room)
            startActivity(intent)
        }
    }

    private fun sendPush(customerNumber: String, roomCode: String, statusText: TextView) {
        scope.launch {
            statusText.text = "수업 요청 전송 중..."
            try {
                val result = withContext(Dispatchers.IO) {
                    val client = OkHttpClient()
                    val json = JSONObject().apply {
                        put("customerNumber", customerNumber)
                        put("roomCode", roomCode)
                        put("teacherName", "선생님")
                    }
                    val body = json.toString().toRequestBody("application/json".toMediaType())
                    val request = Request.Builder()
                        .url("$API_BASE/api/push/lesson-request")
                        .post(body)
                        .build()
                    client.newCall(request).execute()
                }
                if (result.isSuccessful) {
                    statusText.text = "수업 요청 전송 완료"
                    Toast.makeText(this@MainActivity, "수업 요청을 보냈습니다", Toast.LENGTH_SHORT).show()
                } else {
                    statusText.text = "전송 실패: ${result.code}"
                }
            } catch (e: Exception) {
                statusText.text = "오류: ${e.message}"
                Log.e(TAG, "Push failed", e)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
