package com.studymeet.child.input

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 좌표 복원은 눈으로 검증하기 어렵다. 터치가 몇 픽셀 밀리는 것은 화면만 봐서는
 * 알아채기 힘들고, 화면 가장자리에서만 드러난다. 그래서 숫자로 고정해둔다.
 */
class CaptureGeometryTest {

    /** 프레임과 화면이 같으면 아무 보정도 일어나지 않아야 한다. */
    @Test
    fun `동일 해상도면 항등 변환`() {
        val g = CaptureGeometry(1080, 1920, 1080, 1920)

        assertFalse("보정할 것이 없으니 레터박스도 없다", g.hasLetterbox)
        assertEquals(0f, g.toSourceX(0f), 0.01f)
        assertEquals(540f, g.toSourceX(0.5f), 0.01f)
        assertEquals(1080f, g.toSourceX(1f), 0.01f)
        assertEquals(960f, g.toSourceY(0.5f), 0.01f)
    }

    /**
     * 실제로 벌어지는 경우. 1080x2400 화면은 16배수 정렬 때문에 1072x2400 으로 캡처된다.
     * 프레임이 화면보다 상대적으로 좁으므로 세로가 남아 위아래에 띠가 생긴다.
     */
    @Test
    fun `16배수 정렬로 생긴 레터박스를 되돌린다`() {
        val g = CaptureGeometry(sourceWidth = 1080, sourceHeight = 2400, frameWidth = 1072, frameHeight = 2400)

        // 배율은 더 빡빡한 가로가 결정한다: 1072/1080
        assertEquals(1072f / 1080f, g.scale, 1e-6f)
        assertTrue("세로에 띠가 생겨야 한다", g.hasLetterbox)
        assertEquals(0f, g.offsetX, 0.01f)
        assertEquals((2400 - 2400 * (1072f / 1080f)) / 2f, g.offsetY, 0.01f)

        // 가로는 띠가 없으므로 양 끝이 화면 양 끝에 정확히 대응한다.
        assertEquals(0f, g.toSourceX(0f), 0.01f)
        assertEquals(1080f, g.toSourceX(1f), 0.01f)
        assertEquals(540f, g.toSourceX(0.5f), 0.01f)

        // 세로 중앙은 여전히 중앙이다.
        assertEquals(1200f, g.toSourceY(0.5f), 0.01f)

        // 프레임 맨 위는 화면 위쪽 밖(음수)을 가리킨다 — 그게 바로 검은 띠다.
        assertTrue(g.toSourceY(0f) < 0f)
        assertFalse(g.isInsideContent(0.5f, 0f))
        // 접어 넣으면 화면 안으로 들어온다.
        assertEquals(0f, g.toSourceYClamped(0f), 0.01f)
    }

    /**
     * 보정을 빼먹었을 때 얼마나 어긋나는지 수치로 남긴다.
     * 이 차이가 곧 "버튼 옆을 눌렀는데 반응이 없다" 는 증상이 된다.
     */
    @Test
    fun `보정을 생략하면 화면 끝에서 어긋난다`() {
        val g = CaptureGeometry(1080, 2400, 1072, 2400)

        val naive = 0.98f * 1080f      // 프레임 보정 없이 화면 폭만 곱한 값
        val correct = g.toSourceX(0.98f)

        assertEquals(1058.4f, naive, 0.1f)
        assertEquals(1058.4f, correct, 0.1f) // 가로는 띠가 없어 우연히 일치한다

        // 세로는 다르다. 아래쪽 90% 지점에서 눈에 띄게 밀린다.
        val naiveY = 0.9f * 2400f
        val correctY = g.toSourceY(0.9f)
        assertTrue("세로는 보정 없이는 어긋난다", Math.abs(naiveY - correctY) > 3f)
    }

    /** maxWidth 로 절반 크기로 줄여 보내는 경우. 배율만 달라지고 매핑은 그대로여야 한다. */
    @Test
    fun `축소 전송해도 비율은 유지된다`() {
        val g = CaptureGeometry(1600, 2560, 800, 1280)

        assertEquals(0.5f, g.scale, 1e-6f)
        assertFalse(g.hasLetterbox)
        assertEquals(800f, g.toSourceX(0.5f), 0.01f)
        assertEquals(1280f, g.toSourceY(0.5f), 0.01f)
        assertEquals(1600f, g.toSourceX(1f), 0.01f)
    }

    /** 가로 화면. 가로/세로가 뒤바뀌어도 같은 계산이어야 한다. */
    @Test
    fun `가로 화면도 같은 규칙을 따른다`() {
        val g = CaptureGeometry(2400, 1080, 2400, 1072)

        assertEquals(1072f / 1080f, g.scale, 1e-6f)
        assertTrue(g.offsetX > 0f)
        assertEquals(0f, g.offsetY, 0.01f)
        assertEquals(540f, g.toSourceY(0.5f), 0.01f)
        assertEquals(1200f, g.toSourceX(0.5f), 0.01f)
    }

    /** 화면 크기를 모르는 상태에서도 죽지 않고 그럴듯한 값을 내야 한다. */
    @Test
    fun `크기가 0이면 항등 변환으로 물러난다`() {
        val g = CaptureGeometry(0, 0, 0, 0)

        assertFalse(g.isValid)
        assertEquals(0f, g.toSourceX(0.5f), 0.01f)
        assertEquals(0f, g.toSourceXClamped(0.5f), 0.01f)
        assertTrue("판단할 근거가 없으면 통과시킨다", g.isInsideContent(0.5f, 0.5f))
    }

    /** 접어 넣기는 화면 밖 1픽셀 안쪽까지만 허용한다. */
    @Test
    fun `clamp 는 화면 안쪽으로만 보낸다`() {
        val g = CaptureGeometry(1080, 1920, 1080, 1920)

        assertEquals(0f, g.toSourceXClamped(-0.5f), 0.01f)
        assertEquals(1079f, g.toSourceXClamped(2f), 0.01f)
        assertEquals(1919f, g.toSourceYClamped(1f), 0.01f)
    }

    @Test
    fun `matches 는 네 값이 모두 같을 때만 참`() {
        val g = CaptureGeometry(1080, 2400, 1072, 2400)

        assertTrue(g.matches(1080, 2400, 1072, 2400))
        assertFalse("회전하면 달라져야 한다", g.matches(2400, 1080, 1072, 2400))
        assertFalse("해상도를 바꾸면 달라져야 한다", g.matches(1080, 2400, 800, 1776))
    }
}
