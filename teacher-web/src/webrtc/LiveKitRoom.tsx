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
  const cameraTracks = useTracks([Track.Source.Camera])
  const screenTracks = useTracks([Track.Source.ScreenShare])

  // Only show remote tracks (from child)
  const remoteCameras = cameraTracks.filter(t => !t.participant.isLocal)
  const remoteScreens = screenTracks.filter(t => !t.participant.isLocal)

  return (
    <>
      <RoomAudioRenderer />
      {/* Screen share - main area */}
      {remoteScreens.length > 0 && (
        <VideoTrack
          trackRef={remoteScreens[0]}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
      {/* Child camera - PIP */}
      {remoteCameras.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12, width: 180, height: 135,
          borderRadius: 8, overflow: 'hidden', border: '2px solid #0f3460',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 10,
        }}>
          <VideoTrack
            trackRef={remoteCameras[0]}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 3 }}>
            아이 카메라
          </div>
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
