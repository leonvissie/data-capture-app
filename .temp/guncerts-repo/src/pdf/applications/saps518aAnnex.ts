import policy518a from '../../policy/518a.json';
import { Application, CompetencyCategory, Firearm, CompetencyCertificate, Safe } from '../../data/types';
import {
  applyAddressWithPostalFallback,
  applyProfileDefaults,
  collectStoredFormData,
  deriveCommonFields,
  digitsOnly,
  formatCellPhone,
  hasAnyMeaningfulData,
  normalizeWhitespace,
} from './common';
import { ApplicationPdfContext } from './types';
import { resolveFieldMapAsset, resolvePdfAssetModule } from './assets';
import { FieldMap, renderTemplatePdf } from '../templates';
import { getById, listByType } from '../../data/sqlite';
import { resolveEffectiveSafeIds } from '../context';
import { resolveRequirementsForApplication } from '../../policy/resolve';
import { resolveApplicationMotivation } from '../../utils/motivationStore';

type PolicyJson = {
  pdfAnnex?: string | null;
  pdfAnnexFieldMap?: string | null;
  licenceTypes?: Record<string, LicenceTypeMeta>;
};

const policy = policy518a as PolicyJson;

function findSplitPoint(text: string, limit: number) {
  if (!text) return 0;
  if (text.length <= limit) return text.length;
  const cut = text.lastIndexOf(' ', limit);
  if (cut === -1) return limit;
  return cut;
}

function normalizeMotivationLines(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((line) => normalizeWhitespace(line))
      .join('\n');
  }
  return normalizeWhitespace(value);
}

const ANNEX_MAKE_FIELD_KEYS = ['barrelMake', 'frameMake', 'receiverMake'] as const;

function resolveAnnexMakeFontSize(value: string): number {
  const length = value.trim().length;
  if (length < 14) return 10;
  if (length < 15) return 9;
  if (length < 17) return 8;
  return 7;
}

function applyDynamicAnnexMakeFieldSizes(
  fieldMap: FieldMap,
  values: Record<string, any>
): FieldMap {
  const resolvedSize = ANNEX_MAKE_FIELD_KEYS.reduce((smallest, key) => {
    const value = String(values[key] ?? '');
    const size = resolveAnnexMakeFontSize(value);
    return Math.min(smallest, size);
  }, 10);

  return {
    ...fieldMap,
    fields: fieldMap.fields.map((field) =>
      ANNEX_MAKE_FIELD_KEYS.includes(field.key as (typeof ANNEX_MAKE_FIELD_KEYS)[number])
        ? { ...field, fontSize: resolvedSize }
        : field
    ),
  };
}

export const LICENCE_CODES = [
  '1.1',
  '1.2',
  '1.3',
  '1.4',
  '1.5',
  '1.6',
  '1.7',
  '1.8',
  '1.9',
  '2.1',
  '2.2',
  '2.3',
  '3.1',
  '3.2',
  '3.3',
  '3.4',
  '3.5',
  '3.6',
  '3.7',
] as const;

export const YES = 'YES';
export const NO = 'NO';

const COMPETENCY_CATEGORY_VALUES: CompetencyCategory[] = [
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
];

export function populateLicenceSelections(
  data: Record<string, any>,
  application: Application,
  firearm?: Firearm
) {
  const selections = new Set<string>();
  const mapSectionToCode = (section?: string): string | null => {
    const raw = `${section ?? ''}`.trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase().replace(/[^0-9]/g, '');
    if (normalized === '13') return '1.1';
    if (normalized === '15') return '1.3'; // updated mapping
    if (normalized === '16') return '1.4'; // updated mapping
    return null;
  };

  // Prefer firearm sections to determine licence types
  const firearmSections = firearm
    ? [(firearm as any).section ?? (firearm as any).licenceSection ?? (firearm as any).licenseSection]
    : Array.isArray((application as any).firearms)
      ? ((application as any).firearms as Firearm[]).map(
          (f) => (f as any).section ?? (f as any).licenceSection ?? (f as any).licenseSection
        )
      : [];

  firearmSections.forEach((section) => {
    const code = mapSectionToCode(section);
    if (code) selections.add(code);
  });

  // Fallback to any existing licTypes/fields if no firearm sections found
  if (selections.size === 0) {
    const append = (value?: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => append(entry));
        return;
      }
      const text = String(value).trim();
      if (text) selections.add(text);
    };

    append((application as any).licenceTypes);
    append((application as any).licenseTypes);
    append((application as any).licenceType);
    append((application as any).licenseType);

    const renewalSelections = (application as any).renewalSelections;
    if (Array.isArray(renewalSelections)) {
      renewalSelections.forEach((sel) => {
        append(sel?.licenceType ?? sel?.licenseType);
      });
    }

    if (Array.isArray(data.licTypes)) {
      data.licTypes.forEach((entry: any) => append(entry));
    }
  }

  data.licTypes = Array.from(selections);
}



