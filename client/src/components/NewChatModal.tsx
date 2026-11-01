import { useMemo, useState } from 'react';
import { MessageSquarePlus, Search, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal } from './Modal';
import { UserAvatar } from './Avatar';
import { cx, formatLastSeen } from '../lib/utils';

export function NewChatModal({
  open,
  onClose,
  onCreateGroup,
}: {
  open: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
}) {
  const { users, me, createDm } = useApp();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => u.id !== me?.id)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.about.toLowerCase().includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }, [users, me?.id, query]);

  const start = async (userId: string) => {
    setBusyId(userId);
    const conv = await createDm(userId);
    setBusyId(null);
    if (conv) {
      setQuery('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New conversation"
      subtitle="Send a direct message to someone on this network."
      size="md"
      footer={
        <button onClick={onCreateGroup} className="btn-ghost w-full">
          <Users size={16} /> Create a group instead
        </button>
      }
    >
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="field pl-10"
          autoFocus
        />
      </div>

      <div className="mt-3 -mx-1 max-h-[380px] space-y-0.5 overflow-y-auto thin-scroll px-1">
        {people.map((person) => (
          <button
            key={person.id}
            onClick={() => void start(person.id)}
            disabled={!!busyId}
            className={cx(
              'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-panel2 disabled:opacity-60',
              busyId === person.id && 'bg-panel2',
            )}
          >
            <UserAvatar user={person} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold text-ink">{person.name}</span>
                {person.id === me?.id && <span className="chip py-0 text-[10px]">You</span>}
              </div>
              <div className="truncate text-[12px] text-ink3">
                {person.online
                  ? person.status === 'busy'
                    ? 'Busy'
                    : 'Online now'
                  : formatLastSeen(person.lastSeen)}
              </div>
            </div>
            {busyId === person.id ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <MessageSquarePlus size={17} className="text-ink3" />
            )}
          </button>
        ))}
        {!people.length && (
          <div className="py-10 text-center text-[12.5px] text-ink3">
            {query ? 'No one matches that search.' : 'No one else is on this network yet. Invite someone!'}
          </div>
        )}
      </div>
    </Modal>
  );
}
