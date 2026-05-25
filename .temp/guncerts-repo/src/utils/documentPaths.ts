import * as FileSystem from 'expo-file-system/legacy';

const FILE_URI_PREFIX = 'file://';

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function stripFileScheme(value: string) {
  return value.startsWith(FILE_URI_PREFIX) ? value.slice(FILE_URI_PREFIX.length) : value;
}

export function isContentUri(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith('content://');
}

export function isRemoteUri(value?: string | null): boolean {
  return typeof value === 'string' && /^(https?:)?\/\//i.test(value);
}

export function isFileUri(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(FILE_URI_PREFIX);
}

export function getDocumentBaseDir(): string | null {
  const base = FileSystem.documentDirectory ?? null;
  if (!base) return null;
  return ensureTrailingSlash(base);
}

export function getCacheBaseDir(): string | null {
  const base = FileSystem.cacheDirectory ?? null;
  if (!base) return null;
  return ensureTrailingSlash(base);
}

export function toRelativeDocumentPath(
  value?: string | null,
  baseDir?: string | null
): string | null {
  if (!value) return null;
  if (isContentUri(value) || isRemoteUri(value) || value.startsWith('data:')) return value;

  const resolvedBase = baseDir ?? getDocumentBaseDir();
  if (!resolvedBase) {
    if (isFileUri(value)) return stripFileScheme(value);
    return value;
  }
  const base = ensureTrailingSlash(stripFileScheme(resolvedBase));

  const raw = stripFileScheme(value);
  if (raw.startsWith(base)) {
    const relative = raw.slice(base.length);
    return relative.replace(/^\/+/, '');
  }

  if (raw.startsWith('/')) return value;
  return value;
}

export function resolveDocumentUri(
  value?: string | null,
  baseDir?: string | null
): string | null {
  if (!value) return null;
  if (isContentUri(value) || isRemoteUri(value) || value.startsWith('data:')) return value;
  if (isFileUri(value)) return value;
  if (value.startsWith('/')) return `${FILE_URI_PREFIX}${value}`;
  const base = baseDir ?? getDocumentBaseDir();
  if (!base) return value;
  return `${ensureTrailingSlash(base)}${value.replace(/^\/+/, '')}`;
}

export function withDocumentImageCacheBust(
  value?: string | null,
  version?: string | number | null,
  baseDir?: string | null
): string | null {
  const resolved = resolveDocumentUri(value, baseDir);
  if (!resolved) return null;
  if (!version) return resolved;
  if (isContentUri(resolved) || isRemoteUri(resolved) || resolved.startsWith('data:')) return resolved;
  const sep = resolved.includes('?') ? '&' : '?';
  return `${resolved}${sep}v=${encodeURIComponent(String(version))}`;
}

export function normalizeFileUri(value: string): string {
  if (value.startsWith(FILE_URI_PREFIX)) return value;
  if (value.startsWith('/')) return `${FILE_URI_PREFIX}${value}`;
  return value;
}
