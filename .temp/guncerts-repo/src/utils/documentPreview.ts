import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile, Paths } from 'expo-file-system/next';
import { Document } from '../data/types';
import { base64ToUint8 } from '../pdf/utils';
import { logger } from '@/src/utils/logger';
import {
  cacheDocumentPreviewFromSource,
  getCachedDocumentPreview,
  registerDocumentPreview,
} from './docCache';
import { resolveDocumentUri } from './documentPaths';

type PreviewResult = { uri: string; mime?: string } | null;

const ExpoFS: any = FileSystem;
const KEY_NAME = 'doc.enc.key.v1';

function resolveCacheDir(): string | null {
  try {
    return Paths.cache?.uri ?? ExpoFS.cacheDirectory ?? null;
  } catch {
    return ExpoFS.cacheDirectory ?? null;
  }
}

const CACHE_DIR = resolveCacheDir();

function wordArrayToUint8Array(wordArray: CryptoJS.lib.WordArray) {
  const { words, sigBytes } = wordArray;
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    const word = words[i >>> 2];
    u8[i] = (word >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8;
}

async function getKeyHex(): Promise<string | undefined> {
  try {
    return (await SecureStore.getItemAsync(KEY_NAME)) || undefined;
  } catch {
    return undefined;
  }
}

function u8ToWordArray(u8: Uint8Array) {
  const words: number[] = [];
  for (let i = 0; i < u8.length; i++) {
    words[i >>> 2] = (words[i >>> 2] || 0) | (u8[i] << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

function b64ToWordArray(b64: string) {
  const u8 = base64ToUint8(b64);
  return u8ToWordArray(u8);
}

export async function loadDocumentPreview(doc: Document): Promise<PreviewResult> {
  if (!doc) return null;

  const cached = await getCachedDocumentPreview(doc);
  if (cached) return cached;

  // Legacy passthrough for plaintext files
  if (!doc.isEncrypted) {
    const raw = doc.uri ?? doc.filePath;
    if (!raw) return null;
    const resolved = resolveDocumentUri(raw);
    if (!resolved) return null;
    await cacheDocumentPreviewFromSource(doc, resolved, { mime: doc.mime });
    return { uri: resolved, mime: doc.mime };
  }

  if (!CACHE_DIR) return null;
  const docUri = resolveDocumentUri(doc.uri ?? doc.filePath);
  if (!docUri) return null;

  try {
    const keyHex = await getKeyHex();
    if (!keyHex) return null;
    const keyWA = CryptoJS.enc.Hex.parse(keyHex);

    const fileRef = new FSFile(docUri);
    if (!(fileRef as any).exists) return null;
    const raw = await fileRef.text();
    const env = JSON.parse(raw) as {
      v: number;
      iv: string;
      ct: string;
      fmt?: 'hex' | 'base64';
      mime?: string;
      name?: string;
    };
    if (env.v !== 1) return null;

    const ivWA = CryptoJS.enc.Hex.parse(env.iv);
    const ctWA =
      env.fmt === 'hex' || /^[0-9a-fA-F]+$/.test(env.ct)
        ? CryptoJS.enc.Hex.parse(env.ct)
        : b64ToWordArray(env.ct);

    const decrypted = CryptoJS.AES.decrypt({ ciphertext: ctWA } as any, keyWA, { iv: ivWA });

    const ext =
      env.mime === 'application/pdf'
        ? 'pdf'
        : env.mime?.startsWith('image/')
          ? env.mime.split('/')[1] || 'bin'
          : 'bin';
    const fname = `preview_${doc.parentType || 'doc'}_${doc.parentId || doc.id}.${ext}`;
    const destUri = `${CACHE_DIR}${fname}`;
    const destFile = new FSFile(destUri);
    try {
      destFile.delete();
    } catch {
      // ignore missing file
    }
    destFile.create({ intermediates: true, overwrite: true });
    const bytes = wordArrayToUint8Array(decrypted);
    destFile.write(bytes);
    await registerDocumentPreview(doc, destFile.uri, env.mime);
    return { uri: destFile.uri, mime: env.mime };
  } catch (error) {
    logger.warn('[docPreview] Failed to decrypt preview', error);
    return null;
  }
}
