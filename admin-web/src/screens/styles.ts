import type { CSSProperties } from 'react'

/** 인라인 스타일. teacher-web 과 같은 결(설계 §4의 지시) — 별도 CSS 프레임워크를 쓰지 않는다. */
export const sectionStyle: CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 16,
}

/** 결정 #3 — "불러오지 못했다"는 "표시할 것이 없다"와 다르게 보여야 한다. */
export const errorStyle: CSSProperties = {
  color: '#8a1f11',
  background: '#fdecea',
  border: '1px solid #f5c2c7',
  borderRadius: 4,
  padding: '8px 12px',
}

export const mutedStyle: CSSProperties = {
  color: '#666',
}
