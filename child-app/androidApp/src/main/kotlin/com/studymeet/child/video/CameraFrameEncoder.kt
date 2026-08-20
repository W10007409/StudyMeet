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
    private val frameInterval = 100 // milliseconds (10 FPS)
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
                yuvImage.compressToJpeg(android.graphics.Rect(0, 0, image.width, image.height), 40, outputStream)
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
        val width = image.width
        val height = image.height
        val yBuffer = image.planes[0].buffer
        val uBuffer = image.planes[1].buffer
        val vBuffer = image.planes[2].buffer

        val ySize = width * height
        val nv21 = ByteArray(ySize + ySize / 2)

        // Copy Y plane
        yBuffer.get(nv21, 0, ySize)

        // NV21 needs VU interleaved after Y
        val chromaRowStride = image.planes[1].rowStride
        val chromaPixelStride = image.planes[1].pixelStride

        var offset = ySize
        for (row in 0 until height / 2) {
            for (col in 0 until width / 2) {
                val uIndex = row * chromaRowStride + col * chromaPixelStride
                val vIndex = row * chromaRowStride + col * chromaPixelStride
                nv21[offset++] = vBuffer.get(vIndex)
                nv21[offset++] = uBuffer.get(uIndex)
            }
        }

        return nv21
    }
}
