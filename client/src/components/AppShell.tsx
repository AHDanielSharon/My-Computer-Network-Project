import { useState } from 'react';
import {
  FolderOpen,
  Home,
  MessageSquare,
  Moon,
  Phone,
  QrCode,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { NavTab } from '../types';
import { cx } from '../lib/utils';
import { Sidebar } from './Sidebar';
import { LanternMark } from './Logo';
import { UserAvatar } from './Avatar';
import { HomeView } from '../views/HomeView';
import { PeopleView } from '../views/PeopleView';
import { FilesView } from '../views/FilesView';
import { CallsView } from '../views/CallsView';
import { ChatView } from './chat/ChatView';
import { UploadTray } from './UploadTray';

const NAV: { id: NavTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'people', label: 'People', icon: Users },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'calls', label: 'Calls', icon: Phone },
];

export function AppShell() {
  const { nav, activeId, connected, conversations } = useApp();
  const desktop = useMediaQuery('(min-width: 900px)');
  const inChat = nav === 'chats' && !!activeId;

  const showSidebar = desktop ? nav === 'home' || nav === 'chats' : nav === 'chats' && !inChat;
  const showMain = desktop ? true : nav !== 'chats' || inChat;
  const unread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <div className="flex min-h-0 flex-1">
        {desktop && <NavRail unread={unread} />}
        {showSidebar && (
          <aside
            className={cx(
              'flex min-h-0 shrink-0 flex-col border-r border-line bg-panel',
              desktop ? 'w-[336px]' : 'w-full',
            )}
          >
            <Sidebar />
          </aside>
        )}
        {showMain && (
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            {nav === 'home' && <HomeView />}
            {nav === 'chats' && (activeId ? <ChatView /> : <NoChatSelected />)}
            {nav === 'people' && <PeopleView />}
            {nav === 'files' && <FilesView />}
            {nav === 'calls' && <CallsView />}
            {!connected && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
                <div className="mt-2 flex items-center gap-2 rounded-full border border-danger/25 bg-panel/95 px-3 py-1.5 text-[11px] font-semibold text-danger shadow-lg backdrop-blur animate-fade-in">
                  <span className="h-1.5 w-1.5 animate-blink rounded-full bg-danger" />
                  Offline — reconnecting to the local server
                </div>
              </div>
            )}
          </main>
        )}
      </div>
      {!desktop && <MobileNav unread={unread} />}
      <UploadTray />
    </div>
  );
}

function NavRail({ unread }: { unread: number }) {
  const { nav, setNav, me, resolvedTheme, toggleTheme } = useApp();
  const { openSettings, openInvite, openProfile } = useUi();

  return (
    <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-line bg-panel2/50 py-4">
      <button onClick={() => setNav('home')} className="mb-6" title="Lantern home" aria-label="Home">
        <LanternMark size={36} />
      </button>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = nav === id;
          return (
            <button
              key={id}
              onClick={() => setNav(id)}
              className={cx(
                'relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-150 active:scale-95',
                active
                  ? 'bg-accentsoft text-accent shadow-sm'
                  : 'text-ink3 hover:bg-panel3 hover:text-ink',
              )}
              title={label}
              aria-label={label}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.9} />
              {id === 'chats' && unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white ring-2 ring-panel2">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
              {active && (
                <span className="absolute -left-[14.5px] top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-2 flex flex-col items-center gap-1">
        <button onClick={openInvite} className="icon-btn h-10 w-10" title="Invite people" aria-label="Invite people">
          <QrCode size={18} />
        </button>
        <button
          onClick={toggleTheme}
          className="icon-btn h-10 w-10"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={openSettings} className="icon-btn h-10 w-10" title="Settings" aria-label="Settings">
          <Settings size={18} />
        </button>
        {me && (
          <button onClick={() => openProfile(me)} className="mt-1.5 rounded-full ring-2 ring-transparent transition hover:ring-accent/40" title="Your profile">
            <UserAvatar user={me} size={38} showStatus={false} />
          </button>
        )}
      </div>
    </aside>
  );
}

function MobileNav({ unread }: { unread: number }) {
  const { nav, setNav } = useApp();
  return (
    <nav className="safe-b flex shrink-0 items-stretch justify-around border-t border-line bg-panel/95 px-1 pt-1.5 backdrop-blur-xl">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = nav === id;
        return (
          <button
            key={id}
            onClick={() => setNav(id)}
            className={cx(
              'relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition',
              active ? 'text-accent' : 'text-ink3',
            )}
          >
            <span className="relative">
              <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
              {id === 'chats' && unread > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white ring-2 ring-panel">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
            {label}
            {active && <span className="absolute -top-1.5 h-0.5 w-6 rounded-full bg-accent" />}
          </button>
        );
      })}
    </nav>
  );
}

function NoChatSelected() {
  const { conversations, me, users } = useApp();
  const { openNewChat, openNewGroup, openInvite } = useUi();
  const [tip] = useState(() => Math.floor(Math.random() * 3));
  const tips = [
    'Share big files without a cloud limit — they stay on the host laptop.',
    'Make a voice call without internet. The audio goes device to device.',
    'Drop a photo into the chat and it is saved right on your network.',
  ];

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.1),transparent_65%)]" />
      </div>
      <div className="relative flex max-w-md flex-col items-center animate-fade-up">
        <div className="relative">
          <div className="absolute inset-0 rounded-[30px] bg-accent/20 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border border-line bg-panel text-accent shadow-sm">
            <MessageSquare size={34} strokeWidth={1.6} />
          </div>
        </div>
        <h2 className="mt-5 text-[22px] font-bold tracking-tight text-ink">Your conversations live here</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink2">
          Pick a chat on the left, or start a new one. {users.length > 1 ? `${users.length - 1} other people are on this network.` : 'Invite people to this Wi-Fi to begin.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button onClick={openNewChat} className="btn-primary">
            <MessageSquare size={15} /> New chat
          </button>
          <button onClick={openNewGroup} className="btn-ghost">
            <Users size={15} /> New group
          </button>
          <button onClick={openInvite} className="btn-ghost">
            <QrCode size={15} /> Invite
          </button>
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-panel/70 px-4 py-3 text-[11.5px] leading-relaxed text-ink3 backdrop-blur">
          <span className="font-semibold text-ink2">Tip · </span>
          {tips[tip]}
        </div>
        {conversations.length > 0 && (
          <div className="mt-4 text-[11px] text-ink3">
            {conversations.reduce((sum, c) => sum + c.unread, 0)} unread across {conversations.length} chats
          </div>
        )}
      </div>
    </div>
  );
}
