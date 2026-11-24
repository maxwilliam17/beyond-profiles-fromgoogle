import React, {useEffect, useRef, useState} from 'react';
import {ref, push, set, update, remove} from 'firebase/database';
import {Camera, Delete, Lock, Pencil, Plus, Trash2, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {
  compressImage,
  hashPin,
  isPinValid,
  makeSalt,
  PIN_LENGTH,
  PIN_LOCK_SECONDS,
  PIN_MAX_ATTEMPTS,
} from '../lib/crypto';
import type {Profile} from '../lib/types';
import {ProfileAvatar} from './Avatar';
import {PWAInstallButton} from './PWAInstallButton';

const COLOR_OPTIONS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
];

interface ProfilesViewProps {
  profiles: Profile[];
  onUnlock: (profile: Profile) => void;
}

export const ProfilesView: React.FC<ProfilesViewProps> = ({profiles, onUnlock}) => {
  const [isManageMode, setIsManageMode] = useState(false);

  // PIN modal state
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [pinMode, setPinMode] = useState<'verify' | 'set' | 'confirm'>('verify');
  const [pinBuffer, setPinBuffer] = useState('');
  const [firstPinEntry, setFirstPinEntry] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [pinError, setPinError] = useState('');
  const [pinShake, setPinShake] = useState(false);

  // Add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [newColor, setNewColor] = useState('bg-blue-500');
  const [newIsKid, setNewIsKid] = useState(false);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [addFormError, setAddFormError] = useState('');
  const addPhotoInputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editPinConfirm, setEditPinConfirm] = useState('');
  const [editColor, setEditColor] = useState('bg-blue-500');
  const [editIsKid, setEditIsKid] = useState(false);
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [editPhotoChanged, setEditPhotoChanged] = useState(false);
  const [editFormError, setEditFormError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  // Lockout countdown
  useEffect(() => {
    if (lockedUntil <= Date.now()) {
      setLockSecondsLeft(0);
      return;
    }
    const tick = () => {
      const rem = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (rem > 0) {
        setLockSecondsLeft(rem);
        setPinError(`Too many attempts. Try again in ${rem}s.`);
      } else {
        setLockSecondsLeft(0);
        setLockedUntil(0);
        setPinAttempts(0);
        setPinBuffer('');
        setPinError('');
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const triggerShake = () => {
    setPinShake(false);
    window.setTimeout(() => setPinShake(true), 10);
    window.setTimeout(() => setPinShake(false), 420);
  };

  const openPinForProfile = (profile: Profile) => {
    setPinTarget(profile);
    setPinMode(profile.pinHash ? 'verify' : 'set');
    setPinBuffer('');
    setFirstPinEntry('');
    setPinAttempts(0);
    setLockedUntil(0);
    setPinError('');
  };

  const closePinModal = () => {
    setPinTarget(null);
    setPinBuffer('');
    setFirstPinEntry('');
    setPinAttempts(0);
    setLockedUntil(0);
    setPinError('');
  };

  const processCompletedPin = async (entered: string) => {
    if (!pinTarget) return;
    if (pinMode === 'verify') {
      const actual = hashPin(entered, pinTarget.pinSalt || '');
      if (actual === pinTarget.pinHash) {
        const unlocked = pinTarget;
        closePinModal();
        onUnlock(unlocked);
        return;
      }
      const nextAttempts = pinAttempts + 1;
      setPinAttempts(nextAttempts);
      setPinBuffer('');
      triggerShake();
      if (nextAttempts >= PIN_MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + PIN_LOCK_SECONDS * 1000);
      } else {
        const left = PIN_MAX_ATTEMPTS - nextAttempts;
        setPinError(`Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left.`);
      }
    } else if (pinMode === 'set') {
      setFirstPinEntry(entered);
      setPinBuffer('');
      setPinMode('confirm');
      setPinError('');
    } else if (pinMode === 'confirm') {
      if (entered === firstPinEntry) {
        const salt = makeSalt();
        const hash = hashPin(entered, salt);
        try {
          await update(ref(db, `profiles/${pinTarget.id}`), {
            pinHash: hash,
            pinSalt: salt,
            pinLength: PIN_LENGTH,
          });
          const updated: Profile = {
            ...pinTarget,
            pinHash: hash,
            pinSalt: salt,
            pinLength: PIN_LENGTH,
          };
          closePinModal();
          onUnlock(updated);
        } catch {
          setPinError('Could not save PIN. Check your connection.');
          setPinBuffer('');
          triggerShake();
        }
      } else {
        setPinMode('set');
        setFirstPinEntry('');
        setPinBuffer('');
        setPinError('PINs did not match. Try again.');
        triggerShake();
      }
    }
  };

  const handlePinDigit = (digit: string) => {
    if (!pinTarget || lockSecondsLeft > 0 || pinBuffer.length >= PIN_LENGTH) return;
    const next = pinBuffer + digit;
    setPinBuffer(next);
    if (next.length === PIN_LENGTH) {
      window.setTimeout(() => processCompletedPin(next), 120);
    }
  };

  const handlePinBackspace = () => {
    if (!pinTarget || lockSecondsLeft > 0) return;
    setPinBuffer((prev) => prev.slice(0, -1));
  };

  // Physical keyboard support for PIN entry
  useEffect(() => {
    if (!pinTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlePinBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePinModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleProfileClick = (profile: Profile) => {
    if (isManageMode) {
      setEditTarget(profile);
      setEditName(profile.name);
      setEditColor(profile.color || 'bg-blue-500');
      setEditIsKid(!!profile.isKid);
      setEditPin('');
      setEditPinConfirm('');
      setEditPhoto(profile.photo || null);
      setEditPhotoChanged(false);
      setEditFormError('');
      setShowDeleteConfirm(false);
    } else {
      openPinForProfile(profile);
    }
  };

  const handleCreateProfile = async () => {
    if (profiles.length >= 5) {
      setAddFormError('Maximum 5 profiles allowed.');
      return;
    }
    if (!isPinValid(newPin)) {
      setAddFormError('Please enter a 4-digit PIN.');
      return;
    }
    if (newPin !== newPinConfirm) {
      setAddFormError('The two PINs do not match.');
      return;
    }
    const newRef = push(ref(db, 'profiles'));
    if (!newRef.key) return;
    const salt = makeSalt();
    const payload: Profile = {
      id: newRef.key,
      name: newName.trim() || 'New User',
      color: newColor,
      isKid: newIsKid,
      photo: newPhoto || null,
      pinHash: hashPin(newPin, salt),
      pinSalt: salt,
      pinLength: PIN_LENGTH,
      createdAt: Date.now(),
    };
    try {
      await set(newRef, payload);
      setShowAdd(false);
      setNewName('');
      setNewPin('');
      setNewPinConfirm('');
      setNewPhoto(null);
      setNewIsKid(false);
      setAddFormError('');
    } catch {
      setAddFormError('Could not create profile. Please try again.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (editPin || editPinConfirm) {
      if (!isPinValid(editPin)) {
        setEditFormError('New PIN must be exactly 4 digits.');
        return;
      }
      if (editPin !== editPinConfirm) {
        setEditFormError('The two PINs do not match.');
        return;
      }
    }
    const updates: Partial<Profile> = {
      id: editTarget.id,
      name: editName.trim() || 'User',
      color: editColor,
      isKid: editIsKid,
    };
    if (editPin) {
      const salt = makeSalt();
      updates.pinHash = hashPin(editPin, salt);
      updates.pinSalt = salt;
      updates.pinLength = PIN_LENGTH;
    }
    if (editPhotoChanged) {
      updates.photo = editPhoto;
    }
    try {
      await update(ref(db, `profiles/${editTarget.id}`), updates);
      setEditTarget(null);
    } catch {
      setEditFormError('Could not save profile changes.');
    }
  };

  const handleDeleteProfile = async () => {
    if (!editTarget) return;
    try {
      await remove(ref(db, `userData/${editTarget.id}`));
      await remove(ref(db, `profiles/${editTarget.id}`));
      setShowDeleteConfirm(false);
      setEditTarget(null);
    } catch {
      setEditFormError('Could not delete profile.');
    }
  };

  return (
    <div className="min-h-full flex flex-col bg-[#0b0d14]">
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-4 px-5 py-4 pt-safe border-b border-white/[0.06]">
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Beyond Profiles
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={() => setIsManageMode((m) => !m)}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 ${
              isManageMode
                ? 'bg-white text-slate-900'
                : 'border border-white/15 text-slate-300 hover:text-white hover:border-white/30'
            }`}
          >
            {isManageMode ? 'Done' : 'Manage'}
          </button>
        </div>
      </header>

      {/* Main Selector */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8 pb-safe">
        <div className="text-center mb-8 max-w-md">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white tracking-tight [text-wrap:balance]">
            {isManageMode ? 'Manage profiles' : 'Choose your profile'}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {isManageMode
              ? 'Tap any profile to update its photo, PIN, or settings.'
              : 'Tap a profile to unlock your cloud vault, chats, and calls.'}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-5 sm:gap-7 max-w-3xl w-full">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => handleProfileClick(profile)}
              className="group flex flex-col items-center gap-3 p-3 rounded-2xl hover:bg-white/[0.04] active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="relative">
                <ProfileAvatar
                  profile={profile}
                  sizeClass="w-24 h-24 sm:w-28 sm:h-28"
                  roundedClass="rounded-3xl"
                  textClass="text-2xl font-semibold"
                />
                {isManageMode ? (
                  <div className="absolute inset-0 rounded-3xl bg-black/60 flex items-center justify-center">
                    <Pencil className="w-7 h-7 text-white" />
                  </div>
                ) : profile.pinHash ? (
                  <span
                    title="PIN protected"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Lock className="w-3.5 h-3.5 text-white/90" />
                  </span>
                ) : null}
              </div>
              <div className="text-center">
                <p className="text-sm sm:text-base font-medium text-slate-200 group-hover:text-white truncate max-w-[120px]">
                  {profile.name}
                </p>
                {profile.isKid && (
                  <span className="text-[11px] text-slate-400">Kids profile</span>
                )}
              </div>
            </button>
          ))}

          {profiles.length < 5 && (
            <button
              type="button"
              onClick={() => {
                setNewName('');
                setNewPin('');
                setNewPinConfirm('');
                setNewColor('bg-blue-500');
                setNewIsKid(false);
                setNewPhoto(null);
                setAddFormError('');
                setShowAdd(true);
              }}
              className="group flex flex-col items-center gap-3 p-3 rounded-2xl hover:bg-white/[0.04] active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-dashed border-white/15 group-hover:border-indigo-400/60 flex items-center justify-center bg-white/[0.02] transition-colors">
                <Plus className="w-9 h-9 text-slate-400 group-hover:text-white transition-colors" />
              </div>
              <span className="text-sm sm:text-base font-medium text-slate-400 group-hover:text-white">
                Add Profile
              </span>
            </button>
          )}
        </div>
      </main>

      {/* PIN Lock Modal */}
      {pinTarget && (
        <div className="fixed inset-0 z-[80] bg-[#0b0d14]/98 backdrop-blur-md flex flex-col items-center justify-center px-4 py-6 pt-safe pb-safe overflow-y-auto">
          <button
            type="button"
            onClick={closePinModal}
            aria-label="Cancel PIN entry"
            className="absolute top-4 right-4 mt-safe min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-6 h-6" />
          </button>

          <div className={`w-full max-w-xs flex flex-col items-center ${pinShake ? 'animate-pin-shake' : ''}`}>
            <ProfileAvatar
              profile={pinTarget}
              sizeClass="w-20 h-20 sm:w-24 sm:h-24"
              roundedClass="rounded-3xl"
              textClass="text-2xl font-semibold"
            />
            <h2 className="font-display text-xl font-semibold text-white mt-4">{pinTarget.name}</h2>
            <p className="text-sm text-slate-400 mt-1">
              {pinMode === 'verify'
                ? 'Enter your 4-digit PIN'
                : pinMode === 'set'
                  ? 'Create a 4-digit PIN'
                  : 'Confirm your 4-digit PIN'}
            </p>

            {/* PIN Dots */}
            <div className="flex items-center gap-4 my-6">
              {Array.from({length: PIN_LENGTH}).map((_, i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                    i < pinBuffer.length
                      ? 'bg-indigo-400 border-indigo-400 scale-110'
                      : 'border-white/25'
                  }`}
                />
              ))}
            </div>

            <p className="text-xs text-rose-400 h-5 mb-2 text-center">{pinError}</p>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-64">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={lockSecondsLeft > 0}
                  onClick={() => handlePinDigit(d)}
                  className="h-14 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 border border-white/10 text-xl font-medium text-white tabular-nums transition-all disabled:opacity-30"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                type="button"
                disabled={lockSecondsLeft > 0}
                onClick={() => handlePinDigit('0')}
                className="h-14 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 border border-white/10 text-xl font-medium text-white tabular-nums transition-all disabled:opacity-30"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Backspace"
                disabled={lockSecondsLeft > 0}
                onClick={handlePinBackspace}
                className="h-14 rounded-2xl bg-white/[0.04] hover:bg-white/[0.1] active:scale-95 border border-white/10 flex items-center justify-center text-slate-300 transition-all disabled:opacity-30"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Profile Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#131624] border border-white/10 p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">Add Profile</h2>
                <p className="text-xs text-slate-400 mt-0.5">Create a personal space for another member</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 mb-5">
              <div className="flex flex-col items-center shrink-0">
                <button
                  type="button"
                  onClick={() => addPhotoInputRef.current?.click()}
                  className="relative group focus:outline-none"
                >
                  <ProfileAvatar
                    profile={{name: newName || 'New', color: newColor, photo: newPhoto}}
                    sizeClass="w-24 h-24"
                    roundedClass="rounded-3xl"
                    textClass="text-2xl font-semibold"
                  />
                  <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-indigo-600 border-2 border-[#131624] flex items-center justify-center text-white">
                    <Camera className="w-4 h-4" />
                  </span>
                </button>
                <input
                  ref={addPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setNewPhoto(await compressImage(file, 400, 0.82));
                    } catch (err) {
                      setAddFormError(err instanceof Error ? err.message : 'Invalid image');
                    }
                    e.target.value = '';
                  }}
                />
                {newPhoto && (
                  <button
                    type="button"
                    onClick={() => setNewPhoto(null)}
                    className="text-xs text-rose-400 hover:text-rose-300 mt-2"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Profile name"
                  className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-4 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit PIN"
                    className="min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-3 text-center tracking-[0.3em] text-base text-white placeholder-slate-500 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPinConfirm}
                    onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Confirm PIN"
                    className="min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-3 text-center tracking-[0.3em] text-base text-white placeholder-slate-500 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Avatar color</p>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        aria-label={c}
                        className={`w-7 h-7 rounded-full ${c} transition-transform ${
                          newColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#131624] scale-110' : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsKid}
                    onChange={(e) => setNewIsKid(e.target.checked)}
                    className="w-5 h-5 accent-indigo-500 rounded"
                  />
                  <span className="text-sm text-slate-200">Kids profile (ages 12 and under)</span>
                </label>
              </div>
            </div>

            {addFormError && <p className="text-xs text-rose-400 mb-3">{addFormError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCreateProfile}
                className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Create Profile
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="min-h-[44px] px-5 rounded-xl border border-white/15 text-slate-300 hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#131624] border border-white/10 p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">Edit Profile</h2>
                <p className="text-xs text-slate-400 mt-0.5">Update photo, PIN, or profile preferences</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 mb-5">
              <div className="flex flex-col items-center shrink-0">
                <button
                  type="button"
                  onClick={() => editPhotoInputRef.current?.click()}
                  className="relative group focus:outline-none"
                >
                  <ProfileAvatar
                    profile={{name: editName || editTarget.name, color: editColor, photo: editPhoto}}
                    sizeClass="w-24 h-24"
                    roundedClass="rounded-3xl"
                    textClass="text-2xl font-semibold"
                  />
                  <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-indigo-600 border-2 border-[#131624] flex items-center justify-center text-white">
                    <Camera className="w-4 h-4" />
                  </span>
                </button>
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setEditPhoto(await compressImage(file, 400, 0.82));
                      setEditPhotoChanged(true);
                    } catch (err) {
                      setEditFormError(err instanceof Error ? err.message : 'Invalid image');
                    }
                    e.target.value = '';
                  }}
                />
                {editPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditPhoto(null);
                      setEditPhotoChanged(true);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 mt-2"
                  >
                    Reset photo
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Profile name"
                  className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-4 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Change PIN (leave blank to keep current)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="New PIN"
                      className="min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-3 text-center tracking-[0.3em] text-base text-white placeholder-slate-500 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={editPinConfirm}
                      onChange={(e) => setEditPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Confirm"
                      className="min-h-[44px] rounded-xl bg-white/[0.06] border border-white/10 px-3 text-center tracking-[0.3em] text-base text-white placeholder-slate-500 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Avatar color</p>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        aria-label={c}
                        className={`w-7 h-7 rounded-full ${c} transition-transform ${
                          editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#131624] scale-110' : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsKid}
                    onChange={(e) => setEditIsKid(e.target.checked)}
                    className="w-5 h-5 accent-indigo-500 rounded"
                  />
                  <span className="text-sm text-slate-200">Kids profile</span>
                </label>
              </div>
            </div>

            {editFormError && <p className="text-xs text-rose-400 mb-3">{editFormError}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="min-h-[44px] px-5 rounded-xl border border-white/15 text-slate-300 hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Confirmation */}
      {showDeleteConfirm && editTarget && (
        <div className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#131624] border border-white/10 p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-500/15 flex items-center justify-center">
              <Trash2 className="w-7 h-7 text-rose-400" />
            </div>
            <h3 className="font-display text-lg font-semibold text-white">Delete {editTarget.name}?</h3>
            <p className="text-sm text-slate-400 mt-1 mb-5">
              This removes the profile and all saved files, photos, videos, and notes.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDeleteProfile}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-white/15 text-slate-300 hover:text-white text-sm font-medium"
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
