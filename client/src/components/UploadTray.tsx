import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, UploadCloud, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cx, formatBytes, formatSpeed } from '../lib/utils';

export function UploadTray() {
  const { uploads, cancelUpload, dismissUpload } = useApp();
  if (!uploads.length) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-[78px] right-3 z-[70] flex w-[calc(100vw-1.5rem)] max-w-[360px] flex-col gap-2 min-[900px]:bottom-4 min-[900px]:right-4">
      {uploads.map((task) => (
        <div
          key={task.id}
          className="pointer-events-auto overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-xl backdrop-blur-xl animate-slide-left"
        >
          <div className="flex items-start gap-3 p-3">
            <div
              className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                task.status === 'error'
                  ? 'bg-danger/10 text-danger'
                  : task.status === 'done'
                    ? 'bg-online/10 text-online'
                    : 'bg-accentsoft text-accent',
              )}
            >
              {task.status === 'error' ? (
                <AlertTriangle size={16} />
              ) : task.status === 'done' ? (
                <CheckCircle2 size={16} />
              ) : (
                <UploadCloud size={16} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-ink">{task.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink3">
                {task.status === 'uploading' && (
                  <>
                    <span>{task.progress}%</span>
                    <span>·</span>
                    <span>{formatBytes(task.size)}</span>
                    {task.speed > 0 && (
                      <>
                        <span>·</span>
                        <span>{formatSpeed(task.speed)}</span>
                      </>
                    )}
                  </>
                )}
                {task.status === 'done' && <span className="text-online">Uploaded · shared in chat</span>}
                {task.status === 'cancelled' && <span>Cancelled</span>}
                {task.status === 'error' && <span className="text-danger">{task.error || 'Upload failed'}</span>}
              </div>
              {task.status === 'uploading' && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.max(3, task.progress)}%` }}
                  />
                </div>
              )}
            </div>
            {task.status === 'uploading' ? (
              <button
                onClick={() => cancelUpload(task.id)}
                className="icon-btn h-7 w-7 shrink-0"
                title="Cancel upload"
                aria-label="Cancel upload"
              >
                <X size={14} />
              </button>
            ) : (
              <button
                onClick={() => dismissUpload(task.id)}
                className="icon-btn h-7 w-7 shrink-0"
                title="Dismiss"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
