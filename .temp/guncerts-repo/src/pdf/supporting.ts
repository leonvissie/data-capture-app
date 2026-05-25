import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Application,
  ApplicationDocEntry,
  Document,
  IdentityDocumentSide,
  Firearm,
  CompetencyCertificate,
  Safe,
  Profile,
  SupportingStatement,
  Membership,
  Proficiency,
  ProficiencyDocument,
  ActivityEvidence,
} from '../data/types';
import { getById, listByType } from '../data/sqlite';
import { resolveRequirementsForApplication } from '../policy/resolve';
import { resolveApplicationFirearms, resolveEffectiveActivityEvidenceIds, resolveEffectiveMembershipIds, resolveEffectiveProficiencyIds, resolveEffectiveSafeIds } from './context';
import { ensurePdfWorkspace, pdfPathFor } from './storage';
import { ensureRepeatedWatermark } from './watermark';
import { resolveApplicationCompetencyCertificates } from './context';
import policy517g from '../policy/517g.json';
import policy518a from '../policy/518a.json';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../utils/documentPaths';
import { compareAnnexureReferences } from '../utils/annexureOrder';
import { competencyCategoryListLabel } from '../utils/categoryLabel';
import { getMembershipDocumentLabel, getMembershipDocumentSortRank } from '../utils/membershipDocumentLabels';
import { formatEndorsementCategoryLabel } from '../utils/firearmDisplay';
import { loadAssetBytes } from './utils';
import { flushPdfProgressFrame, PdfProgressUpdate } from './progress';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const HEADING_SIZE = 16;
const COVER_SIZE = 48;
const HEADING_UNDERLINE_GAP = 6;
const FOOTER_MARGIN = 36;
const FOOTER_ICON_SIZE = 14;
const FOOTER_TEXT_SIZE = 9;

const IDENTITY_SIDE_LABELS: Record<IdentityDocumentSide, string> = {
  front: 'Front',
  back: 'Back',
  both: 'Front & Back',
  not_applicable: 'Not Applicable',
};

export type SupportingDocumentsPdfResult = {
  uri: string;
  path: string;
  pageCount: number;
  documentCount: number;
  headings: string[];
  checklistRequirements: string[];
};

export type SupportingStatementsPdfResult = {
  uri: string;
  path: string;
  pageCount: number;
  headings: string[];
  statementCount: number;
};

export type PdfPageProgress = PdfProgressUpdate;
export type SupportingAnnexHeadingRow = {
  docId?: string;
  heading: string;
  checked: boolean;
  requirementCode?: string;
};

type RequirementMeta = {
  key: string;
  code?: string;
  label: string;
  checklistLabel?: string;
  activityChecklistLabels?: Partial<Record<'HUNTING' | 'SPORT_SHOOTING', string>>;
  annexure?: string;
  displayOrder?: number;
  index: number;
  min?: number;
  max?: number;
  copies?: number;
  documentKinds?: Array<{ kind: Document['kind']; numberOfSides?: number }>;
  isSupportingDocument?: boolean;
  isChecklistItem?: boolean;
};

type DocInfo = {
  doc: Document;
  requirement?: RequirementMeta;
  requirementKey: string;
  requirementIndex: number;
  firearm?: Firearm | null;
  competency?: CompetencyCertificate | null;
  membership?: Membership | null;
  safe?: Safe | null;
  proficiency?: Proficiency | null;
};

type MembershipPlaceholder = {
  id: string;
  name: string;
};

type ProficiencyPlaceholder = {
  id: string;
  name: string;
};

const ID_DOC_CODES = new Set(['ID_DOC', 'IDENTITY_DOCUMENT', 'ID_DOCUMENT']);
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
  'STATEMENT_OF_RESULTS_KNOWLEDGE',
  'STATEMENT_OF_RESULTS_HANDLE_USE_1',
  'STATEMENT_OF_RESULTS_HANDLE_USE_2',
  'STATEMENT_OF_RESULTS_HANDLE_USE_3',
  'STATEMENT_OF_RESULTS_HANDLE_USE_4',
]);

