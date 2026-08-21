import '@livekit/components-styles'
import { useEffect, useState } from 'react'
import {
  LiveKitRoom as LKRoom,
  useTracks,
  VideoTrack,
  RoomAudioRenderer,
} from '@livekit/components-react'
import { Track } from 'livekit-client'

const LIVEKIT_URL = 'wss://helpmanager-cgkgdjae.livekit.cloud'
const TOKEN_API = 'http://localhost:3000/api/livekit/token'

function Tracks() {
  const screenTracks = useTracks([Track.Source.ScreenShare])
  const remoteScreens = screenTracks.filter(t => !t.participant.isLocal)

  return (
    <>
      <RoomAudioRenderer />
      {remoteScreens.length > 0 ? (
        <VideoTrack
          trackRef={remoteScreens[0]}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#555', fontSize: 14,
        }}>
          학생 화면 대기 중...
        </div>
      )}
    </>
  )
}

export function LiveKitView({ room, identity }: { room: string; identity: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(TOKEN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, identity, role: 'teacher' }),
    })
      .then(r => r.json())
      .then(data => setToken(data.token))
      .catch(err => setError(err.message))
  }, [room, identity])

  if (error) return <div style={{ color: '#ff6b6b', padding: 20 }}>LiveKit 연결 오류: {error}</div>
  if (!token) return <div style={{ color: '#888', padding: 20 }}>LiveKit 연결 중...</div>

  return (
    <LKRoom
      token={token}
      serverUrl={LIVEKIT_URL}
      connect={true}
      video={true}
      audio={true}
      style={{ width: '100%', height: '100%' }}
    >
      <Tracks />
    </LKRoom>
  )
}
