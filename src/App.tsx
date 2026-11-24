import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {get, onChildAdded, onChildChanged, onChildRemoved, onValue, push, ref, remove, set} from 'firebase/database';
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronLeft,
  FolderOpen,
  Layers,
  LogOut,
  MessageSquare,
  Phone,
  Search,
  Settings,
} from 'lucide-react';
import {db} from './lib/firebase';
import {
  getInitials,
  isMyChat,
  isMyGroup,
  mapMessages,
} from './lib/helpers';
import {
  isNativeAndroid,
  nativeAddNotificationActionListener,
  nativeCheckNotificationStatus,
  nativeClearCallNotification,
  nativeClearConversationNotification,
  nativeLogout,
  nativeOpenNotificationSettings,
  nativeRecoverSavedProfile,
  nativeRequestBatteryOptimizationExemption,
  nativeSetActiveScreen,
  nativeShowTestNotification,
  nativeSyncLoggedInSession,
  nativeUpdateNotificationPrefs,
  type NativeNotificationActionEvent,
  type NativePermissionStatus,
} from './lib/nativeBridge';
import {
  DEFAULT_NOTIF_PREFS,
  loadNotifPrefs,
  playMessageChime,
  registerPushSubscription,
  requestSystemNotificationPermission,
  saveNotifPrefs,
  showSystemNotification,
  startCallRingtone,
  stopCallRingtone,
  unlockNotificationAudio,
  updateAppBadge,
  vibrateAlert,
} from './lib/notifications';
import {
  clearSavedSession,
  loadSavedSession,
  saveLoggedInSession,
} from './lib/session';
import type {
  CallLogEntry,
  CallSignalData,
  ConversationRef,
  DirectChat,
  GroupChat,
  NotificationPrefs,
  Profile,
  ToastAlert,
  UserData,
  VaultCategory,
  VaultItem,
} from './lib/types';
import {ProfileAvatar} from './components/Avatar';
import {CallOverlay, type ActiveCallSession} from './components/CallOverlay';
import {CallsView} from './components/CallsView';
import {GlobalSearchModal} from './components/GlobalSearchModal';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {ProfilesView} from './components/ProfilesView';
import {SettingsView} from './components/SettingsView';
import {ToastStack} from './components/ToastStack';
import {VaultSection} from './components/VaultSection';
import {WorkspaceView} from './components/WorkspaceView';

