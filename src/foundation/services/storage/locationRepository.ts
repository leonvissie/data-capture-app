import { nowIso } from '@/foundation/lib/dateTime';

import { getDatabase } from './database';

export type LocationSort = 'recency' | 'usage' | 'az' | 'za';

export type LocationRecord = {
  id: string;
  name: string;
  normalizedName: string;
  entryCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function mapLocation(row: {
  id: string;
  name: string;
  normalized_name: string;
  entry_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}): LocationRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    entryCount: row.entry_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function orderByClause(sort: LocationSort): string {
  switch (sort) {
    case 'usage':
      return 'entry_count DESC, name COLLATE NOCASE ASC';
    case 'az':
      return 'name COLLATE NOCASE ASC';
    case 'za':
      return 'name COLLATE NOCASE DESC';
    default:
      return 'COALESCE(last_used_at, created_at) DESC, name COLLATE NOCASE ASC';
  }
}

export async function listLocations(sort: LocationSort): Promise<LocationRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    normalized_name: string;
    entry_count: number;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
  }>(`SELECT id, name, normalized_name, entry_count, last_used_at, created_at, updated_at FROM locations ORDER BY ${orderByClause(sort)}`);
  return rows.map(mapLocation);
}

export async function createOrReuseLocation(name: string): Promise<LocationRecord> {
  const normalized = normalizeLocationName(name);
  if (!normalized) {
    throw new Error('Location name cannot be empty.');
  }
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{
    id: string;
    name: string;
    normalized_name: string;
    entry_count: number;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, normalized_name, entry_count, last_used_at, created_at, updated_at
     FROM locations
     WHERE normalized_name = ?`,
    [normalized],
  );
  if (existing) return mapLocation(existing);

  const now = nowIso();
  const id = makeId('loc');
  const displayName = name.trim().replace(/\s+/g, ' ');
  await db.runAsync(
    `INSERT INTO locations (id, name, normalized_name, entry_count, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, 0, NULL, ?, ?)`,
    [id, displayName, normalized, now, now],
  );
  return {
    id,
    name: displayName,
    normalizedName: normalized,
    entryCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getLocationById(id: string): Promise<LocationRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    normalized_name: string;
    entry_count: number;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, normalized_name, entry_count, last_used_at, created_at, updated_at
     FROM locations
     WHERE id = ?`,
    [id],
  );
  return row ? mapLocation(row) : null;
}

