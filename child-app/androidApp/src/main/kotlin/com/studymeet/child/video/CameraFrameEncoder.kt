package com.studymeet.child.video

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.YuvImage
import android.util.Base64
import android.util.Log
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicLong

interface FrameEncodedListener {
    fun onFrameEncoded(base64Data: String)
}

class CameraFrameEncoder(private val listener: FrameEncodedListener) {
    private val TAG = "CameraFrameEncoder"
    private var lastFrameTime = AtomicLong(0)
    private val frameInterval = 500 // milliseconds (2 FPS for demo)
    private var frameCount = 0

    fun encodeFrame(image: ImageProxy) {
        val currentTime = System.currentTimeMillis()
        val lastTime = lastFrameTime.get()

        if (currentTime - lastTime < frameInterval) {
            image.close()
            return
        }

        lastFrameTime.set(currentTime)
        frameCount++

        try {
            if (image.format == ImageFormat.YUV_420_888) {
                val yuvImage = YuvImage(
                    nv21FromYuv420(image),
                    ImageFormat.NV21,
                    image.width,
                    image.height,
                    null
                )

                val outputStream = ByteArrayOutputStream()
                yuvImage.compressToJpeg(android.graphics.Rect(0, 0, image.width, image.height), 50, outputStream)
                val jpegData = outputStream.toByteArray()

                val base64 = Base64.encodeToString(jpegData, Base64.DEFAULT)

                if (frameCount % 10 == 0) {
                    Log.d(TAG, "Frame #$frameCount encoded: ${jpegData.size} bytes")
                }

                listener.onFrameEncoded(base64)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error encoding frame: ${e.message}")
        } finally {
            image.close()
        }
    }

    private fun nv21FromYuv420(image: ImageProxy): ByteArray {
        val planes = image.planes
        val y = planes[0]
        val u = planes[1]
        val v = planes[2]

        val ySize = y.buffer.remaining()
        val uSize = u.buffer.remaining()
        val vSize = v.buffer.remaining()

        val nv21 = ByteArray(ySize + uSize + vSize)

        y.buffer.get(nv21, 0, ySize)
        u.buffer.get(nv21, ySize, uSize)
        v.buffer.get(nv21, ySize + uSize, vSize)

        return nv21
    }
}
