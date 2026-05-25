import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AuthService } from '../services/AuthService';
import { ensureDevicePrefs, ensureUserPrefs, saveUserPrefs } from '../data/repo';
import { getFirstProfile, saveEntity } from '../data/sqlite';
import { createProfile, defaults } from '../data/defaults';
import { appConfig } from '../config/appConfig';
import { logger } from '@/src/utils/logger';
import { buildSyncSnapshotWithLocalKey } from '../sync/snapshot';

type LockState = 'checking' | 'needsSetup' | 'locked' | 'unlocked';

type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; attempts: number }
  | { ok: false; reason: 'lockout'; attempts: number; lockoutRemainingMs: number }
  | { ok: false; reason: 'reset' };

type Ctx = {
  state: LockState;
  biometricHardwareAvailable: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  autoLockMinutes: number;                        // 0 = lock immediately on resume
  failedAttempts: number;
  lockoutRemainingMs: number;
  resetNotice: string | null;
  setAutoLockMinutes: (m: number) => Promise<void>;
  createPasscode: (pass: string) => Promise<void>;
  enableBiometrics: (on: boolean) => Promise<void>;
  unlockWithPasscode: (pass: string) => Promise<UnlockResult>;
  unlockWithBiometrics: () => Promise<UnlockResult>;
  lock: () => void;
  eraseAndReset: () => Promise<void>;
  clearResetNotice: () => void;
};

const LockCtx = createContext<Ctx | null>(null);
export const useLock = () => {
  const v = useContext(LockCtx);
  if (!v) throw new Error('useLock must be used within LockProvider');
  return v;
};

