import { useState } from 'react';
import { Users } from 'lucide-react';
import { avatarUrl } from '../lib/api';
import { cx, getInitials } from '../lib/utils';
import type { User } from '../types';

interface AvatarProps {
  name: string;
  color: string;
  userId?: string | null;
  avatarFile?: string | null;
  size?: number;
  online?: boolean | null;
  busy?: boolean | null;
  group?: boolean;
  className?: string;
  ring?: boolean;
}

const STATUS_RING: Record<string, string> = {
  online: 'bg-[var(--online)]',
  busy: 'bg-[var(--accent-2)]',
  offline: 'bg-[var(--ink-3)]',
};

export function Avatar({
  name,
  color,
  userId,
  avatarFile,
  size = 44,
  online,
  busy,
  group,
  className,
  ring,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !group && avatarFile && userId && !imageFailed;
  const dotSize = Math.max(9, Math.round(size * 0.27));
  const status = online ? (busy ? 'busy' : 'online') : online === false ? 'offline' : null;

  return (
    <div className={cx('relative shrink-0 select-none', className)} style={{ width: size, height: size }}>
      <div
        className={cx(
          'flex h-full w-full items-center justify-center overflow-hidden rounded-full font-semibold text-white',
          ring && 'ring-2 ring-panel',
        )}
        style={{
          background: group
            ? 'linear-gradient(145deg, #3b4a63, #1c2637)'
            : `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 60%, #0b0e14))`,
          fontSize: Math.max(10, Math.round(size * 0.36)),
        }}
      >
        {showImage ? (
          <img
            src={avatarUrl({ id: userId!, avatarFile: avatarFile! })}
            alt={name}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : group ? (
          <Users size={Math.round(size * 0.42)} strokeWidth={1.9} className="text-white/90" />
        ) : (
          <span className="tracking-tight drop-shadow-sm">{getInitials(name)}</span>
        )}
      </div>
      {status && (
        <span
          className={cx(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-panel',
            STATUS_RING[status],
          )}
          style={{ width: dotSize, height: dotSize }}
          title={status === 'online' ? 'Online' : status === 'busy' ? 'Busy' : 'Offline'}
        />
      )}
    </div>
  );
}

export function UserAvatar({
  user,
  size,
  showStatus = true,
  className,
}: {
  user: User;
  size?: number;
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <Avatar
      name={user.name}
      color={user.avatarColor}
      userId={user.id}
      avatarFile={user.avatarFile}
      size={size}
      online={showStatus ? user.online : null}
      busy={user.status === 'busy'}
      className={className}
    />
  );
}

export function PresenceDot({ online, busy, size = 8 }: { online: boolean; busy?: boolean; size?: number }) {
  return (
    <span
      className={cx('inline-block shrink-0 rounded-full', online ? (busy ? 'bg-accent2' : 'bg-online') : 'bg-ink3/60')}
      style={{ width: size, height: size }}
    />
  );
}
