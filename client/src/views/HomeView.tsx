import { useMemo } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  FileText,
  Film,
  FolderOpen,
  Link2,
  MessageSquare,
  Music,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { fileUrl } from '../lib/api';
import type { FileItem } from '../types';
import { Avatar, UserAvatar } from '../components/Avatar';
import {
  conversationColor,
  conversationTitle,
  cx,
  formatBytes,
  formatCallDuration,
  formatListTime,
  greeting,
  messagePreview,
} from '../lib/utils';

export function HomeView() {
  const {
    me,
    users,
    onlineCount,
    conversations,
    recentFiles,
    callHistory,
    serverInfo,
    connected,
    openConversation,
    toast,
    setNav,
  } = useApp();
  const { openInvite, openNewChat, openNewGroup, openProfile, openSettings, openImage } = useUi();

  const online = useMemo(() => users.filter((u) => u.online), [users]);
  const recentChats = useMemo(() => conversations.slice(0, 5), [conversations]);
  const recentCalls = useMemo(() => callHistory.slice(0, 4), [callHistory]);
  const primary = useMemo(() => {
    const urls = serverInfo?.urls || [];
    const preferred = serverInfo?.primaryUrl;
    if (preferred && urls.some((entry) => entry.url === preferred)) return preferred;
    return urls.find((entry) => entry.label !== 'localhost')?.url || urls[0]?.url || '';
  }, [serverInfo]);

  const copy = async () => {
    if (!primary) return;
    try {
      await navigator.clipboard.writeText(primary);
      toast('Invite link copied.', { type: 'success' });
    } catch {
      toast(primary, { type: 'info' });
    }
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink3">
              {greeting()}
            </div>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
              {me?.name || 'Welcome'}
            </h1>
            <p className="mt-1 text-[13px] text-ink2">
              {connected ? (
                <>
                  <span className="font-medium text-online">{onlineCount} online</span> · everything is staying on
                  your local network.
                </>
              ) : (
                <span className="font-medium text-danger">Reconnecting to the local server…</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openInvite} className="btn-ghost">
              <QrCode size={16} /> Invite
            </button>
            <button onClick={openNewChat} className="btn-primary">
              <MessageSquare size={16} /> New chat
            </button>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[26px] border border-line bg-panel">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.26),transparent_65%)] blur-xl" />
            <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.12),transparent_65%)] blur-xl" />
          </div>
          <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-online/25 bg-online/10 px-2.5 py-1 text-[11px] font-semibold text-online">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-online opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-online" />
                </span>
                Network live
              </div>
              <h2 className="mt-3 max-w-xl text-[24px] font-bold leading-[1.15] tracking-tight text-ink sm:text-[28px]">
                Your private room on the Wi-Fi.
              </h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink2">
                Share a link, and everyone in the room can join instantly. Messages, files and calls never leave
                your network.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={openInvite} className="btn-primary">
                  <UserPlus size={16} /> Invite people
                </button>
                <button onClick={openNewGroup} className="btn-ghost">
                  <Users size={16} /> New group
                </button>
                <button
                  onClick={copy}
                  className="ml-1 hidden items-center gap-1.5 text-[12px] font-medium text-ink2 hover:text-accent sm:flex"
                >
                  <Link2 size={13} className="truncate" />
                  <span className="max-w-[220px] truncate">{primary || 'Discovering address…'}</span>
                  <Copy size={12} />
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-4 text-[11.5px] text-ink3">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} className="text-accent" /> {users.length} people
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-accent" /> {conversations.length} chats
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FolderOpen size={13} className="text-accent" /> {recentFiles.length} shared files
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-line bg-panel2/80 p-3 backdrop-blur lg:w-[252px]">
              <div className="rounded-xl bg-white p-1.5 shadow-sm">
                {serverInfo?.qr ? (
                  <img src={serverInfo.qr} alt="Invite QR" className="h-[104px] w-[104px]" />
                ) : (
                  <div className="skeleton h-[104px] w-[104px] rounded-lg" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-ink">Scan to join</div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink3">
                  Point a phone camera here. Same Wi-Fi, no app install.
                </p>
                <button onClick={openInvite} className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent">
                  Show invite <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">Online now</h3>
                <button onClick={() => setNav('people')} className="text-[11.5px] font-semibold text-accent hover:underline">
                  View all
                </button>
              </div>
              <div className="mt-3 flex gap-4 overflow-x-auto pb-1 no-scrollbar">
                {online.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => openProfile(person)}
                    className="flex w-[62px] shrink-0 flex-col items-center gap-1.5 text-center"
                  >
                    <UserAvatar user={person} size={46} />
                    <span className="w-full truncate text-[11px] font-medium text-ink2">{person.name.split(' ')[0]}</span>
                  </button>
                ))}
                {!online.length && (
                  <div className="flex items-center gap-3 py-2 text-[12px] text-ink3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel2">
                      <WifiOff size={17} />
                    </span>
                    No one is online yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">Recent conversations</h3>
                <button onClick={() => setNav('chats')} className="text-[11.5px] font-semibold text-accent hover:underline">
                  Open chats
                </button>
              </div>
              <div className="mt-2 divide-y divide-line/70">
                {recentChats.map((conv) => {
                  const title = conversationTitle(conv, me?.id || '', users);
                  const other = conv.members.find((m) => m.id !== me?.id);
                  const liveOther = users.find((u) => u.id === other?.id);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv.id)}
                      className="flex w-full items-center gap-3 py-2.5 text-left transition hover:opacity-80"
                    >
                      <Avatar
                        name={title}
                        color={conversationColor(conv, me?.id || '', users)}
                        group={conv.type === 'group'}
                        userId={liveOther?.id}
                        avatarFile={liveOther?.avatarFile}
                        online={conv.type === 'dm' ? liveOther?.online : null}
                        busy={liveOther?.status === 'busy'}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{title}</div>
                        <div className="truncate text-[11.5px] text-ink3">
                          {messagePreview(conv.lastMessage, me?.id || '')}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10.5px] text-ink3">
                          {conv.lastMessage ? formatListTime(conv.lastMessage.createdAt) : ''}
                        </span>
                        {conv.unread > 0 && (
                          <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                            {conv.unread > 99 ? '99+' : conv.unread}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {!recentChats.length && (
                  <div className="py-8 text-center text-[12px] text-ink3">No conversations yet.</div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">Recently shared</h3>
                <button onClick={() => setNav('files')} className="text-[11.5px] font-semibold text-accent hover:underline">
                  All files
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {recentFiles.slice(0, 4).map((file) => (
                  <MiniFile key={file.id} file={file} onOpenImage={openImage} />
                ))}
                {!recentFiles.length && (
                  <div className="flex items-center gap-3 py-4 text-[12px] text-ink3">
                    <FolderOpen size={17} /> Files shared in chats appear here.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">Recent calls</h3>
                <button onClick={() => setNav('calls')} className="text-[11.5px] font-semibold text-accent hover:underline">
                  History
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {recentCalls.map((call) => {
                  const missed = call.status === 'missed' || call.status === 'rejected';
                  return (
                    <div key={call.id} className="flex items-center gap-2.5 py-1.5">
                      <div
                        className={cx(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          missed ? 'bg-danger/10 text-danger' : 'bg-online/10 text-online',
                        )}
                      >
                        {call.kind === 'video' ? <Video size={14} /> : <Phone size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-ink">{call.conversationTitle}</div>
                        <div className="text-[10.5px] text-ink3">
                          {missed ? 'Missed' : formatCallDuration(call.duration)} · {formatListTime(call.startedAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!recentCalls.length && (
                  <div className="flex items-center gap-3 py-4 text-[12px] text-ink3">
                    <Phone size={17} /> No calls yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                {connected ? (
                  <>
                    <Wifi size={15} className="text-online" /> Network status
                  </>
                ) : (
                  <>
                    <WifiOff size={15} className="text-danger" /> Reconnecting
                  </>
                )}
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink3">Server</span>
                  <span className={cx('font-medium', connected ? 'text-online' : 'text-danger')}>
                    {connected ? 'Connected' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink3">Security</span>
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <ShieldCheck size={12} className="text-online" />
                    {serverInfo?.https ? 'HTTPS' : 'HTTP'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink3">People</span>
                  <span className="font-medium text-ink">{onlineCount} online / {users.length} total</span>
                </div>
              </div>
              <button
                onClick={openSettings}
                className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent hover:underline"
              >
                <Sparkles size={12} /> Open settings
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniFile({
  file,
  onOpenImage,
}: {
  file: FileItem;
  onOpenImage: (image: { src: string; name: string; downloadUrl?: string }) => void;
}) {
  const isImage = file.mime.startsWith('image/');
  const isVideo = file.mime.startsWith('video/');
  const isAudio = file.mime.startsWith('audio/');
  const Icon = isVideo ? Film : isAudio ? Music : FileText;
  const download = fileUrl(file.id);

  const inner = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-panel2 text-ink3">
        {isImage ? (
          <img src={fileUrl(file.id, true)} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Icon size={16} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium text-ink">{file.name}</div>
        <div className="text-[10.5px] text-ink3">
          {formatBytes(file.size)} · {file.conversationTitle}
        </div>
      </div>
    </>
  );

  if (isImage) {
    return (
      <button
        onClick={() => onOpenImage({ src: fileUrl(file.id, true), name: file.name, downloadUrl: download })}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition hover:bg-panel2"
      >
        {inner}
      </button>
    );
  }

  return (
    <a
      href={download}
      download={file.name}
      className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition hover:bg-panel2"
    >
      {inner}
    </a>
  );
}
