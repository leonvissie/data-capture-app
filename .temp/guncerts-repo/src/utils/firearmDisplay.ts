import type { EndorsementCategory, Firearm } from '../data/types';

function normalizeDisplayPart(value?: string | null): string {
  const trimmed = `${value ?? ''}`.trim();
  if (!trimmed) return '';
  if (trimmed.toUpperCase() === 'NONE') return '';
  return trimmed;
}

export function getPrimaryFirearmSerial(firearm: Partial<Firearm>): string {
  return normalizeDisplayPart(
    firearm.firearmSerialNumber ??
      firearm.receiverSerialNumber ??
      firearm.frameSerialNumber ??
      firearm.barrelSerialNo ??
      ''
  );
}

export function formatFirearmTitle(firearm: Partial<Firearm>, fallback = 'Firearm'): string {
  const make = normalizeDisplayPart(firearm.make);
  const model = normalizeDisplayPart(firearm.model);
  const serial = getPrimaryFirearmSerial(firearm);
  const makeModel = [make, model].filter(Boolean).join(' ').trim();

  if (makeModel && serial) return `${makeModel} (${serial})`;
  if (makeModel) return makeModel;
  if (serial) return serial;
  return fallback;
}

export function formatFirearmPurposeLabel(purpose?: Firearm['purpose']): string {
  switch (purpose) {
    case 'hunting':
      return 'Hunting';
    case 'sport_shooting':
      return 'Sport shooting';
    case 'mixed_hunting_sport':
      return 'Hunting / Sport shooting';
    default:
      return '';
  }
}

export function formatFirearmLicenceLine(firearm: Partial<Firearm>): string {
  const lic = normalizeDisplayPart(firearm.licenseNumber);
  const section = normalizeDisplayPart(firearm.section);
  const purpose = formatFirearmPurposeLabel(firearm.purpose);

  const sectionWithPurpose = [section, purpose].filter(Boolean).join(' • ');

  if (lic && sectionWithPurpose) return `${lic} (${sectionWithPurpose})`;
  if (lic) return lic;
  if (sectionWithPurpose) return section ? `Section ${sectionWithPurpose}` : sectionWithPurpose;
  return 'Licence not captured';
}

export function formatEndorsementCategoryLabel(category?: EndorsementCategory | '' | null): string {
  switch (category) {
    case 'SELF_DEFENCE':
      return 'Self-defence';
    case 'HUNTING':
      return 'Hunting';
    case 'SPORT_SHOOTING':
      return 'Sport shooting';
    default:
      return '';
  }
}

export function formatEndorsementDisplayLabel(input: {
  firearmTitle: string;
  categories?: Array<EndorsementCategory | '' | null | undefined>;
}): string {
  const firearmTitle = `${input.firearmTitle ?? ''}`.trim() || 'Firearm endorsement';
  const categoryLabels = Array.from(
    new Set(
      (input.categories ?? [])
        .map((category) => formatEndorsementCategoryLabel(category))
        .filter((label) => !!label),
    ),
  );
  if (!categoryLabels.length) return firearmTitle;
  return `${firearmTitle}: ${categoryLabels.join(', ')}`;
}
