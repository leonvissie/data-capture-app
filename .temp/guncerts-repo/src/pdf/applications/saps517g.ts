import { File as FSFile } from 'expo-file-system/next';
import * as FileSystem from 'expo-file-system/legacy';
import policy517g from '../../policy/517g.json';
import { ApplicationPdfContext, ApplicationPdfGenerator, ApplicationPdfResult } from './types';
import { resolveFieldMapAsset, resolvePdfAssetModule } from './assets';
import { FieldMap, renderTemplatePdf } from '../templates';
import { ensurePdfWorkspace, pdfPathFor } from '../storage';
import { ensureRepeatedWatermark } from '../watermark';
import { Application, CompetencyCategory, CompetencyCertificate, Document } from '../../data/types';
import { listByType } from '../../data/sqlite';
import {
  applyAddressWithPostalFallback,
  applyFirearmDefaults,
  applyProfileDefaults,
  collectStoredFormData,
  deriveCommonFields,
  hasAnyMeaningfulData,
} from './common';

type PolicyJson = {
  pdf?: string | null;
  pdfFieldMap?: string | null;
};

const policy = policy517g as PolicyJson;

const CATEGORY_TO_LETTER: Record<CompetencyCategory, string> = {
  Handgun: 'H',
  Rifle: 'R',
  Shotgun: 'S',
  HandMachineCarbine: 'M',
};

const COMPETENCY_SUFFIXES = [
  'H',
  'HR',
  'R',
  'S',
  'HS',
  'RS',
  'HRS',
  'M',
  'HM',
  'HMR',
  'HMRS',
  'MR',
  'MRS',
  'MS',
] as const;

type CompetencySuffix = typeof COMPETENCY_SUFFIXES[number];

const LICENCE_TYPE_FIELD_MAP: Record<string, string> = {
  '1.1': 'certPossess',
  '1.2': 'certTrade',
  '1.3': 'certManufacture',
  '1.4': 'certBusiness',
  '1.5': 'certCollector',
  '1.6': 'certMuzzle',
};

function hasPermanentResidencePermit(profile?: { id?: string | null }): boolean {
  if (!profile?.id) return false;
  const profileId = String(profile.id);
  return listByType<Document>('Document').some((doc) => {
    if (!doc || doc.deleted) return false;
    if (String(doc.kind ?? '').toUpperCase() !== 'PASSPORT') return false;
    if ((doc.parentType as unknown as string)?.toLowerCase() !== 'profile') return false;
    if (!doc.parentId || String(doc.parentId) !== profileId) return false;
    const label = `${doc.name ?? doc.requirementRelatedLabel ?? ''}`.trim().toLowerCase();
    return label === 'permanent residence permit';
  });
}

function mapCategoryToLetter(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, '');
  const match = (Object.keys(CATEGORY_TO_LETTER) as CompetencyCategory[]).find(
    (key) => key.toLowerCase().replace(/[^a-z]/g, '') === normalized
  );
  return match ? CATEGORY_TO_LETTER[match] : null;
}

function categoriesToSuffix(input: unknown): string | null {
  const values = Array.isArray(input)
    ? input
    : input == null
    ? []
    : [input];
  const letters = values
    .map(mapCategoryToLetter)
    .filter((letter): letter is string => Boolean(letter));
  if (!letters.length) return null;
  const unique = Array.from(new Set(letters));
  unique.sort();
  return unique.join('');
}

function collectApplicationSuffixes(application: Application): CompetencySuffix[] {
  const combos = new Set<string>();

  const selections = (application as any).renewalSelections;
  if (Array.isArray(selections) && selections.length) {
    selections.forEach((sel) => {
      const suffix = categoriesToSuffix(sel?.categories);
      if (suffix) combos.add(suffix);
    });
  }

  const fallback = categoriesToSuffix((application as any).renewalCategories);
  if (fallback) {
    combos.add(fallback);
  }

  return Array.from(combos).filter((suffix): suffix is CompetencySuffix =>
    COMPETENCY_SUFFIXES.includes(suffix as CompetencySuffix)
  );
}

function collectCertificateSuffixMap(certificates: CompetencyCertificate[]): Map<CompetencySuffix, CompetencyCertificate> {
  const map = new Map<CompetencySuffix, CompetencyCertificate>();
  certificates.forEach((cert) => {
    const suffix = categoriesToSuffix(cert?.categories);
    if (!suffix) return;
    if (!COMPETENCY_SUFFIXES.includes(suffix as CompetencySuffix)) return;
    const typed = suffix as CompetencySuffix;
    if (!map.has(typed)) {
      map.set(typed, cert);
    }
  });
  return map;
}

