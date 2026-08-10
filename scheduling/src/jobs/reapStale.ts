import type { PrismaClient } from '@prisma/client'
import { isStale, STALE_AFTER_MS } from '../domain/liveness.js'

/**
 * 정리된 세션의 endedReason 에 남기는 표시. 운영자가 "왜 끝났지" 를 알 수 있어야 한다.
 * note 는 선생님이 쓰는 칸이다 — PUT /sessions/:id/note 가 상태 가드 없이 note 전체를
 * 덮어쓰므로, 이 표시를 note 에 남기면 이후 편집 한 번에 조용히 지워진다. endedReason
 * 은 그 필드와 분리된 전용 칸이라 그럴 일이 없다.
 */
export const STALE_REAP_NOTE = '[system] 선생님 생존신호 끊김으로 자동 종료됨'

interface StaleCandidate {
  id: string
  lastHeartbeatAt: Date | null
}

/**
 * 방치 판정은 여기서만 한다. DB 없이 검증할 수 있는 유일한 부분.
 * isStale 을 그대로 쓴다 — 90초 값도, "신호 없으면 건드리지 않는다" 규칙도 여기서 다시 쓰지 않는다.
 */
export function pickStale(sessions: StaleCandidate[], now: Date): string[] {
  return sessions.filter((s) => isStale(s.lastHeartbeatAt, now)).map((s) => s.id)
}

/**
 * 설계 §4.5 — 선생님 연결 소실 90초 후 자동 종료.
 * 크레딧을 발급하지 않는다. 선생님 브라우저가 죽은 것이지 아이의 결석이 아니고,
 * 수업은 실제로 진행됐을 수 있다. CreditEvent 에 이 사유가 없는 것은 의도다 —
 * 그 판단은 실제로 무슨 일이 있었는지 본 사람이 한다.
 */
export async function reapStale(prisma: PrismaClient, now: Date): Promise<number> {
  const inProgress = await prisma.session.findMany({
    where: { status: 'IN_PROGRESS' },
    select: { id: true, lastHeartbeatAt: true },
  })

  const staleIds = pickStale(inProgress, now)
  if (staleIds.length === 0) return 0

  // 읽기(findMany)와 쓰기 사이에 진짜 heartbeat 가 들어와 살아날 수 있다 — heartbeat 엔드포인트와
  // 같은 방식으로, 쓰는 순간 다시 한번 조건(IN_PROGRESS 이고 여전히 방치 상태)을 걸어 확인한다.
  // pickStale 의 스냅샷 판정만 믿고 강제로 ENDED 로 덮어쓰지 않는다.
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS)
  let reaped = 0
  for (const id of staleIds) {
    const result = await prisma.session.updateMany({
      where: { id, status: 'IN_PROGRESS', lastHeartbeatAt: { lt: cutoff } },
      data: { status: 'ENDED', endedAt: now, endedReason: STALE_REAP_NOTE },
    })
    if (result.count === 1) reaped++
  }

  return reaped
}
