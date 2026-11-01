import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { EMOJI_CATEGORIES } from '../lib/emoji';
import { cx } from '../lib/utils';

export function EmojiPicker({
  onPick,
  onClose,
  className,
  quickOnly = false,
}: {
  onPick: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
  quickOnly?: boolean;
}) {
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onClose) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const timer = window.setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const emojis = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const pool = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
      return [...new Set(pool)].filter((e) => e.includes(q) || categoryNameMatch(e, q));
    }
    return EMOJI_CATEGORIES[category]?.emojis || [];
  }, [category, query]);

  if (quickOnly) {
    return (
      <div ref={ref} className={cx('card flex items-center gap-1 p-1.5', className)}>
        {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => onPick(emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-panel3 active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cx(
        'card z-50 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 animate-scale-in',
        className,
      )}
      style={{ transformOrigin: 'bottom left' }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Search size={15} className="text-ink3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an emoji"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink3"
        />
      </div>
      {!query && (
        <div className="flex gap-0.5 border-b border-line px-1.5 py-1">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setCategory(i)}
              title={cat.name}
              className={cx(
                'flex h-8 flex-1 items-center justify-center rounded-lg text-base transition',
                category === i ? 'bg-panel3' : 'hover:bg-panel2 opacity-70',
              )}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}
      <div className="thin-scroll grid max-h-[240px] grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {emojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onPick(emoji)}
            className="flex h-9 items-center justify-center rounded-lg text-[20px] transition hover:bg-panel3 active:scale-90"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
        {!emojis.length && <div className="col-span-8 py-8 text-center text-xs text-ink3">No emoji found</div>}
      </div>
    </div>
  );
}

function categoryNameMatch(_emoji: string, _q: string) {
  return false;
}
