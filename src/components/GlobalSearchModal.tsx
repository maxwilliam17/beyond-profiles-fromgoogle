import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Search,
  StickyNote,
  Users,
  Video,
  X,
} from 'lucide-react';
import {formatDate, formatFileSize, isMyGroup, makeChatId} from '../lib/helpers';
import {CATEGORY_THEMES, RESOURCE_CATEGORY_ORDER} from '../lib/theme';
import type {
  ConversationRef,
  GroupChat,
  Profile,
  UserData,
  VaultCategory,
  VaultItem,
} from '../lib/types';
import {GroupAvatar, ProfileAvatar} from './Avatar';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: Profile;
  profiles: Profile[];
  groupsData: Record<string, GroupChat>;
  userData: UserData;
  onOpenConvo: (convo: ConversationRef) => void;
  onOpenVault: (category: VaultCategory) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  onClose,
  currentUser,
  profiles,
  groupsData,
  userData,
  onOpenConvo,
  onOpenVault,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();

  const matchedProfiles = useMemo(() => {
    const others = profiles.filter((p) => p.id !== currentUser.id);
    if (!q) return others.slice(0, 5);
    return others.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [profiles, currentUser.id, q]);

  const matchedGroups = useMemo(() => {
    const mine = Object.entries(groupsData)
      .filter(([, g]) => isMyGroup(g, currentUser.id))
      .map(([id, g]) => ({...g, id}));
    if (!q) return mine.slice(0, 4);
    return mine.filter((g) => (g.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [groupsData, currentUser.id, q]);

  const matchedResources = useMemo(() => {
    const hits: Array<{category: VaultCategory; item: VaultItem}> = [];
    RESOURCE_CATEGORY_ORDER.forEach((cat) => {
      (userData[cat] || []).forEach((item) => {
        const hay = `${item.title || ''} ${item.name || ''} ${item.content || ''}`.toLowerCase();
        if (!q || hay.includes(q)) {
          hits.push({category: cat, item});
        }
      });
    });
    return hits.slice(0, q ? 16 : 8);
  }, [userData, q]);

  if (!open) return null;

  const iconFor = (cat: VaultCategory) => {
    switch (cat) {
      case 'notes':
        return <StickyNote className="w-4 h-4" />;
      case 'photos':
        return <ImageIcon className="w-4 h-4" />;
      case 'videos':
        return <Video className="w-4 h-4" />;
      case 'files':
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] bg-black/75 backdrop-blur-sm flex items-start justify-center p-4 pt-14 sm:pt-20"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-[#24201E] border border-[#FFEBD7]/12 shadow-2xl overflow-hidden animate-view-in"
      >
        <div className="px-4 py-3 border-b border-[#FFEBD7]/[0.08] flex items-center gap-3">
          <Search className="w-5 h-5 text-[#D98A4E] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats, groups, notes, photos, videos, files..."
            className="flex-1 min-w-0 bg-transparent text-sm text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto custom-scroll p-3 space-y-4">
          {matchedProfiles.length === 0 &&
          matchedGroups.length === 0 &&
          matchedResources.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[#A39B93]">No matches for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <>
              {(matchedProfiles.length > 0 || matchedGroups.length > 0) && (
                <div>
                  <p className="px-2 pb-1.5 text-[11px] font-medium text-[#A39B93] uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Conversations</span>
                  </p>
                  <div className="space-y-1">
                    {matchedProfiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onOpenConvo({kind: 'dm', id: makeChatId(currentUser.id, p.id)});
                          onClose();
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-[#2E2926] flex items-center gap-3 text-left transition-colors"
                      >
                        <ProfileAvatar profile={p} sizeClass="w-9 h-9" roundedClass="rounded-full" showOnlineDot />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#F3EFEA] truncate">{p.name}</p>
                          <p className="text-xs text-[#A39B93]">Direct message</p>
                        </div>
                      </button>
                    ))}
                    {matchedGroups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          onOpenConvo({kind: 'group', id: g.id});
                          onClose();
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-[#2E2926] flex items-center gap-3 text-left transition-colors"
                      >
                        <GroupAvatar group={g} sizeClass="w-9 h-9" roundedClass="rounded-full" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#F3EFEA] truncate">{g.name}</p>
                          <p className="text-xs text-[#A39B93] inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>{Object.keys(g.members || {}).length} members</span>
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {matchedResources.length > 0 && (
                <div>
                  <p className="px-2 pb-1.5 text-[11px] font-medium text-[#A39B93] uppercase tracking-wider">
                    Vault Resources
                  </p>
                  <div className="space-y-1">
                    {matchedResources.map(({category, item}) => {
                      const theme = CATEGORY_THEMES[category];
                      return (
                        <button
                          key={`${category}:${item.id}`}
                          type="button"
                          onClick={() => {
                            onOpenVault(category);
                            onClose();
                          }}
                          className="w-full px-3 py-2 rounded-xl hover:bg-[#2E2926] flex items-center gap-3 text-left transition-colors"
                        >
                          <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{backgroundColor: theme.iconBg, color: theme.highlight}}
                          >
                            {iconFor(category)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#F3EFEA] truncate">
                              {item.title || item.name || 'Untitled'}
                            </p>
                            <p className="text-xs text-[#A39B93] truncate">
                              {theme.label}
                              {item.size ? ` · ${formatFileSize(item.size)}` : ''}
                              {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
