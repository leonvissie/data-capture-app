import { File as FSFile } from 'expo-file-system/next';
import * as FileSystem from 'expo-file-system/legacy';
import policy518a from '../../policy/518a.json';
import type { Application, Firearm } from '../../data/types';
import { getById, listByType } from '../../data/sqlite';
import type { Document } from '../../data/types';
import type { FieldMap } from '../templates';
import { ApplicationPdfContext, ApplicationPdfGenerator, ApplicationPdfResult } from './types';
import { resolveFieldMapAsset, resolvePdfAssetModule } from './assets';
import { renderTemplatePdf } from '../templates';
import { ensurePdfWorkspace, pdfPathFor } from '../storage';
import { ensureRepeatedWatermark } from '../watermark';
import {
  applyAddressWithPostalFallback,
  applyFirearmDefaults,
  applyProfileDefaults,
  collectStoredFormData,
  deriveCommonFields,
  hasAnyMeaningfulData,
} from './common';
import { LICENCE_CODES, YES, NO, populateLicenceSelections, generate518aAnnexPdfs, resolveLicenceCode } from './saps518aAnnex';
import { appendAnnexures } from '../assembler';
//import { applyStrikeThrough, DEV_FORCE_STRIKETHROUGH } from '../utils';

type PolicyJson = {
  pdf?: string | null;
  pdfFieldMap?: string | null;
};

const policy = policy518a as PolicyJson;

const FIREARM_LICENCE_FIELD_COUNT = 4;

type FirearmLicenceFieldOptions = {
  overflowLabel?: string;
};

function normalizeFirearmFieldValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function applyFirearmLicenceFields(
  target: Record<string, string | number>,
  firearms: Firearm[],
  options: FirearmLicenceFieldOptions = {}
) {
  const setSlot = (slot: number, licence: string, issued: string, expires: string) => {
    const licenceKey = `firearmLicenceNo${slot}`;
    const licenseKey = `firearmLicenseNo${slot}`;
    target[licenceKey] = licence;
    target[licenseKey] = licence;

    const issuedKey = `${licenceKey}Issued`;
    const issuedKeyAlt = `${licenseKey}Issued`;
    target[issuedKey] = issued;
    target[issuedKeyAlt] = issued;

    const expiresKey = `${licenceKey}Expires`;
    const expiresKeyAlt = `${licenseKey}Expires`;
    target[expiresKey] = expires;
    target[expiresKeyAlt] = expires;
  };

  for (let slot = 1; slot <= FIREARM_LICENCE_FIELD_COUNT; slot += 1) {
    setSlot(slot, '', '', '');
  }

  const safeFirearms = Array.isArray(firearms)
    ? firearms.filter((firearm): firearm is Firearm => Boolean(firearm))
    : [];
  if (!safeFirearms.length) {
    return;
  }

  if (safeFirearms.length > FIREARM_LICENCE_FIELD_COUNT) {
    const label = normalizeFirearmFieldValue(options.overflowLabel ?? 'SEE ANNEXURE A1');
    setSlot(1, label, '', '');
    return;
  }

  safeFirearms.slice(0, FIREARM_LICENCE_FIELD_COUNT).forEach((firearm, index) => {
    const slot = index + 1;
    const licence = normalizeFirearmFieldValue(
      firearm.licenseNumber ??
        (firearm as any).licenseNumber ??
        (firearm as any).licenceNumber ??
        (firearm as any).licenseNo ??
        (firearm as any).licenceNo ??
        ''
    );
    const issued = normalizeFirearmFieldValue(
      (firearm as any).issuedAt ??
        (firearm as any).issuedOn ??
        (firearm as any).issueDate ??
        firearm.validFrom ??
        (firearm as any).validFrom ??
        ''
    );
    const expires = normalizeFirearmFieldValue(
      (firearm as any).expiresAt ??
        (firearm as any).expiryDate ??
        (firearm as any).expiry ??
        firearm.validTo ??
        (firearm as any).validTo ??
        ''
    );
    setSlot(slot, licence, issued, expires);
  });
}

