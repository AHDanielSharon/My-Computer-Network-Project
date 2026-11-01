import type { BootstrapResponse, Conversation, FileItem, Message, ServerInfo, User } from '../types';

const TOKEN_KEY = 'lantern.token';
const DEVICE_KEY_STORAGE = 'lantern.deviceKey';

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {}

function randomKey() {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceKey() {
  try {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key || key.length < 24) {
      key = randomKey();
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return '';
  }
}

export function getToken() {
  return token;
}

export function setToken(next: string | null) {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function handleUnauthorized() {
  if (token) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('lantern:unauthorized'));
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError('Could not reach the local server. Check that the Wi-Fi connection is still active.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(data.error || 'Your session ended. Please join again.', 401);
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function joinNetwork(name: string, avatarColor: string, about: string) {
  const res = await api.post<{
    token: string;
    user: User;
    conversation: Conversation;
    rejoined?: boolean;
  }>('/api/join', {
    name,
    avatarColor,
    about,
    deviceKey: getDeviceKey(),
  });
  setToken(res.token);
  return res;
}

export async function loadBootstrap() {
  return api.get<BootstrapResponse>('/api/bootstrap');
}

export async function loadServerInfo() {
  return request<ServerInfo>('/api/info');
}

export function fileUrl(fileId: string, inline = false) {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (inline) params.set('inline', '1');
  return `/api/files/${encodeURIComponent(fileId)}?${params.toString()}`;
}

export function avatarUrl(user: Pick<User, 'id' | 'avatarFile'>) {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (user.avatarFile) params.set('v', user.avatarFile);
  return `/api/avatars/${encodeURIComponent(user.id)}?${params.toString()}`;
}

export interface UploadOptions {
  file: Blob;
  fileName: string;
  conversationId: string;
  kind?: 'image' | 'video' | 'audio' | 'voice' | 'file';
  caption?: string;
  replyTo?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  onProgress?: (progress: number, speed: number, loaded: number, total: number) => void;
}

export function uploadFile(options: UploadOptions): { promise: Promise<{ message: Message; file: FileItem }>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ message: Message; file: FileItem }>((resolve, reject) => {
    const form = new FormData();
    form.append('file', options.file, options.fileName);
    if (options.kind) form.append('kind', options.kind);
    if (options.caption) form.append('caption', options.caption);
    if (options.replyTo) form.append('replyTo', options.replyTo);
    if (options.width) form.append('width', String(options.width));
    if (options.height) form.append('height', String(options.height));
    if (options.duration) form.append('duration', String(options.duration));

    xhr.open('POST', `/api/conversations/${encodeURIComponent(options.conversationId)}/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    let lastTime = performance.now();
    let lastLoaded = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      const speed = dt > 0.15 ? (e.loaded - lastLoaded) / dt : 0;
      if (dt > 0.15) {
        lastTime = now;
        lastLoaded = e.loaded;
      }
      options.onProgress?.(Math.round((e.loaded / e.total) * 100), speed, e.loaded, e.total);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status === 401) {
          handleUnauthorized();
          return reject(new ApiError(data.error || 'Session expired.', 401));
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          return reject(new ApiError(data.error || 'Upload failed.', xhr.status));
        }
        resolve(data);
      } catch {
        reject(new ApiError('Upload failed: invalid server response.', 0));
      }
    };
    xhr.onerror = () => reject(new ApiError('Upload interrupted. Check the Wi-Fi connection and try again.', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0));
    xhr.send(form);
  });
  return { promise, xhr };
}

export async function updateProfile(data: {
  name?: string;
  about?: string;
  avatarColor?: string;
  status?: 'online' | 'busy';
}) {
  return api.patch<{ user: User }>('/api/me', data);
}

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('avatar', file);
  return request<{ user: User }>('/api/me/avatar', { method: 'POST', body: form });
}

export function removeAvatar() {
  return api.del<{ user: User }>('/api/me/avatar');
}
