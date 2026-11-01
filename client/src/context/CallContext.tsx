import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import type { LiveCall, IncomingCall, PeerMedia, User } from '../types';
import { useApp } from './AppContext';
import { playCallEnd, playCallStart, startRingtone, stopRingtone } from '../lib/sounds';

export interface CallPeer {
  userId: string;
  name: string;
  stream: MediaStream | null;
  media: PeerMedia;
  connected: boolean;
}

export interface ActiveCall {
  id: string;
  conversationId: string;
  kind: 'audio' | 'video';
  initiatorId: string;
  startedAt: number;
  connectedAt: number | null;
  status: 'ringing' | 'active';
  localStream: MediaStream | null;
  localPreview: MediaStream | null;
  peers: CallPeer[];
  muted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  facing: 'user' | 'environment';
}

interface CallContextValue {
  call: ActiveCall | null;
  incoming: IncomingCall | null;
  startCall: (conversationId: string, kind: 'audio' | 'video') => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  canShareScreen: boolean;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  stream: MediaStream;
  name: string;
  media: PeerMedia;
  pending: RTCIceCandidateInit[];
  remoteSet: boolean;
  offered: boolean;
  connected: boolean;
  lastRestart: number;
}

function mediaConstraints(kind: 'audio' | 'video', facing: 'user' | 'environment'): MediaStreamConstraints {
  return {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video:
      kind === 'video'
        ? {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          }
        : false,
  };
}

function friendlyMediaError(err: unknown) {
  const name = (err as DOMException)?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permission denied. Allow camera and microphone access in your browser.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your camera or microphone is already in use by another app.';
  }
  if (name === 'OverconstrainedError') {
    return 'This device cannot provide the requested camera settings.';
  }
  if (!window.isSecureContext) {
    return 'Calls need HTTPS. Open Lantern using the https:// address of the host.';
  }
  return 'Could not access the camera or microphone.';
}

