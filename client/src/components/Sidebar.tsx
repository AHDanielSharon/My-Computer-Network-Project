import { useEffect, useMemo, useState } from 'react';
import {
  BellOff,
  Check,
  MessageSquare,
  QrCode,
  Search,
  SquarePen,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import type { Conversation } from '../types';
import { Avatar, UserAvatar } from './Avatar';
import {
  conversationColor,
  conversationOther,
  conversationTitle,
  cx,
  formatListTime,
  isEmojiOnly,
  messagePreview,
} from '../lib/utils';

export function Sidebar() {
  const {
    me,
    users,
    conversations,
    activeId,
    nav,
    openConversation,
    createDm,
    typingUsers,
    searchState,
    runGlobalSearch,
    clearGlobalSearch,
    jumpToMessage,
    connected,
  } = useApp();
  const { openNewChat, openInvite } = useUi();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');

  const filtered = useMemo(() => {
    if (!me) return conversations;
    const q = query.trim().toLowerCase();
    return conversations.filter((conv) => {
      if (filter === 'unread' && conv.unread === 0) return false;
      if (filter === 'groups' && conv.type !== 'group') return false;
      if (!q) return true;
      const title = conversationTitle(conv, me.id, users);
      const other = conversationOther(conv, me.id);
      return (
        title.toLowerCase().includes(q) ||
        (other?.name || '').toLowerCase().includes(q) ||
        (conv.lastMessage?.body || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, users, me, query, filter]);

  const matchingPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !me) return [];
    return users
      .filter((u) => u.id !== me.id && u.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [users, query, me]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      if (searchState) clearGlobalSearch();
      return;
    }
    const timer = window.setTimeout(() => {
      void runGlobalSearch(q);
    }, 420);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const searching = query.trim().length >= 2;

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight text-ink">Chats</h1>
          <p className="mt-0.5 text-[11.5px] text-ink3">
            {conversations.reduce((sum, c) => sum + c.unread, 0)} unread · {users.filter((u) => u.online).length} online
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={openInvite} className="icon-btn h-9 w-9" title="Invite people" aria-label="Invite people">
            <QrCode size={17} />
          </button>
          <button
            onClick={openNewChat}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-accentsoft px-3 text-[12px] font-semibold text-accent transition hover:brightness-105 active:scale-95"
            title="New conversation"
          >
            <SquarePen size={15} /> New
          </button>
        </div>
      </div>

      {!connected && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-[11.5px] font-medium text-danger">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-danger" />
          Reconnecting to the local server…
        </div>
      )}

      <div className="px-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats and messages"
            className="field h-10 py-0 pl-9 pr-8 text-[12.5px]"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                clearGlobalSearch();
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink3 hover:bg-panel3 hover:text-ink"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
        {(
          [
            { id: 'all' as const, label: 'All' },
            { id: 'unread' as const, label: 'Unread' },
            { id: 'groups' as const, label: 'Groups' },
          ]
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={cx(
              'shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition',
              filter === item.id ? 'bg-ink text-bg' : 'bg-panel2 text-ink2 hover:bg-panel3',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {searching ? (
          <div className="px-1">
            {searchState?.loading && (
              <div className="flex items-center gap-2 px-2 py-3 text-[12px] text-ink3">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Searching messages…
              </div>
            )}

            {matchingPeople.length > 0 && (
              <div className="mb-3">
                <div className="section-label px-2 pb-1 pt-2">People</div>
                {matchingPeople.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => void createDm(person.id).then(() => setQuery(''))}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-panel2"
                  >
                    <UserAvatar user={person} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-ink">{person.name}</div>
                      <div className="text-[11px] text-ink3">{person.online ? 'Online' : 'Offline'}</div>
                    </div>
                    <MessageSquare size={14} className="text-ink3" />
                  </button>
                ))}
              </div>
            )}

            {searchState && searchState.results.length > 0 && (
              <div>
                <div className="section-label px-2 pb-1 pt-2">Messages</div>
                {searchState.results.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => void jumpToMessage(result).then(() => setQuery(''))}
                    className="mb-0.5 w-full rounded-xl px-2 py-2 text-left transition hover:bg-panel2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink">{result.conversationTitle}</span>
                      <span className="shrink-0 text-[10.5px] text-ink3">{formatListTime(result.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink2">
                      <span className="font-medium text-ink3">{result.senderName}: </span>
                      {highlight(result.body || '', searchState.query)}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {searchState && !searchState.loading && !searchState.results.length && !matchingPeople.length && (
              <div className="px-3 py-10 text-center text-[12px] text-ink3">
                No messages or people match “{searchState.query}”.
              </div>
            )}
          </div>
        ) : (
          <>
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                active={activeId === conv.id && nav === 'chats'}
                meId={me?.id || ''}
                users={users}
                typing={typingUsers(conv.id)
                  .map((t) => t.name.split(' ')[0])
                  .join(', ')}
                onClick={() => openConversation(conv.id)}
              />
            ))}
            {!filtered.length && (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-panel2 text-ink3">
                  <MessageSquare size={22} />
                </div>
                <div className="mt-3 text-[13px] font-medium text-ink">No conversations here</div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-ink3">
                  {filter === 'unread'
                    ? 'You are all caught up.'
                    : filter === 'groups'
                      ? 'Create a group to chat with several people at once.'
                      : 'Start a new chat with someone on this Wi-Fi.'}
                </div>
              </div>
            )}
            <button
              onClick={openNewChat}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line2 py-2.5 text-[12px] font-medium text-ink3 transition hover:border-accent/50 hover:text-accent"
            >
              <Users size={14} /> Start a new conversation
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  meId,
  users,
  typing,
  onClick,
}: {
  conv: Conversation;
  active: boolean;
  meId: string;
  users: ReturnType<typeof useApp>['users'];
  typing: string;
  onClick: () => void;
}) {
  const other = conversationOther(conv, meId);
  const liveOther = other ? users.find((u) => u.id === other.id) : null;
  const title = conversationTitle(conv, meId, users);
  const color = conversationColor(conv, meId, users);
  const last = conv.lastMessage;
  const preview = typing
    ? `${typing} is typing…`
    : last
      ? messagePreview(last, meId)
      : 'No messages yet';

  return (
    <button
      onClick={onClick}
      className={cx(
        'group mb-0.5 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition',
        active ? 'bg-accentsoft' : 'hover:bg-panel2',
      )}
    >
      <Avatar
        name={title}
        color={color}
        group={conv.type === 'group'}
        userId={liveOther?.id}
        avatarFile={liveOther?.avatarFile}
        online={conv.type === 'dm' ? liveOther?.online : null}
        busy={liveOther?.status === 'busy'}
        size={48}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cx(
              'truncate text-[13.5px]',
              conv.unread ? 'font-semibold text-ink' : 'font-medium text-ink',
            )}
          >
            {title}
            {conv.type === 'group' && conv.isDefault && (
              <span className="ml-1.5 align-middle text-[9.5px] font-semibold uppercase tracking-wide text-ink3">
                everyone
              </span>
            )}
          </span>
          <span
            className={cx(
              'shrink-0 text-[10.5px]',
              conv.unread ? 'font-semibold text-accent' : 'text-ink3',
            )}
          >
            {last ? formatListTime(last.createdAt) : ''}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {typing ? (
            <span className="truncate text-[12px] font-medium text-accent">{preview}</span>
          ) : last?.deletedAt ? (
            <span className="truncate text-[12px] italic text-ink3">{preview}</span>
          ) : last && isEmojiOnly(last.body || '') ? (
            <span className="truncate text-[13.5px] leading-5">{last.body}</span>
          ) : (
            <span
              className={cx(
                'truncate text-[12px]',
                conv.unread ? 'font-medium text-ink2' : 'text-ink3',
              )}
            >
              {preview}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {conv.muted && <BellOff size={12} className="text-ink3" />}
            {conv.unread > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {conv.unread > 99 ? '99+' : conv.unread}
              </span>
            )}
            {conv.unread === 0 && last?.senderId === meId && last && (
              <Check size={12} className="text-ink3/70" />
            )}
          </span>
        </div>
      </div>
    </button>
  );
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}
