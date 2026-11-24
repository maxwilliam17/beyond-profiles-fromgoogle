import React, {useRef, useState} from 'react';
import {ref, push, set, remove} from 'firebase/database';
import {
  Download,
  FileText,
  Folder,
  Image as ImageIcon,
  Play,
  Plus,
  StickyNote,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {db} from '../lib/firebase';
import {formatDate, formatFileSize} from '../lib/helpers';
import type {UserData, VaultCategory, VaultItem} from '../lib/types';

const NOTE_COLORS = ['#fbbf24', '#f472b6', '#60a5fa', '#4ade80', '#c084fc'];

interface VaultSectionProps {
  profileId: string;
  userData: UserData;
  initialCategory?: VaultCategory;
  onNotify?: (title: string, body: string) => void;
}

export const VaultSection: React.FC<VaultSectionProps> = ({
  profileId,
  userData,
  initialCategory = 'files',
  onNotify,
}) => {
  const [category, setCategory] = useState<VaultCategory>(initialCategory);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState('#fbbf24');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const [viewItem, setViewItem] = useState<{item: VaultItem; type: VaultCategory} | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id: string; type: VaultCategory} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = userData[category] || [];

  const handleSelectFile = (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(String(e.target?.result || ''));
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl('');
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = (err) => reject(err);
      reader.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
    });

  const handleSave = async () => {
    if (!profileId) return;
    setSaving(true);
    setUploadProgress(0);
    try {
      if (category === 'notes') {
        const newRef = push(ref(db, `userData/${profileId}/notes`));
        await set(newRef, {
          title: noteTitle.trim() || 'Untitled',
          content: noteContent.trim(),
          color: noteColor,
          createdAt: Date.now(),
        });
      } else if (selectedFile) {
        const maxSize = 7 * 1024 * 1024;
        if (selectedFile.size > maxSize) {
          onNotify?.('File too large', 'Maximum file size is 7 MB.');
          setSaving(false);
          return;
        }
        const base64Data = await fileToBase64(selectedFile);
        const newRef = push(ref(db, `userData/${profileId}/${category}`));
        await set(newRef, {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
          data: base64Data,
          createdAt: Date.now(),
        });
      }
      setShowAddModal(false);
      setSelectedFile(null);
      setPreviewUrl('');
      setNoteTitle('');
      setNoteContent('');
    } catch {
      onNotify?.('Save failed', 'Could not upload item. Please try again.');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(ref(db, `userData/${profileId}/${deleteTarget.type}/${deleteTarget.id}`));
      setDeleteTarget(null);
    } catch {
      onNotify?.('Delete failed', 'Could not delete item.');
    }
  };

  const tabs: Array<{id: VaultCategory; label: string; count: number; icon: React.ReactNode}> = [
    {id: 'files', label: 'Files', count: userData.files.length, icon: <Folder className="w-4 h-4" />},
    {id: 'photos', label: 'Photos', count: userData.photos.length, icon: <ImageIcon className="w-4 h-4" />},
    {id: 'videos', label: 'Videos', count: userData.videos.length, icon: <Video className="w-4 h-4" />},
    {id: 'notes', label: 'Notes', count: userData.notes.length, icon: <StickyNote className="w-4 h-4" />},
  ];

  const acceptMap: Record<VaultCategory, string> = {
    files: '*/*',
    photos: 'image/*',
    videos: 'video/*',
    notes: '',
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07]">
          {tabs.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className="tabular-nums opacity-75">({tab.count})</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedFile(null);
            setPreviewUrl('');
            setNoteTitle('');
            setNoteContent('');
            setShowAddModal(true);
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add {category === 'notes' ? 'Note' : category.slice(0, -1)}</span>
        </button>
      </div>

      {/* Drop Zone on Desktop */}
      {category !== 'notes' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              handleSelectFile(file);
              setShowAddModal(true);
            }
          }}
          className={`hidden md:flex items-center justify-center gap-3 rounded-2xl border border-dashed p-5 mb-5 transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/10 bg-white/[0.02]'
          }`}
        >
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-400">Drag and drop {category} here to upload</span>
        </div>
      )}

      {/* Grid or Empty */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#131624]/60 py-14 px-6 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/[0.05] flex items-center justify-center text-slate-400">
            {category === 'files' && <Folder className="w-7 h-7" />}
            {category === 'photos' && <ImageIcon className="w-7 h-7" />}
            {category === 'videos' && <Video className="w-7 h-7" />}
            {category === 'notes' && <StickyNote className="w-7 h-7" />}
          </div>
          <p className="text-sm font-medium text-slate-200">No {category} yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-5">
            Items uploaded here are synced across your devices in real time.
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add your first item</span>
          </button>
        </div>
      ) : category === 'notes' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((note) => (
            <div
              key={note.id}
              onClick={() => setViewItem({item: note, type: 'notes'})}
              className="rounded-2xl p-5 border border-white/10 bg-[#131624] hover:bg-[#181c2e] transition-colors cursor-pointer relative group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-white truncate">{note.title || 'Untitled'}</h3>
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({id: note.id, type: 'notes'});
                  }}
                  className="min-h-[36px] min-w-[36px] -mr-2 -mt-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-300 line-clamp-3 whitespace-pre-wrap">{note.content || ''}</p>
              <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{backgroundColor: note.color || '#fbbf24'}}
                />
                <span>{formatDate(note.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : category === 'photos' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((photo) => (
            <div
              key={photo.id}
              onClick={() => setViewItem({item: photo, type: 'photos'})}
              className="relative aspect-square rounded-2xl overflow-hidden bg-[#131624] border border-white/10 cursor-pointer group"
            >
              {photo.data && (
                <img
                  src={photo.data}
                  alt={photo.name || 'Photo'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <p className="text-xs text-white truncate">{photo.name}</p>
              </div>
              <button
                type="button"
                aria-label="Delete photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({id: photo.id, type: 'photos'});
                }}
                className="absolute top-2 right-2 min-h-[36px] min-w-[36px] rounded-xl bg-black/60 text-white hover:bg-rose-600 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : category === 'videos' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((video) => (
            <div
              key={video.id}
              onClick={() => setViewItem({item: video, type: 'videos'})}
              className="relative aspect-video rounded-2xl overflow-hidden bg-[#131624] border border-white/10 cursor-pointer group"
            >
              {video.data && <video src={video.data} className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                <p className="text-xs text-white truncate">{video.name}</p>
              </div>
              <button
                type="button"
                aria-label="Delete video"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({id: video.id, type: 'videos'});
                }}
                className="absolute top-2 right-2 min-h-[36px] min-w-[36px] rounded-xl bg-black/60 text-white hover:bg-rose-600 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {items.map((file) => (
            <div
              key={file.id}
              onClick={() => handleDownload(file)}
              className="rounded-2xl p-4 bg-[#131624] border border-white/10 hover:bg-[#181c2e] transition-colors cursor-pointer flex items-center gap-3.5"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                  {formatFileSize(file.size)} · {formatDate(file.createdAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Download file"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(file);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Delete file"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({id: file.id, type: 'files'});
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/10"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#131624] border border-white/10 p-6 pb-safe">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-semibold text-white">
                Add {category === 'notes' ? 'Note' : category.slice(0, -1)}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {category === 'notes' ? (
              <div className="space-y-4">
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-4 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <textarea
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your note..."
                  className="w-full rounded-xl bg-white/[0.06] border border-white/10 p-4 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <div className="flex items-center gap-2.5">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNoteColor(c)}
                      aria-label={`Select color ${c}`}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        noteColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#131624] scale-110' : ''
                      }`}
                      style={{backgroundColor: c}}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed border-white/15 hover:border-indigo-400/60 bg-white/[0.02] p-7 text-center transition-colors"
                >
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-200">Tap to choose from device</p>
                  <p className="text-xs text-slate-400 mt-1">Maximum file size 7 MB</p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptMap[category]}
                  className="hidden"
                  onChange={(e) => {
                    handleSelectFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                {selectedFile && (
                  <div className="mt-4 p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{selectedFile.name}</p>
                        <p className="text-xs text-slate-400 tabular-nums">{formatFileSize(selectedFile.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewUrl('');
                        }}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {previewUrl && category === 'photos' && (
                      <img src={previewUrl} alt="Preview" className="mt-3 max-h-44 rounded-lg mx-auto" />
                    )}
                    {previewUrl && category === 'videos' && (
                      <video src={previewUrl} controls className="mt-3 max-h-44 rounded-lg mx-auto" />
                    )}
                  </div>
                )}

                {saving && uploadProgress > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1 tabular-nums">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all"
                        style={{width: `${uploadProgress}%`}}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                disabled={saving || (category !== 'notes' && !selectedFile)}
                onClick={handleSave}
                className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[44px] px-5 rounded-xl border border-white/15 text-slate-300 hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Content Modal */}
      {viewItem && (
        <div
          onClick={() => setViewItem(null)}
          className="fixed inset-0 z-[85] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setViewItem(null)}
            className="absolute top-4 right-4 mt-safe min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full">
            {viewItem.type === 'photos' && viewItem.item.data && (
              <img
                src={viewItem.item.data}
                alt={viewItem.item.name || 'Photo'}
                className="max-h-[82vh] max-w-full mx-auto rounded-2xl"
              />
            )}
            {viewItem.type === 'videos' && viewItem.item.data && (
              <video
                src={viewItem.item.data}
                controls
                autoPlay
                className="max-h-[82vh] max-w-full mx-auto rounded-2xl"
              />
            )}
            {viewItem.type === 'notes' && (
              <div className="rounded-3xl bg-[#131624] border border-white/10 p-6 sm:p-8 max-w-xl mx-auto">
                <h2 className="font-display text-2xl font-semibold text-white mb-3">
                  {viewItem.item.title || 'Untitled'}
                </h2>
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {viewItem.item.content || ''}
                </p>
                <p className="text-xs text-slate-400 mt-6">{formatDate(viewItem.item.createdAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#131624] border border-white/10 p-6 text-center">
            <h3 className="font-display text-lg font-semibold text-white">Delete item?</h3>
            <p className="text-sm text-slate-400 mt-1 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-white/15 text-slate-300 hover:text-white text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
