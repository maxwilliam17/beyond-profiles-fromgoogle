import React, {useEffect, useRef} from 'react';
import {Mic, MicOff, Phone, PhoneOff, Video, VideoOff} from 'lucide-react';
import type {Profile} from '../lib/types';
import {ProfileAvatar} from './Avatar';

export interface ActiveCallSession {
  callId: string;
  peerId: string;
  peerName: string;
  isVideo: boolean;
  isCaller: boolean;
  ringing: boolean;
  answered: boolean;
  muted: boolean;
  camOff: boolean;
  statusText: string;
  subText: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

interface CallOverlayProps {
  call: ActiveCallSession | null;
  peerProfile?: Profile | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCam: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  call,
  peerProfile,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleCam,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!call) return;
    if (call.isVideo && remoteVideoRef.current && call.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (!call.isVideo && remoteAudioRef.current && call.remoteStream) {
      remoteAudioRef.current.srcObject = call.remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [call, call?.remoteStream, call?.isVideo]);

  useEffect(() => {
    if (!call || !localVideoRef.current) return;
    if (call.isVideo && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
      localVideoRef.current.play().catch(() => {});
    } else {
      localVideoRef.current.srcObject = null;
    }
  }, [call, call?.localStream, call?.isVideo]);

  if (!call) return null;

  const isVideoActive = call.isVideo && !call.ringing;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden select-none"
      style={{
        background: isVideoActive
          ? '#000000'
          : 'radial-gradient(circle at 50% 25%, #34251c 0%, #181615 62%, #110f0e 100%)',
      }}
    >
      {/* Video layers */}
      {call.isVideo && (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`absolute inset-0 w-full h-full object-cover ${isVideoActive ? 'block' : 'hidden'}`}
          />
          {call.localStream && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-4 right-4 mt-safe z-20 w-24 h-36 rounded-2xl object-cover border-2 border-[#FFEBD7]/25 shadow-2xl -scale-x-100 bg-black"
            />
          )}
        </>
      )}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Info */}
      <div
        className={`relative z-10 flex flex-col items-center text-center pt-14 pt-safe px-6 ${
          isVideoActive ? 'bg-gradient-to-b from-black/65 to-transparent pb-8' : ''
        }`}
      >
        <p className="text-sm font-medium text-[#A39B93] tracking-wide tabular-nums">{call.statusText}</p>
        {!isVideoActive && (
          <div className="relative my-8">
            {call.ringing && (
              <span className="absolute -inset-4 rounded-full border-2 border-[#D98A4E]/45 animate-call-ripple" />
            )}
            <ProfileAvatar
              profile={peerProfile || {name: call.peerName, color: 'bg-indigo-500'}}
              sizeClass="w-28 h-28"
              roundedClass="rounded-full"
              textClass="text-3xl font-semibold"
            />
          </div>
        )}
        <h2 className="font-display text-3xl font-semibold text-[#F3EFEA] mt-2">{call.peerName}</h2>
        <p className="text-sm text-[#A39B93] mt-1">{call.subText}</p>
      </div>

      {/* Controls */}
      <div
        className={`relative z-10 pb-12 pb-safe px-6 flex items-center justify-center gap-8 ${
          isVideoActive ? 'bg-gradient-to-t from-black/75 to-transparent pt-8' : ''
        }`}
      >
        {call.ringing && !call.isCaller ? (
          <>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onDecline}
                aria-label="Decline call"
                className="w-16 h-16 rounded-full bg-[#9E5A3C] hover:bg-[#B46846] active:scale-95 text-[#F3EFEA] flex items-center justify-center shadow-xl transition-transform"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs text-[#A39B93]">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onAccept}
                aria-label="Accept call"
                className="w-16 h-16 rounded-full bg-[#5A6E5C] hover:bg-[#6E8570] active:scale-95 text-[#F3EFEA] flex items-center justify-center shadow-xl transition-transform"
              >
                {call.isVideo ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
              </button>
              <span className="text-xs text-[#A39B93]">Accept</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-[#F3EFEA] active:scale-95 transition-all ${
                  call.muted ? 'bg-[#9E5A3C]' : 'bg-[#24201E]/90 border border-[#FFEBD7]/15 hover:bg-[#2E2926]'
                }`}
              >
                {call.muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <span className="text-xs text-[#A39B93]">{call.muted ? 'Unmute' : 'Mute'}</span>
            </div>

            {call.isVideo && (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleCam}
                  aria-label={call.camOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-[#F3EFEA] active:scale-95 transition-all ${
                    call.camOff ? 'bg-[#9E5A3C]' : 'bg-[#24201E]/90 border border-[#FFEBD7]/15 hover:bg-[#2E2926]'
                  }`}
                >
                  {call.camOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
                <span className="text-xs text-[#A39B93]">{call.camOff ? 'Camera off' : 'Camera'}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onEnd}
                aria-label="End call"
                className="w-16 h-16 rounded-full bg-[#9E5A3C] hover:bg-[#B46846] active:scale-95 text-[#F3EFEA] flex items-center justify-center shadow-xl transition-transform"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs text-[#A39B93]">End</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
