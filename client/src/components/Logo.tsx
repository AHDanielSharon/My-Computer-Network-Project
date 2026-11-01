import { cx } from '../lib/utils';

export function LanternMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cx('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="lantern-mark-g" x1="6" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffc46b" />
          <stop offset="0.55" stopColor="#ff9550" />
          <stop offset="1" stopColor="#e4652f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="url(#lantern-mark-g)" />
      <path d="M26 15c0-4 12-4 12 0" stroke="#241306" strokeWidth="3" strokeLinecap="round" />
      <path d="M23 23h18l-2-4H25l-2 4Z" fill="#241306" />
      <path
        d="M25 25h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3V28a3 3 0 0 1 3-3Z"
        fill="#241306"
      />
      <path
        d="M27.5 29.5h9v10.5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V29.5Z"
        fill="#ffd79a"
      />
      <path d="M28 35.5c1.6-3 4-4.5 4-4.5s2.4 1.5 4 4.5c0 3-1.8 5-4 5s-4-2-4-5Z" fill="#ff9a45" />
      <rect x="22" y="44" width="20" height="4" rx="2" fill="#241306" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LanternMark size={compact ? 34 : 38} />
      {!compact && (
        <div className="leading-none">
          <div className="text-[17px] font-bold tracking-tight text-ink">Lantern</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink3">LAN chat</div>
        </div>
      )}
    </div>
  );
}
