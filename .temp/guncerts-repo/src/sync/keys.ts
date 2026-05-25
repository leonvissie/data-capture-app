import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

export type SyncKeyBundle = {
  v: 1;
  keyId: string;
  kdf: 'pbkdf2-sha256';
  saltHex: string;
  iterations: number;
  ivHex: string;
  wrappedDekB64: string;
  createdAt: string;
};

const KEY_BUNDLE_STORE = 'sync.key.bundle.v1';
const DEK_STORE = 'sync.dek.hex.v1';
const KDF_ITERATIONS = 120000;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  return bytes;
}

function bytesToHex(u8: Uint8Array) {
  return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToWordArray(hex: string) {
  return CryptoJS.enc.Hex.parse(hex);
}

function deriveKek(passphrase: string, saltHex: string, iterations: number) {
  const saltWA = CryptoJS.enc.Hex.parse(saltHex);
  return CryptoJS.PBKDF2(passphrase, saltWA, {
    keySize: 32 / 4,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
}

function wrapDek(dekHex: string, kek: CryptoJS.lib.WordArray) {
  const iv = randomBytes(16);
  const ivHex = bytesToHex(iv);
  const enc = CryptoJS.AES.encrypt(hexToWordArray(dekHex), kek, {
    iv: hexToWordArray(ivHex),
  });
  return { wrappedDekB64: CryptoJS.enc.Base64.stringify(enc.ciphertext), ivHex };
}

function unwrapDek(wrappedDekB64: string, ivHex: string, kek: CryptoJS.lib.WordArray): string {
  const ct = CryptoJS.enc.Base64.parse(wrappedDekB64);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: ct } as any, kek, {
    iv: hexToWordArray(ivHex),
  });
  const dekHex = decrypted.toString(CryptoJS.enc.Hex);
  if (!dekHex || dekHex.length < 32) {
    throw new Error('SYNC_KEY_DECRYPT_FAILED');
  }
  return dekHex;
}

export async function loadSyncKeyBundle(): Promise<SyncKeyBundle | null> {
  const raw = await SecureStore.getItemAsync(KEY_BUNDLE_STORE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncKeyBundle;
  } catch {
    return null;
  }
}

export async function saveSyncKeyBundle(bundle: SyncKeyBundle): Promise<void> {
  await SecureStore.setItemAsync(KEY_BUNDLE_STORE, JSON.stringify(bundle), {
    requireAuthentication: false,
  });
}

export async function loadLocalDek(): Promise<string | null> {
  return SecureStore.getItemAsync(DEK_STORE);
}

export async function clearStoredSyncKeys(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_BUNDLE_STORE),
    SecureStore.deleteItemAsync(DEK_STORE),
  ]);
}

async function saveLocalDek(dekHex: string): Promise<void> {
  await SecureStore.setItemAsync(DEK_STORE, dekHex, { requireAuthentication: false });
}

export async function getOrCreateSyncKey(passphrase: string): Promise<{ dekHex: string; bundle: SyncKeyBundle }> {
  const existing = await loadSyncKeyBundle();
  if (existing) {
    const kek = deriveKek(passphrase, existing.saltHex, existing.iterations);
    const dekHex = unwrapDek(existing.wrappedDekB64, existing.ivHex, kek);
    await saveLocalDek(dekHex);
    return { dekHex, bundle: existing };
  }

  const dekHex = bytesToHex(randomBytes(32));
  const saltHex = bytesToHex(randomBytes(16));
  const kek = deriveKek(passphrase, saltHex, KDF_ITERATIONS);
  const { wrappedDekB64, ivHex } = wrapDek(dekHex, kek);
  const bundle: SyncKeyBundle = {
    v: 1,
    keyId: bytesToHex(randomBytes(8)),
    kdf: 'pbkdf2-sha256',
    saltHex,
    iterations: KDF_ITERATIONS,
    ivHex,
    wrappedDekB64,
    createdAt: new Date().toISOString(),
  };
  await saveSyncKeyBundle(bundle);
  await saveLocalDek(dekHex);
  return { dekHex, bundle };
}
