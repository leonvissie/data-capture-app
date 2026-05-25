import * as FileSystem from 'expo-file-system/legacy';
import { listByType } from '../data/sqlite';
import { Document } from '../data/types';
import { DB_NAME, checkpointDb } from '../data/sqlite';
import { warnTempStorageFallback } from '../utils/storageAlerts';
import { resolveDocumentUri } from '../utils/documentPaths';
import { encryptBase64WithDek, encryptTextWithDek, sha256Base64 } from './crypto';
import { getOrCreateSyncKey, loadLocalDek, loadSyncKeyBundle, type SyncKeyBundle } from './keys';

export type SyncDocumentEntry = {
  id: string;
  file: string;
  sha256: string;
  bytes: number;
  mime?: string;
  kind?: string;
  parentType?: string;
  parentId?: string;
};

export type SyncManifest = {
  version: 1;
  createdAt: string;
  keyId: string;
  db: {
    file: string;
    sha256: string;
    bytes: number;
    enc: 'aes-256-cbc';
    iv: string;
  };
  documents: SyncDocumentEntry[];
};

export type SyncSnapshotResult = {
  rootDir: string;
  manifestPath: string;
  keyBundlePath: string;
  dbPath: string;
  documentsDir: string;
  documentCount: number;
};

const SYNC_DIR = 'sync';
const DOCS_DIR = 'docs';
const MANIFEST_NAME = 'manifest.json.enc';
const KEY_BUNDLE_NAME = 'key-bundle.json';
const DB_SNAPSHOT_NAME = 'db.sqlite.enc';

function randomName(prefix: string) {
  const base = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${base}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function normalizeFileUri(path: string) {
  if (path.startsWith('file://')) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return path;
}

async function ensureDir(path: string) {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch (err: any) {
    if (!String(err?.message ?? '').includes('exists')) {
      throw err;
    }
  }
}

async function resolveSyncRoot(): Promise<string | null> {
  let base = FileSystem.documentDirectory ?? null;
  if (!base) {
    warnTempStorageFallback();
    base = FileSystem.cacheDirectory ?? null;
  }
  if (!base) return null;
  const normalized = base.replace(/\/+$/, '');
  const root = `${normalized}/${SYNC_DIR}`;
  await ensureDir(root);
  return root;
}

async function readBase64File(uri: string): Promise<string> {
  const normalized = normalizeFileUri(uri);
  return FileSystem.readAsStringAsync(normalized, { encoding: FileSystem.EncodingType.Base64 });
}

async function resolveDbPath(): Promise<string> {
  const base = FileSystem.documentDirectory ?? null;
  if (!base) {
    throw new Error('DOCUMENT_DIRECTORY_MISSING');
  }
  const normalized = base.replace(/\/+$/, '');
  return `${normalized}/SQLite/${DB_NAME}`;
}

function pickDocumentPath(doc: Document): string | null {
  const candidate = doc.filePath || doc.uri || '';
  if (!candidate) return null;
  if (candidate.startsWith('data:')) return null;
  if (candidate.startsWith('http')) return null;
  return resolveDocumentUri(candidate);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(normalizeFileUri(path));
    return info.exists;
  } catch {
    return false;
  }
}

async function buildSnapshot(args: {
  profileId: string;
  dekHex: string;
  bundle: SyncKeyBundle;
}): Promise<SyncSnapshotResult> {
  const { profileId: _profileId, dekHex, bundle } = args;
  const root = await resolveSyncRoot();
  if (!root) {
    throw new Error('SYNC_ROOT_UNAVAILABLE');
  }

  const docsDir = `${root}/${DOCS_DIR}`;
  await ensureDir(docsDir);

  checkpointDb();
  const dbPath = await resolveDbPath();
  if (!(await fileExists(dbPath))) {
    throw new Error('DB_FILE_NOT_FOUND');
  }
  const dbBase64 = await readBase64File(dbPath);
  const dbEnvelope = encryptBase64WithDek(dbBase64, dekHex, { mime: 'application/x-sqlite3' });
  const dbSha = sha256Base64(dbBase64);
  const dbBytes = Math.round(dbBase64.length * 0.75);
  const dbOutPath = `${root}/${DB_SNAPSHOT_NAME}`;
  await FileSystem.writeAsStringAsync(dbOutPath, JSON.stringify(dbEnvelope));

  const documents = listByType<Document>('Document');
  const docEntries: SyncDocumentEntry[] = [];

  for (const doc of documents) {
    const path = pickDocumentPath(doc);
    if (!path) continue;
    if (!(await fileExists(path))) continue;

    const base64 = await readBase64File(path);
    const envelope = encryptBase64WithDek(base64, dekHex, { mime: doc.mime ?? undefined, name: doc.name ?? undefined });
    const sha = sha256Base64(base64);
    const bytes = Math.round(base64.length * 0.75);

    const fileName = `${randomName('doc')}.enc`;
    const outPath = `${docsDir}/${fileName}`;
    await FileSystem.writeAsStringAsync(outPath, JSON.stringify(envelope));

    docEntries.push({
      id: String(doc.id),
      file: `${DOCS_DIR}/${fileName}`,
      sha256: sha,
      bytes,
      mime: doc.mime ?? undefined,
      kind: doc.kind ?? undefined,
      parentType: doc.parentType ?? undefined,
      parentId: doc.parentId ?? undefined,
    });
  }

  const manifest: SyncManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    keyId: bundle.keyId,
    db: {
      file: DB_SNAPSHOT_NAME,
      sha256: dbSha,
      bytes: dbBytes,
      enc: 'aes-256-cbc',
      iv: dbEnvelope.iv,
    },
    documents: docEntries,
  };

  const manifestEnvelope = encryptTextWithDek(JSON.stringify(manifest), dekHex, { mime: 'application/json' });
  const manifestPath = `${root}/${MANIFEST_NAME}`;
  await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifestEnvelope));

  const keyBundlePath = `${root}/${KEY_BUNDLE_NAME}`;
  await FileSystem.writeAsStringAsync(keyBundlePath, JSON.stringify(bundle));

  return {
    rootDir: root,
    manifestPath,
    keyBundlePath,
    dbPath: dbOutPath,
    documentsDir: docsDir,
    documentCount: docEntries.length,
  };
}

export async function buildSyncSnapshot(args: {
  profileId: string;
  passphrase: string;
}): Promise<SyncSnapshotResult> {
  const { passphrase, profileId } = args;
  const { dekHex, bundle } = await getOrCreateSyncKey(passphrase);
  return buildSnapshot({ profileId, dekHex, bundle });
}

export async function buildSyncSnapshotWithLocalKey(args: {
  profileId: string;
}): Promise<SyncSnapshotResult> {
  const { profileId } = args;
  const dekHex = await loadLocalDek();
  const bundle = await loadSyncKeyBundle();
  if (!dekHex || !bundle) {
    throw new Error('SYNC_KEY_MISSING');
  }
  return buildSnapshot({ profileId, dekHex, bundle });
}

export async function writeKeyBundle(rootDir: string, bundle: SyncKeyBundle): Promise<string> {
  const path = `${rootDir}/${KEY_BUNDLE_NAME}`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(bundle));
  return path;
}
