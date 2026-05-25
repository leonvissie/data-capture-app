import { CompetencyCategory, Proficiency } from '../data/types';

const CATEGORY_ORDER: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];

const LEGACY_KIND_TO_CATEGORY: Record<string, CompetencyCategory> = {
  PROFICIENCY_HANDGUN: 'Handgun',
  PROFICIENCY_RIFLE: 'Rifle',
  PROFICIENCY_SHOTGUN: 'Shotgun',
  PROFICIENCY_HANDMACHINECARBINE: 'HandMachineCarbine',
};

const isCategory = (value: unknown): value is CompetencyCategory =>
  value === 'Handgun' || value === 'Rifle' || value === 'Shotgun' || value === 'HandMachineCarbine';

export function resolveProficiencyCategories(proficiency: Proficiency): CompetencyCategory[] {
  const ordered = new Set<CompetencyCategory>();

  const certificates = Array.isArray(proficiency.proficiencyCertificates)
    ? proficiency.proficiencyCertificates
    : [];

  if (certificates.length) {
    certificates.forEach((entry) => {
      const explicit = Array.isArray(entry.categories) ? entry.categories.filter(isCategory) : [];
      if (explicit.length) {
        explicit.forEach((category) => ordered.add(category));
        return;
      }
      const derived = LEGACY_KIND_TO_CATEGORY[String(entry.kind ?? '').toUpperCase()];
      if (derived) ordered.add(derived);
    });
    return CATEGORY_ORDER.filter((category) => ordered.has(category));
  }

  (proficiency.proficiencyDocumentIds ?? []).forEach((entry) => {
    const byKind = LEGACY_KIND_TO_CATEGORY[String(entry.kind ?? '').toUpperCase()];
    if (byKind) ordered.add(byKind);
    (entry.categories ?? []).forEach((category) => {
      if (isCategory(category)) ordered.add(category);
    });
  });

  return CATEGORY_ORDER.filter((category) => ordered.has(category));
}

export function hasProficiencyCategory(
  proficiency: Proficiency,
  category: CompetencyCategory
): boolean {
  return resolveProficiencyCategories(proficiency).includes(category);
}
