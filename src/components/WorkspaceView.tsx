import React, {useEffect, useMemo, useRef, useState} from 'react';
import {push, ref, remove, set, update} from 'firebase/database';
import {
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Pencil,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  StickyNote,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import {db} from '../lib/firebase';
import {compressImage} from '../lib/crypto';
import {
  formatChatTime,
  formatClockTime,
  formatDayLabel,
  formatFileSize,
  getPartnerIdFromChatId,
  groupMemberLabel,
  isMyChat,
  isMyGroup,
  makeChatId,
  mapMessages,
} from '../lib/helpers';
import {CATEGORY_THEMES, DRAG_RESOURCE_MIME} from '../lib/theme';
import type {
  ChatAttachment,
  ChatMessage,
  ConversationRef,
  DirectChat,
  GroupChat,
  Profile,
  UserData,
  VaultCategory,
  VaultItem,
} from '../lib/types';
import {GroupAvatar, ProfileAvatar} from './Avatar';
import {
  DesktopResourcesSidebar,
  MobileResourceDrawer,
  MobileResourcePills,
  ResourcePreviewModal,
} from './ResourcesPanel';

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '🙃', '😴', '😢', '😭', '😡', '🤯',
  '🥳', '😇', '🤗', '🤩', '😜', '🙄', '😬', '🫶', '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '✨', '🔥', '🎉', '🎂', '☕', '🍕', '⚽', '🎵',
  '🌟', '💯', '🚀', '🌈', '☀️', '🌙', '🍀', '📌', '✅', '❌', '⏰', '👀', '🤍', '🥰',
];

interface WorkspaceViewProps {
  currentUser: Profile;
  profiles: Profile[];
  userData: UserData;
  chatsData: Record<string, DirectChat>;
  groupsData: Record<string, GroupChat>;
  activeConvo: ConversationRef | null;
  onSelectConvo: (convo: ConversationRef | null) => void;
  onStartCall: (partnerId: string, video: boolean) => void;
  onOpenVault: (category: VaultCategory) => void;
  onOpenSettings: () => void;
  onNotify?: (title: string, body: string) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  currentUser,
  profiles,
  userData,
  chatsData,
  groupsData,
  activeConvo,
  onSelectConvo,
  onStartCall,
  onOpenVault,
  onOpenSettings,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [dragOverChat, setDragOverChat] = useState(false);

  // Mobile/Tablet Resources Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState<VaultCategory>('notes');

  // Attachment Preview Modal
  const [previewAttachment, setPreviewAttachment] = useState<{
    category: VaultCategory;
    item: VaultItem;
  } | null>(null);

