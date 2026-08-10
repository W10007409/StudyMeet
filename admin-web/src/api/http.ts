import type { CreditWarning, LiveSummary, NotReadyItem, SessionSearchResult, TodayCounts } from '../domain/types'
import type { OperatorApi } from './client'

const OPERATOR_SECRET_HEADER = 'x-operator-secret'

/** 서버가 { error: string | ZodIssue[] } 형태로 보내는 메시지를 최대한 사람이 읽을 수 있게 뽑는다. */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body) {
      const { error } = body as { error: unknown }
      if (typeof error === 'string') return error
      return JSON.stringify(error)
    }
  } catch {
    // 본문이 JSON 이 아니었다 — statusText 로 대체한다.
  }
  return res.statusText
}

/**
 * 결정 #3 — 조용한 실패가 더 위험하다. 시크릿이 틀리면 서버는 404 를 돌려준다
 * (middleware/operatorOnly.ts, "권한 없음을 알리는 것 자체가 엔드포인트의 존재를
 * 광고하는 것"). 그 404 를 그냥 삼키면 "오늘은 조용하네" 로 읽히는 빈 화면이 된다 —
 * 그래서 non-OK 응답은 전부 상태 코드와 서버 메시지를 담아 던진다.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    const message = await extractErrorMessage(res)
    throw new ApiError(res.status, `${action} 실패 (HTTP ${res.status}): ${message}`)
  }
}

export function createHttpApi(baseUrl: string, secret: string): OperatorApi {
  async function get<T>(path: string, action: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { [OPERATOR_SECRET_HEADER]: secret },
    })
    await assertOk(res, action)
    return res.json() as Promise<T>
  }

  return {
    getLive() {
      return get<LiveSummary>('/operator/live', '실시간 요약 조회')
    },

    getToday(date) {
      return get<TodayCounts>(`/operator/today?date=${encodeURIComponent(date)}`, '오늘 집계 조회')
    },

    getNotReady(date) {
      return get<NotReadyItem[]>(`/operator/not-ready?date=${encodeURIComponent(date)}`, '준비 실패 목록 조회')
    },

    getCreditWarnings() {
      return get<CreditWarning[]>('/operator/credit-warnings', '크레딧 경고 목록 조회')
    },

    searchSessions({ q, date }) {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (date) params.set('date', date)
      const qs = params.toString()
      return get<SessionSearchResult[]>(`/operator/sessions${qs ? `?${qs}` : ''}`, '세션 검색')
    },
  }
}