const ACTIVITY_EVIDENCE_TYPE_LABELS: Record<'HUNTING' | 'SPORT_SHOOTING', string> = {
  HUNTING: 'Hunting activity proof',
  SPORT_SHOOTING: 'Sport shooting activity proof',
};
const SAFE_PHOTO_LABELS: Record<string, string> = {
  CLOSED: 'Closed',
  OPEN: 'Open',
  BOLTS: 'Bolts',
  SERIAL: 'Serial',
  SABS: 'SABS',
  OTHER: 'Other',
};
const PROFICIENCY_DOCUMENT_LABELS: Record<ProficiencyDocument, string> = {
  PROFICIENCY_HANDGUN: 'Handgun proficiency',
  PROFICIENCY_RIFLE: 'Rifle proficiency',
  PROFICIENCY_SHOTGUN: 'Shotgun proficiency',
  PROFICIENCY_HANDMACHINECARBINE: 'Hand machine carbine proficiency',
  STATEMENT_OF_RESULTS_KNOWLEDGE: 'Knowledge of the Firearms Control',
  STATEMENT_OF_RESULTS_HANDLE_USE_1: 'Handle and use results 1',
  STATEMENT_OF_RESULTS_HANDLE_USE_2: 'Handle and use results 2',
  STATEMENT_OF_RESULTS_HANDLE_USE_3: 'Handle and use results 3',
  STATEMENT_OF_RESULTS_HANDLE_USE_4: 'Handle and use results 4',
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
const SAFE_CATEGORY_RANK: Record<string, number> = {
  CLOSED: 0,
  OPEN: 1,
  BOLTS: 2,
  SERIAL: 3,
  SABS: 4,
  OTHER: 5,
};

const ICON_ASSET = require('../../assets/images/icon.png');
const SUPPORTING_STATEMENT_SLOT_ORDER: Record<string, number> = {
  spouse_family: 0,
  friend_colleague_neighbour: 1,
  additional_reference: 2,
};

type ResolvedSupportingStatements = {
  statements: SupportingStatement[];
  renderCount: number;
};

export async function generateSupportingDocumentsPdf(
  application: Application,
  options?: {
    onProgress?: (progress: PdfPageProgress) => void;
  }
): Promise<SupportingDocumentsPdfResult> {
  if (!application?.id) {
    throw new Error('Application not found.');
  }

  // Ensure the checklist exists so supporting docs stay in sync with the base policy
  const checklistModule = await import('./checklist');
  await checklistModule.generateOrGetChecklistPdf(application);

  const checklistRequirements = deriveChecklistRequirementLabels(application);

  const policyMeta = resolvePolicyMeta(application);
  const supportingStatementsState = resolveSupportingStatementsForApplication(application, policyMeta);
  const supportingStatementRequirements = policyMeta.order
    .map(({ key }) => policyMeta.byKey.get(key))
    .filter((meta): meta is RequirementMeta => {
      if (!meta) return false;
      if (meta.isSupportingDocument !== true) return false;
      const code = `${meta.code ?? ''}`.toUpperCase();
      return code.startsWith('SUPPORTING_STATEMENT');
    });
  const supportingStatementCapacity = resolveSupportingStatementCapacity(supportingStatementRequirements);
  const shouldIncludeSupportingStatementPlaceholders = supportingStatementsState.statements.length > 0;
  const supportingStatementPlaceholderCount = shouldIncludeSupportingStatementPlaceholders
    ? supportingStatementCapacity
    : 0;
  const supportingStatementsByPosition = mapSupportingStatementsByPosition(supportingStatementsState.statements);
  const profile = application.applicantProfileId ? getById<Profile>(application.applicantProfileId) : null;
  const isPassportForeign =
    `${profile?.idType ?? ''}`.toUpperCase() === 'PASSPORT' && profile?.isForeignNational === true;

  const firearmById = buildFirearmIndex(application);
  const competencyById = buildCompetencyIndex(application);
  const membershipById = buildMembershipIndex(application);
  const safeById = buildSafeIndex(application);
  const proficiencyById = buildProficiencyIndex(application);
  const competencies = Array.from(competencyById.values());
  const memberships = resolveEffectiveMembershipIds(application)
    .map((membershipId) => {
      const membership = getById<Membership>(String(membershipId));
      if (!membership || membership.deleted) return null;
      return {
        id: String(membership.id),
        name: String(membership.associationName ?? '').trim() || 'Membership',
      } as MembershipPlaceholder;
    })
    .filter(Boolean) as MembershipPlaceholder[];
  const proficiencies = resolveEffectiveProficiencyIds(application)
    .map((proficiencyId) => {
      const proficiency = getById<Proficiency>(String(proficiencyId));
      if (!proficiency || proficiency.deleted) return null;
      return {
        id: String(proficiency.id),
        name: String(proficiency.trainingProviderName ?? '').trim() || 'Proficiency',
      } as ProficiencyPlaceholder;
    })
    .filter(Boolean) as ProficiencyPlaceholder[];
  const docStateById = new Map<string, ApplicationDocEntry>();
  (application.docs?.documents ?? []).forEach((entry) => {
    if (!entry?.documentId) return;
    docStateById.set(String(entry.documentId), entry);
  });
  const actualDocs = collectSupportingDocumentsForApplication(application);
  const identityHasBothSides = false;
  const isMembershipDoc = (doc: Document) => {
    const codeUpper = (doc.requirementCode ?? '').toUpperCase();
    const kindUpper = `${doc.kind ?? ''}`.toUpperCase();
    const parentType = `${doc.parentType ?? ''}`.toLowerCase();
    return MEMBERSHIP_DOC_CODES.has(codeUpper) || MEMBERSHIP_DOC_CODES.has(kindUpper) || parentType === 'membership';
  };
  const isProficiencyDoc = (doc: Document) => {
    const codeUpper = (doc.requirementCode ?? '').toUpperCase();
    const kindUpper = `${doc.kind ?? ''}`.toUpperCase();
    const parentType = `${doc.parentType ?? ''}`.toLowerCase();
    return PROFICIENCY_DOC_CODES.has(codeUpper) || PROFICIENCY_DOC_CODES.has(kindUpper) || parentType === 'proficiency';
  };
  const hasActualMembershipDocs = actualDocs.some(isMembershipDoc);
  const hasActualProficiencyDocs = actualDocs.some(isProficiencyDoc);
  const shouldForceMembership =
    policyMeta.membershipRequirement === 'required';
  const includeMembershipDocs = shouldForceMembership || hasActualMembershipDocs;
  const includeMembershipPlaceholders = shouldForceMembership;
  const includeProficiencyDocs = hasActualProficiencyDocs;

  const policyDocInfos = buildPolicyBackedDocInfos(policyMeta, {
    firearms: Array.from(firearmById.values()),
    competencies,
    safes: Array.from(safeById.values()),
    memberships,
    proficiencies,
    identityHasBothSides,
    skipMembershipPlaceholders: !includeMembershipPlaceholders,
    skipProficiencyPlaceholders: true,
    profileIdType: profile?.idType,
    supportingStatementCount: supportingStatementPlaceholderCount,
  });
  let actualDocInfos = buildDocInfos(actualDocs, policyMeta, {
    firearmById,
    competencyById,
    membershipById,
    safeById,
    proficiencyById,
    docStateById,
  });
  if (!includeMembershipDocs) {
    actualDocInfos = actualDocInfos.filter((info) => {
      const codeUpper = String(info.requirement?.code ?? info.requirementKey ?? '').toUpperCase();
      return !MEMBERSHIP_DOC_CODES.has(codeUpper);
    });
  }
  if (!includeProficiencyDocs) {
    actualDocInfos = actualDocInfos.filter((info) => {
      const codeUpper = String(info.requirement?.code ?? info.requirementKey ?? '').toUpperCase();
      return !PROFICIENCY_DOC_CODES.has(codeUpper);
    });
  }
  let docInfos = mergePolicyWithActualDocs(policyDocInfos, actualDocInfos);

  if (!docInfos.length) {
    throw new Error('No supporting document placeholders could be generated from policy.');
  }

  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const iconBytes = await loadAssetBytes(ICON_ASSET);
  const iconImage = await pdf.embedPng(iconBytes);
  const iconDims = iconImage.scale(FOOTER_ICON_SIZE / iconImage.width);
  const missingText = resolveMissingDocumentText(application);
  const firearmAnnexureLetter = resolveFirearmAnnexureLetter(policyMeta);

  addCoverPage(pdf, boldFont);

  const firearmList = Array.from(firearmById.values());
  let fixedPageCount = 1;
  if (firearmList.length > 4) {
    addFirearmListPage(pdf, firearmList, firearmAnnexureLetter, boldFont, regularFont);
    fixedPageCount += 1;
  }

  const expandedEntries = expandDocumentEntries(docInfos, {
    isPassportForeign,
    profileIdType: profile?.idType,
    firearmOrderIds: firearmList.map((firearm) => String(firearm.id)),
  });
  if (!expandedEntries.length) {
    throw new Error('No supporting document pages could be embedded into the bundle.');
  }

  const pageEntries = buildRenderedSupportingPageEntries(expandedEntries, policyMeta);
  const pageHeadings = pageEntries.map((entry) => entry.heading);
  const totalPageCount = fixedPageCount + pageEntries.length;
  options?.onProgress?.({
    label: 'Bundling supporting documents...',
    current: fixedPageCount,
    total: totalPageCount,
  });
  if (options?.onProgress) {
    await flushPdfProgressFrame();
  }
  for (let index = 0; index < pageEntries.length; index += 1) {
    const entry = pageEntries[index];
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    const headingHeight = drawHeading(page, boldFont, entry.heading);
    if (entry.docs.length > 1) {
      await embedActivityDocumentsTwoUp(pdf, page, entry.docs, missingText, boldFont, headingHeight);
    } else {
      const doc = entry.docs[0];
      const supportingText = resolveSupportingStatementText(doc, supportingStatementsByPosition);
      if (supportingText !== null) {
        drawSupportingStatementBody(page, supportingText, regularFont, boldFont, missingText, headingHeight);
      } else {
        await embedDocumentContent(pdf, page, doc, missingText, boldFont, entry.notes, headingHeight);
      }
    }
    options?.onProgress?.({
      label: 'Bundling supporting documents...',
      current: fixedPageCount + index + 1,
      total: totalPageCount,
    });
    if (options?.onProgress) {
      await flushPdfProgressFrame();
    }
  }

  pdf.getPages().forEach((page) => {
    drawFooter(page, regularFont, iconImage, iconDims);
  });

  if (application.paymentReceived !== true) {
    await ensureRepeatedWatermark(pdf, {});
  }

  const base64 = await pdf.saveAsBase64({ dataUri: false });
  const target = await pdfPathFor(application.id, 'supporting-documents');
  if (!target) {
    throw new Error('Unable to resolve PDF output directory.');
  }
  await ensurePdfWorkspace();
  const encoding =
    ((FileSystem as any)?.EncodingType?.Base64 as string | undefined) ?? ('base64' as any);
  await FileSystem.writeAsStringAsync(target.absolute, base64, {
    encoding,
  });

  return {
    uri: target.uri,
    path: target.absolute,
    pageCount: pdf.getPageCount(),
    documentCount: pageHeadings.length,
    headings: pageHeadings,
    checklistRequirements,
  };
}

export async function generateSupportingStatementsPdf(
  application: Application
): Promise<SupportingStatementsPdfResult> {
  if (!application?.id) {
    throw new Error('Application not found.');
  }

  const policyMeta = resolvePolicyMeta(application);
  const supportingRequirements = policyMeta.order
    .map(({ key }) => policyMeta.byKey.get(key))
    .filter((meta): meta is RequirementMeta => {
      if (!meta) return false;
      if (meta.isSupportingDocument !== true) return false;
      const code = `${meta.code ?? ''}`.toUpperCase();
      return code.startsWith('SUPPORTING_STATEMENT');
    });
  if (!supportingRequirements.length) {
    throw new Error('No character reference requirement is configured for this application policy.');
  }

  const primaryRequirement = supportingRequirements[0];
  const supportingStatementsState = resolveSupportingStatementsForApplication(application, policyMeta);
  const targetPages = resolveSupportingStatementCapacity(supportingRequirements);
  const statementsByPosition = mapSupportingStatementsByPosition(supportingStatementsState.statements);
  if (targetPages <= 0) {
    throw new Error('No character reference requirement is configured for this application policy.');
  }

  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const iconBytes = await loadAssetBytes(ICON_ASSET);
  const iconImage = await pdf.embedPng(iconBytes);
  const iconDims = iconImage.scale(FOOTER_ICON_SIZE / iconImage.width);
  const missingText = resolveMissingDocumentText(application);
  const headings: string[] = [];

  for (let idx = 0; idx < targetPages; idx++) {
    const statementNumber = idx + 1;
    const statement = statementsByPosition.get(statementNumber);
    const heading = buildSupportingStatementHeading(primaryRequirement, statementNumber);
    headings.push(heading);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    const headingHeight = drawHeading(page, boldFont, heading);
    drawSupportingStatementBody(
      page,
      statement?.generatedText,
      regularFont,
      boldFont,
      missingText,
      headingHeight
    );
  }

  pdf.getPages().forEach((page) => {
    drawFooter(page, regularFont, iconImage, iconDims);
  });

  if (application.paymentReceived !== true) {
    await ensureRepeatedWatermark(pdf, {});
  }

  const base64 = await pdf.saveAsBase64({ dataUri: false });
  const target = await pdfPathFor(application.id, 'supporting-statements');
  if (!target) {
    throw new Error('Unable to resolve PDF output directory.');
  }
  await ensurePdfWorkspace();
  const encoding =
    ((FileSystem as any)?.EncodingType?.Base64 as string | undefined) ?? ('base64' as any);
  await FileSystem.writeAsStringAsync(target.absolute, base64, {
    encoding,
  });

  return {
    uri: target.uri,
    path: target.absolute,
    pageCount: pdf.getPageCount(),
    headings,
    statementCount: supportingStatementsState.statements.length,
  };
}

function resolveSupportingStatementsForApplication(
  application: Application,
  policyMeta: ReturnType<typeof resolvePolicyMeta>
): ResolvedSupportingStatements {
  const supportingRequirements = policyMeta.order
    .map(({ key }) => policyMeta.byKey.get(key))
    .filter((meta): meta is RequirementMeta => {
      if (!meta) return false;
      if (meta.isSupportingDocument !== true) return false;
      const code = `${meta.code ?? ''}`.toUpperCase();
      return code.startsWith('SUPPORTING_STATEMENT');
    });
  if (!supportingRequirements.length) {
    return { statements: [], renderCount: 0 };
  }

  const targetPages = resolveSupportingStatementCapacity(supportingRequirements);

  const linkedIds = new Set<string>(
    Array.isArray(application.supportingStatementIds)
      ? application.supportingStatementIds.filter(Boolean).map((id) => String(id))
      : []
  );
  const profileId = application.applicantProfileId ? String(application.applicantProfileId) : '';
  const statements = listByType<SupportingStatement>('SupportingStatement')
    .filter((statement) => {
      const status = `${statement.status ?? 'empty'}`.toLowerCase();
      if (status !== 'draft' && status !== 'complete') return false;
      const byApplicationId =
        statement.applicationId && String(statement.applicationId) === String(application.id);
      const byLinkedId = statement.id ? linkedIds.has(String(statement.id)) : false;
      const byProfileId = profileId && String(statement.holderProfileId ?? '') === profileId;
      return Boolean(byApplicationId || byLinkedId || byProfileId);
    })
    .sort((a, b) => {
      const orderA = SUPPORTING_STATEMENT_SLOT_ORDER[a.slot ?? ''] ?? Number.MAX_SAFE_INTEGER;
      const orderB = SUPPORTING_STATEMENT_SLOT_ORDER[b.slot ?? ''] ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    })
    .slice(0, targetPages);

  return {
    statements,
    renderCount: statements.length,
  };
}

function resolveSupportingStatementText(
  doc: Document,
  statementsByPosition: Map<number, SupportingStatement>
): string | undefined | null {
  const code = `${doc.requirementCode ?? ''}`.toUpperCase();
  const kind = `${doc.kind ?? ''}`.toUpperCase();
  if (!code.startsWith('SUPPORTING_STATEMENT') && kind !== 'SUPPORTING_STATEMENT') {
    return null;
  }
  const label = String(doc.requirementRelatedLabel ?? '').trim();
  const match = /(\d+)/.exec(label);
  const statementPosition = match ? Math.max(1, Number(match[1])) : 1;
  return statementsByPosition.get(statementPosition)?.generatedText;
}

function resolveSupportingStatementCapacity(requirements: RequirementMeta[]): number {
  const rawCapacity = requirements.reduce((sum, requirement) => {
    const maxForRequirement =
      typeof requirement.max === 'number' && Number.isFinite(requirement.max)
        ? Math.max(0, Math.trunc(requirement.max))
        : 1;
    return sum + maxForRequirement;
  }, 0);
  return Math.max(0, rawCapacity || 0);
}

function buildSupportingStatementHeading(requirement: RequirementMeta | undefined, statementNumber: number): string {
  const baseLabel = String(requirement?.label ?? 'Character reference').trim() || 'Character reference';
  const statementSuffix = new RegExp(`\\s+${statementNumber}$`);
  const headingLabel = statementSuffix.test(baseLabel) ? baseLabel : `${baseLabel} ${statementNumber}`;
  const annexurePrefix = requirement?.annexure
    ? `ANNEXURE ${requirement.annexure}`
    : 'ANNEXURE';
  return `${annexurePrefix}: ${headingLabel}`.trim();
}

function resolveSupportingStatementPosition(
  statement: SupportingStatement | undefined,
  fallbackIndex = 0
): number {
  const slot = `${statement?.slot ?? ''}`.toLowerCase();
  const slotOrder = SUPPORTING_STATEMENT_SLOT_ORDER[slot] ?? Number.NaN;
  if (Number.isFinite(slotOrder) && slotOrder >= 0) {
    return slotOrder + 1;
  }
  return fallbackIndex + 1;
}

function mapSupportingStatementsByPosition(
  statements: SupportingStatement[]
): Map<number, SupportingStatement> {
  const map = new Map<number, SupportingStatement>();
  statements.forEach((statement, idx) => {
    const position = resolveSupportingStatementPosition(statement, idx);
    if (!map.has(position)) {
      map.set(position, statement);
    }
  });
  return map;
}

export function collectSupportingDocumentsForApplication(application: Application): Document[] {
  const applicationId = application.id;
  const profileId = application.applicantProfileId ? String(application.applicantProfileId) : '';
  const profile = profileId ? getById<Profile>(profileId) : null;
  const profileIdentityDocIds = new Set<string>(
    [profile?.documentIdFront, profile?.documentIdBack].filter(Boolean).map((id) => String(id))
  );
  const wantsPermit =
    `${profile?.idType ?? ''}`.toUpperCase() === 'PASSPORT' && profile?.isForeignNational === true;
  const referencedIds = new Set<string>();
  const firearmIds = new Set<string>();
  const competencyIds = new Set<string>();
  const safeIds = new Set<string>(resolveEffectiveSafeIds(application));
  const activityEvidenceIds = new Set<string>(resolveEffectiveActivityEvidenceIds(application));
  const selectedMembershipIds = new Set<string>(resolveEffectiveMembershipIds(application));
  const selectedProficiencyIds = new Set<string>(resolveEffectiveProficiencyIds(application));
  const selectedActivityEvidence = Array.from(activityEvidenceIds)
    .map((id) => getById<ActivityEvidence>(String(id)))
    .filter((entry): entry is ActivityEvidence => Boolean(entry && !entry.deleted));
  const selectedActivityDocRefs = selectedActivityEvidence.flatMap((entry) =>
    Array.isArray(entry.photos)
      ? entry.photos.map((photo) => String(photo.documentId ?? '')).filter(Boolean)
      : [],
  );
  const selectedActivityDocRefsUnique = Array.from(new Set(selectedActivityDocRefs));
  resolveApplicationFirearms(application).forEach((f) => {
    if (f?.id) firearmIds.add(String(f.id));
  });
  resolveApplicationCompetencyCertificates(application).forEach((c) => c?.id && competencyIds.add(String(c.id)));

  // Include any documents referenced in the application's doc state
  const docStateDocs = application.docs?.documents ?? [];
  docStateDocs.forEach((entry) => {
    if (entry?.documentId) referencedIds.add(String(entry.documentId));
    const sourceId = entry?.source?.id ? String(entry.source.id) : undefined;
    const sourceType = entry?.source?.type;
    if (sourceId && sourceType === 'Firearm') firearmIds.add(sourceId);
    if (sourceId && sourceType === 'CompetencyCertificate') competencyIds.add(sourceId);
    if (sourceId && sourceType === 'Safe') safeIds.add(sourceId);
    if (sourceId && sourceType === 'ActivityEvidence') activityEvidenceIds.add(sourceId);
    if (sourceId && sourceType === 'Proficiency') selectedProficiencyIds.add(sourceId);
  });
  const allDocs = listByType<Document>('Document');
  const filteredDocs = allDocs
    .filter((doc) => {
      if (!doc) return false;
      if (doc.deleted) return false;
      const parentTypeLower = `${(doc.parentType as unknown as string) ?? ''}`.toLowerCase();
      if (parentTypeLower === 'activityevidence' && doc.parentId) {
        const parentId = String(doc.parentId);
        return activityEvidenceIds.size > 0 && activityEvidenceIds.has(parentId);
      }
      const codeUpper = (doc.requirementCode ?? '').toUpperCase();
      if (codeUpper === 'CHECKLIST') return false;
      const kindUpper = (doc.kind as any)?.toString?.().toUpperCase?.() ?? '';
      const isIdentityDoc =
        ID_DOC_CODES.has(codeUpper) ||
        codeUpper.includes('IDENTITY') ||
        kindUpper.includes('ID') ||
        kindUpper.includes('PASSPORT');
      if (isIdentityDoc) {
        return profileIdentityDocIds.has(String(doc.id));
      }
      const isMembershipDoc =
        MEMBERSHIP_DOC_CODES.has(kindUpper) ||
        MEMBERSHIP_DOC_CODES.has(codeUpper) ||
        `${doc.parentType ?? ''}`.toLowerCase() === 'membership';
      const membershipCodeUpper = codeUpper || kindUpper;
      if (isMembershipDoc) {
        const parentId =
          (doc.parentType as unknown as string) === 'Membership' && doc.parentId
            ? String(doc.parentId)
            : '';
        const isEndorsement = membershipCodeUpper === 'FIREARM_ENDORSEMENT';
        if (referencedIds.has(String(doc.id))) {
          if (isEndorsement) {
            if (!parentId || !selectedMembershipIds.has(parentId)) {
              return false;
            }
            const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
            return !!relatedId && firearmIds.has(relatedId);
          }
          if (parentId && selectedMembershipIds.size > 0 && !selectedMembershipIds.has(parentId)) {
            return false;
          }
          return true;
        }
        if (parentId) {
          if (selectedMembershipIds.has(parentId)) {
            if (!isEndorsement) {
              return true;
            }
            const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
            return !!relatedId && firearmIds.has(relatedId);
          }
          if (selectedMembershipIds.size > 0) {
            return false;
          }
        }
        if (isEndorsement) {
          // Endorsements require their parent membership to be selected.
          return false;
        }
      }
      const isProficiencyDoc =
        PROFICIENCY_DOC_CODES.has(kindUpper) ||
        PROFICIENCY_DOC_CODES.has(codeUpper) ||
        `${doc.parentType ?? ''}`.toLowerCase() === 'proficiency';
      if (isProficiencyDoc) {
        const parentId =
          (doc.parentType as unknown as string) === 'Proficiency' && doc.parentId
            ? String(doc.parentId)
            : '';
        if (referencedIds.has(String(doc.id))) {
          if (parentId && selectedProficiencyIds.size > 0 && !selectedProficiencyIds.has(parentId)) {
            return false;
          }
          return true;
        }
        if (parentId) {
          if (selectedProficiencyIds.has(parentId)) {
            return true;
          }
          if (selectedProficiencyIds.size > 0) {
            return false;
          }
        }
      }
      if ((doc.parentType as unknown as string)?.toLowerCase() === 'safe' && doc.parentId) {
        const parentId = String(doc.parentId);
        if (safeIds.size > 0 && !safeIds.has(parentId)) {
          return false;
        }
      }
      if (referencedIds.has(String(doc.id))) {
        return true;
      }
      if (doc.applicationId && String(doc.applicationId) === applicationId) {
        return true;
      }
      if ((doc.parentType as unknown as string) === 'Application' && doc.parentId && String(doc.parentId) === applicationId) {
        return true;
      }
      if ((doc.parentType as unknown as string)?.toLowerCase() === 'firearm' && doc.parentId && firearmIds.has(String(doc.parentId))) {
        return true;
      }
      if ((doc.parentType as unknown as string)?.toLowerCase() === 'competencycertificate' && doc.parentId && competencyIds.has(String(doc.parentId))) {
        return true;
      }
      if ((doc.parentType as unknown as string)?.toLowerCase() === 'safe' && doc.parentId && safeIds.has(String(doc.parentId))) {
        return true;
      }
      if ((doc.parentType as unknown as string)?.toLowerCase() === 'proficiency' && doc.parentId && selectedProficiencyIds.has(String(doc.parentId))) {
        return true;
      }
      if (
        wantsPermit &&
        profileId &&
        (doc.parentType as unknown as string)?.toLowerCase() === 'profile' &&
        doc.parentId &&
        String(doc.parentId) === profileId
      ) {
        const label = `${doc.name ?? doc.requirementRelatedLabel ?? ''}`.trim().toLowerCase();
        if (label === 'permanent residence permit') {
          return true;
        }
      }
      const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : undefined;
      if (relatedId && (firearmIds.has(relatedId) || competencyIds.has(relatedId) || safeIds.has(relatedId) || selectedProficiencyIds.has(relatedId))) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const aTime = resolveTimestamp(a);
      const bTime = resolveTimestamp(b);
      return aTime - bTime;
    });
  return filteredDocs;
}

function resolveTimestamp(doc: Document): number {
  const src = doc.capturedAt || doc.updatedAt || doc.createdAt;
  const time = src ? Date.parse(src) : Number.NaN;
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function resolvePolicyMeta(application: Application) {
  const firearms = resolveApplicationFirearms(application);
  const resolved = resolveRequirementsForApplication({
    application: {
      id: application.id,
      form: (application as any).form || (application as any).type,
      licenseType: (application as any).licenseType || (application as any).licenceType,
      licenceType: (application as any).licenceType || (application as any).licenseType,
      licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
      licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
    },
    firearms: firearms.map((firearm) => ({
      id: String(firearm.id),
      make: firearm.make,
      model: firearm.model,
      firearmType: firearm.firearmType,
      section: (firearm as any).section,
      licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
      licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
      licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
      licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
    })),
  });

  const byKey = new Map<string, RequirementMeta>();

  resolved.requirements.forEach((req, index) => {
    const meta: RequirementMeta = {
      key: req.key,
      code: req.code,
      label: req.label,
      checklistLabel: (req as any).checklistLabel,
      activityChecklistLabels: (req as any).activityChecklistLabels,
      annexure: (req as any).annexure,
      displayOrder: typeof (req as any).displayOrder === 'number' ? (req as any).displayOrder : undefined,
    index,
      min: (req as any).min,
      max: (req as any).max,
      copies: typeof (req as any).copies === 'number' ? (req as any).copies : 1,
      documentKinds: Array.isArray((req as any).documentKinds) ? (req as any).documentKinds : undefined,
      isSupportingDocument: (req as any).isSupportingDocument === true,
      isChecklistItem: (req as any).isChecklistItem === true,
    };
    byKey.set(req.key, meta);
    if (req.code) {
      byKey.set(req.code, meta);
      byKey.set(req.code.split('::')[0], meta);
    }
  });

  return {
    byKey,
    order: resolved.requirements.map((req, index) => ({ key: req.key, index })),
    membershipRequirement: resolved.membershipRequirement ?? 'none',
    includeMembershipIfPresent: resolved.includeMembershipIfPresent === true,
  };
}

function buildFirearmIndex(application: Application): Map<string, Firearm> {
  const map = new Map<string, Firearm>();
  resolveApplicationFirearms(application).forEach((firearm) => {
    if (firearm?.id) {
      map.set(String(firearm.id), firearm);
    }
  });
  return map;
}

function buildCompetencyIndex(application: Application): Map<string, CompetencyCertificate> {
  const map = new Map<string, CompetencyCertificate>();
  resolveApplicationCompetencyCertificates(application).forEach((cert) => {
    if (cert?.id) {
      map.set(String(cert.id), cert);
    }
  });
  return map;
}

function buildSafeIndex(application: Application): Map<string, Safe> {
  const ids = new Set<string>(resolveEffectiveSafeIds(application));
  const map = new Map<string, Safe>();
  listByType<Safe>('Safe').forEach((safe) => {
    if (safe?.id && ids.has(String(safe.id))) {
      map.set(String(safe.id), safe);
    }
  });
  return map;
}

function buildMembershipIndex(application: Application): Map<string, Membership> {
  const ids = new Set<string>(resolveEffectiveMembershipIds(application));
  const map = new Map<string, Membership>();
  listByType<Membership>('Membership').forEach((membership) => {
    if (membership?.id && ids.has(String(membership.id))) {
      map.set(String(membership.id), membership);
    }
  });
  return map;
}

function buildProficiencyIndex(application: Application): Map<string, Proficiency> {
  const ids = new Set<string>(resolveEffectiveProficiencyIds(application));
  const map = new Map<string, Proficiency>();
  listByType<Proficiency>('Proficiency').forEach((proficiency) => {
    if (proficiency?.id && ids.has(String(proficiency.id))) {
      map.set(String(proficiency.id), proficiency);
    }
  });
  return map;
}

function inferIdentitySidesPreference(
  _documents: Document[],
  _policyMeta: ReturnType<typeof resolvePolicyMeta>
): boolean {
  return false;
}

function buildDocInfos(
  documents: Document[],
  policyMeta: ReturnType<typeof resolvePolicyMeta>,
  context: {
    firearmById: Map<string, Firearm>;
    competencyById: Map<string, CompetencyCertificate>;
    membershipById: Map<string, Membership>;
    safeById: Map<string, Safe>;
    proficiencyById: Map<string, Proficiency>;
    docStateById?: Map<string, ApplicationDocEntry>;
  }
): DocInfo[] {
  return documents
    .map((doc) => {
      const docState = context.docStateById?.get(String(doc.id));
      const codeUpperRaw = (doc.requirementCode ?? docState?.requirementCode ?? '').toUpperCase();
      if (codeUpperRaw === 'CHECKLIST') return null;
      let requirement = resolveRequirementForDocument(doc, policyMeta.byKey);
      if (!requirement && docState?.requirementCode) {
        const code = docState.requirementCode;
        requirement =
          policyMeta.byKey.get(code) ||
          policyMeta.byKey.get(code.split('::')[0]);
      }
      const kindUpper = `${doc.kind ?? ''}`.toUpperCase();
      const isIdentityDoc =
        ID_DOC_CODES.has(codeUpperRaw) ||
        codeUpperRaw.includes('IDENTITY') ||
        kindUpper.includes('ID') ||
        kindUpper.includes('PASSPORT');
      if (isIdentityDoc && requirement?.isSupportingDocument === false) {
        const idMeta =
          policyMeta.byKey.get('ID_DOC') ||
          Array.from(policyMeta.byKey.values()).find((meta) => (meta.code ?? '').toUpperCase().includes('ID_DOC'));
        if (idMeta) {
          requirement = idMeta;
        }
      }
      const parentType = `${doc.parentType ?? ''}`;
      const normalizedParent = parentType.toLowerCase();
      const parentId = doc.parentId ? String(doc.parentId) : undefined;
      let firearm: Firearm | null = null;
      let competency: CompetencyCertificate | null = null;
      let membership: Membership | null = null;
      let safe: Safe | null = null;
      let proficiency: Proficiency | null = null;
      const requirementCodeUpper = (doc.requirementCode ?? docState?.requirementCode ?? '').toUpperCase();
      if (parentId) {
        if (normalizedParent === 'firearm') {
          firearm = context.firearmById.get(parentId) ?? null;
        } else if (normalizedParent === 'competencycertificate') {
          competency = context.competencyById.get(parentId) ?? null;
        } else if (normalizedParent === 'membership') {
          membership = context.membershipById.get(parentId) ?? null;
        } else if (normalizedParent === 'safe') {
          safe = context.safeById.get(parentId) ?? null;
        } else if (normalizedParent === 'proficiency') {
          proficiency = context.proficiencyById.get(parentId) ?? null;
        }
      }
      if (!firearm && docState?.source?.type === 'Firearm' && docState.source.id) {
        firearm = context.firearmById.get(String(docState.source.id)) ?? null;
      }
      if (!competency && docState?.source?.type === 'CompetencyCertificate' && docState.source.id) {
        competency = context.competencyById.get(String(docState.source.id)) ?? null;
      }
      if (!membership && docState?.source?.type === 'Membership' && docState.source.id) {
        membership = context.membershipById.get(String(docState.source.id)) ?? null;
      }
      if (!safe && docState?.source?.type === 'Safe' && docState.source.id) {
        safe = context.safeById.get(String(docState.source.id)) ?? null;
      }
      if (!proficiency && docState?.source?.type === 'Proficiency' && docState.source.id) {
        proficiency = context.proficiencyById.get(String(docState.source.id)) ?? null;
      }
      const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : undefined;
      const docKindUpper = `${doc.kind ?? ''}`.toUpperCase();
      if (
        !firearm &&
        relatedId &&
        (
          requirementCodeUpper.includes('LICENCE') ||
          requirementCodeUpper === 'FIREARM_ENDORSEMENT' ||
          docKindUpper === 'FIREARM_ENDORSEMENT'
        )
      ) {
        firearm = context.firearmById.get(relatedId) ?? null;
      }
      if (!competency && relatedId && requirementCodeUpper.includes('COMPETENCY')) {
        competency = context.competencyById.get(relatedId) ?? null;
      }
      if (!membership && relatedId && context.membershipById.has(relatedId)) {
        membership = context.membershipById.get(relatedId) ?? null;
      }
      if (!safe && relatedId && context.safeById.has(relatedId)) {
        safe = context.safeById.get(relatedId) ?? null;
      }
      if (!proficiency && relatedId && context.proficiencyById.has(relatedId)) {
        proficiency = context.proficiencyById.get(relatedId) ?? null;
      }

      if (!requirement && (normalizedParent === 'safe' || requirementCodeUpper.includes('SAFE'))) {
        const safeMeta =
          policyMeta.byKey.get('SAFES') ||
          Array.from(policyMeta.byKey.values()).find((m) => (m.code ?? '').toUpperCase().includes('SAFE'));
        if (safeMeta) {
          requirement = safeMeta;
        }
      }

      if (!requirement || requirement.isSupportingDocument === false) {
        return null;
      }

      const requirementKey = requirement?.key ?? doc.requirementCode ?? doc.id;
      const requirementIndex = requirement?.index ?? Number.MAX_SAFE_INTEGER;
      return {
        doc,
        requirement,
      requirementKey,
        requirementIndex,
        firearm,
        competency,
        membership,
        safe,
        proficiency,
      };
    })
    .filter(Boolean) as DocInfo[];
}

export function buildPolicyBackedDocInfos(
  policyMeta: ReturnType<typeof resolvePolicyMeta>,
  context: {
    firearms: Firearm[];
    competencies: CompetencyCertificate[];
    safes?: Safe[];
    memberships?: MembershipPlaceholder[];
    proficiencies?: ProficiencyPlaceholder[];
    identityHasBothSides?: boolean;
    skipMembershipPlaceholders?: boolean;
    skipProficiencyPlaceholders?: boolean;
    profileIdType?: Profile['idType'];
    supportingStatementCount?: number;
  }
): DocInfo[] {
  const result: DocInfo[] = [];
  let counter = 0;
  let remainingSupportingStatements = Math.max(0, context.supportingStatementCount ?? 0);
  let supportingStatementSequence = 0;

  const pushDoc = (
    meta: RequirementMeta,
    doc: Document,
    firearm?: Firearm | null,
    competency?: CompetencyCertificate | null,
    safe?: Safe | null,
    proficiency?: Proficiency | null
  ) => {
    const info: DocInfo = {
      doc,
      requirement: meta,
      requirementKey: meta.key,
      requirementIndex: meta.index,
      firearm: firearm ?? null,
      competency: competency ?? null,
      safe: safe ?? null,
      proficiency: proficiency ?? null,
    };
    result.push(info);
  };

  const makePlaceholderDoc = (
    meta: RequirementMeta,
    opts?: {
      relatedId?: string;
      relatedLabel?: string;
      side?: IdentityDocumentSide;
      kind?: Document['kind'];
      parentType?: Document['parentType'];
      parentId?: string;
    }
  ) => {
    const now = new Date().toISOString();
    return {
      id: `placeholder_${meta.key}_${counter++}`,
      type: 'Document',
      kind: opts?.kind ?? 'OTHER',
      filePath: '',
      thumbPath: '',
      sha256: '',
      pages: 1,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      version: 1,
      applicationId: undefined,
      requirementCode: meta.code || meta.key,
      requirementRelatedId: opts?.relatedId,
      requirementRelatedLabel: opts?.relatedLabel,
      parentType: opts?.parentType,
      parentId: opts?.parentId,
      identityDocumentSide: opts?.side,
      name: meta.label,
    } as Document;
  };

  const firearms = context.firearms ?? [];
  const competencies = context.competencies ?? [];
  const safes = context.safes ?? [];
  const memberships = context.memberships ?? [];
  const proficiencies = context.proficiencies ?? [];
  const skipMembershipPlaceholders = context.skipMembershipPlaceholders === true;
  const skipProficiencyPlaceholders = context.skipProficiencyPlaceholders === true;
  const profileIdType = context.profileIdType;

  const resolveKindAndSides = (meta: RequirementMeta) => {
    const kinds = meta.documentKinds ?? [];
    if (kinds.length) {
      const desired =
        profileIdType === 'ID_CARD'
          ? 'ID_CARD'
          : profileIdType === 'ID_BOOK'
            ? 'ID_BOOK'
            : profileIdType === 'PASSPORT'
              ? 'PASSPORT'
              : undefined;
      const match = desired ? kinds.find((k) => String(k.kind).toUpperCase() === desired) : undefined;
      const picked = match ?? kinds[0];
      const numberOfSides = Math.max(1, Math.min(2, picked.numberOfSides ?? 1));
      return { kind: picked.kind as Document['kind'], numberOfSides };
    }
    const numberOfSides = 1;
    return { kind: undefined, numberOfSides };
  };

  policyMeta.order.forEach(({ key }) => {
    const meta = policyMeta.byKey.get(key);
    if (!meta) return;
    if (meta.isSupportingDocument !== true) return;
    const codeUpper = (meta.code ?? '').toUpperCase();
    if (codeUpper === 'FIREARM_ENDORSEMENT') {
      return;
    }
    if (skipMembershipPlaceholders && (codeUpper === 'MEMBERSHIP' || MEMBERSHIP_DOC_CODES.has(codeUpper))) {
      return;
    }
    if (skipProficiencyPlaceholders && (codeUpper === 'PROFICIENCY' || PROFICIENCY_DOC_CODES.has(codeUpper))) {
      return;
    }
    const baseCount = Math.max(1, meta.min ?? 1);
    const copies = Math.max(1, meta.copies ?? 1);
    const { kind: preferredKind, numberOfSides } = resolveKindAndSides(meta);
    const isIdentityRequirement = ID_DOC_CODES.has(codeUpper) || codeUpper.includes('IDENTITY');
    const isSupportingStatementRequirement = codeUpper.startsWith('SUPPORTING_STATEMENT');
    const shouldUseBothSides =
      numberOfSides === 2 ||
      (isIdentityRequirement && context.identityHasBothSides === true);
    const sides = shouldUseBothSides
      ? (['front', 'back'] as IdentityDocumentSide[])
      : ([undefined as unknown as IdentityDocumentSide] as IdentityDocumentSide[]);

    const isFirearmRequirement =
      codeUpper.includes('LICENCE') || codeUpper.includes('FIREARM');
    const isCompetencyRequirement = codeUpper.includes('COMPETENCY');
    const isSafeRequirement = codeUpper.includes('SAFE');
    const isActivityEvidenceRequirement = codeUpper === 'ACTIVITY_EVIDENCE';
    const isMembershipRequirement = codeUpper === 'MEMBERSHIP' || MEMBERSHIP_DOC_CODES.has(codeUpper);
    const isProficiencyRequirement = codeUpper === 'PROFICIENCY' || PROFICIENCY_DOC_CODES.has(codeUpper);

    // Activity evidence headings/pages must be driven by actual selected uploads (by evidence type),
    // not by policy placeholders.
    if (isActivityEvidenceRequirement) {
      return;
    }

    if (isSupportingStatementRequirement) {
      const maxAllowed =
        typeof meta.max === 'number' && Number.isFinite(meta.max) && meta.max >= 0
          ? meta.max
          : 1;
      const count = Math.min(remainingSupportingStatements, Math.max(0, Math.trunc(maxAllowed)));
      if (count === 0) return;
      for (let copy = 0; copy < copies; copy++) {
        for (let i = 0; i < count; i++) {
          supportingStatementSequence += 1;
          const doc = makePlaceholderDoc(meta, {
            relatedLabel: `Character reference ${supportingStatementSequence}`,
            kind: preferredKind,
          });
          pushDoc(meta, doc, null, null);
        }
      }
      remainingSupportingStatements = Math.max(0, remainingSupportingStatements - count);
      return;
    }

    if (isMembershipRequirement) {
      const items = memberships.length ? memberships : [{ id: '', name: 'Membership' }];
      items.forEach((membership) => {
        for (let copy = 0; copy < copies; copy++) {
          for (let i = 0; i < baseCount; i++) {
            const doc = makePlaceholderDoc(meta, {
              relatedId: membership.id || undefined,
              relatedLabel: membership.name || undefined,
              kind: preferredKind,
              parentType: membership.id ? 'Membership' : undefined,
              parentId: membership.id || undefined,
            });
            pushDoc(meta, doc, null, null);
          }
        }
      });
      return;
    }

    if (isProficiencyRequirement) {
      const items = proficiencies.length ? proficiencies : [{ id: '', name: 'Proficiency' }];
      items.forEach((proficiency) => {
        for (let copy = 0; copy < copies; copy++) {
          for (let i = 0; i < baseCount; i++) {
            const doc = makePlaceholderDoc(meta, {
              relatedId: proficiency.id || undefined,
              relatedLabel: proficiency.name || undefined,
              kind: preferredKind,
              parentType: proficiency.id ? 'Proficiency' : undefined,
              parentId: proficiency.id || undefined,
            });
            pushDoc(meta, doc, null, null, null);
          }
        }
      });
      return;
    }

    if (isFirearmRequirement) {
      const items = firearms.length ? firearms : [];
      if (!items.length) return;
      items.forEach((firearm) => {
        for (let copy = 0; copy < copies; copy++) {
          for (let i = 0; i < baseCount; i++) {
            sides.forEach((side) => {
              const label = firearm
                ? [firearm.make, firearm.model].filter(Boolean).join(' ').trim() ||
                  (firearm.licenseNumber ?? '')
                : undefined;
              const doc = makePlaceholderDoc(meta, {
                relatedId: firearm?.id ? String(firearm.id) : undefined,
                relatedLabel: label || undefined,
                side,
                kind: preferredKind,
              });
              pushDoc(meta, doc, firearm ?? null, null);
            });
          }
        }
      });
      return;
    }

    if (isCompetencyRequirement) {
      const items = competencies.length ? competencies : [];
      if (!items.length) return;
      items.forEach((cert) => {
        for (let copy = 0; copy < copies; copy++) {
          for (let i = 0; i < baseCount; i++) {
            const label = cert?.certificateNumber ?? undefined;
            const doc = makePlaceholderDoc(meta, {
              relatedId: cert?.id ? String(cert.id) : undefined,
              relatedLabel: label,
              kind: preferredKind,
            });
            pushDoc(meta, doc, null, cert ?? null);
          }
        }
      });
      return;
    }

    if (isSafeRequirement) {
      const items = safes.length ? safes : [null];
      items.forEach((safe) => {
        for (let copy = 0; copy < copies; copy++) {
          for (let i = 0; i < baseCount; i++) {
            const doc = makePlaceholderDoc(meta, {
              relatedId: safe?.id ? String(safe.id) : undefined,
              relatedLabel: safe?.safeName ?? 'Firearm storage',
              kind: preferredKind,
            });
            pushDoc(meta, doc, null, null, safe ?? null);
          }
        }
      });
      return;
    }

    if (isIdentityRequirement) {
      for (let copy = 0; copy < copies; copy++) {
        for (let i = 0; i < baseCount; i++) {
          sides.forEach((side) => {
            const doc = makePlaceholderDoc(meta, { side, kind: preferredKind });
            pushDoc(meta, doc, null, null);
          });
        }
      }
      return;
    }

    for (let copy = 0; copy < copies; copy++) {
      for (let i = 0; i < baseCount; i++) {
        const doc = makePlaceholderDoc(meta, { kind: preferredKind });
        pushDoc(meta, doc, null, null);
      }
    }
  });

  return result;
}

function mergePolicyWithActualDocs(policyDocs: DocInfo[], actualDocs: DocInfo[]): DocInfo[] {
  const used = new Set<string>();
  const merged = policyDocs.map((info) => {
    const match = findMatchingActualDoc(info, actualDocs, used);
    if (match) {
      used.add(String(match.doc.id ?? Math.random()));
      return {
        ...info,
        doc: match.doc,
        firearm: info.firearm ?? match.firearm ?? null,
        competency: info.competency ?? match.competency ?? null,
        safe: info.safe ?? (match as any).safe ?? null,
      };
    }
    return info;
  });

  actualDocs.forEach((info) => {
    const idKey = String(info.doc.id ?? '');
    if (idKey && used.has(idKey)) return;
    if (!info.requirement || info.requirement.isSupportingDocument === false) return;
    if (isFirearmRequirementInfo(info) && !isFirearmEndorsementInfo(info)) return;
    merged.push(info);
  });

  return merged;
}

function findMatchingActualDoc(
  target: DocInfo,
  candidates: DocInfo[],
  used?: Set<string>
): DocInfo | undefined {
  const targetKey = target.requirement?.key ?? target.requirementKey;
  const targetCode = (target.requirement?.code ?? '').toUpperCase();
  const targetRelatedId = target.doc.requirementRelatedId ? String(target.doc.requirementRelatedId) : undefined;
  const targetSide = target.doc.identityDocumentSide;
  const targetFirearmId = target.firearm?.id ? String(target.firearm.id) : undefined;
  const targetCompetencyId = target.competency?.id ? String(target.competency.id) : undefined;
  const targetSafeId = target.safe?.id ? String(target.safe.id) : undefined;
  const isTargetFirearmRequirement = isFirearmRequirementCode(target.requirement?.code ?? target.requirementKey);
  const isTargetFirearmLicenceRequirement = isFirearmLicenceRequirementCode(
    target.requirement?.code ?? target.requirementKey
  );

  const matches = candidates
    .map((candidate) => {
      const candidateIdKey = candidate.doc?.id ? String(candidate.doc.id) : undefined;
      if (candidateIdKey && used?.has(candidateIdKey)) return null;
      const candidateKey = candidate.requirement?.key ?? candidate.requirementKey;
      const candidateCode = (candidate.requirement?.code ?? '').toUpperCase();
      const candidateCodeAlt = (candidate.requirementKey ?? candidate.doc.requirementCode ?? '').toUpperCase();
      const candidateDocCode = (candidate.doc.requirementCode ?? candidate.doc.kind ?? '').toUpperCase();
      const candidateParentType = `${candidate.doc.parentType ?? ''}`.toLowerCase();
      const candidateParentId = candidate.doc.parentId ? String(candidate.doc.parentId) : undefined;
      const isCandidateFirearmEndorsement =
        candidateDocCode === 'FIREARM_ENDORSEMENT' ||
        candidateCode === 'FIREARM_ENDORSEMENT' ||
        candidateCodeAlt === 'FIREARM_ENDORSEMENT';
      if (isTargetFirearmLicenceRequirement && isCandidateFirearmEndorsement) {
        return null;
      }
    const keyMatch = candidateKey === targetKey;
    const codeMatch =
      (targetCode && (candidateCode === targetCode || candidateCodeAlt === targetCode)) ||
      (targetKey && candidateCodeAlt === targetKey.toUpperCase());
    const requirementAligned = keyMatch || codeMatch;

      const candidateRelatedId = candidate.doc.requirementRelatedId ? String(candidate.doc.requirementRelatedId) : undefined;
      if (targetRelatedId && candidateRelatedId && targetRelatedId !== candidateRelatedId) return null;

      const candidateFirearmId = candidate.firearm?.id ? String(candidate.firearm.id) : undefined;
      if (targetFirearmId && candidateFirearmId && targetFirearmId !== candidateFirearmId) return null;

      const candidateCompetencyId = candidate.competency?.id ? String(candidate.competency.id) : undefined;
      if (targetCompetencyId && candidateCompetencyId && targetCompetencyId !== candidateCompetencyId) return null;
      const candidateSafeId = candidate.safe?.id ? String(candidate.safe.id) : undefined;
      if (targetSafeId && candidateSafeId && targetSafeId !== candidateSafeId) return null;

      // Allow parent/related fallback matches when requirement alignment is weak
      const parentMatchesFirearm =
        targetFirearmId && candidateParentType === 'firearm' && candidateParentId === targetFirearmId;
      const parentMatchesCompetency =
        targetCompetencyId &&
        candidateParentType === 'competencycertificate' &&
        candidateParentId === targetCompetencyId;
      const parentMatchesSafe = targetSafeId && candidateParentType === 'safe' && candidateParentId === targetSafeId;
      const relatedMatchesFirearm = targetFirearmId && candidateRelatedId === targetFirearmId;
      const relatedMatchesCompetency = targetCompetencyId && candidateRelatedId === targetCompetencyId;
      const relatedMatchesSafe = targetSafeId && candidateRelatedId === targetSafeId;
      const candidateMatchesFirearm =
        Boolean(targetFirearmId) &&
        (candidateFirearmId === targetFirearmId || parentMatchesFirearm || relatedMatchesFirearm);

      if (isTargetFirearmRequirement && targetFirearmId && !candidateMatchesFirearm) {
        return null;
      }

      if (
        requirementAligned ||
        parentMatchesFirearm ||
        parentMatchesCompetency ||
        parentMatchesSafe ||
        relatedMatchesFirearm ||
        relatedMatchesCompetency ||
        relatedMatchesSafe
      ) {
        const candidateSide = (candidate.doc.identityDocumentSide ?? '').toLowerCase();
        // Only allow side mismatches when the candidate explicitly covers both sides; otherwise skip
        if (
          targetSide &&
          candidateSide &&
          candidateSide !== 'both' &&
          candidateSide !== `${targetSide}`.toLowerCase()
        ) {
          return null;
        }
        const sideScore = scoreSideMatch(targetSide, candidateSide as any);
        return { candidate, sideScore, time: resolveTimestamp(candidate.doc) };
      }
      return null;
    })
    .filter(Boolean) as Array<{ candidate: DocInfo; sideScore: number; time: number }>;

  matches.sort((a, b) => {
    if (a.sideScore !== b.sideScore) return a.sideScore - b.sideScore;
    return a.time - b.time;
  });
  return matches[0]?.candidate;
}

function scoreSideMatch(targetSide?: IdentityDocumentSide, candidateSide?: IdentityDocumentSide): number {
  if (!targetSide) return candidateSide ? 0 : 1;
  const t = `${targetSide}`.toLowerCase();
  const c = `${candidateSide ?? ''}`.toLowerCase();
  if (t === c) return 0;
  if (c === 'both') return 1;
  if (!c || c === 'not_applicable') return 2;
  return 3;
}

function isFirearmRequirementCode(code?: string | null): boolean {
  const upper = `${code ?? ''}`.toUpperCase();
  return upper.includes('LICENCE') || upper.includes('FIREARM');
}

function isFirearmLicenceRequirementCode(code?: string | null): boolean {
  const upper = `${code ?? ''}`.toUpperCase();
  return upper.includes('LICENCE');
}

function isFirearmRequirementInfo(info: DocInfo): boolean {
  return isFirearmRequirementCode(info.requirement?.code ?? info.requirementKey);
}

function isFirearmEndorsementInfo(info: DocInfo): boolean {
  const requirementCodeUpper = `${info.requirement?.code ?? info.requirementKey ?? ''}`.toUpperCase();
  const docCodeUpper = `${info.doc.requirementCode ?? info.doc.kind ?? ''}`.toUpperCase();
  return requirementCodeUpper === 'FIREARM_ENDORSEMENT' || docCodeUpper === 'FIREARM_ENDORSEMENT';
}

function deriveChecklistRequirementLabels(application: Application): string[] {
  try {
    return buildSupportingAnnexHeadingRows(application).map((row) => row.heading);
  } catch (err) {
    logger.log('[supporting-pdf] checklist requirement derivation failed', err);
    return [];
  }
}

function buildActivityEvidenceAnnexRows(
  rows: SupportingAnnexHeadingRow[],
  policyMeta: ReturnType<typeof resolvePolicyMeta>,
): SupportingAnnexHeadingRow[] {
  const activityRequirement = Array.from(policyMeta.byKey.values()).find(
    (meta) => `${meta.code ?? ''}`.toUpperCase() === 'ACTIVITY_EVIDENCE',
  );
  const annexure = `${activityRequirement?.annexure ?? ''}`.trim().toUpperCase();
  const isActivityRow = (row: SupportingAnnexHeadingRow) => {
    const code = `${row.requirementCode ?? ''}`.toUpperCase();
    if (code === 'ACTIVITY_EVIDENCE') return true;
    if (!row.docId) return false;
    const doc = getById<Document>(String(row.docId));
    return `${doc?.parentType ?? ''}`.toLowerCase() === 'activityevidence';
  };
  const activityRows = rows.filter(isActivityRow);
  if (!activityRows.length) return rows;

  const typeBuckets: Record<'HUNTING' | 'SPORT_SHOOTING', number> = {
    HUNTING: 0,
    SPORT_SHOOTING: 0,
  };

  activityRows.forEach((row) => {
    if (!row.checked || !row.docId) return;
    const doc = getById<Document>(String(row.docId));
    if (!doc || `${doc.parentType ?? ''}`.toLowerCase() !== 'activityevidence' || !doc.parentId) return;
    const activity = getById<ActivityEvidence>(String(doc.parentId));
    const evidenceType = activity?.evidenceType;
    if (evidenceType === 'HUNTING' || evidenceType === 'SPORT_SHOOTING') {
      typeBuckets[evidenceType] += 1;
    }
  });

  const activityHeadingRows: SupportingAnnexHeadingRow[] = (['HUNTING', 'SPORT_SHOOTING'] as const)
    .filter((type) => typeBuckets[type] > 0)
    .map((type) => {
      const policyLabel = activityRequirement?.activityChecklistLabels?.[type];
      const label = `${policyLabel ?? ''}`.trim() || ACTIVITY_EVIDENCE_TYPE_LABELS[type];
      const prefix = annexure ? `ANNEXURE ${annexure}: ` : '';
      const count = typeBuckets[type];
      return {
        heading: `${prefix}${label} (${count} photo${count === 1 ? '' : 's'})`,
        checked: true,
        requirementCode: 'ACTIVITY_EVIDENCE',
      };
    });

  const nonActivityRows = rows.filter((row) => !isActivityRow(row));
  return [...nonActivityRows, ...activityHeadingRows];
}

function buildRenderedSupportingPageEntries(
  expandedEntries: ExpandedEntry[],
  policyMeta: ReturnType<typeof resolvePolicyMeta>,
): RenderPageEntry[] {
  const activityRequirement = Array.from(policyMeta.byKey.values()).find(
    (meta) => `${meta.code ?? ''}`.toUpperCase() === 'ACTIVITY_EVIDENCE',
  );
  const annexure = `${activityRequirement?.annexure ?? ''}`.trim().toUpperCase();
  const isActivityDoc = (doc: Document) => `${doc.parentType ?? ''}`.toLowerCase() === 'activityevidence';
  const activityByType: Record<'HUNTING' | 'SPORT_SHOOTING', Document[]> = {
    HUNTING: [],
    SPORT_SHOOTING: [],
  };

  const pages: RenderPageEntry[] = [];
  let insertedActivityPages = false;
  const insertActivityPages = () => {
    if (insertedActivityPages) return;
    const totalActivityDocs = activityByType.HUNTING.length + activityByType.SPORT_SHOOTING.length;
    if (totalActivityDocs === 0) return;
    (['HUNTING', 'SPORT_SHOOTING'] as const).forEach((type) => {
      const docs = activityByType[type];
      if (!docs.length) return;
      const policyLabel = activityRequirement?.activityChecklistLabels?.[type];
      const label = `${policyLabel ?? ''}`.trim() || ACTIVITY_EVIDENCE_TYPE_LABELS[type];
      const headingPrefix = annexure ? `ANNEXURE ${annexure}: ` : '';
      const heading = `${headingPrefix}${label} (${docs.length} photo${docs.length === 1 ? '' : 's'})`;
      for (let index = 0; index < docs.length; index += 2) {
        pages.push({
          heading,
          docs: docs.slice(index, index + 2),
        });
      }
    });
    insertedActivityPages = true;
  };

  expandedEntries.forEach((entry) => {
    if (isActivityDoc(entry.doc)) {
      const parentId = entry.doc.parentId ? String(entry.doc.parentId) : '';
      const parent = parentId ? getById<ActivityEvidence>(parentId) : null;
      const type = parent?.evidenceType;
      if (type === 'HUNTING' || type === 'SPORT_SHOOTING') {
        activityByType[type].push(entry.doc);
      }
      return;
    }
    insertActivityPages();
    pages.push({ heading: entry.heading, docs: [entry.doc], notes: entry.notes });
  });

  insertActivityPages();
  return pages;
}

export function buildSupportingAnnexHeadingRows(application: Application): SupportingAnnexHeadingRow[] {
  const policyMeta = resolvePolicyMeta(application);
  const supportingStatementsState = resolveSupportingStatementsForApplication(application, policyMeta);
  const supportingStatementRequirements = policyMeta.order
    .map(({ key }) => policyMeta.byKey.get(key))
    .filter((meta): meta is RequirementMeta => {
      if (!meta) return false;
      if (meta.isSupportingDocument !== true) return false;
      const code = `${meta.code ?? ''}`.toUpperCase();
      return code.startsWith('SUPPORTING_STATEMENT');
    });
  const supportingStatementCapacity = resolveSupportingStatementCapacity(supportingStatementRequirements);
  const shouldIncludeSupportingStatementPlaceholders = supportingStatementsState.statements.length > 0;
  const supportingStatementPlaceholderCount = shouldIncludeSupportingStatementPlaceholders
    ? supportingStatementCapacity
    : 0;
  const profile = application.applicantProfileId ? getById<Profile>(application.applicantProfileId) : null;
  const isPassportForeign =
    `${profile?.idType ?? ''}`.toUpperCase() === 'PASSPORT' && profile?.isForeignNational === true;

  const firearmById = buildFirearmIndex(application);
  const competencyById = buildCompetencyIndex(application);
  const membershipById = buildMembershipIndex(application);
  const safeById = buildSafeIndex(application);
  const proficiencyById = buildProficiencyIndex(application);
  const competencies = Array.from(competencyById.values());
  const memberships = resolveEffectiveMembershipIds(application)
    .map((membershipId) => {
      const membership = getById<Membership>(String(membershipId));
      if (!membership || membership.deleted) return null;
      return {
        id: String(membership.id),
        name: String(membership.associationName ?? '').trim() || 'Membership',
      } as MembershipPlaceholder;
    })
    .filter(Boolean) as MembershipPlaceholder[];
  const proficiencies = resolveEffectiveProficiencyIds(application)
    .map((proficiencyId) => {
      const proficiency = getById<Proficiency>(String(proficiencyId));
      if (!proficiency || proficiency.deleted) return null;
      return {
        id: String(proficiency.id),
        name: String(proficiency.trainingProviderName ?? '').trim() || 'Proficiency',
      } as ProficiencyPlaceholder;
    })
    .filter(Boolean) as ProficiencyPlaceholder[];

  const docStateById = new Map<string, ApplicationDocEntry>();
  (application.docs?.documents ?? []).forEach((entry) => {
    if (!entry?.documentId) return;
    docStateById.set(String(entry.documentId), entry);
  });
  const actualDocs = collectSupportingDocumentsForApplication(application);
  const identityHasBothSides = false;
  const isMembershipDoc = (doc: Document) => {
    const codeUpper = (doc.requirementCode ?? '').toUpperCase();
    const kindUpper = `${doc.kind ?? ''}`.toUpperCase();
    const parentType = `${doc.parentType ?? ''}`.toLowerCase();
    return MEMBERSHIP_DOC_CODES.has(codeUpper) || MEMBERSHIP_DOC_CODES.has(kindUpper) || parentType === 'membership';
  };
  const isProficiencyDoc = (doc: Document) => {
    const codeUpper = (doc.requirementCode ?? '').toUpperCase();
    const kindUpper = `${doc.kind ?? ''}`.toUpperCase();
    const parentType = `${doc.parentType ?? ''}`.toLowerCase();
    return PROFICIENCY_DOC_CODES.has(codeUpper) || PROFICIENCY_DOC_CODES.has(kindUpper) || parentType === 'proficiency';
  };
  const hasActualMembershipDocs = actualDocs.some(isMembershipDoc);
  const hasActualProficiencyDocs = actualDocs.some(isProficiencyDoc);
  const shouldForceMembership = policyMeta.membershipRequirement === 'required';
  const includeMembershipDocs = shouldForceMembership || hasActualMembershipDocs;
  const includeMembershipPlaceholders = shouldForceMembership;
  const includeProficiencyDocs = hasActualProficiencyDocs;

  const policyDocInfos = buildPolicyBackedDocInfos(policyMeta, {
    firearms: Array.from(firearmById.values()),
    competencies,
    safes: Array.from(safeById.values()),
    memberships,
    proficiencies,
    identityHasBothSides,
    skipMembershipPlaceholders: !includeMembershipPlaceholders,
    skipProficiencyPlaceholders: true,
    profileIdType: profile?.idType,
    supportingStatementCount: supportingStatementPlaceholderCount,
  });
  let actualDocInfos = buildDocInfos(actualDocs, policyMeta, {
    firearmById,
    competencyById,
    membershipById,
    safeById,
    proficiencyById,
    docStateById,
  });
  if (!includeMembershipDocs) {
    actualDocInfos = actualDocInfos.filter((info) => {
      const codeUpper = String(info.requirement?.code ?? info.requirementKey ?? '').toUpperCase();
      return !MEMBERSHIP_DOC_CODES.has(codeUpper);
    });
  }
  if (!includeProficiencyDocs) {
    actualDocInfos = actualDocInfos.filter((info) => {
      const codeUpper = String(info.requirement?.code ?? info.requirementKey ?? '').toUpperCase();
      return !PROFICIENCY_DOC_CODES.has(codeUpper);
    });
  }
  const docInfos = mergePolicyWithActualDocs(policyDocInfos, actualDocInfos);
  const firearmList = Array.from(firearmById.values());
  const expandedEntries = expandDocumentEntries(docInfos, {
    isPassportForeign,
    profileIdType: profile?.idType,
    firearmOrderIds: firearmList.map((firearm) => String(firearm.id)),
  });

  const rows = expandedEntries.map((entry) => {
    const docId = String(entry.doc.id ?? '').trim();
    const isPlaceholder = docId.startsWith('placeholder_');
    const checked = !isPlaceholder;
    return {
      docId: docId || undefined,
      heading: entry.heading,
      checked,
      requirementCode: entry.doc.requirementCode,
    } as SupportingAnnexHeadingRow;
  });

  const withActivityEvidenceGroups = buildActivityEvidenceAnnexRows(rows, policyMeta);

  // For exposed consumer lists (e.g. checklist mirror), collapse duplicate proof-of-ID rows.
  // Keep supporting PDF internals unchanged; this dedupe only applies to the exported row list.
  const seenIdentityHeadings = new Set<string>();
  return withActivityEvidenceGroups.filter((row) => {
    const codeUpper = `${row.requirementCode ?? ''}`.toUpperCase();
    const isIdentity =
      codeUpper === 'ID_DOC' ||
      codeUpper.includes('IDENTITY') ||
      /\bproof of identity\b/i.test(row.heading);
    if (!isIdentity) return true;
    const key = row.heading.trim().toUpperCase();
    if (seenIdentityHeadings.has(key)) return false;
    seenIdentityHeadings.add(key);
    return true;
  });
}

function resolveRequirementForDocument(
  doc: Document,
  lookup: Map<string, RequirementMeta>
): RequirementMeta | undefined {
  const code = doc.requirementCode;
  if (code && lookup.has(code)) {
    return lookup.get(code);
  }
  if (code) {
    const withoutScope = code.split('::')[0];
    if (lookup.has(withoutScope)) {
      return lookup.get(withoutScope);
    }
  }
  if (doc.requirementRelatedLabel) {
    const labelKey = doc.requirementRelatedLabel.trim().toLowerCase();
    const entry = Array.from(lookup.values()).find(
      (meta) => meta.label.trim().toLowerCase() === labelKey
    );
    if (entry) {
      return entry;
    }
  }

  // Fallbacks by document kind / type when requirement code is missing
  const kind = `${doc.kind ?? ''}`.toUpperCase();
  if (kind === 'ID' || kind === 'PASSPORT' || kind === 'ID_CARD' || kind === 'ID_BOOK') {
    const idMeta =
      lookup.get('ID_DOC') ||
      Array.from(lookup.values()).find((meta) => (meta.code ?? '').toUpperCase().includes('ID_DOC'));
    if (idMeta) return idMeta;
  }
  if (kind === 'PROOF_OF_ADDRESS') {
    const addrMeta =
      lookup.get('PROOF_ADDRESS') ||
      Array.from(lookup.values()).find((meta) => (meta.code ?? '').toUpperCase().includes('PROOF_ADDRESS'));
    if (addrMeta) return addrMeta;
  }
  if (kind === 'FIREARM_ENDORSEMENT') {
    const endorsementMeta =
      lookup.get('FIREARM_ENDORSEMENT') ||
      Array.from(lookup.values()).find((meta) => (meta.code ?? '').toUpperCase() === 'FIREARM_ENDORSEMENT');
    if (endorsementMeta) return endorsementMeta;
  }
  if (kind === 'ACTIVITY_EVIDENCE') {
    const activityMeta =
      lookup.get('ACTIVITY_EVIDENCE') ||
      Array.from(lookup.values()).find((meta) => (meta.code ?? '').toUpperCase() === 'ACTIVITY_EVIDENCE');
    if (activityMeta) return activityMeta;
  }

  return undefined;
}

type ExpandedEntry = { doc: Document; heading: string; notes?: string | null };
type RenderPageEntry = { heading: string; docs: Document[]; notes?: string | null };

function expandDocumentEntries(
  docInfos: DocInfo[],
  opts: {
    isPassportForeign?: boolean;
    profileIdType?: Profile['idType'];
    firearmOrderIds?: string[];
  } = {}
): ExpandedEntry[] {
  const grouped = groupByRequirement(docInfos);
  const orderedKeys = determineRequirementOrder(grouped);

  const result: ExpandedEntry[] = [];
  const seen = new Set<string>();
  const consumedRequirementKeys = new Set<string>();
  let supportingStatementHeadingIndex = 0;
  const firearmOrderIndex = new Map<string, number>();
  (opts.firearmOrderIds ?? []).forEach((id, idx) => {
    firearmOrderIndex.set(String(id), idx);
  });

  for (const key of orderedKeys) {
    if (consumedRequirementKeys.has(key)) continue;
    const bundle = grouped.get(key);
    if (!bundle) continue;
    const requirement = bundle.requirement;
    const family = requirementFamilyKey(requirement?.code);
    const annexure = `${requirement?.annexure ?? ''}`.trim().toUpperCase();
    const mergedDocInfos =
      family === 'other' || !annexure
        ? bundle.docInfos
        : orderedKeys
            .filter((candidateKey) => !consumedRequirementKeys.has(candidateKey))
            .map((candidateKey) => ({ key: candidateKey, bundle: grouped.get(candidateKey) }))
            .filter((item): item is { key: string; bundle: RequirementGroup } => Boolean(item.bundle))
            .filter((item) => {
              const candidateCode = `${item.bundle.requirement?.code ?? ''}`.toUpperCase();
              const candidateFamily = requirementFamilyKey(candidateCode);
              const candidateAnnexure = `${item.bundle.requirement?.annexure ?? ''}`
                .trim()
                .toUpperCase();
              return candidateFamily === family && candidateAnnexure === annexure;
            })
            .flatMap((item) => {
              consumedRequirementKeys.add(item.key);
              return item.bundle.docInfos;
            });
    consumedRequirementKeys.add(key);
    const codeUpper = (requirement?.code ?? '').toUpperCase();
    const isIdentityRequirement = ID_DOC_CODES.has(codeUpper) || codeUpper.includes('IDENTITY');
    const isFirearmRequirement = codeUpper.includes('LICENCE') || codeUpper.includes('FIREARM');
    const isSupportingStatementRequirement = codeUpper.startsWith('SUPPORTING_STATEMENT');
    const copyCount = isIdentityRequirement
      ? 2
      : Math.max(1, requirement?.copies ?? 1);

    const groups = groupDocumentsForRequirement(mergedDocInfos, requirement);
    if (isFirearmRequirement && firearmOrderIndex.size > 0) {
      groups.sort((a, b) => {
        const aFirearmId = resolveInfoFirearmId(a.docs[0]);
        const bFirearmId = resolveInfoFirearmId(b.docs[0]);
        const aIdx = firearmOrderIndex.get(aFirearmId) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = firearmOrderIndex.get(bFirearmId) ?? Number.MAX_SAFE_INTEGER;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.key.localeCompare(b.key);
      });
    }
    const shouldSuffix =
      requirement &&
      !ID_DOC_CODES.has((requirement.code ?? '').toUpperCase()) &&
      groups.length > 1;

    groups.forEach((group, idx) => {
      const suffix = shouldSuffix ? String(idx + 1) : '';
      const annexurePrefix = requirement?.annexure
        ? `ANNEXURE ${requirement.annexure}${suffix}`
        : `ANNEXURE${suffix ? ` ${suffix}` : ''}`;
      if (isSupportingStatementRequirement) {
        for (let copy = 0; copy < copyCount; copy++) {
          group.docs.forEach((info) => {
            if (!info) return;
            const heading = buildSupportingStatementHeading(requirement, supportingStatementHeadingIndex + 1);
            const keyId = `${info.doc.id ?? ''}::${heading}::copy${copy}`;
            if (seen.has(keyId)) return;
            seen.add(keyId);
            supportingStatementHeadingIndex += 1;
            result.push({ doc: info.doc, heading });
          });
        }
        return;
      }
    if (isIdentityRequirement) {
      const idTypeUpper = `${opts.profileIdType ?? ''}`.toUpperCase();
      const isIdCard = group.docs.some((info) => `${info.doc.kind ?? ''}`.toUpperCase() === 'ID_CARD');
      const isPassport = idTypeUpper === 'PASSPORT';
      const isIdBook = idTypeUpper === 'ID_BOOK';
      const wantsPermit = opts.isPassportForeign === true && isPassport;
      const pickBySide = (side?: string) =>
        group.docs.find((info) => `${info.doc.identityDocumentSide ?? ''}`.toLowerCase() === side);
      const pickByName = (label: string) =>
        group.docs.find((info) => `${info.doc.name ?? ''}`.trim().toLowerCase() === label);
      const namedFront = pickByName('id front');
      const namedBack = pickByName('id back');
      const frontDoc = isIdCard
        ? namedFront ?? group.docs[0]
        : pickBySide('front') ?? group.docs[0];
      const backDoc = isIdCard
        ? namedBack ?? frontDoc
        : pickBySide('back') ?? frontDoc;
      const permitDoc = wantsPermit
        ? group.docs.find((info) => {
            const label = `${info.doc.name ?? info.doc.requirementRelatedLabel ?? ''}`
              .trim()
              .toLowerCase();
            return label === 'permanent residence permit';
          })
        : undefined;
      const baseLabel = requirement?.label ?? 'Proof of identity';
      const hasSingleIdDoc = isIdCard
        ? false
        : group.docs.length === 1 ||
          frontDoc === backDoc;
      const sequence = (isIdCard && !hasSingleIdDoc) ? [frontDoc, backDoc] : [frontDoc];
      if (!isIdCard && wantsPermit && permitDoc && permitDoc !== frontDoc) {
        sequence.push(permitDoc);
      }

      for (let copy = 0; copy < copyCount; copy++) {
        sequence.forEach((info, seqIdx) => {
          if (!info) return;
          let headingLabel = buildDocumentLabel(info, requirement?.label, group.label);
          if (!isIdCard && !isIdBook && wantsPermit && permitDoc && info.doc.id === permitDoc.doc.id) {
            headingLabel = `${baseLabel} - Residence permit`;
          }
          if (isIdCard || isIdBook) {
            if (isIdCard && !hasSingleIdDoc) {
              const sideLabel = seqIdx === 0 ? 'FRONT' : 'BACK';
              headingLabel = `${baseLabel} (${sideLabel})`;
            } else {
              headingLabel = baseLabel;
            }
          }
          const heading = `${annexurePrefix}: ${headingLabel}`;
          //const notes = info.doc.notes ?? info.safe?.notes ?? null;
          //result.push({ doc: info.doc, heading, notes });
          result.push({ doc: info.doc, heading });
        });
      }
      return;
      }

      const stripSideSuffix = (label: string) =>
        label.replace(/\s*\((FRONT|BACK|BOTH)\)\s*$/i, '');
      const bothFirearmDoc = isFirearmRequirement
        ? group.docs.find((info) => `${info.doc.identityDocumentSide ?? ''}`.toLowerCase() === 'both')
        : undefined;
      const hasSingleFirearmDoc =
        isFirearmRequirement &&
        (group.docs.length === 1 ||
          Boolean(bothFirearmDoc));
      const docsToRender =
        isFirearmRequirement && hasSingleFirearmDoc
          ? [bothFirearmDoc ?? group.docs[0]]
          : group.docs;

      for (let copy = 0; copy < copyCount; copy++) {
        docsToRender.forEach((info) => {
          if (!info) return;
          let docLabel = buildDocumentLabel(info, requirement?.label, group.label);
          if (isFirearmRequirement) {
            const baseLabel = stripSideSuffix(docLabel);
            if (hasSingleFirearmDoc) {
              docLabel = baseLabel;
            } else {
              const sideRaw = `${info.doc.identityDocumentSide ?? ''}`.toLowerCase();
              const sideLabel = sideRaw === 'back' ? 'BACK' : sideRaw === 'front' ? 'FRONT' : '';
              docLabel = sideLabel ? `${baseLabel} (${sideLabel})` : baseLabel;
            }
          }
          const heading = `${annexurePrefix}: ${docLabel}`;
          const keyId = `${info.doc.id ?? ''}::${heading}::copy${copy}`;
          if (seen.has(keyId)) {
            return;
          }
          seen.add(keyId);
          // const notes = info.doc.notes ?? info.safe?.notes ?? null;
          // result.push({ doc: info.doc, heading, notes });
          result.push({ doc: info.doc, heading });
        });
      }
    });
  }

  return result;
}

function membershipDocumentSortRank(doc: Document): number {
  const codeUpper = normalizeRequirementCode(doc.requirementCode) || `${doc.kind ?? ''}`.toUpperCase();
  return getMembershipDocumentSortRank(codeUpper);
}

function proficiencyDocumentSortRank(doc: Document): number {
  const codeUpper = normalizeRequirementCode(doc.requirementCode) || `${doc.kind ?? ''}`.toUpperCase();
  switch (codeUpper) {
    case 'PROFICIENCY_HANDGUN':
      return 0;
    case 'PROFICIENCY_RIFLE':
      return 1;
    case 'PROFICIENCY_SHOTGUN':
      return 2;
    case 'PROFICIENCY_HANDMACHINECARBINE':
      return 3;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function resolveSafeCategoryRank(info: DocInfo): number {
  const fromSafePhoto = info.safe?.safePhotos?.find(
    (photo) => String(photo.documentId ?? '') === String(info.doc.id ?? '')
  )?.category;
  const raw =
    `${fromSafePhoto ?? info.doc.requirementCode ?? info.doc.requirementRelatedLabel ?? ''}`
      .trim()
      .toUpperCase();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  return SAFE_CATEGORY_RANK[raw] ?? Number.MAX_SAFE_INTEGER;
}

function isMembershipRequirementFamily(requirement?: RequirementMeta): boolean {
  const code = `${requirement?.code ?? ''}`.toUpperCase();
  return code === 'MEMBERSHIP' || MEMBERSHIP_DOC_CODES.has(code);
}

function isProficiencyRequirementFamily(requirement?: RequirementMeta): boolean {
  const code = `${requirement?.code ?? ''}`.toUpperCase();
  return code === 'PROFICIENCY' || PROFICIENCY_DOC_CODES.has(code);
}

function isSafeRequirementFamily(requirement?: RequirementMeta): boolean {
  const code = `${requirement?.code ?? ''}`.toUpperCase();
  return code.includes('SAFE');
}

function isCompetencyRequirementFamily(requirement?: RequirementMeta): boolean {
  const code = `${requirement?.code ?? ''}`.toUpperCase();
  return code === 'COMPETENCY_CERT' || code.startsWith('COMPETENCY');
}

function resolveGroupDisplayName(group: RequirementSubGroup, requirement?: RequirementMeta): string {
  const first = group.docs[0];
  if (!first) return '';
  if (isMembershipRequirementFamily(requirement)) {
    return `${first.membership?.associationName ?? first.doc.requirementRelatedLabel ?? ''}`
      .trim()
      .toLowerCase();
  }
  if (isProficiencyRequirementFamily(requirement)) {
    return `${first.proficiency?.trainingProviderName ?? first.doc.requirementRelatedLabel ?? ''}`
      .trim()
      .toLowerCase();
  }
  if (isSafeRequirementFamily(requirement)) {
    return `${first.safe?.safeName ?? first.doc.requirementRelatedLabel ?? ''}`
      .trim()
      .toLowerCase();
  }
  if (isCompetencyRequirementFamily(requirement)) {
    return `${first.competency?.certificateNumber ?? first.doc.requirementRelatedLabel ?? ''}`
      .trim()
      .toLowerCase();
  }
  return `${group.label ?? ''}`.trim().toLowerCase();
}

function normalizeRequirementCode(code?: string | null): string {
  const raw = `${code ?? ''}`.toUpperCase().trim();
  if (!raw) return '';
  return raw.split('::')[0] ?? raw;
}

type RequirementGroup = {
  requirement?: RequirementMeta;
  docInfos: DocInfo[];
};

function groupByRequirement(docInfos: DocInfo[]): Map<string, RequirementGroup> {
  const grouped = new Map<string, RequirementGroup>();
  docInfos.forEach((info) => {
    const key = info.requirement?.key ?? info.requirementKey;
    if (!grouped.has(key)) {
      grouped.set(key, { requirement: info.requirement, docInfos: [] });
    }
    grouped.get(key)!.docInfos.push(info);
  });
  return grouped;
}

function requirementCodeFromGroup(value: RequirementGroup): string {
  const fromRequirement = normalizeRequirementCode(value.requirement?.code);
  if (fromRequirement) return fromRequirement;
  const firstDoc = value.docInfos[0]?.doc;
  const fromDocRequirement = normalizeRequirementCode(firstDoc?.requirementCode);
  if (fromDocRequirement) return fromDocRequirement;
  return `${firstDoc?.kind ?? ''}`.toUpperCase();
}

function requirementFamilyRank(value: RequirementGroup): number {
  const code = requirementCodeFromGroup(value);
  if (!code) return 10;
  if (code === 'FIREARM_ENDORSEMENT') return 1;
  if (MEMBERSHIP_DOC_CODES.has(code) || code === 'MEMBERSHIP') return 0;
  if (PROFICIENCY_DOC_CODES.has(code) || code === 'PROFICIENCY') return 2;
  return 10;
}

function requirementFamilyKey(code?: string | null): 'membership' | 'proficiency' | 'other' {
  const normalized = `${code ?? ''}`.toUpperCase();
  if (normalized === 'MEMBERSHIP' || MEMBERSHIP_DOC_CODES.has(normalized)) return 'membership';
  if (normalized === 'PROFICIENCY' || PROFICIENCY_DOC_CODES.has(normalized)) return 'proficiency';
  return 'other';
}

function determineRequirementOrder(grouped: Map<string, RequirementGroup>): string[] {
  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      annexure: `${value.requirement?.annexure ?? ''}`,
      familyRank: requirementFamilyRank(value),
      idx: value.requirement?.index ?? Number.MAX_SAFE_INTEGER,
      fallback: resolveTimestamp(value.docInfos[0]?.doc),
    }))
    .sort((a, b) => {
      const annexureCmp = compareAnnexureReferences(a.annexure, b.annexure);
      if (annexureCmp !== 0) return annexureCmp;
      if (a.familyRank !== b.familyRank) return a.familyRank - b.familyRank;
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.fallback - b.fallback;
    })
    .map((item) => item.key);
}

type RequirementSubGroup = {
  key: string;
  docs: DocInfo[];
  label?: string;
};

function groupDocumentsForRequirement(
  docInfos: DocInfo[],
  requirement?: RequirementMeta
): RequirementSubGroup[] {
  const groups = new Map<string, RequirementSubGroup>();
  const seenByGroup = new Map<string, Set<string>>();
  const requirementCode = (requirement?.code ?? '').toUpperCase();
  const isFirearmRequirement = requirementCode.includes('LICENCE') || requirementCode.includes('FIREARM');
  const isMembershipFamily = isMembershipRequirementFamily(requirement);
  const isSafeFamily = isSafeRequirementFamily(requirement);
  docInfos.forEach((info) => {
    const doc = info.doc;
    const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : undefined;

    let groupKey: string;
    if (isMembershipFamily) {
      const membershipId = info.membership?.id ? String(info.membership.id) : '';
      if (membershipId) {
        groupKey = `membership:${membershipId}`;
      } else {
        const membershipName =
          `${info.membership?.associationName ?? doc.requirementRelatedLabel ?? ''}`
            .trim()
            .toLowerCase();
        groupKey = membershipName ? `membership-name:${membershipName}` : `membership-doc:${doc.id}`;
      }
    } else if (isSafeFamily) {
      const safeId = info.safe?.id ? String(info.safe.id) : '';
      if (safeId) {
        groupKey = `safe:${safeId}`;
      } else {
        const safeName =
          `${info.safe?.safeName ?? doc.requirementRelatedLabel ?? ''}`
            .trim()
            .toLowerCase();
        groupKey = safeName ? `safe-name:${safeName}` : `safe-doc:${doc.id}`;
      }
    } else {
    const infoFirearmId = resolveInfoFirearmId(info);
    if (isFirearmRequirement && infoFirearmId) {
      groupKey = `firearm:${infoFirearmId}`;
    } else if (isFirearmRequirement) {
      return;
    } else if (relatedId) {
      groupKey = relatedId;
    } else if (ID_DOC_CODES.has(requirementCode)) {
      groupKey = 'identity';
    } else if (doc.requirementRelatedLabel) {
      groupKey = doc.requirementRelatedLabel;
    } else {
      groupKey = doc.id;
    }
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        docs: [],
        label: doc.requirementRelatedLabel,
      });
      seenByGroup.set(groupKey, new Set());
    }
    const seen = seenByGroup.get(groupKey)!;
    const docId = String(
      (doc.id ?? '') ||
      (doc.uri ?? '') ||
      `${doc.requirementCode ?? ''}-${doc.requirementRelatedId ?? ''}`
    );
    if (seen.has(docId)) {
      return;
    }
    seen.add(docId);
    groups.get(groupKey)!.docs.push(info);
  });

  const ordered = Array.from(groups.values());
  ordered.forEach((group) => {
    group.docs.sort((a, b) => sortDocumentsWithinGroup(a.doc, b.doc, requirement));
    if (isMembershipRequirementFamily(requirement)) {
      group.docs.sort((a, b) => {
        const aDisplayOrder =
          typeof a.requirement?.displayOrder === 'number'
            ? a.requirement.displayOrder
            : Number.MAX_SAFE_INTEGER;
        const bDisplayOrder =
          typeof b.requirement?.displayOrder === 'number'
            ? b.requirement.displayOrder
            : Number.MAX_SAFE_INTEGER;
        if (aDisplayOrder !== bDisplayOrder) return aDisplayOrder - bDisplayOrder;
        const aOrder = a.requirement?.index ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.requirement?.index ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aRank = membershipDocumentSortRank(a.doc);
        const bRank = membershipDocumentSortRank(b.doc);
        if (aRank !== bRank) return aRank - bRank;
        const aTime = resolveTimestamp(a.doc);
        const bTime = resolveTimestamp(b.doc);
        if (aTime !== bTime) return aTime - bTime;
        return String(a.doc.id ?? '').localeCompare(String(b.doc.id ?? ''));
      });
      return;
    }
    if (isProficiencyRequirementFamily(requirement)) {
      group.docs.sort((a, b) => {
        const aRank = proficiencyDocumentSortRank(a.doc);
        const bRank = proficiencyDocumentSortRank(b.doc);
        if (aRank !== bRank) return aRank - bRank;
        const aTime = resolveTimestamp(a.doc);
        const bTime = resolveTimestamp(b.doc);
        if (aTime !== bTime) return aTime - bTime;
        return String(a.doc.id ?? '').localeCompare(String(b.doc.id ?? ''));
      });
      return;
    }
    if (isSafeRequirementFamily(requirement)) {
      group.docs.sort((a, b) => {
        const aRank = resolveSafeCategoryRank(a);
        const bRank = resolveSafeCategoryRank(b);
        if (aRank !== bRank) return aRank - bRank;
        const aTime = resolveTimestamp(a.doc);
        const bTime = resolveTimestamp(b.doc);
        if (aTime !== bTime) return aTime - bTime;
        return String(a.doc.id ?? '').localeCompare(String(b.doc.id ?? ''));
      });
    }
  });
  ordered.sort((a, b) => {
    const aLabel = resolveGroupDisplayName(a, requirement);
    const bLabel = resolveGroupDisplayName(b, requirement);
    if (aLabel !== bLabel) return aLabel.localeCompare(bLabel);
    return a.key.localeCompare(b.key);
  });

  return ordered;
}

