import { Directory, File as FSFile, Paths, type PathInfo } from 'expo-file-system/next';
import { getAppDirectories } from '../utils/appDirectories';
import { logger } from '@/src/utils/logger';
import { warnTempStorageFallback } from '../utils/storageAlerts';

let resolvedPdfDir: string | null | undefined;

async function resolvePdfDirectory(): Promise<string | null> {
  if (resolvedPdfDir !== undefined) {
    return resolvedPdfDir;
  }
  try {
    const { cacheDirectory, documentDirectory } = await getAppDirectories();
    const baseDir = documentDirectory || cacheDirectory;
    if (!documentDirectory && cacheDirectory) {
      warnTempStorageFallback();
    }
    logger.log('Base directory for PDF storage:', baseDir);
    if (!baseDir) {
      resolvedPdfDir = null;
      return null;
    }
    const normalizedBaseDir = baseDir.replace(/\/+$/, '');
    resolvedPdfDir = `${normalizedBaseDir}/pdf`;
    return resolvedPdfDir;
  } catch (err) {
    logger.warn('pdf storage directory resolution failed', err);
    resolvedPdfDir = null;
    return null;
  }
}

export async function ensurePdfWorkspace(): Promise<void> {
  const dirUri = await resolvePdfDirectory();
  if (!dirUri) {
    throw new Error('File system not available.');
  }

  const directory = new Directory(dirUri);
  let pathInfo: PathInfo = { exists: false, isDirectory: null };
  try {
    pathInfo = Paths.info(dirUri);
  } catch (error) {
    logger.warn('Failed to inspect PDF workspace path; attempting to recreate', error);
  }

  if (pathInfo.exists && pathInfo.isDirectory === false) {
    try {
      new FSFile(dirUri).delete();
    } catch (err) {
      logger.warn('Failed to remove conflicting file at pdf directory path', err);
    }
    pathInfo = { exists: false, isDirectory: null };
  }

  if (!pathInfo.exists || pathInfo.isDirectory !== true || !directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
}

const randomName = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).replace(/[^a-zA-Z0-9_-]/g, '');

export async function pdfPathFor(_applicationId?: string, _name?: string) {
  const dirUri = await resolvePdfDirectory();
  if (!dirUri) {
    return null;
  }
  await ensurePdfWorkspace();
  const filename = `${randomName()}.pdf`;
  const directory = new Directory(dirUri);
  const fileRef = new FSFile(directory, filename);
  const absolute = fileRef.uri.startsWith('file://') ? fileRef.uri : `file://${fileRef.uri}`;
  const uri = absolute;
  return { absolute, uri };
}

export async function getPdfRootDirectory(): Promise<string | null> {
  const dirUri = await resolvePdfDirectory();
  if (!dirUri) return null;
  await ensurePdfWorkspace();
  return dirUri;
}
