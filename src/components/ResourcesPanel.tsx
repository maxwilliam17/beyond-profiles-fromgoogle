import React, {useMemo, useState} from 'react';
import {ref, update} from 'firebase/database';
import {
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Pin,
  Play,
  Plus,
  Send,
  StickyNote,
  Video,
  X,
} from 'lucide-react';
import {db} from '../lib/firebase';
import {formatDate, formatFileSize} from '../lib/helpers';
import {CATEGORY_THEMES, DRAG_RESOURCE_MIME, RESOURCE_CATEGORY_ORDER} from '../lib/theme';
import type {UserData, VaultCategory, VaultItem} from '../lib/types';

function categoryIcon(category: VaultCategory, className = 'w-4 h-4') {
  switch (category) {
    case 'notes':
      return <StickyNote className={className} />;
    case 'photos':
      return <ImageIcon className={className} />;
    case 'videos':
      return <Video className={className} />;
    case 'files':
      return <FileText className={className} />;
  }
}

function getDisplayItems(items: VaultItem[], pinnedOnly: boolean): {list: VaultItem[]; hasPinned: boolean} {
  const sorted = [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const pinned = sorted.filter((i) => i.pinned);
  if (pinnedOnly && pinned.length > 0) {
    return {list: pinned, hasPinned: true};
  }
  return {list: sorted, hasPinned: pinned.length > 0};
}

function getCategorySubtitle(category: VaultCategory, items: VaultItem[], pinnedOnly: boolean): string {
  const pinnedCount = items.filter((i) => i.pinned).length;
  if (category === 'notes') {
    if (pinnedCount > 0 && pinnedOnly) return `${pinnedCount} Pinned Note${pinnedCount === 1 ? '' : 's'}`;
    if (items.length === 0) return 'No notes yet';
    return `${items.length} ${pinnedCount > 0 ? `Note${items.length === 1 ? '' : 's'} · ${pinnedCount} pinned` : `Pinned Note${items.length === 1 ? '' : 's'}`}`;
  }
  if (category === 'photos') {
    if (items.length === 0) return 'No photos yet';
    return pinnedCount > 0 && pinnedOnly
      ? `${pinnedCount} Pinned Photo${pinnedCount === 1 ? '' : 's'}`
      : `Recent Photos (${items.length})`;
  }
  if (category === 'videos') {
    if (items.length === 0) return 'No videos yet';
    return `${items.length} Shared Video${items.length === 1 ? '' : 's'}`;
  }
  if (items.length === 0) return 'No files yet';
  if (pinnedCount > 0 && pinnedOnly) return `${pinnedCount} Pinned File${pinnedCount === 1 ? '' : 's'}`;
  return `Pinned Files (${items.length})`;
}

/* ============================================================
   ITEM PREVIEW MODAL (SHARED BY SIDEBAR & MOBILE DRAWER)
   ============================================================ */
interface ResourcePreviewModalProps {
  preview: {category: VaultCategory; item: VaultItem} | null;
  canShareToChat: boolean;
  onClose: () => void;
  onShare: (category: VaultCategory, item: VaultItem) => void;
}

export const ResourcePreviewModal: React.FC<ResourcePreviewModalProps> = ({
  preview,
  canShareToChat,
  onClose,
  onShare,
}) => {
  if (!preview) return null;
  const {category, item} = preview;
  const theme = CATEGORY_THEMES[category];

  const handleDownload = () => {
    if (!item.data) return;
    const a = document.createElement('a');
    a.href = item.data;
    a.download = item.name || item.title || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-[#24201E] border border-[#FFEBD7]/12 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-[#FFEBD7]/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{backgroundColor: theme.iconBg, color: theme.highlight}}
            >
              {categoryIcon(category, 'w-4 h-4')}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F3EFEA] truncate">
                {item.title || item.name || 'Untitled'}
              </p>
              <p className="text-[11px] text-[#A39B93]">
                {theme.label}
                {item.size ? ` · ${formatFileSize(item.size)}` : ''}
                {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.06]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-[65vh] overflow-y-auto custom-scroll">
          {category === 'photos' && item.data && (
            <img
              src={item.data}
              alt={item.name || 'Photo'}
              className="max-h-[54vh] max-w-full mx-auto rounded-xl border border-[#FFEBD7]/[0.08]"
            />
          )}
          {category === 'videos' && item.data && (
            <video
              src={item.data}
              controls
              autoPlay
              className="max-h-[54vh] max-w-full mx-auto rounded-xl border border-[#FFEBD7]/[0.08] bg-black"
            />
          )}
          {category === 'notes' && (
            <div className="rounded-xl bg-[#1C1918] border border-[#FFEBD7]/[0.08] p-4">
              <p className="text-sm text-[#F3EFEA] whitespace-pre-wrap leading-relaxed">
                {item.content || 'Empty note'}
              </p>
            </div>
          )}
          {category === 'files' && (
            <div className="rounded-xl bg-[#1C1918] border border-[#FFEBD7]/[0.08] p-6 text-center space-y-2">
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                style={{backgroundColor: theme.iconBg, color: theme.highlight}}
              >
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-[#F3EFEA] break-all">{item.name}</p>
              <p className="text-xs text-[#A39B93] tabular-nums">{formatFileSize(item.size)}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#FFEBD7]/[0.08] flex items-center justify-end gap-2.5 bg-[#1E1B1A]">
          {item.data && category !== 'notes' && (
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[42px] px-4 rounded-xl border border-[#FFEBD7]/12 bg-[#24201E] hover:bg-[#2C2724] text-xs font-medium text-[#F3EFEA] inline-flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          )}
          {canShareToChat && (
            <button
              type="button"
              onClick={() => {
                onShare(category, item);
                onClose();
              }}
              className="min-h-[42px] px-4 rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-xs font-medium text-[#F3EFEA] inline-flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Share in Chat</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   DESKTOP RIGHT SIDEBAR — "Resources" PANEL (>= 1024px)
   ============================================================ */
interface DesktopResourcesSidebarProps {
  profileId: string;
  userData: UserData;
  canShareToChat: boolean;
  onShareItem: (category: VaultCategory, item: VaultItem) => void;
  onOpenVault: (category: VaultCategory) => void;
}

export const DesktopResourcesSidebar: React.FC<DesktopResourcesSidebarProps> = ({
  profileId,
  userData,
  canShareToChat,
  onShareItem,
  onOpenVault,
}) => {
  const [pinnedOnly, setPinnedOnly] = useState(true);
  const [expanded, setExpanded] = useState<Record<VaultCategory, boolean>>({
    notes: true,
    photos: true,
    videos: false,
    files: true,
  });
  const [preview, setPreview] = useState<{category: VaultCategory; item: VaultItem} | null>(null);

  const toggleSection = (cat: VaultCategory) => {
    setExpanded((prev) => ({...prev, [cat]: !prev[cat]}));
  };

  const handleTogglePin = async (e: React.MouseEvent, category: VaultCategory, item: VaultItem) => {
    e.stopPropagation();
    await update(ref(db, `userData/${profileId}/${category}/${item.id}`), {
      pinned: !item.pinned,
    }).catch(() => {});
  };

  const handleDragStart = (e: React.DragEvent, category: VaultCategory, item: VaultItem) => {
    e.dataTransfer.setData(DRAG_RESOURCE_MIME, JSON.stringify({category, itemId: item.id}));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleItemActivate = (category: VaultCategory, item: VaultItem) => {
    if (canShareToChat) {
      onShareItem(category, item);
    } else {
      setPreview({category, item});
    }
  };

  return (
    <>
      <aside className="hidden lg:flex w-[300px] xl:w-[320px] shrink-0 flex-col border-l border-[#FFEBD7]/[0.08] bg-[#1C1918] min-h-0">
        {/* Sidebar Header */}
        <div className="px-4 py-3.5 border-b border-[#FFEBD7]/[0.08] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold text-[#F3EFEA] tracking-tight">
              Resources
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setPinnedOnly((p) => !p)}
            title="Toggle Pinned filter"
            className={`px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-all duration-200 ${
              pinnedOnly
                ? 'bg-[#8C5327]/35 text-[#E7A773] border border-[#D98A4E]/40'
                : 'text-[#A39B93] hover:text-[#F3EFEA] border border-[#FFEBD7]/[0.08] hover:bg-[#24201E]'
            }`}
          >
            <Pin className="w-3 h-3" />
            <span>{pinnedOnly ? 'Pinned' : 'All'}</span>
          </button>
        </div>

        {/* Helper Hint */}
        <div className="px-4 pt-3 pb-1 shrink-0">
          <p className="text-[11px] text-[#A39B93]">
            {canShareToChat
              ? 'Click or drag any item into the chat to share.'
              : 'Select a chat to share resources directly.'}
          </p>
        </div>

        {/* 4 Color-Coded Collapsible Accordion Cards */}
        <div className="flex-1 overflow-y-auto custom-scroll px-3.5 py-2.5 space-y-3">
          {RESOURCE_CATEGORY_ORDER.map((cat) => {
            const theme = CATEGORY_THEMES[cat];
            const rawItems = userData[cat] || [];
            const {list} = getDisplayItems(rawItems, pinnedOnly);
            const isOpen = expanded[cat];
            const subtitle = getCategorySubtitle(cat, rawItems, pinnedOnly);

            return (
              <div
                key={cat}
                className="rounded-[15px] overflow-hidden transition-all duration-200"
                style={{
                  backgroundColor: '#24201E',
                  border: `1px solid ${isOpen ? theme.cardBorder : 'rgba(255, 235, 215, 0.08)'}`,
                  boxShadow: isOpen ? `0 8px 24px -14px ${theme.surface}` : 'none',
                }}
              >
                {/* Accordion Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSection(cat)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSection(cat);
                    }
                  }}
                  className="px-3.5 py-3 flex items-center justify-between gap-2 cursor-pointer select-none transition-colors duration-200 hover:bg-[#FFEBD7]/[0.03]"
                  style={{
                    background: isOpen
                      ? `linear-gradient(135deg, ${theme.cardBg} 0%, rgba(36, 32, 30, 0.6) 100%)`
                      : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                      style={{backgroundColor: theme.iconBg, color: theme.highlight}}
                    >
                      {categoryIcon(cat, 'w-4 h-4')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#F3EFEA] leading-tight">{theme.label}</p>
                      <p className="text-[11px] text-[#A39B93] truncate mt-0.5 tabular-nums">{subtitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`Add ${theme.label}`}
                      title={`Manage or add ${theme.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenVault(cat);
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.08] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <ChevronDown
                      className={`w-4 h-4 text-[#A39B93] transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Smooth Accordion Body */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-1.5 border-t border-[#FFEBD7]/[0.06]">
                      {list.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpenVault(cat)}
                          className="w-full py-3 px-2 rounded-xl border border-dashed border-[#FFEBD7]/12 text-[11px] text-[#A39B93] hover:text-[#F3EFEA] hover:border-[#FFEBD7]/25 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add {cat === 'notes' ? 'a note' : cat}</span>
                        </button>
                      ) : cat === 'notes' ? (
                        /* Notes: Bulleted quick-links */
                        <ul className="space-y-1">
                          {list.slice(0, 6).map((note) => (
                            <li
                              key={note.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'notes', note)}
                              onClick={() => handleItemActivate('notes', note)}
                              className="group flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[#8C5327]/20 cursor-pointer transition-colors"
                              title={canShareToChat ? 'Click or drag to share note' : 'Click to inspect note'}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{backgroundColor: theme.highlight}}
                              />
                              <span className="flex-1 min-w-0 text-xs text-[#F3EFEA] truncate">
                                {note.title || 'Untitled Note'}
                              </span>
                              <button
                                type="button"
                                aria-label="Preview note"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreview({category: 'notes', item: note});
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#A39B93] hover:text-[#F3EFEA] transition-opacity"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                                onClick={(e) => handleTogglePin(e, 'notes', note)}
                                className={`p-1 rounded-md transition-opacity ${
                                  note.pinned
                                    ? 'text-[#D98A4E]'
                                    : 'opacity-0 group-hover:opacity-100 text-[#A39B93] hover:text-[#D98A4E]'
                                }`}
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : cat === 'photos' ? (
                        /* Photos: Horizontal thumbnail strip */
                        <div className="flex gap-2 overflow-x-auto custom-scroll pb-1">
                          {list.slice(0, 10).map((photo) => (
                            <div
                              key={photo.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'photos', photo)}
                              onClick={() => handleItemActivate('photos', photo)}
                              title={
                                canShareToChat
                                  ? `Click or drag "${photo.name || 'Photo'}" to share`
                                  : photo.name || 'Photo'
                              }
                              className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[#C97A57]/30 bg-[#181615] cursor-pointer group"
                            >
                              {photo.data && (
                                <img
                                  src={photo.data}
                                  alt={photo.name || 'Photo'}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                <button
                                  type="button"
                                  aria-label="Preview photo"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreview({category: 'photos', item: photo});
                                  }}
                                  className="p-1 rounded-md bg-black/60 text-[#F3EFEA]"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={photo.pinned ? 'Unpin photo' : 'Pin photo'}
                                  onClick={(e) => handleTogglePin(e, 'photos', photo)}
                                  className={`p-1 rounded-md bg-black/60 ${
                                    photo.pinned ? 'text-[#C97A57]' : 'text-[#F3EFEA]'
                                  }`}
                                >
                                  <Pin className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : cat === 'videos' ? (
                        /* Videos: Compact preview list */
                        <div className="space-y-1.5">
                          {list.slice(0, 5).map((video) => (
                            <div
                              key={video.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'videos', video)}
                              onClick={() => handleItemActivate('videos', video)}
                              className="group flex items-center gap-2.5 p-1.5 rounded-xl bg-[#1E1B1A] border border-[#B89748]/20 hover:border-[#B89748]/45 cursor-pointer transition-colors"
                            >
                              <div className="relative w-12 h-9 rounded-lg overflow-hidden bg-black shrink-0 flex items-center justify-center">
                                {video.data && (
                                  <video src={video.data} className="w-full h-full object-cover opacity-80" />
                                )}
                                <Play className="w-3.5 h-3.5 text-[#F3EFEA] absolute" fill="currentColor" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-[#F3EFEA] truncate">
                                  {video.name || 'Video'}
                                </p>
                                <p className="text-[10px] text-[#A39B93] tabular-nums">
                                  {formatFileSize(video.size)}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Preview video"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreview({category: 'videos', item: video});
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#A39B93] hover:text-[#F3EFEA]"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Files: Clickable / draggable sage chips */
                        <div className="flex flex-wrap gap-1.5">
                          {list.slice(0, 8).map((file) => (
                            <div
                              key={file.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'files', file)}
                              onClick={() => handleItemActivate('files', file)}
                              title={
                                canShareToChat
                                  ? `Click or drag "${file.name}" to share in chat`
                                  : file.name
                              }
                              className="group max-w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#5A6E5C]/20 hover:bg-[#5A6E5C]/35 border border-[#86A389]/30 text-xs text-[#F3EFEA] cursor-pointer transition-colors"
                            >
                              <GripVertical className="w-3 h-3 text-[#86A389]/70 shrink-0" />
                              <FileText className="w-3.5 h-3.5 text-[#86A389] shrink-0" />
                              <span className="truncate max-w-[155px]">{file.name || 'File'}</span>
                              <button
                                type="button"
                                aria-label={file.pinned ? 'Unpin file' : 'Pin file'}
                                onClick={(e) => handleTogglePin(e, 'files', file)}
                                className={`ml-0.5 ${
                                  file.pinned
                                    ? 'text-[#86A389]'
                                    : 'opacity-0 group-hover:opacity-100 text-[#A39B93] hover:text-[#86A389]'
                                }`}
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer link to Full Cloud Vault */}
        <div className="p-3 border-t border-[#FFEBD7]/[0.08] shrink-0">
          <button
            type="button"
            onClick={() => onOpenVault('files')}
            className="w-full min-h-[40px] px-3 rounded-xl bg-[#24201E] hover:bg-[#2C2724] border border-[#FFEBD7]/[0.08] text-xs font-medium text-[#A39B93] hover:text-[#F3EFEA] flex items-center justify-between transition-colors"
          >
            <span>Open Full Vault</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      <ResourcePreviewModal
        preview={preview}
        canShareToChat={canShareToChat}
        onClose={() => setPreview(null)}
        onShare={onShareItem}
      />
    </>
  );
};

/* ============================================================
   MOBILE / TABLET COMPACT HORIZONTAL RESOURCE PILL BAR (< 1024px)
   ============================================================ */
interface MobileResourcePillsProps {
  userData: UserData;
  activeCategory: VaultCategory | null;
  onSelectCategory: (category: VaultCategory) => void;
}

export const MobileResourcePills: React.FC<MobileResourcePillsProps> = ({
  userData,
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <div className="lg:hidden px-3 py-2 border-b border-[#FFEBD7]/[0.07] bg-[#1B1817]/95 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
      {RESOURCE_CATEGORY_ORDER.map((cat) => {
        const theme = CATEGORY_THEMES[cat];
        const count = (userData[cat] || []).length;
        const isActive = activeCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategory(cat)}
            className="min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-200 active:scale-[0.97]"
            style={{
              backgroundColor: isActive ? theme.pillActiveBg : theme.pillBg,
              border: `1px solid ${isActive ? theme.pillBorder : theme.cardBorder}`,
              color: '#F3EFEA',
              boxShadow: isActive ? theme.pillGlow : 'none',
            }}
          >
            <span style={{color: theme.highlight}}>{categoryIcon(cat, 'w-3.5 h-3.5')}</span>
            <span>{theme.label}</span>
            {count > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.2 rounded-full tabular-nums"
                style={{backgroundColor: 'rgba(24, 22, 21, 0.45)', color: theme.textAccent}}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ============================================================
   MOBILE / TABLET SLIDE-UP BOTTOM DRAWER (< 1024px)
   ============================================================ */
interface MobileResourceDrawerProps {
  open: boolean;
  category: VaultCategory;
  profileId: string;
  userData: UserData;
  canShareToChat: boolean;
  onChangeCategory: (cat: VaultCategory) => void;
  onClose: () => void;
  onShareItem: (category: VaultCategory, item: VaultItem) => void;
  onOpenVault: (category: VaultCategory) => void;
}

export const MobileResourceDrawer: React.FC<MobileResourceDrawerProps> = ({
  open,
  category,
  profileId,
  userData,
  canShareToChat,
  onChangeCategory,
  onClose,
  onShareItem,
  onOpenVault,
}) => {
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [preview, setPreview] = useState<{category: VaultCategory; item: VaultItem} | null>(null);

  const items = useMemo(() => {
    const {list} = getDisplayItems(userData[category] || [], pinnedOnly);
    return list;
  }, [userData, category, pinnedOnly]);

  if (!open) {
    return (
      <ResourcePreviewModal
        preview={preview}
        canShareToChat={canShareToChat}
        onClose={() => setPreview(null)}
        onShare={onShareItem}
      />
    );
  }

  const theme = CATEGORY_THEMES[category];

  const handleTogglePin = async (e: React.MouseEvent, item: VaultItem) => {
    e.stopPropagation();
    await update(ref(db, `userData/${profileId}/${category}/${item.id}`), {
      pinned: !item.pinned,
    }).catch(() => {});
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-[2px] flex items-end justify-center lg:hidden"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-drawer-up w-full max-w-2xl rounded-t-[22px] bg-[#211E1C] border-t border-x border-[#FFEBD7]/12 shadow-2xl max-h-[78vh] flex flex-col pb-safe overflow-hidden"
        >
          {/* Drag Handle */}
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <span className="w-10 h-1 rounded-full bg-[#FFEBD7]/20" />
          </div>

          {/* Drawer Header */}
          <div className="px-4 py-2 flex items-center justify-between gap-2 shrink-0">
            <div>
              <h3 className="font-display text-base font-semibold text-[#F3EFEA]">Pinned Resources</h3>
              <p className="text-[11px] text-[#A39B93]">
                {canShareToChat ? 'Tap any item to insert into chat' : 'Tap any item to inspect'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPinnedOnly((p) => !p)}
                className={`min-h-[38px] px-3 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                  pinnedOnly
                    ? 'bg-[#8C5327]/40 text-[#E7A773] border border-[#D98A4E]/45'
                    : 'bg-[#2A2523] text-[#A39B93] border border-[#FFEBD7]/[0.08]'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
                <span>{pinnedOnly ? 'Pinned' : 'All'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVault(category);
                }}
                aria-label={`Add ${theme.label}`}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-[#2A2523] border border-[#FFEBD7]/[0.08] text-[#F3EFEA] flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close resources drawer"
                className="min-h-[38px] min-w-[38px] rounded-xl text-[#A39B93] hover:text-[#F3EFEA] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 4 Color-Matched Category Switcher Pills */}
          <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-[#FFEBD7]/[0.07] shrink-0">
            {RESOURCE_CATEGORY_ORDER.map((cat) => {
              const t = CATEGORY_THEMES[cat];
              const active = cat === category;
              const count = (userData[cat] || []).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onChangeCategory(cat)}
                  className="min-h-[44px] px-3.5 py-2 rounded-full text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-200"
                  style={{
                    backgroundColor: active ? t.pillActiveBg : t.pillBg,
                    border: `1px solid ${active ? t.pillBorder : t.cardBorder}`,
                    color: '#F3EFEA',
                    boxShadow: active ? t.pillGlow : 'none',
                  }}
                >
                  <span style={{color: t.highlight}}>{categoryIcon(cat, 'w-4 h-4')}</span>
                  <span>{t.label}</span>
                  <span className="text-[11px] opacity-80 tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto custom-scroll p-4">
            {items.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <div
                  className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                  style={{backgroundColor: theme.iconBg, color: theme.highlight}}
                >
                  {categoryIcon(category, 'w-6 h-6')}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F3EFEA]">No {theme.label.toLowerCase()} yet</p>
                  <p className="text-xs text-[#A39B93] mt-0.5">Upload items to your vault to share them anytime.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVault(category);
                  }}
                  className="min-h-[44px] px-4 rounded-xl text-xs font-medium text-[#F3EFEA] inline-flex items-center gap-1.5"
                  style={{backgroundColor: theme.surface}}
                >
                  <Plus className="w-4 h-4" />
                  <span>Add {category === 'notes' ? 'Note' : theme.label}</span>
                </button>
              </div>
            ) : category === 'photos' ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {items.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => {
                      if (canShareToChat) {
                        onShareItem('photos', photo);
                        onClose();
                      } else {
                        setPreview({category: 'photos', item: photo});
                      }
                    }}
                    className="relative aspect-square rounded-2xl overflow-hidden bg-[#181615] border border-[#C97A57]/30 active:scale-[0.97] transition-transform cursor-pointer"
                  >
                    {photo.data && (
                      <img src={photo.data} alt={photo.name || 'Photo'} className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      aria-label="Preview photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview({category: 'photos', item: photo});
                      }}
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-lg bg-black/60 text-[#F3EFEA] flex items-center justify-center"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canShareToChat && (
                      <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full bg-[#9E5A3C]/90 text-[10px] font-medium text-[#F3EFEA]">
                        Send
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : category === 'videos' ? (
              <div className="grid grid-cols-2 gap-3">
                {items.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => {
                      if (canShareToChat) {
                        onShareItem('videos', video);
                        onClose();
                      } else {
                        setPreview({category: 'videos', item: video});
                      }
                    }}
                    className="rounded-2xl overflow-hidden bg-[#181615] border border-[#B89748]/30 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="relative aspect-video bg-black flex items-center justify-center">
                      {video.data && <video src={video.data} className="w-full h-full object-cover opacity-80" />}
                      <span className="absolute w-10 h-10 rounded-full bg-[#735D28]/90 flex items-center justify-center text-[#F3EFEA]">
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                      </span>
                    </div>
                    <div className="p-2.5 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[#F3EFEA] truncate">{video.name || 'Video'}</p>
                      <button
                        type="button"
                        aria-label="Inspect video"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreview({category: 'videos', item: video});
                        }}
                        className="p-1.5 rounded-lg text-[#A39B93] hover:text-[#F3EFEA]"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Notes & Files list with 44px touch targets */
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (canShareToChat) {
                        onShareItem(category, item);
                        onClose();
                      } else {
                        setPreview({category, item});
                      }
                    }}
                    className="min-h-[56px] px-3.5 py-2.5 rounded-2xl bg-[#272321] border flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all"
                    style={{borderColor: theme.cardBorder}}
                  >
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{backgroundColor: theme.iconBg, color: theme.highlight}}
                    >
                      {categoryIcon(category, 'w-5 h-5')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#F3EFEA] truncate">
                        {item.title || item.name || 'Untitled'}
                      </p>
                      <p className="text-xs text-[#A39B93] truncate">
                        {category === 'notes'
                          ? item.content || formatDate(item.createdAt)
                          : `${formatFileSize(item.size)} · ${formatDate(item.createdAt)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={item.pinned ? 'Unpin' : 'Pin'}
                      onClick={(e) => handleTogglePin(e, item)}
                      className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center ${
                        item.pinned ? '' : 'text-[#A39B93]'
                      }`}
                      style={item.pinned ? {color: theme.highlight} : undefined}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Inspect item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview({category, item});
                      }}
                      className="min-h-[40px] min-w-[40px] rounded-xl text-[#A39B93] hover:text-[#F3EFEA] flex items-center justify-center"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {canShareToChat && (
                      <span
                        className="min-h-[36px] px-3 rounded-xl text-xs font-medium text-[#F3EFEA] inline-flex items-center gap-1 shrink-0"
                        style={{backgroundColor: theme.surface}}
                      >
                        <Send className="w-3 h-3" />
                        <span>Share</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ResourcePreviewModal
        preview={preview}
        canShareToChat={canShareToChat}
        onClose={() => setPreview(null)}
        onShare={onShareItem}
      />
    </>
  );
};
