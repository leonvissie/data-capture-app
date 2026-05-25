type BarcodeModule = {
  scan?: (path: string) => Promise<BarcodeHit[]>;
  BarcodeFormat?: Record<string, number>;
};

let BarcodeScanning: BarcodeModule | null = null;
let BarcodeModuleFormat: Record<string, number> | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const mod = require('@react-native-ml-kit/barcode-scanning') as BarcodeModule & {
    default?: BarcodeModule;
  };
  const resolved = (mod?.default ?? mod) as BarcodeModule;
  BarcodeScanning = resolved ?? null;
  BarcodeModuleFormat = resolved?.BarcodeFormat ?? (mod as any)?.BarcodeFormat;
} catch (err) {
    logger.warn(
      '[barcode/provider] Native barcode module unavailable; falling back to disabled barcode scanning.',
      err
    );
  BarcodeScanning = null;
  BarcodeModuleFormat = undefined;
}
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { hasNativePdfRasterizer, rasterizePdf } from '../pdf/rasterizer';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../utils/documentPaths';

type BarcodeHit = {
  format: number;
  value: string;
};

export const hasBarcodeSupport = typeof BarcodeScanning?.scan === 'function';

const PDF417_BAND_RATIO = 0.35;

function isPdfPath(path: string): boolean {
  if (!path) return false;
  const sanitized = path.split('?')[0] ?? path;
  return /\.pdf$/i.test(sanitized);
}

function buildCandidatePaths(uri: string): string[] {
  if (!uri) return [];
  const variants = new Set<string>();
  const enqueue = (value?: string | null) => {
    if (!value) return;
    variants.add(value);
  };

  const resolved = resolveDocumentUri(uri);
  if (resolved && resolved !== uri) {
    enqueue(resolved);
  }

  enqueue(uri);
  if (uri.startsWith('file://')) {
    const without = uri.replace(/^file:\/\//, '');
    enqueue(without);
    enqueue(without.startsWith('/') ? without : `/${without}`);
  } else if (!uri.startsWith('/')) {
    enqueue(`/${uri}`);
  }

  try {
    const decoded = decodeURI(uri);
    enqueue(decoded);
    if (decoded.startsWith('file://')) {
      const without = decoded.replace(/^file:\/\//, '');
      enqueue(without);
      enqueue(without.startsWith('/') ? without : `/${without}`);
    } else if (!decoded.startsWith('/')) {
      enqueue(`/${decoded}`);
    }
  } catch {
    // ignore decode failures
  }

  return Array.from(variants).filter(Boolean);
}

function extractPdf417(results: BarcodeHit[]): string | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const pdf417Code =
    BarcodeModuleFormat?.PDF417 ??
    BarcodeModuleFormat?.PDF_417 ??
    BarcodeModuleFormat?.PDF417_FORMAT ??
    null;
  if (!pdf417Code) return null;
  const match = results.find((item) => item?.format === pdf417Code && item?.value);
  return match?.value?.trim() || null;
}

function isHeicLike(path: string): boolean {
  if (!path) return false;
  const sanitized = path.split('?')[0] ?? path;
  return /\.(heic|heif)$/i.test(sanitized);
}

type ReadableCache = Map<string, string | null>;

function normalizeFileUri(path: string): string | null {
  if (path.startsWith('file://')) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return null;
}

async function ensureReadablePath(path: string, cache: ReadableCache): Promise<string | null> {
  if (cache.has(path)) {
    return cache.get(path) ?? null;
  }

  const fileUri = normalizeFileUri(path);
  if (!fileUri) {
    cache.set(path, null);
    return null;
  }

  if (cache.has(fileUri)) {
    const existing = cache.get(fileUri) ?? null;
    cache.set(path, existing);
    return existing;
  }

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    const ok = !!info?.exists && !info.isDirectory;
    const value = ok ? fileUri : null;
    cache.set(path, value);
    cache.set(fileUri, value);
    return value;
  } catch {
    cache.set(path, null);
    cache.set(fileUri, null);
    return null;
  }
}

function getImageSizeAsync(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

async function scanPdf417OnUri(uri: string): Promise<string | null> {
  const scanner = BarcodeScanning;
  if (!scanner?.scan) return null;
  const results = (await scanner.scan(uri)) as BarcodeHit[];
  return extractPdf417(results);
}

async function scanPdf417OnCrop(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number }
): Promise<string | null> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop }],
      { compress: 1, format: ImageManipulator.SaveFormat.PNG }
    );
    try {
      return await scanPdf417OnUri(result.uri);
    } finally {
      await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    }
  } catch {
    return null;
  }
}

