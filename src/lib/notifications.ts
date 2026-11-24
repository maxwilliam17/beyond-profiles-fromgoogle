import {ref, set} from 'firebase/database';
import {db} from './firebase';
import {
  isNativeAndroid,
  nativeRequestNotificationPermission,
} from './nativeBridge';
import type {NotificationPrefs, Profile} from './types';

export const VAPID_PUBLIC_KEY =
  'BCO9BCsxwF8CWhmJ-_3LUK9dM-kb9gvUfgKWPvfs1S4Q4HgXHMl3x1xZQJPxv-D0MvlFUVgL2QN2hrgGhcdoHhU';

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  messages: true,
  calls: true,
  sound: true,
  vibrate: true,
};

let audioCtx: AudioContext | null = null;
let ringtoneTimer: number | null = null;

export function getNotifPrefsKey(profileId?: string): string {
  return `bp_notify_v2_${profileId || 'guest'}`;
}

export function loadNotifPrefs(profileId?: string): NotificationPrefs {
  try {
    const raw = localStorage.getItem(getNotifPrefsKey(profileId));
    if (!raw) return {...DEFAULT_NOTIF_PREFS};
    return {...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw)};
  } catch {
    return {...DEFAULT_NOTIF_PREFS};
  }
}

export function saveNotifPrefs(profileId: string | undefined, prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(getNotifPrefsKey(profileId), JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function systemNotificationsAvailable(): boolean {
  if (isNativeAndroid()) return true;
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (isNativeAndroid()) return 'default';
  if (!systemNotificationsAvailable()) return 'unsupported';
  return Notification.permission;
}

export async function requestSystemNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (isNativeAndroid()) {
    const status = await nativeRequestNotificationPermission();
    if (!status) return 'default';
    if (status.permission === 'granted') return 'granted';
    if (status.permission === 'denied') return 'denied';
    return 'default';
  }
  if (!systemNotificationsAvailable()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function updateAppBadge(count: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      nav.setAppBadge(count).catch(() => {});
    } else if (count === 0 && typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Unsupported browser
  }
}

export function unlockNotificationAudio(): void {
  if (typeof window === 'undefined') return;
  const Ctx =
    window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      audioCtx = null;
      return;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

export function playMessageChime(enabled: boolean): void {
  if (!enabled) return;
  unlockNotificationAudio();
  if (!audioCtx) return;
  try {
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [0, 0.12].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 880 : 1175, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.linearRampToValueAtTime(0.09, now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    // Non-fatal
  }
}

export function startCallRingtone(enabled: boolean): void {
  stopCallRingtone();
  if (!enabled) return;
  unlockNotificationAudio();
  if (!audioCtx) return;

  const beep = () => {
    if (!audioCtx) return;
    try {
      const ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(480, now + 0.35);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.05);
      gain.gain.setValueAtTime(0.14, now + 0.65);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.85);
    } catch {
      // Non-fatal
    }
  };
  beep();
  ringtoneTimer = window.setInterval(beep, 2000);
}

export function stopCallRingtone(): void {
  if (ringtoneTimer !== null) {
    window.clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
}

export function vibrateAlert(enabled: boolean, pattern: number | number[] = [50, 60, 50]): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported devices
  }
}

export async function showSystemNotification(opts: {
  title: string;
  body: string;
  tag: string;
  target?: string;
  callId?: string;
  isCall?: boolean;
}): Promise<void> {
  // On Android native APK, BeyondNotificationService handles native OS notifications directly.
  if (isNativeAndroid()) return;
  if (!systemNotificationsAvailable() || Notification.permission !== 'granted') return;
  try {
    const payload: NotificationOptions & {
      renotify?: boolean;
      vibrate?: number[];
      actions?: Array<{action: string; title: string}>;
    } = {
      body: opts.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: opts.tag,
      renotify: true,
      requireInteraction: !!opts.isCall,
      vibrate: opts.isCall ? [350, 150, 350, 150, 350] : [70, 50, 70],
      data: {
        target: opts.target || '',
        callId: opts.callId || '',
        kind: opts.isCall ? 'call' : 'message',
      },
      actions: opts.isCall
        ? [
            {action: 'answer', title: 'Answer'},
            {action: 'decline', title: 'Decline'},
          ]
        : [],
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(opts.title, payload);
        return;
      }
    }
    new Notification(opts.title, payload);
  } catch (err) {
    console.warn('System notification failed:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerPushSubscription(profile: Profile | null): Promise<void> {
  if (isNativeAndroid()) return;
  if (!VAPID_PUBLIC_KEY || !profile) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!systemNotificationsAvailable() || Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer as ArrayBuffer,
      });
    }
    const payload = JSON.parse(JSON.stringify(sub)) as Record<string, unknown>;
    payload.profileId = profile.id;
    payload.profileName = profile.name;
    payload.savedAt = Date.now();
    const subKey = encodeURIComponent(sub.endpoint).slice(-40);
    await set(ref(db, `pushSubs/${profile.id}/${subKey}`), payload);
  } catch (err) {
    console.warn('Push subscription registration skipped:', err);
  }
}
