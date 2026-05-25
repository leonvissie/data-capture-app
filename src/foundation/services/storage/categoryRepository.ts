import { nowIso } from '@/foundation/lib/dateTime';

export type CreateCategoryInput = {
  id: string;
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
};

export async function createCategory(_input: CreateCategoryInput): Promise<void> {
  const _createdAt = nowIso();
}
