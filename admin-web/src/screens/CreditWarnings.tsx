import { useCallback, useEffect, useState } from 'react'
import type { OperatorApi } from '../api/client'
import type { AsyncState, CreditWarning } from '../domain/types'
import { errorStyle, mutedStyle, sectionStyle } from './styles'

/** 설계 §4.4 — 크레딧이 쌓이기만 하고 소진할 슬롯이 없어지는 상황을 사람이 알아채는 자리. */
export function CreditWarnings({ api }: { api: OperatorApi }) {
  const [state, setState] = useState<AsyncState<CreditWarning[]>>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    api
      .getCreditWarnings()
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section style={sectionStyle}>
      <h2>
        크레딧 경고 목록{' '}
        <button onClick={load} style={{ fontSize: 12 }}>
          새로고침
        </button>
      </h2>
      {state.status === 'loading' && <p style={mutedStyle}>불러오는 중…</p>}
      {state.status === 'error' && <p style={errorStyle}>불러오지 못했다: {state.message}</p>}
      {state.status === 'ready' && (
        state.data.length === 0 ? (
          <p style={mutedStyle}>경고 대상 등록이 없다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>학생</th>
                <th style={{ textAlign: 'left' }}>담임</th>
                <th style={{ textAlign: 'left' }}>교재</th>
                <th style={{ textAlign: 'left' }}>보유 크레딧</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((w) => (
                <tr key={w.enrollmentId}>
                  <td>{w.studentName}</td>
                  <td>{w.teacherName}</td>
                  <td>{w.bookTitle}</td>
                  <td>{w.creditBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  )
}
