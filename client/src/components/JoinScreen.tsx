import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Film,
  MapPin,
  MessageSquare,
  Moon,
  Phone,
  QrCode,
  ShieldCheck,
  Sun,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../lib/api';
import { AVATAR_COLORS, cx, getInitials } from '../lib/utils';
import { Logo } from './Logo';

const FEATURES = [
  { icon: MessageSquare, label: 'Instant messages' },
  { icon: Phone, label: 'Voice & video calls' },
  { icon: Film, label: 'Big file transfers' },
  { icon: MapPin, label: 'Location sharing' },
];

export function JoinScreen() {
  const { join, serverInfo, toast, resolvedTheme, toggleTheme } = useApp();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryUrl = useMemo(() => {
    const urls = serverInfo?.urls || [];
    const preferred = serverInfo?.primaryUrl;
    if (preferred && urls.some((entry) => entry.url === preferred)) return preferred;
    return urls.find((entry) => entry.label !== 'localhost')?.url || urls[0]?.url || '';
  }, [serverInfo]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
      setError('Enter a display name with at least 2 characters.');
      return;
    }
    if (trimmed.length > 24) {
      setError('Names can be at most 24 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await join(trimmed, color, about.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join the network. Please try again.');
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!primaryUrl) return;
    try {
      await navigator.clipboard.writeText(primaryUrl);
      toast('Invite link copied.', { type: 'success' });
    } catch {
      toast(primaryUrl, { type: 'info' });
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] animate-aurora rounded-full bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.34),transparent_65%)] blur-2xl" />
        <div className="absolute -right-32 top-1/4 h-[520px] w-[520px] animate-aurora rounded-full bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.2),transparent_65%)] blur-2xl [animation-delay:-6s]" />
        <div className="absolute bottom-[-220px] left-1/3 h-[520px] w-[520px] animate-aurora rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),transparent_65%)] blur-2xl [animation-delay:-11s]" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in srgb, var(--ink-3) 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--ink-3) 14%, transparent) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at center, black 25%, transparent 72%)',
          }}
        />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1.5 text-[12px] font-medium text-ink2 backdrop-blur sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-online opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-online" />
            </span>
            Local server online
          </div>
          <button onClick={toggleTheme} className="icon-btn h-9 w-9 border border-line bg-panel/70 backdrop-blur" aria-label="Toggle theme">
            {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl items-center gap-8 px-5 pb-12 pt-2 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-16 lg:pt-6">
        <section className="animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accentsoft px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            <Zap size={13} />
            Works without internet
          </div>
          <h1 className="mt-5 text-[38px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[52px]">
            Chat that stays
            <br />
            on your <span className="brand-text">Wi-Fi.</span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink2 sm:text-base">
            Lantern is a private messenger for the people in the same room. Messages, files and calls travel
            directly over your local network — no cloud, no accounts, no internet required.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <span key={label} className="chip bg-panel/70 py-1.5 backdrop-blur">
                <Icon size={13} className="text-accent" />
                {label}
              </span>
            ))}
          </div>

          <div className="mt-8 hidden items-center gap-4 rounded-2xl border border-line bg-panel/65 p-3.5 backdrop-blur sm:flex lg:mt-10">
            <div className="relative shrink-0 rounded-xl bg-white p-1.5 shadow-sm">
              {serverInfo?.qr ? (
                <img src={serverInfo.qr} alt="Invite QR code" className="h-[92px] w-[92px] rounded-md" />
              ) : (
                <div className="skeleton h-[92px] w-[92px] rounded-md" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <QrCode size={14} className="text-accent" />
                Scan to join from another device
              </div>
              <p className="mt-1 truncate text-[12px] text-ink3">{primaryUrl || 'Discovering local address…'}</p>
              <button
                onClick={copyLink}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline"
              >
                <Copy size={12} /> Copy invite link
              </button>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink3">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-online" /> Traffic stays on the LAN
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wifi size={13} className="text-accent" /> Auto-detects your server
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users size={13} className="text-ink2" /> Everyone on this Wi-Fi
            </span>
          </div>
        </section>

        <section className="animate-fade-up [animation-delay:80ms]">
          <div className="relative overflow-hidden rounded-[28px] border border-line bg-panel/90 p-6 shadow-[var(--shadow)] backdrop-blur-xl sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent/15 blur-2xl" />
            <div className="relative">
              <h2 className="text-[22px] font-semibold tracking-tight text-ink">Join the network</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink2">
                Pick a name your friends will recognise. You can personalise your profile later.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-semibold text-white shadow-inner ring-4 ring-panel"
                    style={{
                      background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 60%, #0b0e14))`,
                    }}
                  >
                    {getInitials(name || 'You')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="section-label" htmlFor="join-name">
                      Display name
                    </label>
                    <input
                      id="join-name"
                      className="field mt-1.5"
                      placeholder="e.g. Alex Rivera"
                      value={name}
                      maxLength={24}
                      autoFocus
                      autoComplete="off"
                      onChange={(e) => {
                        setName(e.target.value);
                        if (error) setError(null);
                      }}
                    />
                  </div>
                </div>

                <div>
                  <span className="section-label">Avatar colour</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AVATAR_COLORS.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setColor(swatch)}
                        className={cx(
                          'relative h-8 w-8 rounded-full transition-transform hover:scale-110',
                          color === swatch && 'scale-110',
                        )}
                        style={{ background: swatch }}
                        aria-label={`Choose colour ${swatch}`}
                      >
                        {color === swatch && (
                          <span className="absolute inset-0 flex items-center justify-center text-white">
                            <Check size={15} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="section-label" htmlFor="join-about">
                    About <span className="font-normal normal-case tracking-normal text-ink3">(optional)</span>
                  </label>
                  <input
                    id="join-about"
                    className="field mt-1.5"
                    placeholder="Working from the kitchen table"
                    value={about}
                    maxLength={80}
                    onChange={(e) => setAbout(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="animate-rise rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12.5px] font-medium text-danger">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={busy} className="btn-primary mt-1 w-full py-3 text-[14px]">
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Joining…
                    </>
                  ) : (
                    <>
                      Join Lantern <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink3">
                Your name is visible to everyone connected to this network. There is no password — the Wi-Fi is
                the door.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-ink3 sm:hidden">
            <QrCode size={13} />
            {primaryUrl ? (
              <button onClick={copyLink} className="truncate underline decoration-line2 underline-offset-2">
                {primaryUrl}
              </button>
            ) : (
              'Discovering local address…'
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
