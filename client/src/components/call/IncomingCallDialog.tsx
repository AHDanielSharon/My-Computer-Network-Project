import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Video, Volume2 } from 'lucide-react';
import { useCall } from '../../context/CallContext';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../Avatar';

export function IncomingCallDialog() {
  const { incoming, acceptIncoming, rejectIncoming } = useCall();
  const { users } = useApp();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
  }, [incoming?.callId]);

  useEffect(() => {
    if (!incoming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') rejectIncoming();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [incoming, rejectIncoming]);

  if (!incoming) return null;

  const isGroup = incoming.conversationType === 'group';
  const callerOnline = users.find((u) => u.id === incoming.caller.id)?.online ?? true;
  const kindLabel = incoming.kind === 'video' ? 'Video call' : 'Voice call';

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await acceptIncoming();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm animate-fade-in sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Incoming ${incoming.kind} call`}
        className="relative w-full max-w-[380px] overflow-hidden rounded-[28px] border border-line bg-panel p-6 text-center shadow-2xl animate-scale-in"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60"
          style={{ background: 'radial-gradient(420px 180px at 50% 0%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 70%)' }}
        />

        <div className="relative flex flex-col items-center">
          <div className="flex items-center gap-2 rounded-full bg-accentsoft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            {incoming.kind === 'video' ? <Video size={13} /> : <Phone size={13} />}
            Incoming {kindLabel.toLowerCase()}
          </div>

          <div className="relative mt-7">
            <span className="absolute -inset-3 rounded-full border border-accent/30 animate-pulse-ring" />
            <span className="absolute -inset-1.5 rounded-full border border-accent/20" />
            <Avatar
              name={incoming.caller.name}
              color={incoming.caller.avatarColor}
              userId={incoming.caller.id}
              avatarFile={incoming.caller.avatarFile}
              size={104}
              online={callerOnline}
              ring
            />
          </div>

          <div className="mt-5 text-[20px] font-bold leading-tight text-ink">{incoming.caller.name}</div>
          <div className="mt-1.5 text-[13px] font-medium text-ink2">
            {isGroup ? (
              <>
                Group {kindLabel.toLowerCase()} in <span className="font-semibold text-ink">{incoming.conversationTitle}</span>
              </>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <Volume2 size={13} className="animate-pulse text-accent" />
                Calling you on Lantern
              </span>
            )}
          </div>

          <div className="mt-8 flex w-full items-start justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={rejectIncoming}
                aria-label="Decline call"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/25 transition hover:brightness-110 active:scale-95"
              >
                <PhoneOff size={24} />
              </button>
              <span className="text-[11px] font-semibold text-ink3">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={accept}
                disabled={busy}
                aria-label="Accept call"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-online text-white shadow-lg shadow-online/25 transition hover:brightness-110 active:scale-95 disabled:opacity-70"
              >
                {busy ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Phone size={24} />
                )}
              </button>
              <span className="text-[11px] font-semibold text-ink3">{busy ? 'Connecting…' : 'Accept'}</span>
            </div>
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-ink3">
            {incoming.kind === 'video'
              ? 'Your camera and microphone will turn on when you accept.'
              : 'Your microphone will turn on when you accept.'}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
