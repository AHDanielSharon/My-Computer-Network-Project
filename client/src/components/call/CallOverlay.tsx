import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  SwitchCamera,
  Video,
  VideoOff,
  WifiOff,
} from 'lucide-react';
import { useCall, type CallPeer } from '../../context/CallContext';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../Avatar';
import { conversationColor, conversationTitle, cx, formatClock } from '../../lib/utils';
import type { User } from '../../types';

function StreamVideo({
  stream,
  muted,
  mirrored,
  className,
  contain,
}: {
  stream: MediaStream;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
  contain?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cx(contain ? 'object-contain' : 'object-cover', className)}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function peerHasVideo(peer: CallPeer, kind: 'audio' | 'video') {
  if (kind !== 'video' || !peer.stream) return false;
  if (!peer.media.video && !peer.media.screen) return false;
  return peer.stream.getVideoTracks().length > 0;
}

function PeerTile({ peer, kind, users }: { peer: CallPeer; kind: 'audio' | 'video'; users: User[] }) {
  const user = users.find((u) => u.id === peer.userId);
  const showVideo = peerHasVideo(peer, kind);

  return (
    <div className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      {showVideo && peer.stream ? (
        <StreamVideo
          stream={peer.stream}
          muted
          contain={peer.media.screen}
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 p-4">
          <Avatar
            name={peer.name}
            color={user?.avatarColor || '#f59e0b'}
            userId={peer.userId}
            avatarFile={user?.avatarFile}
            size={96}
            className={cx(!peer.connected && 'animate-pulse')}
          />
          <div className="text-[15px] font-semibold text-white/90">{peer.name}</div>
          {!peer.connected && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/50">
              <WifiOff size={13} /> Connecting…
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 via-black/10 to-transparent px-3.5 pb-3 pt-8">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-white drop-shadow">{peer.name}</span>
          {peer.media.screen && (
            <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80">
              Screen
            </span>
          )}
        </div>
      </div>

      {!peer.media.audio && (
        <span className="pointer-events-none absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur">
          <MicOff size={13} />
        </span>
      )}
    </div>
  );
}

export function CallOverlay() {
  const { call, endCall, toggleMute, toggleCamera, flipCamera, toggleScreenShare, canShareScreen } = useCall();
  const { conversations, users, me } = useApp();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!call) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [call?.id, call?.connectedAt]);

  useEffect(() => {
    if (!call) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endCall();
      if (event.key.toLowerCase() === 'm' && !event.metaKey && !event.ctrlKey) toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [call, endCall, toggleMute]);

  if (!call) return null;

  const conversation = conversations.find((c) => c.id === call.conversationId) || null;
  const title = conversation
    ? conversationTitle(conversation, me?.id || '', users)
    : call.peers[0]?.name || 'Call';
  const color = conversation ? conversationColor(conversation, me?.id || '', users) : '#f59e0b';
  const isGroup = conversation?.type === 'group' || call.peers.length > 1;
  const connectedSeconds = call.connectedAt ? (now - call.connectedAt) / 1000 : 0;
  const allConnected = call.peers.length > 0 && call.peers.every((p) => p.connected);
  const showTimer = call.status === 'active' && allConnected;
  const localVideo =
    call.kind === 'video' &&
    !!call.localPreview &&
    (call.screenSharing || (call.cameraOn && call.localPreview.getVideoTracks().length > 0));

  const subtitle =
    call.status === 'ringing'
      ? 'Ringing…'
      : call.peers.length === 0
        ? 'Waiting for others to join…'
        : showTimer
          ? formatClock(connectedSeconds)
          : 'Connecting…';

  const cols =
    call.peers.length <= 1
      ? 'grid-cols-1'
      : call.peers.length <= 4
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-2 lg:grid-cols-3';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex h-dvh flex-col overflow-hidden bg-[#070a10] text-white animate-fade-in">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(900px 520px at 12% -10%, rgba(255,139,76,0.20), transparent 60%), radial-gradient(700px 520px at 92% 110%, rgba(56,110,220,0.18), transparent 60%)',
        }}
      />

      <header className="relative z-10 flex items-center gap-3 px-4 pb-2 pt-[max(.9rem,env(safe-area-inset-top))] sm:px-6">
        <Avatar
          name={isGroup ? title : call.peers[0]?.name || title}
          color={color}
          userId={isGroup ? null : call.peers[0]?.userId}
          avatarFile={isGroup ? null : users.find((u) => u.id === call.peers[0]?.userId)?.avatarFile}
          group={isGroup}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight text-white">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-white/55">
            {call.kind === 'video' ? <Video size={12} /> : <Phone size={12} />}
            <span className="capitalize">{call.kind} call</span>
            <span className="text-white/25">·</span>
            <span className={cx(call.status === 'ringing' && 'animate-pulse')}>{subtitle}</span>
          </div>
        </div>
        {isGroup && call.peers.length > 0 && (
          <span className="chip border-white/10 bg-white/10 text-white/70">
            {call.peers.length + 1} on call
          </span>
        )}
      </header>

      <main className="relative z-10 min-h-0 flex-1 px-3 pb-2 pt-2 sm:px-6">
        {call.peers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="relative">
              <span className="absolute inset-0 rounded-full border border-white/15 animate-pulse-ring" />
              <Avatar name={title} color={color} group={isGroup} size={132} />
            </div>
            <div>
              <div className="text-lg font-semibold">{title}</div>
              <div className="mt-1 text-[13px] text-white/55">
                {call.status === 'ringing' ? 'Waiting for an answer…' : 'Waiting for others to join…'}
              </div>
            </div>
          </div>
        ) : call.kind === 'audio' ? (
          <div className="flex h-full flex-col items-center justify-center gap-8">
            <div className="flex max-w-full flex-wrap items-center justify-center gap-6 px-4">
              {call.peers.map((peer) => {
                const user = users.find((u) => u.id === peer.userId);
                return (
                  <div key={peer.userId} className="flex w-[120px] flex-col items-center gap-2.5">
                    <div className="relative">
                      {!peer.connected && (
                        <span className="absolute -inset-2 rounded-full border border-white/10 animate-pulse-ring" />
                      )}
                      <Avatar
                        name={peer.name}
                        color={user?.avatarColor || '#f59e0b'}
                        userId={peer.userId}
                        avatarFile={user?.avatarFile}
                        size={112}
                      />
                      {!peer.media.audio && (
                        <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white ring-2 ring-[#070a10]">
                          <MicOff size={13} />
                        </span>
                      )}
                    </div>
                    <div className="w-full truncate text-center text-[13px] font-medium text-white/80">
                      {peer.name}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/40">
              <span className={cx('h-1.5 w-1.5 rounded-full bg-emerald-400', call.status === 'active' && 'animate-blink')} />
              {showTimer ? formatClock(connectedSeconds) : 'Audio call'}
            </div>
          </div>
        ) : (
          <div className={cx('grid h-full auto-rows-fr gap-2 sm:gap-3', cols)}>
            {call.peers.map((peer) => (
              <PeerTile key={peer.userId} peer={peer} kind={call.kind} users={users} />
            ))}
          </div>
        )}

        {call.kind === 'video' && call.peers.length > 0 && (
          <div className="absolute bottom-3 right-3 z-20 w-28 overflow-hidden rounded-2xl border border-white/15 bg-black/60 shadow-2xl sm:bottom-5 sm:right-8 sm:w-44">
            <div className="relative aspect-[3/4] w-full sm:aspect-video">
              {localVideo && call.localPreview ? (
                <StreamVideo
                  stream={call.localPreview}
                  muted
                  mirrored={call.facing === 'user' && !call.screenSharing}
                  contain={call.screenSharing}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/5">
                  <Avatar name={me?.name || 'You'} color={me?.avatarColor || '#f59e0b'} userId={me?.id} avatarFile={me?.avatarFile} size={46} />
                  <span className="text-[10px] font-medium text-white/50">
                    {call.screenSharing ? 'Sharing' : 'Camera off'}
                  </span>
                </div>
              )}
              <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white/80 drop-shadow">You</span>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-2.5 px-4 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-2 sm:gap-4 sm:pb-7">
        <ControlButton
          label={call.muted ? 'Unmute' : 'Mute'}
          active={call.muted}
          tone="danger"
          onClick={toggleMute}
        >
          {call.muted ? <MicOff size={22} /> : <Mic size={22} />}
        </ControlButton>

        {call.kind === 'video' && (
          <ControlButton
            label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
            active={!call.cameraOn}
            tone="danger"
            onClick={toggleCamera}
          >
            {call.cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
          </ControlButton>
        )}

        {call.kind === 'video' && !call.screenSharing && (
          <ControlButton label="Switch camera" onClick={() => void flipCamera()}>
            <SwitchCamera size={22} />
          </ControlButton>
        )}

        {call.kind === 'video' && canShareScreen && (
          <ControlButton
            label={call.screenSharing ? 'Stop sharing' : 'Share screen'}
            active={call.screenSharing}
            tone="accent"
            onClick={() => void toggleScreenShare()}
          >
            {call.screenSharing ? <ScreenShareOff size={22} /> : <ScreenShare size={22} />}
          </ControlButton>
        )}

        <button
          onClick={endCall}
          aria-label="End call"
          title="End call"
          className="ml-1 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition hover:brightness-110 active:scale-95 sm:h-16 sm:w-16"
        >
          <PhoneOff size={24} />
        </button>
      </footer>

      {call.peers.map((peer) => (peer.stream ? <RemoteAudio key={peer.userId} stream={peer.stream} /> : null))}
    </div>,
    document.body,
  );
}

function ControlButton({
  children,
  label,
  onClick,
  active,
  tone = 'neutral',
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: 'neutral' | 'danger' | 'accent';
}) {
  return (
    <div className="flex w-14 flex-col items-center gap-1.5 sm:w-16">
      <button
        onClick={onClick}
        aria-label={label}
        title={label}
        className={cx(
          'flex h-[52px] w-[52px] items-center justify-center rounded-full transition active:scale-95 sm:h-[58px] sm:w-[58px]',
          active
            ? tone === 'accent'
              ? 'bg-accent text-white'
              : 'bg-white text-[#0b0e14]'
            : tone === 'danger'
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-white/10 text-white hover:bg-white/20',
        )}
      >
        {children}
      </button>
      <span className="hidden max-w-full truncate text-[10px] font-medium text-white/45 sm:block">{label}</span>
    </div>
  );
}
