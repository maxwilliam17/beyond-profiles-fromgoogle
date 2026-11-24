import React from 'react';
import {Bell, BellRing, LogOut, PhoneCall, Smartphone, Volume2} from 'lucide-react';
import {getNotificationPermission} from '../lib/notifications';
import type {NotificationPrefs, Profile} from '../lib/types';
import {ProfileAvatar} from './Avatar';
import {PWAInstallButton} from './PWAInstallButton';

interface SettingsViewProps {
  currentUser: Profile;
  prefs: NotificationPrefs;
  onChangePrefs: (next: NotificationPrefs) => void;
  onEnablePush: () => void;
  onTestAlert: () => void;
  onSwitchProfile: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  prefs,
  onChangePrefs,
  onEnablePush,
  onTestAlert,
  onSwitchProfile,
}) => {
  const permission = getNotificationPermission();

  const toggle = (key: keyof NotificationPrefs) => {
    onChangePrefs({...prefs, [key]: !prefs[key]});
  };

  const permissionLabel =
    permission === 'granted'
      ? 'System alerts active'
      : permission === 'denied'
        ? 'Blocked in browser settings'
        : permission === 'default'
          ? 'Tap to allow lock-screen alerts'
          : 'In-app alerts active';

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-2xl mx-auto space-y-5">
      {/* Profile Card */}
      <div className="rounded-2xl bg-[#131624] border border-white/[0.08] p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <ProfileAvatar profile={currentUser} sizeClass="w-12 h-12" roundedClass="rounded-2xl" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-white truncate">{currentUser.name}</h2>
            <p className="text-xs text-slate-400">
              {currentUser.isKid ? 'Kids profile' : 'Personal profile'} · Notifications active
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitchProfile}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Switch</span>
        </button>
      </div>

      {/* Notification Preferences */}
      <section className="rounded-2xl bg-[#131624] border border-white/[0.08] divide-y divide-white/[0.06]">
        <div className="p-4">
          <h3 className="font-display text-base font-semibold text-white">Message &amp; Call Notifications</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Instant alerts are on for every incoming message, voice call, and video call.
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggle('messages')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Every Message</p>
              <p className="text-xs text-slate-400">Alert on every direct and group message</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.messages ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                prefs.messages ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle('calls')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
              <PhoneCall className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Incoming &amp; Missed Calls</p>
              <p className="text-xs text-slate-400">Ringtone, full-screen banner, and missed call alerts</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.calls ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                prefs.calls ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle('sound')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Sound &amp; Ringtone</p>
              <p className="text-xs text-slate-400">Play chimes for messages and ringtone for calls</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.sound ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                prefs.sound ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle('vibrate')}
          className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Haptic Vibration</p>
              <p className="text-xs text-slate-400">Vibrate on mobile devices for new alerts</p>
            </div>
          </div>
          <span
            className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
              prefs.vibrate ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                prefs.vibrate ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Device Push Notifications</p>
            <p className="text-xs text-slate-400">{permissionLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {permission !== 'granted' && permission !== 'unsupported' && (
              <button
                type="button"
                onClick={onEnablePush}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium whitespace-nowrap"
              >
                Allow System Alerts
              </button>
            )}
            <button
              type="button"
              onClick={onTestAlert}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Test Alert</span>
            </button>
          </div>
        </div>
      </section>

      {/* Install Mobile App */}
      <section className="rounded-2xl bg-[#131624] border border-white/[0.08] p-4 space-y-3">
        <div>
          <h3 className="font-display text-base font-semibold text-white">Install on Home Screen</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Run Beyond Profiles as a full-screen mobile app with instant notifications.
          </p>
        </div>
        <PWAInstallButton variant="full" />
      </section>
    </div>
  );
};
