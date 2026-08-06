package com.wjthinkbig.studymeet.spike

import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import java.util.concurrent.atomic.AtomicInteger

/**
 * 비디오 트랙에 붙여 프레임 도착 횟수만 센다.
 * 카메라가 실제로 캡처를 계속하는지 판별하는 유일한 근거다.
 */
class FrameCounter(val label: String) : VideoSink {
    val count = AtomicInteger(0)

    override fun onFrame(frame: VideoFrame?) {
        count.incrementAndGet()
    }

    fun snapshot(): Int = count.get()

    fun reset() {
        count.set(0)
    }
}
