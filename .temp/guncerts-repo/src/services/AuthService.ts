import * as SecureStore from 'expo-secure-store';
import * as LocalAuth from 'expo-local-authentication';
import * as ExpoCrypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { scrypt } from 'scrypt-js';
import { eraseAll, listByType } from '../data/sqlite';
import { appConfig } from '../config/appConfig';
import { clearDemoDatasetState } from '../demo/demoState';
import { clearDocumentEncryptionKey, deleteOwnedDocFile } from '../utils/docCrypto';
import { getDocumentBaseDir } from '../utils/documentPaths';
import { notifyThemeModeStorageChange } from '../theme/themeModeEvents';
import type { Document } from '../data/types';
import { clearStoredSyncKeys } from '../sync/keys';
import { ComplianceNoticeService } from './ComplianceNoticeService';

// ---------- utils ----------
const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

function utf8Bytes(s: string) {
  const esc = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
  const arr = new Uint8Array(esc.length);
  for (let i = 0; i < esc.length; i++) arr[i] = esc.charCodeAt(i);
  return arr;
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}

async function randomHex(byteCount: number) {
  const bytes = await ExpoCrypto.getRandomBytesAsync(byteCount);
  return bytesToHex(bytes);
}

// ---------- env / params ----------
type Env = 'dev' | 'stage' | 'prod';
const APP_ENV = appConfig.buildEnv as Env;

const SCRYPT_BY_ENV: Record<Env, { N: number; r: number; p: number }> = {
  dev:   { N: 4096,  r: 8, p: 1 }, // still available if you want to force scrypt in dev
  stage: { N: 4096,  r: 8, p: 1 },
  prod:  { N: 4096, r: 8, p: 1 }
};

// In dev we’ll default to "fast" (SHA-256) to keep the UI snappy.
// Stage/Prod default to "scrypt".
const PASSCODE_ALGO_BY_ENV: Record<Env, 'fast' | 'scrypt'> = {
  dev: 'fast',
  stage: 'scrypt',
  prod: 'scrypt'
};

const KEY_LEN = 32;

async function deriveScrypt(pass: string, saltHex: string, N: number, r: number, p: number) {
  const passBytes = utf8Bytes(pass);
  const saltBytes = hexToBytes(saltHex);
  const dk = await scrypt(passBytes, saltBytes, N, r, p, KEY_LEN);
  return bytesToHex(dk);
}

// very fast; DEV ONLY by default
async function deriveFast(pass: string, saltHex: string) {
  // Salt + passcode, single SHA-256 — extremely fast for dev UX
  return ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    `${saltHex}:${pass}`
  );
}

// ---------- storage keys ----------
const K_PASSCODE = 'auth.passcode';
const K_BIOMETRIC_ENABLED = 'auth.biometricEnabled';
const K_SESSION = 'auth.sessionKey';
const K_AUTOLOCK_MINUTES = 'auth.autoLockMinutes';
const K_FAILED_ATTEMPTS = 'auth.failedAttempts';
const K_LOCKOUT_UNTIL = 'auth.lockoutUntil';

// ---------- record ----------
type PasscodeRecord =
  | { algo: 'fast';   saltHex: string; hashHex: string }
  | { algo: 'scrypt'; saltHex: string; N: number; r: number; p: number; hashHex: string };

export type BiometricAccessResult =
  | { ok: true }
  | { ok: false; reason: 'no_hardware' | 'not_enrolled' | 'disabled_in_settings' | 'cancelled' | 'unknown' };

