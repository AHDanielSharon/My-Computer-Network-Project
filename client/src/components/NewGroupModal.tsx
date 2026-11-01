import { useMemo, useState, type FormEvent } from 'react';
import { Check, Search, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal } from './Modal';
import { UserAvatar } from './Avatar';
import { AVATAR_COLORS, cx, getInitials } from '../lib/utils';

export function NewGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { users, me, createGroup } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[8]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => u.id !== me?.id)
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }, [users, me?.id, query]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reset = () => {
    setName('');
    setSelected([]);
    setQuery('');
    setColor(AVATAR_COLORS[8]);
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || !selected.length || busy) return;
    setBusy(true);
    const conv = await createGroup(name.trim(), selected, color);
    if (conv) {
      reset();
      onClose();
    } else {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New group"
      subtitle="Bring a few people together for a shared conversation."
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink3">
            {selected.length ? `${selected.length} selected` : 'Choose at least one person'}
          </span>
          <button
            onClick={(e) => void submit(e)}
            disabled={busy || name.trim().length < 2 || !selected.length}
            className="btn-primary"
          >
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[20px] font-semibold text-white ring-4 ring-panel"
          style={{ background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 55%, #0b0e14))` }}
        >
          {name.trim() ? getInitials(name) : <Users size={26} />}
        </div>
        <div className="min-w-0 flex-1">
          <label className="section-label" htmlFor="group-name">
            Group name
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 50))}
            placeholder="e.g. Flat 3B"
            className="field mt-1.5"
            autoFocus
          />
        </div>
      </div>

      <div className="mt-4">
        <span className="section-label">Colour</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              className={cx('relative h-7 w-7 rounded-full transition hover:scale-110', color === swatch && 'scale-110')}
              style={{ background: swatch }}
              aria-label={`Group colour ${swatch}`}
            >
              {color === swatch && (
                <span className="absolute inset-0 flex items-center justify-center text-white">
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const person = users.find((u) => u.id === id);
            if (!person) return null;
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="chip bg-accentsoft text-accent"
                title="Remove"
              >
                {person.name} <span className="text-[13px] leading-none">×</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="field pl-10"
        />
      </div>

      <div className="mt-2 -mx-1 max-h-[300px] space-y-0.5 overflow-y-auto thin-scroll px-1">
        {people.map((person) => {
          const active = selected.includes(person.id);
          return (
            <button
              key={person.id}
              onClick={() => toggle(person.id)}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition',
                active ? 'bg-accentsoft' : 'hover:bg-panel2',
              )}
            >
              <UserAvatar user={person} size={38} showStatus={false} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">{person.name}</div>
                <div className="truncate text-[12px] text-ink3">
                  {person.online ? (person.status === 'busy' ? 'Busy' : 'Online') : 'Offline'}
                </div>
              </div>
              <span
                className={cx(
                  'flex h-5 w-5 items-center justify-center rounded-full border transition',
                  active ? 'border-accent bg-accent text-white' : 'border-line2',
                )}
              >
                {active && <Check size={13} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {!people.length && (
          <div className="py-8 text-center text-[12.5px] text-ink3">
            No one else is available yet. Invite people to the network first.
          </div>
        )}
      </div>
    </Modal>
  );
}
