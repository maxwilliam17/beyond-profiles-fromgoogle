import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {onChildAdded, onChildChanged, onChildRemoved, onValue, push, ref, remove, set, get} from 'firebase/database';
import {
  Bell,
  BellOff,
  FolderOpen,
  Home,
  MessageSquare,
  Phone,
  Settings,
} from 'lucide-react';
import {db} from './lib/firebase';
import {
  getInitials,
  getPartnerIdFromChatId,
  isMyChat,
  isMyGroup,
  mapMessages,
} from './lib/helpers';
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
  vibrateAlert,
} from './lib/notifications';
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
import {HomeDashboard} from './components/HomeDashboard';
import {MessengerView} from './components/MessengerView';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {ProfilesView} from './components/ProfilesView';
import {SettingsView} from './components/SettingsView';
import {ToastStack} from './components/ToastStack';
import {VaultSection} from './components/VaultSection';

type AppTab = 'home' | 'vault' | 'chats' | 'calls' | 'settings';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [vaultInitialCat, setVaultInitialCat] = useState<VaultCategory>('files');

  const [userData, setUserData] = useState<UserData>({
    files: [],
    photos: [],
    videos: [],
    notes: [],
  });
  const [chatsData, setChatsData] = useState<Record<string, DirectChat>>({});
  const [groupsData, setGroupsData] = useState<Record<string, GroupChat>>({});
  const [activeConvo, setActiveConvo] = useState<ConversationRef | null>(null);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const [callHistory, setCallHistory] = useState<CallLogEntry[]>([]);
  const [activeCallUI, setActiveCallUI] = useState<ActiveCallSession | null>(null);

  // Refs for real-time callbacks & WebRTC state
  const currentUserRef = useRef<Profile | null>(null);
  const profilesRefState = useRef<Profile[]>([]);
  const notifPrefsRef = useRef<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const activeTabRef = useRef<AppTab>('home');
  const activeConvoRef = useRef<ConversationRef | null>(null);

  const baselineChatsLoadedRef = useRef(false);
  const baselineGroupsLoadedRef = useRef(false);
  const seenMessageKeysRef = useRef<Set<string>>(new Set());
  const pendingDeepLinkRef = useRef<{type: 'convo'; kind: 'dm' | 'group'; id: string} | null>(null);

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

  // Deep link & service worker messages
  useEffect(() => {
    try {
      const m = window.location.hash.match(/open=(dm|group):([^&]+)/);
      if (m) {
        pendingDeepLinkRef.current = {
          type: 'convo',
          kind: m[1] as 'dm' | 'group',
          id: decodeURIComponent(m[2]),
        };
      }
    } catch {
      // ignore
    }

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === 'open-conversation' && data.target) {
        const [kind, id] = String(data.target).split(':');
        if (kind === 'dm' || kind === 'group') {
          if (currentUserRef.current) {
            setActiveTab('chats');
            setActiveConvo({kind, id});
          } else {
            pendingDeepLinkRef.current = {type: 'convo', kind, id};
          }
        }
      }
    };

    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage);
  }, []);

  // Profiles listener
  useEffect(() => {
    const profilesDbRef = ref(db, 'profiles');
    return onValue(profilesDbRef, (snapshot) => {
      const val = snapshot.val() as Record<string, Profile> | null;
      const list = val ? Object.values(val) : [];
      setProfiles(list);
      if (currentUserRef.current) {
        const updated = list.find((p) => p.id === currentUserRef.current?.id);
        if (updated) setCurrentUser(updated);
      }
    });
  }, []);

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

      playMessageChime(prefs.sound);
      vibrateAlert(prefs.vibrate, [55, 45, 55]);

      showSystemNotification({
        title,
        body,
        tag: `bp-msg-${params.msgId}`,
        target: `${params.kind}:${params.convoId}`,
        isCall: false,
      });
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
          body: 'Please allow media access in your browser to call.',
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

  const declineIncomingCall = useCallback(async () => {
    const c = rtcRef.current;
    if (!c) return;
    const callId = c.callId;
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

      // New incoming call
      if (iAmCallee && (!rtcRef.current || rtcRef.current.callId !== callId)) {
        if (call.status === 'ringing') {
          if (Date.now() - (call.createdAt || 0) > 60000) return;
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

            // Fire Call Notification (Sound, Vibration, Toast, OS System Notification)
            const prefs = notifPrefsRef.current;
            if (prefs.calls) {
              startCallRingtone(prefs.sound);
              vibrateAlert(prefs.vibrate, [350, 150, 350, 150, 350]);
              pushToast({
                title: isVideo ? `Incoming video call` : `Incoming voice call`,
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
        }
        return;
      }

      if (!rtcRef.current || rtcRef.current.callId !== callId) return;
      const c = rtcRef.current;

      if (call.status === 'ended' || call.status === 'declined' || call.status === 'busy') {
        // Missed call notification if it ended while ringing for callee
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

  // Unlock profile handler — loads prefs & enables notification audio + push subscription
  const handleUnlockProfile = async (profile: Profile) => {
    unlockNotificationAudio();
    const prefs = loadNotifPrefs(profile.id);
    setNotifPrefs(prefs);
    setCurrentUser(profile);
    setActiveTab('home');
    setActiveConvo(null);

    // Request system notification permission right after user gesture unlocking profile
    if (prefs.messages || prefs.calls) {
      const perm = await requestSystemNotificationPermission();
      if (perm === 'granted') {
        registerPushSubscription(profile);
      }
    }
  };

  // Computed counts for badges & title
  const {unreadCount, conversationCount} = useMemo(() => {
    if (!currentUser) return {unreadCount: 0, conversationCount: 0};
    let unread = 0;
    let convos = 0;
    Object.entries(chatsData).forEach(([id, chat]) => {
      if (!isMyChat(id, chat, currentUser.id)) return;
      convos += 1;
      const myRead = chat?.reads?.[currentUser.id] || 0;
      unread += mapMessages(chat?.messages).filter(
        (m) => m.senderId !== currentUser.id && (m.createdAt || 0) > myRead,
      ).length;
    });
    Object.entries(groupsData).forEach(([, g]) => {
      if (!isMyGroup(g, currentUser.id)) return;
      convos += 1;
      const myRead = g?.reads?.[currentUser.id] || 0;
      unread += mapMessages(g?.messages).filter(
        (m) => m.senderId !== currentUser.id && (m.createdAt || 0) > myRead,
      ).length;
    });
    return {unreadCount: unread, conversationCount: convos};
  }, [chatsData, groupsData, currentUser]);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) Beyond Profiles` : 'Beyond Profiles';
  }, [unreadCount]);

  const handleToggleAllNotifications = async () => {
    if (!currentUser) return;
    unlockNotificationAudio();
    const currentlyOn = notifPrefs.messages || notifPrefs.calls;
    const next: NotificationPrefs = {
      ...notifPrefs,
      messages: !currentlyOn,
      calls: !currentlyOn,
    };
    setNotifPrefs(next);
    saveNotifPrefs(currentUser.id, next);

    if (!currentlyOn) {
      const perm = await requestSystemNotificationPermission();
      if (perm === 'granted') registerPushSubscription(currentUser);
      pushToast({
        title: 'Notifications enabled',
        body: 'You will be alerted for every message and call.',
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

  const notificationsActive = notifPrefs.messages || notifPrefs.calls;
  const activeCallPeerProfile = activeCallUI
    ? profiles.find((p) => p.id === activeCallUI.peerId) || null
    : null;

  return (
    <div className="h-full flex flex-col bg-[#0b0d14] text-slate-100 overflow-hidden">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <OfflineIndicator />

      {!currentUser ? (
        <div className="flex-1 overflow-y-auto custom-scroll">
          <ProfilesView profiles={profiles} onUnlock={handleUnlockProfile} />
        </div>
      ) : (
        <>
          {/* Compact Top App Bar (<= 56px) */}
          <header className="h-14 pt-safe px-4 sm:px-6 border-b border-white/[0.07] bg-[#101320]/90 backdrop-blur-md flex items-center justify-between gap-4 shrink-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-display text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
                Beyond Profiles
              </span>
            </div>

            {/* Desktop Tab Links */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              {(['home', 'vault', 'chats', 'calls', 'settings'] as AppTab[]).map((tab) => {
                const labels: Record<AppTab, string> = {
                  home: 'Home',
                  vault: 'Vault',
                  chats: 'Messages',
                  calls: 'Calls',
                  settings: 'Settings',
                };
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                      active ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {labels[tab]}
                    {tab === 'chats' && unreadCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] tabular-nums">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block">
                <PWAInstallButton variant="compact" />
              </div>
              <button
                type="button"
                onClick={handleToggleAllNotifications}
                title={notificationsActive ? 'Notifications on' : 'Notifications off'}
                aria-label="Toggle message and call notifications"
                className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors ${
                  notificationsActive
                    ? 'text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {notificationsActive ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                aria-label="Profile settings"
                className="flex items-center gap-2 min-h-[40px] pl-1 pr-2 rounded-xl hover:bg-white/[0.06] transition-colors"
              >
                <ProfileAvatar
                  profile={currentUser}
                  sizeClass="w-8 h-8"
                  roundedClass="rounded-lg"
                  textClass="text-xs font-semibold"
                />
                <span className="hidden lg:inline text-sm font-medium text-slate-200 max-w-[100px] truncate">
                  {currentUser.name}
                </span>
              </button>
            </div>
          </header>

          {/* Main Content Area */}
          <main
            className={`flex-1 min-h-0 ${
              activeTab === 'chats' ? 'overflow-hidden' : 'overflow-y-auto custom-scroll'
            }`}
          >
            {activeTab === 'home' && (
              <HomeDashboard
                currentUser={currentUser}
                userData={userData}
                unreadMessages={unreadCount}
                conversationCount={conversationCount}
                onOpenVault={(cat) => {
                  setVaultInitialCat(cat);
                  setActiveTab('vault');
                }}
                onOpenChats={() => setActiveTab('chats')}
                onOpenCalls={() => setActiveTab('calls')}
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

            {activeTab === 'chats' && (
              <MessengerView
                currentUser={currentUser}
                profiles={profiles}
                chatsData={chatsData}
                groupsData={groupsData}
                activeConvo={activeConvo}
                onSelectConvo={setActiveConvo}
                onStartCall={startCallWithProfile}
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
                onChangePrefs={(next) => {
                  setNotifPrefs(next);
                  saveNotifPrefs(currentUser.id, next);
                }}
                onEnablePush={async () => {
                  const perm = await requestSystemNotificationPermission();
                  if (perm === 'granted') {
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
                onTestAlert={() => {
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
                onSwitchProfile={() => {
                  endActiveCall(true);
                  setCurrentUser(null);
                  setActiveConvo(null);
                }}
              />
            )}
          </main>

          {/* Mobile Thumb-Zone Bottom Navigation Bar (hidden when inside a chat conversation so composer has full room) */}
          {!(activeTab === 'chats' && activeConvo) && (
            <nav
              aria-label="Mobile navigation"
              className="md:hidden h-14 pb-safe bg-[#101320]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-5 items-center shrink-0 z-30"
            >
              {(
                [
                  {id: 'home', label: 'Home', icon: Home},
                  {id: 'vault', label: 'Vault', icon: FolderOpen},
                  {id: 'chats', label: 'Chats', icon: MessageSquare, badge: unreadCount},
                  {id: 'calls', label: 'Calls', icon: Phone},
                  {id: 'settings', label: 'Alerts', icon: Settings},
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
                      active ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="relative">
                      <Icon className="w-5 h-5" />
                      {'badge' in item && item.badge > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
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
