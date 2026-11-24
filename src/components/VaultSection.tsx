import React, {useEffect, useMemo, useRef, useState} from 'react';
import {push, ref, remove, set, update} from 'firebase/database';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Pin,
  Play,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {db} from '../lib/firebase';
import {formatDate, formatFileSize} from '../lib/helpers';
import {CATEGORY_THEMES, RESOURCE_CATEGORY_ORDER} from '../lib/theme';
import type {UserData, VaultCategory, VaultItem} from '../lib/types';

const NOTE_PALETTE = [
  {id: 'amber', surface: 'rgba(140, 83, 39, 0.24)', border: 'rgba(217, 138, 78, 0.38)'},
  {id: 'terracotta', surface: 'rgba(158, 90, 60, 0.24)', border: 'rgba(201, 122, 87, 0.38)'},
  {id: 'ochre', surface: 'rgba(115, 93, 40, 0.24)', border: 'rgba(184, 151, 72, 0.38)'},
  {id: 'sage', surface: 'rgba(90, 110, 92, 0.24)', border: 'rgba(134, 163, 137, 0.38)'},
  {id: 'charcoal', surface: 'rgba(36, 32, 30, 0.92)', border: 'rgba(255, 235, 215, 0.12)'},
];

interface VaultSectionProps {
  profileId: string;
  userData: UserData;
  initialCategory?: VaultCategory;
  onNotify?: (title: string, body: string) => void;
}