// ---------- API ----------
export const AuthService = {
  async isSetup(): Promise<boolean> {
    return !!(await SecureStore.getItemAsync(K_PASSCODE));
  },

  async biometricHardwareAvailable(): Promise<boolean> {
    return LocalAuth.hasHardwareAsync();
  },

  async biometricAvailable(): Promise<boolean> {
    const hw = await LocalAuth.hasHardwareAsync();
    const enrolled = await LocalAuth.isEnrolledAsync();
    return hw && enrolled;
  },

  async ensureBiometricAccess(reason = 'Enable biometric unlock'): Promise<BiometricAccessResult> {
    const hw = await LocalAuth.hasHardwareAsync();
    if (!hw) return { ok: false, reason: 'no_hardware' };

    const enrolled = await LocalAuth.isEnrolledAsync();
    if (!enrolled) return { ok: false, reason: 'not_enrolled' };

    const res = await LocalAuth.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use Passcode'
    });
    if (res.success) return { ok: true };

    const errorCode = (res as any)?.error;
    if (errorCode === 'not_available') {
      return { ok: false, reason: 'disabled_in_settings' };
    }
    if (errorCode === 'user_cancel' || errorCode === 'system_cancel' || errorCode === 'app_cancel') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'unknown' };
  },

  async isBiometricEnabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync(K_BIOMETRIC_ENABLED)) === '1';
  },

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(K_BIOMETRIC_ENABLED, enabled ? '1' : '0');
  },

  async createPasscode(pass: string): Promise<void> {
    const saltHex = await randomHex(16);
    const algo = PASSCODE_ALGO_BY_ENV[APP_ENV];

    let rec: PasscodeRecord;
    if (algo === 'fast') {
      const hashHex = await deriveFast(pass, saltHex);
      rec = { algo, saltHex, hashHex };
    } else {
      const { N, r, p } = SCRYPT_BY_ENV[APP_ENV];
      const hashHex = await deriveScrypt(pass, saltHex, N, r, p);
      rec = { algo, saltHex, N, r, p, hashHex };
    }

    await SecureStore.setItemAsync(K_PASSCODE, JSON.stringify(rec));
    await SecureStore.setItemAsync(K_SESSION, await randomHex(16));
    await this.clearLockoutState();
  },

  async verifyPasscode(pass: string): Promise<boolean> {
    const raw = await SecureStore.getItemAsync(K_PASSCODE);
    if (!raw) return false;
    const rec = JSON.parse(raw) as PasscodeRecord;

    if (rec.algo === 'fast') {
      const candidate = await deriveFast(pass, rec.saltHex);
      return timingSafeEqualStr(candidate, rec.hashHex);
    } else {
      const candidate = await deriveScrypt(pass, rec.saltHex, rec.N, rec.r, rec.p);
      return timingSafeEqualStr(candidate, rec.hashHex);
    }
  },

  async updatePasscode(oldPass: string, newPass: string): Promise<boolean> {
    const ok = await this.verifyPasscode(oldPass);
    if (!ok) return false;
    await this.createPasscode(newPass);
    return true;
  },

  async biometricUnlock(reason = 'Unlock app'): Promise<boolean> {
    const enabled = await this.isBiometricEnabled();
    if (!enabled) return false;
    const res = await LocalAuth.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use passcode',
      fallbackLabel: 'Enter Passcode'
    });
    return res.success;
  },

  async getAutoLockMinutes(): Promise<number> {
    const v = await SecureStore.getItemAsync(K_AUTOLOCK_MINUTES);
    if (!v) return 5;
    const n = Number(v);
    return Number.isFinite(n) ? n : 5;
  },

  async setAutoLockMinutes(mins: number): Promise<void> {
    await SecureStore.setItemAsync(K_AUTOLOCK_MINUTES, String(mins));
  },

  async getFailedAttempts(): Promise<number> {
    const v = await SecureStore.getItemAsync(K_FAILED_ATTEMPTS);
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },

  async setFailedAttempts(count: number): Promise<void> {
    await SecureStore.setItemAsync(K_FAILED_ATTEMPTS, String(Math.max(0, count)));
  },

  async getLockoutUntil(): Promise<number | null> {
    const v = await SecureStore.getItemAsync(K_LOCKOUT_UNTIL);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  },

  async setLockoutUntil(untilMs: number | null): Promise<void> {
    if (untilMs == null) {
      await SecureStore.deleteItemAsync(K_LOCKOUT_UNTIL);
      return;
    }
    await SecureStore.setItemAsync(K_LOCKOUT_UNTIL, String(untilMs));
  },

  async clearLockoutState(): Promise<void> {
    await SecureStore.deleteItemAsync(K_FAILED_ATTEMPTS);
    await SecureStore.deleteItemAsync(K_LOCKOUT_UNTIL);
  },

  async resetAndEraseAllData(): Promise<void> {
    const docs = listByType<Document>('Document');

    // Erase secrets
    await SecureStore.deleteItemAsync(K_PASSCODE);
    await SecureStore.deleteItemAsync(K_BIOMETRIC_ENABLED);
    await SecureStore.deleteItemAsync(K_SESSION);
    await SecureStore.deleteItemAsync(K_AUTOLOCK_MINUTES);
    await SecureStore.deleteItemAsync(K_FAILED_ATTEMPTS);
    await SecureStore.deleteItemAsync(K_LOCKOUT_UNTIL);

    // NEW: wipe local DB too
    eraseAll();

    const filePaths = new Set<string>();
    for (const doc of docs) {
      if (doc.filePath) filePaths.add(doc.filePath);
      if (doc.uri) filePaths.add(doc.uri);
      if (doc.thumbPath) filePaths.add(doc.thumbPath);
    }
    await Promise.all(Array.from(filePaths).map(path => deleteOwnedDocFile(path)));

    const baseDir = getDocumentBaseDir();
    if (baseDir) {
      await Promise.all([
        FileSystem.deleteAsync(`${baseDir}docs`, { idempotent: true }),
        FileSystem.deleteAsync(`${baseDir}demo`, { idempotent: true }),
      ]);
    }

    await Promise.all([
      clearDemoDatasetState(),
      clearStoredSyncKeys(),
      clearDocumentEncryptionKey(),
      ComplianceNoticeService.clearAcceptance(),
    ]);
    notifyThemeModeStorageChange();
  }
};
