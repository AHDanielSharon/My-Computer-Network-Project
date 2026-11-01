import { useState } from 'react';
import { Check, Copy, Link2, QrCode, ShieldAlert, Wifi } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal } from './Modal';
import { cx } from '../lib/utils';

export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { serverInfo, toast } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const urls = (serverInfo?.urls || []).filter((u) => u.label !== 'localhost');
  const activeUrl =
    (selected && urls.some((u) => u.url === selected) ? selected : null) ||
    (serverInfo?.primaryUrl && urls.some((u) => u.url === serverInfo.primaryUrl)
      ? serverInfo.primaryUrl
      : null) ||
    urls[0]?.url ||
    '';
  const qr = serverInfo?.qrs.find((entry) => entry.url === activeUrl)?.qr || serverInfo?.qr || null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      toast('Invite link copied.', { type: 'success' });
      window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 1800);
    } catch {
      toast('Could not copy automatically. Select the address and copy it manually.', { type: 'error' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite people"
      subtitle="Anyone on this Wi-Fi can open the link and join instantly."
      size="md"
    >
      <div className="flex flex-col items-center">
        {urls.length > 1 && (
          <div className="mb-3 flex flex-wrap justify-center gap-1.5">
            {urls.map((item) => (
              <button
                key={item.url}
                onClick={() => setSelected(item.url)}
                title={item.url}
                className={cx(
                  'max-w-[190px] truncate rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition',
                  activeUrl === item.url
                    ? 'border-accent/40 bg-accentsoft text-accent'
                    : 'border-line bg-panel2 text-ink2 hover:border-line2',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-3xl bg-white p-4 shadow-[0_18px_45px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
          {qr ? (
            <img src={qr} alt="Join QR code" className="h-[236px] w-[236px]" />
          ) : (
            <div className="skeleton h-[236px] w-[236px] rounded-2xl" />
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-[12.5px] text-ink2">
          <QrCode size={14} className="text-accent" />
          Scan with a phone camera to open Lantern
        </div>
        {activeUrl && (
          <button
            onClick={() => copy(activeUrl)}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-panel2 px-4 py-3 text-left transition hover:border-line2"
          >
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink3">Invite link</div>
              <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{activeUrl}</div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel text-ink2">
              {copied === activeUrl ? <Check size={16} className="text-online" /> : <Copy size={16} />}
            </span>
          </button>
        )}
      </div>

      {urls.length > 0 && (
        <div className="mt-5">
          <div className="section-label">All addresses on this network</div>
          <div className="mt-2 space-y-1.5">
            {urls.map((item) => (
              <button
                key={item.url}
                onClick={() => {
                  setSelected(item.url);
                  copy(item.url);
                }}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-panel3',
                  activeUrl === item.url ? 'border-accent/35 bg-accentsoft/50' : 'border-line/70 bg-panel2/60',
                )}
              >
                <Wifi size={14} className="shrink-0 text-ink3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-ink">{item.url}</div>
                  <div className="text-[11px] text-ink3">{item.label}</div>
                </div>
                {copied === item.url ? (
                  <Check size={14} className="text-online" />
                ) : (
                  <Copy size={14} className="text-ink3" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={cx('mt-5 rounded-2xl border border-accent/20 bg-accentsoft p-3.5')}>
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-accent">
          <ShieldAlert size={15} /> First time on a phone?
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink2">
          Lantern uses a private certificate for HTTPS. Your browser may show a warning — tap{' '}
          <span className="font-semibold text-ink">Advanced</span> then{' '}
          <span className="font-semibold text-ink">Proceed</span>. This is safe: the certificate was created on the
          hosting laptop and never leaves your network.
        </p>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink3">
        <Link2 size={13} className="mt-0.5 shrink-0" />
        If the link does not load, check that “client isolation” or “AP isolation” is turned off in your router
        settings so devices can talk to each other.
      </div>
    </Modal>
  );
}
