import type { CategoryType } from '@/foundation/types/data';
import { categoryToneByType, type ToneKey } from '@/foundation/theme';

export type CaptureCardVariant = 'solid' | 'soft';

export function resolveCaptureCategoryCardTone(categoryType: CategoryType): ToneKey {
  return categoryToneByType[categoryType];
}

export function resolveCaptureCategoryCardVariant(hasAnyCategories: boolean): CaptureCardVariant {
  return hasAnyCategories ? 'solid' : 'soft';
}

export function resolveCaptureAddCategoryCardVariant(hasAnyCategories: boolean): CaptureCardVariant {
  return hasAnyCategories ? 'soft' : 'solid';
}
