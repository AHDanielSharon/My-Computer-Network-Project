import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, X } from 'lucide-react';

export interface LightboxImage {
  src: string;
  name: string;
  downloadUrl?: string;
}

export function ImageLightbox({ image, onClose }: { image: LightboxImage | null; onClose: () => void }) {
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [image, onClose]);

  if (!image) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/92 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white sm:px-6">
        <div className="truncate text-[13px] font-medium text-white/80">{image.name}</div>
        <div className="flex items-center gap-1.5">
          {image.downloadUrl && (
            <>
              <a
                href={image.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                title="Open in new tab"
              >
                <ExternalLink size={17} />
              </a>
              <a
                href={image.downloadUrl}
                download={image.name}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                title="Download"
              >
                <Download size={17} />
              </a>
            </>
          )}
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Close image"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <button className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8" onClick={onClose}>
        <img
          src={image.src}
          alt={image.name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-scale-in"
        />
      </button>
    </div>,
    document.body,
  );
}
