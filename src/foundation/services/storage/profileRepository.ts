import { nowIso } from '@/foundation/lib/dateTime';

import { getDatabase } from './database';

export type Profile = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_PROFILE_ID = 'default';

function toProfile(row: { id: string; created_at: string; updated_at: string }): Profile {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile(profileId: string): Promise<Profile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string; created_at: string; updated_at: string }>(
    'SELECT id, created_at, updated_at FROM profiles WHERE id = ?',
    [profileId],
  );
  return row ? toProfile(row) : null;
}

export async function getOrCreateDefaultProfile(): Promise<Profile> {
  const existing = await getProfile(DEFAULT_PROFILE_ID);
  if (existing) return existing;

  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync('INSERT INTO profiles (id, created_at, updated_at) VALUES (?, ?, ?)', [DEFAULT_PROFILE_ID, now, now]);

  return {
    id: DEFAULT_PROFILE_ID,
    createdAt: now,
    updatedAt: now,
  };
}
