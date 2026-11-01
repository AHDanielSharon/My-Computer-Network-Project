import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cx } from '../lib/utils';

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-stretch gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-[380px]">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-slide-left items-start gap-3 rounded-2xl border border-line bg-panel/95 p-3.5 shadow-xl backdrop-blur-xl"
          >
            <div
              className={cx(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                toast.type === 'error'
                  ? 'bg-danger/10 text-danger'
                  : toast.type === 'success'
                    ? 'bg-online/10 text-online'
                    : 'bg-accent/10 text-accent',
              )}
            >
              <Icon size={17} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              {toast.title && <div className="truncate text-[13px] font-semibold text-ink">{toast.title}</div>}
              <div className={cx('text-[13px] leading-snug text-ink2', toast.title && 'mt-0.5')}>
                {toast.message}
              </div>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.onClick();
                    dismissToast(toast.id);
                  }}
                  className="mt-1.5 text-[12px] font-semibold text-accent hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="icon-btn -mr-1 -mt-1 h-7 w-7 shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
