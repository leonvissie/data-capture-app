import { nowIso } from '@/foundation/lib/dateTime';
import { getDatabase } from '@/foundation/services/storage/database';
import type { JournalSectionDraft } from '@/features/categories/types/journal';

type SaveJournalEntryInput = {
  categoryId: string;
  occurredAt: string;
  locationId: string | null;
  valuesBySectionId: Record<string, string | string[]>;
  sections: JournalSectionDraft[];
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createJournalEntry(input: SaveJournalEntryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const entryId = makeId('entry');

  await db.runAsync(
    `INSERT INTO entries (id, category_id, occurred_at, notes, location_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    [entryId, input.categoryId, input.occurredAt, input.locationId, now, now],
  );

  const optionRows =
    input.sections.length > 0
      ? await db.getAllAsync<{ id: string; section_id: string; label: string }>(
          `SELECT id, section_id, label FROM options WHERE section_id IN (${input.sections.map(() => '?').join(',')})`,
          input.sections.map((section) => section.id),
        )
      : [];

  const optionsBySectionId = optionRows.reduce<Record<string, Array<{ id: string; label: string }>>>((acc, row) => {
    if (!acc[row.section_id]) acc[row.section_id] = [];
    acc[row.section_id].push({ id: row.id, label: row.label });
    return acc;
  }, {});

  for (const section of input.sections) {
    const rawValue = input.valuesBySectionId[section.id];
    if (rawValue == null) continue;

    if (section.type === 'multiSelect' && Array.isArray(rawValue)) {
      for (const selected of rawValue) {
        const option = optionsBySectionId[section.id]?.find((row) => row.label === selected);
        await db.runAsync(
          `INSERT INTO entry_values (id, entry_id, section_id, option_id, value_text, value_number, value_boolean, action_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, 'journal', ?, ?)`,
          [makeId('entryv'), entryId, section.id, option?.id ?? null, selected, now, now],
        );
      }
      continue;
    }

    const textValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const numericValue = section.type === 'number' || section.type === 'scale' ? Number(textValue) : null;
    const option = optionsBySectionId[section.id]?.find((row) => row.label === textValue);

    await db.runAsync(
      `INSERT INTO entry_values (id, entry_id, section_id, option_id, value_text, value_number, value_boolean, action_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'journal', ?, ?)`,
      [
        makeId('entryv'),
        entryId,
        section.id,
        option?.id ?? null,
        textValue,
        numericValue,
        now,
        now,
      ],
    );
  }

  if (input.locationId) {
    await db.runAsync(
      `UPDATE locations
       SET entry_count = entry_count + 1,
           last_used_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [input.occurredAt, now, input.locationId],
    );
  }
}
