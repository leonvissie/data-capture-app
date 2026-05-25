import * as FileSystem from 'expo-file-system/legacy';
import { warnTempStorageFallback } from './storageAlerts';
import { getDocumentBaseDir, getCacheBaseDir, resolveDocumentUri, toRelativeDocumentPath } from './documentPaths';

type AssetLike = {
  uri: string;
  fileName?: string | null;
  name?: string | null;
  mimeType?: string | null;
  mime?: string | null;
  fileSize?: number | null;
};

const resolveDocumentsDir = () => {
  const base = getDocumentBaseDir();
  return base ? `${base}documents/` : null;
};

const resolveCacheDir = () => {
  const base = getCacheBaseDir();
  return base ? `${base}documents-temp/` : null;
};

const ensureDocumentsDir = async (baseDir: string | null) => {
  if (!baseDir) return null;
  try {
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
  } catch (error: any) {
    if (!String(error?.message ?? '').includes('already exists')) {
      throw error;
    }
  }
  return baseDir;
};

const deriveExtension = (asset: AssetLike) => {
  const name = asset.fileName ?? asset.name ?? asset.uri ?? '';
  const nameMatch = name.match(/\.[a-z0-9]+$/i);
  if (nameMatch) return nameMatch[0];
  const mime = (asset.mimeType ?? asset.mime ?? '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('heic') || mime.includes('heif')) return '.jpg';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  return '.jpg';
};

const sizeOf = async (uri: string): Promise<number | undefined> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    // ignore
  }
  return undefined;
};

export const persistDocumentAsset = async (
  asset: AssetLike,
): Promise<{ uri: string; size?: number }> => {
  if (!asset?.uri) {
    throw new Error('Missing asset URI');
  }
  let baseDir = resolveDocumentsDir();
  if (!baseDir) {
    warnTempStorageFallback();
    baseDir = resolveCacheDir();
  }
  if (!baseDir) {
    const size = await sizeOf(asset.uri);
    return { uri: asset.uri, size: size ?? asset.fileSize ?? undefined };
  }
  await ensureDocumentsDir(baseDir);
  const ext = deriveExtension(asset);
  const dest = `${baseDir}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${ext}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  const size = await sizeOf(dest);
  const relative = toRelativeDocumentPath(dest) ?? dest;
  return { uri: relative, size: size ?? asset.fileSize ?? undefined };
};

const deleteUriQuietly = async (uri?: string | null) => {
  if (!uri) return;
  const resolved = resolveDocumentUri(uri);
  if (!resolved || !resolved.startsWith('file://')) return;
  try {
    await FileSystem.deleteAsync(resolved, { idempotent: true });
  } catch {
    // ignore cleanup failure
  }
};

export const deleteDocumentFiles = async (doc?: { filePath?: string | null; uri?: string | null } | null) => {
  if (!doc) return;
  await deleteUriQuietly(doc.filePath);
  if (!doc.filePath || doc.filePath !== doc.uri) {
    await deleteUriQuietly(doc.uri);
  }
};
