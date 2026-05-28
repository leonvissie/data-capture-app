import { nowIso } from '@/foundation/lib/dateTime';
import { getDatabase } from '@/foundation/services/storage/database';

export type CreateCategoryInput = {
  id: string;
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
  measurementUnit?: string;
};

export type CategoryRecord = {
  id: string;
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
  measurementUnit: string;
  createdAt: string;
  updatedAt: string;
};

export async function createCategory(input: CreateCategoryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO categories (id, name, category_type, measurement_unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.id, input.name, input.categoryType, input.measurementUnit?.trim() ?? '', now, now],
  );
}

export async function updateCategory(input: CreateCategoryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync(
    `UPDATE categories
     SET name = ?, category_type = ?, measurement_unit = ?, updated_at = ?
     WHERE id = ?`,
    [input.name, input.categoryType, input.measurementUnit?.trim() ?? '', now, input.id],
  );
}

export async function deleteCategoryById(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
}

export async function listCategories(): Promise<CategoryRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    category_type: string;
    measurement_unit: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, category_type, measurement_unit, created_at, updated_at
     FROM categories`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryType: row.category_type === 'timedActivity' || row.category_type === 'journal' ? row.category_type : 'quickCount',
    measurementUnit: row.measurement_unit ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getCategoryById(id: string): Promise<CategoryRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    category_type: string;
    measurement_unit: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, category_type, measurement_unit, created_at, updated_at
     FROM categories
     WHERE id = ?`,
    [id],
  );

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    categoryType: row.category_type === 'timedActivity' || row.category_type === 'journal' ? row.category_type : 'quickCount',
    measurementUnit: row.measurement_unit ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategoryEntryCounts(): Promise<Record<string, number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category_id: string; count: number }>(
    `SELECT category_id, COUNT(*) AS count
     FROM entries
     GROUP BY category_id`,
  );

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category_id] = row.count;
    return acc;
  }, {});
}

export async function getCategoryEntryCountById(categoryId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM entries
     WHERE category_id = ?`,
    [categoryId],
  );

  return row?.count ?? 0;
}

export async function listCategoryLatestEntryOccurredAt(): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category_id: string; latest_occurred_at: string }>(
    `SELECT category_id, MAX(occurred_at) AS latest_occurred_at
     FROM entries
     GROUP BY category_id`,
  );

  return rows.reduce<Record<string, string>>((acc, row) => {
    if (row.latest_occurred_at) {
      acc[row.category_id] = row.latest_occurred_at;
    }
    return acc;
  }, {});
}
