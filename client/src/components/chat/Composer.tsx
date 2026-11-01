import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  FileText,
  Image as ImageIcon,
  MapPin,
  Mic,
  Paperclip,
  Send,
  Smile,
  SwitchCamera,
  Trash2,
  X,
} from 'lucide-react';
import type { Conversation, Message } from '../../types';
import { useApp } from '../../context/AppContext';
import { cx } from '../../lib/utils';
import { EmojiPicker } from '../EmojiPicker';

interface Props {
  conversation: Conversation;
  replyTo: Message | null;
  editing: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

export function Composer({ conversation, replyTo, editing, onCancelReply, onCancelEdit }: Props) {
  const { sendText, editMessage, setTyping, uploadFiles, uploadVoice, uploadFromCanvas, sendLocation, toast, connected } =
    useApp();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);
  const textRef = useRef(text);
  const drafts = useRef<Map<string, string>>(new Map());
  const editingRef = useRef<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderStream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelRecord = useRef(false);
  const recordTimer = useRef<number | null>(null);
  const recordSecondsRef = useRef(0);

  textRef.current = text;

  const stopTyping = useCallback(() => {
    if (typingTimer.current) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    if (typingActive.current) {
      typingActive.current = false;
      setTyping(conversation.id, false);
    }
  }, [conversation.id, setTyping]);

  useEffect(() => {
    setText(drafts.current.get(conversation.id) || '');
    setEmojiOpen(false);
    setAttachOpen(false);
    return () => {
      drafts.current.set(conversation.id, textRef.current);
      stopTyping();
    };
  }, [conversation.id, stopTyping]);

  useEffect(() => {
    if (editing) {
      editingRef.current = editing.id;
      setText(editing.body || '');
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else if (editingRef.current) {
      editingRef.current = null;
      setText('');
    }
  }, [editing]);

  useEffect(() => {
    if (!replyTo && !editing) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [replyTo, editing]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      if (recordTimer.current) window.clearInterval(recordTimer.current);
      recorder.current?.state === 'recording' && recorder.current.stop();
      recorderStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const onChange = (value: string) => {
    setText(value);
    drafts.current.set(conversation.id, value);
    if (!typingActive.current && value.trim()) {
      typingActive.current = true;
      setTyping(conversation.id, true);
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      if (typingActive.current) {
        typingActive.current = false;
        setTyping(conversation.id, false);
      }
    }, 2500);
    if (!value.trim()) stopTyping();
  };

  const send = async () => {
    const value = textRef.current.trim();
    if (editing) {
      if (!value || value === (editing.body || '').trim()) {
        onCancelEdit();
        return;
      }
      setSending(true);
      const ok = await editMessage(editing.id, value);
      setSending(false);
      if (ok) {
        setText('');
        drafts.current.set(conversation.id, '');
        onCancelEdit();
        stopTyping();
      }
      return;
    }
    if (!value) return;
    const replyId = replyTo?.id || null;
    setText('');
    drafts.current.set(conversation.id, '');
    stopTyping();
    const ok = await sendText(conversation.id, value, replyId);
    if (!ok) {
      setText(value);
      drafts.current.set(conversation.id, value);
    } else if (replyId) {
      onCancelReply();
    }
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setAttachOpen(false);
    stopTyping();
    await uploadFiles(list, conversation.id, replyTo?.id || null);
    if (replyTo) onCancelReply();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Voice messages are not supported by this browser.', { type: 'error' });
      return;
    }
    if (!window.isSecureContext) {
      toast('Voice messages need HTTPS. Open Lantern using the https:// address.', { type: 'error' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      cancelRecord.current = false;
      recorderStream.current = stream;
      recorder.current = rec;
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      rec.onstop = async () => {
        const duration = recordSecondsRef.current;
        const cancelled = cancelRecord.current;
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        recorderStream.current = null;
        if (recordTimer.current) {
          window.clearInterval(recordTimer.current);
          recordTimer.current = null;
        }
        setRecording(false);
        setRecordSeconds(0);
        recordSecondsRef.current = 0;
        if (!cancelled && duration >= 1 && blob.size > 0) {
          await uploadVoice(blob, conversation.id, duration, replyTo?.id || null);
          if (replyTo) onCancelReply();
        }
      };
      rec.start(250);
      setRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      recordTimer.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
        if (recordSecondsRef.current >= 180) rec.stop();
      }, 1000);
    } catch (err) {
      const name = (err as DOMException)?.name;
      toast(
        name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow it in your browser settings.'
          : 'Could not start recording. Check that a microphone is available.',
        { type: 'error' },
      );
    }
  };

  const finishRecording = (cancel: boolean) => {
    const rec = recorder.current;
    if (!rec) return;
    cancelRecord.current = cancel;
    if (rec.state === 'recording') rec.stop();
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length) {
      event.preventDefault();
      void uploadFiles(files, conversation.id, replyTo?.id || null);
    }
  };