export const VaultSection: React.FC<VaultSectionProps> = ({
  profileId,
  userData,
  initialCategory = 'notes',
  onNotify,
}) => {
  const [category, setCategory] = useState<VaultCategory>(initialCategory);
  const [search, setSearch] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState('amber');
  const [uploading, setUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<{cat: VaultCategory; item: VaultItem} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  const items = useMemo(() => {
    const raw = userData[category] || [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? raw.filter((it) =>
          `${it.title || ''} ${it.name || ''} ${it.content || ''}`.toLowerCase().includes(q),
        )
      : raw;
    return [...filtered].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [userData, category, search]);

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const maxSize = 6 * 1024 * 1024;
    setUploading(true);
    let saved = 0;

    for (const file of Array.from(fileList)) {
      if (file.size > maxSize) {
        onNotify?.('File too large', `${file.name} exceeds the 6 MB limit.`);
        continue;
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Read failed'));
          reader.readAsDataURL(file);
        });
        const newRef = push(ref(db, `userData/${profileId}/${category}`));
        await set(newRef, {
          name: file.name,
          size: file.size,
          type: file.type,
          data: dataUrl,
          pinned: false,
          createdAt: Date.now(),
        });
        saved += 1;
      } catch {
        onNotify?.('Upload failed', `Could not upload ${file.name}.`);
      }
    }

    setUploading(false);
    if (saved > 0) {
      onNotify?.('Saved to vault', `${saved} item${saved === 1 ? '' : 's'} uploaded.`);
    }
  };

  const handleSaveNote = async () => {
    const title = noteTitle.trim();
    const content = noteContent.trim();
    if (!title && !content) return;
    const newRef = push(ref(db, `userData/${profileId}/notes`));
    await set(newRef, {
      title: title || 'Untitled Note',
      content,
      color: noteColor,
      pinned: true,
      createdAt: Date.now(),
    });
    setNoteTitle('');
    setNoteContent('');
    onNotify?.('Note saved', 'Pinned to your Notes & Resources panel.');
  };

  const handleTogglePin = async (cat: VaultCategory, item: VaultItem) => {
    await update(ref(db, `userData/${profileId}/${cat}/${item.id}`), {
      pinned: !item.pinned,
    }).catch(() => {});
  };

  const handleDelete = async (cat: VaultCategory, id: string) => {
    await remove(ref(db, `userData/${profileId}/${cat}/${id}`)).catch(() => {});
  };

  const handleDownload = (item: VaultItem) => {
    if (!item.data) return;
    const a = document.createElement('a');
    a.href = item.data;
    a.download = item.name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const iconFor = (cat: VaultCategory) => {
    switch (cat) {
      case 'notes':
        return StickyNote;
      case 'photos':
        return ImageIcon;
      case 'videos':
        return Video;
      case 'files':
        return FileText;
    }
  };

  const activeTheme = CATEGORY_THEMES[category];
  const acceptMap: Record<VaultCategory, string> = {
    files: '*/*',
    photos: 'image/*',
    videos: 'video/*',
    notes: '',
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto space-y-5">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#F3EFEA] tracking-tight">
            Cloud Vault &amp; Resources
          </h1>
          <p className="text-xs text-[#A39B93] mt-0.5">
            Pin any item to keep it handy in your Workspace Resources panel.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#A39B93] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTheme.label.toLowerCase()}...`}
            className="w-full min-h-[42px] rounded-full bg-[#24201E] border border-[#FFEBD7]/10 pl-10 pr-4 text-sm text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none focus:border-[#D98A4E]/55"
          />
        </div>
      </div>

      {/* Color-Coded Category Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {RESOURCE_CATEGORY_ORDER.map((cat) => {
          const t = CATEGORY_THEMES[cat];
          const Icon = iconFor(cat);
          const count = (userData[cat] || []).length;
          const active = category === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className="min-h-[44px] px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 whitespace-nowrap shrink-0 transition-all duration-200"
              style={{
                backgroundColor: active ? t.pillActiveBg : t.pillBg,
                border: `1px solid ${active ? t.pillBorder : t.cardBorder}`,
                color: '#F3EFEA',
                boxShadow: active ? t.pillGlow : 'none',
              }}
            >
              <Icon className="w-4 h-4 shrink-0" style={{color: t.highlight}} />
              <span>{t.label}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full tabular-nums"
                style={{backgroundColor: 'rgba(24, 22, 21, 0.45)', color: t.textAccent}}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Upload Dropzone or Note Composer */}
      {category !== 'notes' ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleUploadFiles(e.dataTransfer.files);
          }}
          className="rounded-2xl border border-dashed p-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors"
          style={{
            backgroundColor: activeTheme.cardBg,
            borderColor: activeTheme.pillBorder,
          }}
        >
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{backgroundColor: activeTheme.iconBg, color: activeTheme.highlight}}
            >
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F3EFEA]">
                {uploading ? 'Uploading to cloud…' : `Upload ${activeTheme.label}`}
              </p>
              <p className="text-xs text-[#A39B93]">
                Drop files here or choose from your device (up to 6 MB each)
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-[#F3EFEA] text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0"
            style={{backgroundColor: activeTheme.surface}}
          >
            <Plus className="w-4 h-4" />
            <span>Choose {activeTheme.label}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptMap[category]}
            className="hidden"
            onChange={(e) => {
              handleUploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div
          className="rounded-2xl border p-4 sm:p-5 space-y-3"
          style={{
            backgroundColor: '#24201E',
            borderColor: CATEGORY_THEMES.notes.cardBorder,
          }}
        >
          <input
            type="text"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Note title…"
            className="w-full min-h-[44px] rounded-xl bg-[#1C1918] border border-[#FFEBD7]/[0.08] px-4 text-base font-medium text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none focus:border-[#D98A4E]/60"
          />
          <textarea
            rows={3}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Write a note, link, or checklist…"
            className="w-full rounded-xl bg-[#1C1918] border border-[#FFEBD7]/[0.08] p-3.5 text-sm text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none focus:border-[#D98A4E]/60 resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {NOTE_PALETTE.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Color ${c.id}`}
                  onClick={() => setNoteColor(c.id)}
                  className={`w-7 h-7 rounded-full border transition-transform ${
                    noteColor === c.id ? 'ring-2 ring-[#F3EFEA] scale-110' : ''
                  }`}
                  style={{backgroundColor: c.surface, borderColor: c.border}}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveNote}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#8C5327] hover:bg-[#A66533] text-[#F3EFEA] text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Save Note</span>
            </button>
          </div>
        </div>
      )}

      {/* Items List / Grid */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-[#FFEBD7]/[0.08] bg-[#24201E]/70 py-14 px-6 text-center">
          <p className="text-sm text-[#A39B93]">
            {search ? `No ${activeTheme.label.toLowerCase()} match "${search}".` : `No ${activeTheme.label.toLowerCase()} saved yet.`}
          </p>
        </div>
      ) : category === 'files' ? (
        <div className="rounded-2xl border border-[#FFEBD7]/[0.08] bg-[#24201E] divide-y divide-[#FFEBD7]/[0.06]">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: CATEGORY_THEMES.files.iconBg,
                    color: CATEGORY_THEMES.files.highlight,
                  }}
                >
                  <FileText className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#F3EFEA] truncate">{item.name}</p>
                  <p className="text-xs text-[#A39B93] tabular-nums">
                    {formatFileSize(item.size)} · {formatDate(item.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePin('files', item)}
                  aria-label={item.pinned ? 'Unpin file' : 'Pin file'}
                  className={`min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl transition-colors ${
                    item.pinned
                      ? 'text-[#86A389] bg-[#5A6E5C]/25'
                      : 'text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.06]'
                  }`}
                >
                  <Pin className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(item)}
                  aria-label={`Download ${item.name}`}
                  className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.06]"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete('files', item.id)}
                  aria-label={`Delete ${item.name}`}
                  className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#DF9878] hover:bg-[#9E5A3C]/20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : category === 'photos' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setPreviewItem({cat: 'photos', item})}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-[#24201E] border border-[#C97A57]/25 cursor-pointer"
            >
              <img
                src={item.data}
                alt={item.name || 'Photo'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <button
                type="button"
                aria-label={item.pinned ? 'Unpin photo' : 'Pin photo'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin('photos', item);
                }}
                className={`absolute top-2 right-2 w-8 h-8 rounded-xl backdrop-blur-sm flex items-center justify-center transition-colors ${
                  item.pinned ? 'bg-[#9E5A3C] text-[#F3EFEA]' : 'bg-black/55 text-[#F3EFEA]/80 hover:bg-black/75'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-end justify-between gap-2">
                <p className="text-xs text-[#F3EFEA] truncate">{item.name}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(item);
                    }}
                    className="p-1.5 rounded-lg bg-black/55 text-[#F3EFEA] hover:bg-[#9E5A3C]"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete('photos', item.id);
                    }}
                    className="p-1.5 rounded-lg bg-black/55 text-[#DF9878] hover:bg-[#9E5A3C]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : category === 'videos' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl overflow-hidden bg-[#24201E] border border-[#B89748]/25"
            >
              <div
                onClick={() => setPreviewItem({cat: 'videos', item})}
                className="relative aspect-video bg-black cursor-pointer flex items-center justify-center"
              >
                <video src={item.data} className="w-full h-full object-cover opacity-80" />
                <span className="absolute w-12 h-12 rounded-full bg-[#735D28]/90 border border-[#B89748]/60 flex items-center justify-center text-[#F3EFEA]">
                  <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                </span>
              </div>
              <div className="p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#F3EFEA] truncate">{item.name}</p>
                  <p className="text-xs text-[#A39B93] tabular-nums">{formatFileSize(item.size)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={item.pinned ? 'Unpin video' : 'Pin video'}
                    onClick={() => handleTogglePin('videos', item)}
                    className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl ${
                      item.pinned ? 'text-[#B89748] bg-[#735D28]/30' : 'text-[#A39B93] hover:text-[#F3EFEA]'
                    }`}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Download"
                    onClick={() => handleDownload(item)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA]"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => handleDelete('videos', item.id)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#DF9878]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((note) => {
            const swatch = NOTE_PALETTE.find((n) => n.id === note.color) || NOTE_PALETTE[0];
            return (
              <div
                key={note.id}
                className="rounded-2xl border p-4 flex flex-col justify-between min-h-[145px]"
                style={{backgroundColor: swatch.surface, borderColor: swatch.border}}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-display text-base font-semibold text-[#F3EFEA] break-words">
                      {note.title || 'Untitled Note'}
                    </h3>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                        onClick={() => handleTogglePin('notes', note)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          note.pinned ? 'text-[#D98A4E]' : 'text-[#A39B93] hover:text-[#F3EFEA]'
                        }`}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => handleDelete('notes', note.id)}
                        className="p-1.5 rounded-lg text-[#A39B93] hover:text-[#DF9878]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-[#F3EFEA]/85 whitespace-pre-wrap break-words leading-relaxed">
                    {note.content}
                  </p>
                </div>
                <p className="text-[11px] text-[#A39B93] mt-4">
                  {formatDate(note.createdAt)}
                  {note.pinned ? ' · Pinned' : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Preview */}
      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            aria-label="Close preview"
            className="absolute top-4 right-4 mt-safe min-h-[44px] min-w-[44px] rounded-xl bg-[#24201E] border border-[#FFEBD7]/12 text-[#F3EFEA] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-[85vh] w-full flex flex-col items-center">
            {previewItem.cat === 'photos' ? (
              <img
                src={previewItem.item.data}
                alt={previewItem.item.name}
                className="max-h-[75vh] max-w-full rounded-2xl border border-[#FFEBD7]/12"
              />
            ) : (
              <video
                src={previewItem.item.data}
                controls
                autoPlay
                className="max-h-[75vh] max-w-full rounded-2xl border border-[#FFEBD7]/12 bg-black"
              />
            )}
            <p className="text-sm text-[#F3EFEA] mt-3">{previewItem.item.name}</p>
          </div>
        </div>
      )}
    </div>
  );
};
