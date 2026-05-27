import { nowIso } from '@/foundation/lib/dateTime';
import { getDatabase } from '@/foundation/services/storage/database';

export type CreateCategoryInput = {
  id: string;
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
};

export type CategoryRecord = {
  id: string;
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
  createdAt: string;
  updatedAt: string;
};

export async function createCategory(input: CreateCategoryInput): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO categories (id, name, category_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [input.id, input.name, input.categoryType, now, now],
  );
}

export async function listCategories(): Promise<CategoryRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    category_type: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, category_type, created_at, updated_at
     FROM categories`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryType: row.category_type === 'timedActivity' || row.category_type === 'journal' ? row.category_type : 'quickCount',
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
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, category_type, created_at, updated_at
     FROM categories
     WHERE id = ?`,
    [id],
  );

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    categoryType: row.category_type === 'timedActivity' || row.category_type === 'journal' ? row.category_type : 'quickCount',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
