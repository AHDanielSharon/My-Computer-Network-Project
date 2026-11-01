import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Crown,
  Film,
  Image as ImageIcon,
  LogOut,
  Pencil,
  Pin,
  Play,
  UserPlus,
  UserX,
  Video,
  X,
} from 'lucide-react';
import type { Conversation, Message, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { useCall } from '../../context/CallContext';
import { fileUrl } from '../../lib/api';
import {
  AVATAR_COLORS,
  conversationColor,
  conversationOther,
  conversationTitle,
  cx,
  formatLastSeen,
  formatTime,
  isEmojiOnly,
} from '../../lib/utils';
import { Avatar, UserAvatar } from '../Avatar';
import { ConfirmDialog } from '../ConfirmDialog';
import { Modal } from '../Modal';

export function ConversationInfo({
  conversation,
  pinned,
  onClose,
  onJump,
}: {
  conversation: Conversation;
  pinned: Message[];
  onClose: () => void;
  onJump: (messageId: string) => void;
}) {
  const {
    me,
    users,
    messages,
    muteConversation,
    removeMember,
    addMembers,
    setNav,
    closeConversation,
    openConversation,
    toast,
  } = useApp();
  const { openProfile, openImage, openNewChat, openForward } = useUi();
  const { startCall } = useCall();

  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const isGroup = conversation.type === 'group';
  const title = conversationTitle(conversation, me?.id || '', users);
  const other = conversationOther(conversation, me?.id || '');
  const liveOther = other ? users.find((u) => u.id === other.id) || other : null;
  const isAdmin = conversation.myRole === 'admin';

  const candidates = useMemo(
    () => users.filter((u) => u.id !== me?.id && !conversation.members.some((m) => m.id === u.id)),
    [users, conversation.members, me?.id],
  );

  const media = useMemo(
    () =>
      [...messages]
        .reverse()
        .filter((message) => message.meta?.fileId && (message.type === 'image' || message.type === 'video'))
        .slice(0, 9),
    [messages],
  );

  useEffect(() => setSelected([]), [adding]);

  const saveMembers = async () => {
    if (!selected.length) return;
    setBusy(true);
    const ok = await addMembers(conversation.id, selected);
    setBusy(false);
    if (ok) setAdding(false);
  };

  const leave = async () => {
    if (!me) return;
    const ok = await removeMember(conversation.id, me.id);
    if (ok) {
      onClose();
      closeConversation();
      toast(`You left ${title}.`, { type: 'info' });
    }
  };

  const remove = async () => {
    if (!confirmRemove) return;
    await removeMember(conversation.id, confirmRemove.id);
    setConfirmRemove(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[14px] font-semibold text-ink">Conversation info</span>
        <button onClick={onClose} className="icon-btn h-8 w-8" aria-label="Close info">
          <X size={17} />
        </button>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
          <div className="rounded-full p-1 ring-2 ring-accent/20">
            <Avatar
              name={title}
              color={conversationColor(conversation, me?.id || '', users)}
              group={isGroup}
              userId={liveOther?.id}
              avatarFile={liveOther?.avatarFile}
              size={84}
            />
          </div>
          <div className="mt-3 text-[18px] font-semibold tracking-tight text-ink">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-ink3">
            {isGroup
              ? `${conversation.members.length} members · ${conversation.members.filter((m) => m.online).length} online`
              : liveOther?.online
                ? liveOther.status === 'busy'
                  ? 'Busy right now'
                  : 'Online now'
                : liveOther
                  ? formatLastSeen(liveOther.lastSeen)
                  : 'Direct message'}
          </div>
          {conversation.isDefault && (
            <span className="mt-2 chip py-0.5 text-[10px] uppercase tracking-wide">Everyone on this network</span>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {!isGroup && liveOther && (
              <>
                <button onClick={() => openProfile(liveOther)} className="btn-ghost px-3 py-1.5 text-[11.5px]">
                  View profile
                </button>
                <button
                  onClick={() => void startCall(conversation.id, 'audio')}
                  className="btn-ghost px-3 py-1.5 text-[11.5px]"
                >
                  Voice
                </button>
                <button
                  onClick={() => void startCall(conversation.id, 'video')}
                  className="btn-ghost px-3 py-1.5 text-[11.5px]"
                >
                  Video
                </button>
              </>
            )}
            <button
              onClick={() => void muteConversation(conversation.id, !conversation.muted)}
              className={cx(
                'btn-ghost px-3 py-1.5 text-[11.5px]',
                conversation.muted && 'border-accent/40 bg-accentsoft text-accent',
              )}
            >
              {conversation.muted ? <BellOff size={13} /> : <Bell size={13} />}
              {conversation.muted ? 'Muted' : 'Mute'}
            </button>
            {isGroup && (
              <button onClick={() => setEditing(true)} className="btn-ghost px-3 py-1.5 text-[11.5px]">
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>

        {isGroup && conversation.announcement && (
          <div className="mx-4 mb-4 rounded-xl border border-accent/20 bg-accentsoft px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">Announcement</div>
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-ink2">
              {conversation.announcement}
            </p>
          </div>
        )}

        {isGroup && (
          <section className="border-t border-line px-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12.5px] font-semibold text-ink">
                Members <span className="text-ink3">· {conversation.members.length}</span>
              </h3>
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:underline"
              >
                <UserPlus size={13} /> Add
              </button>
            </div>
            <div className="mt-2 space-y-0.5">
              {conversation.members.map((member) => {
                const live = users.find((u) => u.id === member.id) || member;
                const memberIsMe = member.id === me?.id;
                return (
                  <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                    <UserAvatar user={live} size={34} />
                    <button
                      onClick={() => openProfile(live)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-ink">{member.name}</span>
                        {member.id === conversation.createdBy || member.role === 'admin' ? (
                          <Crown size={11} className="shrink-0 text-accent2" />
                        ) : null}
                        {memberIsMe && <span className="text-[10px] text-ink3">(you)</span>}
                      </div>
                      <div className="text-[10.5px] text-ink3">
                        {live.online ? (live.status === 'busy' ? 'Busy' : 'Online') : formatLastSeen(live.lastSeen)}
                      </div>
                    </button>
                    {isAdmin && !memberIsMe && !conversation.isDefault && (
                      <button
                        onClick={() => setConfirmRemove(live)}
                        className="icon-btn h-7 w-7 text-ink3 hover:text-danger"
                        title="Remove from group"
                      >
                        <UserX size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!conversation.isDefault && (
              <button
                onClick={() => setConfirmLeave(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-danger hover:underline"
              >
                <LogOut size={13} /> Leave group
              </button>
            )}
          </section>
        )}

        <section className="border-t border-line px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[12.5px] font-semibold text-ink">Pinned messages</h3>
            <Pin size={13} className="text-ink3" />
          </div>
          {pinned.length ? (
            <div className="mt-2 space-y-1.5">
              {pinned.slice(0, 4).map((message) => (
                <button
                  key={message.id}
                  onClick={() => onJump(message.id)}
                  className="w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 text-left transition hover:border-line2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10.5px] font-semibold text-accent">{message.senderName}</span>
                    <span className="text-[9.5px] text-ink3">{formatTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink2">
                    {isEmojiOnly(message.body || '')
                      ? message.body
                      : message.body || previewOf(message)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] text-ink3">No pinned messages yet.</p>
          )}
        </section>

        <section className="border-t border-line px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[12.5px] font-semibold text-ink">Shared media</h3>
            <button
              onClick={() => {
                setNav('files');
                onClose();
              }}
              className="text-[11px] font-semibold text-accent hover:underline"
            >
              All files
            </button>
          </div>
          {media.length ? (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {media.map((message) => (
                <button
                  key={message.id}
                  onClick={() => {
                    if (message.type === 'image') {
                      openImage({
                        src: fileUrl(message.meta!.fileId!, true),
                        name: message.meta?.name || 'Photo',
                        downloadUrl: fileUrl(message.meta!.fileId!),
                      });
                    } else {
                      window.open(fileUrl(message.meta!.fileId!, true), '_blank', 'noopener');
                    }
                  }}
                  className="relative aspect-square overflow-hidden rounded-lg bg-panel2"
                >
                  {message.type === 'image' ? (
                    <img
                      src={fileUrl(message.meta!.fileId!, true)}
                      alt={message.meta?.name || 'Photo'}
                      loading="lazy"
                      className="h-full w-full object-cover transition hover:scale-105"
                    />
                  ) : (
                    <>
                      <video src={fileUrl(message.meta!.fileId!, true)} preload="metadata" muted className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                        <Play size={18} fill="currentColor" />
                      </span>
                    </>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[8.5px] font-medium text-white">
                    {message.type === 'video' ? 'Video' : 'Photo'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] text-ink3">Photos and videos shared here will appear in this grid.</p>
          )}
        </section>

        {conversation.members.length > 0 && isGroup && (
          <section className="border-t border-line px-4 py-4">
            <h3 className="text-[12.5px] font-semibold text-ink">Quick actions</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={openNewChat} className="btn-ghost px-3 py-1.5 text-[11.5px]">
                New chat
              </button>
              {pinned[0] && (
                <button
                  onClick={() => openForward(pinned[0])}
                  className="btn-ghost px-3 py-1.5 text-[11.5px]"
                >
                  Forward pinned
                </button>
              )}
            </div>
          </section>
        )}

        <div className="h-4" />
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add members"
        subtitle="Choose people from this network to add to the group."
        size="md"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink3">{selected.length} selected</span>
            <button onClick={() => void saveMembers()} disabled={!selected.length || busy} className="btn-primary">
              {busy ? 'Adding…' : 'Add to group'}
            </button>
          </div>
        }
      >
        <div className="max-h-[340px] space-y-0.5 overflow-y-auto thin-scroll">
          {candidates.map((person) => {
            const active = selected.includes(person.id);
            return (
              <button
                key={person.id}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(person.id) ? prev.filter((id) => id !== person.id) : [...prev, person.id],
                  )
                }
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition',
                  active ? 'bg-accentsoft' : 'hover:bg-panel2',
                )}
              >
                <UserAvatar user={person} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-ink">{person.name}</div>
                  <div className="text-[11px] text-ink3">{person.online ? 'Online' : 'Offline'}</div>
                </div>
                <span
                  className={cx(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    active ? 'border-accent bg-accent text-white' : 'border-line2',
                  )}
                >
                  {active && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          {!candidates.length && (
            <div className="py-8 text-center text-[12px] text-ink3">
              Everyone on this network is already in this group.
            </div>
          )}
        </div>
      </Modal>

      {editing && (
        <EditGroupModal
          conversation={conversation}
          onClose={() => setEditing(false)}
        />
      )}

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={`Leave ${title}?`}
        description="You will stop receiving messages from this group. Existing messages stay on the host."
        confirmLabel="Leave group"
        danger
        onConfirm={leave}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title={`Remove ${confirmRemove?.name || 'this person'}?`}
        description="They will lose access to this group’s messages and files."
        confirmLabel="Remove"
        danger
        onConfirm={remove}
      />
    </div>
  );
}

function previewOf(message: Message) {
  switch (message.type) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎬 Video';
    case 'voice':
      return '🎙️ Voice message';
    case 'audio':
      return '🎵 Audio';
    case 'file':
      return `📄 ${message.meta?.name || 'Document'}`;
    case 'location':
      return '📍 Shared location';
    case 'call':
      return '📞 Call';
    default:
      return message.body || '';
  }
}

function EditGroupModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const { updateConversation } = useApp();
  const [name, setName] = useState(conversation.name || '');
  const [announcement, setAnnouncement] = useState(conversation.announcement || '');
  const [color, setColor] = useState(conversation.avatarColor || AVATAR_COLORS[8]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    const ok = await updateConversation(conversation.id, {
      name: name.trim(),
      announcement: announcement.trim(),
      avatarColor: color,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit group"
      subtitle="Changes are visible to all members."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={busy || name.trim().length < 2} className="btn-primary">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <Avatar name={name || 'Group'} color={color} group size={60} />
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_COLORS.map((swatch) => (
            <button
              key={swatch}
              onClick={() => setColor(swatch)}
              className={cx('relative h-6 w-6 rounded-full transition hover:scale-110', color === swatch && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
              style={{ background: swatch }}
              aria-label={`Colour ${swatch}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <label className="section-label">Group name</label>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} className="field mt-1.5" />
      </div>
      <div className="mt-4">
        <label className="section-label">Announcement</label>
        <textarea
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Share something with everyone in this group"
          className="field mt-1.5 resize-none"
        />
        <div className="mt-1 text-right text-[10.5px] text-ink3">{announcement.length}/500</div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink3">
        <ImageIcon size={12} /> Photos and videos stay on the host laptop.
      </div>
    </Modal>
  );
}