async function scanPdf417WithBands(uri: string): Promise<string | null> {
  const size = await getImageSizeAsync(uri).catch(() => null);
  if (!size) {
    return scanPdf417OnUri(uri);
  }

  const bandHeight = Math.max(1, Math.round(size.height * PDF417_BAND_RATIO));
  const bottomCrop = {
    originX: 0,
    originY: Math.max(0, size.height - bandHeight),
    width: size.width,
    height: bandHeight,
  };
  const bottomResult = await scanPdf417OnCrop(uri, bottomCrop);
  if (bottomResult) return bottomResult;

  const topCrop = {
    originX: 0,
    originY: 0,
    width: size.width,
    height: bandHeight,
  };
  const topResult = await scanPdf417OnCrop(uri, topCrop);
  if (topResult) return topResult;

  return scanPdf417OnUri(uri);
}

export async function scanPdf417FromUri(uri: string): Promise<{ type: string; data: string } | null> {
  if (!hasBarcodeSupport) return null;
  const candidates = Array.from(new Set(buildCandidatePaths(uri)));
  if (!candidates.length) return null;

  const directImagePaths = candidates.filter((path) => !isPdfPath(path));
  const pdfPaths = candidates.filter(isPdfPath);

  const directResult = await tryScanPaths(directImagePaths);
  if (directResult) {
    return directResult;
  }

  if (!pdfPaths.length || !hasNativePdfRasterizer) {
    return null;
  }

  for (const pdfPath of pdfPaths) {
    try {
      const rasterized = await rasterizePdf(pdfPath, 300);
      try {
        for (const page of rasterized.pages) {
          const pageCandidates = Array.from(new Set(buildCandidatePaths(page.uri)));
          const result = await tryScanPaths(pageCandidates);
          if (result) {
            return result;
          }
        }
      } finally {
        await rasterized.cleanup().catch(() => {});
      }
    } catch {
      // ignore and continue to next PDF path
    }
  }
  return null;
}

export async function scanDebugFromUri(
  uri: string
): Promise<{ engine: 'mlkit' | 'none'; results: BarcodeHit[] }> {
  if (!hasBarcodeSupport) {
    return { engine: 'none', results: [] };
  }
  const scanner = BarcodeScanning;
  if (!scanner?.scan) {
    return { engine: 'none', results: [] };
  }
  const candidates = Array.from(new Set(buildCandidatePaths(uri)));
  if (!candidates.length) {
    return { engine: 'none', results: [] };
  }

  let lastResults: BarcodeHit[] = [];
  let attempted = false;
  const cache: ReadableCache = new Map();

  const directImagePaths = candidates.filter((path) => !isPdfPath(path));
  for (const path of directImagePaths) {
    if (isHeicLike(path)) continue;
    const readable = await ensureReadablePath(path, cache);
    if (!readable || isHeicLike(readable)) continue;

    try {
      attempted = true;
      const scanner = BarcodeScanning;
      if (!scanner?.scan) {
        return { engine: 'none', results: lastResults };
      }
      const results = (await scanner.scan(readable)) as BarcodeHit[];
      if (Array.isArray(results) && results.length) {
        return { engine: 'mlkit', results };
      }
      if (Array.isArray(results)) {
        lastResults = results;
      }
    } catch {
      // continue to next path candidate
    }
  }

  const pdfPaths = candidates.filter(isPdfPath);
  if (!pdfPaths.length || !hasNativePdfRasterizer) {
    return { engine: attempted ? 'mlkit' : 'none', results: lastResults };
  }

  for (const pdfPath of pdfPaths) {
    try {
      const rasterized = await rasterizePdf(pdfPath, 300);
      try {
        for (const page of rasterized.pages) {
          const pageCandidates = Array.from(new Set(buildCandidatePaths(page.uri)));
          for (const path of pageCandidates) {
            if (isHeicLike(path)) continue;
            const readable = await ensureReadablePath(path, cache);
            if (!readable || isHeicLike(readable)) continue;
            try {
              attempted = true;
              const scanner = BarcodeScanning;
              if (!scanner?.scan) {
                return { engine: 'none', results: lastResults };
              }
              const results = (await scanner.scan(readable)) as BarcodeHit[];
              if (Array.isArray(results) && results.length) {
                return { engine: 'mlkit', results };
              }
              if (Array.isArray(results)) {
                lastResults = results;
              }
            } catch {
              // continue with next candidate variation
            }
          }
        }
      } finally {
        await rasterized.cleanup().catch(() => {});
      }
    } catch {
      // ignore and try next PDF candidate
    }
  }

  return { engine: attempted ? 'mlkit' : 'none', results: lastResults };
}

async function tryScanPaths(
  paths: string[]
): Promise<{ type: string; data: string } | null> {
  const cache: ReadableCache = new Map();

  for (const path of paths) {
    if (isHeicLike(path)) continue;
    const readable = await ensureReadablePath(path, cache);
    if (!readable) continue;
    if (isHeicLike(readable)) continue;

    const value = await scanPdf417WithBands(readable);
    if (value) {
      return { type: 'pdf417', data: value };
    }
  }
  return null;
}
