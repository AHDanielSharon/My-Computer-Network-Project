import { useState } from 'react';
import { MessageSquare, Phone, Video } from 'lucide-react';
import type { User } from '../types';
import { useApp } from '../context/AppContext';
import { useCall } from '../context/CallContext';
import { Modal } from './Modal';
import { UserAvatar } from './Avatar';
import { formatFullDate, formatLastSeen } from '../lib/utils';

export function UserProfileModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { me, users, createDm } = useApp();
  const { startCall } = useCall();
  const [busy, setBusy] = useState(false);

  const live = user ? users.find((u) => u.id === user.id) || user : null;
  const isMe = !!live && live.id === me?.id;

  const message = async () => {
    if (!live) return;
    setBusy(true);
    const conv = await createDm(live.id);
    setBusy(false);
    if (conv) onClose();
  };

  const call = async (kind: 'audio' | 'video') => {
    if (!live) return;
    setBusy(true);
    const conv = await createDm(live.id);
    setBusy(false);
    if (!conv) return;
    onClose();
    void startCall(conv.id, kind);
  };

  return (
    <Modal open={!!live} onClose={onClose} size="sm" hideClose className="overflow-hidden">
      {live && (
        <div className="relative pb-1">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-accent/25 via-accent2/15 to-transparent" />
          <div className="relative flex flex-col items-center pt-8">
            <div className="rounded-full bg-panel p-1.5 shadow-lg">
              <UserAvatar user={live} size={92} />
            </div>
            <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">{live.name}</h2>
            <div className="mt-1 text-[12.5px] text-ink2">
              {live.online ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-online" />
                  {live.status === 'busy' ? 'Busy right now' : 'Online now'}
                </span>
              ) : (
                formatLastSeen(live.lastSeen)
              )}
            </div>
            {live.about && (
              <p className="mt-3 max-w-[300px] text-center text-[13px] leading-relaxed text-ink2">“{live.about}”</p>
            )}
          </div>

          <div className="relative mt-6 space-y-2 rounded-2xl border border-line bg-panel2 p-3.5 text-[12.5px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink3">Status</span>
              <span className="font-medium text-ink">
                {live.online ? (live.status === 'busy' ? 'Busy' : 'Online') : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink3">Joined the network</span>
              <span className="font-medium text-ink">{formatFullDate(live.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink3">Connection</span>
              <span className="font-medium text-ink">Local Wi-Fi</span>
            </div>
          </div>

          {isMe ? (
            <div className="mt-4 rounded-xl border border-line bg-panel2 px-3.5 py-3 text-center text-[12.5px] text-ink2">
              This is you. Edit your profile from Settings.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => void message()} disabled={busy} className="btn-primary px-2 py-2.5 text-[12.5px]">
                <MessageSquare size={15} /> Message
              </button>
              <button
                onClick={() => void call('audio')}
                disabled={busy}
                className="btn-ghost px-2 py-2.5 text-[12.5px]"
              >
                <Phone size={15} /> Voice
              </button>
              <button
                onClick={() => void call('video')}
                disabled={busy}
                className="btn-ghost px-2 py-2.5 text-[12.5px]"
              >
                <Video size={15} /> Video
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
