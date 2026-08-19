import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DataMessage, GestureKind, PointerKind, TouchAction } from '../domain/types'

/**
 * 원격 영상 위의 터치/클릭을 DataChannel 메시지로 옮긴다.
 *
 * 설계 요점
 * - Pointer Events 하나로 마우스/터치/펜을 함께 받는다. touch-action: none 을 같이 걸면
 *   브라우저 기본 스크롤·확대가 죽어서 preventDefault 를 부르지 않아도 된다.
 *   (React 의 터치 리스너는 패시브라 preventDefault 가 먹지 않는 경우가 있다.)
 * - 좌표는 원본 프레임 기준 0~1 이다. object-fit 으로 잘리거나 레터박스가 생긴 만큼을
 *   되돌린 뒤 보내므로, 받는 쪽은 프레임 크기만 곱하면 실제 픽셀이 나온다.
 * - move 는 requestAnimationFrame 으로 합쳐 한 프레임에 한 번만 보낸다. 화면 갱신보다
 *   자주 보내봐야 지연만 늘고, 타이머 기반 throttle 과 달리 프레임에 맞아 끊기지 않는다.
 * - 커서 표시는 state 가 아니라 DOM 스타일을 직접 써서 재렌더 없이 따라간다.
 */

export type ObjectFit = 'cover' | 'contain' | 'fill'

export interface TouchInputOptions {
  /** useSession 이 돌려준 send. DataChannel 이 닫혀 있으면 알아서 버린다. */
  send: (msg: DataMessage) => void
  /** 원본 프레임 크기를 읽을 미디어 엘리먼트. 없으면 보정 없이 표시 영역 기준으로 보낸다. */
  mediaRef?: React.RefObject<HTMLImageElement | HTMLVideoElement | null>
  /** 미디어에 적용한 object-fit. 좌표 보정에 쓴다. */
  objectFit?: ObjectFit
  /** false 면 이벤트를 아예 붙이지 않는다. 기본 true. */
  enabled?: boolean
  /** 이보다 덜 움직인 move 는 보내지 않는다. 정규화 단위, 기본 0.002. */
  minMoveDistance?: number
  /** 탭으로 인정할 최대 누름 시간(ms). 기본 350. */
  tapMaxMs?: number
  /** 탭으로 인정할 최대 이동 거리(px). 기본 10. */
  tapMaxDistancePx?: number
  /** 더블클릭으로 묶을 두 탭 사이 최대 간격(ms). 기본 300. */
  doubleTapMaxMs?: number
  /** 드래그로 전환할 이동 거리(px). 기본 8. */
  dragThresholdPx?: number
}

export interface TouchInputStatus {
  /** 현재 눌려 있는 포인터 수. 2 이상이면 핀치 판정 중이다. */
  pointerCount: number
  /** 마지막으로 보낸 동작. 화면 피드백용. */
  lastAction: TouchAction | null
  /** 진행 중인 제스처. */
  gesture: GestureKind | null
  /** 핀치 배율. 핀치 중이 아니면 1. */
  scale: number
  /** 보낸 메시지 수. 전송이 살아 있는지 눈으로 보려고 둔다. */
  sentCount: number
}

interface Point { x: number; y: number }

