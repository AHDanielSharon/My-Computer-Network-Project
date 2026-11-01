import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ChevronLeft,
  Info,
  Loader2,
  Megaphone,
  MessageSquare,
  Phone,
  Pin,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import type { Message } from '../../types';
import { useApp } from '../../context/AppContext';
import { useCall } from '../../context/CallContext';
import { api } from '../../lib/api';
import {
  conversationColor,
  conversationOther,
  conversationTitle,
  cx,
  formatDayLabel,
  formatLastSeen,
  sameDay,
} from '../../lib/utils';
import { Avatar } from '../Avatar';
import { Composer } from './Composer';
import { ConversationInfo } from './ConversationInfo';
import { MessageBubble } from './MessageBubble';

export function ChatView() {
  const {
    activeConversation: conversation,
    messages,
    me,
    users,
    hasMore,
    loadingConversation,
    typingUsers,
    pinnedVersion,
    pendingJump,
    clearPendingJump,
    loadEarlier,
    closeConversation,
    toast,
    connected,
    uploadFiles,
  } = useApp();
  const { startCall } = useCall();

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pinned, setPinned] = useState<Message[]>([]);
  const [pinnedHidden, setPinnedHidden] = useState(false);
  const [announcementHidden, setAnnouncementHidden] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const highlightTimer = useRef<number | null>(null);
  const dragDepth = useRef(0);
  const conversationId = conversation?.id;

  /* pinned messages */
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    api
      .get<{ messages: Message[] }>(`/api/conversations/${encodeURIComponent(conversationId)}/pinned`)
      .then((res) => {
        if (!cancelled) setPinned(res.messages);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, pinnedVersion]);

  useEffect(() => {
    setPinnedHidden(false);
  }, [conversationId, pinnedVersion]);

  useEffect(() => {
    setAnnouncementHidden(false);
  }, [conversationId]);

  /* reset on conversation change */
  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
    setInfoOpen(false);
    stickRef.current = true;
    setAtBottom(true);
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [conversationId]);

  /* keep pinned to bottom */
  useEffect(() => {
    if (!stickRef.current) return;
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, conversationId]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  const flash = (messageId: string) => {
    setHighlightId(messageId);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2200);
  };

  const jumpTo = (messageId: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${messageId}"]`);
    if (!el) {
      toast('That message is outside the loaded history. Scroll up to load more.', { type: 'info' });
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(messageId);
  };

  useEffect(() => {
    if (!pendingJump) return;
    if (!messages.some((m) => m.id === pendingJump.messageId)) return;
    const timer = window.setTimeout(() => {
      jumpTo(pendingJump.messageId);
      clearPendingJump();
    }, 140);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, messages]);

  if (!conversation || !me) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-ink3">
        This conversation is no longer available.
      </div>
    );
  }

  const title = conversationTitle(conversation, me.id, users);
  const other = conversationOther(conversation, me.id);
  const liveOther = other ? users.find((u) => u.id === other.id) : null;
  const groupTyping = typingUsers(conversation.id);
  const typingNames = groupTyping.map((person) => person.name.split(' ')[0]);
  const onlineMembers = conversation.members.filter((member) => member.online).length;

  const subtitle = typingNames.length
    ? typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : `${typingNames.slice(0, 2).join(', ')} are typing…`
    : conversation.type === 'group'
      ? `${conversation.members.length} members · ${onlineMembers} online`
      : liveOther?.online
        ? liveOther.status === 'busy'
          ? 'Busy right now'
          : 'Online now'
        : liveOther
          ? formatLastSeen(liveOther.lastSeen)
          : 'Direct message';

  const loadOlder = async () => {
    const el = scrollRef.current;
    if (!el || loadingEarlier || !hasMore[conversation.id]) return;
    const previousHeight = el.scrollHeight;
    const previousTop = el.scrollTop;
    setLoadingEarlier(true);
    await loadEarlier(conversation.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (node) {
          node.scrollTop = node.scrollHeight - previousHeight + previousTop;
        }
        stickRef.current = false;
        setLoadingEarlier(false);
      });
    });
  };

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickRef.current = true;
    setAtBottom(true);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    if (!connected) {
      toast('You are offline. Reconnect to the Wi-Fi before sending files.', { type: 'error' });
      return;
    }
    await uploadFiles(files, conversation.id, replyTo?.id || null);
    if (replyTo) setReplyTo(null);
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-bg"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropActive(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropActive(false);
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <header className="z-10 flex shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-2 py-2 backdrop-blur sm:px-4">
        <button
          onClick={closeConversation}
          className="icon-btn h-9 w-9 min-[900px]:hidden"
          aria-label="Back to chats"
        >
          <ChevronLeft size={20} />
        </button>
        <button onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar
            name={title}
            color={conversationColor(conversation, me.id, users)}
            group={conversation.type === 'group'}
            userId={liveOther?.id}
            avatarFile={liveOther?.avatarFile}
            online={conversation.type === 'dm' ? liveOther?.online : null}
            busy={liveOther?.status === 'busy'}
            size={42}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-ink">{title}</div>
            <div className={cx('truncate text-[11.5px]', typingNames.length ? 'text-accent' : 'text-ink3')}>
              {subtitle}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void startCall(conversation.id, 'audio')}
            className="icon-btn h-9 w-9"
            title="Voice call"
            aria-label="Voice call"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => void startCall(conversation.id, 'video')}
            className="icon-btn h-9 w-9"
            title="Video call"
            aria-label="Video call"
          >
            <Video size={19} />
          </button>
          <button
            onClick={() => setInfoOpen(true)}
            className={cx('icon-btn h-9 w-9', infoOpen && 'bg-panel3 text-ink')}
            title="Conversation info"
            aria-label="Conversation info"
          >
            <Info size={18} />
          </button>
        </div>
      </header>

      {conversation.type === 'group' && conversation.announcement && !announcementHidden && (
        <div className="flex shrink-0 items-start gap-2 border-b border-accent/15 bg-accentsoft px-3 py-2 sm:px-4 animate-fade-in">
          <Megaphone size={15} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-accent">Announcement</div>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink2">{conversation.announcement}</p>
          </div>
          <button
            onClick={() => setAnnouncementHidden(true)}
            className="icon-btn h-6 w-6 shrink-0"
            aria-label="Hide announcement"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {pinned[0] && !pinnedHidden && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel2/70 px-3 py-1.5 sm:px-4">
          <Pin size={13} className="shrink-0 text-accent" />
          <button onClick={() => jumpTo(pinned[0].id)} className="min-w-0 flex-1 text-left">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent">
              Pinned message
            </span>
            <span className="ml-2 truncate text-[11.5px] text-ink2">
              {pinned[0].senderName}: {pinned[0].body || 'Attachment'}
            </span>
          </button>
          <button
            onClick={() => setPinnedHidden(true)}
            className="icon-btn h-6 w-6 shrink-0"
            aria-label="Hide pinned message"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          stickRef.current = nearBottom;
          setAtBottom(nearBottom);
          if (el.scrollTop < 60 && hasMore[conversation.id] && !loadingEarlier) {
            void loadOlder();
          }
        }}
        className="thin-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink-3) 13%, transparent) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      >
        <div className="mx-auto w-full max-w-[1080px] pb-3 pt-2">
          {loadingConversation && !messages.length && (
            <div className="space-y-4 px-4 py-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cx('flex', i % 2 ? 'justify-end' : 'justify-start')}>
                  <div className="skeleton h-12 rounded-2xl" style={{ width: `${38 + ((i * 13) % 30)}%` }} />
                </div>
              ))}
            </div>
          )}

          {messages.length > 0 && (
            <div className="flex justify-center py-1.5">
              {hasMore[conversation.id] ? (
                <button
                  onClick={() => void loadOlder()}
                  disabled={loadingEarlier}
                  className="chip py-1.5 text-[10.5px] hover:border-line2"
                >
                  {loadingEarlier ? <Loader2 size={12} className="animate-spin" /> : <ArrowDown size={12} className="rotate-180" />}
                  {loadingEarlier ? 'Loading earlier messages…' : 'Load earlier messages'}
                </button>
              ) : (
                <span className="rounded-full bg-panel2/70 px-3 py-1 text-[10px] text-ink3">
                  The beginning of this conversation
                </span>
              )}
            </div>
          )}

          {!loadingConversation && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-line bg-panel text-accent shadow-sm">
                <MessageSquare size={26} />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold text-ink">Say hello</h3>
              <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink2">
                {conversation.type === 'group'
                  ? `This is the start of “${title}”. Send a message, a photo or start a call.`
                  : `This is the start of your conversation with ${title}. Send a message, a photo or start a call.`}
              </p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => void startCall(conversation.id, 'audio')} className="btn-ghost">
                  <Phone size={14} /> Voice call
                </button>
                <button onClick={() => void startCall(conversation.id, 'video')} className="btn-ghost">
                  <Video size={14} /> Video call
                </button>
              </div>
            </div>
          )}

          {messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const showDay = !previous || !sameDay(previous.createdAt, message.createdAt);
            const grouped =
              !!previous &&
              previous.type !== 'system' &&
              message.type !== 'system' &&
              previous.senderId === message.senderId &&
              sameDay(previous.createdAt, message.createdAt) &&
              message.createdAt - previous.createdAt < 5 * 60 * 1000;
            return (
              <div key={message.id}>
                {showDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full border border-line bg-panel/80 px-3 py-1 text-[10px] font-medium text-ink3 backdrop-blur">
                      {formatDayLabel(message.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  meId={me.id}
                  conversation={conversation}
                  users={users}
                  grouped={grouped}
                  highlight={highlightId === message.id}
                  onReply={(target) => {
                    setEditing(null);
                    setReplyTo(target);
                  }}
                  onEdit={(target) => {
                    setReplyTo(null);
                    setEditing(target);
                  }}
                  onJump={jumpTo}
                />
              </div>
            );
          })}
          <div className="h-3" />
        </div>
      </div>

      {typingNames.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 bg-bg/60 px-4 py-1 text-[10.5px] text-ink3">
          <span className="flex items-end gap-[2px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-accent typing-dot"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
          {typingNames.length === 1 ? `${typingNames[0]} is typing` : `${typingNames.slice(0, 2).join(', ')} are typing`}
        </div>
      )}

      {!atBottom && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-[92px] right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel/95 text-ink2 shadow-lg backdrop-blur transition hover:text-ink active:scale-95 sm:bottom-[96px] sm:right-4"
          aria-label="Scroll to latest messages"
        >
          <ArrowDown size={18} />
        </button>
      )}

      <div className="shrink-0">
        <Composer
          conversation={conversation}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
        />
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent/10 backdrop-blur-[2px]">
          <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-accent bg-panel/95 px-10 py-8 shadow-2xl animate-scale-in">
            <UploadCloud size={34} className="text-accent" />
            <div className="mt-3 text-[14px] font-semibold text-ink">Drop to share</div>
            <div className="mt-1 text-[11.5px] text-ink3">Files stay on this network</div>
          </div>
        </div>
      )}

      {infoOpen && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px] animate-fade-in min-[1280px]:hidden"
            onClick={() => setInfoOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[390px] flex-col border-l border-line bg-panel shadow-2xl animate-slide-left">
            <ConversationInfo
              conversation={conversation}
              pinned={pinned}
              onClose={() => setInfoOpen(false)}
              onJump={(messageId) => {
                jumpTo(messageId);
                setInfoOpen(false);
              }}
            />
          </aside>
        </>
      )}
    </div>
  );
}
