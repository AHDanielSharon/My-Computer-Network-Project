import { useMemo, useState } from 'react';
import { Check, Forward, Search } from 'lucide-react';
import type { Message } from '../types';
import { useApp } from '../context/AppContext';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { conversationColor, conversationTitle, cx, messagePreview } from '../lib/utils';

export function ForwardModal({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const { conversations, me, forwardMessage } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    if (!me) return [];
    const q = query.trim().toLowerCase();
    return conversations
      .map((conv) => ({ conv, title: conversationTitle(conv, me.id, []) }))
      .filter(({ conv, title }) => {
        const localTitle =
          conv.type === 'group'
            ? conv.name || 'Group'
            : conv.members.find((m) => m.id !== me.id)?.name || 'Direct message';
        return (
          !q ||
          title.toLowerCase().includes(q) ||
          localTitle.toLowerCase().includes(q)
        );
      });
  }, [conversations, me, query]);

  const close = () => {
    if (busy) return;
    setSelected([]);
    setQuery('');
    onClose();
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const run = async () => {
    if (!message || !selected.length) return;
    setBusy(true);
    const count = await forwardMessage(message.id, selected);
    setBusy(false);
    if (count) {
      setSelected([]);
      setQuery('');
      onClose();
    }
  };

  return (
    <Modal
      open={!!message}
      onClose={close}
      title="Forward message"
      subtitle="Choose one or more chats to share this with."
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink3">{selected.length ? `${selected.length} chat${selected.length === 1 ? '' : 's'}` : 'Select a chat'}</span>
          <button onClick={() => void run()} disabled={!selected.length || busy} className="btn-primary">
            <Forward size={15} /> {busy ? 'Forwarding…' : 'Forward'}
          </button>
        </div>
      }
    >
      {message && (
        <div className="rounded-xl border border-line bg-panel2 px-3.5 py-2.5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink3">
            {message.senderName}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-ink2">{messagePreview(message, me?.id || '')}</div>
        </div>
      )}

      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          className="field pl-10"
          autoFocus
        />
      </div>

      <div className="mt-2 -mx-1 max-h-[340px] space-y-0.5 overflow-y-auto thin-scroll px-1">
        {me &&
          list.map(({ conv }) => {
            const title = conversationTitle(conv, me.id, conv.members);
            const active = selected.includes(conv.id);
            return (
              <button
                key={conv.id}
                onClick={() => toggle(conv.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition',
                  active ? 'bg-accentsoft' : 'hover:bg-panel2',
                )}
              >
                <Avatar
                  name={title}
                  color={conversationColor(conv, me.id, conv.members)}
                  group={conv.type === 'group'}
                  size={38}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{title}</div>
                  <div className="text-[11.5px] text-ink3">
                    {conv.type === 'group' ? `${conv.members.length} members` : 'Direct message'}
                  </div>
                </div>
                <span
                  className={cx(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    active ? 'border-accent bg-accent text-white' : 'border-line2',
                  )}
                >
                  {active && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        {!list.length && (
          <div className="py-8 text-center text-[12.5px] text-ink3">No chats match that search.</div>
        )}
      </div>
    </Modal>
  );
}
