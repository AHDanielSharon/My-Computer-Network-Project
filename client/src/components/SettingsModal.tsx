import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  ImagePlus,
  Info,
  LogOut,
  Monitor,
  Moon,
  Palette,
  QrCode,
  Server,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { ApiError, removeAvatar, updateProfile, uploadAvatar } from '../lib/api';
import { AVATAR_COLORS, cx } from '../lib/utils';
import { Modal } from './Modal';
import { UserAvatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';

type Tab = 'profile' | 'appearance' | 'notifications' | 'connection' | 'about';

const TABS: { id: Tab; label: string; icon: typeof UserRound }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'connection', label: 'Connection', icon: Wifi },
  { id: 'about', label: 'About', icon: Info },
];

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50',
        checked ? 'border-accent bg-accent' : 'border-line2 bg-panel3',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    me,
    setMe,
    settings,
    updateSettings,
    requestNotifications,
    theme,
    setTheme,
    serverInfo,
    connected,
    users,
    logout,
    toast,
  } = useApp();
  const { openInvite } = useUi();

  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [status, setStatus] = useState<'online' | 'busy'>('online');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [copied, setCopied] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !me) return;
    setName(me.name);
    setAbout(me.about);
    setStatus(me.status);
    setColor(me.avatarColor);
    setCopied(false);
  }, [open, me]);

  if (!me) return null;

  const primary = (() => {
    const urls = serverInfo?.urls || [];
    const preferred = serverInfo?.primaryUrl;
    if (preferred && urls.some((entry) => entry.url === preferred)) return preferred;
    return urls.find((entry) => entry.label !== 'localhost')?.url || urls[0]?.url || '';
  })();

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Choose an image file for your photo.', { type: 'error' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('That image is too large. Choose one under 8 MB.', { type: 'error' });
      return;
    }
    setAvatarBusy(true);
    try {
      const res = await uploadAvatar(file);
      setMe(res.user);
      toast('Profile photo updated.', { type: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not upload that photo.', { type: 'error' });
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  };

  const clearAvatar = async () => {
    setAvatarBusy(true);
    try {
      const res = await removeAvatar();
      setMe(res.user);
      toast('Profile photo removed.', { type: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove the photo.', { type: 'error' });
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveProfile = async () => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 24) {
      toast('Names need between 2 and 24 characters.', { type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await updateProfile({ name: trimmed, about: about.trim(), avatarColor: color, status });
      setMe(res.user);
      toast('Profile saved.', { type: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your profile.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async () => {
    if (!primary) return;
    try {
      await navigator.clipboard.writeText(primary);
      setCopied(true);
      toast('Server address copied.', { type: 'success' });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Could not copy automatically.', { type: 'error' });
    }
  };

  const enableNotifications = async () => {
    if (settings.desktopNotifications) {
      await updateSettings({ desktopNotifications: false });
      return;
    }
    const granted = await requestNotifications();
    if (!granted) {
      toast('Notification permission was not granted in this browser.', { type: 'error' });
      return;
    }
    await updateSettings({ desktopNotifications: true });
  };

  const permission =
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const primaryAddress =
    serverInfo?.urls.find((u) => u.url === primary) || serverInfo?.urls.find((u) => u.label !== 'localhost');
  const onlineCount = users.filter((u) => u.online).length;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Settings"
        subtitle="Profile, appearance and connection details for this device."
        size="lg"
      >
        <div className="flex flex-col gap-5 sm:flex-row">
          <nav className="no-scrollbar -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 sm:mx-0 sm:w-[168px] sm:flex-col sm:overflow-visible sm:px-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cx(
                  'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition',
                  tab === id ? 'bg-accentsoft text-accent' : 'text-ink2 hover:bg-panel2 hover:text-ink',
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 sm:border-l sm:border-line sm:pl-5">
            {tab === 'profile' && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-4">
                  <UserAvatar user={me} size={76} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-ink">{me.name}</div>
                    <div className="text-[12px] text-ink3">Visible to everyone on this Wi-Fi</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => avatarInput.current?.click()}
                        disabled={avatarBusy}
                        className="btn-ghost px-3 py-1.5 text-[12px]"
                      >
                        <ImagePlus size={14} /> {avatarBusy ? 'Working…' : me.avatarFile ? 'Change photo' : 'Add photo'}
                      </button>
                      {me.avatarFile && (
                        <button
                          onClick={() => void clearAvatar()}
                          disabled={avatarBusy}
                          className="btn-ghost px-3 py-1.5 text-[12px] text-danger"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={avatarInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => void pickAvatar(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="section-label" htmlFor="settings-name">
                      Display name
                    </label>
                    <input
                      id="settings-name"
                      value={name}
                      maxLength={24}
                      onChange={(e) => setName(e.target.value)}
                      className="field mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="section-label" htmlFor="settings-about">
                      About
                    </label>
                    <textarea
                      id="settings-about"
                      value={about}
                      maxLength={120}
                      rows={2}
                      onChange={(e) => setAbout(e.target.value)}
                      placeholder="A short line about you"
                      className="field mt-1.5 resize-none"
                    />
                  </div>
                  <div>
                    <span className="section-label">Availability</span>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {(['online', 'busy'] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => setStatus(option)}
                          className={cx(
                            'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] font-medium transition',
                            status === option
                              ? 'border-accent/50 bg-accentsoft text-accent'
                              : 'border-line bg-panel2 text-ink2 hover:bg-panel3',
                          )}
                        >
                          <span
                            className={cx(
                              'h-2 w-2 rounded-full',
                              option === 'online' ? 'bg-online' : 'bg-accent2',
                            )}
                          />
                          {option === 'online' ? 'Available' : 'Busy'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="section-label">Avatar colour</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {AVATAR_COLORS.map((swatch) => (
                        <button
                          key={swatch}
                          onClick={() => setColor(swatch)}
                          className={cx(
                            'relative h-7 w-7 rounded-full transition hover:scale-110',
                            color === swatch && 'scale-110',
                          )}
                          style={{ background: swatch }}
                          aria-label={`Colour ${swatch}`}
                        >
                          {color === swatch && (
                            <span className="absolute inset-0 flex items-center justify-center text-white">
                              <Check size={13} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={() => void saveProfile()} disabled={saving} className="btn-primary w-full sm:w-auto">
                  {saving ? 'Saving…' : 'Save profile'}
                </button>

                <div className="rounded-2xl border border-line bg-panel2 p-3.5">
                  <div className="text-[12.5px] font-semibold text-ink">Leave this network</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink3">
                    Your messages stay on the hosting laptop. You can rejoin with the same name on this device.
                  </p>
                  <button
                    onClick={() => setConfirmLogout(true)}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-danger hover:underline"
                  >
                    <LogOut size={13} /> Sign out of Lantern
                  </button>
                </div>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <div className="text-[14px] font-semibold text-ink">Theme</div>
                  <p className="mt-0.5 text-[12px] text-ink3">Choose how Lantern looks on this device.</p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      { id: 'light' as const, label: 'Light', icon: Sun },
                      { id: 'dark' as const, label: 'Dark', icon: Moon },
                      { id: 'system' as const, label: 'System', icon: Monitor },
                    ]
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setTheme(id)}
                      className={cx(
                        'group rounded-2xl border p-2.5 text-left transition',
                        theme === id ? 'border-accent bg-accentsoft' : 'border-line bg-panel2 hover:border-line2',
                      )}
                    >
                      <div
                        className={cx(
                          'relative h-20 overflow-hidden rounded-xl border',
                          id === 'light'
                            ? 'border-[#e3e8f1] bg-[#f3f5f9]'
                            : id === 'dark'
                              ? 'border-[#202a39] bg-[#0b0f16]'
                              : 'border-line bg-gradient-to-br from-[#f3f5f9] to-[#0b0f16]',
                        )}
                      >
                        <div
                          className={cx(
                            'absolute left-2 top-2 h-2.5 w-10 rounded-full',
                            id === 'light' ? 'bg-[#df5b28]' : id === 'dark' ? 'bg-[#ff8b4c]' : 'bg-[#df5b28]',
                          )}
                        />
                        <div className="absolute left-2 top-7 h-1.5 w-14 rounded-full bg-[#8b95a8]/50" />
                        <div className="absolute left-2 top-10 h-1.5 w-10 rounded-full bg-[#8b95a8]/30" />
                        <div
                          className={cx(
                            'absolute bottom-2 right-2 h-5 w-12 rounded-lg',
                            id === 'dark' ? 'bg-[#2b3749]' : 'bg-white shadow-sm',
                          )}
                        />
                        {theme === id && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                        <Icon size={13} /> {label}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink3">
                  The theme is saved on this device. “System” follows your phone or laptop’s dark mode setting.
                </div>
              </div>
            )}

            {tab === 'notifications' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <div className="text-[14px] font-semibold text-ink">Notifications</div>
                  <p className="mt-0.5 text-[12px] text-ink3">Stay aware of messages while Lantern is open.</p>
                </div>

                <div className="divide-y divide-line rounded-2xl border border-line bg-panel2">
                  <div className="flex items-center gap-3 p-3.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Bell size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-ink">Message sounds</div>
                      <div className="text-[11.5px] text-ink3">Play a short chime for incoming messages.</div>
                    </div>
                    <Toggle checked={settings.sound} onChange={(next) => void updateSettings({ sound: next })} />
                  </div>
                  <div className="flex items-center gap-3 p-3.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Monitor size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-ink">Desktop notifications</div>
                      <div className="text-[11.5px] text-ink3">
                        {permission === 'granted'
                          ? 'Show a notification when Lantern is in the background.'
                          : permission === 'denied'
                            ? 'Blocked in this browser’s settings.'
                            : permission === 'unsupported'
                              ? 'Not supported by this browser.'
                              : 'Requires browser permission.'}
                      </div>
                    </div>
                    <Toggle
                      checked={settings.desktopNotifications && permission === 'granted'}
                      onChange={() => void enableNotifications()}
                      disabled={permission === 'unsupported'}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink3">
                  Calls always ring on this device, even if notifications are off. Mute individual chats from a
                  conversation’s info panel.
                </div>
              </div>
            )}

            {tab === 'connection' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <div className="text-[14px] font-semibold text-ink">Connection</div>
                  <p className="mt-0.5 text-[12px] text-ink3">Everything stays on your local network.</p>
                </div>

                <div className="rounded-2xl border border-line bg-panel2 p-4">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    {connected ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-online opacity-60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-online" />
                        </span>
                        <span className="text-ink">Live · connected to the local server</span>
                      </>
                    ) : (
                      <>
                        <WifiOff size={14} className="text-danger" />
                        <span className="text-danger">Disconnected · trying to reconnect</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink3">
                    <span>{onlineCount} online</span>
                    <span>·</span>
                    <span>{users.length} people on this network</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-panel2 p-4">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                    <Server size={14} className="text-accent" /> Server address
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel px-2.5 py-2 text-[12px] text-ink2">
                      {primary || 'Not available'}
                    </code>
                    <button className="icon-btn h-9 w-9 border border-line bg-panel" onClick={() => void copyUrl()} aria-label="Copy address">
                      {copied ? <Check size={15} className="text-online" /> : <Copy size={15} />}
                    </button>
                  </div>
                  {primaryAddress && (
                    <div className="mt-1.5 text-[11px] text-ink3">Detected interface: {primaryAddress.label}</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={openInvite} className="btn-ghost px-3 py-2 text-[12px]">
                      <QrCode size={14} /> Invite / QR code
                    </button>
                    <span
                      className={cx(
                        'chip py-2',
                        serverInfo?.https ? 'text-online' : 'text-accent2',
                      )}
                    >
                      <ShieldCheck size={13} /> {serverInfo?.https ? 'HTTPS secured' : 'HTTP mode'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink3">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink2">
                    <Smartphone size={13} /> Mobile access
                  </div>
                  Camera, microphone and location need HTTPS. Open the <code className="text-ink2">https://</code>{' '}
                  address and accept the certificate warning once per device. Lantern never contacts the internet.
                </div>
              </div>
            )}

            {tab === 'about' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accentsoft text-accent">
                    <Info size={22} />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-ink">Lantern</div>
                    <div className="text-[12px] text-ink3">Version {serverInfo?.version || '1.0.0'} · LAN chat</div>
                  </div>
                </div>
                <p className="text-[12.5px] leading-relaxed text-ink2">
                  Lantern is a local-first messenger. Messages, files and call signals are stored and relayed by
                  the laptop hosting this network. Calls connect directly between devices over Wi-Fi using WebRTC.
                </p>
                <div className="space-y-2 text-[12px]">
                  {[
                    'No cloud, no accounts, no tracking',
                    'Messages and uploads persist on the host',
                    'Calls work without internet STUN/TURN',
                    'Designed for phones, tablets and laptops',
                  ].map((line) => (
                    <div key={line} className="flex items-center gap-2 text-ink2">
                      <Check size={14} className="text-online" /> {line}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink3">
                  If devices cannot see each other, disable AP/client isolation on the router and allow Lantern
                  through the host firewall.
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Sign out of Lantern?"
        description="You will need to enter your name again to rejoin this network. Your messages stay on the host."
        confirmLabel="Sign out"
        danger
        onConfirm={async () => {
          onClose();
          await logout();
        }}
      />
    </>
  );
}
