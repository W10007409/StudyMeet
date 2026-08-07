import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataMessage } from '../domain/types'

interface Options {
  signalingUrl: string
  room: string
  role: 'caller' | 'callee'
  onData: (msg: DataMessage) => void
  /** 접속 정보를 백엔드에서 받아오기 전에는 붙지 않는다. */
  enabled: boolean
}

const CAPTURE = { width: 480, height: 270, frameRate: 24 }

export function useSession({ signalingUrl, room, role, onData, enabled }: Options) {
  // 미디어 객체는 절대 state 에 넣지 않는다. 재렌더가 srcObject 를 흔들면 영상이 끊긴다.
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteSetRef = useRef(false)
  const pendingRef = useRef<RTCIceCandidate[]>([])
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  // 화면에 그리는 값만 state 다.
  const [iceState, setIceState] = useState<RTCIceConnectionState>('new')
  const [connected, setConnected] = useState(false)

  const send = useCallback((msg: DataMessage) => {
    const dc = dcRef.current
    if (dc?.readyState === 'open') dc.send(JSON.stringify(msg))
  }, [])

  const hangUp = useCallback(() => {
    wsRef.current?.close()
    dcRef.current?.close()
    pcRef.current?.close()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    wsRef.current = null
    dcRef.current = null
    pcRef.current = null
    localStreamRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    const turnUrl = import.meta.env.VITE_TURN_URL
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        username: import.meta.env.VITE_TURN_USER ?? '',
        credential: import.meta.env.VITE_TURN_PASS ?? '',
      })
    }

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    const attachData = (dc: RTCDataChannel) => {
      dcRef.current = dc
      dc.onmessage = (e) => onDataRef.current(JSON.parse(e.data) as DataMessage)
    }

    if (role === 'caller') attachData(pc.createDataChannel('lesson'))
    else pc.ondatachannel = (e) => attachData(e.channel)

    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
    }
    pc.oniceconnectionstatechange = () => {
      setIceState(pc.iceConnectionState)
      setConnected(pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')
    }

    const flush = async () => {
      remoteSetRef.current = true
      while (pendingRef.current.length) {
        const c = pendingRef.current.shift()!
        try { await pc.addIceCandidate(c) } catch { /* 거부된 후보는 무시한다 */ }
      }
    }

    void (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: CAPTURE, audio: true })
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      localStreamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const ws = new WebSocket(`${signalingUrl}/?room=${encodeURIComponent(room)}`)
      wsRef.current = ws

      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        ws.send(JSON.stringify({
          type: 'candidate',
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
        }))
      }

      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'ready' && role === 'caller') {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
        } else if (msg.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
          await flush()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
        } else if (msg.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
          await flush()
        } else if (msg.type === 'candidate') {
          const c = new RTCIceCandidate({
            candidate: msg.candidate,
            sdpMid: msg.sdpMid,
            sdpMLineIndex: msg.sdpMLineIndex,
          })
          if (remoteSetRef.current) {
            try { await pc.addIceCandidate(c) } catch { /* 무시 */ }
          } else {
            pendingRef.current.push(c)
          }
        }
      }
    })()

    return () => { cancelled = true; hangUp() }
  }, [enabled, signalingUrl, room, role, hangUp])

  return { localRef, remoteRef, iceState, connected, send, hangUp }
}
