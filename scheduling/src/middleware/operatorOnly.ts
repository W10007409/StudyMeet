import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * 이것은 인증이 아니다. 설계 §2.1 (docs/superpowers/specs/2026-08-08-operator-monitoring-design.md).
 *
 * 운영자 화면은 전체 아동의 보호자 연락처와 모든 수업에 닿는다. 진짜 인증(계정, 로그인,
 * 역할)이 붙기 전까지 "실수로 노출되는 것"만 막는 임시 장치가 이 파일이다:
 *
 *   - 시크릿을 아는 사람은 전부 같은 권한을 갖는다. 개인별 권한 구분이 없다.
 *   - 누가 언제 무엇을 조회했는지 감사 기록이 전혀 남지 않는다.
 *   - 시크릿은 .env 에 평문으로 있고, admin-web 이 붙으면 VITE_ 접두사 값으로 브라우저
 *     번들에도 그대로 박힌다.
 *
 * 그래서 헤더가 틀리거나 없으면 401 이 아니라 404 를 돌려준다 — "권한이 없다"고 알리는
 * 것 자체가 엔드포인트의 존재를 광고하는 것이기 때문이다. 이 라우트들의 운영 배포는
 * 설계 §5의 진짜 인증이 끝난 뒤에만 한다.
 */

const OPERATOR_SECRET_HEADER = 'x-operator-secret'

/**
 * 서버 부팅 시 한 번 호출한다. `OPERATOR_SECRET` 이 없으면(undefined 든 빈 문자열이든)
 * 예외를 던져 서버를 아예 띄우지 않는다 — 빈 값으로 조용히 통과시키면 헤더 검사가
 * 사실상 없는 채로 서비스가 뜬다.
 */
export function requireOperatorSecret(): string {
  const secret = process.env.OPERATOR_SECRET
  if (!secret) {
    throw new Error(
      'OPERATOR_SECRET 이 설정되지 않았다. 운영자 API 는 전체 아동의 보호자 연락처와 ' +
        '모든 수업에 닿으므로, 이 값 없이는 서버를 시작하지 않는다. .env 에 값을 채운다.',
    )
  }
  return secret
}

/**
 * 라우트 preHandler. `process.env.OPERATOR_SECRET` 을 요청마다 다시 읽는다 —
 * 부팅 시점의 requireOperatorSecret() 확인과 별개로, 여기서도 빈 값이면 무조건 거부한다.
 * (`!expected` 를 먼저 걸지 않으면 헤더가 없을 때 `undefined !== undefined` 가 false 가 되어
 * 시크릿이 빈 상태에서 검사를 조용히 통과하는 구멍이 생긴다.)
 */
export async function operatorOnly(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expected = process.env.OPERATOR_SECRET
  const provided = request.headers[OPERATOR_SECRET_HEADER]

  if (!expected || provided !== expected) {
    // 직접 { error: 'Not Found' } 를 만들어 보내지 않는다 — Fastify 기본 404 는
    // message/error/statusCode 세 필드인데, 그것과 모양이 다른 응답은 "진짜 없는 경로"와
    // "시크릿이 틀린 진짜 경로"를 바디만으로 구분하는 신호가 된다(설계 §2.1이 막으려는
    // 바로 그것). reply.callNotFound() 는 server.ts 의 app 전역 setNotFoundHandler 로
    // 위임해서, 두 경우가 항상 같은 코드 경로·같은 바디로 수렴하게 한다.
    await reply.callNotFound()
    return
  }
}