  // Modals / Sheets
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPhoto, setNewGroupPhoto] = useState<string | null>(null);
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupPhoto, setEditGroupPhoto] = useState<string | null>(null);
  const [showDmInfo, setShowDmInfo] = useState(false);

  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  const editGroupPhotoInputRef = useRef<HTMLInputElement>(null);

  const otherProfiles = useMemo(
    () => profiles.filter((p) => p.id !== currentUser.id),
    [profiles, currentUser.id],
  );

  // Build sorted conversation entries
  const entries = useMemo(() => {
    const out: Array<{
      kind: 'dm' | 'group';
      id: string;
      title: string;
      partner?: Profile | null;
      group?: GroupChat;
      preview: string;
      lastAt: number;
      unread: number;
      receipt?: 'sent' | 'some' | 'seen' | null;
    }> = [];

    Object.entries(chatsData).forEach(([id, chat]) => {
      if (!isMyChat(id, chat, currentUser.id)) return;
      const partnerId = getPartnerIdFromChatId(id, currentUser.id);
      const partner = profiles.find((p) => p.id === partnerId) || null;
      const msgs = mapMessages(chat?.messages);
      const last = msgs[msgs.length - 1];
      const lastAt = chat?.meta?.lastAt || last?.createdAt || 0;
      const lastSenderId = chat?.meta?.lastSenderId || last?.senderId;
      const lastMsg = chat?.meta?.lastMessage || last?.text || '';
      const myRead = chat?.reads?.[currentUser.id] || 0;
      const unread = msgs.filter((m) => m.senderId !== currentUser.id && (m.createdAt || 0) > myRead).length;

      let partnerRead = 0;
      Object.entries(chat?.reads || {}).forEach(([uid, ts]) => {
        if (uid !== currentUser.id && ts > partnerRead) partnerRead = ts;
      });
      let receipt: 'sent' | 'seen' | null = null;
      if (lastMsg && lastSenderId === currentUser.id) {
        receipt = lastAt <= partnerRead ? 'seen' : 'sent';
      }

      out.push({
        kind: 'dm',
        id,
        title: partner ? partner.name : 'Deleted profile',
        partner,
        preview: lastMsg
          ? lastSenderId === currentUser.id
            ? `You: ${lastMsg}`
            : lastMsg
          : 'No messages yet',
        lastAt,
        unread,
        receipt,
      });
    });

    Object.entries(groupsData).forEach(([id, g]) => {
      if (!isMyGroup(g, currentUser.id)) return;
      const msgs = mapMessages(g?.messages);
      const last = msgs[msgs.length - 1];
      const lastAt = g?.meta?.lastAt || last?.createdAt || g?.createdAt || 0;
      const lastSenderId = g?.meta?.lastSenderId || last?.senderId;
      const lastMsg = g?.meta?.lastMessage || last?.text || '';
      const myRead = g?.reads?.[currentUser.id] || 0;
      const unread = msgs.filter((m) => m.senderId !== currentUser.id && (m.createdAt || 0) > myRead).length;
      const memberCount = Object.keys(g.members || {}).length;
      const sender = profiles.find((p) => p.id === lastSenderId);

      const preview = lastMsg
        ? lastSenderId === currentUser.id
          ? `You: ${lastMsg}`
          : `${sender?.name || last?.senderName || 'Someone'}: ${lastMsg}`
        : `${memberCount} member${memberCount === 1 ? '' : 's'}`;

      let receipt: 'sent' | 'some' | 'seen' | null = null;
      if (lastMsg && lastSenderId === currentUser.id && last) {
        const others = Object.keys(g.members || {}).filter((uid) => uid !== currentUser.id);
        const readCount = others.filter((uid) => (g.reads?.[uid] || 0) >= (last.createdAt || 0)).length;
        receipt = readCount === 0 ? 'sent' : readCount === others.length ? 'seen' : 'some';
      }

      out.push({
        kind: 'group',
        id,
        title: g.name || 'Group',
        group: {...g, id},
        preview,
        lastAt,
        unread,
        receipt,
      });
    });

    return out.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  }, [chatsData, groupsData, profiles, currentUser.id]);

  // Auto-select most recent chat on desktop (>= 768px) if none is selected yet
  useEffect(() => {
    if (activeConvo || entries.length === 0) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      onSelectConvo({kind: entries[0].kind, id: entries[0].id});
    }
  }, [activeConvo, entries, onSelectConvo]);

  const query = search.trim().toLowerCase();
  const filteredEntries = useMemo(
    () => (query ? entries.filter((e) => e.title.toLowerCase().includes(query)) : entries),
    [entries, query],
  );

  const startableProfiles = useMemo(() => {
    const chatted = new Set(
      entries.filter((e) => e.kind === 'dm').map((e) => getPartnerIdFromChatId(e.id, currentUser.id)),
    );
    return otherProfiles
      .filter((p) => !chatted.has(p.id))
      .filter((p) => !query || p.name.toLowerCase().includes(query));
  }, [entries, otherProfiles, currentUser.id, query]);

  const activeDm = activeConvo?.kind === 'dm' ? chatsData[activeConvo.id] : undefined;
  const activeGroup = activeConvo?.kind === 'group' ? groupsData[activeConvo.id] : undefined;
  const activePartnerId =
    activeConvo?.kind === 'dm' ? getPartnerIdFromChatId(activeConvo.id, currentUser.id) : null;
  const activePartner = activePartnerId
    ? profiles.find((p) => p.id === activePartnerId) || null
    : null;

  const activeChatTitle =
    activeConvo?.kind === 'group'
      ? activeGroup?.name || 'Group'
      : activePartner?.name || 'Deleted profile';

  const activeMessages: ChatMessage[] = useMemo(() => {
    if (!activeConvo) return [];
    if (activeConvo.kind === 'dm') return mapMessages(activeDm?.messages);
    return mapMessages(activeGroup?.messages);
  }, [activeConvo, activeDm, activeGroup]);

  // Mark conversation read when open
  useEffect(() => {
    if (!activeConvo) return;
    const node = activeConvo.kind === 'dm' ? activeDm : activeGroup;
    if (!node) return;
    const lastAt = activeMessages.length ? activeMessages[activeMessages.length - 1].createdAt : 0;
    const currentRead = node.reads?.[currentUser.id] || 0;
    if (lastAt > currentRead) {
      const basePath = activeConvo.kind === 'dm' ? `chats/${activeConvo.id}` : `groups/${activeConvo.id}`;
      set(ref(db, `${basePath}/reads/${currentUser.id}`), Math.max(Date.now(), lastAt)).catch(() => {});
    }
  }, [activeConvo, activeDm, activeGroup, activeMessages, currentUser.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!stickToBottomRef.current || !messagesAreaRef.current) return;
    const el = messagesAreaRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeMessages.length, activeConvo?.id]);

  // Core send message helper (supports optional attachment!)
  const sendMessagePayload = async (text: string, attachment?: ChatAttachment) => {
    if (!activeConvo) return;
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    const fallbackText =
      trimmed ||
      (attachment
        ? `Shared ${attachment.category === 'notes' ? 'note' : attachment.category.slice(0, -1)}: ${attachment.title}`
        : '');

    stickToBottomRef.current = true;
    const now = Date.now();
    const basePath = activeConvo.kind === 'dm' ? `chats/${activeConvo.id}` : `groups/${activeConvo.id}`;

    const messageData: Record<string, unknown> = {
      senderId: currentUser.id,
      senderName: currentUser.name,
      text: fallbackText,
      createdAt: now,
    };
    if (attachment) {
      messageData.attachment = attachment;
    }

    const msgRef = push(ref(db, `${basePath}/messages`));
    await set(msgRef, messageData);
    await update(ref(db, `${basePath}/meta`), {
      lastMessage: fallbackText.length > 80 ? `${fallbackText.slice(0, 80)}…` : fallbackText,
      lastAt: now,
      lastSenderId: currentUser.id,
    });
    await set(ref(db, `${basePath}/reads/${currentUser.id}`), now);
    if (activeConvo.kind === 'dm' && activePartnerId) {
      await update(ref(db, `${basePath}/meta/participants`), {
        [currentUser.id]: true,
        [activePartnerId]: true,
      });
    }
  };

  const handleSend = async () => {
    if (!activeConvo) return;
    const text = draft.trim();
    if (!text) return;

    setDraft('');
    setShowEmoji(false);
    setShowAttachMenu(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      await sendMessagePayload(text);
    } catch {
      setDraft(text);
    }
  };

  // Share an existing Vault Resource directly into the active chat
  const handleShareVaultItem = async (category: VaultCategory, item: VaultItem) => {
    if (!activeConvo) {
      onNotify?.('Select a chat', 'Choose a conversation first to share resources.');
      return;
    }
    const title = item.title || item.name || 'Untitled';
    const attachment: ChatAttachment = {
      category,
      itemId: item.id,
      title,
      ...(category === 'notes' && item.content ? {preview: item.content.slice(0, 260)} : {}),
      ...(item.data ? {data: item.data} : {}),
      ...(item.type ? {mimeType: item.type} : {}),
      ...(typeof item.size === 'number' ? {size: item.size} : {}),
      ...(item.color ? {color: item.color} : {}),
    };

    try {
      await sendMessagePayload('', attachment);
      onNotify?.('Shared in chat', `Sent "${title}" to ${activeChatTitle}`);
    } catch {
      onNotify?.('Share failed', 'Item may be too large or offline.');
    }
  };

  // Upload & share directly from device via composer "+" button
  const handleQuickUploadToChat = async (file: File | undefined) => {
    if (!file || !activeConvo) return;
    const maxSize = 6 * 1024 * 1024;
    if (file.size > maxSize) {
      onNotify?.('File too large', 'Maximum attachment size is 6 MB.');
      return;
    }

    const cat: VaultCategory = file.type.startsWith('image/')
      ? 'photos'
      : file.type.startsWith('video/')
        ? 'videos'
        : 'files';

    try {
      const dataUrl =
        cat === 'photos'
          ? await compressImage(file, 1280, 0.85)
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Read failed'));
              reader.readAsDataURL(file);
            });

      // Also save into user's Vault so it's immediately available in Resources!
      const vaultRef = push(ref(db, `userData/${currentUser.id}/${cat}`));
      const now = Date.now();
      await set(vaultRef, {
        name: file.name,
        size: file.size,
        type: file.type,
        data: dataUrl,
        pinned: true,
        createdAt: now,
      });

      await sendMessagePayload('', {
        category: cat,
        itemId: vaultRef.key || undefined,
        title: file.name,
        data: dataUrl,
        mimeType: file.type,
        size: file.size,
      });
      setShowAttachMenu(false);
    } catch {
      onNotify?.('Upload failed', 'Could not share attachment.');
    }
  };

  // Handle dropping a dragged item from the Desktop Right Resources Sidebar onto the chat
  const handleDropOnChat = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverChat(false);
    const raw = e.dataTransfer.getData(DRAG_RESOURCE_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {category: VaultCategory; itemId: string};
        const item = (userData[parsed.category] || []).find((i) => i.id === parsed.itemId);
        if (item) {
          await handleShareVaultItem(parsed.category, item);
        }
      } catch {
        // ignore invalid payload
      }
      return;
    }

    // Also support dragging OS files straight into the chat!
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      await handleQuickUploadToChat(droppedFile);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeConvo) return;
    const basePath = activeConvo.kind === 'dm' ? `chats/${activeConvo.id}` : `groups/${activeConvo.id}`;
    await remove(ref(db, `${basePath}/messages/${msgId}`)).catch(() => {});
  };

  const getReceiptLabel = (msg: ChatMessage): {state: 'sent' | 'some' | 'all'; label: string} => {
    if (!activeConvo) return {state: 'sent', label: 'Sent'};
    if (activeConvo.kind === 'group' && activeGroup) {
      const others = Object.keys(activeGroup.members || {}).filter((uid) => uid !== currentUser.id);
      if (others.length === 0) return {state: 'sent', label: 'Sent'};
      const readCount = others.filter((uid) => (activeGroup.reads?.[uid] || 0) >= msg.createdAt).length;
      if (readCount === 0) return {state: 'sent', label: 'Sent'};
      if (readCount === others.length) {
        return {state: 'all', label: others.length > 1 ? 'Read by all' : 'Read'};
      }
      return {state: 'some', label: `Read by ${readCount}/${others.length}`};
    }
    let partnerRead = 0;
    Object.entries(activeDm?.reads || {}).forEach(([uid, ts]) => {
      if (uid !== currentUser.id && ts > partnerRead) partnerRead = ts;
    });
    if (msg.createdAt <= partnerRead) {
      return {state: 'all', label: 'Read'};
    }
    return {state: 'sent', label: 'Sent'};
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || newGroupMembers.length === 0 || creatingGroup) return;
    setCreatingGroup(true);
    const members: Record<string, boolean> = {[currentUser.id]: true};
    newGroupMembers.forEach((id) => {
      members[id] = true;
    });
    const newRef = push(ref(db, 'groups'));
    const now = Date.now();
    try {
      await set(newRef, {
        id: newRef.key,
        name,
        photo: newGroupPhoto || null,
        createdBy: currentUser.id,
        createdAt: now,
        members,
        meta: {lastMessage: '', lastAt: now, lastSenderId: ''},
        reads: {[currentUser.id]: now},
      });
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupPhoto(null);
      setNewGroupMembers([]);
      if (newRef.key) onSelectConvo({kind: 'group', id: newRef.key});
    } finally {
      setCreatingGroup(false);
    }
  };

  const renderInlineAttachment = (att: ChatAttachment, mine: boolean) => {
    const theme = CATEGORY_THEMES[att.category];
    const openPreview = () => {
      setPreviewAttachment({
        category: att.category,
        item: {
          id: att.itemId || `att_${Date.now()}`,
          name: att.title,
          title: att.title,
          content: att.preview,
          data: att.data,
          size: att.size,
          type: att.mimeType,
          color: att.color,
        },
      });
    };

    if (att.category === 'photos' && att.data) {
      return (
        <div
          onClick={openPreview}
          className="mb-1.5 rounded-xl overflow-hidden border border-[#FFEBD7]/15 bg-[#181615]/50 cursor-pointer group/att"
        >
          <img
            src={att.data}
            alt={att.title}
            className="max-h-56 w-full object-cover group-hover/att:scale-[1.02] transition-transform duration-200"
          />
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] bg-black/35 text-[#F3EFEA]">
            <span className="truncate">{att.title}</span>
            <ImageIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
          </div>
        </div>
      );
    }

    if (att.category === 'videos' && att.data) {
      return (
        <div
          onClick={openPreview}
          className="mb-1.5 rounded-xl overflow-hidden border border-[#B89748]/35 bg-black/70 cursor-pointer relative"
        >
          <div className="relative max-h-48 overflow-hidden flex items-center justify-center">
            <video src={att.data} className="w-full max-h-48 object-cover opacity-80" />
            <span className="absolute w-11 h-11 rounded-full bg-[#735D28]/90 border border-[#B89748]/60 flex items-center justify-center text-[#F3EFEA]">
              <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
            </span>
          </div>
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] bg-black/50 text-[#F3EFEA]">
            <span className="truncate">{att.title}</span>
            {att.size ? <span className="tabular-nums opacity-75">{formatFileSize(att.size)}</span> : null}
          </div>
        </div>
      );
    }

    if (att.category === 'notes') {
      return (
        <div
          onClick={openPreview}
          className="mb-1.5 rounded-xl p-2.5 cursor-pointer transition-colors"
          style={{
            backgroundColor: mine ? 'rgba(24, 22, 21, 0.28)' : 'rgba(140, 83, 39, 0.3)',
            border: `1px solid ${theme.cardBorder}`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <StickyNote className="w-3.5 h-3.5 shrink-0" style={{color: theme.highlight}} />
            <p className="text-xs font-semibold text-[#F3EFEA] truncate">{att.title}</p>
          </div>
          {att.preview && (
            <p className="text-xs text-[#F3EFEA]/85 line-clamp-3 whitespace-pre-wrap leading-snug">
              {att.preview}
            </p>
          )}
        </div>
      );
    }

    // File chip preview
    return (
      <div
        onClick={openPreview}
        className="mb-1.5 rounded-xl px-3 py-2 flex items-center gap-2.5 cursor-pointer transition-colors"
        style={{
          backgroundColor: mine ? 'rgba(24, 22, 21, 0.28)' : 'rgba(24, 22, 21, 0.35)',
          border: `1px solid ${theme.cardBorder}`,
        }}
      >
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{backgroundColor: theme.iconBg, color: theme.highlight}}
        >
          <FileText className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#F3EFEA] truncate">{att.title}</p>
          <p className="text-[10px] text-[#F3EFEA]/75 tabular-nums">
            {att.size ? formatFileSize(att.size) : 'File attachment'}
          </p>
        </div>
        {att.data && <Download className="w-4 h-4 text-[#F3EFEA]/80 shrink-0" />}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#181615]">
      {/* ============================================================
          COLUMN 1: LEFT CHAT SIDEBAR (~280px on Desktop, Full Screen on Mobile when no active chat)
          ============================================================ */}
      <aside
        className={`w-full md:w-[280px] xl:w-[300px] shrink-0 flex-col border-r border-[#FFEBD7]/[0.08] bg-[#1C1918] min-h-0 ${
          activeConvo ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Mobile Compact Resource Pill Bar also visible on Chat List for quick access */}
        <div className="md:hidden">
          <MobileResourcePills
            userData={userData}
            activeCategory={drawerOpen ? drawerCategory : null}
            onSelectCategory={(cat) => {
              setDrawerCategory(cat);
              setDrawerOpen(true);
            }}
          />
        </div>

        {/* Search + New Chat */}
        <div className="p-3 flex items-center gap-2 border-b border-[#FFEBD7]/[0.07] shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#A39B93] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full min-h-[42px] rounded-full bg-[#24201E] border border-[#FFEBD7]/[0.09] pl-10 pr-3.5 text-sm text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none focus:border-[#D98A4E]/55 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowNewSheet(true)}
            aria-label="New message or group"
            title="New message or group"
            className="min-h-[42px] min-w-[42px] rounded-full bg-[#9E5A3C] hover:bg-[#B46846] active:scale-95 text-[#F3EFEA] flex items-center justify-center shrink-0 transition-all duration-200 shadow-md"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto custom-scroll p-2.5 space-y-1.5">
          {filteredEntries.length === 0 && startableProfiles.length === 0 ? (
            <div className="py-12 px-5 text-center">
              <p className="text-sm text-[#A39B93]">
                {query ? `No chats match "${query}".` : 'No conversations yet.'}
              </p>
              <p className="text-xs text-[#A39B93]/75 mt-1">
                Tap + to message a profile or create a group.
              </p>
            </div>
          ) : (
            <>
              {filteredEntries.map((entry) => {
                const isActive = activeConvo?.kind === entry.kind && activeConvo.id === entry.id;
                return (
                  <button
                    key={`${entry.kind}:${entry.id}`}
                    type="button"
                    onClick={() => {
                      stickToBottomRef.current = true;
                      onSelectConvo({kind: entry.kind, id: entry.id});
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-[14px] border flex items-center gap-3 transition-all duration-200 ${
                      isActive
                        ? 'active-chat-glow'
                        : 'border-transparent hover:bg-[#24201E]/85 hover:border-[#FFEBD7]/[0.06]'
                    }`}
                  >
                    {entry.kind === 'group' ? (
                      <GroupAvatar group={entry.group} sizeClass="w-11 h-11" roundedClass="rounded-full" />
                    ) : (
                      <ProfileAvatar
                        profile={entry.partner}
                        sizeClass="w-11 h-11"
                        roundedClass="rounded-full"
                        showOnlineDot={!!entry.partner}
                        dotBorderClass={isActive ? 'border-[#2A2420]' : 'border-[#1C1918]'}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13.5px] font-semibold text-[#F3EFEA] truncate">
                          {entry.title}
                        </p>
                        <span className="text-[11px] text-[#A39B93] tabular-nums shrink-0">
                          {entry.lastAt ? formatChatTime(entry.lastAt) : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-[#A39B93] truncate">{entry.preview}</p>
                        {entry.unread > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#C97A57] text-[#181615] text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                            {entry.unread > 99 ? '99+' : entry.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {startableProfiles.length > 0 && (
                <div className="pt-3 pb-2">
                  <p className="px-3 pb-1.5 text-[11px] font-medium text-[#A39B93] uppercase tracking-wider">
                    Start a chat
                  </p>
                  <div className="space-y-1">
                    {startableProfiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectConvo({kind: 'dm', id: makeChatId(currentUser.id, p.id)})}
                        className="w-full text-left px-3 py-2 rounded-[14px] flex items-center gap-3 hover:bg-[#24201E] transition-colors"
                      >
                        <ProfileAvatar
                          profile={p}
                          sizeClass="w-10 h-10"
                          roundedClass="rounded-full"
                          showOnlineDot
                          dotBorderClass="border-[#1C1918]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#F3EFEA] truncate">{p.name}</p>
                          <p className="text-xs text-[#A39B93]">online · tap to chat</p>
                        </div>
                        <Plus className="w-4 h-4 text-[#A39B93] shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ============================================================
          COLUMN 2: CENTER CHAT PANEL (Flexible width, Full Screen on Mobile when active)
          ============================================================ */}
      <section
        onDragOver={(e) => {
          if (!activeConvo) return;
          e.preventDefault();
          setDragOverChat(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOverChat(false);
        }}
        onDrop={handleDropOnChat}
        className={`relative flex-1 flex-col min-w-0 min-h-0 warm-ambient-bg ${
          activeConvo ? 'flex animate-view-in' : 'hidden md:flex'
        }`}
      >
        {/* Drag-to-Share Overlay */}
        {dragOverChat && activeConvo && (
          <div className="absolute inset-3 z-40 rounded-2xl border-2 border-dashed border-[#D98A4E] bg-[#1E1B1A]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-[#8C5327]/35 border border-[#D98A4E]/50 flex items-center justify-center text-[#D98A4E]">
              <Paperclip className="w-7 h-7" />
            </div>
            <p className="font-display text-base font-semibold text-[#F3EFEA]">
              Drop to share with {activeChatTitle}
            </p>
            <p className="text-xs text-[#A39B93]">Notes, photos, videos, and files appear inline</p>
          </div>
        )}

        {!activeConvo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-[#24201E] border border-[#FFEBD7]/10 flex items-center justify-center mb-4 text-[#D98A4E] shadow-lg">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="font-display text-lg font-semibold text-[#F3EFEA]">Select a conversation</h3>
            <p className="text-sm text-[#A39B93] mt-1 mb-5 max-w-sm">
              Pick a thread on the left to message, place voice or video calls, and share resources from your vault.
            </p>
            <button
              type="button"
              onClick={() => setShowNewSheet(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New message</span>
            </button>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-3 sm:px-5 py-3 border-b border-[#FFEBD7]/[0.08] bg-[#1E1B1A]/90 backdrop-blur-md flex items-center gap-3 shrink-0">
              <button
                type="button"
                aria-label="Back to chats"
                onClick={() => onSelectConvo(null)}
                className="md:hidden min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-xl bg-[#24201E] border border-[#FFEBD7]/[0.08] text-[#F3EFEA] hover:bg-[#2C2724] shrink-0 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {activeConvo.kind === 'group' ? (
                <GroupAvatar
                  group={activeGroup ? {...activeGroup, id: activeConvo.id} : {name: 'Group'}}
                  sizeClass="w-10 h-10"
                  roundedClass="rounded-full"
                />
              ) : (
                <ProfileAvatar
                  profile={activePartner}
                  sizeClass="w-10 h-10"
                  roundedClass="rounded-full"
                  showOnlineDot={!!activePartner}
                  dotBorderClass="border-[#1E1B1A]"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-display text-[15px] font-semibold text-[#F3EFEA] truncate">
                    {activeChatTitle}
                  </p>
                  {activeConvo.kind === 'dm' && activePartner && (
                    <span className="w-2 h-2 rounded-full bg-[#86A389] shrink-0" />
                  )}
                </div>
                <p className="text-xs text-[#A39B93] truncate">
                  {activeConvo.kind === 'group' && activeGroup
                    ? `${Object.keys(activeGroup.members || {}).length} members · ${groupMemberLabel(
                        activeGroup,
                        profiles,
                        currentUser.id,
                      )}`
                    : activePartner
                      ? activePartner.isKid
                        ? 'online · kids profile'
                        : 'online'
                      : 'Profile removed'}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activeConvo.kind === 'dm' && activePartnerId && (
                  <>
                    <button
                      type="button"
                      aria-label="Voice call"
                      onClick={() => onStartCall(activePartnerId, false)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#24201E] transition-colors"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Video call"
                      onClick={() => onStartCall(activePartnerId, true)}
                      className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#24201E] transition-colors"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Mobile/Tablet Header Resources Toggle */}
                <button
                  type="button"
                  aria-label="Open pinned resources"
                  onClick={() => setDrawerOpen(true)}
                  className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#D98A4E] bg-[#8C5327]/20 border border-[#D98A4E]/30 hover:bg-[#8C5327]/35 transition-colors"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>

                {/* Chat Settings / Group Info */}
                <button
                  type="button"
                  aria-label={activeConvo.kind === 'group' ? 'Group settings' : 'Chat settings'}
                  onClick={() => {
                    if (activeConvo.kind === 'group') {
                      setEditingGroup(false);
                      setEditGroupPhoto(null);
                      setShowGroupInfo(true);
                    } else {
                      setShowDmInfo(true);
                    }
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#24201E] transition-colors"
                >
                  {activeConvo.kind === 'group' ? (
                    <Users className="w-5 h-5" />
                  ) : (
                    <Settings className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Mobile/Tablet Compact Horizontal Resource Pill Bar right below header */}
            <MobileResourcePills
              userData={userData}
              activeCategory={drawerOpen ? drawerCategory : null}
              onSelectCategory={(cat) => {
                setDrawerCategory(cat);
                setDrawerOpen(true);
              }}
            />

            {/* Message Feed */}
            <div
              ref={messagesAreaRef}
              onScroll={() => {
                const el = messagesAreaRef.current;
                if (!el) return;
                stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 min-h-0 overflow-y-auto custom-scroll px-4 sm:px-6 py-5 space-y-4"
            >
              {activeMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <p className="text-sm font-medium text-[#F3EFEA]">No messages yet</p>
                  <p className="text-xs text-[#A39B93] mt-1">
                    Say hello or share a note, photo, video, or file from Resources.
                  </p>
                </div>
              ) : (
                activeMessages.map((msg, idx) => {
                  const mine = msg.senderId === currentUser.id;
                  const prev = idx > 0 ? activeMessages[idx - 1] : null;
                  const day = formatDayLabel(msg.createdAt);
                  const prevDay = prev ? formatDayLabel(prev.createdAt) : '';
                  const showDivider = day !== prevDay;
                  const showSender =
                    activeConvo.kind === 'group' &&
                    !mine &&
                    (!prev || prev.senderId !== msg.senderId || showDivider);
                  const sender = profiles.find((p) => p.id === msg.senderId);
                  const receipt = mine ? getReceiptLabel(msg) : null;
                  const hideAutoFallbackText =
                    !!msg.attachment &&
                    msg.text.startsWith('Shared ') &&
                    msg.text.includes(msg.attachment.title);

                  return (
                    <React.Fragment key={msg.id}>
                      {showDivider && (
                        <div className="flex justify-center my-3">
                          <span className="text-[11px] text-[#A39B93] bg-[#24201E] border border-[#FFEBD7]/[0.08] px-3 py-1 rounded-full">
                            {day}
                          </span>
                        </div>
                      )}
                      <div>
                        {showSender && (
                          <p className="text-[11px] text-[#A39B93] ml-10 mb-1">
                            {sender?.name || msg.senderName || 'Unknown'}
                          </p>
                        )}
                        <div className={`flex items-end gap-2 group ${mine ? 'justify-end' : 'justify-start'}`}>
                          {!mine && activeConvo.kind === 'group' && (
                            <div className={!showSender ? 'invisible' : ''}>
                              <ProfileAvatar
                                profile={sender || {name: msg.senderName || 'U', color: 'bg-green-500'}}
                                sizeClass="w-7 h-7"
                                roundedClass="rounded-full"
                                textClass="text-[10px] font-semibold"
                              />
                            </div>
                          )}

                          {mine && (
                            <button
                              type="button"
                              aria-label="Delete message"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="opacity-50 sm:opacity-0 sm:group-hover:opacity-100 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[#A39B93] hover:text-[#DF9878] transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div className={`max-w-[82%] sm:max-w-[66%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-4 py-2.5 text-[14.5px] leading-relaxed break-words shadow-sm ${
                                mine
                                  ? 'bg-[#9E5A3C] text-[#F3EFEA] border border-[#C97A57]/30 rounded-[16px] rounded-br-[6px]'
                                  : 'bg-[#5A6E5C] text-[#F3EFEA] border border-[#86A389]/25 rounded-[16px] rounded-bl-[6px]'
                              }`}
                            >
                              {msg.attachment && renderInlineAttachment(msg.attachment, mine)}
                              {!hideAutoFallbackText && (
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                              )}
                            </div>

                            {/* Metadata line neatly below bubble (matches mockup) */}
                            <div
                              className={`flex items-center gap-1.5 mt-1 px-1 text-[11px] tabular-nums text-[#A39B93] ${
                                mine ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              {!mine ? (
                                <span>{formatClockTime(msg.createdAt)}</span>
                              ) : (
                                <>
                                  <span>{formatClockTime(msg.createdAt)}</span>
                                  {receipt && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 ${
                                        receipt.state === 'all' ? 'text-[#86A389]' : 'text-[#A39B93]'
                                      }`}
                                    >
                                      {receipt.state === 'sent' ? (
                                        <Check className="w-3.5 h-3.5" />
                                      ) : (
                                        <CheckCheck className="w-3.5 h-3.5" />
                                      )}
                                      <span>{receipt.label}</span>
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* Composer Bar (fixed cleanly above mobile keyboard, 44px+ targets) */}
            <div className="relative px-3 sm:px-5 py-3 pb-safe border-t border-[#FFEBD7]/[0.08] bg-[#1C1918]/95 backdrop-blur-md shrink-0">
              {/* Emoji Popover */}
              {showEmoji && (
                <div className="absolute bottom-[74px] right-4 z-30 w-64 max-h-52 overflow-y-auto grid grid-cols-8 gap-1 p-2.5 rounded-2xl bg-[#24201E] border border-[#FFEBD7]/12 shadow-2xl">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setDraft((d) => d + emoji);
                        inputRef.current?.focus();
                      }}
                      className="text-lg p-1 rounded-lg hover:bg-[#FFEBD7]/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Desktop "+" Attachment Popover */}
              {showAttachMenu && (
                <div className="absolute bottom-[74px] right-16 z-30 w-56 rounded-2xl bg-[#24201E] border border-[#FFEBD7]/12 shadow-2xl p-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      quickFileInputRef.current?.click();
                    }}
                    className="w-full min-h-[42px] px-3 rounded-xl hover:bg-[#2E2926] text-left text-xs font-medium text-[#F3EFEA] flex items-center gap-2.5 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-[#C97A57]" />
                    <span>Upload Photo, Video, or File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setDrawerCategory('notes');
                      setDrawerOpen(true);
                    }}
                    className="lg:hidden w-full min-h-[42px] px-3 rounded-xl hover:bg-[#2E2926] text-left text-xs font-medium text-[#F3EFEA] flex items-center gap-2.5 transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-[#D98A4E]" />
                    <span>Pick from Pinned Resources</span>
                  </button>
                </div>
              )}

              <input
                ref={quickFileInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={(e) => {
                  handleQuickUploadToChat(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              <div className="flex items-end gap-2.5">
                <div className="flex-1 min-w-0 flex items-end rounded-[24px] bg-[#24201E] border border-[#FFEBD7]/10 focus-within:border-[#C97A57]/55 transition-colors px-2 py-0.5">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={`Message ${activeChatTitle}...`}
                    className="flex-1 min-w-0 max-h-[120px] min-h-[44px] bg-transparent pl-3 pr-2 py-2.5 text-[15px] text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none resize-none"
                  />

                  <button
                    type="button"
                    aria-label="Attach file or resource"
                    onClick={() => {
                      setShowEmoji(false);
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setShowAttachMenu((v) => !v);
                      } else {
                        quickFileInputRef.current?.click();
                      }
                    }}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.06] shrink-0 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    aria-label="Emoji picker"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowEmoji((v) => !v);
                    }}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.06] shrink-0 transition-colors"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                </div>

                <button
                  type="button"
                  aria-label="Send message"
                  onClick={handleSend}
                  className="min-h-[46px] min-w-[46px] rounded-full bg-[#B46543] hover:bg-[#C97A57] active:scale-95 text-[#F3EFEA] flex items-center justify-center shrink-0 transition-all duration-200 shadow-[0_6px_18px_-4px_rgba(158,90,60,0.65)]"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ============================================================
          COLUMN 3: DESKTOP RIGHT SIDEBAR — "Resources" PANEL (>= 1024px)
          ============================================================ */}
      <DesktopResourcesSidebar
        profileId={currentUser.id}
        userData={userData}
        canShareToChat={!!activeConvo}
        onShareItem={handleShareVaultItem}
        onOpenVault={onOpenVault}
      />

      {/* Mobile / Tablet Slide-Up Resources Drawer */}
      <MobileResourceDrawer
        open={drawerOpen}
        category={drawerCategory}
        profileId={currentUser.id}
        userData={userData}
        canShareToChat={!!activeConvo}
        onChangeCategory={setDrawerCategory}
        onClose={() => setDrawerOpen(false)}
        onShareItem={handleShareVaultItem}
        onOpenVault={onOpenVault}
      />

      {/* Inline Attachment Preview Modal */}
      <ResourcePreviewModal
        preview={previewAttachment}
        canShareToChat={false}
        onClose={() => setPreviewAttachment(null)}
        onShare={handleShareVaultItem}
      />

      {/* Direct Chat Settings / Info Modal */}
      {showDmInfo && activeConvo?.kind === 'dm' && (
        <div
          onClick={() => setShowDmInfo(false)}
          className="fixed inset-0 z-[82] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#24201E] border border-[#FFEBD7]/12 p-6 pb-safe shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#F3EFEA]">Chat Details</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowDmInfo(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#A39B93] hover:text-[#F3EFEA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col items-center text-center mb-5">
              <ProfileAvatar
                profile={activePartner}
                sizeClass="w-20 h-20"
                roundedClass="rounded-full"
                textClass="text-2xl font-semibold"
                showOnlineDot={!!activePartner}
                dotBorderClass="border-[#24201E]"
              />
              <h4 className="font-display text-lg font-semibold text-[#F3EFEA] mt-3">{activeChatTitle}</h4>
              <p className="text-xs text-[#86A389] mt-0.5">online</p>
            </div>

            {activePartnerId && (
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDmInfo(false);
                    onStartCall(activePartnerId, false);
                  }}
                  className="min-h-[44px] rounded-xl bg-[#5A6E5C]/30 border border-[#86A389]/35 text-[#F3EFEA] text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#5A6E5C]/50 transition-colors"
                >
                  <Phone className="w-4 h-4 text-[#86A389]" />
                  <span>Voice Call</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDmInfo(false);
                    onStartCall(activePartnerId, true);
                  }}
                  className="min-h-[44px] rounded-xl bg-[#9E5A3C]/30 border border-[#C97A57]/35 text-[#F3EFEA] text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#9E5A3C]/50 transition-colors"
                >
                  <Video className="w-4 h-4 text-[#C97A57]" />
                  <span>Video Call</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setShowDmInfo(false);
                onOpenSettings();
              }}
              className="w-full min-h-[44px] rounded-xl bg-[#1C1918] border border-[#FFEBD7]/[0.08] text-[#A39B93] hover:text-[#F3EFEA] text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Notification &amp; Account Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* New Message Sheet */}
      {showNewSheet && (
        <div
          onClick={() => setShowNewSheet(false)}
          className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#24201E] border border-[#FFEBD7]/12 max-h-[82vh] flex flex-col overflow-hidden pb-safe shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-[#FFEBD7]/[0.08] flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F3EFEA]">New message</h2>
                <p className="text-xs text-[#A39B93]">Start a chat, group, or call</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowNewSheet(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto custom-scroll divide-y divide-[#FFEBD7]/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setShowNewSheet(false);
                  setNewGroupName('');
                  setNewGroupPhoto(null);
                  setNewGroupMembers([]);
                  setShowCreateGroup(true);
                }}
                className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#FFEBD7]/[0.04] text-left transition-colors"
              >
                <div className="w-11 h-11 rounded-full bg-[#8C5327] border border-[#D98A4E]/40 flex items-center justify-center text-[#F3EFEA] shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#F3EFEA]">New group</p>
                  <p className="text-xs text-[#A39B93]">Chat with multiple profiles at once</p>
                </div>
                <Plus className="w-5 h-5 text-[#A39B93]" />
              </button>

              {otherProfiles.length === 0 ? (
                <p className="py-8 px-6 text-center text-sm text-[#A39B93]">
                  No other profiles yet. Add another profile first.
                </p>
              ) : (
                otherProfiles.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-[#FFEBD7]/[0.03]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewSheet(false);
                        onSelectConvo({kind: 'dm', id: makeChatId(currentUser.id, p.id)});
                      }}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <ProfileAvatar
                        profile={p}
                        sizeClass="w-11 h-11"
                        roundedClass="rounded-full"
                        showOnlineDot
                        dotBorderClass="border-[#24201E]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#F3EFEA] truncate">{p.name}</p>
                        <p className="text-xs text-[#A39B93]">Tap to message</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Voice call ${p.name}`}
                      onClick={() => {
                        setShowNewSheet(false);
                        onStartCall(p.id, false);
                      }}
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-[#5A6E5C]/25 text-[#86A389] hover:bg-[#5A6E5C] hover:text-[#F3EFEA] flex items-center justify-center transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Video call ${p.name}`}
                      onClick={() => {
                        setShowNewSheet(false);
                        onStartCall(p.id, true);
                      }}
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-[#9E5A3C]/25 text-[#C97A57] hover:bg-[#9E5A3C] hover:text-[#F3EFEA] flex items-center justify-center transition-colors"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Sheet */}
      {showCreateGroup && (
        <div
          onClick={() => setShowCreateGroup(false)}
          className="fixed inset-0 z-[82] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#24201E] border border-[#FFEBD7]/12 max-h-[85vh] flex flex-col overflow-hidden pb-safe shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-[#FFEBD7]/[0.08] flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F3EFEA]">New group</h2>
                <p className="text-xs text-[#A39B93]">Name your group and choose members</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowCreateGroup(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => groupPhotoInputRef.current?.click()}
                  className="w-20 h-20 rounded-full border-2 border-dashed border-[#FFEBD7]/20 bg-[#1C1918] flex flex-col items-center justify-center overflow-hidden shrink-0"
                >
                  {newGroupPhoto ? (
                    <img src={newGroupPhoto} alt="Group" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-[#A39B93]" />
                      <span className="text-[10px] text-[#A39B93] mt-1">Photo</span>
                    </>
                  )}
                </button>
                <input
                  ref={groupPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setNewGroupPhoto(await compressImage(file, 320, 0.82));
                    } catch {
                      // ignore
                    }
                    e.target.value = '';
                  }}
                />
                <input
                  type="text"
                  maxLength={40}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  className="flex-1 min-h-[44px] rounded-xl bg-[#1C1918] border border-[#FFEBD7]/10 px-4 text-base text-[#F3EFEA] placeholder-[#A39B93] focus:outline-none focus:border-[#D98A4E]/60"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[#A39B93] uppercase tracking-wider">Members</p>
                {otherProfiles.map((p) => {
                  const selected = newGroupMembers.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setNewGroupMembers((prev) =>
                          prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                        )
                      }
                      className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors ${
                        selected
                          ? 'bg-[#8C5327]/25 border border-[#D98A4E]/45'
                          : 'border border-transparent hover:bg-[#FFEBD7]/[0.04]'
                      }`}
                    >
                      <ProfileAvatar profile={p} sizeClass="w-10 h-10" roundedClass="rounded-full" />
                      <span className="flex-1 text-sm font-medium text-[#F3EFEA] truncate">{p.name}</span>
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selected
                            ? 'bg-[#C97A57] border-[#C97A57] text-[#181615]'
                            : 'border-[#FFEBD7]/25'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-[#FFEBD7]/[0.08]">
              <button
                type="button"
                disabled={!newGroupName.trim() || newGroupMembers.length === 0 || creatingGroup}
                onClick={handleCreateGroup}
                className="w-full min-h-[44px] rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] disabled:opacity-40 text-[#F3EFEA] text-sm font-medium transition-colors"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Info Sheet */}
      {showGroupInfo && activeConvo?.kind === 'group' && activeGroup && (
        <div
          onClick={() => setShowGroupInfo(false)}
          className="fixed inset-0 z-[82] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#24201E] border border-[#FFEBD7]/12 max-h-[85vh] flex flex-col overflow-hidden pb-safe shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-[#FFEBD7]/[0.08] flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#F3EFEA]">Group info</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowGroupInfo(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-5">
              <div className="flex flex-col items-center text-center">
                {editingGroup ? (
                  <>
                    <button
                      type="button"
                      onClick={() => editGroupPhotoInputRef.current?.click()}
                      className="w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-[#FFEBD7]/25"
                    >
                      {editGroupPhoto || activeGroup.photo ? (
                        <img
                          src={editGroupPhoto || activeGroup.photo || ''}
                          alt="Group"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <GroupAvatar
                          group={{...activeGroup, id: activeConvo.id}}
                          sizeClass="w-24 h-24"
                          roundedClass="rounded-full"
                        />
                      )}
                    </button>
                    <input
                      ref={editGroupPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setEditGroupPhoto(await compressImage(file, 320, 0.82));
                        } catch {
                          // ignore
                        }
                        e.target.value = '';
                      }}
                    />
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full min-h-[44px] mt-4 rounded-xl bg-[#1C1918] border border-[#FFEBD7]/10 px-4 text-base text-[#F3EFEA]"
                    />
                    <div className="flex gap-2 w-full mt-3">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!editGroupName.trim()) return;
                          const updates: Partial<GroupChat> = {name: editGroupName.trim()};
                          if (editGroupPhoto) updates.photo = editGroupPhoto;
                          await update(ref(db, `groups/${activeConvo.id}`), updates);
                          setEditingGroup(false);
                        }}
                        className="flex-1 min-h-[40px] rounded-xl bg-[#9E5A3C] text-[#F3EFEA] text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroup(false)}
                        className="min-h-[40px] px-4 rounded-xl border border-[#FFEBD7]/15 text-[#A39B93] text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <GroupAvatar
                      group={{...activeGroup, id: activeConvo.id}}
                      sizeClass="w-24 h-24"
                      roundedClass="rounded-full"
                      textClass="text-2xl font-semibold"
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <h3 className="font-display text-xl font-semibold text-[#F3EFEA]">{activeGroup.name}</h3>
                      {activeGroup.createdBy === currentUser.id && (
                        <button
                          type="button"
                          aria-label="Edit group"
                          onClick={() => {
                            setEditGroupName(activeGroup.name || '');
                            setEditGroupPhoto(null);
                            setEditingGroup(true);
                          }}
                          className="p-1.5 rounded-lg text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/10"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#A39B93] mt-1">
                      {Object.keys(activeGroup.members || {}).length} members
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2 border-t border-[#FFEBD7]/[0.08] pt-4">
                <p className="text-xs text-[#A39B93] uppercase tracking-wider">Members</p>
                {Object.keys(activeGroup.members || {}).map((pid) => {
                  const p = profiles.find((pr) => pr.id === pid);
                  const canRemove = activeGroup.createdBy === currentUser.id && pid !== currentUser.id;
                  return (
                    <div key={pid} className="flex items-center gap-3 py-1.5">
                      <ProfileAvatar profile={p || {name: 'Deleted'}} sizeClass="w-10 h-10" roundedClass="rounded-full" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#F3EFEA] truncate">
                          {p?.name || 'Deleted profile'} {pid === currentUser.id ? '(you)' : ''}
                        </p>
                        <p className="text-xs text-[#A39B93]">
                          {pid === activeGroup.createdBy ? 'Creator' : 'Member'}
                        </p>
                      </div>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => remove(ref(db, `groups/${activeConvo.id}/members/${pid}`))}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#DF9878]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {otherProfiles.some((p) => !activeGroup.members?.[p.id]) && (
                <div className="space-y-2 border-t border-[#FFEBD7]/[0.08] pt-4">
                  <p className="text-xs text-[#A39B93] uppercase tracking-wider">Add members</p>
                  {otherProfiles
                    .filter((p) => !activeGroup.members?.[p.id])
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => set(ref(db, `groups/${activeConvo.id}/members/${p.id}`), true)}
                        className="w-full py-2 flex items-center gap-3 text-left hover:bg-[#FFEBD7]/[0.04] rounded-xl px-2"
                      >
                        <ProfileAvatar profile={p} sizeClass="w-9 h-9" roundedClass="rounded-full" />
                        <span className="flex-1 text-sm text-[#F3EFEA] truncate">{p.name}</span>
                        <Plus className="w-4 h-4 text-[#D98A4E]" />
                      </button>
                    ))}
                </div>
              )}

              <div className="border-t border-[#FFEBD7]/[0.08] pt-4">
                {activeGroup.createdBy === currentUser.id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await remove(ref(db, `groups/${activeConvo.id}`));
                      setShowGroupInfo(false);
                      onSelectConvo(null);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-[#C97A57]/35 bg-[#9E5A3C]/20 text-[#DF9878] text-sm font-medium"
                  >
                    Delete Group
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await remove(ref(db, `groups/${activeConvo.id}/members/${currentUser.id}`));
                      setShowGroupInfo(false);
                      onSelectConvo(null);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-[#C97A57]/35 bg-[#9E5A3C]/20 text-[#DF9878] text-sm font-medium"
                  >
                    Leave Group
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
