import * as SQLite from 'expo-sqlite';
import { AnyEntity, OutboxItem, UserPrefs } from './types';
import { Application, Profile } from './types';
import { migrateEntity, migrateStoredRecordRow } from './migrations';

type Row = { id: string; type: string; blob: string; createdAt: string; updatedAt: string };
type OutboxRow = {
  id: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  op: 'UPSERT' | 'DELETE';
  payload: string;
};
const DB_SCHEMA = `
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA user_version = 1;

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      blob TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(createdAt);
`;

export const DB_NAME = 'app.db';
const db = SQLite.openDatabaseSync(DB_NAME);
let initialized = false;
let asyncInitialized = false;
let dbAsyncPromise: Promise<any> | null = null;

function parseEntityBlob<T>(blob: string): T | null {
  try {
    return JSON.parse(blob) as T;
  } catch {
    return null;
  }
}

function parseAndMigrateEntity<T extends AnyEntity>(blob: string): T | null {
  try {
    const parsed = JSON.parse(blob) as T;
    return migrateEntity(parsed).entity;
  } catch {
    return null;
  }
}

function migrateAllRecordsSync() {
  const rows = db.getAllSync<Row>('SELECT * FROM records ORDER BY updatedAt ASC');
  for (const row of rows) {
    const migrated = migrateStoredRecordRow(row);
    if (!migrated) continue;
    db.runSync(
      `UPDATE records
       SET type=?, createdAt=?, updatedAt=?, blob=?
       WHERE id=?`,
      [migrated.type, migrated.createdAt, migrated.updatedAt, migrated.blob, migrated.id],
    );
  }

  const outboxRows = db.getAllSync<OutboxRow>('SELECT * FROM outbox ORDER BY createdAt ASC');
  for (const row of outboxRows) {
    try {
      const parsed = JSON.parse(row.payload) as AnyEntity;
      const { entity, changed } = migrateEntity(parsed);
      if (!changed) continue;
      db.runSync(
        `UPDATE outbox
         SET entityType=?, entityId=?, payload=?
         WHERE id=?`,
        [entity.type, entity.id, JSON.stringify(entity), row.id],
      );
    } catch {
      // Leave malformed outbox rows untouched for manual inspection.
    }
  }
}

async function migrateAllRecordsAsync() {
  const adb = await getDbAsync();
  if (typeof adb.getAllAsync !== 'function' || typeof adb.runAsync !== 'function') {
    migrateAllRecordsSync();
    return;
  }

  const rows = (await adb.getAllAsync('SELECT * FROM records ORDER BY updatedAt ASC')) as Row[];
  for (const row of rows) {
    const migrated = migrateStoredRecordRow(row);
    if (!migrated) continue;
    await adb.runAsync(
      `UPDATE records
       SET type=?, createdAt=?, updatedAt=?, blob=?
       WHERE id=?`,
      [migrated.type, migrated.createdAt, migrated.updatedAt, migrated.blob, migrated.id],
    );
  }

  const outboxRows = (await adb.getAllAsync('SELECT * FROM outbox ORDER BY createdAt ASC')) as OutboxRow[];
  for (const row of outboxRows) {
    try {
      const parsed = JSON.parse(row.payload) as AnyEntity;
      const { entity, changed } = migrateEntity(parsed);
      if (!changed) continue;
      await adb.runAsync(
        `UPDATE outbox
         SET entityType=?, entityId=?, payload=?
         WHERE id=?`,
        [entity.type, entity.id, JSON.stringify(entity), row.id],
      );
    } catch {
      // Leave malformed outbox rows untouched for manual inspection.
    }
  }
}

function dedupeUserPrefsSync() {
  const rows = db.getAllSync<Row>('SELECT * FROM records WHERE type=? ORDER BY updatedAt DESC', ['UserPrefs']);
  const seen = new Set<string>();
  for (const row of rows) {
    const prefs = parseEntityBlob<UserPrefs>(row.blob);
    const holderProfileId = String(prefs?.holderProfileId ?? '');
    if (!holderProfileId) continue;
    if (seen.has(holderProfileId)) {
      db.runSync('DELETE FROM records WHERE id=?', [row.id]);
      continue;
    }
    seen.add(holderProfileId);
  }
}

