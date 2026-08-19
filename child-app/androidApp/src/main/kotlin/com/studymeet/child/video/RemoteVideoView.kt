package com.studymeet.child.video

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.util.Log
import android.view.View
import java.util.concurrent.ConcurrentLinkedQueue

class RemoteVideoView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var currentBitmap: Bitmap? = null
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val frameQueue = ConcurrentLinkedQueue<Bitmap>()
    private val TAG = "RemoteVideoView"
    private var frameCount = 0

    init {
        setBackgroundColor(android.graphics.Color.BLACK)
    }

    fun displayFrame(bitmap: Bitmap) {
        try {
            frameQueue.offer(bitmap)
            if (frameQueue.size > 3) {
                // Drop old frames if queue is too large
                frameQueue.poll()
            }
            postInvalidate()
        } catch (e: Exception) {
            Log.e(TAG, "Error displaying frame: ${e.message}")
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // Get latest frame from queue
        var frame = frameQueue.poll()
        while (frameQueue.isNotEmpty()) {
            frame?.recycle()
            frame = frameQueue.poll()
        }

        if (frame != null) {
            currentBitmap?.recycle()
            currentBitmap = frame
            frameCount++

            if (frameCount % 30 == 0) {
                Log.d(TAG, "Displaying frame #$frameCount")
            }
        }

        currentBitmap?.let { bitmap ->
            val scale = minOf(
                width.toFloat() / bitmap.width,
                height.toFloat() / bitmap.height
            )

            val scaledWidth = (bitmap.width * scale).toInt()
            val scaledHeight = (bitmap.height * scale).toInt()
            val left = (width - scaledWidth) / 2
            val top = (height - scaledHeight) / 2

            canvas.drawBitmap(
                bitmap,
                null,
                android.graphics.Rect(left, top, left + scaledWidth, top + scaledHeight),
                paint
            )
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        currentBitmap?.recycle()
        currentBitmap = null
        frameQueue.forEach { it.recycle() }
        frameQueue.clear()
    }
}
