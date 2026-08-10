import type { FastifyPluginAsync } from 'fastify'
import { Prisma, type PrismaClient, type SessionStatus } from '@prisma/client'
import { z } from 'zod'
import { HEARTBEAT_INTERVAL_MS, STALE_AFTER_MS } from '../domain/liveness.js'
import { CREDIT_WARN_THRESHOLD, shouldWarn } from '../domain/credit.js'
import { toKstIsoString } from '../domain/kst.js'
import { LOBBY_WINDOW_MS } from './teacher.js'
import { operatorOnly } from '../middleware/operatorOnly.js'

interface Deps {
  prisma: PrismaClient
}

const DateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 는 YYYY-MM-DD 형식이어야 한다'),
})

const SessionsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 는 YYYY-MM-DD 형식이어야 한다').optional(),
})

/** date(KST 'YYYY-MM-DD') 하루의 [시작, 끝) UTC 경계. teacher.ts/makeup.ts 와 같은 방식. */
function kstDayRange(date: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(`${date}T00:00:00+09:00`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  return { dayStart, dayEnd }
}

/** 오늘 집계(§4.2)에 담을 다섯 상태. LOBBY_OPEN 은 DB 에 저장되지 않는 표시용 상태라 뺀다. */
const TODAY_STATUSES: SessionStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'ENDED', 'NO_SHOW', 'CANCELLED']

/**
 * 운영자 전용 집계·조회 라우트 (설계 §4). 전부 operatorOnly 를 거친다 —
 * addHook 을 이 플러그인 스코프에만 걸어서, 라우트를 추가할 때마다 하나하나
 * preHandler 를 붙이는 걸 잊을 수 없게 한다.
 *
 * 연락처는 어떤 응답에도 넣지 않는다. Student.guardianPhone 은 선생님 화면의
 * 열람 기록 경로(POST /contacts/:studentId/reveal)로만 나간다 — 여기서는 student/teacher
 * 관계를 항상 select 로 { id, name } 만 골라 쓴다. include 를 쓰지 않는 것도 그래서다:
 * include 는 관계의 전체 컬럼을 끌고 오므로 guardianPhone 이 스키마에 새 필드로 추가되는
 * 순간 이 라우트들이 자동으로 유출 경로가 된다.
 */
