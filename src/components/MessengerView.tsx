import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ref, push, set, update, remove} from 'firebase/database';
import {
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  Trash2,
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
  getPartnerIdFromChatId,
  groupMemberLabel,
  isMyChat,
  isMyGroup,
  makeChatId,
  mapMessages,
} from '../lib/helpers';
import type {ChatMessage, ConversationRef, DirectChat, GroupChat, Profile} from '../lib/types';
import {GroupAvatar, ProfileAvatar} from './Avatar';

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '🙃', '😴', '😢', '😭', '😡', '🤯',
  '🥳', '😇', '🤗', '🤩', '😜', '🙄', '😬', '🫶', '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '✨', '🔥', '🎉', '🎂', '☕', '🍕', '⚽', '🎵',
  '🌟', '💯', '🚀', '🌈', '☀️', '🌙', '🍀', '📌', '✅', '❌', '⏰', '👀', '🤍', '🥰',
];

interface MessengerViewProps {
  currentUser: Profile;
  profiles: Profile[];
  chatsData: Record<string, DirectChat>;
  groupsData: Record<string, GroupChat>;
  activeConvo: ConversationRef | null;
  onSelectConvo: (convo: ConversationRef | null) => void;
  onStartCall: (partnerId: string, video: boolean) => void;
}

