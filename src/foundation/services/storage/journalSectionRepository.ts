import { nowIso } from '@/foundation/lib/dateTime';
import { getDatabase } from '@/foundation/services/storage/database';
import type { JournalSectionDraft, JournalSectionType } from '@/features/categories/types/journal';

type SectionRow = {
  id: string;
  title: string;
  section_type: string;
  sort_order: number;
  required_severity?: string;
  config_json?: string;
};

function makeSectionId(categoryId: string, index: number) {
  return `${categoryId}::journal::${index + 1}`;
}

function makeOptionId(sectionId: string, index: number) {
  return `${sectionId}::opt::${index + 1}`;
}

function normalizeType(input: string): JournalSectionType {
  if (input === 'singleSelect' || input === 'multiSelect' || input === 'scale' || input === 'number') return input;
  return 'text';
}

export async function saveJournalSections(categoryId: string, sections: JournalSectionDraft[]): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();

  await db.runAsync(`DELETE FROM options WHERE section_id IN (SELECT id FROM sections WHERE category_id = ?)`, [categoryId]);
  await db.runAsync(`DELETE FROM sections WHERE category_id = ? AND section_type IN ('singleSelect','multiSelect','scale','text','number')`, [categoryId]);

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const sectionId = makeSectionId(categoryId, i);
    const config = {
      requiredSeverity: section.requiredSeverity,
      options: section.options,
    };

    await db.runAsync(
      `INSERT INTO sections (id, category_id, title, section_type, sort_order, required_severity, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sectionId,
        categoryId,
        section.label,
        section.type,
        i,
        section.requiredSeverity,
        JSON.stringify(config),
        now,
        now,
      ],
    );

    if (section.type === 'singleSelect' || section.type === 'multiSelect') {
      for (let optionIndex = 0; optionIndex < section.options.length; optionIndex += 1) {
        const optionLabel = section.options[optionIndex];
        await db.runAsync(
          `INSERT INTO options (id, section_id, label, value_text, value_number, action_type, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          [makeOptionId(sectionId, optionIndex), sectionId, optionLabel, optionLabel, optionIndex, now, now],
        );
      }
    }
  }
}

export async function listJournalSections(categoryId: string): Promise<JournalSectionDraft[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SectionRow>(
    `SELECT id, title, section_type, sort_order, required_severity, config_json
     FROM sections
     WHERE category_id = ? AND section_type IN ('singleSelect','multiSelect','scale','text','number')
     ORDER BY sort_order ASC`,
    [categoryId],
  );

  const optionRows = await db.getAllAsync<{ section_id: string; label: string; sort_order: number }>(
    `SELECT section_id, label, sort_order
     FROM options
     WHERE section_id IN (SELECT id FROM sections WHERE category_id = ?)
     ORDER BY sort_order ASC`,
    [categoryId],
  );

  const optionsBySectionId = optionRows.reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.section_id]) acc[row.section_id] = [];
    acc[row.section_id].push(row.label);
    return acc;
  }, {});

  return rows.map((row) => {
    let requiredSeverity: 'warning' | 'blocking' = row.required_severity === 'warning' ? 'warning' : 'blocking';
    try {
      const parsed = row.config_json ? (JSON.parse(row.config_json) as { requiredSeverity?: 'warning' | 'blocking' }) : null;
      if (parsed?.requiredSeverity === 'warning' || parsed?.requiredSeverity === 'blocking') {
        requiredSeverity = parsed.requiredSeverity;
      }
    } catch {
      // ignore invalid config_json
    }

    return {
      id: row.id,
      label: row.title,
      type: normalizeType(row.section_type),
      requiredSeverity,
      options: optionsBySectionId[row.id] ?? [],
    };
  });
}
