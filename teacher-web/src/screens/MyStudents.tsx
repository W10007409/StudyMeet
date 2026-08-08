import { useEffect, useState } from 'react'
import type { TeacherApi, StudentCredit } from '../api/client'
import { kstDatePlus, kstToday } from '../domain/scheduling'

/** 오늘부터 4주(28일) 범위 — 보강 슬롯 그리드(Task 4)와 같은 범위를 써야 화면이 일관된다. */
const RANGE_DAYS = 27

export function MyStudents({ api, onBack, onBook }: {
  api: TeacherApi
  onBack: () => void
  onBook: (student: StudentCredit) => void
}) {
  const [students, setStudents] = useState<StudentCredit[]>([])

  useEffect(() => {
    const today = kstToday(new Date())
    void api.getMakeupSlots(today, kstDatePlus(today, RANGE_DAYS)).then((r) => setStudents(r.students))
  }, [api])

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack}>← 목록</button>
      <h1>담당 학생</h1>
      <table>
        <tbody>
          {students.map((s) => (
            <tr key={s.enrollmentId}>
              <td>{s.studentName}</td>
              <td>
                {/* 편성 설계 §5.2 — 경고는 크레딧이 쌓이기만 하고 소진할 슬롯이 없는 상황을 사람이
                    알아채게 하려는 것이다. 숫자만 키우면 아무도 안 보므로 색과 표식을 함께 쓴다. */}
                {s.warn ? (
                  <span style={{ color: '#b3261e', fontWeight: 'bold' }}>
                    ⚠ 크레딧 {s.creditBalance} (경고)
                  </span>
                ) : (
                  <span>크레딧 {s.creditBalance}</span>
                )}
              </td>
              <td>
                {/* 크레딧 0이면 예약 화면에 들어가도 할 게 없다 — 서버도 어차피 거부한다(Task 5 브리프). */}
                <button disabled={s.creditBalance <= 0} onClick={() => onBook(s)}>
                  보강 잡기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
