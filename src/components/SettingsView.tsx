import React, {useState} from 'react';
import {
  BatteryCharging,
  Bell,
  BellRing,
  CheckCircle2,
  LogOut,
  PhoneCall,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Volume2,
} from 'lucide-react';
import {isNativeAndroid, type NativePermissionStatus} from '../lib/nativeBridge';
import {getNotificationPermission} from '../lib/notifications';
import type {NotificationPrefs, Profile} from '../lib/types';
import {ProfileAvatar} from './Avatar';
import {PWAInstallButton} from './PWAInstallButton';

interface SettingsViewProps {
  currentUser: Profile;
  prefs: NotificationPrefs;
  nativeStatus: NativePermissionStatus | null;
  onChangePrefs: (next: NotificationPrefs) => void;
  onEnablePush: () => void;
  onOpenNativeSettings: () => void;
  onRequestBatteryExemption: () => void;
  onTestAlert: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  prefs,
  nativeStatus,
  onChangePrefs,
  onEnablePush,
  onOpenNativeSettings,
  onRequestBatteryExemption,
  onTestAlert,
  onLogout,
}) => {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const nativeAndroid = isNativeAndroid();
  const webPermission = getNotificationPermission();

  const effectivePermission = nativeAndroid
    ? nativeStatus?.permission === 'granted'
      ? 'granted'
      : nativeStatus?.permission === 'denied'
        ? 'denied'
        : 'default'
    : webPermission;

  const toggle = (key: keyof NotificationPrefs) => {
    onChangePrefs({...prefs, [key]: !prefs[key]});
  };

  const permissionLabel = nativeAndroid
    ? effectivePermission === 'granted'
      ? nativeStatus?.serviceRunning
        ? 'WhatsApp-style heads-up & background alerts active'
        : 'Phone notifications allowed'
      : effectivePermission === 'denied'
        ? 'Notifications are turned off in Android settings'
        : 'Tap to allow lock-screen & heads-up phone alerts'
    : effectivePermission === 'granted'
      ? 'System alerts active'
      : effectivePermission === 'denied'
        ? 'Blocked in browser settings'
        : effectivePermission === 'default'
          ? 'Tap to allow lock-screen alerts'
          : 'In-app alerts active';

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-2xl mx-auto space-y-5">
      {/* Persistent Login Profile Card */}
      <div className="rounded-2xl bg-[#24201E] border border-[#FFEBD7]/[0.08] p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <ProfileAvatar
            profile={currentUser}
            sizeClass="w-12 h-12"
            roundedClass="rounded-full"
            showOnlineDot
            dotBorderClass="border-[#24201E]"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-[#F3EFEA] truncate">{currentUser.name}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#5A6E5C]/30 text-[#86A389] text-[10px] font-medium shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                Signed in
              </span>
            </div>
            <p className="text-xs text-[#A39B93] mt-0.5">
              Stays logged in on this device until you log out
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#C97A57]/35 bg-[#9E5A3C]/20 hover:bg-[#9E5A3C]/35 text-xs font-medium text-[#DF9878] flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>

      {/* Notification Preferences */}
      <section className="rounded-2xl bg-[#24201E] border border-[#FFEBD7]/[0.08] divide-y divide-[#FFEBD7]/[0.06]">
        <div className="p-4">
          <h3 className="font-display text-base font-semibold text-[#F3EFEA]">Message &amp; Call Notifications</h3>
          <p className="text-xs text-[#A39B93] mt-0.5">
            Phone alerts with sound, heads-up banners, quick reply, and call ringtones for every message and call.
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggle('messages')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FFEBD7]/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#8C5327]/25 text-[#D98A4E] flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#F3EFEA]">Every Message</p>
              <p className="text-xs text-[#A39B93]">Alert on every direct and group message</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.messages ? 'bg-[#9E5A3C]' : 'bg-[#FFEBD7]/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-[#F3EFEA] transition-transform ${
                prefs.messages ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle('calls')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FFEBD7]/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#5A6E5C]/25 text-[#86A389] flex items-center justify-center shrink-0">
              <PhoneCall className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#F3EFEA]">Incoming &amp; Missed Calls</p>
              <p className="text-xs text-[#A39B93]">Ringtone, lock-screen call banner, and missed call alerts</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.calls ? 'bg-[#9E5A3C]' : 'bg-[#FFEBD7]/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-[#F3EFEA] transition-transform ${
                prefs.calls ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle('sound')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FFEBD7]/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#735D28]/30 text-[#B89748] flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#F3EFEA]">Sound &amp; Ringtone</p>
              <p className="text-xs text-[#A39B93]">Play chimes for messages and ringtone for calls</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.sound ? 'bg-[#9E5A3C]' : 'bg-[#FFEBD7]/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-[#F3EFEA] transition-transform ${
                prefs.sound ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle('vibrate')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FFEBD7]/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#9E5A3C]/25 text-[#C97A57] flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#F3EFEA]">Haptic Vibration</p>
              <p className="text-xs text-[#A39B93]">Vibrate on mobile devices for new alerts</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.vibrate ? 'bg-[#9E5A3C]' : 'bg-[#FFEBD7]/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-[#F3EFEA] transition-transform ${
                prefs.vibrate ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#F3EFEA]">
              {nativeAndroid ? 'Phone Notifications' : 'Device Push Notifications'}
            </p>
            <p className="text-xs text-[#A39B93]">{permissionLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {effectivePermission !== 'granted' && effectivePermission !== 'unsupported' && (
              <button
                type="button"
                onClick={onEnablePush}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-xs font-medium whitespace-nowrap"
              >
                {nativeAndroid ? 'Allow Phone Alerts' : 'Allow System Alerts'}
              </button>
            )}
            {nativeAndroid && (
              <button
                type="button"
                onClick={onOpenNativeSettings}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#FFEBD7]/12 hover:bg-[#2E2926] text-[#F3EFEA] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Channels</span>
              </button>
            )}
            <button
              type="button"
              onClick={onTestAlert}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#FFEBD7]/12 hover:bg-[#2E2926] text-[#F3EFEA] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5 text-[#D98A4E]" />
              <span>Test Alert</span>
            </button>
          </div>
        </div>
      </section>

      {/* Android Always-On Background Delivery */}
      {nativeAndroid && (
        <section className="rounded-2xl bg-[#24201E] border border-[#FFEBD7]/[0.08] divide-y divide-[#FFEBD7]/[0.06]">
          <div className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#5A6E5C]/25 text-[#86A389] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#F3EFEA]">Background Message &amp; Call Delivery</p>
                <p className="text-xs text-[#A39B93]">
                  {nativeStatus?.serviceRunning
                    ? 'Connected in background — receives messages & calls even when the app is closed'
                    : 'Background listener will connect automatically while signed in'}
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 ${
                nativeStatus?.serviceRunning
                  ? 'bg-[#5A6E5C]/30 text-[#86A389]'
                  : 'bg-[#8C5327]/30 text-[#D98A4E]'
              }`}
            >
              {nativeStatus?.serviceRunning ? 'Active' : 'Starting'}
            </span>
          </div>

          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#8C5327]/25 text-[#D98A4E] flex items-center justify-center shrink-0">
                <BatteryCharging className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#F3EFEA]">Unrestricted Battery</p>
                <p className="text-xs text-[#A39B93]">
                  {nativeStatus?.ignoringBatteryOptimizations
                    ? 'Battery saver will not pause instant notifications'
                    : 'Allow unrestricted battery so Android never delays notifications while sleeping'}
                </p>
              </div>
            </div>
            {nativeStatus?.ignoringBatteryOptimizations ? (
              <span className="px-2.5 py-1 rounded-full bg-[#5A6E5C]/30 text-[#86A389] text-[11px] font-medium shrink-0">
                Unrestricted
              </span>
            ) : (
              <button
                type="button"
                onClick={onRequestBatteryExemption}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-xs font-medium whitespace-nowrap shrink-0"
              >
                Allow Background
              </button>
            )}
          </div>
        </section>
      )}

      {/* Install Mobile App (Web/PWA only) */}
      {!nativeAndroid && (
        <section className="rounded-2xl bg-[#24201E] border border-[#FFEBD7]/[0.08] p-4 space-y-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[#F3EFEA]">Install on Home Screen</h3>
            <p className="text-xs text-[#A39B93] mt-0.5">
              Run Beyond Profiles as a full-screen mobile app with instant notifications.
            </p>
          </div>
          <PWAInstallButton variant="full" />
        </section>
      )}

      {/* Log Out Confirmation Modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#24201E] border border-[#FFEBD7]/12 p-6 text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#9E5A3C]/25 flex items-center justify-center">
              <LogOut className="w-7 h-7 text-[#C97A57]" />
            </div>
            <h3 className="font-display text-lg font-semibold text-[#F3EFEA]">Log out of {currentUser.name}?</h3>
            <p className="text-sm text-[#A39B93] mt-1.5 mb-5">
              You will stay signed out on this phone and stop receiving message and call notifications until you log back in.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmLogout(false);
                  onLogout();
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-sm font-medium transition-colors"
              >
                Log Out
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-[#FFEBD7]/15 text-[#A39B93] hover:text-[#F3EFEA] text-sm font-medium transition-colors"
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
