import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-3xl bg-accent/15 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-line bg-panel text-accent shadow-sm">
          <Icon size={26} strokeWidth={1.7} />
        </div>
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