async function dedupeUserPrefsAsync() {
  const adb = await getDbAsync();
  if (typeof adb.getAllAsync === 'function') {
    const rows = await adb.getAllAsync('SELECT * FROM records WHERE type=? ORDER BY updatedAt DESC', ['UserPrefs']) as Row[];
    const seen = new Set<string>();
    for (const row of rows) {
      const prefs = parseEntityBlob<UserPrefs>(row.blob);
      const holderProfileId = String(prefs?.holderProfileId ?? '');
      if (!holderProfileId) continue;
      if (seen.has(holderProfileId)) {
        await adb.runAsync('DELETE FROM records WHERE id=?', [row.id]);
        continue;
      }
      seen.add(holderProfileId);
    }
    return;
  }
  dedupeUserPrefsSync();
}

function removeConflictingUserPrefsSync(e: AnyEntity) {
  if (e.type !== 'UserPrefs') return;
  const holderProfileId = String(e.holderProfileId ?? '');
  if (!holderProfileId) return;
  const rows = db.getAllSync<Row>('SELECT id, blob, type, createdAt, updatedAt FROM records WHERE type=? AND id<>?', ['UserPrefs', e.id]);
  for (const row of rows) {
    const prefs = parseEntityBlob<UserPrefs>(row.blob);
    if (String(prefs?.holderProfileId ?? '') === holderProfileId) {
      db.runSync('DELETE FROM records WHERE id=?', [row.id]);
    }
  }
}

async function removeConflictingUserPrefsAsync(e: AnyEntity) {
  if (e.type !== 'UserPrefs') return;
  const holderProfileId = String(e.holderProfileId ?? '');
  if (!holderProfileId) return;
  const adb = await getDbAsync();
  if (typeof adb.getAllAsync === 'function') {
    const rows = await adb.getAllAsync(
      'SELECT id, blob, type, createdAt, updatedAt FROM records WHERE type=? AND id<>?',
      ['UserPrefs', e.id],
    ) as Row[];
    for (const row of rows) {
      const prefs = parseEntityBlob<UserPrefs>(row.blob);
      if (String(prefs?.holderProfileId ?? '') === holderProfileId) {
        await adb.runAsync('DELETE FROM records WHERE id=?', [row.id]);
      }
    }
    return;
  }
  removeConflictingUserPrefsSync(e);
}

export function initDb() {
  if (initialized) return;
  initialized = true;
  // Greenfield setup; no migrations. user_version set to 1 for future use.
  try {
    db.execSync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA user_version = 1;

      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        blob TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        op TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(createdAt);
    `);
    dedupeUserPrefsSync();
    migrateAllRecordsSync();
    db.execSync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_records_userprefs_holder_profile
      ON records(json_extract(blob, '$.holderProfileId'))
      WHERE type='UserPrefs';`);
  } catch {
    db.execSync(DB_SCHEMA);
    migrateAllRecordsSync();
  }
}
initDb();

export function checkpointDb() {
  try {
    db.execSync('PRAGMA wal_checkpoint(FULL);');
  } catch {
    // ignore; best-effort flush before snapshot
  }
}

async function getDbAsync(): Promise<any> {
  if (!dbAsyncPromise) {
    const openAsync = (SQLite as any).openDatabaseAsync;
    if (typeof openAsync === 'function') {
      dbAsyncPromise = openAsync(DB_NAME);
    } else {
      dbAsyncPromise = Promise.resolve(db as any);
    }
  }
  return dbAsyncPromise;
}

async function initDbAsync() {
  if (asyncInitialized) return;
  asyncInitialized = true;
  const adb = await getDbAsync();
  if (typeof adb.execAsync === 'function') {
    await adb.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA user_version = 1;

      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        blob TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        op TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(createdAt);
    `);
    await dedupeUserPrefsAsync();
    await migrateAllRecordsAsync();
    await adb.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_records_userprefs_holder_profile
      ON records(json_extract(blob, '$.holderProfileId'))
      WHERE type='UserPrefs';`);
    return;
  }
  dedupeUserPrefsSync();
  migrateAllRecordsSync();
}

/* ------------ CRUD helpers (JSON blob storage) ------------ */

export function saveEntity(e: AnyEntity) {
  removeConflictingUserPrefsSync(e);
  const blob = JSON.stringify(e);
  db.runSync(
    `INSERT INTO records(id, type, createdAt, updatedAt, blob)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type=excluded.type, createdAt=excluded.createdAt,
       updatedAt=excluded.updatedAt, blob=excluded.blob`,
    [e.id, e.type, e.createdAt, e.updatedAt, blob]
  );
}