type LicenceTypeMeta = {
  name?: string;
  section?: string;
  status?: string;
};

const LICENSE_CODE_NORMALIZER = /\.?/g;

const licenceTypeEntries: Array<[string, LicenceTypeMeta]> = policy?.licenceTypes
  ? Object.entries(policy.licenceTypes)
  : [];

const normalizeText = (input: string) => input.toLowerCase().replace(/[^a-z0-9]/g, '');

export function resolveLicenceCode(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  // Direct code like 1.4 or 14
  const direct = text.replace(LICENSE_CODE_NORMALIZER, '');
  if (/^\d+$/.test(direct)) {
    return `${direct.slice(0, 1)}.${direct.slice(1)}`;
  }
  const norm = normalizeText(text);
  if (!norm) return null;
  for (const [code, meta] of licenceTypeEntries) {
    const name = normalizeText(meta?.name ?? '');
    const section = normalizeText(meta?.section ?? '');
    if ((name && norm.includes(name)) || (section && norm.includes(section))) {
      return code;
    }
  }
  return null;
}

function normalizeLicenceCodes(raw: unknown): Set<string> {
  const selectedCodes: string[] = Array.isArray(raw) ? raw.map((code) => String(code)) : [];
  const mapped = selectedCodes
    .map((code) => resolveLicenceCode(code) ?? code)
    .map((code) => (code.includes('.') ? code : `${code.slice(0, 1)}.${code.slice(1)}`));
  return new Set(mapped);
}

function normalizeCompetencyCategory(value: unknown): CompetencyCategory | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = COMPETENCY_CATEGORY_VALUES.find(
    (category) => category.toLowerCase() === text.toLowerCase()
  );
  return match ?? null;
}

function collectCompetencyCategories(
  application: Application,
  data: Record<string, any>,
  certificates: CompetencyCertificate[]
): Set<CompetencyCategory> {
  const categories = new Set<CompetencyCategory>();

  const fromSelections = (application as any).renewalSelections;
  if (Array.isArray(fromSelections)) {
    fromSelections.forEach((sel) => {
      const list = sel?.categories;
      if (Array.isArray(list)) {
        list.forEach((category) => {
          const normalized = normalizeCompetencyCategory(category);
          if (normalized) categories.add(normalized);
        });
      }
    });
  }

  const fromApplication = (application as any).renewalCategories;
  if (Array.isArray(fromApplication)) {
    fromApplication.forEach((category) => {
      const normalized = normalizeCompetencyCategory(category);
      if (normalized) categories.add(normalized);
    });
  }

  const dataCategories = data.categories ?? data.competencyCategories ?? data.renewalCategories;
  if (Array.isArray(dataCategories)) {
    dataCategories.forEach((category) => {
      const normalized = normalizeCompetencyCategory(category);
      if (normalized) categories.add(normalized);
    });
  }

  certificates.forEach((certificate) => {
    const certCategories = certificate?.categories;
    if (Array.isArray(certCategories)) {
      certCategories.forEach((category) => {
        const normalized = normalizeCompetencyCategory(category);
        if (normalized) categories.add(normalized);
      });
    }
  });

  return categories;
}

function toLicenceFlags(codes: Set<string>): Record<string, string> {
  const flags: Record<string, string> = {};
  LICENCE_CODES.forEach((code) => {
    const key = `licType${code.replace(LICENSE_CODE_NORMALIZER, '')}`;
    flags[key] = codes.has(code) ? 'X' : '';
  });
  return flags;
}

