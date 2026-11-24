export interface Profile {
  id: string;
  name: string;
  color: string;
  isKid: boolean;
  photo?: string | null;
  pinHash?: string;
  pinSalt?: string;
  pinLength?: number;
  createdAt?: number;
}

export type VaultCategory = 'files' | 'photos' | 'videos' | 'notes';

export interface VaultItem {
  id: string;
  name?: string;
  size?: number;
  type?: string;
  data?: string;
  title?: string;
  content?: string;
  color?: string;
  createdAt?: number;
}

export interface UserData {
  files: VaultItem[];
  photos: VaultItem[];
  videos: VaultItem[];
  notes: VaultItem[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  text: string;
  createdAt: number;
}

export interface ChatMeta {
  lastMessage?: string;
  lastAt?: number;
  lastSenderId?: string;
  participants?: Record<string, boolean>;
}

export interface DirectChat {
  meta?: ChatMeta;
  messages?: Record<string, Omit<ChatMessage, 'id'>>;
  reads?: Record<string, number>;
}

export interface GroupChat {
  id: string;
  name: string;
  photo?: string | null;
  createdBy: string;
  createdAt?: number;
  members?: Record<string, boolean>;
  meta?: ChatMeta;
  messages?: Record<string, Omit<ChatMessage, 'id'>>;
  reads?: Record<string, number>;
}

export interface ConversationRef {
  kind: 'dm' | 'group';
  id: string;
}

export interface CallSignalData {
  callerId: string;
  callerName?: string;
  calleeId: string;
  calleeName?: string;
  video?: boolean;
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'busy';
  createdAt?: number;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  callerCandidates?: Record<string, RTCIceCandidateInit>;
  calleeCandidates?: Record<string, RTCIceCandidateInit>;
}

export interface CallLogEntry {
  id: string;
  peerId: string;
  peerName: string;
  direction: 'incoming' | 'outgoing';
  video: boolean;
  status: 'answered' | 'missed' | 'declined' | 'ended' | 'ringing';
  timestamp: number;
}

export interface NotificationPrefs {
  messages: boolean;
  calls: boolean;
  sound: boolean;
  vibrate: boolean;
}

export interface ToastAlert {
  id: string;
  title: string;
  body: string;
  kind: 'message' | 'call' | 'system';
  avatarUrl?: string;
  avatarColor?: string;
  avatarInitials?: string;
  timestamp: number;
  onClick?: () => void;
}
