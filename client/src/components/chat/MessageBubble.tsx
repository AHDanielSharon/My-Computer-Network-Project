import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  FileText,
  Forward,
  MapPin,
  Music,
  Pause,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Play,
  Reply,
  SmilePlus,
  Trash2,
  UserRound,
  Video,
  X,
} from 'lucide-react';
import type { Conversation, Message, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { useCall } from '../../context/CallContext';
import { useUi } from '../../context/UiContext';
import { fileUrl } from '../../lib/api';
import { QUICK_REACTIONS } from '../../lib/emoji';
import {
  cx,
  formatBytes,
  formatCallDuration,
  formatClock,
  formatFullDate,
  formatTime,
  isEmojiOnly,
  isReadByEveryone,
  linkParts,
} from '../../lib/utils';
import { UserAvatar } from '../Avatar';
import { ConfirmDialog } from '../ConfirmDialog';

interface Props {
  message: Message;
  meId: string;
  conversation: Conversation;
  users: User[];
  grouped: boolean;
  highlight?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onJump: (messageId: string) => void;
}

export function MessageBubble({
  message,
  meId,
  conversation,
  users,
  grouped,
  highlight,
  onReply,
  onEdit,
  onJump,
}: Props) {
  const { reactToMessage, pinMessage, deleteMessage, toast } = useApp();
  const { openForward, openImage, openProfile } = useUi();
  const { startCall } = useCall();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef<number | null>(null);

  if (message.type === 'system') {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="max-w-[85%] rounded-full border border-line bg-panel2/80 px-3 py-1 text-center text-[11px] leading-relaxed text-ink3">
          {message.body}
        </span>
      </div>
    );
  }

  const mine = message.senderId === meId;
  const sender = users.find((u) => u.id === message.senderId);
  const deleted = !!message.deletedAt;
  const read = mine && isReadByEveryone(message, conversation, meId);
  const canModerate = conversation.myRole === 'admin' && conversation.type === 'group';

  const clearPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse' || deleted) return;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      setSheetOpen(true);
      try {
        navigator.vibrate?.(12);
      } catch {}
    }, 450);
  };

  const copyText = async () => {
    if (!message.body) return;
    try {
      await navigator.clipboard.writeText(message.body);
      toast('Message copied.', { type: 'success' });
    } catch {
      toast('Could not copy the message.', { type: 'error' });
    }
    setSheetOpen(false);
  };

  const closeSheet = () => setSheetOpen(false);

  return (
    <div
      data-mid={message.id}
      className={cx(
        'group/msg flex gap-2 px-3 sm:px-5',
        mine ? 'justify-end' : 'justify-start',
        grouped ? 'mt-0.5' : 'mt-2.5',
        highlight && 'rounded-2xl bg-accent/5 py-1 transition-colors',
      )}
    >
      {!mine && (
        <div className="w-7 shrink-0 self-end pb-1">
          {!grouped && (
            <button
              onClick={() => sender && openProfile(sender)}
              className="transition hover:opacity-80"
              title={message.senderName}
            >
              <UserAvatar
                user={
                  sender || {
                    id: message.senderId,
                    name: message.senderName,
                    avatarColor: message.senderColor,
                    avatarFile: null,
                    about: '',
                    status: 'online',
                    online: true,
                    lastSeen: 0,
                    createdAt: 0,
                  }
                }
                size={28}
                showStatus={false}
              />
            </button>
          )}
        </div>
      )}

      <div className={cx('relative flex min-w-0 max-w-[85%] flex-col sm:max-w-[72%]', mine ? 'items-end' : 'items-start')}>
        {!mine && conversation.type === 'group' && !grouped && (
          <button
            onClick={() => sender && openProfile(sender)}
            className="mb-0.5 ml-1 text-[11px] font-semibold hover:underline"
            style={{ color: sender?.avatarColor || message.senderColor }}
          >
            {message.senderName}
          </button>
        )}

        <div className="relative max-w-full">
          {!deleted && (
            <div
              className={cx(
                'absolute -top-3.5 z-10 hidden items-center gap-0.5 rounded-full border border-line bg-panel/95 p-0.5 shadow-sm backdrop-blur group-hover/msg:flex',
                mine ? 'right-1' : 'left-1',
              )}
            >
              <button
                onClick={() => onReply(message)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink2 transition hover:bg-panel3 hover:text-ink"
                title="Reply"
              >
                <Reply size={12} />
              </button>
              <button
                onClick={() => setSheetOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink2 transition hover:bg-panel3 hover:text-ink"
                title="More"
              >
                <SmilePlus size={12} />
              </button>
            </div>
          )}

          <div
            onPointerDown={startPress}
            onPointerUp={clearPress}
            onPointerCancel={clearPress}
            onPointerMove={clearPress}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!deleted) setSheetOpen(true);
            }}
            onDoubleClick={() => !deleted && reactToMessage(message.id, '❤️')}
            className={cx(
              'relative max-w-full select-text text-[13.5px] leading-relaxed',
              deleted
                ? 'bubble-in rounded-2xl px-3 py-2 italic text-ink3'
                : isEmojiOnly(message.body || '') && !message.meta?.fileId
                  ? 'rounded-2xl px-1 py-0.5 text-[30px] leading-tight'
                  : cx(
                      mine ? 'own-bubble msg-out' : 'bubble-in msg-in',
                      message.meta?.fileId ? 'p-1.5' : 'px-3 py-2',
                    ),
            )}
          >
            {deleted ? (
              <span>This message was deleted</span>
            ) : (
              <>
                {message.forwardedFrom && (
                  <div className="mb-1 flex items-center gap-1 px-0.5 text-[10.5px] italic opacity-70">
                    <Forward size={11} /> Forwarded from {message.forwardedFrom}
                  </div>
                )}
                {message.replyPreview && (
                  <button
                    onClick={() => onJump(message.replyPreview!.id)}
                    className={cx(
                      'mb-1.5 flex w-full max-w-[300px] items-center gap-2 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition',
                      mine ? 'border-black/30 bg-black/10' : 'border-accent bg-accent/5 hover:bg-accent/10',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cx('truncate text-[10.5px] font-semibold', mine ? 'text-black/70' : 'text-accent')}>
                        {message.replyPreview.senderName}
                      </div>
                      <div className={cx('truncate text-[11px]', mine ? 'text-black/60' : 'text-ink3')}>
                        {replyPreviewText(message)}
                      </div>
                    </div>
                  </button>
                )}

                <MessageContent
                  message={message}
                  mine={mine}
                  onImage={openImage}
                  onOpenProfile={openProfile}
                  onCall={(kind) => void startCall(message.conversationId, kind)}
                  onJump={onJump}
                />

                <div
                  className={cx(
                    'mt-0.5 flex items-center justify-end gap-1 text-[9.5px]',
                    mine ? 'text-black/55' : 'text-ink3',
                    message.meta?.fileId && 'px-1 pb-0.5',
                  )}
                >
                  {message.pinnedAt && <Pin size={9.5} />}
                  {message.editedAt && <span className="italic">edited</span>}
                  <span title={formatFullDate(message.createdAt)}>{formatTime(message.createdAt)}</span>
                  {mine && (read ? <CheckCheck size={12} className="opacity-90" /> : <Check size={12} className="opacity-60" />)}
                </div>
              </>
            )}
          </div>

          {message.reactions.length > 0 && (
            <div className={cx('mt-1 flex flex-wrap gap-1', mine ? 'justify-end' : 'justify-start')}>
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => reactToMessage(message.id, reaction.emoji)}
                  className={cx(
                    'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition active:scale-95',
                    reaction.mine
                      ? 'border-accent/40 bg-accentsoft text-accent'
                      : 'border-line bg-panel text-ink2 hover:bg-panel2',
                  )}
                  title={reaction.userIds
                    .map((id) => users.find((u) => u.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                >
                  <span>{reaction.emoji}</span>
                  <span className="font-semibold">{reaction.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {sheetOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[88] flex items-end justify-center sm:items-center sm:p-6"
            onMouseDown={closeSheet}
          >
            <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" />
            <div
              className="relative w-full overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl animate-slide-up sm:max-w-sm sm:rounded-3xl sm:animate-scale-in"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
                <span className="text-[12.5px] font-semibold text-ink">Message actions</span>
                <button onClick={closeSheet} className="icon-btn h-7 w-7" aria-label="Close">
                  <X size={15} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-1 border-b border-line/70 px-3 py-2">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      reactToMessage(message.id, emoji);
                      closeSheet();
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px] transition hover:bg-panel3 active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="max-h-[46vh] overflow-y-auto p-1.5">
                <SheetAction icon={Reply} label="Reply" onClick={() => { onReply(message); closeSheet(); }} />
                {message.body && <SheetAction icon={Copy} label="Copy text" onClick={() => void copyText()} />}
                {['text', 'image', 'video', 'audio', 'voice', 'file', 'location'].includes(message.type) && (
                  <SheetAction
                    icon={Forward}
                    label="Forward"
                    onClick={() => {
                      openForward(message);
                      closeSheet();
                    }}
                  />
                )}
                <SheetAction
                  icon={message.pinnedAt ? PinOff : Pin}
                  label={message.pinnedAt ? 'Unpin message' : 'Pin message'}
                  onClick={() => {
                    pinMessage(message.id);
                    closeSheet();
                  }}
                />
                {mine && message.type === 'text' && (
                  <SheetAction
                    icon={Pencil}
                    label="Edit message"
                    onClick={() => {
                      onEdit(message);
                      closeSheet();
                    }}
                  />
                )}
                {!mine && sender && (
                  <SheetAction
                    icon={UserRound}
                    label={`View ${sender.name}`}
                    onClick={() => {
                      openProfile(sender);
                      closeSheet();
                    }}
                  />
                )}
                {(mine || canModerate) && (
                  <SheetAction
                    icon={Trash2}
                    label="Delete message"
                    danger
                    onClick={() => {
                      closeSheet();
                      setConfirmDelete(true);
                    }}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this message?"
        description="It will be removed for everyone in this chat."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await deleteMessage(message.id);
        }}
      />
    </div>
  );
}

function SheetAction({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: ComponentType<{ size?: number | string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-panel2',
      )}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function replyPreviewText(message: Message) {
  const preview = message.replyPreview;
  if (!preview) return '';
  if (preview.deleted) return 'Message deleted';
  if (preview.type === 'image') return '📷 Photo';
  if (preview.type === 'video') return '🎬 Video';
  if (preview.type === 'voice') return '🎙️ Voice message';
  if (preview.type === 'file') return `📄 ${preview.fileName || 'Document'}`;
  if (preview.type === 'location') return '📍 Shared location';
  if (preview.type === 'call') return '📞 Call';
  return preview.body || 'Message';
}

function MessageContent({
  message,
  mine,
  onImage,
  onOpenProfile,
  onCall,
  onJump,
}: {
  message: Message;
  mine: boolean;
  onImage: (image: { src: string; name: string; downloadUrl?: string }) => void;
  onOpenProfile: (user: User) => void;
  onCall: (kind: 'audio' | 'video') => void;
  onJump: (id: string) => void;
}) {
  const meta = message.meta;
  const fileId = meta?.fileId;

  if (message.type === 'image' && fileId) {
    return (
      <div>
        <button
          onClick={() =>
            onImage({ src: fileUrl(fileId, true), name: meta?.name || 'Photo', downloadUrl: fileUrl(fileId) })
          }
          className="block overflow-hidden rounded-xl bg-checker"
        >
          <img
            src={fileUrl(fileId, true)}
            alt={meta?.name || 'Photo'}
            loading="lazy"
            className="max-h-[320px] w-auto max-w-full object-cover transition hover:brightness-[1.02]"
            style={
              meta?.width && meta?.height
                ? { aspectRatio: `${meta.width} / ${meta.height}`, width: Math.min(320, meta.width) }
                : undefined
            }
          />
        </button>
        {message.body && <p className="px-1.5 pt-1.5 text-[13px] leading-snug">{message.body}</p>}
      </div>
    );
  }

  if (message.type === 'video' && fileId) {
    return (
      <div>
        <video
          src={fileUrl(fileId, true)}
          controls
          playsInline
          preload="metadata"
          className="max-h-[340px] w-full min-w-[220px] rounded-xl bg-black"
        />
        {message.body && <p className="px-1.5 pt-1.5 text-[13px] leading-snug">{message.body}</p>}
      </div>
    );
  }

  if ((message.type === 'voice' || message.type === 'audio') && fileId) {
    return (
      <div className="min-w-[210px] px-1 py-0.5">
        {message.type === 'audio' && (
          <div className={cx('mb-1.5 flex items-center gap-1.5 text-[11px] font-medium', mine ? 'text-black/70' : 'text-ink2')}>
            <Music size={12} /> <span className="truncate">{meta?.name || 'Audio'}</span>
          </div>
        )}
        <AudioPlayer
          src={fileUrl(fileId, true)}
          duration={meta?.duration || 0}
          mine={mine}
          voice={message.type === 'voice'}
        />
      </div>
    );
  }

  if (message.type === 'file' && fileId) {
    return (
      <div className={cx('flex min-w-[230px] max-w-[320px] items-center gap-2.5 rounded-xl p-1', mine ? 'text-ink' : 'text-ink')}>
        <div
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            mine ? 'bg-black/10 text-black/70' : 'bg-accent/10 text-accent',
          )}
        >
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">{meta?.name || 'Document'}</div>
          <div className={cx('text-[10.5px]', mine ? 'text-black/55' : 'text-ink3')}>
            {formatBytes(meta?.size || 0)}
          </div>
        </div>
        <a
          href={fileUrl(fileId)}
          download={meta?.name}
          className={cx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
            mine ? 'bg-black/10 text-black/70 hover:bg-black/15' : 'bg-panel2 text-ink2 hover:bg-panel3 hover:text-ink',
          )}
          title="Download"
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={14} />
        </a>
      </div>
    );
  }

  if (message.type === 'location' && meta?.lat != null && meta?.lng != null) {
    const lat = meta.lat;
    const lng = meta.lng;
    const label = meta.label || 'Shared location';
    return (
      <div className="min-w-[230px] max-w-[300px] p-1">
        <div className={cx('relative mb-2 flex h-20 items-center justify-center overflow-hidden rounded-xl', mine ? 'bg-black/10' : 'bg-panel2')}>
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'linear-gradient(color-mix(in srgb, var(--ink-3) 30%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--ink-3) 30%, transparent) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}
          />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white shadow-lg">
            <MapPin size={18} />
          </span>
        </div>
        <div className="px-0.5">
          <div className="text-[12px] font-semibold">{label}</div>
          <div className={cx('text-[10.5px]', mine ? 'text-black/55' : 'text-ink3')}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
            {meta.accuracy ? ` · ±${Math.round(meta.accuracy)}m` : ''}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${lat}, ${lng}`);
                } catch {}
              }}
              className={cx(
                'flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold transition',
                mine ? 'bg-black/10 hover:bg-black/15' : 'bg-panel2 hover:bg-panel3',
              )}
            >
              <Copy size={11} /> Copy
            </button>
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
              target="_blank"
              rel="noreferrer"
              className={cx(
                'flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold transition',
                mine ? 'bg-black/10 hover:bg-black/15' : 'bg-panel2 hover:bg-panel3',
              )}
            >
              <MapPin size={11} /> Open map
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (message.type === 'call') {
    const status = meta?.status;
    const label =
      status === 'missed'
        ? 'Missed call'
        : status === 'rejected'
          ? 'Call declined'
          : meta?.duration
            ? `Call ended · ${formatCallDuration(meta.duration)}`
            : 'Call';
    return (
      <div className="min-w-[220px] max-w-[300px] p-1">
        <div className="flex items-center gap-2.5">
          <div
            className={cx(
              'flex h-9 w-9 items-center justify-center rounded-full',
              status === 'missed' || status === 'rejected'
                ? 'bg-danger/15 text-danger'
                : mine
                  ? 'bg-black/10 text-black/70'
                  : 'bg-online/10 text-online',
            )}
          >
            {meta?.kind === 'video' ? <Video size={16} /> : <Phone size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold">{meta?.kind === 'video' ? 'Video call' : 'Voice call'}</div>
            <div className={cx('text-[10.5px]', mine ? 'text-black/55' : 'text-ink3')}>
              {label}
              {meta?.participantCount && meta.participantCount > 2 ? ` · ${meta.participantCount} people` : ''}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onCall('audio')}
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full transition',
                mine ? 'bg-black/10 hover:bg-black/15' : 'bg-panel2 hover:bg-panel3',
              )}
              title="Call back"
            >
              <Phone size={12} />
            </button>
            <button
              onClick={() => onCall('video')}
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full transition',
                mine ? 'bg-black/10 hover:bg-black/15' : 'bg-panel2 hover:bg-panel3',
              )}
              title="Video call back"
            >
              <Video size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const body = message.body || '';
  if (isEmojiOnly(body)) return <span className="select-text">{body}</span>;

  return (
    <p className="whitespace-pre-wrap break-words px-0.5">
      {linkParts(body).map((part, index) =>
        part.type === 'link' ? (
          <a
            key={index}
            href={part.value}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cx(
              'underline decoration-1 underline-offset-2',
              mine ? 'text-black/80 hover:text-black' : 'text-accent hover:brightness-110',
            )}
          >
            {part.value}
          </a>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </p>
  );
}

function AudioPlayer({
  src,
  duration,
  mine,
  voice,
}: {
  src: string;
  duration: number;
  mine: boolean;
  voice: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration || 0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (event: ReactMouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setCurrent(ratio * total);
  };

  const ratio = total ? current / total : 0;
  const bars = 26;

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <button
        onClick={toggle}
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95',
          mine ? 'bg-black/15 text-black/80 hover:bg-black/20' : 'bg-accent text-white hover:brightness-105',
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        {voice && !total && <div className="text-[10px] opacity-70">Voice message</div>}
        <div
          className="flex h-6 cursor-pointer items-center gap-[2px]"
          onClick={seek}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
        >
          {Array.from({ length: bars }).map((_, i) => {
            const height = 7 + Math.abs(Math.sin((i + 1) * 1.7 + (total || 1) * 0.13)) * 15;
            const active = i / bars <= ratio;
            return (
              <span
                key={i}
                className={cx(
                  'flex-1 rounded-full transition-colors',
                  active
                    ? mine
                      ? 'bg-black/60'
                      : 'bg-accent'
                    : mine
                      ? 'bg-black/20'
                      : 'bg-ink3/25',
                )}
                style={{ height }}
              />
            );
          })}
        </div>
        <div className={cx('flex justify-between text-[9.5px]', mine ? 'text-black/55' : 'text-ink3')}>
          <span>{formatClock(current)}</span>
          <span>{voteLabel(voice, total)}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const value = e.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setTotal(value);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
    </div>
  );
}

function voteLabel(voice: boolean, total: number) {
  if (!total) return voice ? '–:––' : '';
  return formatClock(total);
}