function toCompetencyFlags(categories: Set<CompetencyCategory>): Record<string, string> {
  return {
    certHandgun: categories.has('Handgun') ? 'X' : '',
    certRifle: categories.has('Rifle') ? 'X' : '',
    certShotgun: categories.has('Shotgun') ? 'X' : '',
    certHandMachineCarbine: categories.has('HandMachineCarbine') ? 'X' : '',
  };
}

function resolveFirearmTypeMarker(type?: string): {
  firearmHandgun: string;
  firearmRifle: string;
  firearmShotgun: string;
} {
  const normalized = String(type ?? '').trim().toLowerCase();
  return {
    firearmHandgun: normalized === 'handgun' || normalized === 'handmachinecarbine' ? 'X' : '',
    firearmRifle: normalized === 'rifle' ? 'X' : '',
    firearmShotgun: normalized === 'shotgun' ? 'X' : '',
  };
}

function resolveActionMarkers(
  firearm: Firearm
): { actionSemi: string; actionAuto: string; actionManual: string; actionDescription: string } {
  const actionRaw = String(firearm.firearmAction ?? '').toUpperCase();
  if (!actionRaw) {
    return { actionSemi: '', actionAuto: '', actionManual: '', actionDescription: '' };
  }
  if (actionRaw === 'SEMI-AUTOMATIC' || actionRaw === 'SEMIAUTOMATIC' || actionRaw === 'SEMI') {
    return { actionSemi: 'X', actionAuto: '', actionManual: '', actionDescription: '' };
  }
  if (actionRaw === 'AUTOMATIC' || actionRaw === 'AUTO') {
    return { actionSemi: '', actionAuto: 'X', actionManual: '', actionDescription: '' };
  }
  if (actionRaw === 'MANUAL') {
    return { actionSemi: '', actionAuto: '', actionManual: 'X', actionDescription: '' };
  }
  const isOther = actionRaw === 'OTHER';
  const actionDescription = isOther ? '*** TO BE UPDATED ***' : '';
  return {
    actionSemi: '',
    actionAuto: '',
    actionManual: '',
    actionDescription: actionDescription ?? '',
  };
}

function resolveCheckbox(value: unknown): string {
  if (value === true) return 'X';
  const text = normalizeWhitespace(value);
  if (!text) return '';
  const upper = text.toUpperCase();
  if (upper === 'YES' || upper === 'Y' || upper === 'X' || upper === 'TRUE') {
    return 'X';
  }
  return '';
}

function buildAnnexLabel(index: number, firearm: Firearm): string {
  const parts: string[] = [`Annexure A - Firearm ${index + 1}`];
  const licence =
    firearm.licenseNumber ??
    (firearm as any).licenceNumber ??
    (firearm as any).licenceNo ??
    (firearm as any).licenseNo;
  const serial =
    firearm.firearmSerialNumber ??
    (firearm as any).serialNumber ??
    (firearm as any).firearmSerial ??
    (firearm as any).serial;
  if (licence) {
    parts.push(`Licence ${licence}`);
  } else if (serial) {
    parts.push(`Serial ${serial}`);
  }
  return parts.join(' • ');
}

type AnnexFieldOptions = {
  includeMissingDataHint: boolean;
  fieldMap?: FieldMap;
};

