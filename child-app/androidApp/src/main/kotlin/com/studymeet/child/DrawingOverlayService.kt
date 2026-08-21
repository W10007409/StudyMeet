package com.studymeet.child

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.*
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.View
import android.view.WindowManager

class DrawingOverlayService : Service() {

    companion object {
        private const val TAG = "DrawingOverlay"
        private const val CHANNEL_ID = "drawing_overlay_channel"
        private const val NOTIFICATION_ID = 2002

        @Volatile
        private var instance: DrawingOverlayService? = null

        fun addStroke(points: List<Pair<Float, Float>>, color: Int, strokeWidth: Float) {
            instance?.drawStroke(points, color, strokeWidth)
        }

        fun clear() {
            instance?.clearAll()
        }

        fun isRunning(): Boolean = instance != null
    }

    private lateinit var windowManager: WindowManager
    private var drawView: DrawView? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        createOverlay()
        Log.d(TAG, "Drawing overlay service started")
    }

    override fun onDestroy() {
        instance = null
        removeOverlay()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "판서 오버레이", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("판서 모드")
            .setContentText("선생님이 화면에 그리고 있습니다")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .build()
    }

    private fun createOverlay() {
        drawView = DrawView(this)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            // Not focusable + not touchable = passes all touches through
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        windowManager.addView(drawView, params)
    }

    private fun removeOverlay() {
        drawView?.let {
            try { windowManager.removeView(it) } catch (_: Exception) {}
        }
        drawView = null
    }

    private fun drawStroke(points: List<Pair<Float, Float>>, color: Int, strokeWidth: Float) {
        drawView?.post {
            drawView?.addStroke(points, color, strokeWidth)
        }
    }

    private fun clearAll() {
        drawView?.post {
            drawView?.clearStrokes()
        }
    }

    /**
     * Custom view that draws strokes on a transparent background.
     * Touch events pass through (FLAG_NOT_TOUCHABLE on the window).
     */
    private class DrawView(context: android.content.Context) : View(context) {

        data class Stroke(val path: Path, val paint: Paint)

        private val strokes = mutableListOf<Stroke>()

        init {
            setBackgroundColor(Color.TRANSPARENT)
        }

        fun addStroke(points: List<Pair<Float, Float>>, color: Int, strokeWidth: Float) {
            if (points.size < 2) return

            val screenWidth = width.toFloat()
            val screenHeight = height.toFloat()

            val path = Path()
            val first = points[0]
            path.moveTo(first.first * screenWidth, first.second * screenHeight)

            for (i in 1 until points.size) {
                val p = points[i]
                path.lineTo(p.first * screenWidth, p.second * screenHeight)
            }

            val paint = Paint().apply {
                this.color = color
                this.strokeWidth = strokeWidth * resources.displayMetrics.density
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                isAntiAlias = true
            }

            strokes.add(Stroke(path, paint))
            invalidate()
        }

        fun clearStrokes() {
            strokes.clear()
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            for (stroke in strokes) {
                canvas.drawPath(stroke.path, stroke.paint)
            }
        }
    }
}
