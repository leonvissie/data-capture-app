import { getById } from '../data/sqlite';
import type {
  ActivityEvidence,
  Application,
  CompetencyCategory,
  CompetencyCertificate,
  Document,
  Firearm,
  Membership,
  Proficiency,
  Safe,
} from '../data/types';
import { resolveRequirementsForApplication } from '../policy/resolve';
import { resolveApplicationFirearms } from '../pdf/context';
import { compareAnnexureReferences } from '../utils/annexureOrder';
import { categoryLabel, competencyCategoryListLabel } from '../utils/categoryLabel';
import { resolveTemplateVariables } from '../config/motivation/variableResolver';
import { getMembershipDocumentLabel } from '../utils/membershipDocumentLabels';
import { resolveActivityEvidenceForProfile } from '../pdf/context';
import { formatEndorsementCategoryLabel, formatFirearmTitle } from './firearmDisplay';

export type AnnexureItem = {
  annexure: string;
  label: string;
  requirementCode: string;
  evidenceKeys: string[];
  satisfied: boolean;
  includedByAttachment: boolean;
  sourceDocumentId?: string;
};

export type AnnexureBuildMode = 'detailed' | 'aggregated';

const MEMBERSHIP_DOC_CODES = new Set([
  'ASSOCIATION_MEMBERSHIP',
  'ASSOCIATION_LETTER',
  'DEDICATED_HUNTER_CERT',
  'DEDICATED_SPORT_CERT',
  'FIREARM_ENDORSEMENT',
]);
const PROFICIENCY_DOC_CODES = new Set([
  'PROFICIENCY_HANDGUN',
  'PROFICIENCY_RIFLE',
  'PROFICIENCY_SHOTGUN',
  'PROFICIENCY_HANDMACHINECARBINE',
]);
const PROFICIENCY_TYPE_LABELS: Record<string, string> = {
  PROFICIENCY_HANDGUN: 'handgun',
  PROFICIENCY_RIFLE: 'rifle',
  PROFICIENCY_SHOTGUN: 'shotgun',
  PROFICIENCY_HANDMACHINECARBINE: 'hand machine carbine',
};
const PROFICIENCY_TYPE_ORDER = [
  'PROFICIENCY_HANDGUN',
  'PROFICIENCY_RIFLE',
  'PROFICIENCY_SHOTGUN',
  'PROFICIENCY_HANDMACHINECARBINE',
];
const MEMBERSHIP_DOC_KIND_LABELS: Record<string, string> = {
  ASSOCIATION_MEMBERSHIP: 'Proof of membership',
  ASSOCIATION_LETTER: 'Proof of membership',
  DEDICATED_HUNTER_CERT: 'Dedicated hunter certificate',
  DEDICATED_SPORT_CERT: 'Dedicated sport certificate',
  FIREARM_ENDORSEMENT: 'Endorsement',
};
const PROFICIENCY_DOC_KIND_LABELS: Record<string, string> = {
  PROFICIENCY_HANDGUN: 'Handgun proficiency',
  PROFICIENCY_RIFLE: 'Rifle proficiency',
  PROFICIENCY_SHOTGUN: 'Shotgun proficiency',
  PROFICIENCY_HANDMACHINECARBINE: 'Hand machine carbine proficiency',
  STATEMENT_OF_RESULTS_KNOWLEDGE: 'Knowledge of the Act',
  STATEMENT_OF_RESULTS_HANDLE_USE_1: 'Handle and use results 1',
  STATEMENT_OF_RESULTS_HANDLE_USE_2: 'Handle and use results 2',
  STATEMENT_OF_RESULTS_HANDLE_USE_3: 'Handle and use results 3',
  STATEMENT_OF_RESULTS_HANDLE_USE_4: 'Handle and use results 4',
};
const SAFE_PHOTO_LABELS: Record<string, string> = {
  CLOSED: 'Closed',
  OPEN: 'Open',
  BOLTS: 'Bolts',
  SERIAL: 'Serial',
  SABS: 'SABS',
  OTHER: 'Other',
};
const IDENTITY_SIDE_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  both: 'Front & Back',
  not_applicable: 'Not Applicable',
};
const PROFICIENCY_CATEGORY_ORDER = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'] as const;
const PROFICIENCY_CATEGORY_LABELS: Record<string, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};
const LEGACY_PROFICIENCY_KIND_TO_CATEGORY: Partial<Record<string, keyof typeof PROFICIENCY_CATEGORY_LABELS>> = {
  PROFICIENCY_HANDGUN: 'Handgun',
  PROFICIENCY_RIFLE: 'Rifle',
  PROFICIENCY_SHOTGUN: 'Shotgun',
  PROFICIENCY_HANDMACHINECARBINE: 'HandMachineCarbine',
};
const COMPETENCY_CATEGORY_ORDER: CompetencyCategory[] = [
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
];