function buildAnnexFieldValues(
  context: ApplicationPdfContext,
  firearm: Firearm,
  certificates: CompetencyCertificate[],
  diagnostics: string[],
  options: AnnexFieldOptions
): Record<string, string | number> {
  const { application, profile } = context;
  const data = collectStoredFormData(application);
  const hadStoredFormData = Object.keys(data).length > 0;

  applyProfileDefaults(data, profile);
  populateLicenceSelections(data, application, firearm);

  if (
    options.includeMissingDataHint &&
    !hadStoredFormData &&
    !hasAnyMeaningfulData(data)
  ) {
    diagnostics.push('No stored form data found for SAPS 518a application.');
  }

  const addressCfg = (policy as any)?.addressLength ?? {};
  applyAddressWithPostalFallback(
    data,
    profile,
    addressCfg,
    options.fieldMap?.meta?.postalAddressFallbackText
  );

  const derived = deriveCommonFields(data, { yesToken: YES, noToken: NO });
  const licenceFlags = toLicenceFlags(normalizeLicenceCodes(data.licTypes));
  const competencyCategories = collectCompetencyCategories(application, data, certificates);
  const competencyFlags = toCompetencyFlags(competencyCategories);

  const manufacturerKeys = ['manufacturerNameAddress1', 'manufacturerNameAddress2'] as const;
  const manufacturerLimits = manufacturerKeys.map((key) => {
    const match = options.fieldMap?.fields?.find((field) => field.key === key);
    return typeof match?.maxLen === 'number' ? match.maxLen : 0;
  });
  const totalManufacturerLen = manufacturerLimits.reduce((sum, len) => sum + (len > 0 ? len : 0), 0);
  const manufacturerSource = normalizeWhitespace(
    firearm.manufacturerNameAddress ??
      data.manufacturerNameAddress ??
      data.manufacturerNameAddress1 ??
      data.manufacturerNameAddress2
  );
  const manufacturerParts = (() => {
    if (!manufacturerSource || totalManufacturerLen <= 0) {
      return manufacturerKeys.map(() => '');
    }
    let remaining = manufacturerSource;
    return manufacturerLimits.map((limit) => {
      if (!limit || !remaining) return '';
      const cut = findSplitPoint(remaining, limit);
      const slice = remaining.slice(0, cut).trimEnd();
      remaining = remaining.slice(cut).trimStart();
      return slice;
    });
  })();

  const safeDescriptionKeys = ['safeDescription1', 'safeDescription2', 'safeDescription3', 'safeDescription4'] as const;
  const safeDescriptionLimits = safeDescriptionKeys.map((key) => {
    const match = options.fieldMap?.fields?.find((field) => field.key === key);
    return typeof match?.maxLen === 'number' ? match.maxLen : 0;
  });
  const totalSafeDescriptionLen = safeDescriptionLimits.reduce((sum, len) => sum + (len > 0 ? len : 0), 0);
  const safeNotes = (() => {
    const safeIds = resolveEffectiveSafeIds(application);
    if (safeIds.length) {
      const safes = listByType<Safe>('Safe');
      const match = safes.find((safe) => safe?.id && safeIds.includes(String(safe.id)));
      if (match?.notes) return normalizeWhitespace(match.notes);
    }
    return normalizeWhitespace((data as any).safeNotes ?? (data as any).safeDescription ?? '');
  })();
  const safeDescriptionParts = (() => {
    if (!safeNotes || totalSafeDescriptionLen <= 0) {
      return safeDescriptionKeys.map(() => '');
    }
    let remaining = safeNotes;
    return safeDescriptionLimits.map((limit) => {
      if (!limit || !remaining) return '';
      const cut = findSplitPoint(remaining, limit);
      const slice = remaining.slice(0, cut).trimEnd();
      remaining = remaining.slice(cut).trimStart();
      return slice;
    });
  })();

  const firearmType =
    firearm.firearmType ??
    (data.firearmType ?? data.firearm_type ?? data.firearmCategory ?? data.firearmClass);
  const firearmMarkers = resolveFirearmTypeMarker(firearmType);
  const actionMarkers = resolveActionMarkers(firearm);

  const linkedMotivation = resolveApplicationMotivation(application);
  const resolvedMotivation =
    normalizeMotivationLines(
      data.motivationApplicationText ??
        data.applicationText ??
        data.motivation ??
        linkedMotivation?.text ??
        data.motivationText ??
        options.fieldMap?.meta?.motivationText
    ) || '';
  const standardAnnexMotivation =
    normalizeMotivationLines(options.fieldMap?.meta?.motivationText) || '';
  let policyMotivationText = '';
  try {
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: [firearm as any],
    });
    const motivationReq = resolved.requirements.find(
      (req) => (req.code ?? '').toUpperCase() === 'MOTIVATION'
    ) as any;
    policyMotivationText = normalizeWhitespace(motivationReq?.applicationText) || '';
  } catch {
    policyMotivationText = '';
  }
  const resolvedMotivationSource = (() => {
    const source = `${(application as any).motivationSource ?? ''}`.trim().toLowerCase();
    if (source === 'standard' || source === 'own' || source === 'wizard') {
      return source as 'standard' | 'own' | 'wizard';
    }
    // Legacy fallback for older records without motivationSource populated.
    if (application.userToSubmitMotivation === false) return 'standard';
    if (application.userToSubmitMotivation === true) return 'own';
    return 'own';
  })();
  const motivationText = (() => {
    if (resolvedMotivationSource === 'standard') {
      return standardAnnexMotivation || resolvedMotivation;
    }
    // For `own` and `wizard`, use policy "submit attached motivation" text.
    return policyMotivationText || resolvedMotivation;
  })();

  const formatDigits = (value: unknown) => digitsOnly(value);

  const result: Record<string, string | number> = {
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value ?? ''])
    ),
    ...derived,
    ...licenceFlags,
    ...competencyFlags,
    ...firearmMarkers,
    ...actionMarkers,
    manufacturerNameAddress1: manufacturerParts[0] ?? '',
    manufacturerNameAddress2: manufacturerParts[1] ?? '',
    firearmCalibre:
      normalizeWhitespace(
        firearm.calibre ??
          (firearm as any).caliber ??
          data.firearmCalibre ??
          data.firearmCaliber ??
          data.calibre ??
          data.caliber
      ) || '',
    firearmMake:
      normalizeWhitespace(firearm.make ?? data.firearmMake ?? data.make) || '',
    firearmModel:
      normalizeWhitespace(firearm.model ?? data.firearmModel ?? data.model) || '',
    barrelSerialNumber:
      normalizeWhitespace(
        (firearm as any).barrelSerialNumber ??
          firearm.barrelSerialNo ??
          (firearm as any).barrelSerial ??
          data.barrelSerialNumber ??
          data.barrelSerialNo
      ) || '',
    barrelMake:
      normalizeWhitespace(
        firearm.barrelMake ?? data.barrelMake ?? (firearm as any).barrelManufacturer
      ) || '',
    frameSerialNumber:
      normalizeWhitespace(
        firearm.frameSerialNumber ??
          (firearm as any).frameSerialNo ??
          data.frameSerialNumber ??
          data.frameSerialNo
      ) || '',
    frameMake:
      normalizeWhitespace(firearm.frameMake ?? data.frameMake ?? '') || '',
    receiverSerialNumber:
      normalizeWhitespace(
        firearm.receiverSerialNumber ??
          data.receiverSerialNumber ??
          (firearm as any).receiverSerialNo
      ) || '',
    receiverMake:
      normalizeWhitespace(firearm.receiverMake ?? data.receiverMake ?? '') || '',
    licenceNumber:
      normalizeWhitespace(
        firearm.licenseNumber ??
          (firearm as any).licenceNumber ??
          data.licenceNumber ??
          data.licenseNumber
      ) || '',
    licenceExpiry:
      normalizeWhitespace(
        data.licenceExpiry ?? data.licenseExpiry ?? (firearm as any).licenceExpiry ?? firearm.validTo
      ) || '',
    cellPhone: formatCellPhone(data.cellPhone ?? data.mobile ?? data.phone),
    postPostal: formatDigits(data.postPostal ?? data.postalCode ?? data.postCode),
    resPostal: formatDigits(data.resPostal ?? data.resPostalCode ?? data.resPostCode),
    motivationApplicationText: motivationText,
    hasCertificate:
      resolveCheckbox(
        data.hasCertificate ??
          ((application.competencyCertificateIds?.length || certificates.length)
            ? 'YES'
            : data.hasCompetency)
      ) ||
      ((application.competencyCertificateIds?.length || certificates.length) ? 'X' : ''),
    convictedOffence: resolveCheckbox(data.convictedOffence),
    declaredUnfit: resolveCheckbox(data.declaredUnfit),
    hasSafe: resolveCheckbox(data.hasSafe),
    willCarrySafely: resolveCheckbox(data.willCarrySafely),
    firearmSerialNumber:
      normalizeWhitespace(
        firearm.firearmSerialNumber ??
          (firearm as any).serialNumber ??
          data.firearmSerialNumber ??
          data.serialNumber
      ) || '',
  };
  safeDescriptionKeys.forEach((key, idx) => {
    result[key] = safeDescriptionParts[idx] ?? '';
  });
  manufacturerKeys.forEach((key, idx) => {
    result[key] = manufacturerParts[idx] ?? '';
  });
  Object.entries(result).forEach(([key, value]) => {
    if (typeof value === 'string') {
      result[key] = value.toUpperCase();
    }
  });
  const declarations = new Set(
    Array.isArray(application.declarations)
      ? application.declarations.map((value) => String(value).toUpperCase())
      : []
  );
  if (declarations.has('CONVICTED') && !result.convictedOffence) result.convictedOffence = 'X';
  if (declarations.has('FIT_TO_POSSESS') && !result.declaredUnfit) result.declaredUnfit = 'X';
  if (declarations.has('MOUNTED_SAFE') && !result.hasSafe) result.hasSafe = 'X';
  if (declarations.has('CARRY_SAFELY') && !result.willCarrySafely) result.willCarrySafely = 'X';
  return result;
}

