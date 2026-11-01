import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Message, User } from '../types';
import { SettingsModal } from '../components/SettingsModal';
import { InviteModal } from '../components/InviteModal';
import { NewChatModal } from '../components/NewChatModal';
import { NewGroupModal } from '../components/NewGroupModal';
import { UserProfileModal } from '../components/UserProfileModal';
import { ForwardModal } from '../components/ForwardModal';
import { ImageLightbox, type LightboxImage } from '../components/ImageLightbox';

interface UiContextValue {
  openSettings: () => void;
  openInvite: () => void;
  openNewChat: () => void;
  openNewGroup: () => void;
  openProfile: (user: User) => void;
  openForward: (message: Message) => void;
  openImage: (image: LightboxImage) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(false);
  const [invite, setInvite] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [forward, setForward] = useState<Message | null>(null);
  const [image, setImage] = useState<LightboxImage | null>(null);

  const openSettings = useCallback(() => setSettings(true), []);
  const openInvite = useCallback(() => setInvite(true), []);
  const openNewChat = useCallback(() => setNewChat(true), []);
  const openNewGroup = useCallback(() => setNewGroup(true), []);
  const openProfile = useCallback((user: User) => setProfile(user), []);
  const openForward = useCallback((message: Message) => setForward(message), []);
  const openImage = useCallback((next: LightboxImage) => setImage(next), []);

  const value = useMemo(
    () => ({ openSettings, openInvite, openNewChat, openNewGroup, openProfile, openForward, openImage }),
    [openSettings, openInvite, openNewChat, openNewGroup, openProfile, openForward, openImage],
  );

  return (
    <UiContext.Provider value={value}>
      {children}
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <InviteModal open={invite} onClose={() => setInvite(false)} />
      <NewChatModal
        open={newChat}
        onClose={() => setNewChat(false)}
        onCreateGroup={() => {
          setNewChat(false);
          setNewGroup(true);
        }}
      />
      <NewGroupModal open={newGroup} onClose={() => setNewGroup(false)} />
      <UserProfileModal user={profile} onClose={() => setProfile(null)} />
      <ForwardModal message={forward} onClose={() => setForward(null)} />
      <ImageLightbox image={image} onClose={() => setImage(null)} />
    </UiContext.Provider>
  );
}
