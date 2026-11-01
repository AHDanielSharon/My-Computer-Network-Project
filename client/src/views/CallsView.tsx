import { useMemo, useState } from 'react';
import { ArrowUpRight, Phone, PhoneMissed, RefreshCw, Video } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCall } from '../context/CallContext';
import { EmptyState } from '../components/EmptyState';
import { Avatar, UserAvatar } from '../components/Avatar';
import {
  conversationColor,
  conversationTitle,
  cx,
  formatCallDuration,
  formatListTime,
} from '../lib/utils';

export function CallsView() {
  const { callHistory, refreshCalls, conversations, users, me, openConversation, toast } = useApp();
  const { startCall, call } = useCall();
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const calls = useMemo(
    () =>
      callHistory.filter((entry) =>
        filter === 'missed' ? entry.status === 'missed' || entry.status === 'rejected' : true,
      ),
    [callHistory, filter],
  );

  const missedCount = useMemo(
    () => callHistory.filter((c) => c.status === 'missed' || c.status === 'rejected').length,
    [callHistory],
  );

  const refresh = async () => {
    setRefreshing(true);
    await refreshCalls();
    setRefreshing(false);
  };

  const callBack = async (conversationId: string, kind: 'audio' | 'video') => {
    if (call) {
      toast('You are already in a call.', { type: 'info' });
      return;
    }
    if (!conversations.some((c) => c.id === conversationId)) {
      toast('That conversation is no longer available.', { type: 'error' });
      return;
    }
    await startCall(conversationId, kind);
  };

  const quickChats = useMemo(
    () =>
      conversations
        .filter((c) => c.type === 'dm')
        .slice(0, 6),
    [conversations],
  );

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink3">Calls</div>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">Call history</h1>
            <p className="mt-1 text-[13px] text-ink2">
              {callHistory.length} calls · {missedCount} missed · direct peer-to-peer over Wi-Fi
            </p>
          </div>
          <button onClick={() => void refresh()} disabled={refreshing} className="btn-ghost">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {quickChats.length > 0 && (
          <section className="mt-5 rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">Start a call</h2>
              <span className="text-[11px] text-ink3">Tap a person to ring them</span>
            </div>
            <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto pb-1">
              {quickChats.map((conv) => {
                const other = conv.members.find((m) => m.id !== me?.id);
                const live = users.find((u) => u.id === other?.id);
                const title = conversationTitle(conv, me?.id || '', users);
                return (
                  <div key={conv.id} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                    {live ? (
                      <UserAvatar user={live} size={46} />
                    ) : (
                      <Avatar
                        name={title}
                        color={conversationColor(conv, me?.id || '', users)}
                        size={46}
                      />
                    )}
                    <span className="w-full truncate text-center text-[11px] font-medium text-ink2">
                      {title.split(' ')[0]}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void callBack(conv.id, 'audio')}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-online/10 text-online transition hover:bg-online/20"
                        title="Voice call"
                      >
                        <Phone size={11} />
                      </button>
                      <button
                        onClick={() => void callBack(conv.id, 'video')}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-accentsoft text-accent transition hover:brightness-105"
                        title="Video call"
                      >
                        <Video size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-5 flex items-center gap-1 rounded-xl border border-line bg-panel p-1 w-fit">
          {(
            [
              { id: 'all' as const, label: 'All calls' },
              { id: 'missed' as const, label: `Missed (${missedCount})` },
            ]
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-[12px] font-semibold transition',
                filter === item.id ? 'bg-ink text-bg' : 'text-ink2 hover:bg-panel2',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {calls.length ? (
          <div className="mt-3 divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-panel">
            {calls.map((entry) => {
              const missed = entry.status === 'missed' || entry.status === 'rejected';
              const exists = conversations.some((c) => c.id === entry.conversationId);
              const fromMe = entry.initiatorId === me?.id;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={cx(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      missed ? 'bg-danger/10 text-danger' : 'bg-online/10 text-online',
                    )}
                  >
                    {missed ? <PhoneMissed size={17} /> : entry.kind === 'video' ? <Video size={17} /> : <Phone size={17} />}
                  </div>
                  <button
                    onClick={() => exists && openConversation(entry.conversationId)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cx('truncate text-[13px] font-semibold', missed ? 'text-danger' : 'text-ink')}>
                        {entry.conversationTitle}
                      </span>
                      <span className="chip shrink-0 py-0 text-[9.5px] uppercase tracking-wide">
                        {entry.kind}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink3">
                      <span>
                        {fromMe ? 'Outgoing' : 'Incoming'} ·{' '}
                        {entry.status === 'rejected'
                          ? 'Declined'
                          : entry.status === 'missed'
                            ? 'Missed'
                            : entry.duration
                              ? formatCallDuration(entry.duration)
                              : 'Not answered'}
                      </span>
                      <span>·</span>
                      <span>{formatListTime(entry.startedAt)}</span>
                      {entry.participants.length > 1 && (
                        <>
                          <span>·</span>
                          <span>{entry.participants.length} people</span>
                        </>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void callBack(entry.conversationId, 'audio')}
                      disabled={!exists}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-ink disabled:opacity-40"
                      title="Call back"
                    >
                      <Phone size={14} />
                    </button>
                    <button
                      onClick={() => void callBack(entry.conversationId, 'video')}
                      disabled={!exists}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-ink disabled:opacity-40"
                      title="Video call"
                    >
                      <Video size={14} />
                    </button>
                    <button
                      onClick={() => exists && openConversation(entry.conversationId)}
                      disabled={!exists}
                      className="hidden h-8 w-8 items-center justify-center rounded-lg bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-ink disabled:opacity-40 sm:flex"
                      title="Open chat"
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Phone}
            title={filter === 'missed' ? 'No missed calls' : 'No calls yet'}
            description={
              filter === 'missed'
                ? 'You have answered everything.'
                : 'Start a voice or video call from a chat, or tap someone above.'
            }
          />
        )}

        <div className="mt-4 rounded-2xl border border-line bg-panel p-4 text-[11.5px] leading-relaxed text-ink3">
          Calls use a direct WebRTC connection between devices. The local server only helps the two devices find
          each other — audio and video never travel through the cloud. For best quality, keep both devices on the
          same Wi-Fi access point.
        </div>
      </div>
    </div>
  );
}
