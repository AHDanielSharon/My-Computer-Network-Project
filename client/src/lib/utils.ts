import type { Conversation, Message, User } from '../types';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(ts: number) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function formatCallDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function sameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function formatDayLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(ts, now.getTime())) return 'Today';
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (sameDay(ts, yesterday.getTime())) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

export function formatListTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(ts, now.getTime())) return formatTime(ts);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (sameDay(ts, yesterday.getTime())) return 'Yesterday';
  if (now.getTime() - ts < 7 * 86_400_000) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function formatFullDate(ts: number) {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${formatTime(ts)}`;
}

export function formatLastSeen(ts: number) {
  if (!ts) return 'Offline';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Last seen just now';
  if (diff < 3_600_000) return `Last seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `Last seen ${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return `Last seen ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number) {
  if (!bytesPerSecond) return '';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function conversationTitle(conv: Conversation, meId: string, users: User[]) {
  if (conv.type === 'group') return conv.name || 'Group';
  const other = conv.members.find((m) => m.id !== meId);
  return users.find((u) => u.id === other?.id)?.name || other?.name || 'Direct message';
}

export function conversationOther(conv: Conversation, meId: string) {
  if (conv.type === 'group') return null;
  return conv.members.find((m) => m.id !== meId) || null;
}

export function conversationColor(conv: Conversation, meId: string, users: User[]) {
  if (conv.type === 'group') return conv.avatarColor || '#f59e0b';
  const other = conversationOther(conv, meId);
  const user = users.find((u) => u.id === other?.id);
  return user?.avatarColor || other?.avatarColor || '#f59e0b';
}

export function isEmojiOnly(text: string) {
  const cleaned = text.trim();
  if (!cleaned) return false;
  const noEmoji = cleaned.replace(/[\p{Extended_Pictographic}\u200d\uFE0F\s]/gu, '');
  return noEmoji.length === 0 && [...cleaned.replace(/\s/g, '')].length <= 12;
}

export function messagePreview(message: Message | null, meId: string) {
  if (!message) return 'No messages yet';
  if (message.deletedAt) return 'Message deleted';
  if (message.type === 'system') return message.body || 'Activity';
  const prefix = message.senderId === meId ? 'You: ' : '';
  switch (message.type) {
    case 'image':
      return `${prefix}📷 Photo${message.body ? ` · ${message.body}` : ''}`;
    case 'video':
      return `${prefix}🎬 Video${message.body ? ` · ${message.body}` : ''}`;
    case 'voice':
      return `${prefix}🎙️ Voice message`;
    case 'audio':
      return `${prefix}🎵 Audio · ${message.meta?.name || 'Audio file'}`;
    case 'file':
      return `${prefix}📄 ${message.meta?.name || 'Document'}`;
    case 'location':
      return `${prefix}📍 Shared location`;
    case 'call':
      return `${prefix}${message.meta?.kind === 'video' ? '🎥' : '📞'} ${
        message.meta?.status === 'missed'
          ? 'Missed call'
          : message.meta?.status === 'rejected'
            ? 'Call declined'
            : 'Call'
      }${message.meta?.duration ? ` · ${formatCallDuration(message.meta.duration)}` : ''}`;
    default:
      return `${prefix}${message.body || ''}`;
  }
}

export function truncate(text: string, max = 80) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function linkParts(text: string) {
  const parts: { type: 'text' | 'link'; value: string }[] = [];
  const re = /(https?:\/\/[^\s]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'link', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => {
    const at = a.lastMessage?.createdAt || a.createdAt;
    const bt = b.lastMessage?.createdAt || b.createdAt;
    return bt - at;
  });
}

export function isReadByEveryone(message: Message, conv: Conversation, meId: string) {
  if (message.senderId !== meId) return false;
  const others = conv.members.filter((m) => m.id !== meId);
  if (!others.length) return false;
  return others.every((m) => m.lastReadAt >= message.createdAt + 1);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Night owl mode';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const AVATAR_COLORS = [
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#84cc16',
  '#f97316',
  '#14b8a6',
];
