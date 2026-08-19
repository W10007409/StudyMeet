package com.studymeet.child.video

import android.graphics.ImageFormat
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import java.util.concurrent.atomic.AtomicLong

interface FrameCaptureListener {
    fun onFrameCaptured(frameData: ByteArray)
}

class VideoFrameCapture(private val listener: FrameCaptureListener) : ImageAnalysis.Analyzer {

    private val TAG = "VideoFrameCapture"
    private var lastFrameTime = AtomicLong(0)
    private val frameInterval = 100 // milliseconds between frames (10 FPS)

    override fun analyze(image: ImageProxy) {
        val currentTime = System.currentTimeMillis()
        val lastTime = lastFrameTime.get()

        // Send frame every frameInterval milliseconds
        if (currentTime - lastTime >= frameInterval) {
            lastFrameTime.set(currentTime)

            try {
                val data = when (image.format) {
                    ImageFormat.YUV_420_888 -> {
                        yuvToJpeg(image)
                    }
                    else -> {
                        Log.w(TAG, "Unsupported image format: ${image.format}")
                        null
                    }
                }

                if (data != null) {
                    listener.onFrameCaptured(data)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing frame: ${e.message}")
            }
        }

        image.close()
    }

    private fun yuvToJpeg(image: ImageProxy): ByteArray? {
        return try {
            val nv21 = yuv420ToNv21(image)
            compressNv21ToJpeg(nv21, image.width, image.height)
        } catch (e: Exception) {
            Log.e(TAG, "Error converting YUV to JPEG: ${e.message}")
            null
        }
    }

    private fun yuv420ToNv21(image: ImageProxy): ByteArray {
        val planes = image.planes
        val y = planes[0]
        val u = planes[1]
        val v = planes[2]

        val ySize = y.buffer.remaining()
        val uSize = u.buffer.remaining()
        val vSize = v.buffer.remaining()

        val nv21 = ByteArray(ySize + uSize + vSize)

        // Copy Y
        y.buffer.get(nv21, 0, ySize)

        val uvPixelStride = u.pixelStride
        if (uvPixelStride == 1) {
            // Interleaved UV
            u.buffer.get(nv21, ySize, uSize)
            v.buffer.get(nv21, ySize + uSize, vSize)
        } else {
            // Semi-planar format, interleave U and V
            val uvBuffer = ByteArray(uSize + vSize)
            u.buffer.get(uvBuffer, 0, uSize)
            v.buffer.get(uvBuffer, uSize, vSize)

            var pos = ySize
            for (i in 0 until uSize / uvPixelStride) {
                nv21[pos] = uvBuffer[i * uvPixelStride]
                nv21[pos + uSize] = uvBuffer[uSize + i * uvPixelStride]
                pos++
            }
        }

        return nv21
    }

    private fun compressNv21ToJpeg(nv21: ByteArray, width: Int, height: Int): ByteArray {
        // Simplified JPEG compression using YUV data
        // In a real scenario, you'd use libjpeg-turbo or similar
        // For now, return base64 encoded YUV data as a placeholder
        return nv21
    }
}