export async function saveEntityAsync(e: AnyEntity) {
  await initDbAsync();
  const adb = await getDbAsync();
  await removeConflictingUserPrefsAsync(e);
  const blob = JSON.stringify(e);
  if (typeof adb.runAsync === 'function') {
    await adb.runAsync(
      `INSERT INTO records(id, type, createdAt, updatedAt, blob)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET type=excluded.type, createdAt=excluded.createdAt,
         updatedAt=excluded.updatedAt, blob=excluded.blob`,
      [e.id, e.type, e.createdAt, e.updatedAt, blob]
    );
    return;
  }
  db.runSync(
    `INSERT INTO records(id, type, createdAt, updatedAt, blob)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type=excluded.type, createdAt=excluded.createdAt,
       updatedAt=excluded.updatedAt, blob=excluded.blob`,
    [e.id, e.type, e.createdAt, e.updatedAt, blob]
  );
}

export function getEntity<T extends AnyEntity>(id: string): T | null {
  const row = db.getFirstSync<Row>('SELECT * FROM records WHERE id=?', [id]);
  return row ? parseAndMigrateEntity<T>(row.blob) : null;
}

export function listByType<T extends AnyEntity>(type: T['type']): T[] {
  const rows = db.getAllSync<Row>('SELECT * FROM records WHERE type=? ORDER BY updatedAt DESC', [type]);
  return rows
    .map(r => parseAndMigrateEntity<T>(r.blob))
    .filter((row): row is T => !!row);
}

// List applications with optional filters
export function listApplications(filter?: { status?: 'draft'|'submitted'; form?: '517g'|'518a' }): Application[] {
  const all = listByType<Application>('Application');
  return all.filter(a =>
    (filter?.status ? a.status === filter.status : true) &&
    (filter?.form ? a.form === filter.form : true)
  );
}

// Get the first/only profile (handy for MVP)
export function getFirstProfile(): Profile | null {
  const all = listByType<Profile>('Profile');
  return all[0] ?? null;
}

export function deleteEntity(id: string) {
  db.runSync('DELETE FROM records WHERE id=?', [id]);
}

/* ------------ Outbox (prep for sync later) ------------ */

export function enqueueOutbox(item: OutboxItem) {
  db.runSync(
    `INSERT INTO outbox(id, entityType, entityId, createdAt, op, payload)
     VALUES(?, ?, ?, ?, ?, ?)`,
    [item.id, item.entityType, item.entityId, item.createdAt, item.op, JSON.stringify(item.payload)]
  );
}

export async function enqueueOutboxAsync(item: OutboxItem) {
  await initDbAsync();
  const adb = await getDbAsync();
  if (typeof adb.runAsync === 'function') {
    await adb.runAsync(
      `INSERT INTO outbox(id, entityType, entityId, createdAt, op, payload)
       VALUES(?, ?, ?, ?, ?, ?)`,
      [item.id, item.entityType, item.entityId, item.createdAt, item.op, JSON.stringify(item.payload)]
    );
    return;
  }
  db.runSync(
    `INSERT INTO outbox(id, entityType, entityId, createdAt, op, payload)
     VALUES(?, ?, ?, ?, ?, ?)`,
    [item.id, item.entityType, item.entityId, item.createdAt, item.op, JSON.stringify(item.payload)]
  );
}

export function listOutbox(): OutboxItem[] {
  const rows = db.getAllSync<OutboxRow>('SELECT * FROM outbox ORDER BY createdAt ASC');
  return rows.flatMap((row) => {
    try {
      const payload = migrateEntity(JSON.parse(row.payload) as AnyEntity).entity;
      return [{ ...row, payload } as OutboxItem];
    } catch {
      return [];
    }
  });
}

export function clearOutbox(id: string) {
  db.runSync('DELETE FROM outbox WHERE id=?', [id]);
}

export function eraseAll() {
  // Remove all app data (records + outbox)
  db.runSync('DELETE FROM records');
  db.runSync('DELETE FROM outbox');
}

export function getById<T = any>(id: string): T | null {
  const row = db.getFirstSync<Row>('SELECT * FROM records WHERE id=?', [id]);
  return row ? (parseAndMigrateEntity(row.blob) as T | null) : null;
}