function resolveInfoFirearmId(info?: DocInfo): string {
  if (!info) return '';
  const firearmId = info.firearm?.id ? String(info.firearm.id) : '';
  if (firearmId) return firearmId;
  return info.doc.requirementRelatedId ? String(info.doc.requirementRelatedId) : '';
}

function sortDocumentsWithinGroup(a: Document, b: Document, requirement?: RequirementMeta): number {
  const code = (requirement?.code ?? '').toUpperCase();
  if (ID_DOC_CODES.has(code) || code.includes('LICENCE')) {
    const order = new Map<IdentityDocumentSide | undefined, number>([
      ['front', 0],
      ['both', 1],
      ['back', 2],
      ['not_applicable', 3],
      [undefined, 4],
    ]);
    const aSide = order.get(a.identityDocumentSide) ?? 5;
    const bSide = order.get(b.identityDocumentSide) ?? 5;
    if (aSide !== bSide) return aSide - bSide;
  }
  return resolveTimestamp(a) - resolveTimestamp(b);
}

function buildDocumentLabel(
  info: DocInfo,
  requirementLabel?: string,
  groupLabel?: string
): string {
  const { doc, firearm, competency, safe, proficiency } = info;
  const codeUpper = (info.requirement?.code ?? '').toUpperCase();
  const docCodeUpper = (doc.requirementCode ?? doc.kind ?? '').toUpperCase();
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
    `${doc.parentType ?? ''}`.toLowerCase() === 'proficiency';
  const baseLabel = codeUpper.includes('SAFE') && doc.name ? doc.name : requirementLabel;
  let label = baseLabel ?? doc.name ?? 'Supporting document';
  const trimmedGroup = groupLabel?.trim();
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
  } else if (trimmedGroup && trimmedGroup.length) {
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
          (info.membership?.membershipDocumentIds ?? [])
            .filter((entry) => String(entry?.documentId ?? '').trim() === String(doc.id ?? ''))
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
      const categories = categoriesFromMembership.length ? categoriesFromMembership : categoriesFromDocName;
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
    const safePhotoCategory =
      safe?.safePhotos?.find((photo) => String(photo.documentId) === String(doc.id))?.category ??
      (doc.requirementCode as any) ??
      (doc.requirementRelatedLabel as any) ??
      '';
    const category = SAFE_PHOTO_LABELS[String(safePhotoCategory).toUpperCase()] || 'Safe photo';
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

  // if (!isSafeDoc && safe?.notes) {
  //   label = `${label} — ${safe.notes}`;
  // } else if (doc.notes) {
  //   label = `${label} — ${doc.notes}`;
  // }

  const requirementSides = info.requirement?.documentKinds
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
    const side = IDENTITY_SIDE_LABELS[doc.identityDocumentSide] ?? doc.identityDocumentSide;
    label = `${label} (${side.toUpperCase()})`;
  }
  return label.replace(/\s+/g, ' ').trim();
}

