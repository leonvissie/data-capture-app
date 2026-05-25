import { CompetencyCategory, Extraction, Firearm } from '../data/types';
import { competencyCertTypes } from '../data/competencyCertTypes';

const CATEGORY_LABELS: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];

export type CompetencyExtractionDraft = Partial<{
  categories: CompetencyCategory[];
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string;
  trainingProvider: string;
  licenceTypeCode: string;
}>;

function normalizeCategory(value: string): CompetencyCategory | null {
  const normalized = value.trim().toLowerCase();
  const match = CATEGORY_LABELS.find((cat) => cat.toLowerCase() === normalized);
  if (match) return match;
  if (normalized.includes('handgun') || normalized.includes('hand gun')) return 'Handgun';
  if (normalized.includes('shotgun') || normalized.includes('shot gun')) return 'Shotgun';
  if (normalized.includes('rifle')) return 'Rifle';
  if (normalized.includes('carbine') || normalized.includes('hmc')) return 'HandMachineCarbine';
  return null;
}

export function mapCompetencyExtraction(extraction: Extraction): CompetencyExtractionDraft {
  const { fields } = extraction;
  const draft: CompetencyExtractionDraft = {};

  const categoryRaw = fields.categories;
  if (categoryRaw) {
    const parts = categoryRaw
      .split(/[,;/\n]/)
      .map((part) => normalizeCategory(part))
      .filter((cat): cat is CompetencyCategory => Boolean(cat));
    if (parts.length) {
      draft.categories = Array.from(new Set(parts));
    }
  }

  if (fields.certificateNumber) {
    draft.certificateNumber = fields.certificateNumber.trim();
  }
  if (fields.issuedAt) {
    draft.issuedAt = fields.issuedAt.trim();
  }
  if (fields.expiresAt) {
    draft.expiresAt = fields.expiresAt.trim();
  }
  if (fields.trainingProvider) {
    draft.trainingProvider = fields.trainingProvider.trim();
  }
  const inferredType = inferLicenceTypeCode(extraction?.rawText ?? '');
  if (inferredType) {
    draft.licenceTypeCode = inferredType;
  }

  return draft;
}

export type FirearmExtractionDraft = Partial<{
  barCodeIdNumber: string;
  barcodeInitialSurname: string;
  firearmType: NonNullable<Firearm['firearmType']>;
  make: string;
  model: string;
  firearmSerialNumber: string;
  calibre: string;
  licenseNumber: string;
  section: string;
  validFrom: string;
  validTo: string;
  barrelMake: string;
  barrelSerialNo: string;
  receiverMake: string;
  receiverSerialNumber: string;
  frameMake: string;
  frameSerialNumber: string;
}>;

function normalizeFirearmType(value: string): NonNullable<Firearm['firearmType']> | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('hand') && (normalized.includes('gun') || normalized.includes('pistol') || normalized.includes('revolver'))) {
    return 'Handgun';
  }
  if (normalized.includes('shot') && normalized.includes('gun')) {
    return 'Shotgun';
  }
  if (normalized.includes('carbine') || normalized.includes('hmc')) {
    return 'HandMachineCarbine';
  }
  if (normalized.includes('rifle')) {
    return 'Rifle';
  }
  return null;
}

export function mapFirearmExtraction(extraction: Extraction): FirearmExtractionDraft {
  const { fields } = extraction;
  const draft: FirearmExtractionDraft = {};

  if (fields.firearmType) {
    const normalizedType = normalizeFirearmType(fields.firearmType);
    if (normalizedType) draft.firearmType = normalizedType;
  }
  if (fields.barCodeIdNumber) draft.barCodeIdNumber = fields.barCodeIdNumber.trim();
  if (fields.barcodeInitialSurname) draft.barcodeInitialSurname = fields.barcodeInitialSurname.trim();
  if (fields.make) draft.make = fields.make.trim();
  if (fields.model) draft.model = fields.model.trim();
  if (fields.firearmSerialNumber) draft.firearmSerialNumber = fields.firearmSerialNumber.trim();
  if (fields.calibre) draft.calibre = fields.calibre.trim();
  if (fields.licenseNumber) draft.licenseNumber = fields.licenseNumber.trim();
  if (fields.section) draft.section = fields.section.trim();
  if (fields.validFrom) draft.validFrom = fields.validFrom.trim();
  if (fields.validTo) draft.validTo = fields.validTo.trim();
  if (fields.barrelMake) draft.barrelMake = fields.barrelMake.trim();
  if (fields.barrelSerialNo) draft.barrelSerialNo = fields.barrelSerialNo.trim();
  if (fields.receiverMake) draft.receiverMake = fields.receiverMake.trim();
  if (fields.receiverSerialNumber) draft.receiverSerialNumber = fields.receiverSerialNumber.trim();
  if (fields.frameMake) draft.frameMake = fields.frameMake.trim();
  if (fields.frameSerialNumber) draft.frameSerialNumber = fields.frameSerialNumber.trim();

  return draft;
}

function normalizeLooseText(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function inferLicenceTypeCode(rawText: string): string | undefined {
  if (!rawText) return undefined;
  const normalizedText = normalizeLooseText(rawText);
  if (!normalizedText) return undefined;
  for (const option of competencyCertTypes) {
    const normalizedLabel = normalizeLooseText(option.label);
    if (normalizedLabel && normalizedText.includes(normalizedLabel)) {
      return option.code;
    }
    const combined = normalizeLooseText(`${option.code}${option.label}`);
    if (combined && normalizedText.includes(combined)) {
      return option.code;
    }
  }
  return undefined;
}
