import {Capacitor, registerPlugin, type PluginListenerHandle} from '@capacitor/core';
import {FIREBASE_DATABASE_URL} from './firebase';
import type {NotificationPrefs, Profile} from './types';

export type NativePermissionState = 'granted' | 'denied' | 'prompt';

export interface NativePermissionStatus {
  permission: NativePermissionState;
  fullScreenIntentAllowed: boolean;
  ignoringBatteryOptimizations: boolean;
  serviceRunning: boolean;
}

export interface NativeNotificationActionEvent {
  type: 'open-conversation' | 'call-action';
  target?: string;
  callId?: string;
  action?: 'open' | 'answer' | 'decline';
}

interface BeyondNativePluginInterface {
  checkNotificationPermission(): Promise<NativePermissionStatus>;
  requestNotificationPermission(): Promise<NativePermissionStatus>;
  setLoggedInSession(options: {
    profileId: string;
    profileName: string;
    profileJson: string;
    dbUrl: string;
    messages: boolean;
    calls: boolean;
    sound: boolean;
    vibrate: boolean;
  }): Promise<{started: boolean}>;
  getLoggedInSession(): Promise<{
    profileId?: string;
    profileName?: string;
    profileJson?: string;
  }>;
  updateNotificationPrefs(options: {
    messages: boolean;
    calls: boolean;
    sound: boolean;
    vibrate: boolean;
  }): Promise<void>;
  setActiveScreen(options: {tab: string; convoKey: string}): Promise<void>;
  clearConversationNotification(options: {convoKey: string}): Promise<void>;
  clearCallNotification(options: {callId: string}): Promise<void>;
  showTestNotification(): Promise<{shown: boolean}>;
  openNotificationSettings(): Promise<void>;
  requestBatteryOptimizationExemption(): Promise<void>;
  logout(): Promise<void>;
  consumePendingAction(): Promise<{hasAction: boolean} & Partial<NativeNotificationActionEvent>>;
  addListener(
    eventName: 'notificationAction',
    listenerFunc: (event: NativeNotificationActionEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const BeyondNative = registerPlugin<BeyondNativePluginInterface>('BeyondNative');

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function nativeCheckNotificationStatus(): Promise<NativePermissionStatus | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await BeyondNative.checkNotificationPermission();
  } catch (err) {
    console.warn('Native notification status check failed:', err);
    return null;
  }
}

export async function nativeRequestNotificationPermission(): Promise<NativePermissionStatus | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await BeyondNative.requestNotificationPermission();
  } catch (err) {
    console.warn('Native notification permission request failed:', err);
    return null;
  }
}

export async function nativeSyncLoggedInSession(
  profile: Profile,
  prefs: NotificationPrefs,
): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    // Exclude large base64 photo only if huge; keep normal compressed profile intact
    const compactProfile: Profile =
      profile.photo && profile.photo.length > 150_000 ? {...profile, photo: null} : profile;
    const res = await BeyondNative.setLoggedInSession({
      profileId: profile.id,
      profileName: profile.name,
      profileJson: JSON.stringify(compactProfile),
      dbUrl: FIREBASE_DATABASE_URL,
      messages: prefs.messages,
      calls: prefs.calls,
      sound: prefs.sound,
      vibrate: prefs.vibrate,
    });
    return !!res?.started;
  } catch (err) {
    console.warn('Native session sync failed:', err);
    return false;
  }
}

export async function nativeRecoverSavedProfile(): Promise<Profile | null> {
  if (!isNativeAndroid()) return null;
  try {
    const res = await BeyondNative.getLoggedInSession();
    if (!res?.profileId) return null;
    if (res.profileJson) {
      const parsed = JSON.parse(res.profileJson) as Profile;
      if (parsed && parsed.id) return parsed;
    }
    return {
      id: res.profileId,
      name: res.profileName || 'User',
      color: 'bg-indigo-500',
      isKid: false,
      photo: null,
    };
  } catch (err) {
    console.warn('Native profile recovery failed:', err);
    return null;
  }
}

export async function nativeUpdateNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.updateNotificationPrefs({
      messages: prefs.messages,
      calls: prefs.calls,
      sound: prefs.sound,
      vibrate: prefs.vibrate,
    });
  } catch (err) {
    console.warn('Native prefs update failed:', err);
  }
}

export async function nativeSetActiveScreen(tab: string, convoKey: string): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.setActiveScreen({tab, convoKey});
  } catch {
    // Non-fatal
  }
}

export async function nativeClearConversationNotification(convoKey: string): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.clearConversationNotification({convoKey});
  } catch {
    // Non-fatal
  }
}

export async function nativeClearCallNotification(callId: string): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.clearCallNotification({callId});
  } catch {
    // Non-fatal
  }
}

export async function nativeShowTestNotification(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await BeyondNative.showTestNotification();
    return !!res?.shown;
  } catch (err) {
    console.warn('Native test notification failed:', err);
    return false;
  }
}

export async function nativeOpenNotificationSettings(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.openNotificationSettings();
  } catch {
    // Non-fatal
  }
}

export async function nativeRequestBatteryOptimizationExemption(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.requestBatteryOptimizationExemption();
  } catch {
    // Non-fatal
  }
}

export async function nativeLogout(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BeyondNative.logout();
  } catch (err) {
    console.warn('Native logout failed:', err);
  }
}

export async function nativeAddNotificationActionListener(
  handler: (event: NativeNotificationActionEvent) => void,
): Promise<(() => void) | null> {
  if (!isNativeAndroid()) return null;
  try {
    const handle = await BeyondNative.addListener('notificationAction', handler);
    const pending = await BeyondNative.consumePendingAction();
    if (pending?.hasAction && pending.type) {
      handler({
        type: pending.type,
        target: pending.target,
        callId: pending.callId,
        action: pending.action,
      });
    }
    return () => {
      handle.remove().catch(() => {});
    };
  } catch (err) {
    console.warn('Native action listener failed:', err);
    return null;
  }
}