function addCoverPage(pdf: PDFDocument, boldFont: PDFFont) {
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const text = 'ANNEXURES';
  const textWidth = boldFont.widthOfTextAtSize(text, COVER_SIZE);
  const textHeight = boldFont.heightAtSize(COVER_SIZE);
  const x = (A4_WIDTH - textWidth) / 2;
  const y = (A4_HEIGHT - textHeight) / 2;
  page.drawText(text, { x, y, size: COVER_SIZE, font: boldFont });
}

function wrapHeadingText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawHeading(page: PDFPage, boldFont: PDFFont, heading: string) {
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const lines = wrapHeadingText(boldFont, heading, HEADING_SIZE, maxWidth);
  const lineHeight = HEADING_SIZE + 4;
  const startY = A4_HEIGHT - PAGE_MARGIN - HEADING_SIZE;
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: PAGE_MARGIN,
      y: startY - index * lineHeight,
      size: HEADING_SIZE,
      font: boldFont,
    });
  });
  const lastLine = lines[lines.length - 1] ?? '';
  const lastLineY = startY - (lines.length - 1) * lineHeight;
  const width = boldFont.widthOfTextAtSize(lastLine, HEADING_SIZE);
  page.drawLine({
    start: { x: PAGE_MARGIN, y: lastLineY - HEADING_UNDERLINE_GAP },
    end: { x: PAGE_MARGIN + width, y: lastLineY - HEADING_UNDERLINE_GAP },
    thickness: 1,
  });
  return HEADING_SIZE + (lines.length - 1) * lineHeight;
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  iconImage: PDFImage,
  iconDims: { width: number; height: number },
) {
  const text = '© www.guncerts.co.za';
  const textWidth = font.widthOfTextAtSize(text, FOOTER_TEXT_SIZE);
  const iconX = A4_WIDTH - FOOTER_MARGIN - iconDims.width;
  const textX = iconX - 6 - textWidth;
  const y = FOOTER_MARGIN;
  const textY = y + (iconDims.height - font.heightAtSize(FOOTER_TEXT_SIZE) + 2) / 2;
  page.drawText(text, {
    x: textX,
    y: textY,
    size: FOOTER_TEXT_SIZE,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawImage(iconImage, {
    x: iconX,
    y,
    width: iconDims.width,
    height: iconDims.height,
  });
}

function addFirearmListPage(
  pdf: PDFDocument,
  firearms: Firearm[],
  annexureLetter: string | null,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const heading = 'ANNEXURE A1: List of firearms';
  const headingY = A4_HEIGHT - PAGE_MARGIN;
  page.drawText(heading, {
    x: PAGE_MARGIN,
    y: headingY,
    size: 22,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const tableTop = headingY - 40;
  const tableWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const col2Width = tableWidth * 0.1;
  const col3Width = tableWidth * 0.15;
  const col4Width = tableWidth * 0.15;
  const col1Width = tableWidth - col2Width - col3Width - col4Width;
  const rowHeight = 28;

  const drawCell = (text: string, x: number, y: number, width: number, isHeader = false, align: 'left' | 'center' = 'left') => {
    page.drawRectangle({
      x,
      y: y - rowHeight + 4,
      width,
      height: rowHeight,
      color: isHeader ? rgb(0.95, 0.97, 0.99) : rgb(1, 1, 1),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });
    const textWidth = (isHeader ? boldFont : regularFont).widthOfTextAtSize(text, 11);
    const textX =
      align === 'center'
        ? x + (width - textWidth) / 2
        : x + 10;
    page.drawText(text, {
      x: textX,
      y: y - rowHeight / 2,
      size: 11,
      font: isHeader ? boldFont : regularFont,
      color: rgb(0.1, 0.1, 0.1),
    });
  };

  let cursorY = tableTop;
  // Header row
  drawCell('Firearm', PAGE_MARGIN, cursorY, col1Width, true, 'left');
  drawCell('Annex', PAGE_MARGIN + col1Width, cursorY, col2Width, true, 'center');
  drawCell('Date issued', PAGE_MARGIN + col1Width + col2Width, cursorY, col3Width, true, 'center');
  drawCell('Expiry date', PAGE_MARGIN + col1Width + col2Width + col3Width, cursorY, col4Width, true, 'center');
  cursorY -= rowHeight;

  const annexurePrefix = annexureLetter ? `ANNEXURE ${annexureLetter}` : '';
  firearms.forEach((firearm, index) => {
    const licence = `${firearm.licenseNumber ?? (firearm as any).licenceNumber ?? ''}`.trim() || '-';
    const section = `${(firearm as any).section ?? (firearm as any).licenceSection ?? (firearm as any).licenseSection ?? ''}`
      .trim()
      .replace(/^section\s*/i, '');
    const make = `${firearm.make ?? ''}`.trim();
    const model = `${firearm.model ?? ''}`.trim();
    const serial =
      `${firearm.firearmSerialNumber ?? (firearm as any).serialNumber ?? (firearm as any).firearmSerialNo ?? ''}`.trim();
    const issued = `${(firearm as any).validFrom ?? (firearm as any).issuedAt ?? (firearm as any).issuedOn ?? ''}`.trim() || '-';
    const expires = `${(firearm as any).validTo ?? (firearm as any).expiresAt ?? (firearm as any).expiryDate ?? ''}`.trim() || '-';
    const annexureRef = annexureLetter ? `${annexureLetter}${index + 1}` : '-';
    const firearmLabel = `${licence} (S${section || '-'}): ${[make, model].filter(Boolean).join(' ').trim() || '-'} (${serial || '-'})`;
    drawCell(firearmLabel, PAGE_MARGIN, cursorY, col1Width, false, 'left');
    drawCell(annexureRef, PAGE_MARGIN + col1Width, cursorY, col2Width, false, 'center');
    drawCell(issued, PAGE_MARGIN + col1Width + col2Width, cursorY, col3Width, false, 'center');
    drawCell(expires, PAGE_MARGIN + col1Width + col2Width + col3Width, cursorY, col4Width, false, 'center');
    cursorY -= rowHeight;
  });
}

function resolveFirearmAnnexureLetter(policyMeta: ReturnType<typeof resolvePolicyMeta>): string | null {
  const candidates = Array.from(policyMeta.byKey.values());
  const match =
    candidates.find((req) => `${req.code ?? ''}`.toUpperCase() === 'FIREARM_LICENCE') ||
    candidates.find((req) => {
      const code = `${req.code ?? ''}`.toUpperCase();
      return code.includes('FIREARM') && code.includes('LICENCE');
    }) ||
    candidates.find((req) => {
      const code = `${req.code ?? ''}`.toUpperCase();
      return code.includes('FIREARM') || code.includes('LICENCE');
    });
  const annexure = `${match?.annexure ?? ''}`.trim().toUpperCase();
  return annexure || null;
}

async function embedDocumentContent(
  pdf: PDFDocument,
  page: PDFPage,
  doc: Document,
  missingText: string,
  boldFont: PDFFont,
  notes?: string | null,
  headingHeight = HEADING_SIZE
) {
  const topY = A4_HEIGHT - PAGE_MARGIN - headingHeight - 20;
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const notesHeight = notes ? 40 : 0;
  const maxHeight = A4_HEIGHT - PAGE_MARGIN * 2 - headingHeight - 40 - notesHeight;

  const normalizedNotes = notes ? String(notes).replace(/\s+/g, ' ').trim() : '';
  if (normalizedNotes) {
    const textSize = 11;
    page.drawText(normalizedNotes, {
      x: PAGE_MARGIN,
      y: topY - textSize,
      size: textSize,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth,
    } as any);
  }

  const bytes = await loadImageBytes(doc);
  if (!bytes) {
    drawMissingDocText(page, missingText, boldFont, maxWidth, topY, maxHeight);
    return;
  }

  const { isPng } = inferImageType(doc);
  let embedded: any = null;
  try {
    embedded = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch (err) {
    try {
      embedded = isPng ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    } catch {
      embedded = null;
    }
  }

  if (!embedded) {
    drawMissingDocText(page, missingText, boldFont, maxWidth, topY, maxHeight);
    return;
  }

  const { width, height } = embedded.scale(1);
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const x = PAGE_MARGIN + (maxWidth - drawWidth) / 2;
  const y = topY - drawHeight;

  page.drawImage(embedded, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });
}

async function embedActivityDocumentsTwoUp(
  pdf: PDFDocument,
  page: PDFPage,
  docs: Document[],
  missingText: string,
  boldFont: PDFFont,
  headingHeight = HEADING_SIZE,
) {
  const topY = A4_HEIGHT - PAGE_MARGIN - headingHeight - 20;
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const maxHeight = A4_HEIGHT - PAGE_MARGIN * 2 - headingHeight - 40;
  const gap = 16;
  const slotHeight = docs.length > 1 ? (maxHeight - gap) / 2 : maxHeight;

  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index];
    const slotTopY = topY - index * (slotHeight + gap);
    const slotBottomY = slotTopY - slotHeight;
    const bytes = await loadImageBytes(doc);
    if (!bytes) {
      drawMissingDocText(page, missingText, boldFont, maxWidth, slotTopY, slotHeight);
      continue;
    }
    const { isPng } = inferImageType(doc);
    let embedded: any = null;
    try {
      embedded = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      try {
        embedded = isPng ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      } catch {
        embedded = null;
      }
    }
    if (!embedded) {
      drawMissingDocText(page, missingText, boldFont, maxWidth, slotTopY, slotHeight);
      continue;
    }
    const { width, height } = embedded.scale(1);
    const scale = Math.min(maxWidth / width, slotHeight / height, 1);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const x = PAGE_MARGIN + (maxWidth - drawWidth) / 2;
    const y = slotBottomY + (slotHeight - drawHeight) / 2;
    page.drawImage(embedded, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }
}

function drawMissingDocText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  maxWidth: number,
  topY: number,
  maxHeight: number
) {
  const size = 12;
  const width = font.widthOfTextAtSize(text, size);
  const x = PAGE_MARGIN + Math.max(0, (maxWidth - width) / 2);
  const y = topY - maxHeight / 2;
  page.drawText(text, { x, y, size, font, color: rgb(0.6, 0.1, 0.1) });
}

function wrapParagraph(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines;
}

function drawSupportingStatementBody(
  page: PDFPage,
  generatedText: string | undefined,
  regularFont: PDFFont,
  boldFont: PDFFont,
  missingText: string,
  headingHeight = HEADING_SIZE
) {
  const normalized = String(generatedText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\bSUPPORTING STATEMENTS\b/gi, 'CHARACTER REFERENCES')
    .replace(/\bSUPPORTING STATEMENT\b/gi, 'CHARACTER REFERENCE')
    .trim();
  const topY = A4_HEIGHT - PAGE_MARGIN - headingHeight - 36;
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const maxHeight = A4_HEIGHT - PAGE_MARGIN * 2 - headingHeight - 40;
  if (!normalized) {
    drawMissingDocText(page, missingText, boldFont, maxWidth, topY, maxHeight);
    return;
  }

  const lineHeight = 16;
  const size = 12;
  let cursorY = topY;
  const minY = PAGE_MARGIN + 20;
  const rawLines = normalized.split('\n');

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      cursorY -= lineHeight;
      if (cursorY < minY) return;
      continue;
    }
    const lines = wrapParagraph(regularFont, trimmed, size, maxWidth);
    for (const line of lines) {
      if (cursorY < minY) return;
      page.drawText(line, {
        x: PAGE_MARGIN,
        y: cursorY,
        size,
        font: regularFont,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= lineHeight;
    }
  }
}

async function loadImageBytes(doc?: Document): Promise<Uint8Array | null> {
  if (!doc) return null;
  const { isImage } = inferImageType(doc);
  if (!isImage) return null;

  if ((doc as any).base64Data) {
    try {
      return Buffer.from((doc as any).base64Data, 'base64');
    } catch {
      return null;
    }
  }

  const uri = normalizeDocUri(doc);
  if (!uri) return null;

  try {
    if (uri.startsWith('data:')) {
      const commaIdx = uri.indexOf(',');
      const base64 = commaIdx >= 0 ? uri.slice(commaIdx + 1) : uri;
      return Buffer.from(base64, 'base64');
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64 as any,
    });
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

function normalizeDocUri(doc: Document): string | null {
  const raw = doc.uri || doc.filePath;
  if (!raw) return null;
  if (raw.startsWith('data:')) return raw;
  return resolveDocumentUri(raw);
}

function inferImageType(doc: Document): { isImage: boolean; isPng: boolean } {
  const mime = doc.mime || '';
  const name = doc.name || '';
  const uri = doc.uri || doc.filePath || '';
  const lookups = [mime, name, uri].join(' ').toLowerCase();
  const isPng = lookups.includes('png') || /\.png($|\?)/i.test(lookups);
  const isJpg = lookups.includes('jpeg') || lookups.includes('jpg') || /\.jpe?g($|\?)/i.test(lookups);
  const isHeic = lookups.includes('heic') || lookups.includes('heif');
  const isImage = isPng || isJpg || isHeic;
  return { isImage, isPng: isPng || (!isJpg && !isHeic) };
}

function resolveMissingDocumentText(application: Application): string {
  const form = ((application as any).form || (application as any).type || '').toLowerCase();
  if (form === '517g') return (policy517g as any).missingDocumentText || 'DOCUMENT NOT PROVIDED';
  if (form === '518a') return (policy518a as any).missingDocumentText || 'DOCUMENT NOT PROVIDED';
  return 'DOCUMENT NOT PROVIDED';
}
