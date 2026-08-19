package com.studymeet.child.video

/**
 * 인코더가 뱉어낸 H.264 액세스 유닛을 받는 쪽의 계약.
 *
 * [ScreenCaptureManager] 는 이 인터페이스 너머에 무엇이 있는지 알지 못한다.
 * 덕분에 전송 경로(WebSocket 릴레이 / WebRTC VideoTrack / 로컬 파일 덤프)를
 * 캡처 파이프라인을 건드리지 않고 갈아끼울 수 있다.
 *
 * 모든 콜백은 인코더의 전용 스레드에서 호출된다. 구현체는 이 스레드를 오래 붙잡지 말아야 한다.
 */
interface EncodedVideoSink {

    /**
     * 스트림 헤더(SPS/PPS). 인코더가 첫 프레임을 내놓기 전에 정확히 한 번 호출된다.
     *
     * 디코더는 이 데이터 없이는 어떤 프레임도 해석할 수 없으므로,
     * 구현체는 반드시 이를 보관했다가 늦게 합류한 수신자에게 다시 보내야 한다.
     */
    fun onVideoFormat(csd: ByteArray, width: Int, height: Int)

    /**
     * 인코딩된 프레임 하나.
     *
     * @param data Annex-B 형식의 H.264 액세스 유닛. 이 배열은 호출자가 재사용하지 않으므로
     *             구현체가 보관해도 안전하다.
     * @param isKeyFrame IDR 프레임 여부. 수신자는 첫 키프레임부터 디코딩을 시작할 수 있다.
     * @param presentationTimeUs 마이크로초 단위 표시 시각.
     */
    fun onEncodedFrame(data: ByteArray, isKeyFrame: Boolean, presentationTimeUs: Long)

    /** 캡처가 끝났거나 복구 불가능한 오류로 중단됐다. */
    fun onVideoEnded(reason: String?)
}