  const canSend = text.trim().length > 0 && connected;

  return (
    <div className="border-t border-line bg-panel px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 sm:px-5">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-line bg-panel2 px-3 py-2 animate-rise">
          <span className="mt-0.5 h-full min-h-[28px] w-[3px] shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent">
              {editing ? 'Editing message' : `Replying to ${replyTo?.senderName}`}
            </div>
            <div className="truncate text-[11.5px] text-ink2">{replySnippet(editing || replyTo)}</div>
          </div>
          <button
            onClick={() => {
              if (editing) onCancelEdit();
              else onCancelReply();
            }}
            className="icon-btn h-7 w-7 shrink-0"
            aria-label="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/25 bg-danger/5 px-3 py-2.5">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-white">
            <span className="absolute inset-0 animate-pulse-ring rounded-full" />
            <Mic size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-danger">Recording voice message</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-ink3">
              <span className="font-mono text-[11px] tabular-nums text-ink2">{clock(recordSeconds)}</span>
              <span className="ml-1 flex items-end gap-[2px]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-[2px] animate-blink rounded-full bg-danger/60"
                    style={{ height: 4 + ((i * 5) % 12), animationDelay: `${i * 0.07}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
          <button
            onClick={() => finishRecording(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-danger"
            title="Discard recording"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => finishRecording(false)}
            className="btn-primary h-9 px-4 py-0"
            title="Send voice message"
          >
            <Send size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2">
          <div className="relative flex items-end gap-1 pb-0.5">
            <button
              onClick={() => {
                setEmojiOpen((v) => !v);
                setAttachOpen(false);
              }}
              className={cx('icon-btn h-9 w-9', emojiOpen && 'bg-panel3 text-ink')}
              title="Emoji"
              aria-label="Emoji"
            >
              <Smile size={19} />
            </button>
            <button
              onClick={() => {
                setAttachOpen((v) => !v);
                setEmojiOpen(false);
              }}
              className={cx('icon-btn h-9 w-9', attachOpen && 'bg-panel3 text-ink')}
              title="Attach"
              aria-label="Attach"
            >
              <Paperclip size={18} />
            </button>
          </div>

          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && (editing || replyTo)) {
                  e.preventDefault();
                  if (editing) onCancelEdit();
                  else onCancelReply();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={handlePaste}
              onBlur={() => stopTyping()}
              rows={1}
              placeholder={
                connected ? `Message ${conversationName(conversation)}` : 'Reconnecting — messages are paused'
              }
              className="field max-h-[150px] min-h-[40px] resize-none rounded-2xl py-2.5 pr-3 text-[13.5px] leading-relaxed"
              style={{ overflowY: text.length > 140 ? 'auto' : 'hidden' }}
            />

            {emojiOpen && (
              <div className="absolute bottom-full left-0 z-30 mb-2 animate-fade-up">
                <EmojiPicker
                  onPick={(emoji) => {
                    onChange(textRef.current + emoji);
                    textareaRef.current?.focus();
                  }}
                  onClose={() => setEmojiOpen(false)}
                />
              </div>
            )}

            {attachOpen && (
              <div className="card absolute bottom-full left-0 z-30 mb-2 w-[236px] overflow-hidden p-1.5 animate-fade-up">
                <AttachItem
                  icon={ImageIcon}
                  label="Photos & videos"
                  hint="From this device"
                  onClick={() => {
                    setAttachOpen(false);
                    photoInput.current?.click();
                  }}
                />
                <AttachItem
                  icon={FileText}
                  label="Document"
                  hint="Any file type"
                  onClick={() => {
                    setAttachOpen(false);
                    fileInput.current?.click();
                  }}
                />
                <AttachItem
                  icon={Camera}
                  label="Camera"
                  hint="Take a photo"
                  onClick={() => {
                    setAttachOpen(false);
                    setCameraOpen(true);
                  }}
                />
                <AttachItem
                  icon={MapPin}
                  label="Location"
                  hint="Share where you are"
                  onClick={() => {
                    setAttachOpen(false);
                    void sendLocation(conversation.id);
                  }}
                />
              </div>
            )}
          </div>

          {text.trim() || editing ? (
            <button
              onClick={() => void send()}
              disabled={!connected || sending || (editing !== null && !text.trim())}
              className="btn-primary mb-0.5 h-10 w-10 shrink-0 rounded-full px-0 py-0"
              title="Send"
              aria-label="Send message"
            >
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Send size={17} />
              )}
            </button>
          ) : (
            <button
              onClick={() => void startRecording()}
              disabled={!connected}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-panel2 text-ink2 transition hover:border-line2 hover:bg-panel3 hover:text-ink active:scale-95 disabled:opacity-40"
              title="Record a voice message"
              aria-label="Record a voice message"
            >
              <Mic size={18} />
            </button>
          )}

          <input
            ref={photoInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => void pickFiles(e.target.files).then(() => (e.target.value = ''))}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => void pickFiles(e.target.files).then(() => (e.target.value = ''))}
          />
        </div>
      )}

      {!recording && (
        <div className="mt-1 hidden justify-between px-1 text-[10px] text-ink3 sm:flex">
          <span>{editing ? 'Press Escape to cancel editing' : 'Enter to send · Shift + Enter for a new line'}</span>
          <span>{connected ? 'Messages stay on your Wi-Fi' : 'Offline'}</span>
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={async (blob) => {
            setCameraOpen(false);
            await uploadFromCanvas(
              blob,
              `Camera ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }).replace(/[: ]/g, '-')}.jpg`,
              conversation.id,
            );
          }}
        />
      )}
    </div>
  );
}

function AttachItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof ImageIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-panel2"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accentsoft text-accent">
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-ink">{label}</span>
        <span className="block text-[10px] text-ink3">{hint}</span>
      </span>
    </button>
  );
}

function conversationName(conversation: Conversation) {
  return conversation.type === 'group' ? conversation.name || 'the group' : 'this person';
}

function replySnippet(message: Message | null) {
  if (!message) return '';
  if (message.type === 'image') return '📷 Photo';
  if (message.type === 'video') return '🎬 Video';
  if (message.type === 'voice') return '🎙️ Voice message';
  if (message.type === 'audio') return `🎵 ${message.meta?.name || 'Audio'}`;
  if (message.type === 'file') return `📄 ${message.meta?.name || 'Document'}`;
  if (message.type === 'location') return '📍 Shared location';
  if (message.type === 'call') return '📞 Call';
  return message.body || '';
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function CameraCapture({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (blob: Blob) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [snapping, setSnapping] = useState(false);

  const start = useCallback(async (mode: 'user' | 'environment') => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setReady(false);
    setError(null);
    try {
      if (!window.isSecureContext) throw new Error('Camera needs HTTPS. Open Lantern using the https:// address.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow it in your browser settings.'
          : err instanceof Error
            ? err.message
            : 'Could not open the camera.',
      );
    }
  }, []);

  useEffect(() => {
    void start(facing);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    await start(next);
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setSnapping(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setSnapping(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      async (blob) => {
        setSnapping(false);
        if (blob) await onCapture(blob);
      },
      'image/jpeg',
      0.9,
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[92] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="text-[13px] font-semibold">Take a photo</div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="Close camera">
          <X size={18} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
        {!ready && !error && (
          <div className="absolute flex flex-col items-center gap-3 text-white/70">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            <span className="text-[12px]">Opening camera…</span>
          </div>
        )}
        {error && (
          <div className="absolute max-w-xs rounded-2xl bg-white/10 px-5 py-4 text-center text-[12.5px] leading-relaxed text-white/80">
            {error}
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-8 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
        <button onClick={flip} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Switch camera">
          <SwitchCamera size={20} />
        </button>
        <button
          onClick={() => void capture()}
          disabled={!ready || snapping}
          className="flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-white/80 bg-white/25 transition active:scale-95 disabled:opacity-40"
          aria-label="Take photo"
        >
          <span className="h-11 w-11 rounded-full bg-white" />
        </button>
        <div className="h-11 w-11" />
      </div>
    </div>,
    document.body,
  );
}
