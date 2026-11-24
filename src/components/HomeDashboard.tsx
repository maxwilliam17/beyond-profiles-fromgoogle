import React from 'react';
import {
  FileText,
  Folder,
  Image as ImageIcon,
  MessageSquare,
  Phone,
  Play,
  StickyNote,
  Video,
} from 'lucide-react';
import {formatDate, formatFileSize} from '../lib/helpers';
import type {Profile, UserData, VaultCategory} from '../lib/types';

interface HomeDashboardProps {
  currentUser: Profile;
  userData: UserData;
  unreadMessages: number;
  conversationCount: number;
  onOpenVault: (category: VaultCategory) => void;
  onOpenChats: () => void;
  onOpenCalls: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentUser,
  userData,
  unreadMessages,
  conversationCount,
  onOpenVault,
  onOpenChats,
  onOpenCalls,
}) => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const totalItems =
    userData.files.length + userData.photos.length + userData.videos.length + userData.notes.length;

  const recentItems = [
    ...userData.files.map((item) => ({...item, category: 'files' as const})),
    ...userData.photos.map((item) => ({...item, category: 'photos' as const})),
    ...userData.videos.map((item) => ({...item, category: 'videos' as const})),
    ...userData.notes.map((item) => ({...item, category: 'notes' as const})),
  ]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 6);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto space-y-6">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight [text-wrap:balance]">
            {greeting}, {currentUser.name}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {totalItems} saved items · Notifications on for all messages &amp; calls
          </p>
        </div>
      </div>

      {/* Primary Action Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Messages */}
        <button
          type="button"
          onClick={onOpenChats}
          className="text-left rounded-2xl p-4 sm:p-5 bg-[#131624] hover:bg-[#181c2e] border border-white/[0.08] transition-colors flex flex-col justify-between min-h-[120px] relative"
        >
          <div className="flex items-center justify-between">
            <span className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </span>
            {unreadMessages > 0 && (
              <span className="min-w-[24px] h-6 px-2 rounded-full bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center tabular-nums">
                {unreadMessages}
              </span>
            )}
          </div>
          <div className="mt-4">
            <h2 className="font-display text-base font-semibold text-white">Messages</h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">
              {unreadMessages > 0
                ? `${unreadMessages} unread`
                : conversationCount === 0
                  ? 'No chats yet'
                  : `${conversationCount} chat${conversationCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </button>

        {/* Calls */}
        <button
          type="button"
          onClick={onOpenCalls}
          className="text-left rounded-2xl p-4 sm:p-5 bg-[#131624] hover:bg-[#181c2e] border border-white/[0.08] transition-colors flex flex-col justify-between min-h-[120px]"
        >
          <span className="w-11 h-11 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </span>
          <div className="mt-4">
            <h2 className="font-display text-base font-semibold text-white">Voice &amp; Video</h2>
            <p className="text-xs text-slate-400 mt-0.5">Call profiles live</p>
          </div>
        </button>

        {/* Files */}
        <button
          type="button"
          onClick={() => onOpenVault('files')}
          className="text-left rounded-2xl p-4 sm:p-5 bg-[#131624] hover:bg-[#181c2e] border border-white/[0.08] transition-colors flex flex-col justify-between min-h-[120px]"
        >
          <span className="w-11 h-11 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
            <Folder className="w-5 h-5" />
          </span>
          <div className="mt-4">
            <h2 className="font-display text-base font-semibold text-white">Files</h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">{userData.files.length} files</p>
          </div>
        </button>

        {/* Photos */}
        <button
          type="button"
          onClick={() => onOpenVault('photos')}
          className="text-left rounded-2xl p-4 sm:p-5 bg-[#131624] hover:bg-[#181c2e] border border-white/[0.08] transition-colors flex flex-col justify-between min-h-[120px]"
        >
          <span className="w-11 h-11 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center">
            <ImageIcon className="w-5 h-5" />
          </span>
          <div className="mt-4">
            <h2 className="font-display text-base font-semibold text-white">Photos</h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">{userData.photos.length} photos</p>
          </div>
        </button>

        {/* Videos */}
        <button
          type="button"
          onClick={() => onOpenVault('videos')}
          className="text-left rounded-2xl p-4 sm:p-5 bg-[#131624] hover:bg-[#181c2e] border border-white/[0.08] transition-colors flex flex-col justify-between min-h-[120px]"
        >
          <span className="w-11 h-11 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Video className="w-5 h-5" />
          </span>
          <div className="mt-4">
            <h2 className="font-display text-base font-semibold text-white">Videos</h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">{userData.videos.length} videos</p>
          </div>
        </button>

        {/* Notes */}
        <button
          type="button"
          onClick={() => onOpenVault('notes')}
          className="text-left rounded-2xl p-4 sm:p-5 bg-[#131624] hover:bg-[#181c2e] border border-white/[0.08] transition-colors flex flex-col justify-between min-h-[120px]"
        >
          <span className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <StickyNote className="w-5 h-5" />
          </span>
          <div className="mt-4">
            <h2 className="font-display text-base font-semibold text-white">Notes</h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">{userData.notes.length} notes</p>
          </div>
        </button>
      </div>

      {/* Recent Activity */}
      <section>
        <h2 className="font-display text-lg font-semibold text-white mb-3">Recent Activity</h2>
        {recentItems.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#131624]/60 py-10 px-6 text-center">
            <p className="text-sm text-slate-400">No recent uploads or notes yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {recentItems.map((item) => (
              <button
                key={`${item.category}:${item.id}`}
                type="button"
                onClick={() => onOpenVault(item.category)}
                className="text-left rounded-2xl overflow-hidden bg-[#131624] border border-white/[0.08] hover:border-white/20 transition-colors"
              >
                {item.category === 'photos' && item.data ? (
                  <div className="aspect-square">
                    <img
                      src={item.data}
                      alt={item.name || 'Photo'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : item.category === 'videos' && item.data ? (
                  <div className="aspect-square relative bg-black">
                    <video src={item.data} className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="w-6 h-6 text-white" fill="currentColor" />
                    </span>
                  </div>
                ) : item.category === 'notes' ? (
                  <div className="p-3.5 aspect-square flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white truncate">{item.title || 'Untitled'}</p>
                      <p className="text-[11px] text-slate-400 line-clamp-3 mt-1">{item.content || ''}</p>
                    </div>
                    <span className="text-[10px] text-slate-500">{formatDate(item.createdAt)}</span>
                  </div>
                ) : (
                  <div className="p-3.5 aspect-square flex flex-col justify-between">
                    <FileText className="w-6 h-6 text-sky-400" />
                    <div>
                      <p className="text-xs font-medium text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                        {formatFileSize(item.size)}
                      </p>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
