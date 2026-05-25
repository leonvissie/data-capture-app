import * as SQLite from 'expo-sqlite';

const DB_NAME = 'data_capture.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

export async function initializeStorage(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

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

  await db.runAsync(
    'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, datetime(\'now\'))',
    [SCHEMA_VERSION],
  );
}
