import * as SQLite from 'expo-sqlite';

const DB_NAME = 'data_capture.db';

type Migration = {
  version: number;
  apply: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

async function hasColumn(db: SQLite.SQLiteDatabase, tableName: string, columnName: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName});`);
  return rows.some((row) => row.name === columnName);
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  definitionSql: string,
): Promise<void> {
  if (await hasColumn(db, tableName, columnName)) return;
  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql};`);
}

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
  {
    version: 3,
    apply: async (db) => {
      await addColumnIfMissing(db, 'user_prefs', 'show_home_tutorial_cta', `INTEGER NOT NULL DEFAULT 1`);
      await addColumnIfMissing(db, 'user_prefs', 'home_category_filter', `TEXT NOT NULL DEFAULT 'all'`);
      await addColumnIfMissing(db, 'user_prefs', 'home_category_sort', `TEXT NOT NULL DEFAULT 'recent'`);
    },
  },
  {
    version: 4,
    apply: async (db) => {
      await addColumnIfMissing(db, 'categories', 'measurement_unit', `TEXT NOT NULL DEFAULT ''`);
    },
  },
  {
    version: 5,
    apply: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS locations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL UNIQUE,
          entry_count INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_locations_last_used_at ON locations(last_used_at DESC);
        CREATE INDEX IF NOT EXISTS idx_locations_entry_count ON locations(entry_count DESC);
        CREATE INDEX IF NOT EXISTS idx_entries_location_id ON entries(location_id);
      `);
      await addColumnIfMissing(db, 'entries', 'location_id', `TEXT`);
      await addColumnIfMissing(db, 'user_prefs', 'location_sort_preference', `TEXT NOT NULL DEFAULT 'recency'`);
    },
  },
  {
    version: 6,
    apply: async (db) => {
      await addColumnIfMissing(db, 'sections', 'required_severity', `TEXT NOT NULL DEFAULT 'blocking'`);
      await addColumnIfMissing(db, 'sections', 'config_json', `TEXT NOT NULL DEFAULT '{}'`);
    },
  },
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

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
  if (!migrationPromise) {
    migrationPromise = runMigrations(db).catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  await migrationPromise;
  return db;
}

export async function initializeStorage(): Promise<void> {
  await getDatabase();
}

export async function resetStorage(): Promise<void> {
  migrationPromise = null;
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await initializeStorage();
}
