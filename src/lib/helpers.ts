import type {ChatMessage, DirectChat, GroupChat, Profile} from './types';

export function getInitials(name?: string): string {
  const words = String(name || 'U')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (letters || 'U').toUpperCase();
}

export function avatarColorHex(colorClass?: string): [string, string] {
  const map: Record<string, [string, string]> = {
    'bg-red-500': ['#ef4444', '#dc2626'],
    'bg-blue-500': ['#3b82f6', '#2563eb'],
    'bg-green-500': ['#22c55e', '#16a34a'],
    'bg-yellow-500': ['#eab308', '#ca8a04'],
    'bg-purple-500': ['#a855f7', '#9333ea'],
    'bg-pink-500': ['#ec4899', '#db2777'],
    'bg-indigo-500': ['#6366f1', '#4f46e5'],
    'bg-teal-500': ['#14b8a6', '#0d9488'],
  };
  return map[colorClass || ''] || ['#6366f1', '#4f46e5'];
}

export function groupGradient(key: string): [string, string] {
  const palette: Array<[string, string]> = [
    ['#6366f1', '#8b5cf6'],
    ['#ec4899', '#f43f5e'],
    ['#f59e0b', '#ef4444'],
    ['#10b981', '#0ea5e9'],
    ['#8b5cf6', '#6366f1'],
    ['#0ea5e9', '#14b8a6'],
    ['#ef4444', '#f97316'],
    ['#14b8a6', '#22c55e'],
  ];
  let hash = 0;
  const s = String(key || 'group');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 9973;
  return palette[hash % palette.length];
}

export function makeChatId(a: string, b: string): string {
  return [a, b].sort().join('__');
}

export function getPartnerIdFromChatId(chatId: string, myId: string): string {
  const parts = String(chatId).split('__');
  return parts.find((p) => p !== myId) || parts[0];
}

export function mapMessages(obj?: Record<string, Omit<ChatMessage, 'id'>>): ChatMessage[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([id, m]) => ({id, ...m}))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function isMyChat(chatId: string, chat: DirectChat | undefined, myId: string): boolean {
  if (!myId) return false;
  if (chat?.meta?.participants?.[myId]) return true;
  return String(chatId).split('__').includes(myId);
}

export function isMyGroup(group: GroupChat | undefined, myId: string): boolean {
  return !!(myId && group?.members?.[myId]);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatClockTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}

export function formatChatTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if ((now.getTime() - d.getTime()) / 86400000 < 7) {
    return d.toLocaleDateString('en-US', {weekday: 'short'});
  }
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

export function formatDayLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

export function groupMemberLabel(group: GroupChat, profiles: Profile[], myId: string): string {
  const memberIds = Object.keys(group.members || {});
  const names = memberIds
    .filter((id) => id !== myId)
    .map((id) => profiles.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return 'Just you';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}