function emitWithAck<T>(
  socket: Socket | null,
  event: string,
  payload: unknown,
  timeoutMs = 15_000,
): Promise<T | null> {
  return new Promise((resolve) => {
    if (!socket) return resolve(null);
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
      socket.emit(event, payload, (res: T) => finish(res));
    } catch {
      finish(null);
    }
  });
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { socket, me, users, toast, refreshCalls, settings, openConversation } = useApp();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  const callRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const callIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const kindRef = useRef<'audio' | 'video'>('video');
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const facingRef = useRef<'user' | 'environment'>('user');
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const usersRef = useRef<User[]>(users);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const syncPeers = useCallback(() => {
    setCall((prev) => {
      if (!prev) return prev;
      const peers: CallPeer[] = [...peersRef.current.entries()].map(([userId, entry]) => ({
        userId,
        name: entry.name,
        stream: entry.stream.getTracks().length ? entry.stream : null,
        media: entry.media,
        connected: entry.connected,
      }));
      return { ...prev, peers };
    });
  }, []);

  const userName = useCallback((userId: string) => {
    return usersRef.current.find((u) => u.id === userId)?.name || 'Someone';
  }, []);

  const outgoingTracks = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return [];
    const tracks: MediaStreamTrack[] = [...stream.getAudioTracks()];
    if (screenTrackRef.current) tracks.push(screenTrackRef.current);
    else if (cameraTrackRef.current) tracks.push(cameraTrackRef.current);
    return tracks;
  }, []);

  const meIdRef = useRef(me?.id || '');
  useEffect(() => {
    meIdRef.current = me?.id || '';
  }, [me?.id]);

  // A failed peer connection is retried with an ICE restart. Only the peer
  // with the lower user id initiates so both sides cannot offer at once.
  const restartPeer = useCallback(
    async (userId: string, entry: PeerEntry) => {
      const selfId = meIdRef.current;
      if (!selfId || !socket || !callIdRef.current) return;
      if (selfId > userId) return;
      const at = Date.now();
      if (at - entry.lastRestart < 10_000) return;
      entry.lastRestart = at;
      try {
        entry.pc.restartIce();
        const offer = await entry.pc.createOffer({ iceRestart: true });
        await entry.pc.setLocalDescription(offer);
        entry.offered = true;
        socket.emit('rtc:offer', {
          callId: callIdRef.current,
          to: userId,
          sdp: entry.pc.localDescription,
        });
      } catch {}
    },
    [socket],
  );

  const ensurePeer = useCallback(
    (userId: string, name?: string, media?: PeerMedia) => {
      let entry = peersRef.current.get(userId);
      if (entry) {
        if (name) entry.name = name;
        if (media) entry.media = media;
        return entry;
      }
      const pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 2 });
      const stream = new MediaStream();
      entry = {
        pc,
        stream,
        name: name || userName(userId),
        media: media || { audio: true, video: kindRef.current === 'video', screen: false },
        pending: [],
        remoteSet: false,
        offered: false,
        connected: false,
        lastRestart: 0,
      };
      for (const track of outgoingTracks()) {
        try {
          pc.addTrack(track);
        } catch {}
      }
      pc.onicecandidate = (event) => {
        if (event.candidate && callIdRef.current && socket) {
          socket.emit('rtc:ice', {
            callId: callIdRef.current,
            to: userId,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (event) => {
        const existing = peersRef.current.get(userId);
        if (!existing) return;
        const tracks = existing.stream.getTracks().filter((t) => t.id !== event.track.id);
        existing.stream = new MediaStream([...tracks, event.track]);
        event.track.onunmute = () => syncPeers();
        syncPeers();
      };
      pc.onconnectionstatechange = () => {
        const existing = peersRef.current.get(userId);
        if (!existing) return;
        const state = pc.connectionState;
        existing.connected = state === 'connected';
        if (state === 'connected') existing.lastRestart = 0;
        syncPeers();
        if (state === 'failed') {
          toast(`Could not connect directly to ${existing.name}. Your Wi-Fi may block device-to-device traffic.`, {
            type: 'error',
          });
          void restartPeer(userId, existing);
        }
      };
      peersRef.current.set(userId, entry);
      return entry;
    },
    [outgoingTracks, restartPeer, socket, syncPeers, toast, userName],
  );

  const flushCandidates = async (entry: PeerEntry) => {
    if (!entry.remoteSet) return;
    const list = entry.pending;
    entry.pending = [];
    for (const candidate of list) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {}
    }
  };

  const sendOffer = useCallback(
    async (userId: string) => {
      const entry = peersRef.current.get(userId);
      if (!entry || entry.offered) return;
      entry.offered = true;
      try {
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        socket?.emit('rtc:offer', {
          callId: callIdRef.current,
          to: userId,
          sdp: entry.pc.localDescription,
        });
      } catch (err) {
        console.error('offer failed', err);
      }
    },
    [socket],
  );

  const buildCall = useCallback(
    (state: LiveCall, stream: MediaStream, connectedAt: number | null): ActiveCall => {
      const selfId = me?.id || '';
      const others = state.participants.filter((p) => p.userId !== selfId);
      for (const p of others) ensurePeer(p.userId, p.name, p.media);
      const peers: CallPeer[] = others.map((p) => {
        const entry = peersRef.current.get(p.userId)!;
        return {
          userId: p.userId,
          name: entry.name,
          stream: entry.stream.getTracks().length ? entry.stream : null,
          media: entry.media,
          connected: entry.connected,
        };
      });
      return {
        id: state.id,
        conversationId: state.conversationId,
        kind: state.kind,
        initiatorId: state.initiatorId,
        startedAt: state.startedAt,
        connectedAt,
        status: state.status === 'ringing' ? 'ringing' : 'active',
        localStream: stream,
        localPreview: stream,
        peers,
        muted: false,
        cameraOn: state.kind === 'video',
        screenSharing: false,
        facing: facingRef.current,
      };
    },
    [ensurePeer, me?.id],
  );

  const cleanup = useCallback((keepIncoming = false) => {
    stopRingtone();
    for (const entry of peersRef.current.values()) {
      try {
        entry.pc.close();
      } catch {}
    }
    peersRef.current.clear();
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) track.stop();
    }
    if (screenTrackRef.current) {
      try {
        screenTrackRef.current.stop();
      } catch {}
    }
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    localStreamRef.current = null;
    callIdRef.current = null;
    conversationIdRef.current = null;
    facingRef.current = 'user';
    setCall(null);
    if (!keepIncoming) setIncoming(null);
  }, []);

  const getMedia = useCallback(async (kind: 'audio' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support camera and microphone access.');
    }
    if (!window.isSecureContext) {
      throw new Error('Calls need HTTPS. Open Lantern using the https:// address of the host laptop.');
    }
    return navigator.mediaDevices.getUserMedia(mediaConstraints(kind, facingRef.current));
  }, []);

  const startCall = useCallback(
    async (conversationId: string, kind: 'audio' | 'video') => {
      if (callRef.current) {
        toast('You are already in a call.', { type: 'info' });
        return;
      }
      if (incomingRef.current) {
        toast('Answer or decline the incoming call first.', { type: 'info' });
        return;
      }
      if (!socket?.connected) {
        toast('You are offline. Reconnect to Wi-Fi before starting a call.', { type: 'error' });
        return;
      }
      let stream: MediaStream;
      try {
        stream = await getMedia(kind);
      } catch (err) {
        toast(err instanceof Error ? err.message : friendlyMediaError(err), { type: 'error' });
        return;
      }
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      facingRef.current = 'user';
      kindRef.current = kind;
      conversationIdRef.current = conversationId;

      const res = await emitWithAck<{ ok?: boolean; call?: LiveCall; error?: string }>(socket, 'call:invite', {
        conversationId,
        kind,
      });
      if (!res || res.error || !res.call) {
        for (const track of stream.getTracks()) track.stop();
        localStreamRef.current = null;
        cameraTrackRef.current = null;
        toast(res?.error || 'The call could not be started. No response from the server.', { type: 'error' });
        return;
      }
      callIdRef.current = res.call.id;
      const active = buildCall(res.call, stream, null);
      setCall(active);
      callRef.current = active;
      playCallStart();
      socket.emit('call:media', {
        callId: res.call.id,
        audio: true,
        video: kind === 'video',
        screen: false,
      });
    },
    [buildCall, getMedia, socket, toast],
  );

  const acceptIncoming = useCallback(async () => {
    const pending = incomingRef.current;
    if (!pending) return;
    let stream: MediaStream;
    try {
      stream = await getMedia(pending.kind);
    } catch (err) {
      toast(err instanceof Error ? err.message : friendlyMediaError(err), { type: 'error' });
      socket?.emit('call:reject', { callId: pending.callId });
      stopRingtone();
      setIncoming(null);
      return;
    }
    localStreamRef.current = stream;
    cameraTrackRef.current = stream.getVideoTracks()[0] || null;
    kindRef.current = pending.kind;
    conversationIdRef.current = pending.conversationId;
    callIdRef.current = pending.callId;
    stopRingtone();
    const res = await emitWithAck<{ ok?: boolean; call?: LiveCall; error?: string }>(socket, 'call:accept', {
      callId: pending.callId,
    });
    if (!res || res.error || !res.call) {
      for (const track of stream.getTracks()) track.stop();
      localStreamRef.current = null;
      cameraTrackRef.current = null;
      callIdRef.current = null;
      toast(res?.error || 'Could not join the call. No response from the server.', { type: 'error' });
      setIncoming(null);
      return;
    }
    setIncoming(null);
    const active = buildCall(res.call, stream, Date.now());
    setCall(active);
    callRef.current = active;
    playCallStart();
    socket?.emit('call:media', {
      callId: pending.callId,
      audio: true,
      video: pending.kind === 'video',
      screen: false,
    });
  }, [buildCall, getMedia, socket, toast]);

  const rejectIncoming = useCallback(() => {
    const pending = incomingRef.current;
    if (!pending) return;
    socket?.emit('call:reject', { callId: pending.callId });
    stopRingtone();
    setIncoming(null);
  }, [socket]);

  const endCall = useCallback(() => {
    if (callIdRef.current) socket?.emit('call:end', { callId: callIdRef.current });
    playCallEnd();
    cleanup();
    void refreshCalls();
  }, [cleanup, refreshCalls, socket]);

  const emitMedia = useCallback(
    (extra?: Partial<{ audio: boolean; video: boolean; screen: boolean }>) => {
      if (!socket || !callIdRef.current) return;
      const current = callRef.current;
      socket.emit('call:media', {
        callId: callIdRef.current,
        audio: !(current?.muted ?? false),
        video: current?.cameraOn ?? true,
        screen: current?.screenSharing ?? false,
        ...extra,
      });
    },
    [socket],
  );

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !(callRef.current?.muted ?? false);
    for (const track of stream.getAudioTracks()) track.enabled = !nextMuted;
    setCall((prev) => (prev ? { ...prev, muted: nextMuted } : prev));
    callRef.current = callRef.current ? { ...callRef.current, muted: nextMuted } : callRef.current;
    emitMedia({ audio: !nextMuted });
  }, [emitMedia]);

  const toggleCamera = useCallback(() => {
    const track = cameraTrackRef.current;
    if (!track) return;
    const nextOn = !(callRef.current?.cameraOn ?? true);
    track.enabled = nextOn;
    setCall((prev) => (prev ? { ...prev, cameraOn: nextOn } : prev));
    callRef.current = callRef.current ? { ...callRef.current, cameraOn: nextOn } : callRef.current;
    emitMedia({ video: nextOn });
  }, [emitMedia]);

  const flipCamera = useCallback(async () => {
    if (kindRef.current !== 'video') return;
    if (screenTrackRef.current) {
      toast('Stop screen sharing before switching cameras.', { type: 'info' });
      return;
    }
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newTrack = fresh.getVideoTracks()[0];
      if (!newTrack) throw new Error('No camera found.');
      const oldTrack = cameraTrackRef.current;
      for (const entry of peersRef.current.values()) {
        const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack).catch(() => {});
      }
      newTrack.enabled = callRef.current?.cameraOn ?? true;
      cameraTrackRef.current = newTrack;
      facingRef.current = next;
      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getVideoTracks()) {
          stream.removeTrack(track);
          track.stop();
        }
        stream.addTrack(newTrack);
      }
      if (oldTrack && oldTrack !== newTrack) oldTrack.stop();
      setCall((prev) => (prev ? { ...prev, facing: next, localStream: localStreamRef.current, localPreview: localStreamRef.current } : prev));
    } catch (err) {
      toast(friendlyMediaError(err), { type: 'error' });
    }
  }, [toast]);

  const stopScreenShareInternal = useCallback(() => {
    const track = screenTrackRef.current;
    screenTrackRef.current = null;
    if (track) {
      track.onended = null;
      track.stop();
    }
    const camera = cameraTrackRef.current;
    for (const entry of peersRef.current.values()) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && camera) void sender.replaceTrack(camera).catch(() => {});
    }
    setCall((prev) =>
      prev
        ? { ...prev, screenSharing: false, localPreview: localStreamRef.current, cameraOn: camera ? camera.enabled : prev.cameraOn }
        : prev,
    );
    if (callRef.current) callRef.current = { ...callRef.current, screenSharing: false };
    emitMedia({ screen: false });
  }, [emitMedia]);

  const toggleScreenShare = useCallback(async () => {
    if (!callRef.current || kindRef.current !== 'video') {
      toast('Screen sharing is available during video calls.', { type: 'info' });
      return;
    }
    if (screenTrackRef.current) {
      stopScreenShareInternal();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast('This browser does not support screen sharing.', { type: 'error' });
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      track.onended = () => stopScreenShareInternal();
      for (const entry of peersRef.current.values()) {
        const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track).catch(() => {});
      }
      const preview = new MediaStream([track]);
      setCall((prev) => (prev ? { ...prev, screenSharing: true, localPreview: preview } : prev));
      if (callRef.current) callRef.current = { ...callRef.current, screenSharing: true };
      emitMedia({ screen: true });
    } catch (err) {
      if ((err as DOMException)?.name !== 'NotAllowedError') {
        toast('Screen sharing could not be started.', { type: 'error' });
      }
    }
  }, [emitMedia, stopScreenShareInternal, toast]);

  /* ------------------------------- socket events ------------------------------- */
  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: {
      call: LiveCall;
      conversation: { id: string; type: 'dm' | 'group'; name: string | null; title: string };
      caller: User;
    }) => {
      if (callRef.current || incomingRef.current) {
        socket.emit('call:reject', { callId: payload.call.id });
        toast(`${payload.caller.name} is calling, but you are busy.`, { type: 'info' });
        return;
      }
      const incomingCall: IncomingCall = {
        callId: payload.call.id,
        conversationId: payload.conversation.id,
        conversationTitle: payload.conversation.title,
        conversationType: payload.conversation.type,
        kind: payload.call.kind,
        caller: payload.caller,
        startedAt: payload.call.startedAt,
      };
      setIncoming(incomingCall);
      incomingRef.current = incomingCall;
      startRingtone();
      if (
        settings.desktopNotifications &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          const note = new Notification(`Incoming ${payload.call.kind} call`, {
            body: `${payload.caller.name} is calling`,
            tag: 'lantern-call',
            requireInteraction: true,
          });
          note.onclick = () => {
            window.focus();
            note.close();
          };
        } catch {}
      }
    };

    const onJoined = (payload: { call: LiveCall }) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      stopRingtone();
      const existing = callRef.current;
      const active = buildCall(payload.call, stream, existing?.connectedAt || Date.now());
      active.muted = existing?.muted ?? false;
      active.cameraOn = existing?.cameraOn ?? active.cameraOn;
      setCall(active);
      callRef.current = active;
      setIncoming(null);
    };

    const onPeerJoined = (payload: { callId: string; userId: string; name: string; media: PeerMedia }) => {
      if (!callRef.current || payload.callId !== callIdRef.current) return;
      ensurePeer(payload.userId, payload.name, payload.media);
      syncPeers();
      setCall((prev) => {
        if (!prev) return prev;
        const next = prev.status === 'ringing' ? { ...prev, status: 'active' as const, connectedAt: Date.now() } : prev;
        callRef.current = next;
        return next;
      });
      void sendOffer(payload.userId);
    };

    const onPeerLeft = (payload: { callId: string; userId: string }) => {
      if (payload.callId !== callIdRef.current) return;
      const entry = peersRef.current.get(payload.userId);
      if (entry) {
        try {
          entry.pc.close();
        } catch {}
        peersRef.current.delete(payload.userId);
      }
      syncPeers();
      if (entry) toast(`${entry.name} left the call.`, { type: 'info' });
    };

    const onPeerRejected = (payload: { callId: string; userId: string; name: string }) => {
      if (payload.callId !== callIdRef.current) return;
      toast(`${payload.name} declined the call.`, { type: 'info' });
    };

    const onEnded = (payload: { callId: string; status: string; duration: number; reason: string }) => {
      if (payload.callId === incomingRef.current?.callId) {
        stopRingtone();
        setIncoming(null);
        toast(`Missed ${incomingRef.current?.kind} call from ${incomingRef.current?.caller.name}.`, { type: 'info' });
        cleanup();
        void refreshCalls();
        return;
      }
      if (payload.callId !== callIdRef.current) return;
      const wasActive = callRef.current?.status === 'active';
      playCallEnd();
      cleanup();
      if (payload.status === 'rejected') toast('Call declined.', { type: 'info' });
      else if (payload.status === 'missed') toast(wasActive ? 'Call ended.' : 'No answer.', { type: 'info' });
      else toast(payload.duration ? `Call ended · ${formatDuration(payload.duration)}` : 'Call ended.', { type: 'info' });
      void refreshCalls();
    };

    const onMedia = (payload: { callId: string; userId: string; media: PeerMedia }) => {
      if (payload.callId !== callIdRef.current) return;
      const entry = peersRef.current.get(payload.userId);
      if (!entry) return;
      entry.media = payload.media;
      syncPeers();
    };

    const onOffer = async (payload: { callId: string; from: string; sdp: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callIdRef.current) return;
      if (!localStreamRef.current) return;
      const entry = ensurePeer(payload.from, userName(payload.from));
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        entry.remoteSet = true;
        await flushCandidates(entry);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        socket.emit('rtc:answer', {
          callId: payload.callId,
          to: payload.from,
          sdp: entry.pc.localDescription,
        });
        syncPeers();
      } catch (err) {
        console.error('answer failed', err);
      }
    };

    const onAnswer = async (payload: { callId: string; from: string; sdp: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callIdRef.current) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        entry.remoteSet = true;
        await flushCandidates(entry);
      } catch (err) {
        console.error('set answer failed', err);
      }
    };

    const onIce = async (payload: { callId: string; from: string; candidate: RTCIceCandidateInit }) => {
      if (payload.callId !== callIdRef.current) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry) return;
      if (!entry.remoteSet) entry.pending.push(payload.candidate);
      else {
        try {
          await entry.pc.addIceCandidate(payload.candidate);
        } catch {}
      }
    };

    const onDisconnect = () => {
      if (callRef.current || incomingRef.current) {
        cleanup();
        toast('The call ended because the connection was lost.', { type: 'error' });
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:joined', onJoined);
    socket.on('call:peer-joined', onPeerJoined);
    socket.on('call:peer-left', onPeerLeft);
    socket.on('call:peer-rejected', onPeerRejected);
    socket.on('call:ended', onEnded);
    socket.on('call:media', onMedia);
    socket.on('rtc:offer', onOffer);
    socket.on('rtc:answer', onAnswer);
    socket.on('rtc:ice', onIce);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:joined', onJoined);
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:peer-rejected', onPeerRejected);
      socket.off('call:ended', onEnded);
      socket.off('call:media', onMedia);
      socket.off('rtc:offer', onOffer);
      socket.off('rtc:answer', onAnswer);
      socket.off('rtc:ice', onIce);
      socket.off('disconnect', onDisconnect);
    };
  }, [
    socket,
    cleanup,
    ensurePeer,
    buildCall,
    syncPeers,
    sendOffer,
    settings.desktopNotifications,
    toast,
    refreshCalls,
    userName,
  ]);

  useEffect(() => () => cleanup(), [cleanup]);

  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(() => {
      if (incomingRef.current) {
        socket?.emit('call:reject', { callId: incoming.callId });
        setIncoming(null);
        stopRingtone();
        toast(`Missed ${incoming.kind} call from ${incoming.caller.name}.`, { type: 'info' });
        void refreshCalls();
      }
    }, 55_000);
    return () => clearTimeout(timer);
  }, [incoming, socket, toast, refreshCalls]);

  return (
    <CallContext.Provider
      value={{
        call,
        incoming,
        startCall,
        acceptIncoming,
        rejectIncoming,
        endCall,
        toggleMute,
        toggleCamera,
        flipCamera,
        toggleScreenShare,
        canShareScreen: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}