export type AnnexPdfResult = {
  bytes: Uint8Array;
  label: string;
  diagnostics: string[];
  policyPdfPath?: string | null;
  policyFieldMapPath?: string | null;
};

function resolveAnnexAssets(): {
  pdfModule: any;
  fieldMap: FieldMap;
  policyPdfPath: string | null;
  policyFieldMapPath: string | null;
} {
  const pdfModule =
    resolvePdfAssetModule(policy.pdfAnnex) ??
    resolvePdfAssetModule('../../assets/pdf/518aAnnexA.pdf');
  if (!pdfModule) {
    throw new Error('Unable to resolve SAPS 518a Annex A PDF template. Check policy pdfAnnex path.');
  }

  const fieldMap =
    resolveFieldMapAsset(policy.pdfAnnexFieldMap) ??
    resolveFieldMapAsset('../../assets/fieldmap/518aAnnexA.json');
  if (!fieldMap) {
    throw new Error(
      'Unable to resolve SAPS 518a Annex A field map. Check policy pdfAnnexFieldMap path.'
    );
  }

  return {
    pdfModule,
    fieldMap,
    policyPdfPath: policy.pdfAnnex ?? null,
    policyFieldMapPath: policy.pdfAnnexFieldMap ?? null,
  };
}

export async function generate518aAnnexPdfs(
  context: ApplicationPdfContext
): Promise<AnnexPdfResult[]> {
  if (!context.firearms.length) {
    return [];
  }

  const certificates = resolveApplicationCompetencyCertificates(context.application);
  const { pdfModule, fieldMap, policyPdfPath, policyFieldMapPath } = resolveAnnexAssets();
  const results: AnnexPdfResult[] = [];
  let notedMissingData = false;

  for (let index = 0; index < context.firearms.length; index += 1) {
    const firearm = context.firearms[index];
    if (!firearm) continue;
    const diagnostics: string[] = [];
    const values = buildAnnexFieldValues(context, firearm, certificates, diagnostics, {
      includeMissingDataHint: !notedMissingData,
      fieldMap,
    });

    if (
      !notedMissingData &&
      diagnostics.some((entry) =>
        entry.toLowerCase().includes('no stored form data'.toLowerCase())
      )
    ) {
      notedMissingData = true;
    }

    const annexFieldMap = applyDynamicAnnexMakeFieldSizes(fieldMap, values);

    const pdf = await renderTemplatePdf({
      assetModule: pdfModule,
      fieldMap: annexFieldMap,
      data: values,
    });
    const bytes = await pdf.save();
    const label = buildAnnexLabel(index, firearm);

    results.push({
      bytes,
      label,
      diagnostics,
      policyPdfPath,
      policyFieldMapPath,
    });
  }

  return results;
}

function resolveApplicationCompetencyCertificates(
  application: Application
): CompetencyCertificate[] {
  const idsRaw = Array.isArray(application.competencyCertificateIds)
    ? application.competencyCertificateIds
    : null;
  if (!idsRaw || !idsRaw.length) return [];
  const uniqueIds = Array.from(
    new Set(
      idsRaw
        .map((id) => String(id || '').trim())
        .filter((id): id is string => Boolean(id))
    )
  );
  const certificates: CompetencyCertificate[] = [];
  uniqueIds.forEach((id) => {
    const cert = getById<CompetencyCertificate>(id);
    if (cert?.type === 'CompetencyCertificate') {
      certificates.push(cert);
    }
  });
  return certificates;
}
