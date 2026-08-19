package com.studymeet.child.util

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Log
import android.util.Rational

class PiPManager(private val activity: Activity) {
    private val TAG = "PiPManager"
    private var isPiPMode = false

    fun enterPiP() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .build()
                activity.enterPictureInPictureMode(params)
                isPiPMode = true
                Log.d(TAG, "PiP 모드 진입 성공")
            } catch (e: Exception) {
                Log.e(TAG, "PiP 모드 진입 실패: ${e.message}")
            }
        }
    }

    fun exitPiP() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (isPiPMode) {
                try {
                    activity.moveTaskToBack(false)
                    isPiPMode = false
                    Log.d(TAG, "PiP 모드 종료")
                } catch (e: Exception) {
                    Log.e(TAG, "PiP 모드 종료 실패: ${e.message}")
                }
            }
        }
    }

    fun isInPiP(): Boolean = isPiPMode

    fun handleUserLeaveHint() {
        // 사용자가 홈 버튼을 누르면 자동으로 PiP 모드로 전환
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            enterPiP()
        }
    }
}
