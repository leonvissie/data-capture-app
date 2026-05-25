import type { Document } from '../data/types';
import * as FileSystem from 'expo-file-system/legacy';
import { Directory, Paths } from 'expo-file-system/next';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from './documentPaths';

type DocLike = Pick<Document, 'id' | 'mime' | 'name'>;

type CacheEntry = {
  uri: string;
  mime?: string;
  expiresAt: number;
  session: string;
};

const ExpoFS: any = FileSystem;
const TTL_MS = 60 * 60 * 1000; // 1 hour
const SESSION_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const cacheIndex = new Map<string, CacheEntry>();

let cacheDirUri: string | null = null;

function nowMs() {
  return Date.now();
}

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function safeId(id: string) {
  return id.replace(/[^a-z0-9_-]/gi, '_');
}

function extFromMime(mime?: string | null) {
  if (!mime) return null;
  const lower = mime.toLowerCase();
  if (lower === 'application/pdf') return 'pdf';
  if (lower.startsWith('image/')) {
    const img = lower.split('/')[1] || '';
    if (img === 'jpeg') return 'jpg';
    return img.replace(/[^a-z0-9]/gi, '');
  }
  return null;
}

function extFromUri(uri?: string | null) {
  if (!uri) return null;
  const m = uri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m?.[1]?.replace(/[^a-z0-9]/gi, '') || null;
}

function resolveCacheDirUri(): string | null {
  let base: string | null | undefined;
  try {
    base = Paths.cache?.uri;
  } catch {
    base = undefined;
  }
  if (!base) {
    base = ExpoFS.cacheDirectory ?? null;
  }
  if (!base) return null;
  return ensureTrailingSlash(base) + 'doc-previews/';
}

async function ensureCacheDir(): Promise<string | null> {
  if (cacheDirUri) return cacheDirUri;
  const resolved = resolveCacheDirUri();
  if (!resolved) return null;
  try {
    new Directory(resolved).create({ intermediates: true });
  } catch (e: any) {
    if (!String(e?.message ?? '').includes('already exists')) {
      logger.warn('ensureCacheDir failed', e);
      return null;
    }
  }
  cacheDirUri = resolved;
  return cacheDirUri;
}

async function deleteQuiet(uri?: string | null) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
}

async function setEntry(docId: string, uri: string, mime?: string) {
  const prev = cacheIndex.get(docId);
  if (prev && prev.uri && prev.uri !== uri) {
    await deleteQuiet(prev.uri);
  }
  cacheIndex.set(docId, {
    uri,
    mime,
    expiresAt: nowMs() + TTL_MS,
    session: SESSION_ID,
  });
}

function docIdOf(doc: DocLike | null | undefined) {
  return doc?.id ?? null;
}

export async function invalidateDocumentPreview(docId?: string | null) {
  if (!docId) return;
  const entry = cacheIndex.get(docId);
  cacheIndex.delete(docId);
  if (entry?.uri) {
    await deleteQuiet(entry.uri);
  }
}

export async function getCachedDocumentPreview(
  doc: DocLike | null | undefined
): Promise<{ uri: string; mime?: string } | null> {
  const docId = docIdOf(doc);
  if (!docId) return null;
  const entry = cacheIndex.get(docId);
  if (!entry) return null;
  if (entry.session !== SESSION_ID || nowMs() > entry.expiresAt) {
    await invalidateDocumentPreview(docId);
    return null;
  }
  try {
    const info = await FileSystem.getInfoAsync(entry.uri);
    if (!info.exists) {
      cacheIndex.delete(docId);
      return null;
    }
  } catch {
    cacheIndex.delete(docId);
    return null;
  }
  return { uri: entry.uri, mime: entry.mime };
}

type CacheOptions = {
  mime?: string;
  nameHint?: string;
};

export async function cacheDocumentPreviewFromSource(
  doc: DocLike,
  srcUri: string,
  opts: CacheOptions = {}
): Promise<{ uri: string; mime?: string } | null> {
  const docId = docIdOf(doc);
  if (!docId || !srcUri) return null;
  const resolvedSrc = resolveDocumentUri(srcUri);
  if (!resolvedSrc || resolvedSrc.startsWith('data:') || resolvedSrc.startsWith('http') || resolvedSrc.startsWith('content://')) {
    return null;
  }
  const cacheDir = await ensureCacheDir();
  if (!cacheDir) return null;

  const mime = opts.mime ?? doc.mime;
  const ext =
    extFromMime(mime) ??
    extFromUri(opts.nameHint) ??
    extFromUri(doc.name) ??
    extFromUri(srcUri) ??
    'bin';

  const destUri = `${cacheDir}${SESSION_ID}_${safeId(docId)}.${ext}`;
  await deleteQuiet(destUri);
  try {
    await FileSystem.copyAsync({ from: resolvedSrc, to: destUri });
  } catch (e) {
    logger.warn('cacheDocumentPreview copy failed', e);
    return null;
  }
  await setEntry(docId, destUri, mime);
  return { uri: destUri, mime };
}

export async function registerDocumentPreview(
  doc: DocLike,
  uri: string,
  mime?: string
) {
  const docId = docIdOf(doc);
  if (!docId || !uri) return;
  await setEntry(docId, uri, mime ?? doc.mime);
}