interface ActivePointer {
  id: number
  type: PointerKind
  startClient: Point
  lastClient: Point
  /** 원본 프레임 기준 정규화 좌표 (보정 후). */
  lastNorm: Point
  /** 표시 영역 기준 0~1. 커서 그리는 데만 쓴다. */
  lastDisp: Point
  startTime: number
  pressure: number
  moved: boolean
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const toPointerKind = (t: string): PointerKind =>
  t === 'touch' || t === 'pen' ? t : 'mouse'

/**
 * 표시 영역 안의 위치를 원본 프레임 기준 0~1 로 바꾼다.
 * cover 는 넘친 쪽이 잘려 있으므로 보이는 구간만큼 다시 펴 주고,
 * contain 은 레터박스를 빼고 늘려 준다. 프레임 밖을 가리키면 0~1 로 잘라 보낸다.
 */
function normalize(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  natural: { w: number; h: number } | null,
  fit: ObjectFit,
): { norm: Point; disp: Point } {
  const dx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
  const dy = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
  const disp = { x: clamp01(dx), y: clamp01(dy) }

  if (!natural || natural.w <= 0 || natural.h <= 0 || fit === 'fill' || rect.width <= 0 || rect.height <= 0) {
    return { norm: { ...disp }, disp }
  }

  const boxAspect = rect.width / rect.height
  const mediaAspect = natural.w / natural.h
  let x = dx
  let y = dy

  if (fit === 'cover') {
    if (mediaAspect > boxAspect) {
      // 원본이 더 넓다 → 좌우가 잘렸다. 보이는 폭 비율만큼 되돌린다.
      const visible = boxAspect / mediaAspect
      x = (1 - visible) / 2 + x * visible
    } else {
      const visible = mediaAspect / boxAspect
      y = (1 - visible) / 2 + y * visible
    }
  } else {
    // contain: 남는 쪽에 여백이 있다.
    if (mediaAspect > boxAspect) {
      const shown = boxAspect / mediaAspect
      y = (y - (1 - shown) / 2) / shown
    } else {
      const shown = mediaAspect / boxAspect
      x = (x - (1 - shown) / 2) / shown
    }
  }

  return { norm: { x: clamp01(x), y: clamp01(y) }, disp }
}

function naturalSize(el: HTMLImageElement | HTMLVideoElement | null | undefined) {
  if (!el) return null
  if (el instanceof HTMLVideoElement) {
    return el.videoWidth > 0 ? { w: el.videoWidth, h: el.videoHeight } : null
  }
  return el.naturalWidth > 0 ? { w: el.naturalWidth, h: el.naturalHeight } : null
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** -180~180 도로 접는다. 핀치 회전이 한 바퀴 넘어가도 값이 튀지 않게. */
function wrapAngle(deg: number) {
  let d = deg
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

export function useTouchInput(options: TouchInputOptions) {
  const {
    send,
    mediaRef,
    objectFit = 'cover',
    enabled = true,
    minMoveDistance = 0.002,
    tapMaxMs = 350,
    tapMaxDistancePx = 10,
    doubleTapMaxMs = 300,
    dragThresholdPx = 8,
  } = options

  /** 터치를 받는 표시 영역. 좌표 기준이 되는 사각형이다. */
  const surfaceRef = useRef<HTMLDivElement>(null)
  /** 손끝을 따라다니는 표식. 있으면 훅이 직접 위치를 쓴다. */
  const indicatorRef = useRef<HTMLDivElement>(null)

  const sendRef = useRef(send)
  sendRef.current = send

  const pointersRef = useRef(new Map<number, ActivePointer>())
  const lastTapRef = useRef<{ time: number; client: Point } | null>(null)

  // 드래그 상태
  const dragRef = useRef<{ id: number; last: Point } | null>(null)
  // 핀치 상태
  const pinchRef = useRef<{ startDist: number; startAngle: number } | null>(null)
  /** 핀치가 시작되면 그 손가락들의 탭/클릭 판정을 버린다. */
  const suppressTapRef = useRef(false)

  const rafRef = useRef<number | null>(null)
  const pendingMoveRef = useRef<{ p: ActivePointer } | null>(null)
  const pendingGestureRef = useRef<DataMessage | null>(null)

  const [status, setStatus] = useState<TouchInputStatus>({
    pointerCount: 0,
    lastAction: null,
    gesture: null,
    scale: 1,
    sentCount: 0,
  })
  const sentCountRef = useRef(0)
  /** 화면에 띄우는 핀치 배율. state 로 바로 올리면 프레임마다 재렌더된다. */
  const scaleDisplayRef = useRef(1)

  const emit = useCallback((msg: DataMessage) => {
    sendRef.current(msg)
    sentCountRef.current += 1
  }, [])

  const emitTouch = useCallback((p: ActivePointer, action: TouchAction, pressure?: number) => {
    emit({
      type: 'touch_input',
      x: Number(p.lastNorm.x.toFixed(5)),
      y: Number(p.lastNorm.y.toFixed(5)),
      action,
      pressure: pressure ?? p.pressure,
      pointerId: p.id,
      pointerType: p.type,
      timestamp: Date.now(),
    })
  }, [emit])

  /** 표식을 재렌더 없이 옮긴다. left/top 퍼센트라 부모 크기만 따라가면 된다. */
  const paintIndicator = useCallback((disp: Point | null, down: boolean) => {
    const el = indicatorRef.current
    if (!el) return
    if (!disp) {
      el.style.opacity = '0'
      return
    }
    el.style.opacity = down ? '1' : '0.4'
    el.style.left = `${disp.x * 100}%`
    el.style.top = `${disp.y * 100}%`
    el.style.transform = `translate(-50%, -50%) scale(${down ? 1 : 0.65})`
  }, [])

  /** 카운터를 매 프레임 state 로 올리면 재렌더만 늘어난다. 눈에 보일 만큼만 올린다. */
  const lastStatusPushRef = useRef(0)

  const flush = useCallback(() => {
    rafRef.current = null

    const move = pendingMoveRef.current
    if (move) {
      pendingMoveRef.current = null
      emitTouch(move.p, 'move')
      paintIndicator(move.p.lastDisp, true)
    }

    const gesture = pendingGestureRef.current
    if (gesture) {
      pendingGestureRef.current = null
      emit(gesture)
    }

    const now = performance.now()
    if (now - lastStatusPushRef.current > 250) {
      lastStatusPushRef.current = now
      const scale = scaleDisplayRef.current
      setStatus((s) => (
        s.sentCount === sentCountRef.current && s.scale === scale
          ? s
          : { ...s, sentCount: sentCountRef.current, scale }
      ))
    }
  }, [emit, emitTouch, paintIndicator])

  const schedule = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(flush)
  }, [flush])

  /** 화면에 보여줄 상태만 갱신한다. move 중에는 부르지 않는다. */
  const syncStatus = useCallback((patch: Partial<TouchInputStatus>) => {
    setStatus((s) => ({
      ...s,
      ...patch,
      pointerCount: patch.pointerCount ?? pointersRef.current.size,
      sentCount: sentCountRef.current,
    }))
  }, [])

  const measure = useCallback((clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return null
    return normalize(clientX, clientY, rect, naturalSize(mediaRef?.current), objectFit)
  }, [mediaRef, objectFit])

  /** 두 손가락이 모이면 핀치를 시작한다. */
  const startPinchIfNeeded = useCallback(() => {
    const ps = [...pointersRef.current.values()]
    if (ps.length !== 2 || pinchRef.current) return

    // 진행 중이던 드래그는 접는다.
    if (dragRef.current) {
      const p = pointersRef.current.get(dragRef.current.id)
      if (p) {
        emit({
          type: 'gesture_input', gesture: 'drag', phase: 'end',
          x: p.lastNorm.x, y: p.lastNorm.y, timestamp: Date.now(),
        })
      }
      dragRef.current = null
    }

    const [a, b] = ps
    pinchRef.current = {
      startDist: Math.max(dist(a.lastClient, b.lastClient), 1),
      startAngle: (Math.atan2(b.lastClient.y - a.lastClient.y, b.lastClient.x - a.lastClient.x) * 180) / Math.PI,
    }
    suppressTapRef.current = true

    emit({
      type: 'gesture_input', gesture: 'pinch', phase: 'start',
      x: (a.lastNorm.x + b.lastNorm.x) / 2,
      y: (a.lastNorm.y + b.lastNorm.y) / 2,
      scale: 1, rotation: 0, timestamp: Date.now(),
    })
    scaleDisplayRef.current = 1
    syncStatus({ gesture: 'pinch', scale: 1 })
  }, [emit, syncStatus])

  const endPinch = useCallback(() => {
    if (!pinchRef.current) return
    pinchRef.current = null
    const ps = [...pointersRef.current.values()]
    const center = ps.length
      ? { x: ps[0].lastNorm.x, y: ps[0].lastNorm.y }
      : { x: 0.5, y: 0.5 }
    pendingGestureRef.current = null
    emit({
      type: 'gesture_input', gesture: 'pinch', phase: 'end',
      x: center.x, y: center.y, timestamp: Date.now(),
    })
    scaleDisplayRef.current = 1
    syncStatus({ gesture: null, scale: 1 })
  }, [emit, syncStatus])

  const endDrag = useCallback((p: ActivePointer) => {
    if (!dragRef.current || dragRef.current.id !== p.id) return
    dragRef.current = null
    pendingGestureRef.current = null
    emit({
      type: 'gesture_input', gesture: 'drag', phase: 'end',
      x: p.lastNorm.x, y: p.lastNorm.y, timestamp: Date.now(),
    })
    syncStatus({ gesture: null })
  }, [emit, syncStatus])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    const m = measure(e.clientX, e.clientY)
    if (!m) return

    // 포인터를 잡아 두면 영역 밖으로 나가도 move/up 이 계속 들어온다.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 지원 안 하면 그냥 둔다 */ }

    const p: ActivePointer = {
      id: e.pointerId,
      type: toPointerKind(e.pointerType),
      startClient: { x: e.clientX, y: e.clientY },
      lastClient: { x: e.clientX, y: e.clientY },
      lastNorm: m.norm,
      lastDisp: m.disp,
      startTime: performance.now(),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      moved: false,
    }
    pointersRef.current.set(p.id, p)

    emitTouch(p, 'down')
    paintIndicator(p.lastDisp, true)
    startPinchIfNeeded()
    syncStatus({ lastAction: 'down' })
  }, [enabled, measure, emitTouch, paintIndicator, startPinchIfNeeded, syncStatus])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    const p = pointersRef.current.get(e.pointerId)
    if (!p) return
    const m = measure(e.clientX, e.clientY)
    if (!m) return

    const movedPx = dist({ x: e.clientX, y: e.clientY }, p.startClient)
    const movedNorm = dist(m.norm, p.lastNorm)

    p.lastClient = { x: e.clientX, y: e.clientY }
    p.lastDisp = m.disp
    if (e.pressure > 0) p.pressure = e.pressure
    if (movedPx > tapMaxDistancePx) p.moved = true

    const prevNorm = p.lastNorm
    if (movedNorm < minMoveDistance && !pinchRef.current) return
    p.lastNorm = m.norm

    if (pinchRef.current) {
      const ps = [...pointersRef.current.values()]
      if (ps.length >= 2) {
        const [a, b] = ps
        const d = Math.max(dist(a.lastClient, b.lastClient), 1)
        const angle = (Math.atan2(b.lastClient.y - a.lastClient.y, b.lastClient.x - a.lastClient.x) * 180) / Math.PI
        const scale = d / pinchRef.current.startDist
        pendingGestureRef.current = {
          type: 'gesture_input', gesture: 'pinch', phase: 'move',
          x: Number(((a.lastNorm.x + b.lastNorm.x) / 2).toFixed(5)),
          y: Number(((a.lastNorm.y + b.lastNorm.y) / 2).toFixed(5)),
          scale: Number(scale.toFixed(4)),
          rotation: Number(wrapAngle(angle - pinchRef.current.startAngle).toFixed(2)),
          timestamp: Date.now(),
        }
        // 배율 표시는 flush 가 250ms 마다 state 로 올린다.
        scaleDisplayRef.current = Number(scale.toFixed(2))
        paintIndicator(p.lastDisp, true)
        schedule()
      }
      return
    }

    // 한 손가락: 임계값을 넘으면 드래그로 승격한다.
    if (!dragRef.current && p.moved && movedPx > dragThresholdPx) {
      dragRef.current = { id: p.id, last: prevNorm }
      emit({
        type: 'gesture_input', gesture: 'drag', phase: 'start',
        x: p.lastNorm.x, y: p.lastNorm.y, dx: 0, dy: 0, timestamp: Date.now(),
      })
      syncStatus({ gesture: 'drag' })
    }

    if (dragRef.current && dragRef.current.id === p.id) {
      const last = dragRef.current.last
      dragRef.current.last = p.lastNorm
      pendingGestureRef.current = {
        type: 'gesture_input', gesture: 'drag', phase: 'move',
        x: Number(p.lastNorm.x.toFixed(5)),
        y: Number(p.lastNorm.y.toFixed(5)),
        dx: Number((p.lastNorm.x - last.x).toFixed(5)),
        dy: Number((p.lastNorm.y - last.y).toFixed(5)),
        timestamp: Date.now(),
      }
    }

    pendingMoveRef.current = { p }
    schedule()
  }, [enabled, measure, minMoveDistance, tapMaxDistancePx, dragThresholdPx, emit, schedule, syncStatus, paintIndicator])

  const finishPointer = useCallback((e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const p = pointersRef.current.get(e.pointerId)
    if (!p) return

    const m = measure(e.clientX, e.clientY)
    if (m) { p.lastNorm = m.norm; p.lastDisp = m.disp }

    // 이 포인터의 밀린 move 는 up 보다 늦게 나가면 순서가 뒤집힌다.
    if (pendingMoveRef.current?.p.id === p.id) pendingMoveRef.current = null
    if (pendingGestureRef.current) { emit(pendingGestureRef.current); pendingGestureRef.current = null }

    pointersRef.current.delete(p.id)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* 이미 풀렸다 */ }

    emitTouch(p, cancelled ? 'cancel' : 'up', 0)

    if (pinchRef.current && pointersRef.current.size < 2) endPinch()
    endDrag(p)

    let action: TouchAction = cancelled ? 'cancel' : 'up'
    const heldMs = performance.now() - p.startTime
    const isTap = !cancelled && !p.moved && !suppressTapRef.current && heldMs <= tapMaxMs

    if (isTap) {
      const prev = lastTapRef.current
      const now = Date.now()
      const isDouble = !!prev
        && now - prev.time <= doubleTapMaxMs
        && dist(prev.client, p.lastClient) <= tapMaxDistancePx * 2.5
      action = isDouble ? 'double_click' : 'click'
      emitTouch(p, action, 0)
      lastTapRef.current = isDouble ? null : { time: now, client: p.lastClient }
    }

    if (pointersRef.current.size === 0) {
      suppressTapRef.current = false
      paintIndicator(p.lastDisp, false)
    }
    syncStatus({ lastAction: action })
  }, [measure, emit, emitTouch, endPinch, endDrag, paintIndicator, syncStatus, tapMaxMs, doubleTapMaxMs, tapMaxDistancePx])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    finishPointer(e, false)
  }, [enabled, finishPointer])

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    finishPointer(e, true)
  }, [enabled, finishPointer])

  /** 커서만 따라다니는 표식. 누르지 않은 마우스에도 위치를 보여 준다. */
  const onPointerHover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || pointersRef.current.size > 0) return
    const m = measure(e.clientX, e.clientY)
    if (m) paintIndicator(m.disp, false)
  }, [enabled, measure, paintIndicator])

  const onPointerLeave = useCallback(() => {
    if (pointersRef.current.size === 0) paintIndicator(null, false)
  }, [paintIndicator])

  // 탭 전환이나 창 포커스 상실은 up 이 오지 않는다. 남은 포인터를 정리한다.
  useEffect(() => {
    const reset = () => {
      const ps = [...pointersRef.current.values()]
      if (!ps.length) return
      pointersRef.current.clear()
      ps.forEach((p) => emitTouch(p, 'cancel', 0))
      if (pinchRef.current) {
        pinchRef.current = null
        emit({ type: 'gesture_input', gesture: 'pinch', phase: 'end', x: 0.5, y: 0.5, timestamp: Date.now() })
      }
      if (dragRef.current) {
        dragRef.current = null
        emit({ type: 'gesture_input', gesture: 'drag', phase: 'end', x: 0.5, y: 0.5, timestamp: Date.now() })
      }
      suppressTapRef.current = false
      scaleDisplayRef.current = 1
      paintIndicator(null, false)
      syncStatus({ lastAction: 'cancel', gesture: null, scale: 1, pointerCount: 0 })
    }
    window.addEventListener('blur', reset)
    return () => window.removeEventListener('blur', reset)
  }, [emit, emitTouch, paintIndicator, syncStatus])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  /** 표시 영역 div 에 그대로 펼쳐 넣는 props. */
  const surfaceProps = useMemo(() => ({
    ref: surfaceRef,
    onPointerDown,
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointersRef.current.has(e.pointerId)) onPointerMove(e)
      else onPointerHover(e)
    },
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    style: {
      // 브라우저 기본 제스처(스크롤/더블탭 확대/텍스트 선택)를 끄면
      // preventDefault 없이도 포인터 이벤트가 온전히 들어온다.
      touchAction: 'none' as const,
      userSelect: 'none' as const,
      WebkitUserSelect: 'none' as const,
      WebkitTouchCallout: 'none' as const,
      cursor: enabled ? 'crosshair' : 'default',
    },
  }), [enabled, onPointerDown, onPointerMove, onPointerHover, onPointerUp, onPointerCancel, onPointerLeave])

  return { surfaceProps, surfaceRef, indicatorRef, status }
}