export const operatorRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  app.addHook('preHandler', operatorOnly)

  /**
   * 설계 §4.1 — 10초 폴링. 목록을 세지 않고 count 질의 넷을 쓴다
   * (수십만 행 테이블에서 findMany 로 배열을 만들어 length 를 재면 폴링 주기마다 비싸진다).
   */
  app.get('/operator/live', async () => {
    const now = new Date()
    const staleCutoff = new Date(now.getTime() - STALE_AFTER_MS)
    const disconnectedCutoff = new Date(now.getTime() - HEARTBEAT_INTERVAL_MS)
    const lobbyCutoff = new Date(now.getTime() + LOBBY_WINDOW_MS)

    const [inProgress, stale, disconnected, notReady] = await Promise.all([
      prisma.session.count({ where: { status: 'IN_PROGRESS' } }),
      // stale 은 리퍼(reapStale)가 실제로 정리하는 조건과 같아야 한다 — Task 1 의
      // STALE_AFTER_MS 를 그대로 쓰고 90(_000) 을 다시 적지 않는다.
      prisma.session.count({
        where: { status: 'IN_PROGRESS', lastHeartbeatAt: { lt: staleCutoff } },
      }),
      // "연결 끊김" — 생존신호를 한 번 이상 놓쳤지만(30초 주기) 아직 리퍼가 정리할
      // 90초에는 못 미친 세션. stale 과 겹치지 않는 이른 경고 구간이다. 서버는 학생-선생님
      // WebRTC 연결 상태를 보지 못한다(P2P 라 관측자가 선생님 브라우저뿐이고, 그 상태를
      // 서버로 보내는 경로가 없다) — 그래서 서버가 실제로 가진 유일한 생존 신호인
      // lastHeartbeatAt 으로 근사한다.
      prisma.session.count({
        where: {
          status: 'IN_PROGRESS',
          lastHeartbeatAt: { lt: disconnectedCutoff, gte: staleCutoff },
        },
      }),
      // "준비 실패" — 아이 앱의 프리체크 결과를 받는 경로가 아직 없다(§9 오픈이슈,
      // GET /sessions/:id/readiness 의 스텁과 같은 이유). 그래서 카메라/마이크/네트워크
      // 개별 실패가 아니라, teacher.ts 의 대기실 판정(LOBBY_OPEN)과 같은 창을 써서
      // "시작 시각이 임박했거나 지났는데 아직 시작 못 한 세션" 수를 대신 센다.
      prisma.session.count({
        where: { status: 'SCHEDULED', scheduledAt: { lte: lobbyCutoff } },
      }),
    ])

    return { inProgress, disconnected, notReady, stale }
  })

  /** 설계 §4.2 — 오늘(또는 지정한 날짜) 상태별 건수. 사후 확인용이라 실시간일 필요가 없다. */
  app.get<{ Querystring: { date?: string } }>('/operator/today', async (request, reply) => {
    const parsed = DateQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { date } = parsed.data
    const { dayStart, dayEnd } = kstDayRange(date)

    const grouped = await prisma.session.groupBy({
      by: ['status'],
      where: { scheduledAt: { gte: dayStart, lt: dayEnd } },
      _count: { _all: true },
    })

    const counts = Object.fromEntries(TODAY_STATUSES.map((s) => [s, 0])) as Record<
      SessionStatus,
      number
    >
    for (const row of grouped) {
      if (row.status in counts) counts[row.status] = row._count._all
    }

    return { date, counts }
  })

  /**
   * 설계 §4.3 — 준비 실패 목록. /operator/live 의 notReady 와 같은 창(LOBBY_WINDOW_MS)을 쓴다.
   * 실패 항목(카메라/마이크/네트워크)은 아직 정직하게 "확인 안 됨" 이다 —
   * GET /sessions/:id/readiness 스텁과 같은 이유(§9 오픈이슈). 확인 안 됐다는 사실을
   * 숨기지 않고 그대로 돌려준다. 연락처는 넣지 않는다 — 필요하면 §6.2의 열람 기록
   * 경로(POST /contacts/:studentId/reveal)를 따로 쓴다.
   */
  app.get<{ Querystring: { date?: string } }>('/operator/not-ready', async (request, reply) => {
    const parsed = DateQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { date } = parsed.data
    const { dayStart, dayEnd } = kstDayRange(date)
    const now = new Date()
    const lobbyCutoff = new Date(now.getTime() + LOBBY_WINDOW_MS)

    const sessions = await prisma.session.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gte: dayStart, lt: dayEnd, lte: lobbyCutoff },
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        scheduledAt: true,
        teacher: { select: { id: true, name: true } },
        enrollment: { select: { student: { select: { id: true, name: true } } } },
      },
    })

    return sessions.map((s) => ({
      sessionId: s.id,
      studentName: s.enrollment.student.name,
      teacherName: s.teacher.name,
      scheduledAt: toKstIsoString(s.scheduledAt),
      // 프리체크 파이프라인이 아직 없어 개별 항목을 실제로 확인할 수 없다 — 정직한 스텁.
      readiness: { cameraGranted: false, micGranted: false, networkOk: false, checkedAt: null },
    }))
  })

  /**
   * 설계 §4.4 — 크레딧 경고 목록. CREDIT_WARN_THRESHOLD 로 후보를 좁혀 count 부담을 줄이되,
   * 실제 판정은 shouldWarn() 을 그대로 불러 쓴다 — 두 값이 갈릴 일이 없게 한다.
   */
  app.get('/operator/credit-warnings', async () => {
    const candidates = await prisma.enrollment.findMany({
      where: { creditBalance: { gte: CREDIT_WARN_THRESHOLD } },
      orderBy: { creditBalance: 'desc' },
      select: {
        id: true,
        creditBalance: true,
        bookTitle: true,
        student: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
      },
    })

    return candidates
      .filter((e) => shouldWarn(e.creditBalance))
      .map((e) => ({
        enrollmentId: e.id,
        studentName: e.student.name,
        teacherName: e.teacher.name,
        bookTitle: e.bookTitle,
        creditBalance: e.creditBalance,
      }))
  })

  /** 설계 §4.5 — 학생명·선생님명(부분 일치)과 날짜로 세션을 찾는다. 문의 대응용. */
  app.get<{ Querystring: { q?: string; date?: string } }>('/operator/sessions', async (request, reply) => {
    const parsed = SessionsQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { q, date } = parsed.data

    const where: Prisma.SessionWhereInput = {}

    if (date) {
      const { dayStart, dayEnd } = kstDayRange(date)
      where.scheduledAt = { gte: dayStart, lt: dayEnd }
    }
    if (q) {
      where.OR = [
        { enrollment: { student: { name: { contains: q, mode: 'insensitive' } } } },
        { teacher: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        teacher: { select: { id: true, name: true } },
        enrollment: { select: { student: { select: { id: true, name: true } } } },
      },
    })

    return sessions.map((s) => ({
      sessionId: s.id,
      studentName: s.enrollment.student.name,
      teacherName: s.teacher.name,
      scheduledAt: toKstIsoString(s.scheduledAt),
      status: s.status,
    }))
  })
}