function build518aFieldValues(
  context: ApplicationPdfContext,
  diagnostics: string[],
  fieldMap?: FieldMap | null
): Record<string, string | number> {
  const {
    application,
    profile,
    firearms,
    competencyCertificates: _competencyCertificates,
  } = context;
  const data = collectStoredFormData(application);
  const hadStoredFormData = Object.keys(data).length > 0;

  applyProfileDefaults(data, profile);
  populateLicenceSelections(data, application);
  applyFirearmDefaults(data, firearms);

  if (!hadStoredFormData) {
    if (!hasAnyMeaningfulData(data)) {
      diagnostics.push('No stored form data found for SAPS 518a application.');
    }
  }

  const derived = deriveCommonFields(data, { yesToken: YES, noToken: NO });
  if (
    profile?.isForeignNational &&
    `${profile?.idType ?? ''}`.toUpperCase() === 'PASSPORT' &&
    hasPermanentResidencePermit(profile)
  ) {
    derived.idTypePR = 'X';
    derived.idTypePassport = '';
  }

  const addressCfg = (policy518a as any)?.addressLength ?? {};
  applyAddressWithPostalFallback(
    data,
    profile,
    addressCfg,
    fieldMap?.meta?.postalAddressFallbackText
  );

  const mapSectionToCode = (section?: string): string | null => {
    const raw = `${section ?? ''}`.trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase().replace(/[^0-9]/g, '');
    if (normalized === '13') return '1.1'; // Self-defence
    if (normalized === '15') return '1.4'; // Occasional hunting/sport
    if (normalized === '16') return '1.5'; // Dedicated hunting/sport
    return null;
  };

  const firearmCodes = (firearms ?? [])
    .map((firearm) => mapSectionToCode((firearm as any).section ?? (firearm as any).licenceSection ?? (firearm as any).licenseSection))
    .filter(Boolean) as string[];

  const selectedCodesRaw: string[] = firearmCodes.length
    ? firearmCodes
    : Array.isArray(data.licTypes)
      ? data.licTypes.map((code: any) => String(code))
      : [];

  const selectedCodes = selectedCodesRaw.map((code) => resolveLicenceCode(code) ?? code);
  const normalizedCodes = new Set(
    selectedCodes.map((code) => (code.includes('.') ? code : `${code.slice(0, 1)}.${code.slice(1)}`))
  );
  LICENCE_CODES.forEach((code) => {
    const key = `licType${code.replace('.', '')}`;
    derived[key] = normalizedCodes.has(code) ? 'X' : '';
  });

  const result: Record<string, string | number> = {
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value ?? ''])
    ),
    ...derived,
  };
  applyFirearmLicenceFields(result, firearms, {
    overflowLabel: fieldMap?.meta?.moreThan4Firearms,
  });
  Object.entries(result).forEach(([key, value]) => {
    if (typeof value === 'string') {
      result[key] = value.toUpperCase();
    }
  });
  return result;
}

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

async function renderAndStorePdf(
  context: ApplicationPdfContext,
  diagnostics: string[]
): Promise<ApplicationPdfResult> {
  const { application } = context;
  const pdfModule =
    resolvePdfAssetModule(policy.pdf) ?? resolvePdfAssetModule('../../assets/pdf/518a.pdf');
  if (!pdfModule) {
    throw new Error('Unable to resolve SAPS 518a PDF template. Check policy pdf path.');
  }

  const fieldMap =
    resolveFieldMapAsset(policy.pdfFieldMap) ??
    resolveFieldMapAsset('../../assets/fieldmap/518a.json');
  if (!fieldMap) {
    throw new Error('Unable to resolve SAPS 518a field map. Check policy pdfFieldMap path.');
  }

  const values = build518aFieldValues(context, diagnostics, fieldMap);
  const pdf = await renderTemplatePdf({
    assetModule: pdfModule,
    fieldMap,
    data: values,
  });

  const annexes = await generate518aAnnexPdfs(context);
  if (annexes.length) {
    annexes.forEach((annex) => {
      if (Array.isArray(annex.diagnostics) && annex.diagnostics.length) {
        diagnostics.push(...annex.diagnostics);
      }
    });
    await appendAnnexures(
      pdf,
      annexes.map((annex) => ({
        label: annex.label,
        bytes: annex.bytes,
      }))
    );
  }

  if (application.paymentReceived !== true) {
    await ensureRepeatedWatermark(pdf, {});
  }

  const pdfBytes = await pdf.save();

  await ensurePdfWorkspace();
  const target = await pdfPathFor(application.id, 'SAPS-518a');
  if (!target) {
    throw new Error('Unable to resolve output path for SAPS 518a PDF.');
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

export const saps518aGenerator: ApplicationPdfGenerator = {
  form: '518a',
  async generate(context: ApplicationPdfContext): Promise<ApplicationPdfResult> {
    const diagnostics: string[] = [];
    return renderAndStorePdf(context, diagnostics);
  },
};
