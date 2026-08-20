package com.studymeet.child.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.DisplayMetrics
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.WindowManager

class RemoteTouchAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "RemoteTouchA11y"
        private var instance: RemoteTouchAccessibilityService? = null

        fun getInstance(): RemoteTouchAccessibilityService? = instance

        /** 정규화 좌표(0~1)를 받아 해당 위치를 탭한다 */
        fun tap(nx: Float, ny: Float) {
            instance?.performTap(nx, ny)
        }

        /** 정규화 좌표로 스와이프 */
        fun swipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 300) {
            instance?.performSwipe(startX, startY, endX, endY, durationMs)
        }

        fun isAvailable(): Boolean = instance != null
    }

    private var screenWidth = 0
    private var screenHeight = 0

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        updateScreenSize()
        Log.d(TAG, "Accessibility service connected ($screenWidth x $screenHeight)")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 이벤트 처리 불필요 - 터치 주입만 사용
    }

    override fun onInterrupt() {
        Log.d(TAG, "Service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "Service destroyed")
    }

    private fun updateScreenSize() {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            screenWidth = bounds.width()
            screenHeight = bounds.height()
        } else {
            val dm = DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(dm)
            screenWidth = dm.widthPixels
            screenHeight = dm.heightPixels
        }
    }

    private fun performTap(nx: Float, ny: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        val x = (nx * screenWidth).coerceIn(0f, screenWidth.toFloat())
        val y = (ny * screenHeight).coerceIn(0f, screenHeight.toFloat())

        val path = Path()
        path.moveTo(x, y)

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
            .build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "Tap at ($x, $y)")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "Tap cancelled at ($x, $y)")
            }
        }, null)
    }

    private fun performSwipe(startNx: Float, startNy: Float, endNx: Float, endNy: Float, durationMs: Long) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        val sx = (startNx * screenWidth).coerceIn(0f, screenWidth.toFloat())
        val sy = (startNy * screenHeight).coerceIn(0f, screenHeight.toFloat())
        val ex = (endNx * screenWidth).coerceIn(0f, screenWidth.toFloat())
        val ey = (endNy * screenHeight).coerceIn(0f, screenHeight.toFloat())

        val path = Path()
        path.moveTo(sx, sy)
        path.lineTo(ex, ey)

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "Swipe ($sx,$sy) -> ($ex,$ey)")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "Swipe cancelled")
            }
        }, null)
    }
}
