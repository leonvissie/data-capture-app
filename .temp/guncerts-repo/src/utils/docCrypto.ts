import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile, Directory, Paths } from 'expo-file-system/next';
import { uint8ToBase64 } from '../pdf/utils';
import { logger } from '@/src/utils/logger';
import { warnTempStorageFallback } from './storageAlerts';
import { resolveDocumentUri } from './documentPaths';

let memoDocsDirUri: string | null = null;

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function resolveDocsDirUri(): string | null {
  let base: string | null | undefined;
  try {
    base = Paths.document?.uri;
  } catch {
    base = undefined;
  }
  if (!base) {
    const ExpoFS: any = FileSystem;
    base = ExpoFS.documentDirectory ?? null;
  }
  if (!base) {
    warnTempStorageFallback();
    try {
      base = Paths.cache?.uri;
    } catch {
      base = undefined;
    }
    if (!base) {
      const ExpoFS: any = FileSystem;
      base = ExpoFS.cacheDirectory ?? null;
    }
  }
  if (!base) return null;
  return ensureTrailingSlash(base) + 'docs/';
}

export function getDocsDirUri(): string | null {
  return memoDocsDirUri ?? resolveDocsDirUri();
}

export async function ensureDocsDir(): Promise<string | null> {
  const uri = resolveDocsDirUri();
  if (!uri) return null;
  memoDocsDirUri = uri;
  try {
    new Directory(uri).create({ intermediates: true });
  } catch (e: any) {
    if (!String(e?.message ?? '').includes('already exists')) {
      logger.warn('ensureDocsDir failed', e);
      throw e;
    }
  }
  return uri;
}

const KEY_NAME = 'doc.enc.key.v1';

export async function clearDocumentEncryptionKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME);
}

function bytesToHex(u8: Uint8Array) {
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateKeyHex(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;

  const u8 = new Uint8Array(32);
  // RN + Expo provide a crypto shim; fallback if needed
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(u8);
  } else {
    // last resort (rare), not ideal but prevents crash
    for (let i = 0; i < u8.length; i++) u8[i] = (Math.random() * 256) | 0;
  }
  const hex = bytesToHex(u8);
  await SecureStore.setItemAsync(KEY_NAME, hex, { requireAuthentication: false });
  return hex;
}

function extFrom(nameOrUri?: string) {
  const s = (nameOrUri || '').toLowerCase();
  const m = s.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m?.[1] || '';
}

function safeFileName(base: string) {
  return base.replace(/[^a-z0-9._-]/gi, '_');
}

// Encrypt an input file (srcUri) and write encrypted JSON to docs dir.
// Returns the destination URI (…/docs/Firearm_<id>.enc).
export async function encryptCopyIntoDocs(
  parentType: 'Firearm' | 'CompetencyCertificate' | 'Application' | 'Profile' | 'SupportingStatement',
  parentId: string,
  srcUri: string,
  name?: string,
  mime?: string
): Promise<{ destUri: string; mime?: string }> {
  const docsDir = await ensureDocsDir();
  const fallbackDir = directoryOf(srcUri);
  if (!docsDir && !fallbackDir) {
    throw new Error('No writable directory available for documents');
  }
  const targetDir = ensureTrailingSlash(docsDir ?? fallbackDir!);
  const destName = safeFileName(`${parentType}_${parentId}.enc`);
  const destUri = `${targetDir}${destName}`;

  // Read input bytes using File API to avoid Base64 encoder dependency
  const srcFile = new FSFile(srcUri);
  const srcBytes = await srcFile.bytes();

  // Convert Uint8Array -> CryptoJS WordArray
  function u8ToWordArray(u8: Uint8Array) {
    const words: number[] = [];
    for (let i = 0; i < u8.length; i++) {
      words[i >>> 2] = (words[i >>> 2] || 0) | (u8[i] << (24 - (i % 4) * 8));
    }
    return CryptoJS.lib.WordArray.create(words, u8.length);
  }

  // key + iv
  const keyHex = await getOrCreateKeyHex();
  const keyWA = CryptoJS.enc.Hex.parse(keyHex);

  const ivU8 = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(ivU8);
  } else {
    for (let i = 0; i < ivU8.length; i++) ivU8[i] = (Math.random() * 256) | 0;
  }
  const ivHex = bytesToHex(ivU8);
  const ivWA = CryptoJS.enc.Hex.parse(ivHex);

  // encrypt: bytes -> WordArray -> AES(ciphertext)
  const dataWA = u8ToWordArray(srcBytes as any);
  const enc = CryptoJS.AES.encrypt(dataWA, keyWA, {
    iv: ivWA,
  });
  // Convert ciphertext WordArray -> Uint8Array -> base64 (no CryptoJS encoders used)
  function wordArrayToU8(wa: CryptoJS.lib.WordArray) {
    const { words, sigBytes } = wa as any;
    const u8 = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
      const word = words[i >>> 2];
      u8[i] = (word >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return u8;
  }
  const ctB64 = uint8ToBase64(wordArrayToU8(enc.ciphertext as any));
  const resolvedMime = mime || guessMime(name);

  // write JSON envelope (UTF-8 text)
  const envelope = JSON.stringify({
    v: 1,
    iv: ivHex,
    ct: ctB64,
    fmt: 'b64',
    mime: resolvedMime,
    name: name || null,
  });

  const destFile = new FSFile(destUri);
  destFile.create({ intermediates: true, overwrite: true });
  destFile.write(envelope);

  return { destUri, mime: resolvedMime };
}

export async function deleteOwnedDocFile(uri?: string) {
  if (!uri) return;
  const resolved = resolveDocumentUri(uri);
  if (!resolved || !resolved.startsWith('file://')) return;
  try {
    new FSFile(resolved).delete();
  } catch {}
}

function guessMime(name?: string) {
  const ext = extFrom(name);
  if (ext === 'pdf') return 'application/pdf';
  if (['jpg','jpeg','png','heic','webp'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return undefined;
}

function directoryOf(uri: string): string | null {
  const idx = uri.lastIndexOf('/');
  if (idx === -1) return null;
  return uri.slice(0, idx + 1);
}
