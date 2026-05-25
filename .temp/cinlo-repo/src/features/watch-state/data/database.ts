import * as SQLite from 'expo-sqlite';

const DB_NAME = 'cinlo.db';
const SCHEMA_VERSION = '1';
const SCHEMA_VERSION_KEY = 'watch_state_schema_version';
const ACTIVE_PROFILE_KEY = 'active_profile_id';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getNowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  const tail = Math.random().toString(36).slice(2, 12);
  return `p_${Date.now()}_${tail}`;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

async function getMetaValue(db: SQLite.SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setMetaValue(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

async function ensureSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      display_name TEXT,
      auth_provider TEXT,
      auth_subject TEXT
    );

    CREATE TABLE IF NOT EXISTS movie_user_state (
      profile_id TEXT NOT NULL,
      movie_id TEXT NOT NULL,
      watch_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, movie_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_movie_user_state_profile_id ON movie_user_state(profile_id);
    CREATE INDEX IF NOT EXISTS idx_movie_user_state_movie_id ON movie_user_state(movie_id);
  `);

  const currentSchemaVersion = await getMetaValue(db, SCHEMA_VERSION_KEY);
  if (currentSchemaVersion !== SCHEMA_VERSION) {
    await setMetaValue(db, SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  }
}

async function ensureActiveProfile(db: SQLite.SQLiteDatabase) {
  let profileId = await getMetaValue(db, ACTIVE_PROFILE_KEY);
  if (profileId) {
    const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM profiles WHERE id = ?', [profileId]);
    if (existing?.id) return existing.id;
  }

  profileId = generateId();
  const now = getNowIso();
  await db.runAsync(
    `INSERT INTO profiles (id, created_at, updated_at, display_name, auth_provider, auth_subject)
     VALUES (?, ?, ?, NULL, NULL, NULL)`,
    [profileId, now, now],
  );
  await setMetaValue(db, ACTIVE_PROFILE_KEY, profileId);
  return profileId;
}

export async function initializeWatchStateDatabase() {
  const db = await getDb();
  await ensureSchema(db);
  await ensureActiveProfile(db);
}

export async function getDatabase() {
  const db = await getDb();
  await ensureSchema(db);
  return db;
}

export async function getOrCreateActiveProfileId() {
  const db = await getDatabase();
  return ensureActiveProfile(db);
}

export const watchStateDbInternals = {
  DB_NAME,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  ACTIVE_PROFILE_KEY,
};
