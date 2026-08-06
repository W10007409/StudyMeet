package com.wjthinkbig.studymeet.spike

import android.Manifest
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PipCameraSurvivalTest {

    @get:Rule
    val permissions: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.POST_NOTIFICATIONS,
    )

    /** 3초 동안 최소 이만큼의 프레임이 들어와야 카메라가 살아 있다고 본다. 24fps 기준 72프레임의 약 40%. */
    private val minFramesIn3Seconds = 30

    @Test
    fun cameraKeepsProducingFramesWhileInPictureInPicture() {
        assumeTrue(
            "local.properties에 livekit.url / livekit.token.android 설정 필요",
            BuildConfig.LIVEKIT_URL.isNotBlank() && BuildConfig.LIVEKIT_TOKEN.isNotBlank(),
        )

        ActivityScenario.launch(SpikeActivity::class.java).use { scenario ->

            // 1. 접속되어 카메라 프레임이 흐르기 시작할 때까지 기다린다.
            val started = awaitUntil(timeoutMs = 30_000) {
                SpikeActivity.localFrames.snapshot() > 10
            }
            assertTrue("30초 안에 카메라 프레임이 시작되지 않음", started)

            // 2. PIP로 진입한다.
            scenario.onActivity { it.enterPipNow() }

            val inPip = awaitUntil(timeoutMs = 10_000) {
                var value = false
                scenario.onActivity { value = it.isInPictureInPictureMode }
                value
            }
            assertTrue("PIP 모드 진입 실패", inPip)

            // 3. PIP 상태에서 3초 동안 프레임 증가량을 측정한다.
            val before = SpikeActivity.localFrames.snapshot()
            Thread.sleep(3_000)
            val after = SpikeActivity.localFrames.snapshot()
            val delta = after - before

            android.util.Log.i(
                "PipSpike",
                "PIP frames: before=$before after=$after delta=$delta",
            )

            assertTrue(
                "PIP 중 카메라 프레임이 멈춤. before=$before after=$after delta=$delta " +
                    "(최소 기대치 $minFramesIn3Seconds)",
                delta >= minFramesIn3Seconds,
            )
        }
    }

    private fun awaitUntil(timeoutMs: Long, condition: () -> Boolean): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return true
            Thread.sleep(200)
        }
        return false
    }
}
