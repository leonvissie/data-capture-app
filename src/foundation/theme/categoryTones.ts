import type { ToneKey } from './colors';
import type { CategoryType } from '@/foundation/types/data';

export const categoryToneByType: Record<CategoryType, ToneKey> = {
  quickCount: 'lightBlue',
  timedActivity: 'pink',
  journal: 'purple',
};
