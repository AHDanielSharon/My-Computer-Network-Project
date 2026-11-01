import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  BootstrapResponse,
  CallRecord,
  Conversation,
  FileItem,
  Message,
  NavTab,
  SearchResult,
  ServerInfo,
  Toast,
  UploadTask,
  User,
} from '../types';
import {
  ApiError,
  api,
  getToken,
  joinNetwork,
  loadBootstrap,
  loadServerInfo,
  setToken,
  uploadFile,
  type UploadOptions,
} from '../lib/api';
import { sortConversations } from '../lib/utils';
import { playMessageSound, playSentSound, unlockAudio } from '../lib/sounds';

type Phase = 'loading' | 'join' | 'ready' | 'unreachable';
type ThemeChoice = 'light' | 'dark' | 'system';
interface Settings {
  sound: boolean;
  desktopNotifications: boolean;
}

interface ToastOptions {
  type?: Toast['type'];
  title?: string;
  action?: Toast['action'];
}

interface AppContextValue {
  phase: Phase;
  bootError: string | null;
  me: User | null;
  users: User[];
  onlineCount: number;
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  messagesByConv: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  loadingConversation: boolean;
  socket: Socket | null;
  connected: boolean;
  nav: NavTab;
  setNav: (tab: NavTab) => void;
  typingByConv: Record<string, Record<string, number>>;
  typingUsers: (conversationId: string) => { userId: string; name: string }[];
  theme: ThemeChoice;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeChoice) => void;
  toggleTheme: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  requestNotifications: () => Promise<boolean>;
  serverInfo: ServerInfo | null;
  toasts: Toast[];
  toast: (message: string, options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
  uploads: UploadTask[];
  cancelUpload: (id: string) => void;
  dismissUpload: (id: string) => void;
  recentFiles: FileItem[];
  callHistory: CallRecord[];
  refreshFiles: () => Promise<void>;
  refreshCalls: () => Promise<void>;
  searchState: { query: string; results: SearchResult[]; loading: boolean } | null;
  runGlobalSearch: (query: string) => Promise<void>;
  clearGlobalSearch: () => void;
  pendingJump: { messageId: string; at: number } | null;
  clearPendingJump: () => void;
  jumpToMessage: (message: Pick<Message, 'id' | 'conversationId' | 'createdAt'>) => Promise<void>;
  join: (name: string, avatarColor: string, about: string) => Promise<void>;
  logout: () => Promise<void>;
  retryBoot: () => void;
  openConversation: (conversationId: string) => void;
  closeConversation: () => void;
  sendText: (conversationId: string, body: string, replyTo?: string | null) => Promise<boolean>;
  sendLocation: (conversationId: string) => Promise<boolean>;
  editMessage: (messageId: string, body: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  reactToMessage: (messageId: string, emoji: string) => void;
  pinMessage: (messageId: string) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  uploadFiles: (files: File[], conversationId: string, replyTo?: string | null) => Promise<void>;
  uploadVoice: (blob: Blob, conversationId: string, duration: number, replyTo?: string | null) => Promise<void>;
  uploadFromCanvas: (blob: Blob, name: string, conversationId: string) => Promise<void>;
  createDm: (userId: string) => Promise<Conversation | null>;
  createGroup: (name: string, memberIds: string[], color: string) => Promise<Conversation | null>;
  updateConversation: (conversationId: string, patch: { name?: string; announcement?: string; avatarColor?: string }) => Promise<boolean>;
  addMembers: (conversationId: string, userIds: string[]) => Promise<boolean>;
  removeMember: (conversationId: string, userId: string) => Promise<boolean>;
  muteConversation: (conversationId: string, muted: boolean) => Promise<void>;
  forwardMessage: (messageId: string, conversationIds: string[]) => Promise<number>;
  setMe: (user: User) => void;
  refreshAll: () => Promise<void>;
  loadEarlier: (conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => void;
  pinnedVersion: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

const THEME_KEY = 'lantern.theme';
const SETTINGS_KEY = 'lantern.settings.v1';

function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {}
  return 'system';
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sound: parsed.sound !== false,
        desktopNotifications: !!parsed.desktopNotifications,
      };
    }
  } catch {}
  return { sound: true, desktopNotifications: false };
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function emitWithAck<T>(sock: Socket, event: string, payload: unknown, timeoutMs = 12_000): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    timer = window.setTimeout(() => finish(null), timeoutMs);
    try {
      sock.emit(event, payload, (res: T) => finish(res));
    } catch {
      finish(null);
    }
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [me, setMeState] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Message[]>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [loadingConvId, setLoadingConvId] = useState<string | null>(null);
  const [typingByConv, setTypingByConv] = useState<Record<string, Record<string, number>>>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [nav, setNav] = useState<NavTab>('home');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [searchState, setSearchState] = useState<AppContextValue['searchState']>(null);
  const [pendingJump, setPendingJump] = useState<{ messageId: string; at: number } | null>(null);
  const [pinnedVersion, setPinnedVersion] = useState(0);
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [settings, setSettings] = useState<Settings>(readSettings);

  const socketRef = useRef<Socket | null>(null);
  const meRef = useRef<User | null>(null);
  const usersRef = useRef<User[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);
  const messagesRef = useRef<Record<string, Message[]>>({});
  const activeIdRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  const loadingRef = useRef<Set<string>>(new Set());
  const bootOnce = useRef(false);
  const hadConnection = useRef(false);
  const toastTimers = useRef<Record<string, number>>({});
  const uploadTimers = useRef<Record<string, number>>({});
  const uploadXhrs = useRef<Record<string, XMLHttpRequest>>({});

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    messagesRef.current = messagesByConv;
  }, [messagesByConv]);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /* ----------------------------- theme ----------------------------- */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#080b11' : '#f3f5f9');
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const setTheme = useCallback((next: ThemeChoice) => setThemeState(next), []);
  const toggleTheme = useCallback(() => {
    setThemeState(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  const setMe = useCallback((user: User) => {
    setMeState(user);
    meRef.current = user;
  }, []);

  /* ----------------------------- toasts ----------------------------- */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (toastTimers.current[id]) {
      clearTimeout(toastTimers.current[id]);
      delete toastTimers.current[id];
    }
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = Math.random().toString(36).slice(2);
      const item: Toast = {
        id,
        message,
        type: options.type || 'info',
        title: options.title,
        action: options.action,
      };
      setToasts((prev) => [...prev.slice(-3), item]);
      toastTimers.current[id] = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        delete toastTimers.current[id];
      }, options.action ? 7000 : 4200);
    },
    [],
  );

  /* ----------------------------- misc helpers ----------------------------- */
  const refreshFiles = useCallback(async () => {
    try {
      const res = await api.get<{ files: FileItem[] }>('/api/files/recent');
      setRecentFiles(res.files);
    } catch {}
  }, []);

  const refreshCalls = useCallback(async () => {
    try {
      const res = await api.get<{ calls: CallRecord[] }>('/api/calls');
      setCallHistory(res.calls);
    } catch {}
  }, []);

  const applyBootstrap = useCallback(
    (data: BootstrapResponse) => {
      setMeState(data.user);
      meRef.current = data.user;
      setUsers(data.users);
      usersRef.current = data.users;
      setConversations(sortConversations(data.conversations));
      setRecentFiles(data.recentFiles);
      setCallHistory(data.callHistory);
      setActiveId((current) => {
        if (current && data.conversations.some((c) => c.id === current)) return current;
        activeIdRef.current = null;
        return null;
      });
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    try {
      const data = await loadBootstrap();
      applyBootstrap(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setConnected(false);
    }
  }, [applyBootstrap]);

  const mergeMessages = useCallback((convId: string, incoming: Message[]) => {
    if (!incoming.length) return;
    setMessagesByConv((prev) => {
      const existing = prev[convId];
      if (!existing) return prev;
      const byId = new Map(existing.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      const merged = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [convId]: merged };
    });
  }, []);

  const markReadRef = useRef<(conversationId: string) => void>(() => {});

  // Reconnection can miss messages. Pull everything after the last known
  // message for every cached chat, then refresh recent rows so edits,
  // deletions, reactions and pins made while offline are reflected too.
  const catchUpMessages = useCallback(async () => {
    for (const [convId, list] of Object.entries(messagesRef.current)) {
      let cursor = list[list.length - 1] || null;
      for (let page = 0; page < 10; page += 1) {
        const params = new URLSearchParams({ limit: '200' });
        if (cursor) {
          params.set('after', String(cursor.createdAt));
          params.set('afterId', cursor.id);
        }
        let res: { messages: Message[] };
        try {
          res = await api.get<{ messages: Message[] }>(
            `/api/conversations/${encodeURIComponent(convId)}/messages?${params.toString()}`,
          );
        } catch {
          break;
        }
        if (!res.messages.length) break;
        mergeMessages(convId, res.messages);
        if (res.messages.length < 200) break;
        cursor = res.messages[res.messages.length - 1];
      }
      try {
        const latest = await api.get<{ messages: Message[] }>(
          `/api/conversations/${encodeURIComponent(convId)}/messages?limit=80`,
        );
        mergeMessages(convId, latest.messages);
      } catch {}
    }
    if (document.visibilityState === 'visible' && activeIdRef.current) {
      markReadRef.current(activeIdRef.current);
    }
  }, [mergeMessages]);

  const resetLocalState = useCallback(() => {
    for (const xhr of Object.values(uploadXhrs.current)) {
      try {
        xhr.abort();
      } catch {}
    }
    uploadXhrs.current = {};
    for (const timer of Object.values(uploadTimers.current)) window.clearTimeout(timer);
    uploadTimers.current = {};
    for (const timer of Object.values(toastTimers.current)) window.clearTimeout(timer);
    toastTimers.current = {};
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setConnected(false);
    setMeState(null);
    meRef.current = null;
    setUsers([]);
    usersRef.current = [];
    setConversations([]);
    conversationsRef.current = [];
    setMessagesByConv({});
    messagesRef.current = {};
    setHasMore({});
    setTypingByConv({});
    setRecentFiles([]);
    setCallHistory([]);
    setSearchState(null);
    setUploads([]);
    setToasts([]);
    setPendingJump(null);
    setActiveId(null);
    activeIdRef.current = null;
    hadConnection.current = false;
    loadingRef.current.clear();
  }, []);

  /* ----------------------------- message helpers ----------------------------- */
  const openConversationRef = useRef<((id: string) => void) | null>(null);
  const seenIncomingRef = useRef<Set<string>>(new Set());

  const markReadInternal = useCallback((convId: string) => {
    const at = Date.now();
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              unread: 0,
              lastReadAt: at,
              members: c.members.map((m) =>
                m.id === meRef.current?.id ? { ...m, lastReadAt: Math.max(m.lastReadAt, at) } : m,
              ),
            }
          : c,
      ),
    );
    socketRef.current?.emit('chat:read', { conversationId: convId });
  }, []);
  markReadRef.current = markReadInternal;

  const receiveMessage = useCallback(
    (message: Message, options: { self?: boolean } = {}) => {
      const currentMe = meRef.current;
      if (!currentMe) return;
      const convId = message.conversationId;
      const active = activeIdRef.current === convId;
      const visible = document.visibilityState === 'visible';
      const isMine = message.senderId === currentMe.id;
      const alreadySeen = seenIncomingRef.current.has(message.id);
      if (!alreadySeen) {
        seenIncomingRef.current.add(message.id);
        if (seenIncomingRef.current.size > 2000) {
          const oldest = seenIncomingRef.current.values().next().value;
          if (oldest) seenIncomingRef.current.delete(oldest);
        }
      }

      setMessagesByConv((prev) => {
        const list = prev[convId];
        if (!list) return prev;
        const idx = list.findIndex((m) => m.id === message.id);
        if (idx >= 0) {
          const copy = [...list];
          copy[idx] = message;
          return { ...prev, [convId]: copy };
        }
        return { ...prev, [convId]: [...list, message] };
      });

      if (!alreadySeen && !isMine && settingsRef.current.sound) playMessageSound();

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === convId);
        if (idx < 0) return prev;
        const conv = prev[idx];
        const isCurrent = active && visible;
        const updated: Conversation = {
          ...conv,
          lastMessage: message,
          unread: isMine || isCurrent ? 0 : conv.unread + 1,
        };
        const next = [...prev];
        next[idx] = updated;
        return sortConversations(next);
      });

      if (isMine || options.self) return;
      const conv = conversationsRef.current.find((c) => c.id === convId);
      if (active && visible) {
        markReadInternal(convId);
        return;
      }
      if (conv?.muted) return;
      if (message.type === 'call') return;
      if (!settingsRef.current.sound && !settingsRef.current.desktopNotifications) return;

      const title = conv ? conversationLabel(conv, currentMe.id, usersRef.current) : 'New message';
      const preview = previewText(message);
      toast(preview, {
        title: `${message.senderName} · ${title}`,
        type: 'info',
        action: { label: 'Open', onClick: () => openConversationRef.current?.(convId) },
      });
      if (
        settingsRef.current.desktopNotifications &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          const note = new Notification(`${message.senderName} · ${title}`, {
            body: preview,
            tag: convId,
            silent: !settingsRef.current.sound,
          });
          note.onclick = () => {
            window.focus();
            openConversationRef.current?.(convId);
            note.close();
          };
        } catch {}
      }
    },
    [markReadInternal, toast],
  );

  const loadMessages = useCallback(
    async (convId: string, around?: number) => {
      if (loadingRef.current.has(convId)) return;
      loadingRef.current.add(convId);
      setLoadingConvId(convId);
      try {
        const qs = around ? `?around=${around}&limit=80` : '?limit=60';
        const res = await api.get<{ messages: Message[] }>(
          `/api/conversations/${encodeURIComponent(convId)}/messages${qs}`,
        );
        setMessagesByConv((prev) => ({ ...prev, [convId]: res.messages }));
        setHasMore((prev) => ({ ...prev, [convId]: !around && res.messages.length >= 60 }));
        if (!around) markReadInternal(convId);
      } catch (err) {
        if (err instanceof ApiError && err.status !== 401) {
          toast(err.message, { type: 'error' });
        }
      } finally {
        loadingRef.current.delete(convId);
        setLoadingConvId((current) => (current === convId ? null : current));
      }
    },
    [markReadInternal, toast],
  );

  const openConversation = useCallback(
    (conversationId: string) => {
      setActiveId(conversationId);
      activeIdRef.current = conversationId;
      setNav('chats');
      setSearchState(null);
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (conv) markReadInternal(conversationId);
      if (!messagesRef.current[conversationId]) {
        void loadMessages(conversationId);
      }
      setLoadingConvId((current) => (messagesRef.current[conversationId] ? null : current));
    },
    [loadMessages, markReadInternal],
  );
  openConversationRef.current = openConversation;

  const closeConversation = useCallback(() => {
    setActiveId(null);
    activeIdRef.current = null;
  }, []);

  const loadEarlier = useCallback(
    async (conversationId: string) => {
      const list = messagesRef.current[conversationId];
      if (!list?.length || loadingRef.current.has(conversationId)) return;
      const oldest = list[0].createdAt;
      loadingRef.current.add(conversationId);
      try {
        const res = await api.get<{ messages: Message[] }>(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages?before=${oldest}&limit=60`,
        );
        setMessagesByConv((prev) => {
          const existing = prev[conversationId] || [];
          const ids = new Set(existing.map((m) => m.id));
          const merged = [...res.messages.filter((m) => !ids.has(m.id)), ...existing];
          return { ...prev, [conversationId]: merged };
        });
        setHasMore((prev) => ({ ...prev, [conversationId]: res.messages.length >= 60 }));
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
      } finally {
        loadingRef.current.delete(conversationId);
      }
    },
    [toast],
  );

  const jumpToMessage = useCallback(
    async (target: Pick<Message, 'id' | 'conversationId' | 'createdAt'>) => {
      setActiveId(target.conversationId);
      activeIdRef.current = target.conversationId;
      setNav('chats');
      setSearchState(null);
      setLoadingConvId(target.conversationId);
      try {
        const res = await api.get<{ messages: Message[] }>(
          `/api/conversations/${encodeURIComponent(target.conversationId)}/messages?around=${target.createdAt}&limit=80`,
        );
        setMessagesByConv((prev) => ({ ...prev, [target.conversationId]: res.messages }));
        setHasMore((prev) => ({ ...prev, [target.conversationId]: true }));
        setPendingJump({ messageId: target.id, at: Date.now() });
        markReadInternal(target.conversationId);
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
      } finally {
        setLoadingConvId(null);
      }
    },
    [markReadInternal, toast],
  );

  /* ----------------------------- socket ----------------------------- */
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;
    const onMessage = (payload: { message: Message }) => {
      receiveMessage(payload.message);
      if (payload.message.meta?.fileId) {
        window.setTimeout(() => void refreshFiles(), 400);
      }
      if (payload.message.pinnedAt) setPinnedVersion((v) => v + 1);
    };
    const onUpdated = (payload: { message: Message }) => {
      const message = payload.message;
      setMessagesByConv((prev) => {
        const list = prev[message.conversationId];
        if (!list) return prev;
        const idx = list.findIndex((m) => m.id === message.id);
        if (idx < 0) return prev;
        const copy = [...list];
        copy[idx] = message;
        return { ...prev, [message.conversationId]: copy };
      });
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === message.conversationId);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (conv.lastMessage?.id !== message.id) return prev;
        const next = [...prev];
        next[idx] = { ...conv, lastMessage: message };
        return sortConversations(next);
      });
      setPinnedVersion((v) => v + 1);
    };
    const onRead = (payload: { conversationId: string; userId: string; at: number }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                members: c.members.map((m) =>
                  m.id === payload.userId ? { ...m, lastReadAt: Math.max(m.lastReadAt, payload.at) } : m,
                ),
              }
            : c,
        ),
      );
    };
    const onTyping = (payload: {
      conversationId: string;
      userId: string;
      name: string;
      isTyping: boolean;
    }) => {
      setTypingByConv((prev) => {
        const current = { ...(prev[payload.conversationId] || {}) };
        if (payload.isTyping) current[payload.userId] = Date.now() + 4000;
        else delete current[payload.userId];
        return { ...prev, [payload.conversationId]: current };
      });
    };
    const onConversationNew = (payload: { conversation: Conversation }) => {
      const conv = payload.conversation;
      const isNew = !conversationsRef.current.some((c) => c.id === conv.id);
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conv.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = conv;
          return sortConversations(next);
        }
        return sortConversations([...prev, conv]);
      });
      if (isNew && conv.type === 'group') {
        toast(`You were added to “${conv.name || 'a group'}”.`, { type: 'info' });
      }
    };
    const onConversationUpdated = (payload: { conversation: Conversation }) => {
      const conv = payload.conversation;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conv.id);
        if (idx < 0) return sortConversations([...prev, conv]);
        const next = [...prev];
        next[idx] = conv;
        return next;
      });
    };
    const onConversationRemoved = (payload: { conversationId: string }) => {
      setConversations((prev) => prev.filter((c) => c.id !== payload.conversationId));
      setActiveId((current) => {
        if (current === payload.conversationId) {
          activeIdRef.current = null;
          return null;
        }
        return current;
      });
      setMessagesByConv((prev) => {
        const copy = { ...prev };
        delete copy[payload.conversationId];
        return copy;
      });
      toast('You are no longer in that conversation.', { type: 'info' });
    };
    const onPresence = (payload: {
      userId: string;
      online: boolean;
      status: 'online' | 'busy';
      lastSeen: number;
    }) => {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === payload.userId
            ? { ...u, online: payload.online, status: payload.status, lastSeen: payload.lastSeen }
            : u,
        ),
      );
    };
    const onUserUpdated = (payload: { user: User }) => {
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === payload.user.id);
        if (idx < 0) return [...prev, payload.user];
        const next = [...prev];
        next[idx] = payload.user;
        return next;
      });
      if (payload.user.id === meRef.current?.id) {
        setMeState(payload.user);
        meRef.current = payload.user;
      }
    };
    const onConnect = () => {
      setConnected(true);
      unlockAudio();
      if (hadConnection.current) {
        void refreshAll();
        void catchUpMessages();
      }
      hadConnection.current = true;
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error) => {
      setConnected(false);
      if (/unauthorized/i.test(err.message)) {
        setToken(null);
        resetLocalState();
        setPhase('join');
        toast('Your session ended. Join again to continue.', { type: 'error' });
      }
    };

    sock.on('message:new', onMessage);
    sock.on('message:updated', onUpdated);
    sock.on('chat:read', onRead);
    sock.on('typing', onTyping);
    sock.on('conversation:new', onConversationNew);
    sock.on('conversation:updated', onConversationUpdated);
    sock.on('conversation:removed', onConversationRemoved);
    sock.on('presence', onPresence);
    sock.on('user:updated', onUserUpdated);
    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('connect_error', onConnectError);
    if (sock.connected) onConnect();
    return () => {
      sock.off('message:new', onMessage);
      sock.off('message:updated', onUpdated);
      sock.off('chat:read', onRead);
      sock.off('typing', onTyping);
      sock.off('conversation:new', onConversationNew);
      sock.off('conversation:updated', onConversationUpdated);
      sock.off('conversation:removed', onConversationRemoved);
      sock.off('presence', onPresence);
      sock.off('user:updated', onUserUpdated);
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('connect_error', onConnectError);
    };
  }, [socket, refreshAll, catchUpMessages, resetLocalState, refreshFiles, receiveMessage, toast]);

  /* typing cleanup */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTypingByConv((prev) => {
        const ts = Date.now();
        let changed = false;
        const next: Record<string, Record<string, number>> = {};
        for (const [convId, map] of Object.entries(prev)) {
          const filtered: Record<string, number> = {};
          for (const [userId, expires] of Object.entries(map)) {
            if (expires > ts) filtered[userId] = expires;
            else changed = true;
          }
          if (Object.keys(filtered).length) next[convId] = filtered;
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  /* document title */
  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + c.unread, 0), [conversations]);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Lantern` : 'Lantern · LAN Chat';
  }, [totalUnread]);

  /* read on visibility */
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && activeIdRef.current) {
        markReadInternal(activeIdRef.current);
      }
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [markReadInternal]);

  /* unauthorized */
  useEffect(() => {
    const handler = () => {
      resetLocalState();
      setPhase('join');
      toast('Your session ended. Join again to continue.', { type: 'error' });
    };
    window.addEventListener('lantern:unauthorized', handler);
    return () => window.removeEventListener('lantern:unauthorized', handler);
  }, [resetLocalState, toast]);

  /* load public info + autorun boot */
  useEffect(() => {
    loadServerInfo()
      .then(setServerInfo)
      .catch(() => {});
  }, []);

  const startSocket = useCallback((token: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    const sock = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = sock;
    setSocket(sock);
  }, []);

  const boot = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setPhase('join');
      return;
    }
    setPhase('loading');
    setBootError(null);
    try {
      const data = await loadBootstrap();
      applyBootstrap(data);
      startSocket(token);
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPhase('join');
      } else {
        setBootError(err instanceof Error ? err.message : 'Could not reach the local server.');
        setPhase('unreachable');
      }
    }
  }, [applyBootstrap, startSocket]);

  useEffect(() => {
    if (bootOnce.current) return;
    bootOnce.current = true;
    void boot();
  }, [boot]);

  const retryBoot = useCallback(() => {
    void boot();
  }, [boot]);

  const join = useCallback(
    async (name: string, avatarColor: string, about: string) => {
      const res = await joinNetwork(name, avatarColor, about);
      const data = await loadBootstrap();
      applyBootstrap(data);
      startSocket(res.token);
      setPhase('ready');
      toast(
        res.rejoined ? `Welcome back, ${res.user.name}.` : `Welcome to Lantern, ${res.user.name}.`,
        { type: 'success' },
      );
    },
    [applyBootstrap, startSocket, toast],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/logout');
    } catch {}
    setToken(null);
    resetLocalState();
    setPhase('join');
  }, [resetLocalState]);

  /* ----------------------------- actions ----------------------------- */
  const sendText = useCallback(
    async (conversationId: string, body: string, replyTo?: string | null) => {
      const text = body.trim();
      if (!text) return false;
      const sock = socketRef.current;
      if (!sock?.connected) {
        toast('You are offline. Reconnect to the Wi-Fi before sending.', { type: 'error' });
        return false;
      }
      const res = await emitWithAck<{ ok?: boolean; error?: string }>(sock, 'chat:send', {
        conversationId,
        type: 'text',
        body: text,
        replyTo: replyTo || null,
      });
      if (!res) {
        toast('The server did not respond. Check your connection and try again.', { type: 'error' });
        return false;
      }
      if (res.error) {
        toast(res.error, { type: 'error' });
        return false;
      }
      if (settingsRef.current.sound) playSentSound();
      return true;
    },
    [toast],
  );

  const sendLocation = useCallback(
    async (conversationId: string) => {
      if (!navigator.geolocation) {
        toast('Location is not available in this browser.', { type: 'error' });
        return false;
      }
      if (!window.isSecureContext) {
        toast('Location sharing needs HTTPS. Open Lantern using the https:// address.', { type: 'error' });
        return false;
      }
      const sock = socketRef.current;
      if (!sock?.connected) {
        toast('You are offline. Reconnect to the Wi-Fi before sharing your location.', { type: 'error' });
        return false;
      }
      toast('Finding your location…', { type: 'info' });
      return new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const res = await emitWithAck<{ ok?: boolean; error?: string }>(sock, 'chat:send', {
              conversationId,
              type: 'location',
              meta: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              },
            });
            if (!res) {
              toast('The server did not respond. Check your connection and try again.', { type: 'error' });
              resolve(false);
            } else if (res.error) {
              toast(res.error, { type: 'error' });
              resolve(false);
            } else {
              resolve(true);
            }
          },
          (err) => {
            toast(
              err.code === 1
                ? 'Location permission was denied. Allow it in your browser settings.'
                : 'Your location could not be determined.',
              { type: 'error' },
            );
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
        );
      });
    },
    [toast],
  );

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      const sock = socketRef.current;
      if (!sock?.connected) {
        toast('You are offline. Reconnect to the Wi-Fi before editing.', { type: 'error' });
        return false;
      }
      const res = await emitWithAck<{ ok?: boolean; error?: string }>(sock, 'chat:edit', { messageId, body });
      if (!res) {
        toast('The server did not respond. Check your connection and try again.', { type: 'error' });
        return false;
      }
      if (res.error) {
        toast(res.error, { type: 'error' });
        return false;
      }
      return true;
    },
    [toast],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const sock = socketRef.current;
      if (!sock?.connected) {
        toast('You are offline. Reconnect to the Wi-Fi before deleting.', { type: 'error' });
        return false;
      }
      const res = await emitWithAck<{ ok?: boolean; error?: string }>(sock, 'chat:delete', { messageId });
      if (!res) {
        toast('The server did not respond. Check your connection and try again.', { type: 'error' });
        return false;
      }
      if (res.error) {
        toast(res.error, { type: 'error' });
        return false;
      }
      return true;
    },
    [toast],
  );

  const reactToMessage = useCallback((messageId: string, emoji: string) => {
    socketRef.current?.emit('chat:react', { messageId, emoji });
  }, []);

  const pinMessage = useCallback(
    (messageId: string) => {
      const sock = socketRef.current;
      if (!sock?.connected) {
        toast('You are offline. Reconnect to the Wi-Fi before pinning.', { type: 'error' });
        return;
      }
      void emitWithAck<{ error?: string; pinned?: boolean }>(sock, 'chat:pin', { messageId }).then((res) => {
        if (!res) toast('The server did not respond. Check your connection and try again.', { type: 'error' });
        else if (res.error) toast(res.error, { type: 'error' });
        else toast(res.pinned ? 'Message pinned.' : 'Message unpinned.', { type: 'success' });
      });
    },
    [toast],
  );

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  const updateUpload = useCallback((id: string, patch: Partial<UploadTask>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const removeUploadLater = useCallback((id: string, delay = 2200) => {
    if (uploadTimers.current[id]) clearTimeout(uploadTimers.current[id]);
    uploadTimers.current[id] = window.setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.id !== id));
      delete uploadTimers.current[id];
    }, delay);
  }, []);

  const dismissUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
    if (uploadTimers.current[id]) {
      clearTimeout(uploadTimers.current[id]);
      delete uploadTimers.current[id];
    }
  }, []);

  const cancelUpload = useCallback(
    (id: string) => {
      const xhr = uploadXhrs.current[id];
      delete uploadXhrs.current[id];
      xhr?.abort();
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: 'cancelled' as const } : u)),
      );
      removeUploadLater(id, 1500);
    },
    [removeUploadLater],
  );

  const runUpload = useCallback(
    async (options: UploadOptions, extra: { size: number; width?: number | null; height?: number | null; duration?: number | null }) => {
      const id = Math.random().toString(36).slice(2);
      const task: UploadTask = {
        id,
        name: options.fileName,
        conversationId: options.conversationId,
        progress: 0,
        speed: 0,
        size: extra.size,
        status: 'uploading',
      };
      setUploads((prev) => [...prev, task]);
      const { promise, xhr } = uploadFile({
        ...options,
        width: extra.width,
        height: extra.height,
        duration: extra.duration,
        onProgress: (progress, speed) => updateUpload(id, { progress, speed }),
      });
      uploadXhrs.current[id] = xhr;
      updateUpload(id, { xhr });
      try {
        const res = await promise;
        updateUpload(id, { status: 'done', progress: 100 });
        receiveMessage(res.message, { self: true });
        void refreshFiles();
        removeUploadLater(id);
        return res.message;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        if (!/cancelled/i.test(message)) {
          updateUpload(id, { status: 'error', error: message });
          toast(message, { type: 'error' });
          removeUploadLater(id, 8000);
        }
      } finally {
        delete uploadXhrs.current[id];
      }
      return null;
    },
    [receiveMessage, refreshFiles, removeUploadLater, updateUpload, toast],
  );

  const probeFile = useCallback(async (file: File) => {
    const result: { width?: number | null; height?: number | null; duration?: number | null } = {};
    try {
      if (file.type.startsWith('image/') && 'createImageBitmap' in window) {
        const bitmap = await createImageBitmap(file);
        result.width = bitmap.width;
        result.height = bitmap.height;
        bitmap.close?.();
      } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file);
        const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
        el.preload = 'metadata';
        el.src = url;
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          el.onloadedmetadata = done;
          el.onerror = done;
          setTimeout(done, 4000);
        });
        if (Number.isFinite(el.duration) && el.duration > 0) result.duration = el.duration;
        if (el instanceof HTMLVideoElement) {
          result.width = el.videoWidth || null;
          result.height = el.videoHeight || null;
        }
        URL.revokeObjectURL(url);
      }
    } catch {}
    return result;
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], conversationId: string, replyTo?: string | null) => {
      for (const file of files) {
        const kind: UploadOptions['kind'] = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('audio/')
              ? 'audio'
              : 'file';
        const meta = await probeFile(file);
        await runUpload(
          { file, fileName: file.name, conversationId, kind, replyTo: replyTo || undefined },
          { size: file.size, ...meta },
        );
      }
    },
    [probeFile, runUpload],
  );

  const uploadVoice = useCallback(
    async (blob: Blob, conversationId: string, duration: number, replyTo?: string | null) => {
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      await runUpload(
        {
          file: blob,
          fileName: `Voice message.${ext}`,
          conversationId,
          kind: 'voice',
          replyTo: replyTo || undefined,
        },
        { size: blob.size, duration },
      );
    },
    [runUpload],
  );

  const uploadFromCanvas = useCallback(
    async (blob: Blob, name: string, conversationId: string) => {
      await runUpload(
        { file: blob, fileName: name, conversationId, kind: 'image' },
        { size: blob.size },
      );
    },
    [runUpload],
  );

  const createDm = useCallback(
    async (userId: string) => {
      try {
        const res = await api.post<{ conversation: Conversation }>('/api/conversations/dm', { userId });
        const conv = res.conversation;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conv.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = conv;
            return sortConversations(next);
          }
          return sortConversations([...prev, conv]);
        });
        openConversation(conv.id);
        return conv;
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
        return null;
      }
    },
    [openConversation, toast],
  );

  const createGroup = useCallback(
    async (name: string, memberIds: string[], color: string) => {
      try {
        const res = await api.post<{ conversation: Conversation }>('/api/conversations/group', {
          name,
          memberIds,
          avatarColor: color,
        });
        const conv = res.conversation;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conv.id);
          if (idx >= 0) return prev;
          return sortConversations([...prev, conv]);
        });
        openConversation(conv.id);
        setMessagesByConv((prev) => ({ ...prev, [conv.id]: [] }));
        toast(`Group “${name}” created.`, { type: 'success' });
        return conv;
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
        return null;
      }
    },
    [openConversation, toast],
  );

  const applyConversationResponse = useCallback((conv: Conversation) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conv.id);
      if (idx < 0) return sortConversations([...prev, conv]);
      const next = [...prev];
      next[idx] = { ...conv, lastMessage: conv.lastMessage || prev[idx].lastMessage };
      return sortConversations(next);
    });
  }, []);

  const updateConversation = useCallback(
    async (conversationId: string, patch: { name?: string; announcement?: string; avatarColor?: string }) => {
      try {
        const res = await api.patch<{ conversation: Conversation }>(
          `/api/conversations/${encodeURIComponent(conversationId)}`,
          patch,
        );
        applyConversationResponse(res.conversation);
        toast('Group updated.', { type: 'success' });
        return true;
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
        return false;
      }
    },
    [applyConversationResponse, toast],
  );

  const addMembers = useCallback(
    async (conversationId: string, userIds: string[]) => {
      try {
        const res = await api.post<{ conversation: Conversation }>(
          `/api/conversations/${encodeURIComponent(conversationId)}/members`,
          { userIds },
        );
        applyConversationResponse(res.conversation);
        toast(`${userIds.length === 1 ? 'Person' : 'People'} added to the group.`, { type: 'success' });
        return true;
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
        return false;
      }
    },
    [applyConversationResponse, toast],
  );

  const removeMember = useCallback(
    async (conversationId: string, userId: string) => {
      try {
        await api.del(`/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`);
        return true;
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
        return false;
      }
    },
    [toast],
  );

  const muteConversation = useCallback(
    async (conversationId: string, muted: boolean) => {
      try {
        await api.patch(`/api/conversations/${encodeURIComponent(conversationId)}/mute`, { muted });
        setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, muted } : c)));
        toast(muted ? 'Notifications muted for this chat.' : 'Notifications unmuted.', { type: 'success' });
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
      }
    },
    [toast],
  );

  const forwardMessage = useCallback(
    async (messageId: string, conversationIds: string[]) => {
      try {
        const res = await api.post<{ forwarded: number }>(
          `/api/messages/${encodeURIComponent(messageId)}/forward`,
          { conversationIds },
        );
        toast(`Forwarded to ${res.forwarded} chat${res.forwarded === 1 ? '' : 's'}.`, { type: 'success' });
        return res.forwarded;
      } catch (err) {
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
        return 0;
      }
    },
    [toast],
  );

  const runGlobalSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < 2) {
        toast('Type at least 2 characters to search.', { type: 'info' });
        return;
      }
      setSearchState({ query: q, results: [], loading: true });
      try {
        const res = await api.get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        setSearchState({ query: q, results: res.results, loading: false });
      } catch (err) {
        setSearchState({ query: q, results: [], loading: false });
        if (err instanceof ApiError) toast(err.message, { type: 'error' });
      }
    },
    [toast],
  );

  const clearGlobalSearch = useCallback(() => setSearchState(null), []);

  const clearPendingJump = useCallback(() => setPendingJump(null), []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (patch.desktopNotifications) {
        if (typeof Notification === 'undefined') {
          toast('This browser does not support desktop notifications.', { type: 'error' });
          return;
        }
        if (Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            toast('Notification permission was not granted.', { type: 'error' });
            return;
          }
        }
      }
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [toast],
  );

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }, []);

  const typingUsers = useCallback(
    (conversationId: string) => {
      const map = typingByConv[conversationId];
      if (!map) return [];
      const now = Date.now();
      return Object.entries(map)
        .filter(([, expires]) => expires > now)
        .map(([userId]) => ({
          userId,
          name: usersRef.current.find((u) => u.id === userId)?.name || 'Someone',
        }));
    },
    [typingByConv],
  );

  const onlineCount = useMemo(() => users.filter((u) => u.online).length, [users]);
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );
  const messages = useMemo(
    () => (activeId ? messagesByConv[activeId] || [] : []),
    [activeId, messagesByConv],
  );

  const value: AppContextValue = {
    phase,
    bootError,
    me,
    users,
    onlineCount,
    conversations,
    activeId,
    activeConversation,
    messages,
    messagesByConv,
    hasMore,
    loadingConversation: !!loadingConvId && loadingConvId === activeId,
    socket,
    connected,
    nav,
    setNav,
    typingByConv,
    typingUsers,
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    settings,
    updateSettings,
    requestNotifications,
    serverInfo,
    toasts,
    toast,
    dismissToast,
    uploads,
    cancelUpload,
    dismissUpload,
    recentFiles,
    callHistory,
    refreshFiles,
    refreshCalls,
    searchState,
    runGlobalSearch,
    clearGlobalSearch,
    pendingJump,
    clearPendingJump,
    jumpToMessage,
    join,
    logout,
    retryBoot,
    openConversation,
    closeConversation,
    sendText,
    sendLocation,
    editMessage,
    deleteMessage,
    reactToMessage,
    pinMessage,
    setTyping,
    uploadFiles,
    uploadVoice,
    uploadFromCanvas,
    createDm,
    createGroup,
    updateConversation,
    addMembers,
    removeMember,
    muteConversation,
    forwardMessage,
    setMe,
    refreshAll,
    loadEarlier,
    markRead: markReadInternal,
    pinnedVersion,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* helpers used before definitions to avoid circular closures */
function conversationLabel(conv: Conversation, meId: string, users: User[]) {
  if (conv.type === 'group') return conv.name || 'Group';
  const other = conv.members.find((m) => m.id !== meId);
  return users.find((u) => u.id === other?.id)?.name || other?.name || 'Direct message';
}

function previewText(message: Message) {
  if (message.deletedAt) return 'Message deleted';
  switch (message.type) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎬 Video';
    case 'voice':
      return '🎙️ Voice message';
    case 'audio':
      return `🎵 ${message.meta?.name || 'Audio'}`;
    case 'file':
      return `📄 ${message.meta?.name || 'Document'}`;
    case 'location':
      return '📍 Shared location';
    case 'call':
      return message.meta?.status === 'missed' ? 'Missed call' : 'Call';
    default:
      return (message.body || '').slice(0, 120);
  }
}
