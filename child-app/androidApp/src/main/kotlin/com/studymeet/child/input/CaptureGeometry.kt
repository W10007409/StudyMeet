package com.studymeet.child.input

import kotlin.math.min

/**
 * 캡처된 영상 프레임의 좌표를 실제 화면 좌표로 되돌린다.
 *
 * ### 왜 단순히 `x * 화면폭` 이 아닌가
 *
 * 선생님 웹은 좌표를 **원본 프레임** 기준 0~1 로 보낸다
 * (`teacher-web/src/webrtc/useTouchInput.ts` 의 `normalize`).
 * 그런데 이 앱의 프레임은 화면과 크기가 다르다.
 *
 * 1. [com.studymeet.child.video.ScreenCaptureManager.resolveCaptureSize] 가
 *    폭/높이를 16의 배수로 내림한다. 하드웨어 H.264 인코더 요구사항이다.
 *    1080x2400 화면은 1072x2400 버퍼가 된다.
 * 2. `maxWidth` 가 설정되면 해상도를 한 번 더 줄인다.
 *
 * 이때 VirtualDisplay 는 화면을 버퍼에 **가로세로 비율을 유지한 채 맞춰 넣고**
 * 남는 쪽을 검은 띠(레터박스)로 채운다. 즉 프레임 가장자리에는 화면이 아닌
 * 영역이 존재한다. 이 보정을 빼먹으면 터치가 화면 끝으로 갈수록 어긋나고,
 * 위 예시에서는 오른쪽 끝에서 약 8px 밀린다.
 *
 * 이 클래스는 그 매핑을 정확히 되돌린다. Android 의존성이 없어 단위 테스트가 가능하다.
 *
 * @param sourceWidth  실제 디스플레이 폭(px). 회전할 때마다 달라지므로 매번 최신값을 넣는다.
 * @param sourceHeight 실제 디스플레이 높이(px).
 * @param frameWidth   인코딩되어 나가는 프레임 폭(px).
 * @param frameHeight  인코딩되어 나가는 프레임 높이(px).
 */
class CaptureGeometry(
    val sourceWidth: Int,
    val sourceHeight: Int,
    val frameWidth: Int,
    val frameHeight: Int
) {

    /** 화면 → 프레임 축소 배율. 가로세로 중 더 빡빡한 쪽이 기준이 된다. */
    val scale: Float

    /** 프레임 안에서 실제 화면이 차지하는 영역. 나머지는 레터박스다. */
    val contentWidth: Float
    val contentHeight: Float
    val offsetX: Float
    val offsetY: Float

    init {
        val validSource = sourceWidth > 0 && sourceHeight > 0
        val validFrame = frameWidth > 0 && frameHeight > 0

        if (validSource && validFrame) {
            scale = min(
                frameWidth.toFloat() / sourceWidth,
                frameHeight.toFloat() / sourceHeight
            )
            contentWidth = sourceWidth * scale
            contentHeight = sourceHeight * scale
            offsetX = (frameWidth - contentWidth) / 2f
            offsetY = (frameHeight - contentHeight) / 2f
        } else {
            // 정보가 부족하면 항등 변환으로 물러난다. 어긋날지언정 죽지는 않는다.
            scale = 1f
            contentWidth = frameWidth.toFloat()
            contentHeight = frameHeight.toFloat()
            offsetX = 0f
            offsetY = 0f
        }
    }

    /** 매핑이 의미 있는지. false 면 호출자는 화면 크기를 그대로 곱하는 편이 낫다. */
    val isValid: Boolean
        get() = scale > 0f && contentWidth > 0f && contentHeight > 0f

    /**
     * 정규화된 프레임 X(0~1) → 디스플레이 X(px).
     * 레터박스를 가리키면 화면 밖 값이 나오므로 [isInsideContent] 로 먼저 걸러도 되고,
     * [toSourceXClamped] 를 쓰면 화면 안으로 접어 넣는다.
     */
    fun toSourceX(normalizedX: Float): Float {
        if (!isValid) return normalizedX * sourceWidth
        return (normalizedX * frameWidth - offsetX) / scale
    }

    fun toSourceY(normalizedY: Float): Float {
        if (!isValid) return normalizedY * sourceHeight
        return (normalizedY * frameHeight - offsetY) / scale
    }

    /**
     * 화면 경계 안으로 접어 넣은 좌표.
     *
     * 마지막 픽셀(`sourceWidth`)은 화면 밖이므로 1px 안쪽까지만 허용한다.
     * 경계에 정확히 걸친 터치가 뷰 밖으로 빠져 무시되는 것을 막는다.
     */
    fun toSourceXClamped(normalizedX: Float): Float =
        toSourceX(normalizedX).coerceIn(0f, (sourceWidth - 1).coerceAtLeast(0).toFloat())

    fun toSourceYClamped(normalizedY: Float): Float =
        toSourceY(normalizedY).coerceIn(0f, (sourceHeight - 1).coerceAtLeast(0).toFloat())

    /** 이 정규화 좌표가 레터박스가 아닌 실제 화면 영역을 가리키는가. */
    fun isInsideContent(normalizedX: Float, normalizedY: Float): Boolean {
        if (!isValid) return true
        val fx = normalizedX * frameWidth
        val fy = normalizedY * frameHeight
        return fx >= offsetX && fx <= offsetX + contentWidth &&
            fy >= offsetY && fy <= offsetY + contentHeight
    }

    /** 레터박스가 없는지. 두께가 0.5px 미만이면 실질적으로 없는 것으로 본다. */
    val hasLetterbox: Boolean
        get() = offsetX >= 0.5f || offsetY >= 0.5f

    fun matches(sourceW: Int, sourceH: Int, frameW: Int, frameH: Int): Boolean =
        sourceWidth == sourceW && sourceHeight == sourceH &&
            frameWidth == frameW && frameHeight == frameH

    override fun toString(): String =
        "CaptureGeometry(source=${sourceWidth}x$sourceHeight, frame=${frameWidth}x$frameHeight, " +
            "scale=$scale, offset=($offsetX, $offsetY))"
}
