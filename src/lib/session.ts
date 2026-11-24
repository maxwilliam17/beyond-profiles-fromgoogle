import type {Profile} from './types';

const SESSION_STORAGE_KEY = 'bp_logged_in_session_v1';

export interface SavedSession {
  profileId: string;
  profile: Profile;
  loggedInAt: number;
}

export function loadSavedSession(): SavedSession | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (!parsed || typeof parsed.profileId !== 'string' || !parsed.profile || !parsed.profile.id) {
      return null;
    }
    return {
      profileId: parsed.profileId,
      profile: parsed.profile,
      loggedInAt: typeof parsed.loggedInAt === 'number' ? parsed.loggedInAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveLoggedInSession(profile: Profile): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const existing = loadSavedSession();
  const payload: SavedSession = {
    profileId: profile.id,
    profile,
    loggedInAt: existing && existing.profileId === profile.id ? existing.loggedInAt : Date.now(),
  };
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // If photo data causes storage quota pressure, persist profile metadata without photo
    try {
      const compact: SavedSession = {
        ...payload,
        profile: {...profile, photo: null},
      };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore storage failures
    }
  }
}

export function clearSavedSession(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
}
