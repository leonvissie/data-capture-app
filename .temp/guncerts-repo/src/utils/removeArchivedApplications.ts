import * as FileSystem from 'expo-file-system/legacy';
import { Application, Document, Extraction } from '../data/types';
import { clearOutbox, deleteEntity, listByType, listOutbox } from '../data/sqlite';
import { getAppDirectories } from './appDirectories';
import { logger } from './logger';

const SHARED_PDF_DIR = 'shared-pdfs';
const PDF_DIR = 'pdf';

function trimTrailingSlashes(path: string) {
  return path.replace(/\/+$/, '');
}

function hasScheme(path: string) {
  return /^[a-z]+:\/\//i.test(path);
}

function normalizeFileUri(path?: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (hasScheme(trimmed)) {
    if (trimmed.startsWith('file://') || trimmed.startsWith('content://')) return trimmed;
    return null;
  }
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return null;
}

async function deleteUriIfExists(path?: string | null): Promise<boolean> {
  const uri = normalizeFileUri(path);
  if (!uri || !uri.startsWith('file://')) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return false;
  } catch {
    // continue to delete attempt
  }
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch (err) {
    logger.warn('[remove-archived-applications] delete failed', uri, err);
    return false;
  }
}

async function deleteDirectoryIfExists(path?: string | null) {
  if (!path) return;
  const normalized = path.endsWith('/') ? path : `${path}/`;
  await deleteUriIfExists(normalized);
}

async function resolveBaseDirectories(): Promise<string[]> {
  const bases = new Set<string>();
  const add = (candidate?: string | null) => {
    if (typeof candidate === 'string' && candidate.length) bases.add(trimTrailingSlashes(candidate));
  };
  try {
    const { cacheDirectory, documentDirectory } = await getAppDirectories();
    add(cacheDirectory);
    add(documentDirectory);
  } catch (err) {
    logger.warn('[remove-archived-applications] base directory resolution failed', err);
  }
  add(FileSystem.cacheDirectory);
  add(FileSystem.documentDirectory);
  return Array.from(bases);
}

async function resolveSubdirectories(name: string): Promise<string[]> {
  const bases = await resolveBaseDirectories();
  return bases.map((base) => `${base}/${name}`);
}

function looksLikePdf(maybePath?: string | null, meta?: { mime?: string | null; name?: string | null }) {
  if (!maybePath && !meta?.name && !meta?.mime) return false;
  const lowerMime = meta?.mime?.toLowerCase();
  if (lowerMime === 'application/pdf') return true;
  const lowerName = meta?.name?.toLowerCase();
  if (lowerName?.endsWith('.pdf')) return true;
  const lowerPath = maybePath?.toLowerCase() ?? '';
  if (lowerPath.startsWith('data:')) return false;
  return /\.pdf(?:$|\?)/.test(lowerPath);
}

export async function removeArchivedApplications(): Promise<number> {
  const archivedApps = listByType<Application>('Application').filter((app) => app.status === 'archived');
  if (!archivedApps.length) return 0;

  const archivedAppIds = new Set(archivedApps.map((app) => String(app.id)));
  const archivedPdfDocs = listByType<Document>('Document').filter((doc) => {
    if (!doc.applicationId || !archivedAppIds.has(String(doc.applicationId))) return false;
    return looksLikePdf(doc.filePath ?? doc.uri, { mime: doc.mime, name: doc.name });
  });
  const archivedPdfDocIds = new Set(archivedPdfDocs.map((doc) => String(doc.id)));
  const archivedExtractionIds = new Set(
    listByType<Extraction>('Extraction')
      .filter((extraction) => archivedPdfDocIds.has(String(extraction.documentId ?? '')))
      .map((extraction) => String(extraction.id)),
  );

  const fileCandidates = new Set<string>();
  archivedApps.forEach((app) => {
    if (app.pdfPath) fileCandidates.add(app.pdfPath);
    if (app.documentBundlePath) fileCandidates.add(app.documentBundlePath);
  });
  archivedPdfDocs.forEach((doc) => {
    if (doc.uri) fileCandidates.add(doc.uri);
    if (doc.filePath) fileCandidates.add(doc.filePath);
    if (doc.thumbPath) fileCandidates.add(doc.thumbPath);
  });

  for (const uri of fileCandidates) {
    await deleteUriIfExists(uri);
  }

  const [sharedDirs, pdfDirs] = await Promise.all([
    resolveSubdirectories(SHARED_PDF_DIR),
    resolveSubdirectories(PDF_DIR),
  ]);
  const bundleRoot = `${trimTrailingSlashes(
    (await getAppDirectories()).documentDirectory || FileSystem.documentDirectory || FileSystem.cacheDirectory || '',
  )}/document-bundles`;
  const cleanupTargets = new Set<string>([
    ...sharedDirs,
    ...pdfDirs,
    ...(bundleRoot.replace(/\/+$/, '') ? [bundleRoot] : []),
  ]);
  for (const dir of cleanupTargets) {
    await deleteDirectoryIfExists(dir);
  }

  listOutbox().forEach((item) => {
    const entityId = item.entityId ? String(item.entityId) : '';
    const isArchivedApp = item.entityType === 'Application' && entityId && archivedAppIds.has(entityId);
    const isArchivedPdfDoc = item.entityType === 'Document' && entityId && archivedPdfDocIds.has(entityId);
    const isArchivedExtraction = item.entityType === 'Extraction' && entityId && archivedExtractionIds.has(entityId);
    if (isArchivedApp || isArchivedPdfDoc || isArchivedExtraction) {
      clearOutbox(item.id);
    }
  });

  archivedPdfDocs.forEach((doc) => deleteEntity(doc.id));
  listByType<Extraction>('Extraction')
    .filter((extraction) => archivedExtractionIds.has(String(extraction.id)))
    .forEach((extraction) => deleteEntity(extraction.id));
  archivedApps.forEach((app) => deleteEntity(app.id));

  return archivedApps.length;
}
