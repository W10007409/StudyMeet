import type { PrismaClient } from '@prisma/client'
import { isStale } from '../domain/liveness.js'

/** 정리된 세션의 note 에 남기는 표시. 운영자가 "왜 끝났지" 를 알 수 있어야 한다. */
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
    select: { id: true, lastHeartbeatAt: true, note: true },
  })

  const staleIds = pickStale(inProgress, now)
  if (staleIds.length === 0) return 0

  const notes = new Map(inProgress.map((s) => [s.id, s.note]))

  for (const id of staleIds) {
    const existingNote = notes.get(id) ?? ''
    const note = existingNote ? `${existingNote}\n${STALE_REAP_NOTE}` : STALE_REAP_NOTE
    await prisma.session.update({
      where: { id },
      data: { status: 'ENDED', endedAt: now, note },
    })
  }

  return staleIds.length
}
