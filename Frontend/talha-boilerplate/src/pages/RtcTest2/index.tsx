// src/pages/RtcTest2/index.tsx

import React, { useState, useEffect } from 'react';
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
  useTracks,
  useConnectionState,
  VideoTrack,
  ControlBar,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

// ============================================================
// CONFIGURATION
// ============================================================
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

// ⚠️ FOR TESTING ONLY - Hardcoded token
// Generate a token from: https://cloud.livekit.io/token-generator
// Or use the one you already have
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkZXZrZXkiLCJzdWIiOiJ0ZXN0LXVzZXIiLCJ2aWRlbyI6eyJyb29tIjoidGVzdC1yb29tIiwicm9vbUpvaW4iOnRydWUsImNhblB1Ymxpc2giOnRydWUsImNhblN1YnNjcmliZSI6dHJ1ZX0sImV4cCI6MTc4NzA2ODM5MywibmJmIjoxNzg3MDY0NzkzLCJpYXQiOjE3ODcwNjQ3OTN9.a9SHgvIU_ZPGrwBeUR9hfz7zqjcGh9rjsT4Z6gL71NQ';

// ============================================================
// VIDEO TILE COMPONENT
// ============================================================
function VideoTile({ participant, isLocal = false }: { participant: any; isLocal?: boolean }) {
  const videoTracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare])
    .filter(track => track.participant.identity === participant.identity)
    .filter(track => track.source === Track.Source.Camera);

  const audioTracks = useTracks([Track.Source.Microphone])
    .filter(track => track.participant.identity === participant.identity);

  const hasVideo = videoTracks.length > 0;
  const hasAudio = audioTracks.length > 0;

  return (
    <div className="card bg-base-100 shadow-xl border border-base-200">
      <div className="card-body p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-sm">
            {isLocal ? '📷 You' : '👤'} {participant.identity || 'Unknown'}
          </span>
          <div className="flex gap-1">
            {hasAudio && <span className="badge badge-success badge-xs">🎤</span>}
            <span className="badge badge-ghost text-xs">
              {isLocal ? 'Local' : 'Remote'}
            </span>
          </div>
        </div>
        <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
          {hasVideo ? (
            videoTracks.map((track) => (
              <VideoTrack
                key={track.publication.trackSid}
                trackRef={track}
                className="w-full h-full object-cover"
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-white/50">
              <div className="text-center">
                <span className="text-4xl block">{isLocal ? '📷' : '👤'}</span>
                <span className="text-sm mt-2 block">
                  {isLocal ? 'Camera off' : 'No video'}
                </span>
              </div>
            </div>
          )}
          
          {/* Connection quality indicator */}
          {participant.connectionQuality && (
            <div className="absolute top-2 left-2">
              <span className={`badge ${
                participant.connectionQuality === 'excellent' ? 'badge-success' :
                participant.connectionQuality === 'good' ? 'badge-warning' :
                'badge-error'
              } badge-xs`}>
                {participant.connectionQuality}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROOM VIEW COMPONENT
// ============================================================
function RoomView({ roomName, identity }: { roomName: string; identity: string }) {
  const participants = useParticipants();
  const localParticipant = useLocalParticipant();
  const connectionState = useConnectionState();
  const tracks = useTracks([
    Track.Source.Camera,
    Track.Source.Microphone,
    Track.Source.ScreenShare,
  ]);

  return (
    <div className="container mx-auto p-4 max-w-7xl min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">🎥 LiveKit Room</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className={`badge ${connectionState === 'connected' ? 'badge-success' : 'badge-warning'}`}>
              {connectionState === 'connected' ? '🟢 Connected' : '⚪ Connecting...'}
            </span>
            <span className="badge badge-ghost">
              {participants.length + 1} participants
            </span>
            <span className="badge badge-ghost">
              📍 {LIVEKIT_URL.replace('ws://', '')}
            </span>
            <span className="badge badge-info">
              🏠 {roomName}
            </span>
            <span className="badge badge-ghost">
              👤 {identity}
            </span>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          <span>📡 {tracks.length} tracks</span>
        </div>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {/* Local Participant */}
        {localParticipant && (
          <VideoTile participant={localParticipant} isLocal={true} />
        )}

        {/* Remote Participants */}
        {participants.map((participant) => (
          <VideoTile key={participant.sid} participant={participant} isLocal={false} />
        ))}

        {/* Empty slot for new participants */}
        {participants.length === 0 && (
          <div className="card bg-base-100 shadow-xl border border-base-200 border-dashed">
            <div className="card-body p-4 flex items-center justify-center h-48">
              <div className="text-center text-gray-500">
                <span className="text-4xl">👥</span>
                <p className="mt-2">Waiting for others to join...</p>
                <p className="text-xs mt-1">Open another browser window</p>
                <div className="mt-2 text-xs text-gray-400">
                  <kbd className="kbd kbd-xs">Ctrl</kbd> + <kbd className="kbd kbd-xs">Shift</kbd> + <kbd className="kbd kbd-xs">N</kbd>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
        <ControlBar
          controls={{
            microphone: true,
            camera: true,
            screenShare: true,
            leave: true,
          }}
          variation="minimal"
        />
      </div>

      {/* Audio Renderer */}
      <RoomAudioRenderer />

      {/* Status Bar */}
      <div className="mt-4 p-2 bg-base-200 rounded-lg text-xs text-gray-500">
        <div className="flex flex-wrap gap-4">
          <span>🔗 Connection: {connectionState}</span>
          <span>👥 Participants: {participants.length + 1}</span>
          <span>📡 Tracks: {tracks.length}</span>
          <span>📍 Server: {LIVEKIT_URL}</span>
          <span>🎯 Room: {roomName}</span>
          <span>👤 Identity: {identity}</span>
        </div>
        <div className="mt-1 text-xs text-gray-400 flex flex-wrap gap-2">
          {tracks.map((t, i) => (
            <span key={i} className="badge badge-ghost badge-xs">
              {t.source}: {t.participant.identity}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
function RtcTest2() {
  const [roomName, setRoomName] = useState('test-room');
  const [identity, setIdentity] = useState(`user-${Math.floor(Math.random() * 1000)}`);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // CONNECT TO ROOM
  // ============================================================
  const connectToRoom = () => {
    setError(null);
    setIsConnected(true);
    console.log('✅ Connecting to room:', roomName);
    console.log('👤 Identity:', identity);
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (error) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="alert alert-error shadow-lg">
          <div>
            <span>❌ {error}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
        <button 
          className="btn btn-ghost mt-2" 
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h1 className="text-3xl font-bold mb-2">🎥 LiveKit Test</h1>
            <p className="text-gray-500 mb-6">
              Connect to your local LiveKit server at <code className="badge badge-ghost">localhost:7880</code>
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Server URL</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered bg-gray-100"
                  value={LIVEKIT_URL}
                  disabled
                />
                <label className="label">
                  <span className="label-text-alt text-success">✅ Local server</span>
                </label>
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Room Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Enter room name"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Your Identity</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="Enter your name"
                />
                <label className="label">
                  <span className="label-text-alt text-info">🎲 Random ID generated</span>
                </label>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Token</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    className="input input-bordered flex-1 bg-gray-100 text-xs"
                    value={`${TEST_TOKEN.substring(0, 40)}...`}
                    disabled
                  />
                </div>
                <label className="label">
                  <span className="label-text-alt text-success">✅ Token hardcoded for testing</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button 
                className="btn btn-primary" 
                onClick={connectToRoom}
              >
                🚀 Connect to Room
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={() => {
                  const newIdentity = `user-${Math.floor(Math.random() * 1000)}`;
                  setIdentity(newIdentity);
                }}
              >
                🎲 Random User
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={() => {
                  window.open('https://cloud.livekit.io/token-generator', '_blank');
                }}
              >
                🔑 Get New Token
              </button>
            </div>

            <div className="mt-4 text-sm bg-base-200 p-4 rounded-lg">
              <p className="font-semibold">📋 How it works:</p>
              <ol className="list-decimal list-inside text-gray-600 space-y-1 mt-1">
                <li>Token is <strong>hardcoded</strong> in the component for testing</li>
                <li>Uses API Key: <code className="badge badge-ghost">devkey</code></li>
                <li>Uses API Secret: <code className="badge badge-ghost">secret</code></li>
                <li>⚠️ <span className="text-warning">This is for testing only!</span></li>
                <li>Open another browser window with a different identity</li>
                <li>Both will connect to the same room</li>
                <li>You'll see each other's video/audio!</li>
              </ol>
            </div>

            <div className="mt-2 text-xs text-gray-400">
              <p>💡 Tip: Use different identities to test multi-user (e.g., "user1", "user2")</p>
              <p>🔑 Token expires in 1 hour. Generate a new one if needed.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // CONNECTED VIEW
  // ============================================================
  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={TEST_TOKEN}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={() => {
        setIsConnected(false);
        console.log('Disconnected from room');
      }}
      onError={(err) => {
        setError(err.message);
        console.error('Room error:', err);
      }}
    >
      <RoomView roomName={roomName} identity={identity} />
    </LiveKitRoom>
  );
}

export default RtcTest2;