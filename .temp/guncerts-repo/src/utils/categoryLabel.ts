import { CompetencyCategory, Firearm } from '../data/types';

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};

const isCompetencyCategory = (value: string): value is CompetencyCategory =>
  value in CATEGORY_LABELS;

export const categoryLabel = (value?: CompetencyCategory | Firearm['firearmType'] | string | null) => {
  if (!value) return '';
  const raw = String(value);
  return isCompetencyCategory(raw) ? CATEGORY_LABELS[raw] : raw;
};

export const competencyCategoryListLabel = (
  values?: Array<CompetencyCategory | string> | null,
) => {
  if (!Array.isArray(values)) return '';
  const seen = new Set<string>();
  const labels = values
    .map((value) => categoryLabel(value).trim().toLowerCase())
    .filter((label) => {
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    });
  return labels.join(', ');
};