function normalizeCode(value: unknown): string {
  return `${value ?? ''}`.trim().toUpperCase();
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isMeaningfulToken(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && normalized.toUpperCase() !== 'NONE';
}

function splitAnnexureRef(value: string): { base: string; suffix: number | null } {
  const normalized = `${value ?? ''}`.trim().toUpperCase();
  const match = /^([A-Z]+)(\d+)?$/.exec(normalized);
  if (!match) return { base: normalized, suffix: null };
  return { base: match[1] ?? normalized, suffix: match[2] ? Number(match[2]) : null };
}

function getByIdSafe<T>(id?: string | null): T | null {
  if (!id) return null;
  return getById<T>(String(id)) ?? null;
}

function resolveSelectedActivityEvidenceWithPhotos(
  application: Application,
  fresh: Application
): ActivityEvidence[] {
  const effectiveActivityEvidenceIds = Array.from(
    new Set(
      [...(application.activityEvidenceIds ?? []), ...(fresh.activityEvidenceIds ?? [])]
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  );

  const selectedByIds = effectiveActivityEvidenceIds
    .map((id) => getByIdSafe<ActivityEvidence>(id))
    .filter(
      (item): item is ActivityEvidence =>
        Boolean(item && !item.deleted && Array.isArray(item.photos) && item.photos.length > 0)
    );

  if (selectedByIds.length) return selectedByIds;

  return resolveActivityEvidenceForProfile(fresh.applicantProfileId ?? null).filter(
    (item) => !item.deleted && Array.isArray(item.photos) && item.photos.length > 0
  );
}

function buildActivityEvidenceGroupedLabel(evidence: ActivityEvidence[]): string {
  const hasHunting = evidence.some((item) => normalizeCode((item as any)?.evidenceType) === 'HUNTING');
  const hasSport = evidence.some((item) => {
    const evidenceType = normalizeCode((item as any)?.evidenceType);
    return evidenceType === 'SPORT_SHOOTING' || evidenceType === 'SPORT SHOOTING';
  });
  const typeLabels = [hasHunting ? 'Hunting' : null, hasSport ? 'Sport shooting' : null]
    .filter(Boolean)
    .join(', ');
  return typeLabels ? `Activity evidence (${typeLabels})` : 'Activity evidence';
}

function resolveDocCode(doc: Document): string {
  return normalizeCode(doc.requirementCode ?? doc.kind);
}

function resolveSafePhotoKindLabel(doc: Document, safe: Safe | null | undefined): string {
  const bySafe = safe?.safePhotos?.find((photo) => String(photo.documentId ?? '') === String(doc.id ?? ''))?.category;
  const safeCode = normalizeCode(bySafe);
  if (SAFE_PHOTO_LABELS[safeCode]) return SAFE_PHOTO_LABELS[safeCode];
  const code = resolveDocCode(doc);
  if (SAFE_PHOTO_LABELS[code]) return SAFE_PHOTO_LABELS[code];
  const related = normalizeCode(doc.requirementRelatedLabel);
  if (SAFE_PHOTO_LABELS[related]) return SAFE_PHOTO_LABELS[related];
  const name = normalizeCode(doc.name);
  if (SAFE_PHOTO_LABELS[name]) return SAFE_PHOTO_LABELS[name];
  return 'Other';
}

function buildDetailedSupportingStyleLabel(input: {
  doc: Document;
  requirementCode: string;
  requirementLabel?: string;
  groupLabel?: string;
  requirementDocumentKinds?: Array<{ kind?: string; numberOfSides?: number }>;
  firearm?: Firearm | null;
  competency?: CompetencyCertificate | null;
  membership?: Membership | null;
  safe?: Safe | null;
  proficiency?: Proficiency | null;
}): string {
  const {
    doc,
    requirementCode,
    requirementLabel,
    groupLabel,
    requirementDocumentKinds,
    firearm,
    competency,
    safe,
    proficiency,
  } = input;
  const codeUpper = normalizeCode(requirementCode);
  const docCodeUpper = normalizeCode(doc.requirementCode ?? doc.kind);
  const isMembershipDoc =
    MEMBERSHIP_DOC_CODES.has(docCodeUpper) ||
    MEMBERSHIP_DOC_CODES.has(codeUpper) ||
    `${doc.parentType ?? ''}`.toLowerCase() === 'membership';
  const isSafeDoc =
    codeUpper.includes('SAFE') ||
    docCodeUpper.includes('SAFE') ||
    `${doc.parentType ?? ''}`.toLowerCase() === 'safe';
  const isProficiencyDoc =
    PROFICIENCY_DOC_CODES.has(docCodeUpper) ||
    PROFICIENCY_DOC_CODES.has(codeUpper) ||
    Boolean(proficiency) ||
    `${doc.parentType ?? ''}`.toLowerCase() === 'proficiency' ||
    docCodeUpper.startsWith('STATEMENT_OF_RESULTS_') ||
    codeUpper.startsWith('STATEMENT_OF_RESULTS_');

  const baseLabel = codeUpper.includes('SAFE') && doc.name ? doc.name : requirementLabel;
  let label = baseLabel ?? doc.name ?? 'Supporting document';
  const trimmedGroup = `${groupLabel ?? ''}`.trim();

  const firearmLicence =
    firearm?.licenseNumber?.trim() ??
    (firearm && (firearm as any).licenceNumber ? String((firearm as any).licenceNumber).trim() : undefined);
  const competencyNumber = competency?.certificateNumber?.trim();
  const competencyCategories = competencyCategoryListLabel(competency?.categories);

  let detail: string | undefined;
  if (firearmLicence) {
    detail = firearmLicence;
  } else if (competencyNumber) {
    detail = competencyCategories ? `${competencyNumber} (${competencyCategories})` : competencyNumber;
  } else if (trimmedGroup.length) {
    detail = trimmedGroup;
  }

  if (isMembershipDoc) {
    const membershipName = String(doc.requirementRelatedLabel ?? '').trim() || 'Membership';
    const kindLabel = getMembershipDocumentLabel(docCodeUpper);
    const friendly = kindLabel || baseLabel || label;
    if (docCodeUpper === 'FIREARM_ENDORSEMENT') {
      const rawFirearmLabel = (doc.name ?? '').trim() || 'Firearm';
      const firearmLabel = rawFirearmLabel.includes(':')
        ? rawFirearmLabel.split(':')[0].trim() || rawFirearmLabel
        : rawFirearmLabel;
      const categoriesFromMembership = Array.from(
        new Set(
          (input.membership?.membershipDocumentIds ?? [])
            .filter((entry) => String(entry?.documentId ?? '') === String(doc.id ?? ''))
            .map((entry) => formatEndorsementCategoryLabel(entry?.category))
            .filter(Boolean),
        ),
      );
      const categoriesFromDocName =
        categoriesFromMembership.length === 0 && rawFirearmLabel.includes(':')
          ? rawFirearmLabel
              .split(':')
              .slice(1)
              .join(':')
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean)
          : [];
      const categories = categoriesFromMembership.length
        ? categoriesFromMembership
        : categoriesFromDocName;
      const categorySuffix = categories.length ? `: ${categories.join(', ')}` : '';
      label = `${membershipName} Endorsement: ${firearmLabel}${categorySuffix}`;
    } else {
      label = `${membershipName} - ${friendly}`;
    }
  } else if (isProficiencyDoc) {
    const providerName =
      proficiency?.trainingProviderName?.trim() ||
      String(doc.requirementRelatedLabel ?? '').trim() ||
      'Proficiency';
    const proficiencyEntry = (proficiency?.proficiencyDocumentIds ?? []).find(
      (entry) => String(entry?.documentId ?? '') === String(doc.id ?? '')
    );
    const entryKind = String(proficiencyEntry?.kind ?? docCodeUpper).toUpperCase();
    const categories = Array.from(
      new Set((proficiencyEntry?.categories ?? []).filter((value) => PROFICIENCY_CATEGORY_LABELS[String(value)]))
    ) as Array<keyof typeof PROFICIENCY_CATEGORY_LABELS>;
    if (!categories.length && LEGACY_PROFICIENCY_KIND_TO_CATEGORY[entryKind]) {
      categories.push(LEGACY_PROFICIENCY_KIND_TO_CATEGORY[entryKind] as keyof typeof PROFICIENCY_CATEGORY_LABELS);
    }
    const orderedCategoryLabels = PROFICIENCY_CATEGORY_ORDER
      .filter((category) => categories.includes(category))
      .map((category) => PROFICIENCY_CATEGORY_LABELS[category]);
    const isSor = entryKind.startsWith('STATEMENT_OF_RESULTS_');
    if (isSor) {
      const parts =
        entryKind === 'STATEMENT_OF_RESULTS_KNOWLEDGE'
          ? ['Knowledge of the Act', ...orderedCategoryLabels]
          : orderedCategoryLabels.length
            ? orderedCategoryLabels
            : ['Handle and use results'];
      label = `Statement of Results: ${providerName} (${parts.join(', ')})`;
    } else {
      const parts = orderedCategoryLabels.length ? orderedCategoryLabels : ['Proficiency'];
      label = `Proficiency: ${providerName} (${parts.join(', ')})`;
    }
  } else if (isSafeDoc) {
    const safeName = safe?.safeName?.trim() || 'Safe';
    const category = resolveSafePhotoKindLabel(doc, safe);
    label = `${safeName} (${category})`;
  } else if (detail && detail.length) {
    const isProofOfAddress =
      codeUpper === 'PROOF_ADDRESS' ||
      codeUpper.includes('PROOF_ADDRESS') ||
      docCodeUpper === 'PROOF_ADDRESS' ||
      docCodeUpper.includes('PROOF_ADDRESS');
    if (!isProofOfAddress) {
      label = `${label} - ${detail}`;
    }
  }

  const requirementSides = requirementDocumentKinds
    ?.map((entry) => entry?.numberOfSides)
    .filter((value): value is number => typeof value === 'number');
  const allowsMultiSide = (requirementSides?.some((value) => value > 1)) === true;
  if (
    allowsMultiSide &&
    !isMembershipDoc &&
    !isSafeDoc &&
    doc.identityDocumentSide &&
    doc.identityDocumentSide !== 'not_applicable'
  ) {
    const side = IDENTITY_SIDE_LABELS[String(doc.identityDocumentSide)] ?? String(doc.identityDocumentSide);
    label = `${label} (${side.toUpperCase()})`;
  }
  return label.replace(/\s+/g, ' ').trim();
}

function resolveProficiencyTypeLabels(
  proficiency: Proficiency | null,
  proficiencyId: string,
  docs: Document[]
): string[] {
  const kinds = new Set<string>();
  (proficiency?.proficiencyDocumentIds ?? []).forEach((entry) => {
    const kind = `${entry?.kind ?? ''}`.trim().toUpperCase();
    if (kind) kinds.add(kind);
  });
  (proficiency?.proficiencyCertificates ?? []).forEach((entry) => {
    const kind = `${entry?.kind ?? ''}`.trim().toUpperCase();
    if (kind) kinds.add(kind);
  });

  docs.forEach((doc) => {
    const parentType = `${doc.parentType ?? ''}`.trim().toUpperCase();
    const parentId = `${doc.parentId ?? ''}`.trim();
    const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
    if (
      proficiencyId &&
      !((parentType === 'PROFICIENCY' && parentId === proficiencyId) || relatedId === proficiencyId)
    ) {
      return;
    }
    const code = `${doc.requirementCode ?? doc.kind ?? ''}`.trim().toUpperCase();
    if (PROFICIENCY_TYPE_LABELS[code]) kinds.add(code);
  });

  return PROFICIENCY_TYPE_ORDER
    .filter((code) => kinds.has(code))
    .map((code) => PROFICIENCY_TYPE_LABELS[code])
    .filter((value, index, array) => array.indexOf(value) === index);
}

function resolveStatementOfResultsLabels(
  proficiency: Proficiency | null,
  proficiencyId: string,
  docs: Document[],
  requirementCode: string
): string[] {
  const kinds = new Set<string>();
  const categories = new Set<CompetencyCategory>();

  (proficiency?.proficiencyDocumentIds ?? []).forEach((entry) => {
    const kind = `${entry?.kind ?? ''}`.trim().toUpperCase();
    if (kind.startsWith('STATEMENT_OF_RESULTS_')) kinds.add(kind);
    (entry?.categories ?? []).forEach((category) => categories.add(category));
  });
  (proficiency?.proficiencyCertificates ?? []).forEach((entry) => {
    const kind = `${entry?.kind ?? ''}`.trim().toUpperCase();
    if (kind.startsWith('STATEMENT_OF_RESULTS_')) kinds.add(kind);
    (entry?.categories ?? []).forEach((category) => categories.add(category));
  });

  docs.forEach((doc) => {
    const parentType = `${doc.parentType ?? ''}`.trim().toUpperCase();
    const parentId = `${doc.parentId ?? ''}`.trim();
    const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
    if (
      proficiencyId &&
      !((parentType === 'PROFICIENCY' && parentId === proficiencyId) || relatedId === proficiencyId)
    ) {
      return;
    }
    const code = `${doc.requirementCode ?? doc.kind ?? ''}`.trim().toUpperCase();
    if (code.startsWith('STATEMENT_OF_RESULTS_')) kinds.add(code);
  });

  if (requirementCode.startsWith('STATEMENT_OF_RESULTS_')) kinds.add(requirementCode);

  const labels: string[] = [];
  if (kinds.has('STATEMENT_OF_RESULTS_KNOWLEDGE')) labels.push('knowledge of the act');

  const categoryLabels = COMPETENCY_CATEGORY_ORDER
    .filter((category) => categories.has(category))
    .map((category) => categoryLabel(category).toLowerCase());
  labels.push(...categoryLabels);

  const hasHandleUse = Array.from(kinds).some((kind) => kind.startsWith('STATEMENT_OF_RESULTS_HANDLE_USE_'));
  if (hasHandleUse && !categoryLabels.length) labels.push('handle and use');

  return labels.filter((value, index, array) => array.indexOf(value) === index);
}

function buildFirearmLabel(firearm: Firearm | null, fallback?: string): string {
  const description = resolveTemplateVariables('${firearmDescription}', {
    values: {
      firearmMake: `${firearm?.make ?? ''}`.trim(),
      firearmModel: `${firearm?.model ?? ''}`.trim(),
      firearmCalibre: `${firearm?.calibre ?? ''}`.trim(),
      firearmSerialNumber: `${firearm?.firearmSerialNumber ?? ''}`.trim(),
      firearmType: `${firearm?.firearmType ?? ''}`.trim(),
      firearmAction: `${firearm?.firearmAction ?? ''}`.trim(),
    },
  }).replace(/\s+/g, ' ').trim();

  if (description && description.toLowerCase() !== 'the firearm applied for') return description;
  if (fallback && isMeaningfulToken(fallback)) return fallback.trim();
  return 'Firearm under renewal';
}

function buildCompetencyLabel(certificate: CompetencyCertificate | null, fallback?: string): string {
  const number = `${certificate?.certificateNumber ?? ''}`.trim();
  const categories = competencyCategoryListLabel(certificate?.categories);
  const categorySuffix = categories ? ` (${categories})` : '';
  if (isMeaningfulToken(number)) return `Competency certificate ${number}${categorySuffix}`;
  if (fallback && isMeaningfulToken(fallback)) return `${fallback.trim()}${categorySuffix}`;
  return 'Competency certificate';
}

export function buildApplicationAnnexureItems(input: {
  application: Application;
  activeEvidenceKeys?: string[];
  mode?: AnnexureBuildMode;
}): AnnexureItem[] {
  const mode: AnnexureBuildMode = input.mode ?? 'aggregated';
  const application = input.application;
  const fresh = application?.id ? (getById<Application>(String(application.id)) ?? application) : application;
  const selectedActivityEvidence = resolveSelectedActivityEvidenceWithPhotos(application, fresh);
  const activityGroupedLabel = buildActivityEvidenceGroupedLabel(selectedActivityEvidence);

  const firearms = resolveApplicationFirearms(fresh);
  const resolved = resolveRequirementsForApplication({
    application: {
      id: fresh.id,
      form: fresh.form,
      licenceType: (fresh as any).licenceType ?? (fresh as any).licenseType,
      licenseType: (fresh as any).licenseType ?? (fresh as any).licenceType,
      licenceTypes: (fresh as any).licenceTypes ?? (fresh as any).licenseTypes,
      licenseTypes: (fresh as any).licenseTypes ?? (fresh as any).licenceTypes,
      type: fresh.form,
    } as any,
    firearms: firearms.map((f) => ({
      id: String(f.id),
      make: f.make,
      model: f.model,
      firearmType: f.firearmType,
      section: (f as any).section,
      licenseType: (f as any).licenseType ?? (f as any).licenceType,
      licenceType: (f as any).licenceType ?? (f as any).licenseType,
      licenseTypes: (f as any).licenseTypes ?? (f as any).licenceTypes,
      licenceTypes: (f as any).licenceTypes ?? (f as any).licenseTypes,
    })),
  });

  const appDocEntries = fresh.docs?.documents ?? [];
  const byAppDocId = new Set(appDocEntries.map((entry) => String(entry.documentId)));
  const appDocEntryById = new Map<string, (typeof appDocEntries)[number]>();
  appDocEntries.forEach((entry) => {
    const docId = String(entry.documentId ?? '').trim();
    if (!docId) return;
    appDocEntryById.set(docId, entry);
  });
  const docIdsByRequirementCode = new Map<string, Set<string>>();
  const pushReqDoc = (code: string, docId: string) => {
    const normalized = normalizeCode(code);
    if (!normalized || !docId) return;
    const bucket = docIdsByRequirementCode.get(normalized) ?? new Set<string>();
    bucket.add(String(docId));
    docIdsByRequirementCode.set(normalized, bucket);
  };
  appDocEntries.forEach((entry) => {
    const docId = String(entry.documentId ?? '').trim();
    if (!docId) return;
    const reqCode = String(entry.requirementCode ?? '').trim();
    if (reqCode) {
      pushReqDoc(reqCode, docId);
      const base = reqCode.split('::')[0];
      if (base && base !== reqCode) pushReqDoc(base, docId);
    }
    const doc = getByIdSafe<Document>(docId);
    const docReqCode = `${doc?.requirementCode ?? ''}`.trim();
    if (docReqCode) {
      pushReqDoc(docReqCode, docId);
      const base = docReqCode.split('::')[0];
      if (base && base !== docReqCode) pushReqDoc(base, docId);
    }
  });
  const activeEvidenceKeys = new Set((input.activeEvidenceKeys ?? []).filter(Boolean));
  const grouped: Array<AnnexureItem> = [];
  const seen = new Set<string>();
  const emittedDocumentIds = new Set<string>();

  for (const requirement of resolved.requirements ?? []) {
    const annexure = `${(requirement as any).annexure ?? ''}`.trim();
    if (!annexure) continue;

    const reqEvidenceKeys = (((requirement as any).evidenceKeys ?? []) as string[]).filter(Boolean);
    if (activeEvidenceKeys.size && reqEvidenceKeys.length) {
      const matched = reqEvidenceKeys.some((key: string) => activeEvidenceKeys.has(key));
      if (!matched) continue;
    }

    const code = normalizeCode(requirement.code);
    const satisfied = Boolean((requirement as any).satisfied);
    const includeUnsatisfiedSupportingStatement = code.startsWith('SUPPORTING_STATEMENT_');
    const requirementCode = String(requirement.code ?? '').trim();
    const requirementCodeBase = requirementCode.split('::')[0];
    const matchedIds = new Set<string>(
      ((((requirement as any).matchedDocumentIds ?? []) as string[]))
        .map((id) => String(id))
        .filter(Boolean)
    );
    (docIdsByRequirementCode.get(normalizeCode(requirementCode)) ?? new Set<string>()).forEach((id) =>
      matchedIds.add(String(id))
    );
    (docIdsByRequirementCode.get(normalizeCode(requirementCodeBase)) ?? new Set<string>()).forEach((id) =>
      matchedIds.add(String(id))
    );

    const includeIfAttached = Array.from(matchedIds).some((id) => byAppDocId.has(String(id)));
    const isActivityEvidenceRequirement = code === 'ACTIVITY_EVIDENCE';
    const includeBySelectedActivity = isActivityEvidenceRequirement && selectedActivityEvidence.length > 0;
    if (
      !satisfied &&
      !includeUnsatisfiedSupportingStatement &&
      !includeIfAttached &&
      !includeBySelectedActivity
    ) {
      continue;
    }

    const docs = Array.from(matchedIds)
      .map((id) => getByIdSafe<Document>(String(id)))
      .filter((doc): doc is Document => Boolean(doc));

    const push = (key: string, label: string, sourceDocumentId?: string) => {
      const sourceId = sourceDocumentId ? String(sourceDocumentId) : '';
      if (mode === 'detailed' && sourceId) {
        if (emittedDocumentIds.has(sourceId)) return;
      }
      const normalized = normalizeLabel(label);
      if (!normalized) return;
      const dedupeKey =
        mode === 'detailed'
          ? `${annexure.toUpperCase()}::${key.toLowerCase()}::${sourceDocumentId ?? 'none'}`
          : `${annexure.toUpperCase()}::${key.toLowerCase()}`;
      if (mode === 'aggregated') {
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
      }
      grouped.push({
        annexure,
        label: normalized,
        requirementCode: code,
        evidenceKeys: reqEvidenceKeys,
        satisfied,
        includedByAttachment: includeIfAttached,
        sourceDocumentId: sourceDocumentId ? String(sourceDocumentId) : undefined,
      });
      if (mode === 'detailed' && sourceId) {
        emittedDocumentIds.add(sourceId);
      }
    };

    if (!docs.length) {
      if (isActivityEvidenceRequirement && selectedActivityEvidence.length > 0) {
        push(`activity:${annexure.toLowerCase()}`, activityGroupedLabel);
        continue;
      }
      const supportingStatementMatch = /^SUPPORTING_STATEMENT_(\d+)$/.exec(code);
      const fallback = supportingStatementMatch?.[1]
        ? `Character reference ${supportingStatementMatch[1]}`
        : normalizeLabel(requirement.label || (requirement as any).checklistLabel || 'Supporting document');
      push(`generic:${fallback.toLowerCase()}`, fallback);
      continue;
    }

    const hasMembershipFamily = MEMBERSHIP_DOC_CODES.has(code) || code === 'MEMBERSHIP';
    const hasSorFamily = code.startsWith('STATEMENT_OF_RESULTS_');
    const hasProficiencyFamily = code.startsWith('PROFICIENCY');
    const hasSafeFamily = code.includes('SAFE');
    const hasFirearmFamily = code === 'FIREARM_LICENCE' || code.includes('LICENCE');
    const hasCompetencyFamily = code === 'COMPETENCY_CERT';
    const hasCharacterReferenceFamily = code.startsWith('SUPPORTING_STATEMENT_');

    for (const doc of docs) {
      const docId = String(doc.id ?? '').trim();
      const docState = docId ? appDocEntryById.get(docId) : undefined;
      const parentType = normalizeCode(doc.parentType);
      const parentId = `${doc.parentId ?? ''}`.trim();
      const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
      const relatedLabel = `${doc.requirementRelatedLabel ?? ''}`.trim();
      const sourceType = normalizeCode(docState?.source?.type);
      const sourceId = `${docState?.source?.id ?? ''}`.trim();
      const firearmId =
        parentType === 'FIREARM' ? parentId : relatedId || (sourceType === 'FIREARM' ? sourceId : '');
      const competencyId =
        parentType === 'COMPETENCYCERTIFICATE'
          ? parentId
          : relatedId || (sourceType === 'COMPETENCYCERTIFICATE' ? sourceId : '');
      const membershipId =
        parentType === 'MEMBERSHIP' ? parentId : relatedId || (sourceType === 'MEMBERSHIP' ? sourceId : '');
      const safeId = parentType === 'SAFE' ? parentId : relatedId || (sourceType === 'SAFE' ? sourceId : '');
      const proficiencyId =
        parentType === 'PROFICIENCY'
          ? parentId
          : relatedId || (sourceType === 'PROFICIENCY' ? sourceId : '');
      const firearm = getByIdSafe<Firearm>(firearmId);
      const competency = getByIdSafe<CompetencyCertificate>(competencyId);
      const membership = getByIdSafe<Membership>(membershipId);
      const safe = getByIdSafe<Safe>(safeId);
      const proficiency = getByIdSafe<Proficiency>(proficiencyId);

      if (mode === 'detailed') {
        const supportingStatementMatch = /^SUPPORTING_STATEMENT_(\d+)$/.exec(code);
        const detailedLabel =
          supportingStatementMatch?.[1]
            ? `Character reference ${supportingStatementMatch[1]}`
            : buildDetailedSupportingStyleLabel({
                doc,
                requirementCode: code,
                requirementLabel: String(requirement.label ?? (requirement as any).checklistLabel ?? '').trim() || undefined,
                groupLabel: relatedLabel || undefined,
                requirementDocumentKinds: Array.isArray((requirement as any).documentKinds)
                  ? ((requirement as any).documentKinds as Array<{ kind?: string; numberOfSides?: number }>)
                  : undefined,
                firearm,
                competency,
                membership,
                safe,
                proficiency,
              });
        push(`${code}:${doc.id}`, detailedLabel, String(doc.id ?? ''));
        continue;
      }

      if (hasCharacterReferenceFamily) {
        const match = /SUPPORTING_STATEMENT_(\d+)$/.exec(code);
        push(
          `character-references:${doc.id}`,
          match?.[1] ? `Character reference ${match[1]}` : 'Character references',
          String(doc.id ?? '')
        );
        continue;
      }

      if (hasSafeFamily) {
        const safeName = `${safe?.safeName ?? ''}`.trim();
        const name = isMeaningfulToken(safeName) ? safeName : (isMeaningfulToken(relatedLabel) ? relatedLabel : 'Safe');
        const photoKind = resolveSafePhotoKindLabel(doc, safe);
        const label = name;
        push(
          `safe:${safeId || label.toLowerCase()}`,
          label,
          String(doc.id ?? '')
        );
        continue;
      }

      if (hasMembershipFamily) {
        const membershipName = `${membership?.associationName ?? ''}`.trim();
        const docCode = resolveDocCode(doc);
        const kindLabel = MEMBERSHIP_DOC_KIND_LABELS[docCode] ?? 'Supporting document';
        const baseLabel = isMeaningfulToken(membershipName)
          ? membershipName
          : isMeaningfulToken(relatedLabel)
            ? relatedLabel
            : 'Association membership';
        if (code === 'FIREARM_ENDORSEMENT') {
          const firearm = relatedId ? getByIdSafe<Firearm>(relatedId) : null;
          const firearmLabel = firearm ? formatFirearmTitle(firearm, 'Firearm') : 'Firearm';
          const membershipEntries = (membership?.membershipDocumentIds ?? []).filter((entry) => {
            const kind = normalizeCode(entry?.kind);
            if (kind !== 'FIREARM_ENDORSEMENT') return false;
            const entryDocId = String(entry?.documentId ?? '').trim();
            if (entryDocId && docId && entryDocId === docId) return true;
            const entryFirearmId = String(entry?.relatedFirearmId ?? '').trim();
            return !!entryFirearmId && entryFirearmId === relatedId;
          });
          const categories = Array.from(
            new Set(
              membershipEntries
                .map((entry) => formatEndorsementCategoryLabel(entry?.category))
                .filter(Boolean),
            ),
          );
          const categorySuffix = categories.length ? `: ${categories.join(', ')}` : '';
          push(
            `membership-endorsement:${membershipId || baseLabel.toLowerCase()}:${relatedId || firearmLabel.toLowerCase()}`,
            `Endorsement (${baseLabel}) - ${firearmLabel}${categorySuffix}`,
            String(doc.id ?? '')
          );
        } else {
          push(
            `membership:${membershipId || baseLabel.toLowerCase()}`,
            `Membership - ${baseLabel}`,
            String(doc.id ?? '')
          );
        }
        continue;
      }

      if (hasSorFamily) {
        const provider = `${proficiency?.trainingProviderName ?? ''}`.trim();
        const baseLabel = isMeaningfulToken(provider)
          ? provider
          : isMeaningfulToken(relatedLabel)
            ? relatedLabel
            : 'Training institute';
        const docCode = resolveDocCode(doc);
        const kindLabel = PROFICIENCY_DOC_KIND_LABELS[docCode] ?? 'Statement of results';
        const sorLabels = resolveStatementOfResultsLabels(proficiency, proficiencyId, docs, code);
        const suffix = sorLabels.length ? ` (${sorLabels.join(', ')})` : '';
        push(
          `sor:${proficiencyId || baseLabel.toLowerCase()}`,
          `Statement of Results - ${baseLabel}${suffix}`,
          String(doc.id ?? '')
        );
        continue;
      }

      if (hasProficiencyFamily) {
        const provider = `${proficiency?.trainingProviderName ?? ''}`.trim();
        const baseLabel = isMeaningfulToken(provider)
          ? provider
          : isMeaningfulToken(relatedLabel)
            ? relatedLabel
            : 'Proficiency certificate';
        const docCode = resolveDocCode(doc);
        const kindLabel = PROFICIENCY_DOC_KIND_LABELS[docCode] ?? 'Proficiency';
        const typeLabels = resolveProficiencyTypeLabels(proficiency, proficiencyId, docs);
        const suffix = typeLabels.length ? ` (${typeLabels.join(', ')})` : '';
        push(
          `proficiency:${proficiencyId || baseLabel.toLowerCase()}`,
          `Proficiency - ${baseLabel}${suffix}`,
          String(doc.id ?? '')
        );
        continue;
      }

      if (hasCompetencyFamily) {
        const label = buildCompetencyLabel(competency, relatedLabel);
        push(
          `competency:${competencyId || label.toLowerCase()}`,
          label,
          String(doc.id ?? '')
        );
        continue;
      }

      if (hasFirearmFamily) {
        const label =
          mode === 'aggregated'
            ? (firearm
                ? formatFirearmTitle(firearm, relatedLabel && isMeaningfulToken(relatedLabel) ? relatedLabel : 'Firearm under renewal')
                : (relatedLabel && isMeaningfulToken(relatedLabel) ? relatedLabel : 'Firearm under renewal'))
            : buildFirearmLabel(firearm, relatedLabel);
        push(
          `firearm:${firearmId || label.toLowerCase()}`,
          label,
          String(doc.id ?? '')
        );
        continue;
      }

      if (code === 'ACTIVITY_EVIDENCE') {
        const activityParentId =
          parentType === 'ACTIVITYEVIDENCE'
            ? parentId
            : (sourceType === 'ACTIVITYEVIDENCE' ? sourceId : '');
        const activity = activityParentId ? getByIdSafe<ActivityEvidence>(activityParentId) : null;
        const typeLabel =
          activity?.evidenceType === 'HUNTING'
            ? 'Hunting'
            : activity?.evidenceType === 'SPORT_SHOOTING'
              ? 'Sport shooting'
              : '';
        const label = typeLabel ? `Activity evidence (${typeLabel})` : 'Activity evidence';
        push(
          `activity:${activityParentId || label.toLowerCase()}`,
          label,
          String(doc.id ?? '')
        );
        continue;
      }

      const fallback = normalizeLabel(requirement.label || (requirement as any).checklistLabel || 'Supporting document');
      push(`generic:${fallback.toLowerCase()}`, fallback);
    }
  }

  let sorted = grouped.sort((a, b) => {
      const annexCmp = compareAnnexureReferences(a.annexure, b.annexure);
      if (annexCmp !== 0) return annexCmp;
      return a.label.localeCompare(b.label);
    });

  if (mode === 'aggregated') {
    const groupedByAnnex = new Map<string, AnnexureItem[]>();
    sorted.forEach((item) => {
      const annex = `${item.annexure ?? ''}`.trim().toUpperCase();
      const bucket = groupedByAnnex.get(annex) ?? [];
      bucket.push(item);
      groupedByAnnex.set(annex, bucket);
    });
    const next: AnnexureItem[] = [];
    groupedByAnnex.forEach((items, annex) => {
      const activityItems = items.filter((item) => normalizeCode(item.requirementCode) === 'ACTIVITY_EVIDENCE');
      if (!activityItems.length) {
        next.push(...items);
        return;
      }
      const representative = activityItems[0];
      next.push({
        ...representative,
        annexure: annex,
        label: activityGroupedLabel,
      });
      next.push(...items.filter((item) => normalizeCode(item.requirementCode) !== 'ACTIVITY_EVIDENCE'));
    });
    sorted = next.sort((a, b) => {
      const annexCmp = compareAnnexureReferences(a.annexure, b.annexure);
      if (annexCmp !== 0) return annexCmp;
      return a.label.localeCompare(b.label);
    });
  }

  if (mode === 'detailed') {
    return sorted;
  }

  const suffixedByBaseAndLabel = new Set<string>();
  sorted.forEach((item) => {
    const annex = splitAnnexureRef(item.annexure);
    if (annex.suffix != null) {
      suffixedByBaseAndLabel.add(`${annex.base}::${item.label.toLowerCase()}`);
    }
  });

  return sorted.filter((item) => {
    const annex = splitAnnexureRef(item.annexure);
    if (annex.suffix != null) return true;
    return !suffixedByBaseAndLabel.has(`${annex.base}::${item.label.toLowerCase()}`);
  });
}

export function buildAnnexureOverviewLines(input: {
  application: Application;
  activeEvidenceKeys?: string[];
}): string[] {
  const items = buildApplicationAnnexureItems({ ...input, mode: 'aggregated' });
  return items.map((item) => `Annexure ${item.annexure}: ${item.label}`);
}

export function buildAnnexureDetailedLines(input: {
  application: Application;
  activeEvidenceKeys?: string[];
}): string[] {
  const items = buildApplicationAnnexureItems({ ...input, mode: 'detailed' });
  return items.map((item) => `Annexure ${item.annexure}: ${item.label}`);
}