export const LockProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, setState] = useState<LockState>('checking');
  const [biometricHardwareAvailable, setBHA] = useState(false);
  const [biometricAvailable, setBA] = useState(false);
  const [biometricEnabled, setBE] = useState(false);
  const [autoLockMinutes, setAL] = useState<number>(5);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState(0);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const lastBackgroundAt = useRef<number | null>(null);
  const lastUnlockAt = useRef<number | null>(null);
  const syncInFlight = useRef(false);
  const lastSyncAttemptAt = useRef<number>(0);

  type Env = 'dev' | 'stage' | 'prod';
  const APP_ENV = appConfig.buildEnv as Env;
  const LOCKOUT_MS_SHORT = APP_ENV === 'dev' ? 10_000 : 60_000;
  const LOCKOUT_MS_LONG = APP_ENV === 'dev' ? 10_000 : 120_000;
  const MAX_FAILED_ATTEMPTS = 6;

  const ensurePrefsIfMissing = useCallback(() => {
    try {
      let profile = getFirstProfile();
      if (!profile) {
        const { id, createdAt, updatedAt, schemaVersion, version, ...profileSeed } = defaults.profile;
        profile = createProfile(profileSeed);
        saveEntity(profile);
      }
      ensureUserPrefs(profile.id);
      ensureDevicePrefs(profile.id);
      return profile;
    } catch (error) {
      logger.warn('[lock] unable to ensure prefs on unlock', error);
    }
    return null;
  }, []);

  const SYNC_MIN_INTERVAL_MS = 15 * 60_000;
  const SYNC_RETRY_DELAY_MS = 30_000;

  const attemptBackgroundSync = useCallback(async () => {
    if (syncInFlight.current) return;
    const now = Date.now();
    if (now - lastSyncAttemptAt.current < SYNC_RETRY_DELAY_MS) return;
    const profile = getFirstProfile();
    if (!profile?.id) return;
    const prefs = ensureUserPrefs(profile.id);
    if (!prefs.syncToCloud) return;
    if (prefs.syncLastSnapshotAt) {
      const last = Date.parse(prefs.syncLastSnapshotAt);
      if (!isNaN(last) && now - last < SYNC_MIN_INTERVAL_MS) return;
    }
    syncInFlight.current = true;
    lastSyncAttemptAt.current = now;
    try {
      await buildSyncSnapshotWithLocalKey({ profileId: profile.id });
      saveUserPrefs({
        ...prefs,
        syncLastSnapshotAt: new Date().toISOString(),
        syncLastError: undefined,
      });
    } catch (err: any) {
      logger.warn('[sync] background snapshot failed', err);
      saveUserPrefs({
        ...prefs,
        syncLastError: err?.message ?? 'SYNC_SNAPSHOT_FAILED',
      });
    } finally {
      syncInFlight.current = false;
    }
  }, [ensureUserPrefs]);

  // Initial load
  useEffect(() => {
    (async () => {
      const setup = await AuthService.isSetup();
      const bha = await AuthService.biometricHardwareAvailable();
      const ba = await AuthService.biometricAvailable();
      const be = await AuthService.isBiometricEnabled();
      const al = await AuthService.getAutoLockMinutes();
      const attempts = await AuthService.getFailedAttempts();
      const storedLockoutUntil = await AuthService.getLockoutUntil();
      const lockoutValid = storedLockoutUntil && storedLockoutUntil > Date.now();
      setBHA(bha);
      setBA(ba);
      setBE(be);
      setAL(al);
      setFailedAttempts(attempts);
      if (lockoutValid) {
        setLockoutUntil(storedLockoutUntil);
      } else {
        if (storedLockoutUntil) await AuthService.setLockoutUntil(null);
        setLockoutUntil(null);
      }
      setState(setup ? 'locked' : 'needsSetup');
    })();
  }, []);

  useEffect(() => {
    if (!lockoutUntil) {
      setLockoutRemainingMs(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, lockoutUntil - Date.now());
      setLockoutRemainingMs(remaining);
      if (remaining === 0) {
        setLockoutUntil(null);
        AuthService.setLockoutUntil(null).catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  // Auto-lock based on background duration
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active') {
        if (state === 'unlocked') {
          // Avoid immediate relock when returning from biometric/passcode unlock UI
          if (lastUnlockAt.current && Date.now() - lastUnlockAt.current < 1500) {
            return;
          }
          attemptBackgroundSync();
          if (autoLockMinutes === 0) {
            setState('locked');
            return;
          }
          if (lastBackgroundAt) {
            const elapsedMs = Date.now() - lastBackgroundAt.current!;
            if (elapsedMs >= autoLockMinutes * 60_000) setState('locked');
          }
        }
      } else {
        // background or inactive
        lastBackgroundAt.current = Date.now();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [state, autoLockMinutes]);

  const clearLockoutState = useCallback(async () => {
    setFailedAttempts(0);
    setLockoutUntil(null);
    setLockoutRemainingMs(0);
    await AuthService.clearLockoutState();
  }, []);

  const applyFailedAttempt = useCallback(async (): Promise<UnlockResult> => {
    const next = failedAttempts + 1;
    setFailedAttempts(next);
    await AuthService.setFailedAttempts(next);

    if (next >= MAX_FAILED_ATTEMPTS) {
      await AuthService.resetAndEraseAllData();
      setFailedAttempts(0);
      setLockoutUntil(null);
      setLockoutRemainingMs(0);
      setResetNotice('For your security, local data was cleared after too many failed attempts. Please create a new passcode.');
      setState('needsSetup');
      return { ok: false, reason: 'reset' };
    }

    let lockoutMs = 0;
    if (next === 3 || next === 4) lockoutMs = LOCKOUT_MS_SHORT;
    if (next === 5) lockoutMs = LOCKOUT_MS_LONG;

    if (lockoutMs > 0) {
      const until = Date.now() + lockoutMs;
      setLockoutUntil(until);
      await AuthService.setLockoutUntil(until);
      return { ok: false, reason: 'lockout', attempts: next, lockoutRemainingMs: lockoutMs };
    }

    return { ok: false, reason: 'invalid', attempts: next };
  }, [failedAttempts, LOCKOUT_MS_LONG, LOCKOUT_MS_SHORT, MAX_FAILED_ATTEMPTS]);

  const api: Ctx = useMemo(
    () => ({
      state,
      biometricHardwareAvailable,
      biometricAvailable,
      biometricEnabled,
      autoLockMinutes,
      failedAttempts,
      lockoutRemainingMs,
      resetNotice,
      async setAutoLockMinutes(m: number) {
        setAL(m);
        await AuthService.setAutoLockMinutes(m);
      },
      async createPasscode(pass: string) {
        await AuthService.createPasscode(pass);
        await clearLockoutState();
        setState('locked');
      },
      async enableBiometrics(on: boolean) {
        await AuthService.setBiometricEnabled(on);
        setBE(on);
        const profile = ensurePrefsIfMissing();
        if (profile) {
          const prefs = ensureUserPrefs(profile.id);
          if (prefs.useBiometrics !== on) {
            saveUserPrefs({ ...prefs, useBiometrics: on });
          }
        }
      },
      async unlockWithPasscode(pass: string) {
        if (lockoutUntil && lockoutUntil > Date.now()) {
          const remaining = Math.max(0, lockoutUntil - Date.now());
          return { ok: false, reason: 'lockout', attempts: failedAttempts, lockoutRemainingMs: remaining };
        }
        const ok = await AuthService.verifyPasscode(pass);
        if (ok) {
          ensurePrefsIfMissing();
          await clearLockoutState();
          setState('unlocked');
          lastUnlockAt.current = Date.now();
          return { ok: true };
        }
        return applyFailedAttempt();
      },
      async unlockWithBiometrics() {
        if (lockoutUntil && lockoutUntil > Date.now()) {
          const remaining = Math.max(0, lockoutUntil - Date.now());
          return { ok: false, reason: 'lockout', attempts: failedAttempts, lockoutRemainingMs: remaining };
        }
        const ok = await AuthService.biometricUnlock();
        if (ok) {
          ensurePrefsIfMissing();
          await clearLockoutState();
          setState('unlocked');
          lastUnlockAt.current = Date.now();
          return { ok: true };
        }
        return { ok: false, reason: 'invalid', attempts: failedAttempts };
      },
      lock() {
        setState('locked');
      },
      async eraseAndReset() {
        await AuthService.resetAndEraseAllData();
        await clearLockoutState();
        setState('needsSetup');
      },
      clearResetNotice() {
        setResetNotice(null);
      }
    }),
    [
      state,
      biometricHardwareAvailable,
      biometricAvailable,
      biometricEnabled,
      autoLockMinutes,
      failedAttempts,
      lockoutRemainingMs,
      resetNotice,
      ensurePrefsIfMissing,
      clearLockoutState,
      applyFailedAttempt,
      lockoutUntil
    ]
  );

  return <LockCtx.Provider value={api}>{children}</LockCtx.Provider>;
};