export const MessengerView: React.FC<MessengerViewProps> = ({
  currentUser,
  profiles,
  chatsData,
  groupsData,
  activeConvo,
  onSelectConvo,
  onStartCall,
}) => {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  // Sheets
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

  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const handleSend = async () => {
    if (!activeConvo) return;
    const text = draft.trim();
    if (!text) return;

    setDraft('');
    setShowEmoji(false);
    stickToBottomRef.current = true;
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const now = Date.now();
    const basePath = activeConvo.kind === 'dm' ? `chats/${activeConvo.id}` : `groups/${activeConvo.id}`;
    try {
      const msgRef = push(ref(db, `${basePath}/messages`));
      await set(msgRef, {
        senderId: currentUser.id,
        senderName: currentUser.name,
        text,
        createdAt: now,
      });
      await update(ref(db, `${basePath}/meta`), {
        lastMessage: text.length > 80 ? `${text.slice(0, 80)}…` : text,
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
    } catch {
      setDraft(text);
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
        return {state: 'all', label: others.length > 1 ? 'Seen by all' : 'Seen'};
      }
      return {state: 'some', label: `Seen by ${readCount}/${others.length}`};
    }
    let partnerRead = 0;
    Object.entries(activeDm?.reads || {}).forEach(([uid, ts]) => {
      if (uid !== currentUser.id && ts > partnerRead) partnerRead = ts;
    });
    if (msg.createdAt <= partnerRead) {
      return {state: 'all', label: `Seen · ${formatChatTime(partnerRead)}`};
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

  const myLastMsgId = useMemo(() => {
    const mine = activeMessages.filter((m) => m.senderId === currentUser.id);
    return mine.length ? mine[mine.length - 1].id : null;
  }, [activeMessages, currentUser.id]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#0b0d14]">
      {/* Left Chat List Pane */}
      <aside
        className={`w-full md:w-80 lg:w-96 flex-col border-r border-white/[0.07] bg-[#0e111b] min-h-0 ${
          activeConvo ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-3 flex items-center gap-2 border-b border-white/[0.06] shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full min-h-[42px] rounded-xl bg-white/[0.05] border border-white/10 pl-9 pr-3 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowNewSheet(true)}
            aria-label="New message"
            className="min-h-[42px] min-w-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll divide-y divide-white/[0.04]">
          {filteredEntries.length === 0 && startableProfiles.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <p className="text-sm text-slate-400">
                {query ? `No chats match "${query}".` : 'No conversations yet.'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Tap + to message someone or start a group.</p>
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
                    className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors ${
                      isActive ? 'bg-indigo-600/15' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    {entry.kind === 'group' ? (
                      <GroupAvatar group={entry.group} sizeClass="w-12 h-12" roundedClass="rounded-2xl" />
                    ) : (
                      <ProfileAvatar profile={entry.partner} sizeClass="w-12 h-12" roundedClass="rounded-2xl" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {entry.title}
                          {entry.kind === 'group' && (
                            <span className="text-[11px] font-normal text-slate-400 ml-1.5">· Group</span>
                          )}
                        </p>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {entry.lastAt ? formatChatTime(entry.lastAt) : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-slate-400 truncate">
                          {entry.preview}
                          {entry.receipt && (
                            <span
                              className={`ml-1 ${
                                entry.receipt === 'seen' ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            >
                              · {entry.receipt === 'seen' ? 'Seen' : entry.receipt === 'some' ? 'Partly seen' : 'Sent'}
                            </span>
                          )}
                        </p>
                        {entry.unread > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums shrink-0">
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
                  <p className="px-4 pb-1.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Start a chat
                  </p>
                  {startableProfiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectConvo({kind: 'dm', id: makeChatId(currentUser.id, p.id)})}
                      className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
                    >
                      <ProfileAvatar profile={p} sizeClass="w-10 h-10" roundedClass="rounded-xl" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">Tap to message</p>
                      </div>
                      <Plus className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Right Conversation Pane */}
      <section
        className={`flex-1 flex-col min-w-0 min-h-0 bg-[#0b0d14] ${
          activeConvo ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeConvo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-3xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4 text-slate-400">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="font-display text-lg font-semibold text-white">Select a conversation</h3>
            <p className="text-sm text-slate-400 mt-1 mb-5">
              Choose a profile or group to message, voice call, or video call.
            </p>
            <button
              type="button"
              onClick={() => setShowNewSheet(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>New message</span>
            </button>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="px-3 sm:px-4 py-2.5 border-b border-white/[0.07] bg-[#101320] flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                aria-label="Back to chats"
                onClick={() => onSelectConvo(null)}
                className="md:hidden min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {activeConvo.kind === 'group' ? (
                <GroupAvatar
                  group={activeGroup ? {...activeGroup, id: activeConvo.id} : {name: 'Group'}}
                  sizeClass="w-10 h-10"
                  roundedClass="rounded-xl"
                />
              ) : (
                <ProfileAvatar profile={activePartner} sizeClass="w-10 h-10" roundedClass="rounded-xl" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {activeConvo.kind === 'group'
                    ? activeGroup?.name || 'Group'
                    : activePartner?.name || 'Deleted profile'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {activeConvo.kind === 'group' && activeGroup
                    ? `${Object.keys(activeGroup.members || {}).length} members · ${groupMemberLabel(
                        activeGroup,
                        profiles,
                        currentUser.id,
                      )}`
                    : activePartner
                      ? activePartner.isKid
                        ? 'Kids profile'
                        : 'Available'
                      : 'Profile removed'}
                </p>
              </div>

              {activeConvo.kind === 'dm' && activePartnerId && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label="Voice call"
                    onClick={() => onStartCall(activePartnerId, false)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Video call"
                    onClick={() => onStartCall(activePartnerId, true)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Video className="w-5 h-5" />
                  </button>
                </div>
              )}

              {activeConvo.kind === 'group' && (
                <button
                  type="button"
                  aria-label="Group info"
                  onClick={() => {
                    setEditingGroup(false);
                    setEditGroupPhoto(null);
                    setShowGroupInfo(true);
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <Users className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div
              ref={messagesAreaRef}
              onScroll={() => {
                const el = messagesAreaRef.current;
                if (!el) return;
                stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 min-h-0 overflow-y-auto custom-scroll px-3 sm:px-5 py-4 space-y-2"
            >
              {activeMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <p className="text-sm font-medium text-slate-300">No messages yet</p>
                  <p className="text-xs text-slate-500 mt-1">Send a message below to start the conversation.</p>
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
                  const receipt = mine && msg.id === myLastMsgId ? getReceiptLabel(msg) : null;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDivider && (
                        <div className="flex justify-center my-4">
                          <span className="text-[11px] text-slate-400 bg-white/[0.05] px-3 py-1 rounded-full">
                            {day}
                          </span>
                        </div>
                      )}
                      <div>
                        {showSender && (
                          <p className="text-[11px] text-slate-400 ml-10 mb-1">
                            {sender?.name || msg.senderName || 'Unknown'}
                          </p>
                        )}
                        <div className={`flex items-end gap-2 group ${mine ? 'justify-end' : 'justify-start'}`}>
                          {!mine && (
                            <div className={activeConvo.kind === 'group' && !showSender ? 'invisible' : ''}>
                              <ProfileAvatar
                                profile={sender || {name: msg.senderName || 'U', color: 'bg-slate-600'}}
                                sizeClass="w-7 h-7"
                                roundedClass="rounded-lg"
                                textClass="text-[11px] font-semibold"
                              />
                            </div>
                          )}

                          {mine && (
                            <button
                              type="button"
                              aria-label="Delete message"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div
                            className={`max-w-[78%] sm:max-w-[65%] px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                              mine
                                ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm'
                                : 'bg-[#171b2d] text-slate-100 border border-white/[0.07] rounded-2xl rounded-bl-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            <div
                              className={`flex items-center justify-end gap-1 mt-1 text-[10px] tabular-nums ${
                                mine ? 'text-indigo-100/75' : 'text-slate-400'
                              }`}
                            >
                              <span>{formatClockTime(msg.createdAt)}</span>
                              {mine &&
                                (getReceiptLabel(msg).state === 'sent' ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <CheckCheck className="w-3 h-3 text-emerald-300" />
                                ))}
                            </div>
                          </div>
                        </div>

                        {receipt && (
                          <div className="flex justify-end pr-1 mt-1">
                            <span
                              className={`text-[11px] ${
                                receipt.state === 'all'
                                  ? 'text-emerald-400'
                                  : receipt.state === 'some'
                                    ? 'text-sky-300'
                                    : 'text-slate-400'
                              }`}
                            >
                              {receipt.label}
                            </span>
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <div className="relative px-3 py-2.5 border-t border-white/[0.07] bg-[#101320] shrink-0">
              {showEmoji && (
                <div className="absolute bottom-[68px] left-3 z-30 w-64 max-h-52 overflow-y-auto grid grid-cols-8 gap-1 p-2 rounded-2xl bg-[#161a2e] border border-white/12 shadow-2xl">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setDraft((d) => d + emoji);
                        inputRef.current?.focus();
                      }}
                      className="text-lg p-1 rounded hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  aria-label="Emoji picker"
                  onClick={() => setShowEmoji((v) => !v)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
                >
                  <Smile className="w-5 h-5" />
                </button>
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
                  placeholder="Write a message..."
                  className="flex-1 min-w-0 max-h-[120px] min-h-[44px] rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-2.5 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <button
                  type="button"
                  aria-label="Send message"
                  onClick={handleSend}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white flex items-center justify-center shrink-0 transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* New Message Sheet */}
      {showNewSheet && (
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#131624] border border-white/10 max-h-[82vh] flex flex-col overflow-hidden pb-safe">
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">New message</h2>
                <p className="text-xs text-slate-400">Start a chat, group, or call</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowNewSheet(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto custom-scroll divide-y divide-white/[0.05]">
              <button
                type="button"
                onClick={() => {
                  setShowNewSheet(false);
                  setNewGroupName('');
                  setNewGroupPhoto(null);
                  setNewGroupMembers([]);
                  setShowCreateGroup(true);
                }}
                className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.04] text-left"
              >
                <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">New group</p>
                  <p className="text-xs text-slate-400">Chat with multiple profiles at once</p>
                </div>
                <Plus className="w-5 h-5 text-slate-400" />
              </button>

              {otherProfiles.length === 0 ? (
                <p className="py-8 px-6 text-center text-sm text-slate-400">
                  No other profiles yet. Add another profile first.
                </p>
              ) : (
                otherProfiles.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewSheet(false);
                        onSelectConvo({kind: 'dm', id: makeChatId(currentUser.id, p.id)});
                      }}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <ProfileAvatar profile={p} sizeClass="w-11 h-11" roundedClass="rounded-2xl" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">Tap to message</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Voice call ${p.name}`}
                      onClick={() => {
                        setShowNewSheet(false);
                        onStartCall(p.id, false);
                      }}
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-white flex items-center justify-center"
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
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-indigo-500/15 text-indigo-300 hover:bg-indigo-600 hover:text-white flex items-center justify-center"
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
        <div className="fixed inset-0 z-[82] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#131624] border border-white/10 max-h-[85vh] flex flex-col overflow-hidden pb-safe">
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">New group</h2>
                <p className="text-xs text-slate-400">Name your group and choose members</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowCreateGroup(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => groupPhotoInputRef.current?.click()}
                  className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 bg-white/[0.04] flex flex-col items-center justify-center overflow-hidden shrink-0"
                >
                  {newGroupPhoto ? (
                    <img src={newGroupPhoto} alt="Group" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-slate-400" />
                      <span className="text-[10px] text-slate-400 mt-1">Photo</span>
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
                  className="flex-1 min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-4 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Members</p>
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
                        selected ? 'bg-indigo-600/20 border border-indigo-500/40' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <ProfileAvatar profile={p} sizeClass="w-10 h-10" roundedClass="rounded-xl" />
                      <span className="flex-1 text-sm font-medium text-white truncate">{p.name}</span>
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-white/25'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-white/[0.07]">
              <button
                type="button"
                disabled={!newGroupName.trim() || newGroupMembers.length === 0 || creatingGroup}
                onClick={handleCreateGroup}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Info Sheet */}
      {showGroupInfo && activeConvo?.kind === 'group' && activeGroup && (
        <div className="fixed inset-0 z-[82] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#131624] border border-white/10 max-h-[85vh] flex flex-col overflow-hidden pb-safe">
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">Group info</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowGroupInfo(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
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
                      className="w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-white/25"
                    >
                      {editGroupPhoto || activeGroup.photo ? (
                        <img
                          src={editGroupPhoto || activeGroup.photo || ''}
                          alt="Group"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <GroupAvatar group={{...activeGroup, id: activeConvo.id}} sizeClass="w-24 h-24" roundedClass="rounded-full" />
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
                      className="w-full min-h-[44px] mt-4 rounded-xl bg-white/[0.06] border border-white/10 px-4 text-base text-white"
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
                        className="flex-1 min-h-[40px] rounded-xl bg-indigo-600 text-white text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroup(false)}
                        className="min-h-[40px] px-4 rounded-xl border border-white/15 text-slate-300 text-sm"
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
                      <h3 className="font-display text-xl font-semibold text-white">{activeGroup.name}</h3>
                      {activeGroup.createdBy === currentUser.id && (
                        <button
                          type="button"
                          aria-label="Edit group"
                          onClick={() => {
                            setEditGroupName(activeGroup.name || '');
                            setEditGroupPhoto(null);
                            setEditingGroup(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {Object.keys(activeGroup.members || {}).length} members
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2 border-t border-white/[0.07] pt-4">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Members</p>
                {Object.keys(activeGroup.members || {}).map((pid) => {
                  const p = profiles.find((pr) => pr.id === pid);
                  const canRemove = activeGroup.createdBy === currentUser.id && pid !== currentUser.id;
                  return (
                    <div key={pid} className="flex items-center gap-3 py-1.5">
                      <ProfileAvatar profile={p || {name: 'Deleted'}} sizeClass="w-10 h-10" roundedClass="rounded-xl" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {p?.name || 'Deleted profile'} {pid === currentUser.id ? '(you)' : ''}
                        </p>
                        <p className="text-xs text-slate-400">
                          {pid === activeGroup.createdBy ? 'Creator' : 'Member'}
                        </p>
                      </div>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => remove(ref(db, `groups/${activeConvo.id}/members/${pid}`))}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {otherProfiles.some((p) => !activeGroup.members?.[p.id]) && (
                <div className="space-y-2 border-t border-white/[0.07] pt-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Add members</p>
                  {otherProfiles
                    .filter((p) => !activeGroup.members?.[p.id])
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => set(ref(db, `groups/${activeConvo.id}/members/${p.id}`), true)}
                        className="w-full py-2 flex items-center gap-3 text-left hover:bg-white/[0.04] rounded-xl px-2"
                      >
                        <ProfileAvatar profile={p} sizeClass="w-9 h-9" roundedClass="rounded-xl" />
                        <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                        <Plus className="w-4 h-4 text-indigo-400" />
                      </button>
                    ))}
                </div>
              )}

              <div className="border-t border-white/[0.07] pt-4">
                {activeGroup.createdBy === currentUser.id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await remove(ref(db, `groups/${activeConvo.id}`));
                      setShowGroupInfo(false);
                      onSelectConvo(null);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm font-medium"
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
                    className="w-full min-h-[44px] rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm font-medium"
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