type AppTab = 'chats' | 'vault' | 'calls' | 'settings';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => loadSavedSession()?.profile ?? null);
  const [activeTab, setActiveTab] = useState<AppTab>('chats');
  const [vaultInitialCat, setVaultInitialCat] = useState<VaultCategory>('files');
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [userData, setUserData] = useState<UserData>({
    files: [],
    photos: [],
    videos: [],
    notes: [],
  });
  const [chatsData, setChatsData] = useState<Record<string, DirectChat>>({});
  const [groupsData, setGroupsData] = useState<Record<string, GroupChat>>({});
  const [activeConvo, setActiveConvo] = useState<ConversationRef | null>(null);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() =>
    loadNotifPrefs(loadSavedSession()?.profileId),
  );
  const [nativeNotifStatus, setNativeNotifStatus] = useState<NativePermissionStatus | null>(null);
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const [callHistory, setCallHistory] = useState<CallLogEntry[]>([]);
  const [activeCallUI, setActiveCallUI] = useState<ActiveCallSession | null>(null);

  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Refs for real-time callbacks & WebRTC state
  const currentUserRef = useRef<Profile | null>(null);
  const profilesRefState = useRef<Profile[]>([]);
  const notifPrefsRef = useRef<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const nativeNotifStatusRef = useRef<NativePermissionStatus | null>(null);
  const activeTabRef = useRef<AppTab>('chats');
  const activeConvoRef = useRef<ConversationRef | null>(null);
  const fbConnectedRef = useRef(false);

  const baselineChatsLoadedRef = useRef(false);
  const baselineGroupsLoadedRef = useRef(false);
  const seenMessageKeysRef = useRef<Set<string>>(new Set());
  const pendingDeepLinkRef = useRef<{type: 'convo'; kind: 'dm' | 'group'; id: string} | null>(null);
  const pendingAutoAnswerCallIdRef = useRef<string | null>(null);
  const acceptIncomingCallRef = useRef<() => Promise<void>>(async () => {});
  const autoRequestedNotifForRef = useRef<string | null>(null);

  // WebRTC call refs
  const rtcRef = useRef<{
    callId: string;
    peerId: string;
    peerName: string;
    isVideo: boolean;
    isCaller: boolean;
    ringing: boolean;
    answered: boolean;
    muted: boolean;
    camOff: boolean;
    pc: RTCPeerConnection | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remoteSet: boolean;
    acceptedSeen: boolean;
    endedHandled: boolean;
    addedCandidateKeys: Set<string>;
    candidateQueue: RTCIceCandidateInit[];
    ringTimeout: number | null;
    durationTimer: number | null;
    connectedAt: number;
  } | null>(null);
  const seenIncomingCallsRef = useRef<Set<string>>(new Set());

  currentUserRef.current = currentUser;
  profilesRefState.current = profiles;
  notifPrefsRef.current = notifPrefs;
  nativeNotifStatusRef.current = nativeNotifStatus;
  activeTabRef.current = activeTab;
  activeConvoRef.current = activeConvo;

  // Dynamic viewport height sync (keeps message composer above mobile keyboard)
  useEffect(() => {
    const updateHeight = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', () => window.setTimeout(updateHeight, 250));
    window.visualViewport?.addEventListener('resize', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Global keyboard shortcut Cmd/Ctrl+K for global search & click-outside for profile menu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!currentUserRef.current) return;
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  // Arm WebAudio on first user gesture anywhere
  useEffect(() => {
    const arm = () => {
      unlockNotificationAudio();
    };
    window.addEventListener('pointerdown', arm, {once: true});
    return () => window.removeEventListener('pointerdown', arm);
  }, []);

  // Toast helper
  const pushToast = useCallback((toast: Omit<ToastAlert, 'id' | 'timestamp'>) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const full: ToastAlert = {...toast, id, timestamp: Date.now()};
    setToasts((prev) => [...prev.slice(-2), full]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Refresh native Android notification status (permission, service, battery optimization)
  const refreshNativeStatus = useCallback(async () => {
    if (!isNativeAndroid()) return null;
    const status = await nativeCheckNotificationStatus();
    if (status) setNativeNotifStatus(status);
    return status;
  }, []);

  // Recover persistent login from Android SharedPreferences if WebView localStorage was cleared
  useEffect(() => {
    if (!isNativeAndroid()) return;
    let cancelled = false;
    refreshNativeStatus();

    if (!currentUserRef.current) {
      nativeRecoverSavedProfile().then((recovered) => {
        if (cancelled || !recovered || currentUserRef.current) return;
        saveLoggedInSession(recovered);
        const prefs = loadNotifPrefs(recovered.id);
        setNotifPrefs(prefs);
        setCurrentUser(recovered);
      });
    }

    const onVisibilityOrFocus = () => {
      if (!document.hidden) {
        refreshNativeStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [refreshNativeStatus]);

  // Keep native Android foreground service & push subscription synced whenever logged in
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const syncDeviceNotifications = async () => {
      const prefs = loadNotifPrefs(currentUser.id);
      setNotifPrefs(prefs);

      if (isNativeAndroid()) {
        await nativeSyncLoggedInSession(currentUser, prefs);
        let status = await refreshNativeStatus();
        if (
          !cancelled &&
          (prefs.messages || prefs.calls) &&
          status &&
          status.permission === 'prompt' &&
          autoRequestedNotifForRef.current !== currentUser.id
        ) {
          autoRequestedNotifForRef.current = currentUser.id;
          await requestSystemNotificationPermission();
          status = await refreshNativeStatus();
          if (status?.permission === 'granted') {
            await nativeSyncLoggedInSession(currentUser, prefs);
          }
        }
      } else if (prefs.messages || prefs.calls) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          registerPushSubscription(currentUser);
        }
      }
    };

    syncDeviceNotifications();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, refreshNativeStatus]);

  // Keep Android native layer aware of active tab & open conversation (suppresses & clears active chat notifications)
  useEffect(() => {
    if (!isNativeAndroid()) return;
    const convoKey =
      currentUser && activeTab === 'chats' && activeConvo
        ? `${activeConvo.kind}:${activeConvo.id}`
        : '';
    nativeSetActiveScreen(activeTab, convoKey);
    if (convoKey) {
      nativeClearConversationNotification(convoKey);
    }
  }, [currentUser?.id, activeTab, activeConvo]);

  // Unified handler for notification taps & call actions (both Android Native & Web ServiceWorker)
  const handleExternalNotificationAction = useCallback(
    (payload: NativeNotificationActionEvent) => {
      if (payload.type === 'open-conversation' && payload.target) {
        const idx = payload.target.indexOf(':');
        if (idx > 0) {
          const kind = payload.target.slice(0, idx);
          const id = payload.target.slice(idx + 1);
          if ((kind === 'dm' || kind === 'group') && id) {
            if (currentUserRef.current) {
              setActiveTab('chats');
              setActiveConvo({kind, id});
              nativeClearConversationNotification(`${kind}:${id}`);
            } else {
              pendingDeepLinkRef.current = {type: 'convo', kind, id};
            }
          }
        }
        return;
      }

      if (payload.type === 'call-action' && payload.callId) {
        const callId = payload.callId;
        const action = payload.action || 'open';
        nativeClearCallNotification(callId);

        if (action === 'decline') {
          set(ref(db, `calls/${callId}/status`), 'declined').catch(() => {});
          return;
        }

        if (action === 'answer') {
          if (rtcRef.current && rtcRef.current.callId === callId && rtcRef.current.ringing) {
            acceptIncomingCallRef.current();
          } else {
            pendingAutoAnswerCallIdRef.current = callId;
          }
        }
      }
    },
    [],
  );

  // Deep link hash, Web ServiceWorker messages, & Native Android notification actions
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const openMatch = hash.match(/open=(dm|group):([^&]+)/);
      if (openMatch) {
        handleExternalNotificationAction({
          type: 'open-conversation',
          target: `${openMatch[1]}:${decodeURIComponent(openMatch[2])}`,
        });
      }
      const callMatch = hash.match(/call=([^&]+)/);
      if (callMatch) {
        const actionMatch = hash.match(/action=([^&]+)/);
        handleExternalNotificationAction({
          type: 'call-action',
          callId: decodeURIComponent(callMatch[1]),
          action: (actionMatch ? decodeURIComponent(actionMatch[1]) : 'open') as
            | 'open'
            | 'answer'
            | 'decline',
        });
      }
    } catch {
      // ignore
    }

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === 'open-conversation' && data.target) {
        handleExternalNotificationAction({
          type: 'open-conversation',
          target: String(data.target),
        });
      } else if (data.type === 'call-action' && data.callId) {
        handleExternalNotificationAction({
          type: 'call-action',
          callId: String(data.callId),
          action: (data.action || 'open') as 'open' | 'answer' | 'decline',
        });
      }
    };

    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    let removeNativeListener: (() => void) | null = null;
    nativeAddNotificationActionListener(handleExternalNotificationAction).then((cleanup) => {
      removeNativeListener = cleanup;
    });

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      removeNativeListener?.();
    };
  }, [handleExternalNotificationAction]);

  // Track Firebase RTDB online connection state
  useEffect(() => {
    const connRef = ref(db, '.info/connected');
    return onValue(connRef, (snap) => {
      fbConnectedRef.current = !!snap.val();
    });
  }, []);

  // Profiles listener — keeps persistent logged-in profile fresh, never logs out offline
  useEffect(() => {
    const profilesDbRef = ref(db, 'profiles');
    return onValue(profilesDbRef, (snapshot) => {
      const val = snapshot.val() as Record<string, Profile> | null;
      const list = val ? Object.values(val) : [];
      setProfiles(list);

      const active = currentUserRef.current;
      if (!active) return;

      const updated = list.find((p) => p.id === active.id);
      if (updated) {
        setCurrentUser(updated);
        saveLoggedInSession(updated);
        if (updated.name !== active.name && isNativeAndroid()) {
          nativeSyncLoggedInSession(updated, notifPrefsRef.current);
        }
      } else if (fbConnectedRef.current && navigator.onLine) {
        get(ref(db, `profiles/${active.id}`))
          .then((profileSnap) => {
            if (!profileSnap.exists() && currentUserRef.current?.id === active.id) {
              clearSavedSession();
              nativeLogout();
              updateAppBadge(0);
              setCurrentUser(null);
              setActiveConvo(null);
              pushToast({
                title: 'Signed out',
                body: 'That profile was removed from the database.',
                kind: 'system',
              });
            }
          })
          .catch(() => {
            // Keep session intact on network error
          });
      }
    });
  }, [pushToast]);

  // Load userData when logged into a profile
  useEffect(() => {
    if (!currentUser) {
      setUserData({files: [], photos: [], videos: [], notes: []});
      return;
    }
    const userRef = ref(db, `userData/${currentUser.id}`);
    return onValue(userRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Partial<Record<VaultCategory, Record<string, Omit<VaultItem, 'id'>>>>;
      const toList = (obj?: Record<string, Omit<VaultItem, 'id'>>): VaultItem[] =>
        obj ? Object.entries(obj).map(([id, v]) => ({id, ...v})) : [];
      setUserData({
        files: toList(data.files),
        photos: toList(data.photos),
        videos: toList(data.videos),
        notes: toList(data.notes),
      });
    });
  }, [currentUser?.id]);

  // Helper to check if user is currently reading a given conversation in foreground
  const isReadingConversation = useCallback((kind: 'dm' | 'group', id: string) => {
    return (
      !document.hidden &&
      activeTabRef.current === 'chats' &&
      activeConvoRef.current?.kind === kind &&
      activeConvoRef.current?.id === id
    );
  }, []);

  // Notify for every individual incoming message
  const triggerMessageNotification = useCallback(
    (params: {
      kind: 'dm' | 'group';
      convoId: string;
      msgId: string;
      senderId: string;
      senderName: string;
      text: string;
      groupName?: string;
    }) => {
      const prefs = notifPrefsRef.current;
      if (!prefs.messages) return;
      if (isReadingConversation(params.kind, params.convoId)) return;

      const sender = profilesRefState.current.find((p) => p.id === params.senderId);
      const title =
        params.kind === 'group'
          ? `${params.groupName || 'Group'} · ${sender?.name || params.senderName}`
          : sender?.name || params.senderName;
      const body = params.text || 'New message';

      pushToast({
        title,
        body,
        kind: 'message',
        avatarUrl: sender?.photo || undefined,
        avatarInitials: getInitials(sender?.name || params.senderName),
        onClick: () => {
          setActiveTab('chats');
          setActiveConvo({kind: params.kind, id: params.convoId});
        },
      });

      const nativeHandlesAlert =
        isNativeAndroid() && nativeNotifStatusRef.current?.permission === 'granted';

      if (!nativeHandlesAlert) {
        playMessageChime(prefs.sound);
        vibrateAlert(prefs.vibrate, [55, 45, 55]);
        showSystemNotification({
          title,
          body,
          tag: `bp-msg-${params.msgId}`,
          target: `${params.kind}:${params.convoId}`,
          isCall: false,
        });
      }
    },
    [isReadingConversation, pushToast],
  );

  // Chats & Groups listeners with per-message notification tracking
  useEffect(() => {
    if (!currentUser) {
      setChatsData({});
      setGroupsData({});
      baselineChatsLoadedRef.current = false;
      baselineGroupsLoadedRef.current = false;
      seenMessageKeysRef.current.clear();
      return;
    }

    const myId = currentUser.id;
    const unsubChats = onValue(ref(db, 'chats'), (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, DirectChat>;
      setChatsData(val);

      if (!baselineChatsLoadedRef.current) {
        Object.entries(val).forEach(([chatId, chat]) => {
          if (!isMyChat(chatId, chat, myId)) return;
          mapMessages(chat?.messages).forEach((m) => seenMessageKeysRef.current.add(`dm:${chatId}:${m.id}`));
        });
        baselineChatsLoadedRef.current = true;
        return;
      }

      Object.entries(val).forEach(([chatId, chat]) => {
        if (!isMyChat(chatId, chat, myId)) return;
        mapMessages(chat?.messages).forEach((m) => {
          const key = `dm:${chatId}:${m.id}`;
          if (seenMessageKeysRef.current.has(key)) return;
          seenMessageKeysRef.current.add(key);
          if (m.senderId && m.senderId !== myId) {
            triggerMessageNotification({
              kind: 'dm',
              convoId: chatId,
              msgId: m.id,
              senderId: m.senderId,
              senderName: m.senderName || 'Message',
              text: m.text,
            });
          }
        });
      });
    });

    const unsubGroups = onValue(ref(db, 'groups'), (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, GroupChat>;
      setGroupsData(val);

      if (!baselineGroupsLoadedRef.current) {
        Object.entries(val).forEach(([groupId, g]) => {
          if (!isMyGroup(g, myId)) return;
          mapMessages(g?.messages).forEach((m) => seenMessageKeysRef.current.add(`group:${groupId}:${m.id}`));
        });
        baselineGroupsLoadedRef.current = true;
        return;
      }

      Object.entries(val).forEach(([groupId, g]) => {
        if (!isMyGroup(g, myId)) return;
        mapMessages(g?.messages).forEach((m) => {
          const key = `group:${groupId}:${m.id}`;
          if (seenMessageKeysRef.current.has(key)) return;
          seenMessageKeysRef.current.add(key);
          if (m.senderId && m.senderId !== myId) {
            triggerMessageNotification({
              kind: 'group',
              convoId: groupId,
              msgId: m.id,
              senderId: m.senderId,
              senderName: m.senderName || 'Member',
              text: m.text,
              groupName: g.name,
            });
          }
        });
      });
    });

    return () => {
      unsubChats();
      unsubGroups();
    };
  }, [currentUser?.id, triggerMessageNotification]);

  // Apply deep link once logged in
  useEffect(() => {
    if (!currentUser || !pendingDeepLinkRef.current) return;
    const link = pendingDeepLinkRef.current;
    pendingDeepLinkRef.current = null;
    setActiveTab('chats');
    setActiveConvo({kind: link.kind, id: link.id});
  }, [currentUser?.id]);

  /* ============================================================
     WEBRTC VOICE & VIDEO CALLS + CALL NOTIFICATIONS
     ============================================================ */
  const syncCallUI = useCallback((overrides?: Partial<ActiveCallSession>) => {
    const c = rtcRef.current;
    if (!c) {
      setActiveCallUI(null);
      return;
    }
    setActiveCallUI((prev) => ({
      callId: c.callId,
      peerId: c.peerId,
      peerName: c.peerName,
      isVideo: c.isVideo,
      isCaller: c.isCaller,
      ringing: c.ringing,
      answered: c.answered,
      muted: c.muted,
      camOff: c.camOff,
      statusText: overrides?.statusText ?? prev?.statusText ?? 'Calling…',
      subText: overrides?.subText ?? prev?.subText ?? '',
      localStream: c.localStream,
      remoteStream: c.remoteStream,
    }));
  }, []);

  const endActiveCall = useCallback((notifyRemote: boolean) => {
    const c = rtcRef.current;
    stopCallRingtone();
    if (!c) {
      setActiveCallUI(null);
      return;
    }
    nativeClearCallNotification(c.callId);
    if (c.ringTimeout) window.clearTimeout(c.ringTimeout);
    if (c.durationTimer) window.clearInterval(c.durationTimer);

    if (notifyRemote && c.callId) {
      set(ref(db, `calls/${c.callId}/status`), 'ended').catch(() => {});
      window.setTimeout(() => {
        remove(ref(db, `calls/${c.callId}`)).catch(() => {});
      }, 1500);
    }

    try {
      c.localStream?.getTracks().forEach((t) => t.stop());
      if (c.pc) {
        c.pc.onconnectionstatechange = null;
        c.pc.onicecandidate = null;
        c.pc.ontrack = null;
        c.pc.close();
      }
    } catch {
      // ignore
    }

    rtcRef.current = null;
    setActiveCallUI(null);
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      const c = rtcRef.current;
      if (!e.candidate || !c) return;
      const path = c.isCaller ? `calls/${c.callId}/callerCandidates` : `calls/${c.callId}/calleeCandidates`;
      push(ref(db, path), e.candidate.toJSON ? e.candidate.toJSON() : e.candidate).catch(() => {});
    };
    pc.ontrack = (e) => {
      const c = rtcRef.current;
      if (!c) return;
      if (e.streams?.[0]) {
        c.remoteStream = e.streams[0];
        syncCallUI();
      }
    };
    pc.onconnectionstatechange = () => {
      const c = rtcRef.current;
      if (!c) return;
      if (pc.connectionState === 'connected') {
        stopCallRingtone();
        c.answered = true;
        c.ringing = false;
        if (!c.durationTimer) {
          c.connectedAt = Date.now();
          c.durationTimer = window.setInterval(() => {
            const cur = rtcRef.current;
            if (!cur) return;
            const s = Math.floor((Date.now() - cur.connectedAt) / 1000);
            const mm = String(Math.floor(s / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            syncCallUI({statusText: `${mm}:${ss}`, subText: 'Connected'});
          }, 1000);
        }
        syncCallUI({statusText: '00:00', subText: 'Connected'});
      } else if (pc.connectionState === 'failed') {
        endActiveCall(true);
      }
    };
    return pc;
  }, [endActiveCall, syncCallUI]);

  const flushCandidates = useCallback(() => {
    const c = rtcRef.current;
    if (!c || !c.pc || !c.remoteSet) return;
    while (c.candidateQueue.length > 0) {
      const cand = c.candidateQueue.shift();
      if (cand) c.pc.addIceCandidate(cand).catch(() => {});
    }
  }, []);

  const addCandidatesFrom = useCallback(
    (obj?: Record<string, RTCIceCandidateInit>) => {
      const c = rtcRef.current;
      if (!c || !obj) return;
      Object.entries(obj).forEach(([key, cand]) => {
        if (c.addedCandidateKeys.has(key) || !cand) return;
        c.addedCandidateKeys.add(key);
        if (c.pc && c.remoteSet) {
          c.pc.addIceCandidate(cand).catch(() => {});
        } else {
          c.candidateQueue.push(cand);
        }
      });
    },
    [],
  );

  const startCallWithProfile = useCallback(
    async (partnerId: string, video: boolean) => {
      const me = currentUserRef.current;
      if (!me || rtcRef.current) return;
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        pushToast({
          title: 'Calls unavailable',
          body: 'Voice and video calls require microphone/camera permissions.',
          kind: 'system',
        });
        return;
      }
      const partner = profilesRefState.current.find((p) => p.id === partnerId);
      if (!partner) return;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: video ? {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}} : false,
        });
      } catch {
        pushToast({
          title: `${video ? 'Camera' : 'Microphone'} blocked`,
          body: 'Please allow media access in your device settings to call.',
          kind: 'system',
        });
        return;
      }

      const newCallRef = push(ref(db, 'calls'));
      const callId = newCallRef.key;
      if (!callId) return;
      const now = Date.now();

      rtcRef.current = {
        callId,
        peerId: partnerId,
        peerName: partner.name,
        isVideo: video,
        isCaller: true,
        ringing: false,
        answered: false,
        muted: false,
        camOff: false,
        pc: null,
        localStream: stream,
        remoteStream: null,
        remoteSet: false,
        acceptedSeen: false,
        endedHandled: false,
        addedCandidateKeys: new Set(),
        candidateQueue: [],
        ringTimeout: null,
        durationTimer: null,
        connectedAt: 0,
      };

      setCallHistory((prev) => [
        {
          id: callId,
          peerId: partnerId,
          peerName: partner.name,
          direction: 'outgoing',
          video,
          status: 'ringing',
          timestamp: now,
        },
        ...prev.slice(0, 29),
      ]);

      await set(newCallRef, {
        callerId: me.id,
        callerName: me.name,
        calleeId: partnerId,
        calleeName: partner.name,
        video,
        status: 'ringing',
        createdAt: now,
      });

      syncCallUI({statusText: 'Calling…', subText: video ? 'Video call' : 'Ringing'});

      try {
        const pc = createPeerConnection();
        rtcRef.current.pc = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await set(ref(db, `calls/${callId}/offer`), {type: offer.type, sdp: offer.sdp});
      } catch {
        endActiveCall(true);
        return;
      }

      if (rtcRef.current) {
        rtcRef.current.ringTimeout = window.setTimeout(() => {
          if (rtcRef.current && rtcRef.current.isCaller && !rtcRef.current.answered) {
            endActiveCall(true);
          }
        }, 45000);
      }
    },
    [createPeerConnection, endActiveCall, pushToast, syncCallUI],
  );

  const acceptIncomingCall = useCallback(async () => {
    const c = rtcRef.current;
    if (!c || c.isCaller) return;
    const callId = c.callId;
    nativeClearCallNotification(callId);

    let call: CallSignalData | null = null;
    try {
      const snap = await get(ref(db, `calls/${callId}`));
      call = snap.val() as CallSignalData | null;
    } catch {
      endActiveCall(true);
      return;
    }
    if (!call || !call.offer) {
      endActiveCall(true);
      return;
    }

    const isVideo = !!call.video;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}} : false,
      });
    } catch {
      set(ref(db, `calls/${callId}/status`), 'declined').catch(() => {});
      endActiveCall(true);
      pushToast({
        title: `${isVideo ? 'Camera' : 'Microphone'} blocked`,
        body: 'Permission is needed to answer this call.',
        kind: 'system',
      });
      return;
    }

    c.localStream = stream;
    c.isVideo = isVideo;
    c.ringing = false;
    c.answered = true;
    stopCallRingtone();

    setCallHistory((prev) =>
      prev.map((item) => (item.id === callId ? {...item, status: 'answered'} : item)),
    );

    try {
      const pc = createPeerConnection();
      c.pc = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(call.offer);
      c.remoteSet = true;
      addCandidatesFrom(call.callerCandidates);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await set(ref(db, `calls/${callId}/answer`), {type: answer.type, sdp: answer.sdp});
      await set(ref(db, `calls/${callId}/status`), 'accepted');
      flushCandidates();
      syncCallUI({statusText: 'Connecting…', subText: 'Connected'});
    } catch {
      endActiveCall(true);
    }
  }, [addCandidatesFrom, createPeerConnection, endActiveCall, flushCandidates, pushToast, syncCallUI]);

  acceptIncomingCallRef.current = acceptIncomingCall;

  const declineIncomingCall = useCallback(async () => {
    const c = rtcRef.current;
    if (!c) return;
    const callId = c.callId;
    nativeClearCallNotification(callId);
    setCallHistory((prev) =>
      prev.map((item) => (item.id === callId ? {...item, status: 'declined'} : item)),
    );
    await set(ref(db, `calls/${callId}/status`), 'declined').catch(() => {});
    endActiveCall(true);
  }, [endActiveCall]);

  // Real-time Calls Listener (signals + call notifications)
  useEffect(() => {
    if (!currentUser) {
      endActiveCall(true);
      seenIncomingCallsRef.current.clear();
      return;
    }

    const myId = currentUser.id;
    const callsDbRef = ref(db, 'calls');

    const handleSignal = (callId: string, call: CallSignalData | null) => {
      if (!call) return;
      const iAmCaller = call.callerId === myId;
      const iAmCallee = call.calleeId === myId;
      if (!iAmCaller && !iAmCallee) return;

      if (iAmCallee && (!rtcRef.current || rtcRef.current.callId !== callId)) {
        if (call.status === 'ringing') {
          if (Date.now() - (call.createdAt || 0) > 120000) return;
          if (rtcRef.current && rtcRef.current.callId !== callId) {
            set(ref(db, `calls/${callId}/status`), 'busy').catch(() => {});
            return;
          }

          const caller = profilesRefState.current.find((p) => p.id === call.callerId);
          const callerName = caller?.name || call.callerName || 'Unknown';
          const isVideo = !!call.video;

          rtcRef.current = {
            callId,
            peerId: call.callerId,
            peerName: callerName,
            isVideo,
            isCaller: false,
            ringing: true,
            answered: false,
            muted: false,
            camOff: false,
            pc: null,
            localStream: null,
            remoteStream: null,
            remoteSet: false,
            acceptedSeen: false,
            endedHandled: false,
            addedCandidateKeys: new Set(),
            candidateQueue: [],
            ringTimeout: null,
            durationTimer: null,
            connectedAt: 0,
          };

          if (!seenIncomingCallsRef.current.has(callId)) {
            seenIncomingCallsRef.current.add(callId);
            setCallHistory((prev) => [
              {
                id: callId,
                peerId: call.callerId,
                peerName: callerName,
                direction: 'incoming',
                video: isVideo,
                status: 'ringing',
                timestamp: Date.now(),
              },
              ...prev.slice(0, 29),
            ]);

            const prefs = notifPrefsRef.current;
            if (prefs.calls) {
              const nativeBackgroundRinging = isNativeAndroid() && document.hidden;
              if (!nativeBackgroundRinging) {
                startCallRingtone(prefs.sound);
                vibrateAlert(prefs.vibrate, [350, 150, 350, 150, 350]);
              }
              pushToast({
                title: isVideo ? 'Incoming video call' : 'Incoming voice call',
                body: `${callerName} is calling you`,
                kind: 'call',
                avatarUrl: caller?.photo || undefined,
                avatarInitials: getInitials(callerName),
              });
              showSystemNotification({
                title: isVideo ? `Incoming Video Call · ${callerName}` : `Incoming Call · ${callerName}`,
                body: 'Tap to answer or decline',
                tag: `bp-call-${callId}`,
                callId,
                isCall: true,
              });
            }
          }

          syncCallUI({
            statusText: isVideo ? 'Incoming video call' : 'Incoming voice call',
            subText: 'Ringing…',
          });

          rtcRef.current.ringTimeout = window.setTimeout(() => {
            if (rtcRef.current && rtcRef.current.callId === callId && rtcRef.current.ringing) {
              endActiveCall(true);
            }
          }, 60000);

          if (pendingAutoAnswerCallIdRef.current === callId && call.offer) {
            pendingAutoAnswerCallIdRef.current = null;
            window.setTimeout(() => acceptIncomingCallRef.current(), 80);
          }
        }
        return;
      }

      if (!rtcRef.current || rtcRef.current.callId !== callId) return;
      const c = rtcRef.current;

      if (iAmCallee && c.ringing && !c.answered && pendingAutoAnswerCallIdRef.current === callId && call.offer) {
        pendingAutoAnswerCallIdRef.current = null;
        window.setTimeout(() => acceptIncomingCallRef.current(), 50);
      }

      if (call.status === 'ended' || call.status === 'declined' || call.status === 'busy') {
        if (iAmCallee && c.ringing && !c.answered) {
          setCallHistory((prev) =>
            prev.map((item) => (item.id === callId ? {...item, status: 'missed'} : item)),
          );
          if (notifPrefsRef.current.calls) {
            pushToast({
              title: 'Missed call',
              body: `You missed a ${c.isVideo ? 'video' : 'voice'} call from ${c.peerName}`,
              kind: 'call',
              onClick: () => setActiveTab('calls'),
            });
            showSystemNotification({
              title: `Missed ${c.isVideo ? 'video' : 'voice'} call`,
              body: `From ${c.peerName}`,
              tag: `bp-missed-${callId}`,
              isCall: false,
            });
          }
        }
        if (!c.endedHandled) {
          c.endedHandled = true;
          endActiveCall(false);
        }
        return;
      }

      if (iAmCaller) {
        if (call.status === 'accepted' && !c.acceptedSeen) {
          c.acceptedSeen = true;
          c.answered = true;
          syncCallUI({statusText: 'Connecting…', subText: 'Connecting'});
        }
        if (call.answer && c.pc && !c.remoteSet) {
          c.pc
            .setRemoteDescription(call.answer)
            .then(() => {
              c.remoteSet = true;
              flushCandidates();
            })
            .catch(() => {});
        }
        addCandidatesFrom(call.calleeCandidates);
      } else {
        addCandidatesFrom(call.callerCandidates);
      }
    };

    const unsubAdd = onChildAdded(callsDbRef, (snap) => handleSignal(snap.key || '', snap.val()));
    const unsubChange = onChildChanged(callsDbRef, (snap) => handleSignal(snap.key || '', snap.val()));
    const unsubRemove = onChildRemoved(callsDbRef, (snap) => {
      if (rtcRef.current && rtcRef.current.callId === snap.key) {
        endActiveCall(false);
      }
    });

    return () => {
      unsubAdd();
      unsubChange();
      unsubRemove();
    };
  }, [currentUser?.id, addCandidatesFrom, endActiveCall, flushCandidates, pushToast, syncCallUI]);

  // Persistent login handler — stays signed in on this device until explicit Log Out
  const handleUnlockProfile = async (profile: Profile) => {
    unlockNotificationAudio();
    saveLoggedInSession(profile);
    const prefs = loadNotifPrefs(profile.id);
    setNotifPrefs(prefs);
    setCurrentUser(profile);
    setActiveTab('chats');
    setActiveConvo(null);

    if (isNativeAndroid()) {
      await nativeSyncLoggedInSession(profile, prefs);
      if (prefs.messages || prefs.calls) {
        autoRequestedNotifForRef.current = profile.id;
        await requestSystemNotificationPermission();
        await refreshNativeStatus();
        await nativeSyncLoggedInSession(profile, prefs);
      }
    } else if (prefs.messages || prefs.calls) {
      const perm = await requestSystemNotificationPermission();
      if (perm === 'granted') {
        registerPushSubscription(profile);
      }
    }
  };

  // Explicit Log Out handler — clears saved session & stops phone background notifications
  const handleLogout = useCallback(async () => {
    setProfileMenuOpen(false);
    endActiveCall(true);
    clearSavedSession();
    await nativeLogout();
    updateAppBadge(0);
    autoRequestedNotifForRef.current = null;
    baselineChatsLoadedRef.current = false;
    baselineGroupsLoadedRef.current = false;
    seenMessageKeysRef.current.clear();
    seenIncomingCallsRef.current.clear();
    setCallHistory([]);
    setActiveConvo(null);
    setActiveTab('chats');
    setCurrentUser(null);
    pushToast({
      title: 'Logged out',
      body: 'Sign in to any profile to resume messages and notifications.',
      kind: 'system',
    });
  }, [endActiveCall, pushToast]);

  // Computed counts for header counter, badges & title
  const totalVaultItems =
    userData.files.length +
    userData.photos.length +
    userData.videos.length +
    userData.notes.length;

  const {unreadCount} = useMemo(() => {
    if (!currentUser) return {unreadCount: 0};
    let unread = 0;
    Object.entries(chatsData).forEach(([id, chat]) => {
      if (!isMyChat(id, chat, currentUser.id)) return;
      const myRead = chat?.reads?.[currentUser.id] || 0;
      unread += mapMessages(chat?.messages).filter(
        (m) => m.senderId !== currentUser.id && (m.createdAt || 0) > myRead,
      ).length;
    });
    Object.entries(groupsData).forEach(([, g]) => {
      if (!isMyGroup(g, currentUser.id)) return;
      const myRead = g?.reads?.[currentUser.id] || 0;
      unread += mapMessages(g?.messages).filter(
        (m) => m.senderId !== currentUser.id && (m.createdAt || 0) > myRead,
      ).length;
    });
    return {unreadCount: unread};
  }, [chatsData, groupsData, currentUser]);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) Beyond Profiles` : 'Beyond Profiles';
    updateAppBadge(unreadCount);
  }, [unreadCount]);

  const handleChangePrefs = (next: NotificationPrefs) => {
    if (!currentUser) return;
    setNotifPrefs(next);
    saveNotifPrefs(currentUser.id, next);
    nativeUpdateNotificationPrefs(next);
  };

  const handleToggleAllNotifications = async () => {
    if (!currentUser) return;
    unlockNotificationAudio();
    const currentlyOn = notifPrefs.messages || notifPrefs.calls;
    const next: NotificationPrefs = {
      ...notifPrefs,
      messages: !currentlyOn,
      calls: !currentlyOn,
    };
    handleChangePrefs(next);

    if (!currentlyOn) {
      const perm = await requestSystemNotificationPermission();
      await refreshNativeStatus();
      if (isNativeAndroid()) {
        await nativeSyncLoggedInSession(currentUser, next);
      } else if (perm === 'granted') {
        registerPushSubscription(currentUser);
      }
      pushToast({
        title: 'Notifications enabled',
        body: 'Your phone will alert you for every message and call.',
        kind: 'system',
      });
    } else {
      pushToast({
        title: 'Notifications paused',
        body: 'Message and call alerts are turned off.',
        kind: 'system',
      });
    }
  };

  const openVaultCategory = useCallback((cat: VaultCategory) => {
    setVaultInitialCat(cat);
    setActiveTab('vault');
  }, []);

  const notificationsActive = notifPrefs.messages || notifPrefs.calls;
  const activeCallPeerProfile = activeCallUI
    ? profiles.find((p) => p.id === activeCallUI.peerId) || null
    : null;
  const mobileInActiveChat = activeTab === 'chats' && !!activeConvo;

  return (
    <div className="h-full flex flex-col bg-[#181615] text-[#F3EFEA] overflow-hidden">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <OfflineIndicator />

      {!currentUser ? (
        <div className="flex-1 overflow-y-auto custom-scroll warm-ambient-bg">
          <ProfilesView profiles={profiles} onUnlock={handleUnlockProfile} />
        </div>
      ) : (
        <>
          {/* Compact Top Header Bar (visible always on desktop >= 768px; hidden on mobile inside Active Chat for full-screen chat view) */}
          <header
            className={`${
              mobileInActiveChat ? 'hidden md:flex' : 'flex'
            } h-14 pt-safe px-3 sm:px-5 border-b border-[#FFEBD7]/[0.08] bg-[#1E1B1A]/95 backdrop-blur-md items-center justify-between gap-3 shrink-0 z-30`}
          >
            {/* Left: < Beyond Profiles brand / back control */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (activeTab !== 'chats') {
                    setActiveTab('chats');
                  } else if (activeConvo) {
                    setActiveConvo(null);
                  }
                }}
                className="flex items-center gap-1.5 min-h-[40px] pr-2 rounded-xl hover:bg-[#FFEBD7]/[0.05] transition-colors group"
              >
                <ChevronLeft className="w-4 h-4 text-[#A39B93] group-hover:text-[#F3EFEA] transition-colors shrink-0" />
                <span className="font-display text-[15px] sm:text-base font-bold tracking-tight text-[#F3EFEA] whitespace-nowrap">
                  Beyond Profiles
                </span>
              </button>

              {/* Compact Desktop Workspace Switcher */}
              <nav className="hidden md:flex items-center gap-1 ml-2 pl-3 border-l border-[#FFEBD7]/[0.08]">
                {(
                  [
                    {id: 'chats', label: 'Workspace'},
                    {id: 'vault', label: 'Vault'},
                    {id: 'calls', label: 'Calls'},
                  ] as const
                ).map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                        active
                          ? 'bg-[#2A2420] text-[#F3EFEA] border border-[#D98A4E]/35 shadow-sm'
                          : 'text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.04] border border-transparent'
                      }`}
                    >
                      {item.label}
                      {item.id === 'chats' && unreadCount > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#C97A57] text-[#181615] text-[10px] font-bold tabular-nums">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: Global Search, Notifications, Item Counter, User Profile Dropdown */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="hidden xl:block">
                <PWAInstallButton variant="compact" />
              </div>

              {/* Global Search Trigger */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="Global search (Ctrl+K)"
                aria-label="Global search"
                className="min-h-[40px] min-w-[40px] sm:px-3 rounded-xl bg-[#24201E] hover:bg-[#2C2724] border border-[#FFEBD7]/[0.08] text-[#A39B93] hover:text-[#F3EFEA] flex items-center justify-center gap-2 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="hidden lg:inline text-xs">Search</span>
              </button>

              {/* Notifications Toggle */}
              <button
                type="button"
                onClick={handleToggleAllNotifications}
                title={notificationsActive ? 'Notifications on' : 'Notifications off'}
                aria-label="Toggle message and call notifications"
                className={`relative min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-colors ${
                  notificationsActive
                    ? 'text-[#86A389] bg-[#5A6E5C]/20 border-[#86A389]/30 hover:bg-[#5A6E5C]/30'
                    : 'text-[#A39B93] bg-[#24201E] border-[#FFEBD7]/[0.08] hover:text-[#F3EFEA]'
                }`}
              >
                {notificationsActive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#C97A57]" />
                )}
              </button>

              {/* Cloud Item Counter */}
              <button
                type="button"
                onClick={() => openVaultCategory('files')}
                title="Stored items in your cloud vault"
                className="hidden sm:inline-flex min-h-[40px] px-3 rounded-xl bg-[#24201E] hover:bg-[#2C2724] border border-[#FFEBD7]/[0.08] text-xs font-medium text-[#A39B93] hover:text-[#F3EFEA] items-center gap-1.5 tabular-nums transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-[#D98A4E]" />
                <span>
                  {totalVaultItems} {totalVaultItems === 1 ? 'item' : 'items'}
                </span>
              </button>

              {/* User Profile Dropdown */}
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  aria-label="Profile menu"
                  className="flex items-center gap-2 min-h-[40px] pl-1.5 pr-2.5 rounded-xl bg-[#24201E] hover:bg-[#2C2724] border border-[#FFEBD7]/[0.08] transition-colors"
                >
                  <ProfileAvatar
                    profile={currentUser}
                    sizeClass="w-7 h-7"
                    roundedClass="rounded-full"
                    textClass="text-[11px] font-semibold"
                    showOnlineDot
                    dotBorderClass="border-[#24201E]"
                  />
                  <span className="hidden lg:inline text-xs font-medium text-[#F3EFEA] max-w-[96px] truncate">
                    {currentUser.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A39B93] hidden sm:inline" />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#24201E] border border-[#FFEBD7]/12 shadow-2xl p-1.5 z-50 animate-view-in">
                    <div className="px-3 py-2.5 border-b border-[#FFEBD7]/[0.08] mb-1">
                      <p className="text-sm font-semibold text-[#F3EFEA] truncate">{currentUser.name}</p>
                      <p className="text-[11px] text-[#86A389] mt-0.5">
                        Signed in · {totalVaultItems} vault items
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setActiveTab('chats');
                      }}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-[#F3EFEA] hover:bg-[#2E2926] flex items-center gap-2.5 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4 text-[#86A389]" />
                      <span>Workspace &amp; Chats</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        openVaultCategory('files');
                      }}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-[#F3EFEA] hover:bg-[#2E2926] flex items-center gap-2.5 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-[#D98A4E]" />
                      <span>Cloud Vault ({totalVaultItems})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setActiveTab('calls');
                      }}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-[#F3EFEA] hover:bg-[#2E2926] flex items-center gap-2.5 transition-colors"
                    >
                      <Phone className="w-4 h-4 text-[#B89748]" />
                      <span>Voice &amp; Video Calls</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setActiveTab('settings');
                      }}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-[#F3EFEA] hover:bg-[#2E2926] flex items-center gap-2.5 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-[#A39B93]" />
                      <span>Notifications &amp; Settings</span>
                    </button>
                    <div className="my-1 border-t border-[#FFEBD7]/[0.08]" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium text-[#DF9878] hover:bg-[#9E5A3C]/20 flex items-center gap-2.5 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out / Switch Profile</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main
            className={`flex-1 min-h-0 ${
              activeTab === 'chats' ? 'overflow-hidden' : 'overflow-y-auto custom-scroll warm-ambient-bg'
            }`}
          >
            {activeTab === 'chats' && (
              <WorkspaceView
                currentUser={currentUser}
                profiles={profiles}
                userData={userData}
                chatsData={chatsData}
                groupsData={groupsData}
                activeConvo={activeConvo}
                onSelectConvo={setActiveConvo}
                onStartCall={startCallWithProfile}
                onOpenVault={openVaultCategory}
                onOpenSettings={() => setActiveTab('settings')}
                onNotify={(title, body) => pushToast({title, body, kind: 'system'})}
              />
            )}

            {activeTab === 'vault' && (
              <VaultSection
                profileId={currentUser.id}
                userData={userData}
                initialCategory={vaultInitialCat}
                onNotify={(title, body) => pushToast({title, body, kind: 'system'})}
              />
            )}

            {activeTab === 'calls' && (
              <CallsView
                currentUser={currentUser}
                profiles={profiles}
                callHistory={callHistory}
                onStartCall={startCallWithProfile}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                currentUser={currentUser}
                prefs={notifPrefs}
                nativeStatus={nativeNotifStatus}
                onChangePrefs={handleChangePrefs}
                onEnablePush={async () => {
                  const perm = await requestSystemNotificationPermission();
                  const status = await refreshNativeStatus();
                  if (isNativeAndroid()) {
                    await nativeSyncLoggedInSession(currentUser, notifPrefs);
                    if (status?.permission === 'granted' || perm === 'granted') {
                      pushToast({
                        title: 'Phone notifications enabled',
                        body: 'WhatsApp-style alerts will appear even when the app is closed.',
                        kind: 'system',
                      });
                    } else {
                      pushToast({
                        title: 'Permission needed',
                        body: 'Enable Beyond Profiles notifications in Android settings.',
                        kind: 'system',
                      });
                      await nativeOpenNotificationSettings();
                    }
                  } else if (perm === 'granted') {
                    await registerPushSubscription(currentUser);
                    pushToast({
                      title: 'System notifications enabled',
                      body: 'Alerts will appear even when the app is in the background.',
                      kind: 'system',
                    });
                  } else {
                    pushToast({
                      title: 'Permission needed',
                      body: 'Enable notifications in your browser or phone settings.',
                      kind: 'system',
                    });
                  }
                }}
                onOpenNativeSettings={async () => {
                  await nativeOpenNotificationSettings();
                }}
                onRequestBatteryExemption={async () => {
                  await nativeRequestBatteryOptimizationExemption();
                  window.setTimeout(() => refreshNativeStatus(), 1000);
                }}
                onTestAlert={async () => {
                  if (isNativeAndroid()) {
                    const shown = await nativeShowTestNotification();
                    if (shown) {
                      pushToast({
                        title: 'Phone notification sent',
                        body: 'Check your phone status bar & notification shade.',
                        kind: 'message',
                      });
                    } else {
                      pushToast({
                        title: 'Allow notifications first',
                        body: 'Tap Allow Phone Notifications so Android can show alerts.',
                        kind: 'system',
                      });
                    }
                    return;
                  }
                  playMessageChime(notifPrefs.sound);
                  vibrateAlert(notifPrefs.vibrate, [60, 40, 60]);
                  pushToast({
                    title: 'Beyond Profiles Alert',
                    body: 'Message & call notifications are working!',
                    kind: 'message',
                  });
                  showSystemNotification({
                    title: 'Beyond Profiles Test Alert',
                    body: 'Notifications are active for every message and call.',
                    tag: `bp-test-${Date.now()}`,
                    isCall: false,
                  });
                }}
                onLogout={handleLogout}
              />
            )}
          </main>

          {/* Mobile Thumb-Zone Bottom Navigation Bar (hidden when inside an active chat so composer has full room) */}
          {!mobileInActiveChat && (
            <nav
              aria-label="Mobile navigation"
              className="md:hidden h-14 pb-safe bg-[#1E1B1A]/95 backdrop-blur-md border-t border-[#FFEBD7]/[0.08] grid grid-cols-4 items-center shrink-0 z-30"
            >
              {(
                [
                  {id: 'chats', label: 'Chats', icon: MessageSquare, badge: unreadCount},
                  {id: 'vault', label: 'Vault', icon: FolderOpen},
                  {id: 'calls', label: 'Calls', icon: Phone},
                  {id: 'settings', label: 'Settings', icon: Settings},
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`relative h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                      active ? 'text-[#D98A4E]' : 'text-[#A39B93] hover:text-[#F3EFEA]'
                    }`}
                  >
                    <div className="relative">
                      <Icon className="w-5 h-5" />
                      {'badge' in item && item.badge > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C97A57] text-[#181615] text-[10px] font-bold flex items-center justify-center tabular-nums">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Global Search Modal */}
          <GlobalSearchModal
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            currentUser={currentUser}
            profiles={profiles}
            groupsData={groupsData}
            userData={userData}
            onOpenConvo={(convo) => {
              setActiveTab('chats');
              setActiveConvo(convo);
            }}
            onOpenVault={openVaultCategory}
          />
        </>
      )}

      {/* Full-Screen Voice / Video Call Overlay */}
      <CallOverlay
        call={activeCallUI}
        peerProfile={activeCallPeerProfile}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
        onEnd={() => endActiveCall(true)}
        onToggleMute={() => {
          const c = rtcRef.current;
          if (!c || !c.localStream) return;
          c.muted = !c.muted;
          c.localStream.getAudioTracks().forEach((t) => {
            t.enabled = !c.muted;
          });
          syncCallUI();
        }}
        onToggleCam={() => {
          const c = rtcRef.current;
          if (!c || !c.localStream) return;
          c.camOff = !c.camOff;
          c.localStream.getVideoTracks().forEach((t) => {
            t.enabled = !c.camOff;
          });
          syncCallUI();
        }}
      />
    </div>
  );
}