function build517gFieldValues(
  context: ApplicationPdfContext,
  diagnostics: string[],
  fieldMap?: FieldMap | null
): Record<string, string | number> {
  const { application, profile, firearms, competencyCertificates } = context;
  const data = collectStoredFormData(application);
  const hadStoredFormData = Object.keys(data).length > 0;

  applyProfileDefaults(data, profile);
  applyFirearmDefaults(data, firearms);

  const certificateSuffixMap = collectCertificateSuffixMap(competencyCertificates);
  const suffixesFromCertificates = Array.from(certificateSuffixMap.keys());
  const fallbackSuffixes = collectApplicationSuffixes(application);
  const activeSuffixes = suffixesFromCertificates.length
    ? suffixesFromCertificates
    : fallbackSuffixes;
  const selectedSuffixes = new Set<CompetencySuffix>(activeSuffixes);

  if (!hadStoredFormData) {
    if (!hasAnyMeaningfulData(data) && selectedSuffixes.size === 0) {
      diagnostics.push('No stored form data found for SAPS 517g application.');
    }
  }

  const derived = deriveCommonFields(data);
  if (
    profile?.isForeignNational &&
    `${profile?.idType ?? ''}`.toUpperCase() === 'PASSPORT' &&
    hasPermanentResidencePermit(profile)
  ) {
    derived.idTypePR = 'X';
    derived.idTypePassport = '';
  }

  const addressCfg = (policy517g as any)?.addressLength ?? {};
  applyAddressWithPostalFallback(
    data,
    profile,
    addressCfg,
    fieldMap?.meta?.postalAddressFallbackText
  );

  COMPETENCY_SUFFIXES.forEach((suffix) => {
    const typedSuffix = suffix as CompetencySuffix;
    const key = `licType${suffix}`;
    derived[key] = selectedSuffixes.has(typedSuffix) ? 'X' : '';
    if (selectedSuffixes.has(typedSuffix)) {
      const cert = certificateSuffixMap.get(typedSuffix);
      if (cert?.certificateNumber) {
        derived[`${key}certNumber`] = cert.certificateNumber;
      }
      if (cert?.issuedAt) {
        derived[`${key}date`] = cert.issuedAt;
      }
      derived[`${key}expire`] = '';
    }
  });

  competencyCertificates.forEach((cert) => {
    const licenceTypes = Array.isArray(cert.licenceTypes) ? cert.licenceTypes : [];
    licenceTypes.forEach((lt) => {
      const normalized = String(lt ?? '').trim();
      if (!normalized) return;
      const fieldKey = LICENCE_TYPE_FIELD_MAP[normalized];
      if (fieldKey) {
        derived[fieldKey] = 'X';
      }
    });
  });

  return {
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value ?? ''])
    ),
    ...derived,
  };
}

async function renderAndStorePdf(
  context: ApplicationPdfContext,
  diagnostics: string[]
): Promise<ApplicationPdfResult> {
  const { application } = context;
  const pdfModule =
    resolvePdfAssetModule(policy.pdf) ?? resolvePdfAssetModule('../../assets/pdf/517g.pdf');
  if (!pdfModule) {
    throw new Error('Unable to resolve SAPS 517g PDF template. Check policy pdf path.');
  }

  const fieldMap =
    resolveFieldMapAsset(policy.pdfFieldMap) ??
    resolveFieldMapAsset('../../assets/fieldmap/517g.json');
  if (!fieldMap) {
    throw new Error('Unable to resolve SAPS 517g field map. Check policy pdfFieldMap path.');
  }

  const values = build517gFieldValues(context, diagnostics, fieldMap);
  const pdf = await renderTemplatePdf({
    assetModule: pdfModule,
    fieldMap,
    data: values,
  });

  if (application.paymentReceived !== true) {
    await ensureRepeatedWatermark(pdf, {});
  }

  const pdfBytes = await pdf.save();

  await ensurePdfWorkspace();
  const target = await pdfPathFor(application.id, 'SAPS-517g');
  if (!target) {
    throw new Error('Unable to resolve output path for SAPS 517g PDF.');
  }

  await FileSystem.deleteAsync(target.absolute, { idempotent: true }).catch(() => {});
  const output = new FSFile(target.absolute);
  await output.write(pdfBytes);

  return {
    uri: target.uri,
    absolutePath: target.absolute,
    pageCount: pdf.getPageCount(),
    policyPdfPath: policy.pdf ?? null,
    policyFieldMapPath: policy.pdfFieldMap ?? null,
    generated: true,
    diagnostics,
  };
}

export const saps517gGenerator: ApplicationPdfGenerator = {
  form: '517g',
  async generate(context: ApplicationPdfContext): Promise<ApplicationPdfResult> {
    const diagnostics: string[] = [];
    return renderAndStorePdf(context, diagnostics);
  },
};
