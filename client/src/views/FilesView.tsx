import { useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { fileUrl } from '../lib/api';
import type { FileItem } from '../types';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { cx, formatBytes, formatListTime } from '../lib/utils';

type Filter = 'all' | 'image' | 'video' | 'audio' | 'file';

export function FilesView() {
  const { recentFiles, refreshFiles } = useApp();
  const { openImage } = useUi();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const files = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recentFiles
      .filter((file) => {
        if (filter === 'image') return file.mime.startsWith('image/');
        if (filter === 'video') return file.mime.startsWith('video/');
        if (filter === 'audio') return file.mime.startsWith('audio/');
        if (filter === 'file') return !/^(image|video|audio)\//.test(file.mime);
        return true;
      })
      .filter(
        (file) =>
          !q ||
          file.name.toLowerCase().includes(q) ||
          file.ownerName.toLowerCase().includes(q) ||
          file.conversationTitle.toLowerCase().includes(q),
      );
  }, [recentFiles, filter, query]);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const refresh = async () => {
    setRefreshing(true);
    await refreshFiles();
    setRefreshing(false);
  };

  const open = (file: FileItem) => {
    if (file.mime.startsWith('image/')) {
      openImage({ src: fileUrl(file.id, true), name: file.name, downloadUrl: fileUrl(file.id) });
    } else if (file.mime.startsWith('video/') || file.mime.startsWith('audio/')) {
      setPreview(file);
    } else {
      const link = document.createElement('a');
      link.href = fileUrl(file.id);
      link.rel = 'noopener';
      link.click();
    }
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink3">Library</div>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">Shared files</h1>
            <p className="mt-1 text-[13px] text-ink2">
              {files.length} item{files.length === 1 ? '' : 's'} · {formatBytes(totalSize)} · stored on the host
            </p>
          </div>
          <button onClick={() => void refresh()} disabled={refreshing} className="btn-ghost">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
              className="field h-10 py-0 pl-9 text-[12.5px]"
            />
          </div>
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
            {(
              [
                { id: 'all' as const, label: 'All' },
                { id: 'image' as const, label: 'Photos' },
                { id: 'video' as const, label: 'Videos' },
                { id: 'audio' as const, label: 'Audio' },
                { id: 'file' as const, label: 'Documents' },
              ]
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={cx(
                  'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition',
                  filter === item.id ? 'bg-ink text-bg' : 'text-ink2 hover:bg-panel2',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {files.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((file) => {
              const isImage = file.mime.startsWith('image/');
              const isVideo = file.mime.startsWith('video/');
              const isAudio = file.mime.startsWith('audio/');
              const Icon = isVideo ? Film : isAudio ? Music : FileText;
              return (
                <div
                  key={file.id}
                  className="group overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-line2"
                >
                  <button
                    onClick={() => open(file)}
                    className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-panel2"
                  >
                    {isImage ? (
                      <img
                        src={fileUrl(file.id, true)}
                        alt={file.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : isVideo ? (
                      <>
                        <video
                          src={fileUrl(file.id, true)}
                          preload="metadata"
                          muted
                          className="h-full w-full object-cover opacity-80"
                        />
                        <span className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                          <Play size={18} fill="currentColor" />
                        </span>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-ink3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-panel text-accent">
                          <Icon size={22} />
                        </span>
                        <span className="text-[10.5px] uppercase tracking-wide">
                          {isAudio ? 'Audio' : 'Document'}
                        </span>
                      </div>
                    )}
                    {!isImage && !isVideo && (
                      <span className="absolute left-2 top-2 rounded-full bg-panel/90 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink2">
                        {file.name.split('.').pop()?.slice(0, 5) || 'file'}
                      </span>
                    )}
                  </button>
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-ink" title={file.name}>
                          {file.name}
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-ink3">
                          {formatBytes(file.size)} · {file.ownerName}
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-ink3">
                          {file.conversationTitle} · {formatListTime(file.createdAt)}
                        </div>
                      </div>
                      <a
                        href={fileUrl(file.id)}
                        download={file.name}
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel2 text-ink2 transition hover:bg-panel3 hover:text-ink"
                        title="Download"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={filter === 'image' ? ImageIcon : FolderOpen}
            title={query ? 'No files match that search' : 'No files shared yet'}
            description={
              query
                ? 'Try another name, person or chat.'
                : 'Send a photo, video or document in any chat and it will appear here.'
            }
          />
        )}
      </div>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name}
        subtitle={
          preview
            ? `${formatBytes(preview.size)} · shared by ${preview.ownerName} in ${preview.conversationTitle}`
            : undefined
        }
        size="lg"
        footer={
          preview ? (
            <div className="flex justify-between gap-2">
              <button onClick={() => setPreview(null)} className="btn-ghost">
                Close
              </button>
              <a href={fileUrl(preview.id)} download={preview.name} className="btn-primary">
                <Download size={15} /> Download
              </a>
            </div>
          ) : null
        }
      >
        {preview && preview.mime.startsWith('video/') && (
          <video
            src={fileUrl(preview.id, true)}
            controls
            autoPlay
            className="max-h-[60vh] w-full rounded-xl bg-black"
          />
        )}
        {preview && preview.mime.startsWith('audio/') && (
          <div className="rounded-2xl border border-line bg-panel2 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Music size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{preview.name}</div>
                <div className="text-[11.5px] text-ink3">{formatBytes(preview.size)}</div>
              </div>
            </div>
            <audio src={fileUrl(preview.id, true)} controls autoPlay className="mt-4 w-full" />
          </div>
        )}
      </Modal>
    </div>
  );
}
