import type { CreditWarning, LiveSummary, NotReadyItem, SessionSearchResult, TodayCounts } from '../domain/types'

/**
 * 설계 §4의 다섯 엔드포인트. scheduling/src/routes/operator.ts 가 실제 응답 형태다 — 이
 * 인터페이스는 그것을 따라간 것이지 설계 문서의 표현을 따라간 것이 아니다.
 *
 * date 는 today/notReady 에서는 필수다 — 서버의 DateQuery 스키마가 그렇다
 * (operator.ts, `date: z.string().regex(...)`, `.optional()` 없음). sessions 검색에서는
 * 둘 다 선택이다(SessionsQuery).
 */
export interface OperatorApi {
  getLive(): Promise<LiveSummary>
  getToday(date: string): Promise<TodayCounts>
  getNotReady(date: string): Promise<NotReadyItem[]>
  getCreditWarnings(): Promise<CreditWarning[]>
  searchSessions(params: { q?: string; date?: string }): Promise<SessionSearchResult[]>
}
