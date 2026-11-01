import { useMemo, useState } from 'react';
import { MessageSquare, Phone, Search, UserPlus, Users, Video } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCall } from '../context/CallContext';
import { useUi } from '../context/UiContext';
import { UserAvatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { cx, formatLastSeen } from '../lib/utils';

export function PeopleView() {
  const { users, me, createDm, onlineCount } = useApp();
  const { startCall } = useCall();
  const { openInvite, openProfile } = useUi();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'online'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => (filter === 'online' ? u.online : true))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.about.toLowerCase().includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }, [users, query, filter]);

  const message = async (userId: string) => {
    setBusy(userId);
    await createDm(userId);
    setBusy(null);
  };

  const call = async (userId: string, kind: 'audio' | 'video') => {
    setBusy(userId);
    const conv = await createDm(userId);
    setBusy(null);
    if (conv) void startCall(conv.id, kind);
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink3">Directory</div>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">People</h1>
            <p className="mt-1 text-[13px] text-ink2">
              {onlineCount} online · {users.length} on this network
            </p>
          </div>
          <button onClick={openInvite} className="btn-ghost">
            <UserPlus size={16} /> Invite someone
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              className="field h-10 py-0 pl-9 text-[12.5px]"
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-line bg-panel p-1">
            {(
              [
                { id: 'all' as const, label: 'Everyone' },
                { id: 'online' as const, label: 'Online' },
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
        </div>

        {list.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((person) => {
              const isMe = person.id === me?.id;
              return (
                <div
                  key={person.id}
                  className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-4 transition hover:border-line2"
                >
                  <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/5 blur-xl" />
                  <div className="relative flex items-start gap-3">
                    <UserAvatar user={person} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openProfile(person)}
                          className="truncate text-[14px] font-semibold text-ink hover:underline"
                        >
                          {person.name}
                        </button>
                        {isMe && <span className="chip py-0 text-[10px]">You</span>}
                      </div>
                      <div className="text-[11.5px] text-ink3">
                        {person.online
                          ? person.status === 'busy'
                            ? 'Busy right now'
                            : 'Online now'
                          : formatLastSeen(person.lastSeen)}
                      </div>
                      <div className="mt-1 line-clamp-2 min-h-[16px] text-[11.5px] leading-relaxed text-ink2">
                        {person.about || 'No status message'}
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-3 flex items-center gap-1.5">
                    {isMe ? (
                      <div className="text-[11.5px] text-ink3">
                        {person.online ? 'This device is connected.' : 'Offline'}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => void message(person.id)}
                          disabled={busy === person.id}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accentsoft py-1.5 text-[11.5px] font-semibold text-accent transition hover:brightness-105"
                        >
                          <MessageSquare size={13} /> Message
                        </button>
                        <button
                          onClick={() => void call(person.id, 'audio')}
                          disabled={busy === person.id}
                          className="flex h-8 w-9 items-center justify-center rounded-lg bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-ink"
                          title="Voice call"
                        >
                          <Phone size={14} />
                        </button>
                        <button
                          onClick={() => void call(person.id, 'video')}
                          disabled={busy === person.id}
                          className="flex h-8 w-9 items-center justify-center rounded-lg bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-ink"
                          title="Video call"
                        >
                          <Video size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No one matches that search"
            description={
              query
                ? 'Try a different name or clear the search.'
                : 'Invite people to this Wi-Fi so they appear here.'
            }
            action={
              <button onClick={openInvite} className="btn-primary">
                <UserPlus size={15} /> Invite people
              </button>
            }
          />
        )}
      </div>
    </div>
  );
}
