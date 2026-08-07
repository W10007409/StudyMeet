export function BookViewer({ pageNo, totalPages, lastBy, onPageDelta, onPointer }: {
  pageNo: number
  totalPages: number
  lastBy: 'teacher' | 'student' | null
  onPageDelta: (delta: number) => void
  onPointer: (x: number, y: number, action: 'down' | 'move' | 'up') => void
}) {
  return (
    <div
      style={{ flex: '0 0 58%', position: 'relative', background: '#fafafa', borderRight: '1px solid #ddd' }}
      onPointerDown={(e) => onPointer(e.nativeEvent.offsetX, e.nativeEvent.offsetY, 'down')}
      onPointerMove={(e) => e.buttons === 1 && onPointer(e.nativeEvent.offsetX, e.nativeEvent.offsetY, 'move')}
      onPointerUp={(e) => onPointer(e.nativeEvent.offsetX, e.nativeEvent.offsetY, 'up')}
    >
      {/*
        책 지면은 자리표시다. 실제 학습 컨텐츠는 다른 팀이 만들고 있고,
        상위 설계 §9의 "학습 컨텐츠 슬롯"으로 교체된다.
        여기서 검증하는 것은 지면 자체가 아니라 페이지 동기화와 포인터다.
      */}
      <div style={{ height: 'calc(100% - 48px)', display: 'grid', placeItems: 'center' }}>
        책 지면 {pageNo}
      </div>
      <div style={{ height: 48, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => onPageDelta(-1)}>◀</button>
        <span>{pageNo} / {totalPages}</span>
        <button onClick={() => onPageDelta(+1)}>▶</button>
      </div>
      {/* 조용히 동기화되면 "내가 넘긴 게 아닌데" 가 된다. 설계 §7.2 */}
      {lastBy && (
        <div style={{ position: 'absolute', top: 12, left: 12, background: '#000a', color: '#fff', padding: '4px 10px', borderRadius: 4 }}>
          {lastBy === 'teacher' ? '선생님이 넘겼어요' : '학생이 넘겼어요'}
        </div>
      )}
    </div>
  )
}
