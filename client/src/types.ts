export type UserStatus = 'online' | 'busy' | 'offline';

export interface User {
  id: string;
  name: string;
  about: string;
  avatarFile: string | null;
  avatarColor: string;
  status: 'online' | 'busy';
  online: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface Member extends User {
  role: 'admin' | 'member';
  lastReadAt: number;
  joinedAt: number;
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'file'
  | 'location'
  | 'call'
  | 'system';

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
}

export interface ReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  body: string | null;
  deleted: boolean;
  fileName: string | null;
}

export interface FileMeta {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

export interface MessageMeta {
  fileId?: string;
  name?: string;
  mime?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  label?: string;
  callId?: string;
  kind?: 'audio' | 'video';
  status?: 'ended' | 'missed' | 'rejected';
  participantCount?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  type: MessageType;
  body: string | null;
  meta: MessageMeta | null;
  replyTo: string | null;
  replyPreview: ReplyPreview | null;
  forwardedFrom: string | null;
  editedAt: number | null;
  deletedAt: number | null;
  pinnedAt: number | null;
  pinnedBy: string | null;
  createdAt: number;
  reactions: Reaction[];
  conversationTitle?: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  name: string | null;
  avatarColor: string | null;
  announcement: string | null;
  createdBy: string | null;
  createdAt: number;
  isDefault: boolean;
  members: Member[];
  lastMessage: Message | null;
  unread: number;
  muted: boolean;
  myRole: 'admin' | 'member';
  lastReadAt: number;
}

export interface FileItem {
  id: string;
  messageId: string | null;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: number;
  ownerId: string;
  ownerName: string;
  conversationId: string;
  conversationTitle: string;
  conversationType: 'dm' | 'group';
}

export interface CallParticipantLog {
  userId: string;
  status: string;
  name: string;
  joinedAt: number | null;
}

export interface CallRecord {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationType: 'dm' | 'group';
  initiatorId: string;
  initiatorName: string;
  kind: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'rejected';
  startedAt: number;
  answeredAt: number | null;
  endedAt: number | null;
  duration: number;
  participants: CallParticipantLog[];
}

export interface CallParticipant {
  userId: string;
  name: string;
  joinedAt: number;
  media: { audio: boolean; video: boolean; screen: boolean };
}

export interface LiveCall {
  id: string;
  conversationId: string;
  kind: 'audio' | 'video';
  initiatorId: string;
  startedAt: number;
  status: 'ringing' | 'active';
  participants: CallParticipant[];
}

export interface IncomingCall {
  callId: string;
  conversationId: string;
  conversationTitle: string;
  conversationType: 'dm' | 'group';
  kind: 'audio' | 'video';
  caller: User;
  startedAt: number;
}

export interface ServerInfo {
  app: string;
  version: string;
  https: boolean;
  urls: { label: string; url: string }[];
  primaryUrl: string;
  qr: string | null;
  qrs: { url: string; qr: string }[];
  time: number;
}

export interface BootstrapResponse {
  user: User;
  users: User[];
  conversations: Conversation[];
  callHistory: CallRecord[];
  recentFiles: FileItem[];
  server: { https: boolean; urls: { label: string; url: string }[]; primaryUrl: string };
}

export type NavTab = 'home' | 'chats' | 'people' | 'files' | 'calls';

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

export interface UploadTask {
  id: string;
  name: string;
  conversationId: string;
  progress: number;
  speed: number;
  size: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  error?: string;
  xhr?: XMLHttpRequest;
}

export interface SearchResult extends Message {
  conversationTitle: string;
}

export interface PeerMedia {
  audio: boolean;
  video: boolean;
  screen: boolean;
}
