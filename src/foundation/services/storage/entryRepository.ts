import { nowIso } from '@/foundation/lib/dateTime';

import { getDatabase } from './database';

export type CreateQuickCountEntryInput = {
  categoryId: string;
  value: number;
  locationId?: string | null;
  occurredAt?: string;
  notes?: string;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createQuickCountEntry(input: CreateQuickCountEntryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const occurredAt = input.occurredAt ?? now;
  const sectionId = `${input.categoryId}::quickCount`;

  const entryId = makeId('entry');
  const entryValueId = makeId('entryv');

  await db.runAsync(
    `INSERT OR IGNORE INTO sections (id, category_id, title, section_type, sort_order, created_at, updated_at)
     VALUES (?, ?, 'Measurement', 'count', 0, ?, ?)`,
    [sectionId, input.categoryId, now, now],
  );

  await db.runAsync(
    `INSERT INTO entries (id, category_id, occurred_at, notes, location_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entryId, input.categoryId, occurredAt, input.notes ?? null, input.locationId ?? null, now, now],
  );

  await db.runAsync(
    `INSERT INTO entry_values (id, entry_id, section_id, option_id, value_text, value_number, value_boolean, action_type, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, ?, NULL, 'quickCount', ?, ?)`,
    [entryValueId, entryId, sectionId, input.value, now, now],
  );

  if (input.locationId) {
    await db.runAsync(
      `UPDATE locations
       SET entry_count = entry_count + 1,
           last_used_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [occurredAt, now, input.locationId],
    );
  }
}
