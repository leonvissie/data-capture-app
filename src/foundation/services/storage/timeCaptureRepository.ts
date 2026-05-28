import { nowIso } from '@/foundation/lib/dateTime';

import { getDatabase } from './database';

type StartTimeEntryInput = {
  categoryId: string;
  startedAt: string;
  locationId?: string | null;
  notes?: string;
};

type EndTimeEntryInput = {
  entryId: string;
  endedAt: string;
  locationId?: string | null;
};

export type ActiveTimeEntry = {
  entryId: string;
  categoryId: string;
  startedAt: string;
  locationId: string | null;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDurationSection(categoryId: string): Promise<string> {
  const db = await getDatabase();
  const now = nowIso();
  const sectionId = `${categoryId}::timedActivity`;
  await db.runAsync(
    `INSERT OR IGNORE INTO sections (id, category_id, title, section_type, sort_order, created_at, updated_at)
     VALUES (?, ?, 'Duration', 'duration', 0, ?, ?)`,
    [sectionId, categoryId, now, now],
  );
  return sectionId;
}

async function bumpLocationUsage(locationId: string, occurredAt: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync(
    `UPDATE locations
     SET entry_count = entry_count + 1,
         last_used_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [occurredAt, now, locationId],
  );
}

export async function getActiveTimeEntry(categoryId: string): Promise<ActiveTimeEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    entry_id: string;
    category_id: string;
    started_at: string;
    location_id: string | null;
  }>(
    `SELECT e.id AS entry_id, e.category_id, e.occurred_at AS started_at, e.location_id
     FROM entries e
     JOIN entry_values ev_start
       ON ev_start.entry_id = e.id AND ev_start.action_type = 'durationStart'
     LEFT JOIN entry_values ev_end
       ON ev_end.entry_id = e.id AND ev_end.action_type = 'durationEnd'
     WHERE e.category_id = ? AND ev_end.id IS NULL
     ORDER BY e.occurred_at DESC
     LIMIT 1`,
    [categoryId],
  );

  if (!row) return null;
  return {
    entryId: row.entry_id,
    categoryId: row.category_id,
    startedAt: row.started_at,
    locationId: row.location_id,
  };
}

export async function startTimeEntry(input: StartTimeEntryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const sectionId = await ensureDurationSection(input.categoryId);
  const entryId = makeId('entry');
  const entryValueId = makeId('entryv');

  await db.runAsync(
    `INSERT INTO entries (id, category_id, occurred_at, notes, location_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entryId, input.categoryId, input.startedAt, input.notes ?? null, input.locationId ?? null, now, now],
  );

  await db.runAsync(
    `INSERT INTO entry_values (id, entry_id, section_id, option_id, value_text, value_number, value_boolean, action_type, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, NULL, NULL, 'durationStart', ?, ?)`,
    [entryValueId, entryId, sectionId, input.startedAt, now, now],
  );

  if (input.locationId) {
    await bumpLocationUsage(input.locationId, input.startedAt);
  }
}

export async function endTimeEntry(input: EndTimeEntryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const entryValueId = makeId('entryv');

  const entry = await db.getFirstAsync<{ category_id: string; location_id: string | null }>(
    `SELECT category_id, location_id FROM entries WHERE id = ?`,
    [input.entryId],
  );
  if (!entry) throw new Error('Active time entry not found.');

  const sectionId = await ensureDurationSection(entry.category_id);

  await db.runAsync(
    `INSERT INTO entry_values (id, entry_id, section_id, option_id, value_text, value_number, value_boolean, action_type, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, NULL, NULL, 'durationEnd', ?, ?)`,
    [entryValueId, input.entryId, sectionId, input.endedAt, now, now],
  );

  if (!entry.location_id && input.locationId) {
    await db.runAsync(`UPDATE entries SET location_id = ?, updated_at = ? WHERE id = ?`, [input.locationId, now, input.entryId]);
    await bumpLocationUsage(input.locationId, input.endedAt);
  } else {
    await db.runAsync(`UPDATE entries SET updated_at = ? WHERE id = ?`, [now, input.entryId]);
  }
}

