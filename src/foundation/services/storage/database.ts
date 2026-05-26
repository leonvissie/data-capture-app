import * as SQLite from 'expo-sqlite';

const DB_NAME = 'data_capture.db';

type Migration = {
  version: number;
  apply: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    apply: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sections (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL,
          title TEXT NOT NULL,
          section_type TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS options (
          id TEXT PRIMARY KEY,
          section_id TEXT NOT NULL,
          label TEXT NOT NULL,
          value_text TEXT,
          value_number REAL,
          action_type TEXT,
          sort_order INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS entries (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS entry_values (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL,
          section_id TEXT NOT NULL,
          option_id TEXT,
          value_text TEXT,
          value_number REAL,
          value_boolean INTEGER,
          action_type TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
          FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sections_category_id ON sections(category_id);
        CREATE INDEX IF NOT EXISTS idx_options_section_id ON options(section_id);
        CREATE INDEX IF NOT EXISTS idx_entries_category_id ON entries(category_id);
        CREATE INDEX IF NOT EXISTS idx_entries_occurred_at ON entries(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_entry_values_entry_id ON entry_values(entry_id);
      `);
    },
  },
  {
    version: 2,
    apply: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_prefs (
          profile_id TEXT PRIMARY KEY,
          has_completed_onboarding INTEGER NOT NULL DEFAULT 0,
          has_completed_tour INTEGER NOT NULL DEFAULT 0,
          tour_version INTEGER NOT NULL DEFAULT 1,
          preferred_theme_mode TEXT NOT NULL DEFAULT 'system',
          auto_lock_minutes INTEGER NOT NULL DEFAULT 1,
          biometric_enabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
      `);
    },
  },
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureMigrationTable(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

async function getCurrentVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM schema_migrations');
  return row?.version ?? 0;
}

async function applyMigration(db: SQLite.SQLiteDatabase, migration: Migration): Promise<void> {
  await migration.apply(db);
  await db.runAsync('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, datetime(\'now\'))', [migration.version]);
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await ensureMigrationTable(db);
  const currentVersion = await getCurrentVersion(db);

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await applyMigration(db, migration);
    }
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  const db = await dbPromise;
  await runMigrations(db);
  return db;
}

export async function initializeStorage(): Promise<void> {
  await getDatabase();
}
