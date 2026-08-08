import { useCallback, useEffect, useState } from 'react'
import type { TeacherApi, StudentCredit } from '../api/client'
import { ApiError } from '../api/http'
import { kstDatePlus, kstToday } from '../domain/scheduling'

/** MyStudents 와 같은 범위 — 화면을 오가도 같은 4주를 본다. */
const RANGE_DAYS = 27

export function MakeupBooking({ api, student, onBack }: {
  api: TeacherApi
  student: StudentCredit
  onBack: () => void
}) {
  const [slots, setSlots] = useState<{ date: string; times: string[] }[]>([])
  const [creditBalance, setCreditBalance] = useState(student.creditBalance)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(async () => {
    const today = kstToday(new Date())
    const result = await api.getMakeupSlots(today, kstDatePlus(today, RANGE_DAYS))
    setSlots(result.slots)
    const me = result.students.find((s) => s.enrollmentId === student.enrollmentId)
    if (me) setCreditBalance(me.creditBalance)
  }, [api, student.enrollmentId])

  useEffect(() => { void load() }, [load])

  const book = async (date: string, time: string) => {
    const scheduledAt = `${date}T${time}:00+09:00`
    setPending(scheduledAt)
    setMessage(null)
    try {
      await api.bookMakeup(student.enrollmentId, scheduledAt)
    } catch (err) {
      // 409 는 다른 예약이 방금 그 슬롯을 채웠다는 뜻 — 회복 가능하니 다시 고르라고 말한다.
      // 그 밖의 실패(크레딧 부족 등)는 서버 메시지를 그대로 보여준다.
      if (err instanceof ApiError && err.status === 409) {
        setMessage('방금 다른 예약이 들어왔어요. 다시 골라 주세요')
      } else {
        setMessage(err instanceof Error ? err.message : '예약에 실패했어요')
      }
    }
    // 성공이든 실패든 다시 불러온다 — 낙관적으로 지우지 않는다. 서버가 받아들인 것과
    // 화면이 그렇게 믿는 것은 다르다.
    await load()
    setPending(null)
  }

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack}>← 담당 학생</button>
      <h1>{student.studentName} 보강 예약</h1>
      <p>남은 크레딧 {creditBalance}</p>
      {message && <p style={{ color: '#b3261e' }}>{message}</p>}
      <table>
        <tbody>
          {slots.map((row) => (
            <tr key={row.date}>
              <td style={{ verticalAlign: 'top', paddingRight: 12 }}>{row.date}</td>
              <td>
                {row.times.map((t) => {
                  const scheduledAt = `${row.date}T${t}:00+09:00`
                  return (
                    <button
                      key={t}
                      disabled={pending === scheduledAt}
                      onClick={() => void book(row.date, t)}
                      style={{ margin: 2 }}
                    >
                      {t}
                    </button>
                  )
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
