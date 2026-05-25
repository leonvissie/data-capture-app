import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Linking, StyleProp, ViewStyle, ActionSheetIOS, Platform, Modal, Image, ScrollView, FlatList, ListRenderItem, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../../../src/components/Screen';
import PageHeader from '../../../src/components/PageHeader';
import PageFlatList from '../../../src/components/PageFlatList';
import { useTones } from '../../../src/theme/tones';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Application, Document, CompetencyCertificate, CompetencyCategory, Firearm, IdentityDocumentSide, CaptureMethod, Safe, Profile, Membership, Proficiency, ProficiencyDocument, ApplicationDocEntry, ApplicationDocState, SupportingStatement, SupportingStatementSlot, CompetencyExpiryReminderPreference, ActivityEvidence } from '../../../src/data/types';
import { deleteEntity, getById, listByType } from '../../../src/data/sqlite';
import { ensureUserPrefs, persist, touch, withMeta } from '../../../src/data/repo';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
// import { checklistByForm, type DocRequirement } from '../../../src/config/docChecklists';
import { resolveRequirementsForApplication, type NormalizedRequirement, type NormalizedAcknowledgement } from '../../../src/policy/resolve';
import DocumentActionCard, { DocumentAction, type DocumentIssuePill } from '../../../src/components/DocumentActionCard';
import ProofCard, { ProofMiniCard } from '../../../src/components/ProofCard';
import CompetencyCertificatesSelectionCard from '../../../src/components/CompetencyCertificatesSelectionCard';
import FirearmSelectionCard from '../../../src/components/FirearmSelectionCard';
import SafeSelectionCard from '../../../src/components/SafeSelectionCard';
import ConfirmationCard from '../../../src/components/ConfirmationCard';
import HelpModal from '../../../src/components/HelpModal';
import SupportingStatementCards, { SupportingStatementCardConfig } from '../../../src/components/supporting/SupportingStatementCards';
import { Ionicons } from '@expo/vector-icons';
import { IconButtonGroup } from '../../../src/components/IconButton';
import { FloatingIconRoundButton, type IconRoundButtonType } from '../../../src/components/RoundIconButton';
import { parseArrayParam } from '../../../src/utils/queryParams';
import { ensureJpegAsset } from '../../../src/utils/image';
import { ensurePhotoLibraryPermission } from '../../../src/utils/permissions';
import { deleteOwnedDocFile } from '../../../src/utils/docCrypto';
import { useHelpModal } from '../../../src/help';
import { canNavigateBack } from '../../../src/utils/navigation';
import { decodeNav, statusToListPath, closeTo, resolveWizardRoute, buildDocumentsRoute, backOrReplaceWithContext } from '../../../src/navigation/helpers';
import { useDevMode } from '../../../src/providers/DevModeProvider';
import { computeDocumentReadiness, computeMembershipStatus } from '../../../src/utils/applicationReady';
import { logger } from '@/src/utils/logger';
import { categoryLabel } from '../../../src/utils/categoryLabel';
import { resolveProficiencyCategories } from '../../../src/utils/proficiencyModel';
import { getDocumentBaseDir, resolveDocumentUri, toRelativeDocumentPath } from '../../../src/utils/documentPaths';
import { formatFirearmTitle } from '../../../src/utils/firearmDisplay';
import { useDemoDataResetGuard } from '../../../src/demo/useDemoDataResetGuard';
import { createSupportingStatement } from '../../../src/data/defaults';
import { clearProfileProofOfAddress } from '../../../src/data/entityCleanup';
import { appConfig } from '../../../src/config/appConfig';
import policy517g from '../../../src/policy/517g.json';
import policy518a from '../../../src/policy/518a.json';
import policy517 from '../../../src/policy/517.json';
import { sharedRequirementDefaultsByCode } from '../../../src/policy/shared/commonDocuments';
import {
  DECLARATIONS_ANCHOR,
  MISSING_SUPPORTING_STATEMENT,
  buildExpiredSelectionWarningCopy,
  buildSectionLimitWarningIssues,
  buildSubmittedApplicationWarningIssues,
  normalizeMissingItem,
  parseMissingItems,
  type DocumentSectionIssue,
} from '../../../src/utils/documentIssues';
import { compareCompetencyCertificates } from '../../../src/utils/competencyCertificates';
import { getProofOfAddressFreshness } from '../../../src/utils/proofOfAddressFreshness';
import { getReminderVisualState } from '../../../src/utils/reminderVisuals';
import { buildMembershipSubmissionWarningCopy, getMembershipSubmissionValidity } from '../../../src/utils/membershipSubmissionValidity';
import { buildMembershipDocumentFreshnessCopy, getMembershipDocumentFreshness } from '../../../src/utils/membershipDocumentFreshness';
import { getMembershipHealth } from '../../../src/utils/membershipHealth';
import { buildMembershipEndorsementLabels } from '../../../src/utils/membershipEndorsements';
import { buildSupportingStatementFreshnessCopy, getSupportingStatementFreshness } from '../../../src/utils/supportingStatementFreshness';
import { compareCompetenciesByReminderPriority, compareFirearmsByReminderPriority } from '../../../src/utils/reminderSort';
import { getCompetencyCertificateIdsInTerminalApplications, getFirearmIdsInTerminalApplications } from '../../../src/utils/applicationUsage';
import { compareFirearms } from '../../../src/utils/firearmSort';
import { composeMotivation } from '../../../src/config/motivation/composer';
import { resolveEvidenceFromApplication } from '../../../src/config/motivation/evidenceResolver';
import { validateForm517Readiness } from '../../../src/utils/form517Validation';
import {
  buildApplicationMotivationMirrorPatch,
  findMotivationByHolderAndFirearm,
  getPrimaryApplicationFirearmId,
  resolveApplicationMotivation,
} from '../../../src/utils/motivationStore';
import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionType,
} from '../../../src/config/motivation/sentenceBank.types';

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;

const normalizeRequirementCode = (value?: string | null) =>
  (value == null ? '' : String(value)).trim().toUpperCase();

const resolveRequirementHelpKey = (req: Pick<NormalizedRequirement, 'code' | 'helpKey'>): string | undefined => {
  const code = normalizeRequirementCode(req.code);
  if (code.startsWith('COMPETENCY_CERT') || code.startsWith('COMPETENCY')) {
    return 'helpDocsSelectCompetency';
  }
  return req.helpKey;
};

const SUPPORTING_SLOTS: SupportingStatementSlot[] = [
  'spouse_family',
  'friend_colleague_neighbour',
  'additional_reference',
];

const resolveDocSourceType = (doc?: Document): ApplicationDocEntry['source']['type'] => {
  const parentType = `${doc?.parentType ?? ''}`.toLowerCase();
  if (parentType === 'profile') return 'Profile';
  if (parentType === 'firearm') return 'Firearm';
  if (parentType === 'safe') return 'Safe';
  if (parentType === 'competencycertificate') return 'CompetencyCertificate';
  if (parentType === 'membership') return 'Membership';
  if (parentType === 'proficiency') return 'Proficiency';
  if (parentType === 'activityevidence') return 'ActivityEvidence';
  return 'Application';
};

const UPLOAD_ICON: DocumentAction['icon'] = 'upload';
const VALID_COMPETENCY_CATEGORIES = new Set<CompetencyCategory>([
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
]);

const MOTIVATION_PURPOSE_OPTIONS = new Set<MotivationPurposeType>([
  'self_defence',
  'hunting',
  'sport_shooting',
  'mixed_hunting_sport',
]);

function getProfileName(profile: Profile | null): string {
  return [profile?.givenNames, profile?.surname].filter(Boolean).join(' ').trim();
}

function getProfileInitials(profile: Profile | null): string {
  return `${profile?.initials ?? ''}`.trim();
}

function inferSectionTypeFromFirearmSection(value?: string | null): MotivationSectionType | null {
  const normalized = `${value ?? ''}`.toLowerCase();
  if (normalized.includes('13')) return 's13';
  if (normalized.includes('15')) return 's15';
  if (normalized.includes('16')) return 's16';
  return null;
}

function buildEvidenceKeys(
  applicationType: MotivationApplicationType,
  sectionType: MotivationSectionType
): string[] {
  const keys = ['competency_certificate', 'proficiency_certificate', 'safe_photos'];
  if (applicationType === 'renewal') keys.push('existing_licence_copy');
  if (sectionType === 's16') {
    keys.push('association_membership', 'dedicated_status', 'firearm_endorsement');
  }
  return Array.from(new Set(keys));
}

function normalizeUniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  value.forEach((entry) => {
    const trimmed = String(entry ?? '').trim();
    if (trimmed) ids.add(trimmed);
  });
  return Array.from(ids);
}

function haveSameIdSet(left: unknown, right: unknown): boolean {
  const leftIds = normalizeUniqueIds(left).sort();
  const rightIds = normalizeUniqueIds(right).sort();
  if (leftIds.length !== rightIds.length) return false;
  for (let i = 0; i < leftIds.length; i += 1) {
    if (leftIds[i] !== rightIds[i]) return false;
  }
  return true;
}

type MaxItemsPerApplicationRule = {
  itemKind?: string;
  maxCount?: number;
  section13?: number;
  section15?: number;
};

type PolicyWithMaxItemsPerApplication = {
  maxItemsPerApplication?: MaxItemsPerApplicationRule[];
};

type DocDefinition = {
  key: string;
  label: string;
  label2?: string;
  kind: Document['kind'];
  multiple?: boolean;
  help?: string;
  helpKey?: string;
  requiredUpload?: boolean;
  allowMultipleUploads?: boolean;
  allowedKinds?: NormalizedRequirement['allowedKinds'];
  group?: string;
  groupDescription?: string;
  __code?: string;
  cardStyle?: 'single' | 'multi' | 'statusMini';
  minUploads?: number;
  maxUploads?: number;
  isIdentityDocument?: boolean;
  isOptional?: boolean;
  displayOrder?: number;
};

type DocItemProgress = {
  key: string;
  label: string;
  kind: Document['kind'];
  status: 'pending' | 'captured' | 'extracted' | 'verified';
  code?: string;
  requiredUpload?: boolean;
  acknowledged?: boolean;
  allowMultipleUploads?: boolean;
  allowedKinds?: Array<'IMAGE' | 'PDF' | 'OTHER'>;
  captureMethod?: CaptureMethod;
  documentId?: string;
  extractionId?: string;
  multiple?: boolean;
  minUploads?: number;
  maxUploads?: number;
  identityDocumentSide?: IdentityDocumentSide;
  instances?: {
    documentId?: string;
    extractionId?: string;
    status: 'pending' | 'captured' | 'extracted' | 'verified';
    captureMethod?: CaptureMethod;
    relatedId?: string;
    label?: string;
    identityDocumentSide?: IdentityDocumentSide;
  }[];
  notes?: string;
};

type GroupedRequirementRow = {
  type: 'group';
  key: string;
  title: string;
  groupId: string;
  items: Array<{ progress: DocItemProgress; def: DocDefinition }>;
  helpSections: Array<{ label: string; help?: string; helpKey?: string }>;
};

type SingleRequirementRow = {
  type: 'single';
  key: string;
  item: DocItemProgress;
  def: DocDefinition;
};

type MembershipRequirementRow = {
  type: 'membership';
  key: string;
  def: DocDefinition;
};

type ProficiencyRequirementRow = {
  type: 'proficiency';
  key: string;
  def: DocDefinition;
};

type ActivityEvidenceRequirementRow = {
  type: 'activityEvidence';
  key: string;
  def: DocDefinition;
};

type RequirementListItem =
  | GroupedRequirementRow
  | SingleRequirementRow
  | MembershipRequirementRow
  | ProficiencyRequirementRow
  | ActivityEvidenceRequirementRow;

const inferKind = (
  req: NormalizedRequirement
): Document['kind'] => {

  const code = req.code.toUpperCase();
  const label = req.label.toUpperCase();

  if (code.includes('SUPPORTING_STATEMENT') || label.includes('SUPPORTING STATEMENT')) {
    return 'SUPPORTING_STATEMENT';
  }
  if (code.includes('STATEMENT_OF_RESULTS')) {
    return 'STATEMENT_OF_RESULTS';
  }
  if (code.includes('SAFE') || label.includes('SAFE')) {
    return 'SAFE';
  }
  if (code.includes('COMPETENCY_CERT') ) {
    return 'COMPETENCY_CERT';
  }
  if (code.includes('LICENCE')) {
    return 'FIREARM_LICENCE';
  }
  if (code.includes('ADDRESS') || label.includes('ADDRESS')) {
    return 'PROOF_OF_ADDRESS';
  }
  if (code.startsWith('ID') || code.includes('ID_DOC') || label.includes('IDENTITY') || label.includes('PASSPORT')) {
    return 'ID_CARD';
  }
  return 'OTHER';
};

function canonicalForm(form?: string) {
  const key = (form || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^e/, '');
  if (key === '517' || key === '517g' || key === '518a') return key as '517' | '517g' | '518a';
  return form as any;
}

function policyAutoSelectSingle(form: string | undefined, code: string): boolean {
  const normalized = canonicalForm(form);
  const policy =
    normalized === '517'
      ? (policy517 as any)
      : normalized === '517g'
      ? (policy517g as any)
      : normalized === '518a'
        ? (policy518a as any)
        : null;
  const requirements = Array.isArray(policy?.requirements) ? policy.requirements : [];
  const entry = requirements.find((req: any) => `${req?.code ?? ''}`.toUpperCase() === code.toUpperCase());
  if (!entry) return true;
  return entry.autoSelectSingle !== false;
}

function resolveSharedRequirementFallback(form: string | undefined, code: string): {
  label?: string;
  help?: string;
  helpKey?: string;
  displayOrder?: number;
} {
  const normalizedForm = canonicalForm(form);
  const key = String(code ?? '').toUpperCase();
  const shared = (sharedRequirementDefaultsByCode as Record<string, any>)[key];
  if (!shared) return {};

  const byForm = (field: string) => {
    const map = shared?.[`${field}ByForm`];
    if (!map || typeof map !== 'object') return undefined;
    return normalizedForm ? map?.[normalizedForm] : undefined;
  };

  return {
    label: byForm('label') ?? shared.label,
    help: byForm('help') ?? byForm('description') ?? shared.help ?? shared.description,
    helpKey: byForm('helpKey') ?? shared.helpKey,
    displayOrder: byForm('displayOrder') ?? shared.displayOrder,
  };
}

function formatCertificateLabel(cert: CompetencyCertificate) {
  const number = cert.certificateNumber?.trim();
  const cats = (cert.categories ?? []).map(categoryLabel).filter(Boolean).join(', ');
  if (number && cats) return `${number} — ${cats}`;
  if (number) return number;
  if (cats) return `Categories: ${cats}`;
  return 'Competency certificate';
}

function formatFirearmLabel(firearm: Firearm) {
  return formatFirearmTitle(firearm);
}

type AllowedKind = 'IMAGE' | 'PDF' | 'OTHER';

type DocActionContext = {
  relatedId?: string;
  label?: string;
  allowedKinds?: AllowedKind[];
  documentId?: string;
  identityDocumentSide?: IdentityDocumentSide;
};

type DocInstance = NonNullable<DocItemProgress['instances']>[number];

const isImageAllowed = (allowedKinds?: AllowedKind[]) =>
  !allowedKinds || allowedKinds.includes('IMAGE');

const idDocKinds: Document['kind'][] = ['ID_CARD', 'ID_BOOK', 'PASSPORT'];
const docIdType = (doc?: Document): Profile['idType'] | undefined => {
  if (!doc) return undefined;
  const kind = `${doc.kind ?? ''}`.toUpperCase();
  if (kind.includes('PASSPORT')) return 'PASSPORT';
  if (kind.includes('BOOK')) return 'ID_BOOK';
  return 'ID_CARD';
};
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

const labelForIdType = (type?: Profile['idType']) => {
  if (type === 'PASSPORT') return 'passport';
  if (type === 'ID_BOOK') return 'ID book';
  if (type === 'ID_CARD') return 'ID card';
  return 'ID';
};

const pickerTypesForKinds = (allowedKinds?: AllowedKind[]) => {
  const set = new Set<string>();
  if (!allowedKinds || allowedKinds.length === 0) {
    set.add('image/*');
    set.add('application/pdf');
  } else {
    if (allowedKinds.includes('IMAGE')) set.add('image/*');
    if (allowedKinds.includes('PDF')) set.add('application/pdf');
    if (allowedKinds.includes('OTHER')) set.add('*/*');
  }
  if (!set.size) {
    set.add('image/*');
    set.add('application/pdf');
  }
  return Array.from(set);
};

const countCapturedInstances = (item: DocItemProgress) =>
  (item.instances ?? []).filter((inst) => !!inst.documentId).length;

const identitySideLabels: Record<IdentityDocumentSide, string> = {
  front: 'Front',
  back: 'Back',
  both: 'Both sides',
  not_applicable: 'Not applicable',
};

const addressEquals = (a?: Profile['address'] | null, b?: Profile['address'] | null) => {
  if (!a && !b) return true;
  const norm = (addr?: Profile['address'] | null) => `${addr?.singleLine ?? ''}|${addr?.postCode ?? ''}`.trim();
  return norm(a) === norm(b);
};

const identitySideOrder: Record<IdentityDocumentSide, number> = {
  front: 0,
  back: 1,
  both: 2,
  not_applicable: 3,
};

const idHeadingForProfile = (profile: Profile | null) => {
  const type = profile?.idType;
  if (type === 'ID_CARD') return 'ID Card';
  if (type === 'PASSPORT') return 'Passport';
  if (type === 'ID_BOOK') return 'ID Book';
  return 'ID';
};

const PROOF_CARD_CODES = new Set<string>();

const requirementCapturedByCode = (
  code: string,
  defs: DocDefinition[],
  progressItems: DocItemProgress[]
): boolean => {
  const upper = code.toUpperCase();
  const def = defs.find((d) => (d.__code ?? d.key ?? '').toUpperCase() === upper);
  const progress = progressItems.find((p) => (p.code ?? p.key ?? '').toUpperCase() === upper);
  if (def) {
    return requirementCaptured(def, progress);
  }
  if (!progress) return false;
  return hasCapturedUpload(progress);
};

const collectApplicationDocEntries = (
  docItems?: DocItemProgress[],
  extraDocs?: Document[],
  safeDocsById?: Map<string, Document[]>,
  safeIds?: string[],
): ApplicationDocEntry[] => {
  const entries: ApplicationDocEntry[] = [];
  const seen = new Set<string>();
  const pushDoc = (doc: Document, requirementCode?: string, fallbackKind?: Document['kind']) => {
    if (!doc?.id) return;
    const id = String(doc.id);
    if (seen.has(id)) return;
    seen.add(id);
    const code = normalizeRequirementCode(
      requirementCode || doc.requirementCode || (doc.kind as string) || 'OTHER'
    );
    entries.push({
      requirementCode: code || 'OTHER',
      kind: (doc.kind ?? fallbackKind ?? 'OTHER') as Document['kind'],
      documentId: id,
      source: {
        type: resolveDocSourceType(doc),
        id: doc.parentId ? String(doc.parentId) : undefined,
      },
    });
  };

  (docItems ?? []).forEach((item) => {
    const code = normalizeRequirementCode(item.code ?? item.key);
    if (item.documentId) {
      const doc = getById<Document>(String(item.documentId));
      if (doc) pushDoc(doc, code, item.kind);
    }
    (item.instances ?? []).forEach((inst) => {
      if (!inst.documentId) return;
      const doc = getById<Document>(String(inst.documentId));
      if (doc) pushDoc(doc, code, item.kind);
    });
  });

  (extraDocs ?? []).forEach((doc) => {
    if (!doc) return;
    pushDoc(doc, doc.requirementCode ?? undefined, doc.kind);
  });

  if (safeIds && safeDocsById) {
    safeIds.forEach((sid) => {
      const docs = safeDocsById.get(String(sid)) ?? [];
      docs.forEach((doc) => pushDoc(doc, doc.requirementCode ?? undefined, doc.kind ?? 'SAFE'));
    });
  }

  return entries;
};

const persistApp = (
  appDraft: Application,
  alreadyTouched = false,
  docState?: ApplicationDocState,
) => {
  const base = alreadyTouched ? appDraft : touch(appDraft);
  const next = docState ? ({ ...base, docs: docState } as Application) : base;
  persist(next);
};

const addressHeadingForProfile = (profile: Profile | null) => {
  const same = addressEquals(profile?.address, profile?.addressPostal);
  return 'Residential address';
};

const normalizeId = (value?: string | number | null) => {
  if (value === undefined || value === null) return undefined;
  const str = String(value);
  return str.length ? str : undefined;
};

const normalizeIdList = (values?: Array<string | number | null | undefined>) => {
  const set = new Set<string>();
  (values ?? []).forEach((value) => {
    const normalized = normalizeId(value);
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

const isExpired = (value?: string | null) => {
  const date = parseIsoDate(value);
  if (!date) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date.getTime() < todayUtc;
};

const isIdentityDocItem = (item: DocItemProgress) => {
  const kind = item.kind;
  if (kind === 'ID_CARD' || kind === 'ID_BOOK' || kind === 'FIREARM_LICENCE') return true;
  const code = (item.code ?? item.key ?? '').toUpperCase();
  if (code.includes('ID_DOC')) return true;
  if (code.includes('LICENCE')) return true;
  return false;
};

const isFirearmLicenceRequirementCode = (code?: string) => {
  if (!code) return false;
  const normalized = code.toUpperCase();
  if (!normalized) return false;
  if (normalized === 'FIREARM_LICENCE') return true;
  if (normalized.includes('FIREARM')) return true;
  return false;
};

const isCompetencyRequirementCode = (code?: string) => {
  if (!code) return false;
  const normalized = code.toUpperCase();
  if (!normalized) return false;
  return normalized.startsWith('COMPETENCY_CERT') || normalized.startsWith('COMPETENCY');
};

const isSafeRequirementCode = (code?: string) => {
  if (!code) return false;
  const normalized = code.toUpperCase();
  if (!normalized) return false;
  return normalized.includes('SAFE');
};

const resolveFirearmSectionCode = (firearm?: Firearm): '13' | '15' | null => {
  const raw = String(firearm?.section ?? '').toUpperCase();
  if (!raw) return null;
  const normalized = raw.replace(/SECTION/gi, '').replace(/[^0-9]/g, '');
  if (normalized === '13') return '13';
  if (normalized === '15') return '15';
  return null;
};

const getMaxCountByItemKind = (
  policy: PolicyWithMaxItemsPerApplication | null | undefined
) => {
  const map = new Map<string, number>();
  const rules = Array.isArray(policy?.maxItemsPerApplication)
    ? policy.maxItemsPerApplication
    : [];
  rules.forEach((rule) => {
    const kind = String(rule?.itemKind ?? '').trim().toUpperCase();
    const max = Number(rule?.maxCount);
    if (!kind || !Number.isFinite(max) || max < 1) return;
    map.set(kind, Math.floor(max));
  });
  return map;
};

const getFirearmRuleFromPolicy = (
  policy: PolicyWithMaxItemsPerApplication | null | undefined
): MaxItemsPerApplicationRule | null => {
  const rules = Array.isArray(policy?.maxItemsPerApplication)
    ? policy.maxItemsPerApplication
    : [];
  for (const rule of rules) {
    const kind = String(rule?.itemKind ?? '').trim().toUpperCase();
    if (kind === 'FIREARM_LICENCE' || kind === 'FIREARM' || kind === 'FIREARM_LICENSE') {
      return rule;
    }
  }
  return null;
};

const describeIdentityDocumentSubject = (item: DocItemProgress) => {
  if (item.kind === 'FIREARM_LICENCE')return 'licence card';
  if (item.kind === 'ID_CARD')return 'ID card';
  if (item.kind === 'ID_BOOK')return 'ID book';
  return 'Unknown document';
};

const collectIdentitySides = (item: DocItemProgress): IdentityDocumentSide[] => {
  const sides = new Set<IdentityDocumentSide>();
  if (item.identityDocumentSide) sides.add(item.identityDocumentSide);
  (item.instances ?? []).forEach((inst) => {
    if (inst.identityDocumentSide) sides.add(inst.identityDocumentSide);
  });
  return Array.from(sides);
};

const identityHasBothSides = (item: DocItemProgress) => {
  const sides = collectIdentitySides(item);
  if (sides.includes('both')) return true;
  return sides.includes('front') && sides.includes('back');
};

const formatIdentityStatus = (item: DocItemProgress) => {
  const sides = collectIdentitySides(item);
  if (!sides.length) return 'Pending';
  const hasBoth = sides.includes('both') || (sides.includes('front') && sides.includes('back'));
  if (hasBoth) return 'Captured (both sides)';
  if (sides.includes('front')) return 'Front captured';
  if (sides.includes('back')) return 'Back captured';
  if (sides.includes('not_applicable')) return 'Marked not applicable';
  return 'Captured';
};

const shouldRemindOtherIdentitySide = (item: DocItemProgress, selected?: IdentityDocumentSide) => {
  if (!selected) return false;
  if (selected !== 'front' && selected !== 'back') return false;
  const opposite = selected === 'front' ? 'back' : 'front';
  const sides = collectIdentitySides(item).filter((side) => side !== selected);
  if (sides.includes('both')) return false;
  return !sides.includes(opposite);
};

const getMissingIdentitySides = (item: DocItemProgress): IdentityDocumentSide[] => {
  const sides = collectIdentitySides(item);
  if (sides.includes('both') || sides.includes('not_applicable')) return [];
  const missing: IdentityDocumentSide[] = [];
  if (!sides.includes('front')) missing.push('front');
  if (!sides.includes('back')) missing.push('back');
  return missing;
};

const documentsStorageDir = (() => {
  const base = getDocumentBaseDir();
  return base ? `${base}documents/` : undefined;
})();

const ensureDocumentsDirAsync = async (devModeEnabled?: boolean) => {

  if (!documentsStorageDir) return;
  try {
    await FileSystem.makeDirectoryAsync(documentsStorageDir, { intermediates: true });
  } catch (e: any) {
    // Directory may already exist; ignore directory exists errors
    if ((e?.message ?? '').includes('exist')) return;
    if (devModeEnabled) logger.warn('documents dir error', e);
  }
};

const extensionFromName = (name?: string) => {
  if (!name) return undefined;
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return undefined;
  return name.slice(idx);
};

const extensionFromMime = (mime?: string) => {
  if (!mime) return undefined;
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/heic' || mime === 'image/heif') return '.heic';
  const match = mime.match(/\/([a-z0-9]+)/i);
  return match ? `.${match[1]}` : undefined;
};

const extensionFromUri = (uri?: string) => {
  if (!uri) return undefined;
  const clean = uri.split('?')[0] ?? uri;
  const idx = clean.lastIndexOf('.');
  if (idx <= 0 || idx === clean.length - 1) return undefined;
  return clean.slice(idx);
};

const ensureStoredFileAsync = async (
  sourceUri: string,
  opts: { fileName?: string; mime?: string },
  devModeEnabled?: boolean,
): Promise<{ uri: string; size?: number }> => {
  const resolvedSourceUri = resolveDocumentUri(sourceUri) ?? sourceUri;
  if (!documentsStorageDir) {
    const info = await FileSystem.getInfoAsync(resolvedSourceUri);
    return { uri: sourceUri, size: info.exists ? info.size : undefined };
  }

  const info = await FileSystem.getInfoAsync(resolvedSourceUri);
  if (!info.exists) {
    return { uri: sourceUri, size: undefined };
  }

  if (resolvedSourceUri.startsWith(documentsStorageDir)) {
    const relative = toRelativeDocumentPath(resolvedSourceUri) ?? sourceUri;
    return { uri: relative, size: info.size };
  }

  await ensureDocumentsDirAsync(devModeEnabled);

  const ext =
    extensionFromName(opts.fileName) ??
    extensionFromMime(opts.mime) ??
    extensionFromUri(resolvedSourceUri) ??
    '';

  const dest = `${documentsStorageDir}${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  try {
    await FileSystem.copyAsync({ from: resolvedSourceUri, to: dest });
    const copied = await FileSystem.getInfoAsync(dest);
    const relative = toRelativeDocumentPath(dest) ?? dest;
    return { uri: relative, size: copied.exists ? copied.size : undefined };
  } catch (e) {
    logger.warn('document copy error', e);
    return { uri: sourceUri, size: info.exists ? info.size : undefined };
  }
};

const promptIdentityDocumentSide = (opts?: { title?: string; message?: string }): Promise<IdentityDocumentSide | undefined> => {
  const title = opts?.title ?? 'Select card side';
  const message = opts?.message ?? 'Which side of your document is shown?';
  return new Promise((resolve) => {
    let settled = false;
    let launchingSecondary = false;
    const finish = (value?: IdentityDocumentSide) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    if (Platform.OS === 'ios') {
      const options = [
        identitySideLabels.front,
        identitySideLabels.back,
        identitySideLabels.both,
        identitySideLabels.not_applicable,
        'Cancel',
      ];
      const cancelButtonIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === cancelButtonIndex) {
            finish(undefined);
            return;
          }
          switch (buttonIndex) {
            case 0: finish('front'); break;
            case 1: finish('back'); break;
            case 2: finish('both'); break;
            case 3: finish('not_applicable'); break;
            default: finish(undefined);
          }
        }
      );
      return;
    }

    const showSecondary = () => {
      launchingSecondary = false;
      Alert.alert(
        title,
        message,
        [
          { text: identitySideLabels.both, onPress: () => finish('both') },
          { text: identitySideLabels.not_applicable, onPress: () => finish('not_applicable') },
          { text: 'Cancel', style: 'cancel', onPress: () => finish(undefined) },
        ],
        { cancelable: true, onDismiss: () => finish(undefined) }
      );
    };

    Alert.alert(
      title,
      message,
      [
        { text: identitySideLabels.front, onPress: () => finish('front') },
        { text: identitySideLabels.back, onPress: () => finish('back') },
        {
          text: 'Other options',
          onPress: () => {
            launchingSecondary = true;
            setTimeout(showSecondary, 0);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (!launchingSecondary) finish(undefined);
        },
      }
    );
  });
};

const findInstance = (
  item: DocItemProgress,
  opts?: { relatedId?: string; documentId?: string }
) => {
  const relatedId = normalizeId(opts?.relatedId);
  const documentId = opts?.documentId;
  if (!item.multiple) {
    if (documentId && item.documentId !== documentId) {
      return undefined;
    }
    if (relatedId) {
      return item.documentId
        ? {
            documentId: item.documentId,
            status: item.status,
            captureMethod: item.captureMethod,
            relatedId,
            label: item.label,
          }
        : undefined;
    }
    return item.documentId
      ? {
          documentId: item.documentId,
          status: item.status,
          captureMethod: item.captureMethod,
          relatedId,
          label: item.label,
        }
      : undefined;
  }
  if (documentId) {
    return (item.instances ?? []).find((inst) => inst.documentId === documentId);
  }
  if (relatedId) {
    const direct = (item.instances ?? []).find((inst) => normalizeId(inst.relatedId) === relatedId);
    if (direct) return direct;
  }
  return (item.instances ?? []).slice().reverse().find((inst) => !!inst.documentId);
};

const describeInstanceStatus = (instance?: NonNullable<DocItemProgress['instances']>[number]) => {
  if (!instance) return 'Pending';
  if (instance.status === 'verified') return 'Verified';
  if (instance.status === 'extracted') return 'Extracted';
  return instance.documentId ? 'Captured' : 'Pending';
};

const deriveMultiInstanceStatus = (
  item: DocItemProgress,
  instances?: NonNullable<DocItemProgress['instances']>
): DocItemProgress['status'] => {
  if (!instances || instances.length === 0) {
    if (item.requiredUpload === false) {
      return item.acknowledged ? 'captured' : 'pending';
    }
    return 'pending';
  }
  if (instances.some(inst => inst.status === 'verified')) return 'verified';
  if (instances.some(inst => inst.status === 'extracted')) return 'extracted';
  if (instances.some(inst => inst.documentId)) return 'captured';
  return 'pending';
};

const getCardStatus = (
  item: DocItemProgress,
  opts?: { totalTargets?: number; capturedTargets?: number }
) => {
  if (item.status === 'verified') return 'Verified';
  if (item.status === 'extracted') return 'Extracted';
  if (item.requiredUpload === false) {
    return item.acknowledged ? '' : '';
  }
  if (opts?.totalTargets !== undefined) {
    const { totalTargets, capturedTargets = 0 } = opts;
    if (totalTargets === 0) {
      const captured = countCapturedInstances(item);
      return captured > 0 ? `Captured (${captured})` : 'Pending';
    }
    return capturedTargets > 0 ? `${capturedTargets}/${totalTargets} captured` : 'Pending';
  }
  if (item.multiple) {
    const captured = countCapturedInstances(item);
    return captured > 0 ? `Captured (${captured})` : 'Pending';
  }
  return item.documentId ? 'Captured (1)' : 'Pending';
};

const hasCapturedUpload = (item: DocItemProgress) => {
  if (item.multiple || item.allowMultipleUploads) {
    return countCapturedInstances(item) > 0;
  }
  return Boolean(item.documentId);
};

const requirementCaptured = (def: DocDefinition, progress?: DocItemProgress) => {
  if (!progress) return false;
  if (def.requiredUpload === false) return true;
  if (progress.multiple || progress.allowMultipleUploads) {
    return countCapturedInstances(progress) > 0;
  }
  return Boolean(progress.documentId);
};

type ActionTone = { base: string; emphasis: string; onBase: string };

type RowActionConfig = {
  key: string;
  icon: IconRoundButtonType;
  tone: ActionTone;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  backgroundColor?: string;
  pressedBackgroundColor?: string;
  iconColor?: string;
};

type DocumentRowProps = {
  label: string;
  status: string;
  actions: RowActionConfig[];
  divider?: boolean;
  onPress?: () => void;
  backgroundColor?: string;
  borderColor?: string;
  labelColor?: string;
};

const ApplicationDocumentsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openHelp, props: helpModalProps } = useHelpModal();
  const { devModeEnabled } = useDevMode();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const guardDemoReset = useDemoDataResetGuard();
  const accentColor = tones.blue.base;
  const DocumentRow: React.FC<DocumentRowProps> = ({
    label,
    status,
    actions,
    divider,
    onPress,
    backgroundColor,
    borderColor,
    labelColor,
  }) => {
    const baseStyle = [
      styles.groupRow,
      divider && !(backgroundColor || borderColor) && styles.groupRowDivider,
      backgroundColor ? { backgroundColor } : null,
      borderColor ? { borderColor, borderWidth: 1 } : null,
      (backgroundColor || borderColor) ? styles.groupRowTinted : null,
    ].filter(Boolean) as Array<StyleProp<ViewStyle>>;

    const content = (
      <>
        <View style={styles.groupLabelCol}>
          <Text style={[styles.groupLabel, labelColor ? { color: labelColor } : null]} numberOfLines={2}>
            {label}
          </Text>
          <Text style={styles.groupStatus}>{status}</Text>
        </View>
        {actions.length ? (
          <IconButtonGroup spacing={8} style={styles.groupActions}>
            {actions.map((action) => (
              <FloatingIconRoundButton
                key={action.key}
                buttonType={action.icon}
                accessibilityLabel={action.accessibilityLabel}
                onPress={action.disabled ? undefined : action.onPress}
                disabled={action.disabled}
                size="sm"
                hitSlop={8}
              />
            ))}
          </IconButtonGroup>
        ) : null}
      </>
    );

    if (onPress) {
      return (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            ...baseStyle,
            styles.groupRowPressable,
            pressed && styles.groupRowPressed,
          ]}
          accessibilityRole="button"
        >
          {content}
        </Pressable>
      );
    }

    return <View style={baseStyle as unknown as StyleProp<ViewStyle>}>{content}</View>;
  };

  const [resolverError, setResolverError] = useState<string | undefined>(undefined);
  const [debugShown, setDebugShown] = useState(false);

  const params = useLocalSearchParams<{
    id: string | string[];
    nav?: string | string[];
    mode?: string | string[];
    selectedCertIds?: string | string[];
    selectedFirearmIds?: string | string[];
    anchor?: string | string[];
    showIssues?: string | string[];
  }>();

  const id = useMemo(() => {
    const raw = params.id;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? String(value) : '';
  }, [params.id]);
  const mode = params.mode;
  const selectedCertIdsParam = params.selectedCertIds;
  const selectedFirearmIdsParam = params.selectedFirearmIds;
  const anchorParam = params.anchor;

  const navCtx = React.useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!raw) return decodeNav();
    try {
      return decodeNav(JSON.parse(raw));
    } catch {
      return decodeNav();
    }
  }, [params.nav]);

  // normalize mode
  const modeNorm = React.useMemo(() => {
    const m0 = Array.isArray(mode) ? mode[0] : mode;
    return m0 === 'edit' ? 'edit' : m0 === 'new' ? 'new' : undefined;
  }, [mode]);

  const selectedCertIdsFromQuery = useMemo(
    () => parseArrayParam(selectedCertIdsParam),
    [selectedCertIdsParam]
  );
  const selectedFirearmIdsFromQuery = useMemo(
    () => parseArrayParam(selectedFirearmIdsParam),
    [selectedFirearmIdsParam]
  );
  const anchorKey = useMemo(() => {
    const raw = Array.isArray(anchorParam) ? anchorParam[0] : anchorParam;
    return raw ? String(raw) : undefined;
  }, [anchorParam]);
  const showIssuesRequested = useMemo(() => {
    const raw = Array.isArray(params.showIssues) ? params.showIssues[0] : params.showIssues;
    if (!raw) return false;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }, [params.showIssues]);
  const scrollParam = useMemo(() => {
    const raw = Array.isArray((params as any).scroll) ? (params as any).scroll[0] : (params as any).scroll;
    return raw ? String(raw) : undefined;
  }, [params]);
  const flatListRef = React.useRef<FlatList<any>>(null);

  const serializedNav = useMemo(() => JSON.stringify(navCtx), [navCtx]);

  const documentPathBase = useMemo(() => {
    if (!id) return '';
    const base = `/application/${id}/documents`;
    const qs = new URLSearchParams();
    if (modeNorm) qs.set('mode', modeNorm);
    if (serializedNav) qs.set('nav', serializedNav);
    const query = qs.toString();
    return query ? `${base}?${query}` : base;
  }, [id, modeNorm, serializedNav]);
  const documentPathWithAnchor = React.useCallback(
    (anchor?: string) => {
      if (!anchor) return documentPathBase;
      const sep = documentPathBase.includes('?') ? '&' : '?';
      return `${documentPathBase}${sep}anchor=${encodeURIComponent(anchor)}`;
    },
    [documentPathBase],
  );

  const [tick, setTick] = useState(0);
  const [showIssuePills, setShowIssuePills] = useState(false);
  const idTypeMismatchAlertShownRef = useRef(false);
  const anchorScrollHandledRef = useRef(false);
  const declarationsFooterHeightRef = useRef<number>(0);
  const listContentHeightRef = useRef<number>(0);
  const headerHeightRef = useRef<number>(0);
  const userChangedRef = useRef(false);

  const app = useMemo(() => getById<Application>(String(id)), [id, tick]);
  useEffect(() => {
    if (showIssuesRequested) {
      setShowIssuePills(true);
    }
  }, [showIssuesRequested]);
  const is518a = useMemo(
    () => String((app as any)?.form ?? (app as any)?.type ?? '').toLowerCase() === '518a',
    [app]
  );
  const maxItemsByKind = useMemo(() => {
    const form = canonicalForm((app as any)?.form ?? (app as any)?.type);
    if (form === '517') return getMaxCountByItemKind(policy517 as PolicyWithMaxItemsPerApplication);
    if (form === '517g') return getMaxCountByItemKind(policy517g as PolicyWithMaxItemsPerApplication);
    if (form === '518a') return getMaxCountByItemKind(policy518a as PolicyWithMaxItemsPerApplication);
    return new Map<string, number>();
  }, [app]);
  const firearmPolicyRule = useMemo(() => {
    const form = canonicalForm((app as any)?.form ?? (app as any)?.type);
    if (form !== '518a') return null;
    return getFirearmRuleFromPolicy(policy518a as PolicyWithMaxItemsPerApplication);
  }, [app]);
  const competencyMaxCount = useMemo(
    () => maxItemsByKind.get('COMPETENCY_CERT') ?? maxItemsByKind.get('COMPETENCY'),
    [maxItemsByKind]
  );
  const firearmMaxCount = useMemo(
    () =>
      maxItemsByKind.get('FIREARM_LICENCE') ??
      maxItemsByKind.get('FIREARM') ??
      maxItemsByKind.get('FIREARM_LICENSE'),
    [maxItemsByKind]
  );
  const unselectedMiniTone = useMemo(() => {
    const form = canonicalForm((app as any)?.form ?? (app as any)?.type);
    if (form === '518a') {
      return { background: tones.blue.surface, border: tones.blue.border };
    }
    if (form === '517') {
      return { background: tones.purple.surface, border: tones.purple.border };
    }
    if (form === '517g') {
      return { background: tones.purple.surface, border: tones.purple.border };
    }
    return { background: neutral.onBase, border: neutral.border };
  }, [app, neutral, tones.blue, tones.purple]);
  const applicantProfile = useMemo(() => {
    if (!app?.applicantProfileId) return null;
    const prof = getById<Profile>(String(app.applicantProfileId));
    return prof ?? null;
  }, [app?.applicantProfileId, tick]);
  const proofOfAddressFreshness = useMemo(
    () => getProofOfAddressFreshness(applicantProfile?.proofOfAddressDate),
    [applicantProfile?.proofOfAddressDate],
  );
  const form517Readiness = useMemo(
    () => (app ? validateForm517Readiness(app, applicantProfile) : { ready: false, missing: [] as string[] }),
    [app, applicantProfile],
  );
  const is517FormWizardReady = app?.form === '517' ? form517Readiness.ready : true;
  const competencyExpiryPreference = useMemo(() => {
    const profileId = applicantProfile?.id;
    if (!profileId) return 'unknown' as CompetencyExpiryReminderPreference;
    return (ensureUserPrefs(profileId).dfoCompetencyExpiryUsing ?? 'unknown') as CompetencyExpiryReminderPreference;
  }, [applicantProfile?.id]);
  const terminalCompetencyIds = useMemo(
    () => getCompetencyCertificateIdsInTerminalApplications('517g'),
    [tick],
  );
  const terminalFirearmIds = useMemo(
    () => getFirearmIdsInTerminalApplications('518a'),
    [tick],
  );
  const proofOfAddressExpiryAlertShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!applicantProfile?.id) return;
    if (proofOfAddressFreshness.status !== 'expired') return;
    const alertKey = `${applicantProfile.id}:${applicantProfile.proofOfAddressDate ?? ''}`;
    if (proofOfAddressExpiryAlertShownRef.current === alertKey) return;
    proofOfAddressExpiryAlertShownRef.current = alertKey;
    let cancelled = false;
    (async () => {
      const result = await clearProfileProofOfAddress(applicantProfile.id);
      if (!result.changed || cancelled) return;
      setTick((prev) => prev + 1);
      Alert.alert(
        'Proof of address removed',
        `Your proof of address was removed because it is more than ${appConfig.documentFreshness.proofOfAddress.expiryAgeDays} days old. Please upload a newer document.`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [applicantProfile?.id, applicantProfile?.proofOfAddressDate, proofOfAddressFreshness.status]);

  const goClose = React.useCallback(() => {
    const fallback = statusToListPath(app?.status) as string | undefined;
    const baseTarget = (navCtx.routeBack || navCtx.returnTo || navCtx.origin || fallback) as string | undefined;
    const discardTarget = (navCtx.noChangesRouteBack || baseTarget) as string | undefined;
    const closeToTarget = (target?: string | null) =>
      backOrReplaceWithContext(router as any, { ...navCtx, routeBack: target ?? baseTarget } as any, target as any);

    const fromNewApplication = !!navCtx.noChangesRouteBack;
    const decisionResolved = navCtx.saveDecisionResolved === true;
    const isNewEntryMode = modeNorm === 'new';
    const noChanges = fromNewApplication && isNewEntryMode && !decisionResolved && !userChangedRef.current;

    if (noChanges && app) {
      Alert.alert(
        'Save application?',
        'You have not made any changes yet. Do you want to keep this application?',
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              deleteEntity(app.id);
              closeToTarget(discardTarget);
            },
          },
          {
            text: 'Save',
            onPress: () => {
              if (app.userConfirmedAccuracy !== true) {
                const next = touch<Application>({ ...app, userConfirmedAccuracy: true });
                persist(next);
              }
              closeToTarget(baseTarget);
            },
          },
        ]
      );
      return;
    }

    if (app?.id) {
      const latest = getById<Application>(String(app.id)) ?? app;
      const nextMembershipIds = Array.isArray(latest.membershipIds)
        ? latest.membershipIds.map(String)
        : [];
      const nextProficiencyIds = Array.isArray(latest.proficiencyIds)
        ? latest.proficiencyIds.map(String)
        : [];
      const membershipChanged = !Array.isArray(latest.membershipIds);
      const proficiencyChanged = !Array.isArray(latest.proficiencyIds);
      if (membershipChanged || proficiencyChanged) {
        const next = touch<Application>({
          ...latest,
          membershipIds: nextMembershipIds,
          proficiencyIds: nextProficiencyIds,
        });
        persist(next);
      }
    }

    closeToTarget(baseTarget);
  }, [app, navCtx, router]);

  useEffect(() => {
    if (idTypeMismatchAlertShownRef.current) return;
    if (!app) return;
    if (!applicantProfile?.id || !applicantProfile.idType) return;
    const docs = listByType<Document>('Document').filter(
      (doc) =>
        doc.parentType === 'Profile' &&
        String(doc.parentId ?? '') === String(applicantProfile.id) &&
        idDocKinds.includes(doc.kind),
    );
    if (!docs.length) return;
    const latest = docs
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })[0];
    const docType = docIdType(latest);
    if (!docType || docType === applicantProfile.idType) return;
    idTypeMismatchAlertShownRef.current = true;
    Alert.alert(
      'ID type mismatch',
      `Your uploaded ID looks like a ${labelForIdType(docType)}, but your profile is set to ${labelForIdType(applicantProfile.idType)}. Update your profile or replace the ID photos to keep things in sync.`
    );
  }, [app, applicantProfile?.id, applicantProfile?.idType, tick]);

  useEffect(() => {
    if (!id) return;
    if (!app) return;
    if (!selectedCertIdsFromQuery.length && !selectedFirearmIdsFromQuery.length) return;

    let changed = false;
    const next: Application = { ...app };

    if (selectedCertIdsFromQuery.length) {
      const existingCerts = new Set<string>(
        ((app.competencyCertificateIds ?? []) as string[]).filter(Boolean)
      );
      const beforeSize = existingCerts.size;
      selectedCertIdsFromQuery.forEach((cid) => {
        const trimmed = String(cid || '').trim();
        if (trimmed) existingCerts.add(trimmed);
      });
      if (existingCerts.size !== beforeSize) {
        next.competencyCertificateIds = Array.from(existingCerts);
        changed = true;
      }
    }

    if (selectedFirearmIdsFromQuery.length) {
      const incomingFirearmIds = Array.from(
        new Set(
          selectedFirearmIdsFromQuery
            .map((fid) => String(fid || '').trim())
            .filter(Boolean)
        )
      );
      const nextFirearmIds = is518a ? incomingFirearmIds.slice(0, 1) : incomingFirearmIds;
      const currentFirearmIds = ((app.selectedFirearmIds ?? []) as string[])
        .filter(Boolean)
        .map(String);
      if (currentFirearmIds.join('|') !== nextFirearmIds.join('|')) {
        next.selectedFirearmIds = nextFirearmIds;
        changed = true;
      }
    }

      if (changed) {
        persistAppWithDocs(next as Application, undefined, false);
        setTick(t => t + 1);

        const { pathname, params } = buildDocumentsRoute({
          id,
          mode: modeNorm,
          nav: navCtx,
        });
        router.replace({ pathname, params } as any);
      }
  }, [
    app,
    id,
    modeNorm,
    navCtx,
    router,
    is518a,
    selectedCertIdsFromQuery,
    selectedFirearmIdsFromQuery,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      setTick(t => t + 1);
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      const handler = () => {
        goClose();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', handler);
      return () => sub.remove();
    }, [goClose])
  );

  const currentCertificateIds = useMemo(() => {
    if (!app) return [] as string[];
    return Array.from(
      new Set<string>(((app.competencyCertificateIds ?? []) as string[]).filter(Boolean))
    );
  }, [app]);

  const currentMembershipIds = useMemo(() => {
    if (!app) return [] as string[];
    return Array.from(new Set<string>(((app.membershipIds ?? []) as string[]).filter(Boolean).map(String)));
  }, [app]);

  const currentProficiencyIds = useMemo(() => {
    if (!app) return [] as string[];
    return Array.from(new Set<string>(((app.proficiencyIds ?? []) as string[]).filter(Boolean).map(String)));
  }, [app]);
  const currentActivityEvidenceIds = useMemo(() => {
    if (!app) return [] as string[];
    return Array.from(new Set<string>(((app.activityEvidenceIds ?? []) as string[]).filter(Boolean).map(String)));
  }, [app]);

  const currentSafeIds = useMemo(() => {
    if (!app) return [] as string[];
    return Array.from(new Set<string>(((app.safeIds ?? []) as string[]).filter(Boolean).map(String)));
  }, [app]);

  const currentFirearmIds = useMemo(() => {
    if (!app) return [] as string[];
    const ids = new Set<string>();
    ((app.selectedFirearmIds ?? []) as string[]).forEach((fid) => {
      const trimmed = String(fid ?? '').trim();
      if (trimmed) ids.add(trimmed);
    });
    if (!ids.size && Array.isArray(app.firearms)) {
      app.firearms.forEach((firearm: any) => {
        const fid = firearm?.id ? String(firearm.id).trim() : '';
        if (fid) ids.add(fid);
      });
    }
    return Array.from(ids);
  }, [app]);

  const membershipAutoSelectSingle = useMemo(
    () => policyAutoSelectSingle((app as any)?.form ?? (app as any)?.type, 'MEMBERSHIP'),
    [app],
  );

  const proficiencyAutoSelectSingle = useMemo(
    () => policyAutoSelectSingle((app as any)?.form ?? (app as any)?.type, 'PROFICIENCY'),
    [app],
  );

  const activityEvidenceById = useMemo(() => {
    const map = new Map<string, ActivityEvidence>();
    listByType<ActivityEvidence>('ActivityEvidence').forEach((item) => {
      if (!item?.id || item.deleted) return;
      if (app?.applicantProfileId && String(item.holderProfileId ?? '') !== String(app.applicantProfileId)) return;
      map.set(String(item.id), item);
    });
    currentActivityEvidenceIds.forEach((id) => {
      if (map.has(id)) return;
      const found = getById<ActivityEvidence>(id);
      if (found && !found.deleted) map.set(id, found);
    });
    return map;
  }, [app?.applicantProfileId, currentActivityEvidenceIds, tick]);

  const activityEvidenceItems = useMemo(() => {
    return Array.from(activityEvidenceById.values()).sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
  }, [activityEvidenceById]);

  const effectiveActivityEvidenceIds = useMemo(() => {
    return currentActivityEvidenceIds.filter((id) => activityEvidenceById.has(id));
  }, [activityEvidenceById, currentActivityEvidenceIds]);

  const availableFirearms = useMemo<Firearm[]>(() => {
    const list = listByType<Firearm>('Firearm');
    const profileId = app?.applicantProfileId ? String(app.applicantProfileId) : null;
    const filtered = profileId
      ? list.filter((f) => !f.holderProfileId || String(f.holderProfileId) === profileId)
      : list;
    const map = new Map<string, Firearm>();
    filtered.forEach((f) => {
      if (f?.id) map.set(String(f.id), f);
    });
    currentFirearmIds.forEach((fid) => {
      if (!map.has(fid)) {
        const found = getById<Firearm>(fid);
        if (found) map.set(fid, found);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      compareFirearmsByReminderPriority(a, b, {
        terminalIds: terminalFirearmIds,
        compareBase: compareFirearms,
      }),
    );
  }, [app?.applicantProfileId, currentFirearmIds, terminalFirearmIds, tick]);

  const effectiveFirearmIds = useMemo(() => {
    if (!is518a) return [];
    if (currentFirearmIds.length) return currentFirearmIds;
    if (availableFirearms.length === 1 && availableFirearms[0]?.id) {
      const profileId = normalizeId(app?.applicantProfileId);
      const holderId = normalizeId(availableFirearms[0].holderProfileId);
      if (profileId && holderId === profileId) {
        return [String(availableFirearms[0].id)];
      }
    }
    return [];
  }, [app?.applicantProfileId, availableFirearms, currentFirearmIds, is518a]);

  const availableCertificates = useMemo<CompetencyCertificate[]>(() => {
    const certs = listByType<CompetencyCertificate>('CompetencyCertificate');
    const profileId = app?.applicantProfileId ? String(app.applicantProfileId) : null;
    const filtered = profileId
      ? certs.filter((cert) => String(cert.holderProfileId ?? '') === profileId)
      : certs;
    const map = new Map<string, CompetencyCertificate>();
    filtered.forEach((c) => {
      if (c?.id) map.set(String(c.id), c);
    });
    currentCertificateIds.forEach((cid) => {
      if (!map.has(cid)) {
        const found = getById<CompetencyCertificate>(cid);
        if (found) map.set(cid, found);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      compareCompetenciesByReminderPriority(a, b, {
        preference: competencyExpiryPreference,
        terminalIds: terminalCompetencyIds,
        compareBase: compareCompetencyCertificates,
      }),
    );
  }, [app?.applicantProfileId, competencyExpiryPreference, currentCertificateIds, terminalCompetencyIds, tick]);

  const effectiveCertificateIds = useMemo(() => {
    if (currentCertificateIds.length) return currentCertificateIds;
    if (availableCertificates.length === 1 && availableCertificates[0]?.id) {
      return [String(availableCertificates[0].id)];
    }
    return [];
  }, [availableCertificates, currentCertificateIds]);
  const maxDisabledCertificateIds = useMemo(() => {
    const set = new Set<string>();
    if (!Number.isFinite(competencyMaxCount as number)) return set;
    const max = Number(competencyMaxCount);
    if (max < 1) return set;
    if (effectiveCertificateIds.length < max) return set;
    const selected = new Set(effectiveCertificateIds.map(String));
    availableCertificates.forEach((cert) => {
      const id = normalizeId(cert.id);
      if (!id) return;
      if (!selected.has(id)) set.add(id);
    });
    return set;
  }, [availableCertificates, competencyMaxCount, effectiveCertificateIds]);
  const disabledCertificateIds = useMemo(
    () => maxDisabledCertificateIds,
    [maxDisabledCertificateIds]
  );

  const selectedCertificates = useMemo<CompetencyCertificate[]>(() => {
    if (!effectiveCertificateIds.length) return [];
    const ids = new Set(effectiveCertificateIds.map(String));
    return availableCertificates.filter((cert) => cert?.id && ids.has(String(cert.id)));
  }, [availableCertificates, effectiveCertificateIds]);

  const selectedCompetencyCategories = useMemo<Set<CompetencyCategory> | null>(() => {
    if (!is518a || !selectedCertificates.length) return null;
    const set = new Set<CompetencyCategory>();
    selectedCertificates.forEach((cert) => {
      (cert.categories ?? []).forEach((cat) => {
        if (VALID_COMPETENCY_CATEGORIES.has(cat)) set.add(cat);
      });
    });
    return set.size ? set : null;
  }, [is518a, selectedCertificates]);

  const allowedFirearmIds = useMemo(() => {
    const set = new Set<string>();
    const hasCategoryFilter = Boolean(selectedCompetencyCategories && selectedCompetencyCategories.size);
    availableFirearms.forEach((firearm) => {
      const id = normalizeId(firearm.id);
      if (!id) return;
      if (!is518a || !hasCategoryFilter) {
        set.add(id);
        return;
      }
      const type = firearm.firearmType as CompetencyCategory | undefined;
      if (!type || !VALID_COMPETENCY_CATEGORIES.has(type)) {
        set.add(id);
        return;
      }
      if (selectedCompetencyCategories?.has(type)) {
        set.add(id);
      }
    });
    return set;
  }, [availableFirearms, is518a, selectedCompetencyCategories]);

  const categoryDisabledFirearmIds = useMemo(() => {
    const set = new Set<string>();
    const hasCategoryFilter = Boolean(selectedCompetencyCategories && selectedCompetencyCategories.size);
    if (!is518a || !hasCategoryFilter) return set;
    availableFirearms.forEach((firearm) => {
      const id = normalizeId(firearm.id);
      if (!id) return;
      if (!allowedFirearmIds.has(id)) {
        set.add(id);
      }
    });
    return set;
  }, [availableFirearms, allowedFirearmIds, is518a, selectedCompetencyCategories]);

  const activeFirearmIds = useMemo(
    () => effectiveFirearmIds.filter((id) => allowedFirearmIds.has(String(id))),
    [effectiveFirearmIds, allowedFirearmIds],
  );

  const maxDisabledFirearmIds = useMemo(() => {
    const set = new Set<string>();
    if (!Number.isFinite(firearmMaxCount as number)) return set;
    const max = Number(firearmMaxCount);
    if (max < 1) return set;
    if (activeFirearmIds.length < max) return set;
    const selected = new Set(activeFirearmIds.map(String));
    availableFirearms.forEach((firearm) => {
      const id = normalizeId(firearm.id);
      if (!id) return;
      if (!selected.has(id)) set.add(id);
    });
    return set;
  }, [activeFirearmIds, availableFirearms, firearmMaxCount]);
  const disabledFirearmIds = useMemo(() => {
    const set = new Set<string>(categoryDisabledFirearmIds);
    maxDisabledFirearmIds.forEach((id) => set.add(id));
    return set;
  }, [categoryDisabledFirearmIds, maxDisabledFirearmIds]);

  const selectedFirearms = useMemo<Firearm[]>(() => {
    if (!activeFirearmIds.length) return [];
    const ids = new Set(activeFirearmIds.map(String));
    return availableFirearms.filter((firearm) => firearm?.id && ids.has(String(firearm.id)));
  }, [activeFirearmIds, availableFirearms]);

  const competencyDocsByCertId = useMemo(() => {
    const map = new Map<string, Document[]>();
    listByType<Document>('Document').forEach((doc) => {
      if (doc.parentType !== 'CompetencyCertificate' || !doc.parentId) return;
      const key = String(doc.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    });
    return map;
  }, [tick]);

  const availableSafes = useMemo<Safe[]>(() => {
    const list = listByType<Safe>('Safe');
    const profileId = app?.applicantProfileId ? String(app.applicantProfileId) : null;
    const filtered = profileId
      ? list.filter((safe) => !safe.holderProfileId || String(safe.holderProfileId) === profileId)
      : list;
    const map = new Map<string, Safe>();
    filtered.forEach((safe) => {
      if (safe?.id) map.set(String(safe.id), safe);
    });
    currentSafeIds.forEach((sid) => {
      if (!map.has(sid)) {
        const found = getById<Safe>(sid);
        if (found) map.set(sid, found);
      }
    });
    return Array.from(map.values());
  }, [app?.applicantProfileId, currentSafeIds, tick]);

  const effectiveSafeIds = useMemo(() => {
    if (currentSafeIds.length) return currentSafeIds;
    if (availableSafes.length === 1 && availableSafes[0]?.id) {
      const profileId = normalizeId(app?.applicantProfileId);
      const holderId = normalizeId(availableSafes[0].holderProfileId);
      if (profileId && holderId === profileId) {
        return [String(availableSafes[0].id)];
      }
    }
    return [];
  }, [app?.applicantProfileId, availableSafes, currentSafeIds]);

  const safeDocsById = useMemo(() => {
    const map = new Map<string, Document[]>();
    listByType<Document>('Document').forEach((doc) => {
      if (doc.parentType !== 'Safe' || !doc.parentId) return;
      const key = String(doc.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    });
    return map;
  }, [tick]);

  const membershipDocsById = useMemo(() => {
    const map = new Map<string, Document[]>();
    listByType<Document>('Document').forEach((doc) => {
      if (doc.parentType !== 'Membership' || !doc.parentId) return;
      const kind = `${doc.kind ?? ''}`.toUpperCase();
      if (!MEMBERSHIP_DOC_CODES.has(kind)) return;
      const key = String(doc.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    });
    return map;
  }, [tick]);

  const proficiencyDocsById = useMemo(() => {
    const map = new Map<string, Document[]>();
    listByType<Document>('Document').forEach((doc) => {
      if (doc.parentType !== 'Proficiency' || !doc.parentId) return;
      const kind = `${doc.kind ?? ''}`.toUpperCase();
      if (!PROFICIENCY_DOC_CODES.has(kind)) return;
      const key = String(doc.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    });
    return map;
  }, [tick]);

  const memberships = useMemo(() => {
    const list = listByType<Membership>('Membership');
    const profileId = app?.applicantProfileId ? String(app.applicantProfileId) : null;
    const filtered = profileId ? list.filter((m) => String(m.holderProfileId ?? '') === profileId) : list;
    const map = new Map<string, Membership>();
    filtered.forEach((m) => {
      if (m?.id) map.set(String(m.id), m);
    });
    currentMembershipIds.forEach((mid) => {
      if (!map.has(mid)) {
        const found = getById<Membership>(mid);
        if (found) map.set(mid, found);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
  }, [app?.applicantProfileId, currentMembershipIds, tick]);

  const effectiveMembershipIds = useMemo(() => {
    if (Array.isArray(app?.membershipIds)) return currentMembershipIds;
    if (membershipAutoSelectSingle && memberships.length === 1 && memberships[0]?.id) {
      return [String(memberships[0].id)];
    }
    return [];
  }, [app?.membershipIds, currentMembershipIds, membershipAutoSelectSingle, memberships]);

  const selectedMemberships = useMemo(() => {
    if (!effectiveMembershipIds.length) return [] as Membership[];
    const ids = new Set(effectiveMembershipIds.map(String));
    return memberships.filter((m) => m?.id && ids.has(String(m.id)));
  }, [effectiveMembershipIds, memberships]);
  const membershipSubmissionValidity = useMemo(
    () => getMembershipSubmissionValidity(selectedMemberships),
    [selectedMemberships],
  );
  const membershipDocumentFreshness = useMemo(
    () => getMembershipDocumentFreshness(selectedMemberships),
    [selectedMemberships],
  );

  const proficiencies = useMemo(() => {
    const list = listByType<Proficiency>('Proficiency');
    const profileId = app?.applicantProfileId ? String(app.applicantProfileId) : null;
    const filtered = profileId ? list.filter((p) => String(p.holderProfileId ?? '') === profileId) : list;
    const map = new Map<string, Proficiency>();
    filtered.forEach((p) => {
      if (p?.id) map.set(String(p.id), p);
    });
    currentProficiencyIds.forEach((pid) => {
      if (!map.has(pid)) {
        const found = getById<Proficiency>(pid);
        if (found) map.set(pid, found);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
  }, [app?.applicantProfileId, currentProficiencyIds, tick]);

  const effectiveProficiencyIds = useMemo(() => {
    if (Array.isArray(app?.proficiencyIds)) return currentProficiencyIds;
    if (proficiencyAutoSelectSingle && proficiencies.length === 1 && proficiencies[0]?.id) {
      return [String(proficiencies[0].id)];
    }
    return [];
  }, [app?.proficiencyIds, currentProficiencyIds, proficiencies, proficiencyAutoSelectSingle]);

  const selectedProficiencies = useMemo(() => {
    if (!effectiveProficiencyIds.length) return [] as Proficiency[];
    const ids = new Set(effectiveProficiencyIds.map(String));
    return proficiencies.filter((p) => p?.id && ids.has(String(p.id)));
  }, [effectiveProficiencyIds, proficiencies]);

  const membershipStatus = useMemo(
    () => (app ? computeMembershipStatus(app, { devModeEnabled }) : {
      membership: null,
      docs: [],
      associationReady: false,
      dedicatedReady: false,
      requirementSatisfied: false,
      name: '',
    }),
    [app, devModeEnabled, tick],
  );

  const membershipMeta = useCallback(
    (membership: Membership) => {
      const membershipHealth = getMembershipHealth(membership);
      const membershipLabelOrder = new Map<string, number>([
        ['Membership proof', 0],
        ['Membership card', 1],
        ['Dedicated hunter', 2],
        ['Dedicated sport shooter', 3],
      ]);
      const selectedFirearmIds = new Set(activeFirearmIds.map(String));
      const docs = (membershipDocsById.get(String(membership.id)) ?? []).filter((doc) => {
        const code = String(doc.requirementCode ?? doc.kind ?? '').toUpperCase();
        if (code !== 'FIREARM_ENDORSEMENT') return true;
        const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
        return !!relatedId && selectedFirearmIds.has(relatedId);
      });
      const membershipLabels = Array.from(
        new Set(
          docs
            .filter((doc) => String(doc.requirementCode ?? doc.kind ?? '').toUpperCase() !== 'FIREARM_ENDORSEMENT')
            .map((doc) => {
              const kind = (doc.kind as any)?.toString?.().toUpperCase?.() ?? '';
              if (kind === 'ASSOCIATION_MEMBERSHIP') return 'Membership card';
              if (kind === 'ASSOCIATION_LETTER') return 'Membership proof';
              if (kind === 'DEDICATED_HUNTER_CERT') return 'Dedicated hunter';
              if (kind === 'DEDICATED_SPORT_CERT') return 'Dedicated sport shooter';
              return doc.name || doc.requirementRelatedLabel || 'Document';
            })
        )
      ).sort((a, b) => (membershipLabelOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (membershipLabelOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
      const docsById = new Map(docs.map((doc) => [String(doc.id), doc] as const));
      const firearmsById = new Map(
        availableFirearms.map((firearm) => [String(firearm.id), firearm] as const),
      );
      const endorsementLabels = buildMembershipEndorsementLabels({
        membership,
        documentsById: docsById,
        firearmsById,
        allowedFirearmIds: selectedFirearmIds,
      });
      const membershipLine = `Documents: ${membershipLabels.length ? membershipLabels.join(', ') : 'No documents yet'}`;
      if (!is518a) {
        return membershipHealth.status === 'warning'
          ? [`${membershipLine}\n\n${membershipHealth.ctaText}`]
          : [membershipLine];
      }
      const endorsementLine = `Endorsements: ${endorsementLabels.length ? endorsementLabels.join(', ') : 'None'}`;
      return membershipHealth.status === 'warning'
        ? [`${membershipLine}\n\n${endorsementLine}\n\n${membershipHealth.ctaText}`]
        : [`${membershipLine}\n\n${endorsementLine}`];
    },
    [activeFirearmIds, availableFirearms, is518a, membershipDocsById],
  );

  const proficiencyMeta = useCallback(
    (proficiency: Proficiency) => {
      const docs = (proficiencyDocsById.get(String(proficiency.id)) ?? []);
      const docKinds = new Set(
        docs.map((doc) => `${doc.kind ?? doc.requirementCode ?? ''}`.toUpperCase() as ProficiencyDocument)
      );
      const trainingLabels = resolveProficiencyCategories(proficiency).map((category) => categoryLabel(category));
      const resultOrder: Array<{ kind: ProficiencyDocument; label: string }> = [
        { kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE', label: 'Knowledge of the Firearms Control' },
        { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1', label: 'Handle and use 1' },
        { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_2', label: 'Handle and use 2' },
        { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_3', label: 'Handle and use 3' },
        { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_4', label: 'Handle and use 4' },
      ];
      const categoryRank: Record<CompetencyCategory, number> = {
        Handgun: 0,
        Rifle: 1,
        Shotgun: 2,
        HandMachineCarbine: 3,
      };

      const resultLabels = resultOrder
        .filter(({ kind }) => docKinds.has(kind))
        .map(({ kind, label }) => {
          if (!kind.startsWith('STATEMENT_OF_RESULTS_HANDLE_USE_')) return label;
          const categories =
            (proficiency.proficiencyDocumentIds ?? [])
              .find((entry) => entry.kind === kind)
              ?.categories?.slice()
              ?.sort((a, b) => (categoryRank[a] ?? 99) - (categoryRank[b] ?? 99))
              ?.map((category) => categoryLabel(category))
              ?.filter(Boolean) ?? [];
          return categories.length ? `${label} (${categories.join(', ')})` : label;
        });

      return [
        `Training certificates/proficiencies: ${trainingLabels.length ? trainingLabels.join(', ') : 'None yet'}`,
        `Statement of results: ${resultLabels.length ? resultLabels.join(', ') : 'None yet'}`,
      ];
    },
    [proficiencyDocsById],
  );

  const firearmDocsById = useMemo(() => {
    const map = new Map<string, Document[]>();
    listByType<Document>('Document').forEach((doc) => {
      if (doc.parentType !== 'Firearm' || !doc.parentId) return;
      const key = String(doc.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    });
    return map;
  }, [tick]);

  const goAddCompetency = React.useCallback(async (anchor?: string) => {
    if (await guardDemoReset('competency certificate')) return;
    if (!documentPathBase) return;
    const resolved = resolveWizardRoute('competency', 'documents', {
      id,
    });
    if (!resolved) return;
    const params: Record<string, any> = {
      nav: JSON.stringify({
        routeBack: resolved.routeBack,
        returnTo: resolved.routeBack,
        onComplete: resolved.routeBack,
        clearRouteBackHistory: resolved.clearRouteBackHistory,
      }),
      selectionParam: 'selectedCertIds',
    };
    if (effectiveCertificateIds.length) {
      params.selectedCertIds = JSON.stringify(effectiveCertificateIds);
    }
    router.replace({
      pathname: resolved.routeTo as any,
      params,
    } as any);
  }, [documentPathBase, effectiveCertificateIds, guardDemoReset, id, router]);

  const goAddFirearm = React.useCallback(async (anchor?: string) => {
    if (await guardDemoReset('firearm')) return;
    if (!documentPathBase) return;
    const resolved = resolveWizardRoute('firearm', 'documents', {
      id,
    });
    if (!resolved) return;
    const params: Record<string, any> = {
      nav: JSON.stringify({
        routeBack: resolved.routeBack,
        returnTo: resolved.routeBack,
        onComplete: resolved.routeBack,
        clearRouteBackHistory: resolved.clearRouteBackHistory,
      }),
    };
    if (activeFirearmIds.length) {
      params.selectedFirearmIds = JSON.stringify(activeFirearmIds);
    }
    router.replace({ pathname: resolved.routeTo as any, params } as any);
  }, [activeFirearmIds, documentPathBase, guardDemoReset, id, router]);

  const goProofIdWizard = React.useCallback((anchor?: string, preview?: boolean) => {
    if (!documentPathBase) return;
    const resolved = resolveWizardRoute('id', 'documents', { id });
    if (!resolved) return;
    const navPayload: Record<string, any> = {
      routeBack: resolved.routeBack,
      returnTo: resolved.routeBack,
      onComplete: resolved.routeBack,
      clearRouteBackHistory: resolved.clearRouteBackHistory,
    };
    router.replace({
      pathname: resolved.routeTo as any,
      params: {
        nav: JSON.stringify(navPayload),
        ...(preview ? { previewMode: '1', mode: 'edit' } : null),
      },
    } as any);
  }, [documentPathBase, id, router]);

  const goProofAddressWizard = React.useCallback((anchor?: string, preview?: boolean) => {
    if (!documentPathBase) return;
    const resolved = resolveWizardRoute('address', 'documents', { id });
    if (!resolved) return;
    const navPayload: Record<string, any> = {
      routeBack: resolved.routeBack,
      returnTo: resolved.routeBack,
      onComplete: resolved.routeBack,
      clearRouteBackHistory: resolved.clearRouteBackHistory,
    };
    router.replace({
      pathname: resolved.routeTo as any,
      params: {
        nav: JSON.stringify(navPayload),
        ...(preview ? { previewMode: '1' } : null),
      },
    } as any);
  }, [documentPathBase, id, router]);

  const goAddSafe = React.useCallback(async (anchor?: string) => {
    if (await guardDemoReset('safe')) return;
    if (!documentPathBase) return;
    const resolved = resolveWizardRoute('safe', 'documents', { id });
    if (!resolved) return;
    const navPayload: Record<string, any> = {
      routeBack: resolved.routeBack,
      returnTo: resolved.routeBack,
      onComplete: resolved.routeBack,
      clearRouteBackHistory: resolved.clearRouteBackHistory,
    };
    router.replace({
      pathname: resolved.routeTo as any,
      params: { nav: JSON.stringify(navPayload) },
    } as any);
  }, [documentPathBase, guardDemoReset, id, router]);

  // Try to resolve dynamic requirements via policy; fallback to static checklist if anything goes wrong
  const resolved = useMemo(() => {
    if (!app) return null;
    try {
      const out = resolveRequirementsForApplication({
        application: {
          id: app.id,
          form: (app as any).form || (app as any).type,
          licenseType: (app as any).licenseType ?? (app as any).licenceType,
          licenceType: (app as any).licenceType ?? (app as any).licenseType,
          licenseTypes: (app as any).licenseTypes ?? (app as any).licenceTypes,
          licenceTypes: (app as any).licenceTypes ?? (app as any).licenseTypes,
        },
        firearms: selectedFirearms,
      });
      setResolverError(undefined);
      return out;
    } catch (e: any) {
      logger.warn('resolver error', e);
      setResolverError(String(e?.message || e));
      return null;
    }
  }, [app, selectedFirearms, tick]);

  const defs = useMemo<DocDefinition[]>(() => {
    if (!app) return [];
    if (!resolved?.requirements?.length) return [];

    const visibleRequirements = resolved.requirements.filter((req) => {
      const codeUpper = (req.code ?? '').toUpperCase();
      if (MEMBERSHIP_DOC_CODES.has(codeUpper)) {
        return false;
      }
      if (PROFICIENCY_DOC_CODES.has(codeUpper)) {
        return false;
      }
      if ((req as any)?.entityType === 'Membership') return false;
      if ((req as any)?.entityType === 'Proficiency') return false;
      const isSupporting = (req as any).isSupportingDocument;
      const requireUploadFlag = req.requiredUpload ?? req.requireUpload;
      const isOptionalUpload = requireUploadFlag === false;
      const isOptionalRequirement = req.required !== true;
      // Hide non-supporting, non-required checklist items that don't need an upload.
      if (isSupporting === false && isOptionalRequirement && isOptionalUpload) {
        return false;
      }
      return true;
    });

    // Ensure deterministic ordering using displayOrder each time we resolve
    visibleRequirements.sort((a, b) => {
      const da = Number.isFinite(a.displayOrder as number) ? (a.displayOrder as number) : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(b.displayOrder as number) ? (b.displayOrder as number) : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.key.localeCompare(b.key);
    });

    return visibleRequirements.map((req) => {
      const code = (req.code ?? '').toUpperCase();
      const kind = PROOF_CARD_CODES.has(code) ? (code as Document['kind']) : inferKind(req);
      const label = req.label;
      const multiple = (req._scope === 'perFirearm') || (req.scope?.perFirearm === true) || ((req.max ?? 1) > 1) || (req.allowMultipleUploads === true);
      const requiresUpload = req.requiredUpload !== false;
      return {
        key: req.key,
        label,
        label2: (req as any).label2,
        kind,
        multiple,
        help: req.help ?? req.description,
        helpKey: resolveRequirementHelpKey(req),
        requiredUpload: requiresUpload,
        allowMultipleUploads: req.allowMultipleUploads === true,
        allowedKinds: req.allowedKinds,
        group: req.group,
        groupDescription: req.groupDescription,
        __code: req.code,
        cardStyle: req.cardStyle,
        minUploads: req.min,
        maxUploads: req.max,
        isOptional: (req as any).isOptional === true,
        displayOrder: req.displayOrder,
        isIdentityDocument: (() => {
          if (kind === 'ID_CARD' || kind === 'ID_BOOK' || kind === 'FIREARM_LICENCE') return true;
          const code = (req.code ?? '').toUpperCase();
          if (code === 'ID_DOC') return true;
          if (code.includes('LICENCE')) return true;
          return false;
        })(),
      };
    });
  }, [resolved, app]);

  const membershipPolicyDef = useMemo(() => {
    const match = resolved?.requirements?.find(
      (req) => (req.code ?? '').toUpperCase() === 'MEMBERSHIP'
    );
    const fallback = resolveSharedRequirementFallback((app as any)?.form ?? (app as any)?.type, 'MEMBERSHIP');
    if (!match && !fallback.label && !Number.isFinite(fallback.displayOrder as number)) return undefined;
    return {
      key: match?.key ?? match?.code ?? 'MEMBERSHIP',
      label: match?.label ?? fallback.label ?? 'Association membership',
      help: match?.help ?? match?.description ?? fallback.help,
      helpKey: match?.helpKey ?? fallback.helpKey,
      displayOrder: Number.isFinite(match?.displayOrder as number)
        ? (match?.displayOrder as number)
        : Number.isFinite(fallback.displayOrder as number)
          ? (fallback.displayOrder as number)
          : undefined,
    };
  }, [app, resolved]);

  const proficiencyPolicyDef = useMemo(() => {
    const match = resolved?.requirements?.find(
      (req) => (req.code ?? '').toUpperCase() === 'PROFICIENCY'
    );
    const fallback = resolveSharedRequirementFallback((app as any)?.form ?? (app as any)?.type, 'PROFICIENCY');
    if (!match && !fallback.label && !Number.isFinite(fallback.displayOrder as number)) return undefined;
    return {
      key: match?.key ?? match?.code ?? 'PROFICIENCY',
      label: match?.label ?? fallback.label ?? 'Proficiency',
      help: match?.help ?? match?.description ?? fallback.help,
      helpKey: match?.helpKey ?? fallback.helpKey,
      required: match?.required === true,
      requiredUpload: match ? (match.requiredUpload ?? match.requireUpload ?? true) : undefined,
      requiredForApplication: (match as any)?.requiredForApplication === true,
      displayOrder: Number.isFinite(match?.displayOrder as number)
        ? (match?.displayOrder as number)
        : Number.isFinite(fallback.displayOrder as number)
          ? (fallback.displayOrder as number)
          : undefined,
    };
  }, [app, resolved]);

  const activityEvidencePolicyDef = useMemo(() => {
    if (!is518a) return undefined;
    const match = resolved?.requirements?.find(
      (req) => (req.code ?? '').toUpperCase() === 'ACTIVITY_EVIDENCE'
    );
    const fallback = resolveSharedRequirementFallback((app as any)?.form ?? (app as any)?.type, 'ACTIVITY_EVIDENCE');
    if (!match && !fallback.label && !Number.isFinite(fallback.displayOrder as number)) return undefined;
    return {
      key: match?.key ?? match?.code ?? 'ACTIVITY_EVIDENCE',
      label: match?.label ?? fallback.label ?? 'Firearm activity evidence',
      help: match?.help ?? match?.description ?? fallback.help,
      helpKey: match?.helpKey ?? fallback.helpKey,
      displayOrder: Number.isFinite(match?.displayOrder as number)
        ? (match?.displayOrder as number)
        : Number.isFinite(fallback.displayOrder as number)
          ? (fallback.displayOrder as number)
          : undefined,
    };
  }, [app, is518a, resolved]);

  const hasCompetencyRequirement = useMemo(() => {
    const list = Array.isArray(defs) ? defs : [];
    return list.some((def) => (def.__code ?? def.key ?? '').toUpperCase().startsWith('COMPETENCY_CERT'));
  }, [defs]);
  const hasFirearmRequirement = useMemo(() => {
    const list = Array.isArray(defs) ? defs : [];
    return list.some((def) => isFirearmLicenceRequirementCode((def.__code ?? def.key ?? '').toUpperCase()) || def.kind === 'FIREARM_LICENCE');
  }, [defs]);
  const hasSafeRequirement = useMemo(() => {
    const list = Array.isArray(defs) ? defs : [];
    return list.some((def) => isSafeRequirementCode((def.__code ?? def.key ?? '').toUpperCase()) || def.kind === 'SAFE');
  }, [defs]);

  const selectedMembershipDocs = useMemo(() => {
    const docs: Document[] = [];
    const selectedFirearmIds = new Set(activeFirearmIds.map(String));
    selectedMemberships.forEach((m) => {
      const list = membershipDocsById.get(String(m.id)) ?? [];
      list.forEach((doc) => {
        const code = String(doc.requirementCode ?? doc.kind ?? '').toUpperCase();
        if (code !== 'FIREARM_ENDORSEMENT') {
          docs.push(doc);
          return;
        }
        const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
        if (!relatedId) return;
        if (selectedFirearmIds.has(relatedId)) {
          docs.push(doc);
        }
      });
    });
    return docs;
  }, [activeFirearmIds, membershipDocsById, selectedMemberships]);

  const selectedProficiencyDocs = useMemo(() => {
    const docs: Document[] = [];
    selectedProficiencies.forEach((proficiency) => {
      const list = proficiencyDocsById.get(String(proficiency.id)) ?? [];
      list.forEach((doc) => docs.push(doc));
    });
    return docs;
  }, [proficiencyDocsById, selectedProficiencies]);

  const externalDocuments = useMemo(() => {
    const docs: Document[] = [];
    if (hasCompetencyRequirement) {
      effectiveCertificateIds.forEach((cid) => {
        const list = competencyDocsByCertId.get(String(cid)) ?? [];
        docs.push(...list);
      });
    }
    if (hasFirearmRequirement) {
      activeFirearmIds.forEach((fid) => {
        const list = firearmDocsById.get(String(fid)) ?? [];
        docs.push(...list);
      });
    }
    if (hasSafeRequirement) {
      effectiveSafeIds.forEach((sid) => {
        const list = safeDocsById.get(String(sid)) ?? [];
        docs.push(...list);
      });
    }
    if (selectedMembershipDocs.length) {
      docs.push(...selectedMembershipDocs);
    }
    if (selectedProficiencyDocs.length) {
      docs.push(...selectedProficiencyDocs);
    }
    return docs;
  }, [
    competencyDocsByCertId,
    effectiveCertificateIds,
    effectiveSafeIds,
    activeFirearmIds,
    firearmDocsById,
    hasFirearmRequirement,
    hasCompetencyRequirement,
    hasSafeRequirement,
    safeDocsById,
    selectedMembershipDocs,
    selectedProficiencyDocs,
  ]);

  const profileDocs = React.useMemo(() => {
    if (!app?.applicantProfileId) return [];
    return listByType<Document>('Document').filter(
      (doc) =>
        doc.parentType === 'Profile' &&
        String(doc.parentId ?? '') === String(app.applicantProfileId)
    );
  }, [app?.applicantProfileId, tick]);

  const buildDocState = React.useCallback(
    (draft: Application, docItems?: DocItemProgress[]): ApplicationDocState | undefined => {
      if (!resolved) return draft.docs;
      const draftCertificateIds =
        normalizeUniqueIds(draft.competencyCertificateIds).length > 0
          ? normalizeUniqueIds(draft.competencyCertificateIds)
          : effectiveCertificateIds;
      const draftFirearmIds =
        normalizeUniqueIds(draft.selectedFirearmIds).length > 0
          ? normalizeUniqueIds(draft.selectedFirearmIds)
          : activeFirearmIds;
      const draftSafeIds =
        normalizeUniqueIds(draft.safeIds).length > 0
          ? normalizeUniqueIds(draft.safeIds)
          : effectiveSafeIds;
      const draftMembershipIds =
        normalizeUniqueIds(draft.membershipIds).length > 0
          ? normalizeUniqueIds(draft.membershipIds)
          : effectiveMembershipIds;
      const draftProficiencyIds =
        normalizeUniqueIds(draft.proficiencyIds).length > 0
          ? normalizeUniqueIds(draft.proficiencyIds)
          : effectiveProficiencyIds;
      const selectedDraftFirearmIds = new Set(draftFirearmIds.map(String));
      const draftExternalDocuments: Document[] = [];
      if (hasCompetencyRequirement) {
        draftCertificateIds.forEach((cid) => {
          const list = competencyDocsByCertId.get(String(cid)) ?? [];
          draftExternalDocuments.push(...list);
        });
      }
      if (hasFirearmRequirement) {
        draftFirearmIds.forEach((fid) => {
          const list = firearmDocsById.get(String(fid)) ?? [];
          draftExternalDocuments.push(...list);
        });
      }
      if (hasSafeRequirement) {
        draftSafeIds.forEach((sid) => {
          const list = safeDocsById.get(String(sid)) ?? [];
          draftExternalDocuments.push(...list);
        });
      }
      if (draftMembershipIds.length) {
        draftMembershipIds.forEach((mid) => {
          const list = membershipDocsById.get(String(mid)) ?? [];
          list.forEach((doc) => {
            const code = String(doc.requirementCode ?? doc.kind ?? '').toUpperCase();
            if (code !== 'FIREARM_ENDORSEMENT') {
              draftExternalDocuments.push(doc);
              return;
            }
            const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
            if (relatedId && selectedDraftFirearmIds.has(relatedId)) {
              draftExternalDocuments.push(doc);
            }
          });
        });
      }
      if (draftProficiencyIds.length) {
        draftProficiencyIds.forEach((pid) => {
          const list = proficiencyDocsById.get(String(pid)) ?? [];
          draftExternalDocuments.push(...list);
        });
      }
      const requirements = resolved.requirements.map((req) => {
        const rawScope = (req as any)._scope ?? req.scope;
        const scope =
          rawScope === 'perApp' || rawScope === 'perFirearm' || rawScope === 'perSafe' || rawScope === 'perCertificate' || rawScope === 'perMembership'
            ? rawScope
            : rawScope?.perFirearm
              ? 'perFirearm'
              : rawScope?.perSafe
                ? 'perSafe'
                : rawScope?.perCertificate
                  ? 'perCertificate'
                  : rawScope?.perMembership
                    ? 'perMembership'
                    : rawScope?.perApp
                      ? 'perApp'
                      : undefined;
        return {
          code: req.code,
          required: req.required,
          requireUpload: req.requiredUpload ?? req.requireUpload ?? true,
          isSupportingDocument: (req as any).isSupportingDocument === true,
          isChecklistItem: (req as any).isChecklistItem === true,
          documentKinds: (req as any).documentKinds,
          annexure: req.annexure,
          min: req.min,
          copies: req.copies,
          scope,
        };
      });
      const derivedDocuments = collectApplicationDocEntries(
        docItems,
        draftExternalDocuments,
        safeDocsById,
        draftSafeIds
      );
      const storedDocuments = docItems
        ? []
        : (draft.docs?.documents ?? []).filter(
            (entry) => Boolean(entry?.documentId) && Boolean(getById<Document>(String(entry.documentId)))
          );
      const documentMap = new Map<string, ApplicationDocEntry>();
      storedDocuments.forEach((entry) => {
        const id = String(entry.documentId ?? '').trim();
        if (!id) return;
        documentMap.set(id, entry);
      });
      derivedDocuments.forEach((entry) => {
        const id = String(entry.documentId ?? '').trim();
        if (!id) return;
        documentMap.set(id, entry);
      });
      const selectedFirearmSourceIds = new Set(selectedDraftFirearmIds);
      const selectedSafeSourceIds = new Set(draftSafeIds.map(String));
      const selectedMembershipSourceIds = new Set(draftMembershipIds.map(String));
      const selectedProficiencySourceIds = new Set(draftProficiencyIds.map(String));
      const documents = Array.from(documentMap.values()).filter((entry) => {
        const sourceType = String(entry?.source?.type ?? '').trim().toLowerCase();
        const sourceId = String(entry?.source?.id ?? '').trim();
        if (!sourceType || !sourceId) return true;
        if (sourceType === 'firearm') return selectedFirearmSourceIds.has(sourceId);
        if (sourceType === 'safe') return selectedSafeSourceIds.has(sourceId);
        if (sourceType === 'membership') return selectedMembershipSourceIds.has(sourceId);
        if (sourceType === 'proficiency') return selectedProficiencySourceIds.has(sourceId);
        return true;
      });
      return {
        applicationId: draft.id,
        policy: {
          form: draft.form,
          version: resolved.policy?.version ?? '',
          effectiveFrom: undefined,
          licenceTypes:
            (draft as any).licenceTypes ?? (draft as any).licenseTypes ?? undefined,
          includeMembershipIfPresent: resolved.includeMembershipIfPresent === true,
        },
        requirements,
        documents,
      };
    },
    [
      activeFirearmIds,
      competencyDocsByCertId,
      effectiveCertificateIds,
      effectiveMembershipIds,
      effectiveProficiencyIds,
      effectiveSafeIds,
      firearmDocsById,
      hasCompetencyRequirement,
      hasFirearmRequirement,
      hasSafeRequirement,
      membershipDocsById,
      proficiencyDocsById,
      resolved,
      safeDocsById,
    ],
  );

  const buildWizardMotivationTextPatch = React.useCallback(
    (previous: Application, draft: Application): Partial<Application> | null => {
      if (draft.motivationSource !== 'wizard') return null;
      if (!draft.motivationProfile) return null;
      const normalizeMotivationDocCode = (value: unknown) =>
        String(value ?? '').trim().toUpperCase();
      const isMotivationRelevantDocEntry = (entry: ApplicationDocEntry): boolean => {
        const sourceType = String(entry?.source?.type ?? '').trim().toUpperCase();
        if (sourceType === 'MEMBERSHIP' || sourceType === 'SAFE' || sourceType === 'PROFICIENCY') {
          return true;
        }
        const code = normalizeMotivationDocCode(entry?.requirementCode);
        if (!code) return false;
        if (code === 'COMPETENCY_CERT' || code === 'SAFES' || code === 'FIREARM_LICENCE') return true;
        if (code === 'ASSOCIATION_MEMBERSHIP' || code === 'ASSOCIATION_LETTER') return true;
        if (code === 'DEDICATED_HUNTER_CERT' || code === 'DEDICATED_SPORT_CERT') return true;
        if (code === 'FIREARM_ENDORSEMENT') return true;
        if (code.startsWith('PROFICIENCY_')) return true;
        if (code.startsWith('STATEMENT_OF_RESULTS_')) return true;
        if (code.startsWith('SUPPORTING_STATEMENT_')) return true;
        return false;
      };
      const buildMotivationDocSignature = (application: Application): string => {
        const entries = Array.isArray(application.docs?.documents) ? application.docs!.documents : [];
        const tokens = new Set<string>();
        entries.forEach((entry) => {
          if (!entry?.documentId) return;
          if (!isMotivationRelevantDocEntry(entry)) return;
          const docId = String(entry.documentId).trim();
          if (!docId) return;
          const sourceType = String(entry?.source?.type ?? '').trim().toUpperCase();
          const sourceId = String(entry?.source?.id ?? '').trim();
          const code = normalizeMotivationDocCode(entry?.requirementCode);
          tokens.add(`${docId}|${sourceType}|${sourceId}|${code}|${String(entry.kind ?? '')}`);
        });
        return Array.from(tokens).sort().join('||');
      };
      const membershipChanged = !haveSameIdSet(previous.membershipIds, draft.membershipIds);
      const safeChanged = !haveSameIdSet(previous.safeIds, draft.safeIds);
      const proficiencyChanged = !haveSameIdSet(previous.proficiencyIds, draft.proficiencyIds);
      const firearmChanged = !haveSameIdSet(previous.selectedFirearmIds, draft.selectedFirearmIds);
      const motivationDocLinkageChanged =
        buildMotivationDocSignature(previous) !== buildMotivationDocSignature(draft);
      if (
        !membershipChanged &&
        !safeChanged &&
        !proficiencyChanged &&
        !firearmChanged &&
        !motivationDocLinkageChanged
      ) {
        return null;
      }

      const selectedFirearmIds = normalizeUniqueIds(draft.selectedFirearmIds);
      const selectedCertificateIds = normalizeUniqueIds(draft.competencyCertificateIds);
      if (!selectedFirearmIds.length) return null;
      const selectedMembershipIds = normalizeUniqueIds(draft.membershipIds);
      const selectedSafeIds = normalizeUniqueIds(draft.safeIds);

      const allFirearms = listByType<Firearm>('Firearm');
      const allMemberships = listByType<Membership>('Membership');
      const profileId = draft.applicantProfileId ? String(draft.applicantProfileId) : '';
      const applicantProfile = profileId ? getById<Profile>(profileId) ?? null : null;
      const scopedFirearms = profileId
        ? allFirearms.filter((item) => !item.holderProfileId || String(item.holderProfileId) === profileId)
        : allFirearms;
      const targetFirearm =
        scopedFirearms.find((item) => String(item.id) === selectedFirearmIds[0]) ??
        allFirearms.find((item) => String(item.id) === selectedFirearmIds[0]);
      if (!targetFirearm) return null;

      const sectionType = inferSectionTypeFromFirearmSection(targetFirearm.section);
      if (!sectionType) return null;
      let purposeType: MotivationPurposeType;
      if (sectionType === 's13') {
        purposeType = 'self_defence';
      } else if (targetFirearm.purpose && MOTIVATION_PURPOSE_OPTIONS.has(targetFirearm.purpose)) {
        purposeType = targetFirearm.purpose;
      } else {
        const hasHunting = Boolean(
          draft.motivationProfile.huntingProfile?.species?.length ||
          draft.motivationProfile.huntingProfile?.terrainTags?.length ||
          draft.motivationProfile.huntingProfile?.distanceBand
        );
        const hasSport = Boolean(
          draft.motivationProfile.sportProfile?.disciplineTags?.length ||
          draft.motivationProfile.sportProfile?.participationFrequency
        );
        if (hasHunting && hasSport) purposeType = 'mixed_hunting_sport';
        else if (hasHunting) purposeType = 'hunting';
        else purposeType = 'sport_shooting';
      }

      const selectedMemberships = allMemberships.filter((membership) =>
        selectedMembershipIds.includes(String(membership.id))
      );
      const associationName = selectedMemberships
        .map((membership) => `${membership.associationName ?? ''}`.trim())
        .filter(Boolean)
        .join(', ');
      const comparisonCount = scopedFirearms.filter(
        (item) => String(item.id) !== String(targetFirearm.id)
      ).length;
      const competencyCategories = (() => {
        const seen = new Set<string>();
        const categories: CompetencyCategory[] = [];
        selectedCertificateIds.forEach((certificateId) => {
          const certificate = getById<CompetencyCertificate>(String(certificateId));
          (certificate?.categories ?? []).forEach((category) => {
            const key = String(category);
            if (seen.has(key)) return;
            seen.add(key);
            categories.push(category);
          });
        });
        return categories;
      })();
      const profileForValues = draft.motivationProfile ?? {};
      const values = {
        applicationType: 'renewal' as MotivationApplicationType,
        sectionType,
        purposeType,
        applicantFullName: getProfileName(applicantProfile),
        applicantInitials: getProfileInitials(applicantProfile),
        applicantSex: applicantProfile?.sexAtBirth,
        associationName,
        requiresComparison: comparisonCount > 0,
        comparisonFirearmCount: comparisonCount,
        firearmMake: targetFirearm.make,
        firearmModel: targetFirearm.model,
        firearmCalibre: targetFirearm.calibre,
        firearmSerialNumber: targetFirearm.firearmSerialNumber,
        firearmType: targetFirearm.firearmType,
        firearmAction: targetFirearm.firearmAction,
        competencyCategories: competencyCategories.length
          ? competencyCategories
          : [targetFirearm.firearmType],
        homeType: applicantProfile?.address?.homeType,
        securityMeasures: applicantProfile?.address?.securityMeasures ?? [],
        usedFirearmsSince: applicantProfile?.usedFirearmsSince,
        firearmOwnerSince: applicantProfile?.firearmOwnerSince,
        motivationProfile: {
          ...profileForValues,
          supportProfile: {
            ...(profileForValues.supportProfile ?? {}),
            selectedSafeIds,
          },
        },
      };

      const composed = composeMotivation({
        application: draft,
        applicationType: 'renewal',
        sectionType,
        purposeType,
        evidenceKeys: buildEvidenceKeys('renewal', sectionType),
        resolvedEvidence: resolveEvidenceFromApplication(draft),
        values,
      });
      const nextText = `${composed.text ?? ''}`.trim();
      if (!nextText || nextText === `${draft.motivationText ?? ''}`.trim()) return null;
      return { motivationText: composed.text };
    },
    [],
  );

  const persistAppWithDocs = React.useCallback(
    (draft: Application, docItems?: DocItemProgress[], alreadyTouched = false) => {
      const previous = draft?.id ? getById<Application>(String(draft.id)) ?? draft : draft;
      const nextDocState = buildDocState(draft, docItems);
      const draftWithDocState =
        nextDocState && nextDocState !== draft.docs
          ? ({ ...draft, docs: nextDocState } as Application)
          : draft;
      const motivationPatch = buildWizardMotivationTextPatch(previous, draftWithDocState);
      const nextDraft = motivationPatch
        ? ({ ...draftWithDocState, ...motivationPatch } as Application)
        : draftWithDocState;
      persistApp(
        nextDraft,
        alreadyTouched,
        nextDraft.docs,
      );
    },
    [buildDocState, buildWizardMotivationTextPatch],
  );

  const persistLatestAppWithDocs = React.useCallback(
    (updater: (latest: Application) => { next: Application; docItems?: DocItemProgress[] }) => {
      if (!app?.id) return;
      const latest = getById<Application>(String(app.id)) ?? app;
      const result = updater(latest);
      persistAppWithDocs(result.next, result.docItems, false);
      setTick((t) => t + 1);
    },
    [app, persistAppWithDocs],
  );

  const toggleMembershipSelection = React.useCallback(
    (membershipId: string) => {
      const selectedMembershipId = String(membershipId);
      const isCurrentlySelected = new Set(effectiveMembershipIds).has(selectedMembershipId);
      if (!isCurrentlySelected) {
        const membership = memberships.find((item) => String(item.id) === selectedMembershipId) ?? null;
        const health = getMembershipHealth(membership);
        if (health.status === 'warning') {
          Alert.alert(
            'Membership missing info',
            'This membership is missing information and cannot be added to the application until it is fixed.',
            [
              { text: 'Fix later', style: 'destructive' },
              {
                text: 'Fix now',
                style: 'default',
                onPress: () => {
                  const applicationId = app?.id ? String(app.id) : id;
                  const resolved = resolveWizardRoute('membership', 'documents', { id: applicationId });
                  if (!resolved) return;
                  const anchor = 'MEMBERSHIP';
                  const routeParams: Record<string, any> = {
                    nav: JSON.stringify({
                      routeBack: resolved.routeBack,
                      returnTo: resolved.routeBack,
                      onComplete: resolved.routeBack,
                      clearRouteBackHistory: resolved.clearRouteBackHistory,
                    }),
                    anchor,
                  };
                  if (membership?.id) {
                    routeParams.membershipId = String(membership.id);
                  }
                  router.push({ pathname: resolved.routeTo as any, params: routeParams } as any);
                },
              },
            ],
          );
          return;
        }
      }
      userChangedRef.current = true;
      persistLatestAppWithDocs((latest) => {
        const existing = new Set(effectiveMembershipIds);
        if (existing.has(selectedMembershipId)) {
          existing.delete(selectedMembershipId);
        } else {
          existing.add(selectedMembershipId);
        }
        const nextApp = {
          ...latest,
          membershipIds: Array.from(existing),
        } as Application;
        return { next: nextApp };
      });
    },
    [effectiveMembershipIds, id, memberships, persistLatestAppWithDocs, router],
  );

  const toggleProficiencySelection = React.useCallback(
    (proficiencyId: string) => {
      userChangedRef.current = true;
      persistLatestAppWithDocs((latest) => {
        const id = String(proficiencyId);
        const existing = new Set(effectiveProficiencyIds);
        if (existing.has(id)) {
          existing.delete(id);
        } else {
          existing.add(id);
        }
        const nextApp = {
          ...latest,
          proficiencyIds: Array.from(existing),
        } as Application;
        return { next: nextApp };
      });
    },
    [effectiveProficiencyIds, persistLatestAppWithDocs],
  );
  const toggleActivityEvidenceSelection = React.useCallback(
    (activityEvidenceId: string) => {
      userChangedRef.current = true;
      persistLatestAppWithDocs((latest) => {
        const id = String(activityEvidenceId);
        const existing = new Set(
          (Array.isArray(latest.activityEvidenceIds) ? latest.activityEvidenceIds : []).map(String),
        );
        if (existing.has(id)) existing.delete(id);
        else existing.add(id);
        const nextApp = {
          ...latest,
          activityEvidenceIds: Array.from(existing),
        } as Application;
        return { next: nextApp };
      });
    },
    [persistLatestAppWithDocs],
  );

  const setMotivationSelection = React.useCallback((useStandardLanguage: boolean) => {
    userChangedRef.current = true;
    persistLatestAppWithDocs((latest) => {
      const next = {
        ...latest,
        userToSubmitMotivation: useStandardLanguage,
        motivationSource: useStandardLanguage ? 'standard' : 'own',
      } as Application;
      return { next };
    });
  }, [persistLatestAppWithDocs]);
  const setMotivationWizardSelection = React.useCallback(() => {
    userChangedRef.current = true;
    persistLatestAppWithDocs((latest) => {
      const holderProfileId = String(latest.applicantProfileId ?? '').trim();
      const primaryFirearmId = getPrimaryApplicationFirearmId(latest);
      const linkedMotivation =
        holderProfileId && primaryFirearmId
          ? findMotivationByHolderAndFirearm(holderProfileId, primaryFirearmId)
          : null;
      const motivationPatch = linkedMotivation
        ? buildApplicationMotivationMirrorPatch(latest, linkedMotivation)
        : {
            motivationId: undefined,
            motivationProfile: undefined,
            motivationText: undefined,
            motivationWizardStatus: undefined,
          };
      const next = {
        ...latest,
        ...motivationPatch,
        motivationSource: 'wizard',
        motivationFirearmId: primaryFirearmId || latest.motivationFirearmId,
      } as Application;
      return { next };
    });
  }, [persistLatestAppWithDocs]);

  useEffect(() => {
    if (!app || !is518a) return;
    const holderProfileId = String(app.applicantProfileId ?? '').trim();
    if (!holderProfileId) return;
    const primaryFirearmId = activeFirearmIds[0] ? String(activeFirearmIds[0]).trim() : '';
    const linkedMotivation =
      primaryFirearmId
        ? findMotivationByHolderAndFirearm(holderProfileId, primaryFirearmId)
        : null;
    const expectedMotivationId = linkedMotivation?.id ? String(linkedMotivation.id) : '';
    const currentMotivationId = String(app.motivationId ?? '').trim();
    const currentMotivationFirearmId = String(app.motivationFirearmId ?? '').trim();
    const shouldClearMirror =
      !linkedMotivation &&
      (currentMotivationId.length > 0 ||
        app.motivationProfile != null ||
        app.motivationText != null ||
        app.motivationWizardStatus != null);
    const shouldRelink =
      currentMotivationFirearmId !== primaryFirearmId ||
      currentMotivationId !== expectedMotivationId;
    if (!shouldClearMirror && !shouldRelink) return;

    persistLatestAppWithDocs((latest) => {
      const latestHolderProfileId = String(latest.applicantProfileId ?? '').trim();
      const latestPrimaryFirearmId = getPrimaryApplicationFirearmId(latest);
      const latestLinkedMotivation =
        latestHolderProfileId && latestPrimaryFirearmId
          ? findMotivationByHolderAndFirearm(latestHolderProfileId, latestPrimaryFirearmId)
          : null;
      const mirrorPatch = latestLinkedMotivation
        ? buildApplicationMotivationMirrorPatch(latest, latestLinkedMotivation)
        : {
            motivationId: undefined,
            motivationProfile: undefined,
            motivationText: undefined,
            motivationWizardStatus: undefined,
          };
      const next = {
        ...latest,
        motivationFirearmId: latestPrimaryFirearmId || undefined,
        ...mirrorPatch,
      } as Application;
      return { next };
    });
  }, [
    activeFirearmIds,
    app,
    is518a,
    persistLatestAppWithDocs,
  ]);

  const acknowledgementItems = React.useMemo(() => {
    if (!app || !resolved?.declarations?.length) return [] as Array<NormalizedAcknowledgement & { checked: boolean }>;
    const declarationSet = new Set<string>(
      Array.isArray(app.declarations) ? app.declarations.map((value) => String(value).toUpperCase()) : []
    );
    return resolved.declarations
      .filter((ack) => ack.display !== false)
      .map((ack, idx) => {
        const code = ack.code ? String(ack.code).toUpperCase() : undefined;
        const checked = code ? declarationSet.has(code) : false;
        return {
          ...ack,
          key: ack.key || `ack::${ack.code ?? idx}`,
          checked,
        };
      });
  }, [app, resolved?.declarations, tick]);

  React.useEffect(() => {
    if (!app) return;
    if (app.form !== '517g' && app.form !== '518a') return;
    const needsDebug = !resolved || !resolved.requirements || resolved.requirements.length === 0;
    if (!needsDebug || debugShown) return;

    const rawForm = (app as any).form || (app as any).type;
    const canon = canonicalForm(rawForm as any);
    const lt = (app as any).licenseType || (app as any).licenceType;
    Alert.alert(
      'Documents policy issue',
      `App ID: ${app.id}\nForm(raw): ${rawForm}\nForm(canon): ${canon}\nLicenseType: ${lt || '(none)'}\nError: ${resolverError || 'none'}\nResolved: ${resolved ? 'yes' : 'no'}\nReq count: ${resolved?.requirements?.length ?? 0}`
    );
    setDebugShown(true);
  }, [app, resolved, resolverError, debugShown]);

  const linkProfileProof = React.useCallback(
    (item: DocItemProgress): DocItemProgress => {
      const isIdKind = item.kind === 'ID_CARD' || item.kind === 'ID_BOOK' || item.kind === 'PASSPORT';
      const isAddressKind = item.kind === 'PROOF_OF_ADDRESS';
      const code = (item.code ?? item.key ?? '').toUpperCase();
      const isDedicated = MEMBERSHIP_DOC_CODES.has(code);
      if (!isIdKind && !isAddressKind && !isDedicated) return item;
      const hasLiveLinkedDoc =
        (item.documentId ? Boolean(getById<Document>(String(item.documentId))) : false) ||
        (item.instances ?? []).some((inst) =>
          inst.documentId ? Boolean(getById<Document>(String(inst.documentId))) : false
        );
      if (hasLiveLinkedDoc) return item;

      const candidates = profileDocs
        .filter((doc) => {
          if (isIdKind) return doc.kind === 'ID_CARD' || doc.kind === 'ID_BOOK' || doc.kind === 'PASSPORT';
          if (isAddressKind) return doc.kind === 'PROOF_OF_ADDRESS';
          return String(doc.kind ?? '').toUpperCase() === code || (doc.requirementCode ?? '').toUpperCase() === code;
        })
        .slice()
        .sort((a, b) => {
          const ta = Date.parse(a.updatedAt || a.createdAt || '');
          const tb = Date.parse(b.updatedAt || b.createdAt || '');
          return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
        });
      if (!candidates.length) return item;

      const selected: Document[] = [];
      if (isIdKind) {
        const pickLatestBySide = (side: IdentityDocumentSide) =>
          candidates.find((doc) => (doc as any).identityDocumentSide === side);
        const latestFront = pickLatestBySide('front');
        const latestBack = pickLatestBySide('back');
        const latestBoth = pickLatestBySide('both');
        if (latestFront) selected.push(latestFront);
        if (latestBack && !selected.includes(latestBack)) selected.push(latestBack);
        if (selected.length < 2 && latestBoth && !selected.includes(latestBoth)) selected.push(latestBoth);
      }

      if (!selected.length && candidates.length) {
        selected.push(candidates[0]);
      }

      if (app) {
        selected.forEach((doc) => {
          const needsLinkage =
            doc.applicationId !== app.id ||
            (doc.requirementCode ?? '').toUpperCase() !== (item.code ?? item.key ?? '').toUpperCase();
          if (needsLinkage) {
            const updatedDoc = touch({
              ...doc,
              applicationId: app.id,
              requirementCode: item.code ?? item.key,
              requirementRelatedLabel: item.label,
            } as Document);
            persist(updatedDoc);
          }
        });
      }

      const baseStatus: DocItemProgress['status'] =
        item.status === 'verified' ? 'verified' : 'captured';

      if (item.multiple || item.allowMultipleUploads) {
        const nextInstance = selected.map((doc) => ({
          documentId: doc.id,
          status: baseStatus,
          captureMethod: 'upload' as CaptureMethod,
          identityDocumentSide: (doc as any).identityDocumentSide,
        })) as NonNullable<DocItemProgress['instances']>[number][];
        return {
          ...item,
          instances: nextInstance,
          status: baseStatus,
        };
      }

      return {
        ...item,
        documentId: selected[0]?.id,
        status: baseStatus,
        captureMethod: 'upload',
        identityDocumentSide: (selected[0] as any)?.identityDocumentSide,
      };
  },
  [app, profileDocs],
);

  const ensureCompetencyInstances = React.useCallback(
    (item: DocItemProgress): DocItemProgress => {
      const code = (item.code ?? item.key ?? '').toUpperCase();
      const isCompetencyReq = code.startsWith('COMPETENCY_CERT') || code.startsWith('COMPETENCY');
      if (!isCompetencyReq) return item;
      if (!item.multiple && !item.allowMultipleUploads) return item;

      const existing = Array.isArray(item.instances) ? [...item.instances] : [];
      const existingIds = new Set(existing.map((inst) => normalizeId(inst.relatedId)));
      let changed = false;

      effectiveCertificateIds.forEach((cid) => {
        const normId = normalizeId(cid);
        if (!normId || existingIds.has(normId)) return;
        const cert = availableCertificates.find((c) => normalizeId(c.id) === normId);
       const docs = competencyDocsByCertId.get(normId) ?? [];
       const sorted = docs
         .slice()
         .sort((a, b) => {
           const ta = Date.parse(a.updatedAt || a.createdAt || '');
           const tb = Date.parse(b.updatedAt || b.createdAt || '');
           return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
         });
       const doc = sorted[0];
       existing.push({
         relatedId: normId,
         label: cert ? formatCertificateLabel(cert) : undefined,
          status: doc ? 'captured' : 'pending',
          documentId: doc?.id,
          captureMethod: doc ? 'upload' : undefined,
        });
        existingIds.add(normId);
        changed = true;
      });

      // Normalize statuses for any instance that already has a documentId
      existing.forEach((inst, idx) => {
        if (inst.documentId && inst.status !== 'verified') {
          existing[idx] = { ...inst, status: 'captured' };
          changed = true;
        }
      });

      // backfill documentId for existing instances if missing
      existing.forEach((inst, idx) => {
        if (!inst.relatedId || inst.documentId) return;
        const docs = competencyDocsByCertId.get(String(inst.relatedId));
        if (!docs || !docs.length) return;
        const doc = docs
          .slice()
          .sort((a, b) => {
            const ta = Date.parse(a.updatedAt || a.createdAt || '');
            const tb = Date.parse(b.updatedAt || b.createdAt || '');
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          })[0];
        if (doc) {
          existing[idx] = {
            ...inst,
            documentId: doc.id,
            status: inst.status === 'verified' ? 'verified' : 'captured',
            captureMethod: inst.captureMethod ?? 'upload',
          };
          changed = true;
        }
      });

      if (!changed) return item;
      const nextStatus = deriveMultiInstanceStatus(item, existing as NonNullable<DocItemProgress['instances']>);
      return {
        ...item,
        instances: existing,
        status: nextStatus,
      };
    },
    [availableCertificates, competencyDocsByCertId, effectiveCertificateIds],
  );

  const ensureSafeInstances = React.useCallback(
    (item: DocItemProgress): DocItemProgress => {
      const code = (item.code ?? item.key ?? '').toUpperCase();
      const isSafeReq = isSafeRequirementCode(code) || item.kind === 'SAFE';
      if (!isSafeReq) return item;
      const existing = Array.isArray(item.instances) ? [...item.instances] : [];
      const existingIds = new Set(existing.map((inst) => normalizeId(inst.relatedId)));
      let changed = false;

      effectiveSafeIds.forEach((sid) => {
        const normId = normalizeId(sid);
        if (!normId || existingIds.has(normId)) return;
        const docs = safeDocsById.get(normId) ?? [];
        const doc = docs
          .slice()
          .sort((a, b) => {
            const ta = Date.parse(a.updatedAt || a.createdAt || '');
            const tb = Date.parse(b.updatedAt || b.createdAt || '');
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          })[0];
        existing.push({
          relatedId: normId,
          status: doc ? 'captured' : 'pending',
          documentId: doc?.id,
          captureMethod: doc ? 'upload' : undefined,
        });
        existingIds.add(normId);
        changed = true;
      });

      existing.forEach((inst, idx) => {
        if (inst.documentId && inst.status !== 'verified') {
          existing[idx] = { ...inst, status: 'captured' };
          changed = true;
        }
      });

      existing.forEach((inst, idx) => {
        if (!inst.relatedId || inst.documentId) return;
        const docs = safeDocsById.get(String(inst.relatedId));
        if (!docs || !docs.length) return;
        const doc = docs
          .slice()
          .sort((a, b) => {
            const ta = Date.parse(a.updatedAt || a.createdAt || '');
            const tb = Date.parse(b.updatedAt || b.createdAt || '');
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          })[0];
        if (doc) {
          existing[idx] = {
            ...inst,
            documentId: doc.id,
            status: inst.status === 'verified' ? 'verified' : 'captured',
            captureMethod: inst.captureMethod ?? 'upload',
          };
          changed = true;
        }
      });

      if (!changed) return item;
      return {
        ...item,
        instances: existing,
        status: deriveMultiInstanceStatus(item, existing as NonNullable<DocItemProgress['instances']>),
      };
    },
    [effectiveSafeIds, safeDocsById],
  );

  const ensureFirearmInstances = React.useCallback(
    (item: DocItemProgress): DocItemProgress => {
      const code = (item.code ?? item.key ?? '').toUpperCase();
      const isFirearmReq = isFirearmLicenceRequirementCode(code) || item.kind === 'FIREARM_LICENCE';
      if (!isFirearmReq) return item;
      const existing = Array.isArray(item.instances) ? [...item.instances] : [];
      const existingIds = new Set(existing.map((inst) => normalizeId(inst.relatedId)));
      let changed = false;

      activeFirearmIds.forEach((fid) => {
        const normId = normalizeId(fid);
        if (!normId || existingIds.has(normId)) return;
        const docs = firearmDocsById.get(normId) ?? [];
        const doc = docs
          .slice()
          .sort((a, b) => {
            const ta = Date.parse(a.updatedAt || a.createdAt || '');
            const tb = Date.parse(b.updatedAt || b.createdAt || '');
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          })[0];
        const firearm = availableFirearms.find((f) => normalizeId(f.id) === normId);
        existing.push({
          relatedId: normId,
          label: firearm ? formatFirearmLabel(firearm) : undefined,
          status: doc ? 'captured' : 'pending',
          documentId: doc?.id,
          captureMethod: doc ? 'upload' : undefined,
        });
        existingIds.add(normId);
        changed = true;
      });

      existing.forEach((inst, idx) => {
        if (inst.documentId && inst.status !== 'verified') {
          existing[idx] = { ...inst, status: 'captured' };
          changed = true;
        }
      });

      existing.forEach((inst, idx) => {
        if (!inst.relatedId || inst.documentId) return;
        const docs = firearmDocsById.get(String(inst.relatedId));
        if (!docs || !docs.length) return;
        const doc = docs
          .slice()
          .sort((a, b) => {
            const ta = Date.parse(a.updatedAt || a.createdAt || '');
            const tb = Date.parse(b.updatedAt || b.createdAt || '');
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          })[0];
        if (doc) {
          existing[idx] = {
            ...inst,
            documentId: doc.id,
            status: inst.status === 'verified' ? 'verified' : 'captured',
            captureMethod: inst.captureMethod ?? 'upload',
          };
          changed = true;
        }
      });

      if (!changed) return item;
      return {
        ...item,
        instances: existing,
        status: deriveMultiInstanceStatus(item, existing as NonNullable<DocItemProgress['instances']>),
      };
    },
    [activeFirearmIds, availableFirearms, firearmDocsById],
  );

  // Anchor UI to resolver output; hydrate from stored ApplicationDocState when available
  const progressItems: DocItemProgress[] = React.useMemo(() => {
    if (!defs.length) return [];
    const storedDocs = app?.docs?.documents ?? [];
    const byRequirement = new Map<string, ApplicationDocEntry[]>();
    storedDocs.forEach((entry) => {
      const code = normalizeRequirementCode(entry.requirementCode);
      if (!code) return;
      if (!byRequirement.has(code)) byRequirement.set(code, []);
      byRequirement.get(code)!.push(entry);
    });

    return defs.map(d => {
      const requiresUpload = d.requiredUpload !== false;
      const isMultiple = !!d.multiple || d.allowMultipleUploads === true;
      const allowedKinds = d.allowedKinds as Array<'IMAGE' | 'PDF' | 'OTHER'> | undefined;
      const baseInstances = isMultiple ? [] : undefined;
      const base: DocItemProgress = {
        key: d.key,
        code: d.__code ?? d.key,
        label: d.label,
        kind: d.kind,
        status: 'pending',
        multiple: isMultiple,
        allowMultipleUploads: d.allowMultipleUploads === true,
        allowedKinds,
        requiredUpload: requiresUpload,
        acknowledged: false,
        minUploads: d.minUploads,
        maxUploads: d.maxUploads,
        instances: baseInstances,
      } as DocItemProgress;

      const codeKey = normalizeRequirementCode(base.code ?? base.key);
      const matched = byRequirement.get(codeKey) ?? [];
      if (matched.length) {
        if (base.multiple || base.allowMultipleUploads) {
          base.instances = matched
            .map((entry) => {
              const doc = getById<Document>(String(entry.documentId));
              if (!doc) return null;
              return {
                documentId: entry.documentId,
                status: 'captured',
                captureMethod: 'upload',
                relatedId: entry.source?.id,
                identityDocumentSide: doc?.identityDocumentSide,
              } as NonNullable<DocItemProgress['instances']>[number];
            })
            .filter(Boolean) as NonNullable<DocItemProgress['instances']>;
          base.status = deriveMultiInstanceStatus(base, base.instances as NonNullable<DocItemProgress['instances']>);
        } else {
          const liveMatch = matched.find((entry) => getById<Document>(String(entry.documentId)));
          base.documentId = liveMatch?.documentId;
          base.status = base.documentId ? 'captured' : 'pending';
          const doc = base.documentId ? getById<Document>(String(base.documentId)) : null;
          base.identityDocumentSide = doc?.identityDocumentSide;
          base.captureMethod = base.documentId ? 'upload' : undefined;
        }
      }

      return ensureFirearmInstances(ensureSafeInstances(ensureCompetencyInstances(linkProfileProof(base))));
    });
  }, [defs, app?.docs?.documents, linkProfileProof, ensureCompetencyInstances, ensureSafeInstances, ensureFirearmInstances]);

  const normalizeCapturedStatus = React.useCallback((item: DocItemProgress): DocItemProgress => {
    const code = (item.code ?? item.key ?? '').toUpperCase();
    const isFirearm = isFirearmLicenceRequirementCode(code) || item.kind === 'FIREARM_LICENCE';
    const isCompetency = isCompetencyRequirementCode(code) || item.kind === 'COMPETENCY_CERT';
    const isSafe = isSafeRequirementCode(code) || item.kind === 'SAFE';
    if (!isFirearm && !isCompetency && !isSafe) return item;

    if (item.multiple || item.allowMultipleUploads) {
      const instances = (item.instances ?? []).map((inst) => {
        if (inst.status === 'verified' || inst.status === 'extracted') return inst;
        if (inst.documentId) return { ...inst, status: 'captured' as const };
        return inst;
      });
      return {
        ...item,
        instances,
        status: deriveMultiInstanceStatus(item, instances as NonNullable<DocItemProgress['instances']>),
      };
    }

    if ((item.status !== 'verified' && item.status !== 'extracted') && item.documentId) {
      return { ...item, status: 'captured' };
    }
    return item;
  }, []);

  const membershipRequirement = useMemo<'required' | 'optional' | 'none'>(() => {
    if (app?.requireMembership === true) return 'required';
    if (resolved?.membershipRequirement === 'required') return 'required';
    if (resolved?.membershipRequirement === 'optional') return 'optional';
    return 'none';
  }, [app?.requireMembership, resolved?.membershipRequirement]);
  const proficiencyRequirement = useMemo<'required' | 'optional'>(() => {
    if (!proficiencyPolicyDef) return 'optional';
    if (
      proficiencyPolicyDef.requiredForApplication === true ||
      proficiencyPolicyDef.required === true
    ) {
      return 'required';
    }
    return 'optional';
  }, [proficiencyPolicyDef]);

  const membershipAnchorKey = useMemo(() => {
    const match = defs.find(
      (def) => (def.__code ?? def.key ?? '').toUpperCase() === 'MEMBERSHIP'
    );
    return match?.key ?? membershipPolicyDef?.key ?? 'MEMBERSHIP';
  }, [defs, membershipPolicyDef]);

  const membershipHelpDef = useMemo(() => {
    const associationDef = defs.find(
      (def) => (def.__code ?? def.key ?? '').toUpperCase() === 'ASSOCIATION_MEMBERSHIP'
    );
    if (associationDef) {
      return {
        label: associationDef.label ?? 'Association membership',
        help: associationDef.help,
        helpKey: associationDef.helpKey,
      };
    }
    return {
      label: membershipPolicyDef?.label ?? 'Association membership',
      help: membershipPolicyDef?.help,
      helpKey: membershipPolicyDef?.helpKey,
    };
  }, [defs, membershipPolicyDef]);

  const proficiencyAnchorKey = useMemo(() => {
    const match = defs.find(
      (def) => (def.__code ?? def.key ?? '').toUpperCase() === 'PROFICIENCY'
    );
    return match?.key ?? proficiencyPolicyDef?.key ?? 'PROFICIENCY';
  }, [defs, proficiencyPolicyDef]);
  const activityEvidenceAnchorKey = useMemo(() => {
    const match = defs.find((def) => (def.__code ?? def.key ?? '').toUpperCase() === 'ACTIVITY_EVIDENCE');
    if (match?.key) return match.key;
    return activityEvidencePolicyDef?.key ?? 'ACTIVITY_EVIDENCE';
  }, [activityEvidencePolicyDef, defs]);
  const activityEvidenceHelpDef = useMemo(() => {
    const match = defs.find((def) => (def.__code ?? def.key ?? '').toUpperCase() === 'ACTIVITY_EVIDENCE');
    if (match) {
      return {
        label: match.label ?? 'Firearm activity evidence',
        help: match.help,
        helpKey: match.helpKey,
      };
    }
    return {
      label: activityEvidencePolicyDef?.label ?? 'Firearm activity evidence',
      help: activityEvidencePolicyDef?.help,
      helpKey: activityEvidencePolicyDef?.helpKey,
    };
  }, [activityEvidencePolicyDef, defs]);

  const proficiencyHelpDef = useMemo(() => {
    const proficiencyDocDef = defs.find((def) =>
      PROFICIENCY_DOC_CODES.has((def.__code ?? def.key ?? '').toUpperCase())
    );
    if (proficiencyDocDef) {
      return {
        label: proficiencyDocDef.label ?? 'Proficiency',
        help: proficiencyDocDef.help,
        helpKey: proficiencyDocDef.helpKey,
      };
    }
    return {
      label: proficiencyPolicyDef?.label ?? 'Proficiency',
      help: proficiencyPolicyDef?.help,
      helpKey: proficiencyPolicyDef?.helpKey,
    };
  }, [defs, proficiencyPolicyDef]);

  const competencyAnchorKey = useMemo(() => {
    const match = defs.find(
      (def) =>
        def.kind === 'COMPETENCY_CERT' ||
        isCompetencyRequirementCode((def.__code ?? def.key ?? '').toUpperCase())
    );
    return match?.key;
  }, [defs]);

  const safeAnchorKey = useMemo(() => {
    const match = defs.find(
      (def) => def.kind === 'SAFE' || isSafeRequirementCode((def.__code ?? def.key ?? '').toUpperCase())
    );
    return match?.key;
  }, [defs]);

  const firearmAnchorKey = useMemo(() => {
    const match = defs.find(
      (def) =>
        def.kind === 'FIREARM_LICENCE' ||
        isFirearmLicenceRequirementCode((def.__code ?? def.key ?? '').toUpperCase())
    );
    return match?.key;
  }, [defs]);

  const supportingAnchorKey = useMemo(() => {
    const match = defs.find((def) => {
      const code = (def.__code ?? def.key ?? '').toUpperCase();
      return code.startsWith('SUPPORTING_STATEMENT');
    });
    return match?.key;
  }, [defs]);

  const proofOfAddressAnchorKey = useMemo(() => {
    const match = defs.find(
      (def) =>
        def.kind === 'PROOF_OF_ADDRESS' ||
        String(def.__code ?? def.key ?? '').toUpperCase() === 'PROOF_ADDRESS'
    );
    return match?.key;
  }, [defs]);
  const motivationAnchorKey = useMemo(() => {
    const match = defs.find((def) =>
      String(def.__code ?? def.key ?? '').toUpperCase().startsWith('MOTIVATION')
    );
    return match?.key;
  }, [defs]);

  const targetAnchor = useMemo(() => {
    if (anchorKey) return anchorKey;
    if (!scrollParam) return undefined;
    const lower = scrollParam.toLowerCase();
    if (lower.startsWith('member')) return membershipAnchorKey;
    if (lower.startsWith('profic')) return proficiencyAnchorKey;
    if (lower.startsWith('activity')) return activityEvidenceAnchorKey;
    if (lower.startsWith('safe')) return safeAnchorKey;
    if (lower.startsWith('address') || lower.startsWith('proof')) return proofOfAddressAnchorKey;
    if (lower.startsWith('support')) return supportingAnchorKey;
    if (lower.startsWith('motivation')) return motivationAnchorKey;
    if (lower.startsWith('firearm')) return firearmAnchorKey;
    if (lower.startsWith('compet')) return competencyAnchorKey;
    if (lower.startsWith('decl')) return DECLARATIONS_ANCHOR;
    return scrollParam;
  }, [
    anchorKey,
    competencyAnchorKey,
    firearmAnchorKey,
    membershipAnchorKey,
    motivationAnchorKey,
    proofOfAddressAnchorKey,
    proficiencyAnchorKey,
    activityEvidenceAnchorKey,
    safeAnchorKey,
    scrollParam,
    supportingAnchorKey,
  ]);

  const goMembershipWizard = React.useCallback(
    (membershipId?: string | null, opts?: { push?: boolean }) => {
      if (!documentPathBase) return;
      const resolved = resolveWizardRoute('membership', 'documents', { id });
      if (!resolved) return;
      const anchor = membershipAnchorKey || 'MEMBERSHIP';
      const params: Record<string, any> = {
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          onComplete: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
        }),
        anchor,
      };
      if (membershipId) params.membershipId = membershipId;
      const navFn = opts?.push ? router.push : router.replace;
      navFn({
        pathname: resolved.routeTo as any,
        params,
      } as any);
    },
    [documentPathBase, id, membershipAnchorKey, router],
  );

  const goProficiencyWizard = React.useCallback(
    (proficiencyId?: string | null, opts?: { push?: boolean }) => {
      if (!documentPathBase) return;
      const resolved = resolveWizardRoute('proficiency', 'documents', { id });
      if (!resolved) return;
      const anchor = proficiencyAnchorKey || 'PROFICIENCY';
      const params: Record<string, any> = {
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          onComplete: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
        }),
        anchor,
      };
      if (proficiencyId) params.proficiencyId = proficiencyId;
      const navFn = opts?.push ? router.push : router.replace;
      navFn({
        pathname: resolved.routeTo as any,
        params,
      } as any);
    },
    [documentPathBase, id, proficiencyAnchorKey, router],
  );
  const goActivityEvidenceWizard = React.useCallback(
    (evidenceType: ActivityEvidence['evidenceType'], activityEvidenceId?: string | null, opts?: { push?: boolean }) => {
      if (!documentPathBase) return;
      const resolved = resolveWizardRoute('activityEvidence', 'documents', { id });
      if (!resolved) return;
      const anchor = activityEvidenceAnchorKey || 'ACTIVITY_EVIDENCE';
      const params: Record<string, any> = {
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          onComplete: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
        }),
        anchor,
        evidenceType,
      };
      if (activityEvidenceId) params.activityEvidenceId = activityEvidenceId;
      const navFn = opts?.push ? router.push : router.replace;
      navFn({
        pathname: resolved.routeTo as any,
        params,
      } as any);
    },
    [activityEvidenceAnchorKey, documentPathBase, id, router],
  );

  const shouldShowMembershipCard =
    membershipRequirement !== 'none' ||
    memberships.length > 0;
  const shouldShowProficiencyCard =
    !!proficiencyPolicyDef ||
    proficiencies.length > 0;
  const shouldShowActivityEvidenceCard =
    is518a && (!!activityEvidencePolicyDef || activityEvidenceItems.length > 0);

  const listData: RequirementListItem[] = React.useMemo(() => {
    if (!defs.length) return [];
    const rows: RequirementListItem[] = [];
    const groups = new Map<string, GroupedRequirementRow>();
    const defByKey = new Map<string, DocDefinition>();
    let supportingRowAdded = false;
    defs.forEach((d) => defByKey.set(d.key, d));

    const isMembershipCode = (def: DocDefinition) =>
      (def.__code ?? def.key ?? '').toUpperCase() === 'MEMBERSHIP';
    const isProficiencyCode = (def: DocDefinition) =>
      (def.__code ?? def.key ?? '').toUpperCase() === 'PROFICIENCY';
    const isActivityEvidenceCode = (def: DocDefinition) =>
      (def.__code ?? def.key ?? '').toUpperCase() === 'ACTIVITY_EVIDENCE';

    for (const def of defs) {
      const code = (def.__code ?? def.key ?? '').toUpperCase();
      const isSupportingCode = code.startsWith('SUPPORTING_STATEMENT');
      if (isMembershipCode(def)) {
        if (shouldShowMembershipCard) {
          rows.push({ type: 'membership', key: def.key, def });
        }
        continue;
      }
      if (isProficiencyCode(def)) {
        if (shouldShowProficiencyCard) {
          rows.push({ type: 'proficiency', key: def.key, def });
        }
        continue;
      }
      if (isActivityEvidenceCode(def)) {
        if (shouldShowActivityEvidenceCard) {
          rows.push({ type: 'activityEvidence', key: def.key, def });
        }
        continue;
      }
      if (isSupportingCode && supportingRowAdded) {
        continue;
      }

      const progress = progressItems.find((item) => item.key === def.key);
      if (!progress) continue;
      if (isSupportingCode) {
        supportingRowAdded = true;
      }
      const groupId = def.group;
      if (groupId) {
        let groupRow = groups.get(groupId);
        if (!groupRow) {
          groupRow = {
            type: 'group',
            key: `group::${groupId}`,
            title: def.groupDescription || def.group || def.label,
            groupId,
            items: [],
            helpSections: [],
          };
          groups.set(groupId, groupRow);
          rows.push(groupRow);
        }
        groupRow.items.push({ progress, def });
        groupRow.helpSections.push({ label: def.label, help: def.help, helpKey: def.helpKey });
      } else {
        rows.push({ type: 'single', key: progress.key, item: progress, def });
      }
    }

    if (shouldShowMembershipCard && !rows.some((r) => r.type === 'membership')) {
      const order = Number.isFinite(membershipPolicyDef?.displayOrder as number)
        ? (membershipPolicyDef?.displayOrder as number)
        : Number.POSITIVE_INFINITY;
      const row: RequirementListItem = {
        type: 'membership',
        key: membershipAnchorKey || 'MEMBERSHIP',
        def: {
          key: membershipAnchorKey || 'MEMBERSHIP',
          label: membershipPolicyDef?.label ?? 'Membership',
          help: membershipPolicyDef?.help,
          helpKey: membershipPolicyDef?.helpKey,
          kind: 'OTHER' as any,
          displayOrder: membershipPolicyDef?.displayOrder,
        },
      };
      const rowOrder = (r: RequirementListItem) => {
        if (r.type === 'membership') return order;
        if (r.type === 'single') {
          const d = defByKey.get(r.item.key);
          return Number.isFinite(d?.displayOrder as number) ? (d?.displayOrder as number) : Number.POSITIVE_INFINITY;
        }
        if (r.type === 'group') {
          const orders = r.items.map(({ def }) =>
            Number.isFinite(def.displayOrder as number) ? (def.displayOrder as number) : Number.POSITIVE_INFINITY
          );
          return orders.length ? Math.min(...orders) : Number.POSITIVE_INFINITY;
        }
        return Number.POSITIVE_INFINITY;
      };
      const insertAt = rows.findIndex((r) => rowOrder(r) > order);
      if (insertAt >= 0) {
        rows.splice(insertAt, 0, row);
      } else {
        rows.push(row);
      }
    }

    if (shouldShowProficiencyCard && !rows.some((r) => r.type === 'proficiency')) {
      const order = Number.isFinite(proficiencyPolicyDef?.displayOrder as number)
        ? (proficiencyPolicyDef?.displayOrder as number)
        : Number.POSITIVE_INFINITY;
      const row: RequirementListItem = {
        type: 'proficiency',
        key: proficiencyAnchorKey || 'PROFICIENCY',
        def: {
          key: proficiencyAnchorKey || 'PROFICIENCY',
          label: proficiencyPolicyDef?.label ?? 'Proficiency',
          help: proficiencyPolicyDef?.help,
          helpKey: proficiencyPolicyDef?.helpKey,
          kind: 'OTHER' as any,
          displayOrder: proficiencyPolicyDef?.displayOrder,
        },
      };
      const rowOrder = (r: RequirementListItem) => {
        if (r.type === 'membership') {
          return Number.isFinite(membershipPolicyDef?.displayOrder as number)
            ? (membershipPolicyDef?.displayOrder as number)
            : Number.POSITIVE_INFINITY;
        }
        if (r.type === 'proficiency') return order;
        if (r.type === 'single') {
          const d = defByKey.get(r.item.key);
          return Number.isFinite(d?.displayOrder as number) ? (d?.displayOrder as number) : Number.POSITIVE_INFINITY;
        }
        if (r.type === 'group') {
          const orders = r.items.map(({ def }) =>
            Number.isFinite(def.displayOrder as number) ? (def.displayOrder as number) : Number.POSITIVE_INFINITY
          );
          return orders.length ? Math.min(...orders) : Number.POSITIVE_INFINITY;
        }
        return Number.POSITIVE_INFINITY;
      };
      const insertAt = rows.findIndex((r) => rowOrder(r) > order);
      if (insertAt >= 0) {
        rows.splice(insertAt, 0, row);
      } else {
        rows.push(row);
      }
    }
    if (shouldShowActivityEvidenceCard && !rows.some((r) => r.type === 'activityEvidence')) {
      const order = Number.isFinite(activityEvidencePolicyDef?.displayOrder as number)
        ? (activityEvidencePolicyDef?.displayOrder as number)
        : Number.POSITIVE_INFINITY;
      const row: RequirementListItem = {
        type: 'activityEvidence',
        key: activityEvidenceAnchorKey || 'ACTIVITY_EVIDENCE',
        def: {
          key: activityEvidenceAnchorKey || 'ACTIVITY_EVIDENCE',
          label: activityEvidencePolicyDef?.label ?? 'Firearm activity evidence',
          help: activityEvidencePolicyDef?.help,
          helpKey: activityEvidencePolicyDef?.helpKey,
          kind: 'OTHER' as any,
          displayOrder: activityEvidencePolicyDef?.displayOrder,
        },
      };
      const rowOrder = (r: RequirementListItem) => {
        if (r.type === 'membership') {
          return Number.isFinite(membershipPolicyDef?.displayOrder as number)
            ? (membershipPolicyDef?.displayOrder as number)
            : Number.POSITIVE_INFINITY;
        }
        if (r.type === 'proficiency') {
          return Number.isFinite(proficiencyPolicyDef?.displayOrder as number)
            ? (proficiencyPolicyDef?.displayOrder as number)
            : Number.POSITIVE_INFINITY;
        }
        if (r.type === 'activityEvidence') return order;
        if (r.type === 'single') {
          const d = defByKey.get(r.item.key);
          return Number.isFinite(d?.displayOrder as number) ? (d?.displayOrder as number) : Number.POSITIVE_INFINITY;
        }
        if (r.type === 'group') {
          const orders = r.items.map(({ def }) =>
            Number.isFinite(def.displayOrder as number) ? (def.displayOrder as number) : Number.POSITIVE_INFINITY
          );
          return orders.length ? Math.min(...orders) : Number.POSITIVE_INFINITY;
        }
        return Number.POSITIVE_INFINITY;
      };
      const insertAt = rows.findIndex((r) => rowOrder(r) > order);
      if (insertAt >= 0) rows.splice(insertAt, 0, row);
      else rows.push(row);
    }

    const membershipIdx = rows.findIndex((r) => r.type === 'membership');
    const activityIdx = rows.findIndex((r) => r.type === 'activityEvidence');
    if (membershipIdx >= 0 && activityIdx >= 0 && activityIdx <= membershipIdx) {
      const [activityRow] = rows.splice(activityIdx, 1);
      rows.splice(membershipIdx + 1, 0, activityRow);
    }

    return rows;
  }, [defs, progressItems, shouldShowMembershipCard, shouldShowProficiencyCard, shouldShowActivityEvidenceCard, membershipAnchorKey, membershipPolicyDef, proficiencyAnchorKey, proficiencyPolicyDef, activityEvidenceAnchorKey, activityEvidencePolicyDef]);

  const supportingStatementsBySlot = useMemo(() => {
    const all = listByType<SupportingStatement>('SupportingStatement');
    const profileId = app?.applicantProfileId ? String(app.applicantProfileId) : '';
    const pool = profileId
      ? all.filter((statement) => String(statement.holderProfileId ?? '') === profileId)
      : all;

    const pickLatest = (items: SupportingStatement[]) =>
      items
        .slice()
        .sort((a, b) => {
          const ta = Date.parse(a.updatedAt || a.createdAt || '');
          const tb = Date.parse(b.updatedAt || b.createdAt || '');
          return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
        })[0];

    const map = new Map<SupportingStatementSlot, SupportingStatement>();
    SUPPORTING_SLOTS.forEach((slot) => {
      const bySlot = pool.filter((item) => item.slot === slot);
      const appLinked = app?.id
        ? bySlot.filter((item) => String(item.applicationId ?? '') === String(app.id))
        : [];
      const picked = pickLatest(appLinked) ?? pickLatest(bySlot);
      if (picked) {
        map.set(slot, picked);
      }
    });

    return map;
  }, [app?.applicantProfileId, app?.id, tick]);

  const draftSupportingStatements = useMemo(
    () =>
      SUPPORTING_SLOTS.map((slot) => supportingStatementsBySlot.get(slot))
        .filter((statement): statement is SupportingStatement => !!statement)
        .filter((statement) => statement.status === 'draft'),
    [supportingStatementsBySlot]
  );

  const hasDraftSupportingStatements = draftSupportingStatements.length > 0;
  const supportingStatementFreshness = useMemo(
    () => getSupportingStatementFreshness(Array.from(supportingStatementsBySlot.values())),
    [supportingStatementsBySlot],
  );
  const supportingCardConfigs: SupportingStatementCardConfig[] = useMemo(
    () => [
      { slot: 'spouse_family', title: 'Spouse / Family' },
      { slot: 'friend_colleague_neighbour', title: 'Friend / Colleague / Neighbour' },
      { slot: 'additional_reference', title: 'Additional Reference' },
    ],
    []
  );
  const ensureSupportingStatementForSlot = useCallback(
    (slot: SupportingStatementSlot) => {
      const existing = supportingStatementsBySlot.get(slot);
      if (existing) return existing;
      const holderProfileId = app?.applicantProfileId;
      if (!holderProfileId) {
        Alert.alert('Profile needed', 'Please add your profile details first.');
        return null;
      }
      const created = createSupportingStatement(String(holderProfileId), {
        slot,
        applicationId: app?.id,
      });
      persist(created as any);
      setTick((t) => t + 1);
      return created;
    },
    [app?.applicantProfileId, app?.id, supportingStatementsBySlot]
  );

  const openSupportingWizard = useCallback(
    (slot: SupportingStatementSlot) => {
      const statement = ensureSupportingStatementForSlot(slot);
      if (!statement) return;
      const updated = touch({
        ...statement,
        mode: 'wizard',
        applicationId: app?.id ?? statement.applicationId,
      } as SupportingStatement);
      persist(updated as any);
      setTick((t) => t + 1);

      const anchor = supportingAnchorKey || 'SUPPORTING_STATEMENT::app';
      const resolved = resolveWizardRoute('supportingStatement', 'documents', { id });
      const routeTo = resolved?.routeTo ?? '/supporting/wizard';
      const routeBack = resolved?.routeBack ?? documentPathWithAnchor(anchor);
      const navPayload = {
        routeBack,
        returnTo: routeBack,
        onComplete: routeBack,
        clearRouteBackHistory: resolved?.clearRouteBackHistory ?? false,
      };
      router.replace({
        pathname: routeTo as any,
        params: {
          statementId: updated.id,
          slot,
          nav: JSON.stringify(navPayload),
        },
      } as any);
    },
    [app?.id, documentPathWithAnchor, ensureSupportingStatementForSlot, id, router, supportingAnchorKey]
  );

  const openForm517Wizard = useCallback(() => {
    if (!app?.id || app.form !== '517') return;
    const { pathname, params } = buildDocumentsRoute({
      id: app.id,
      mode: modeNorm,
      nav: navCtx,
    });
    const returnPath = (() => {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return query ? `${pathname}?${query}` : pathname;
    })();
    router.push({
      pathname: '/new-application/517-wizard' as any,
      params: {
        id: app.id,
        returnTo: returnPath,
        flow: modeNorm === 'new' ? 'new' : 'existing',
        source: 'documents',
      },
    } as any);
  }, [app, modeNorm, navCtx, router]);

  const clearSupportingStatement = useCallback(
    async (slot: SupportingStatementSlot) => {
      const statement = ensureSupportingStatementForSlot(slot);
      if (!statement) return;
      const linkedDoc = statement.documentId ? getById<Document>(String(statement.documentId)) : undefined;
      if (linkedDoc) {
        try {
          if (linkedDoc.uri) await deleteOwnedDocFile(linkedDoc.uri);
        } catch {
          // ignore cleanup failures
        }
        deleteEntity(linkedDoc.id);
      }
      const cleared = touch({
        ...statement,
        status: 'empty',
        mode: undefined,
        wizardData: undefined,
        generatedText: undefined,
        documentId: undefined,
      } as SupportingStatement);
      persist(cleared as any);
      setTick((t) => t + 1);
    },
    [ensureSupportingStatementForSlot]
  );

  // reset anchor scroll guard when anchor/scroll changes
  React.useEffect(() => {
    anchorScrollHandledRef.current = false;
  }, [targetAnchor]);

  useFocusEffect(
    React.useCallback(() => {
      if (targetAnchor) {
        anchorScrollHandledRef.current = false;
      }
    }, [targetAnchor])
  );

  const scrollToDeclarationsCard = useCallback(() => {
    const footerHeight = declarationsFooterHeightRef.current;
    const contentHeight = listContentHeightRef.current;
    const headerHeight = headerHeightRef.current;
    const offset =
      contentHeight > 0 && footerHeight > 0
        ? contentHeight - footerHeight - headerHeight - 0
        : null;
    if (offset != null && Number.isFinite(offset)) {
      try {
        flatListRef.current?.scrollToOffset({
          offset: Math.max(0, offset),
          animated: true,
        });
        return;
      } catch {
        // ignore and fall back to scrollToEnd
      }
    }
    try {
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch {
      // ignore; list may not be laid out yet
    }
  }, []);

  // Scroll to anchored card when returning via anchor/scroll param (once)
  React.useEffect(() => {
    const target = targetAnchor;
    if (!target) return;
    if (anchorScrollHandledRef.current) return;
    if (target === DECLARATIONS_ANCHOR) {
      const timer = setTimeout(() => {
        scrollToDeclarationsCard();
        anchorScrollHandledRef.current = true;
      }, 300);
      return () => clearTimeout(timer);
    }
    const idx = listData.findIndex((item) => {
      if (item.type === 'single') return item.item.key === target;
      if (item.type === 'group') return item.items.some(({ progress }) => progress.key === target);
      if (item.type === 'membership') return item.key === target;
      if (item.type === 'proficiency') return item.key === target;
      if (item.type === 'activityEvidence') return item.key === target;
      return false;
    });
    if (idx >= 0) {
      const scroll = () => {
        try {
          flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
          anchorScrollHandledRef.current = true;
        } catch (e) {
          // ignore failures; list may not be laid out yet
        }
      };
      const timer = setTimeout(scroll, 300);
      return () => clearTimeout(timer);
    }
  }, [targetAnchor, listData, flatListRef, scrollToDeclarationsCard]);

  const syncLinkedDocsIntoProgress = React.useCallback(() => {
    const updated = progressItems.map((item) =>
      normalizeCapturedStatus(
        ensureFirearmInstances(ensureSafeInstances(ensureCompetencyInstances(item)))
      )
    );
    persistLatestAppWithDocs((latest) => ({
      next: { ...latest } as Application,
      docItems: updated,
    }));
  }, [progressItems, ensureFirearmInstances, ensureSafeInstances, ensureCompetencyInstances, normalizeCapturedStatus, persistLatestAppWithDocs]);

  const toggleAcknowledgement = React.useCallback(
    (ack?: NormalizedAcknowledgement) => {
      if (!ack) return;
      const code = ack.code ? String(ack.code).toUpperCase() : undefined;
      if (!code) return;
      userChangedRef.current = true;
      persistLatestAppWithDocs((latest) => {
        const nextDeclarations = new Set<string>(
          Array.isArray(latest.declarations)
            ? latest.declarations.map((value) => String(value).toUpperCase())
            : []
        );
        if (nextDeclarations.has(code)) {
          nextDeclarations.delete(code);
        } else {
          nextDeclarations.add(code);
        }
        const next = {
          ...latest,
          declarations: Array.from(nextDeclarations),
        } as Application;
        return { next };
      });
    },
    [persistLatestAppWithDocs],
  );

  const ensureCapturedStatusForAllDocs = React.useCallback(() => {
    const updated = progressItems.map((item) => {
      if (item.multiple || item.allowMultipleUploads) {
        const instances = (item.instances ?? []).map((inst) => {
          if (!inst.documentId) return inst;
          if (inst.status === 'verified' || inst.status === 'extracted') return inst;
          return { ...inst, status: 'captured' as const };
        });
        return {
          ...item,
          instances,
          status: deriveMultiInstanceStatus(item, instances as NonNullable<DocItemProgress['instances']>),
        };
      }
      if (item.documentId && item.status !== 'verified' && item.status !== 'extracted') {
        return { ...item, status: 'captured' as const };
      }
      return item;
    });
    persistLatestAppWithDocs((latest) => ({
      next: { ...latest } as Application,
      docItems: updated,
    }));
  }, [progressItems, persistLatestAppWithDocs]);

  const shouldBypassValidation = devModeEnabled;

  const appForValidation = React.useMemo(() => {
    if (!app) return null;
    const nextCompetencyIds = normalizeIdList(effectiveCertificateIds);
    const nextFirearmIds = normalizeIdList(activeFirearmIds);
    const nextSafeIds = normalizeIdList(effectiveSafeIds);
    const nextMembershipIds = normalizeIdList(effectiveMembershipIds);
    const nextProficiencyIds = normalizeIdList(effectiveProficiencyIds);

    const currentCompetencyIds = normalizeIdList(
      Array.isArray(app.competencyCertificateIds) ? app.competencyCertificateIds : []
    );
    const currentFirearmIds = normalizeIdList(
      Array.isArray(app.selectedFirearmIds) ? app.selectedFirearmIds : []
    );
    const currentSafeIds = normalizeIdList(Array.isArray(app.safeIds) ? app.safeIds : []);
    const currentMembershipIds = normalizeIdList(Array.isArray(app.membershipIds) ? app.membershipIds : []);
    const currentProficiencyIds = normalizeIdList(Array.isArray(app.proficiencyIds) ? app.proficiencyIds : []);

    const sameCompetency = currentCompetencyIds.join('|') === nextCompetencyIds.join('|');
    const sameFirearms = currentFirearmIds.join('|') === nextFirearmIds.join('|');
    const sameSafes = currentSafeIds.join('|') === nextSafeIds.join('|');
    const sameMemberships = currentMembershipIds.join('|') === nextMembershipIds.join('|');
    const sameProficiencies = currentProficiencyIds.join('|') === nextProficiencyIds.join('|');

    if (sameCompetency && sameFirearms && sameSafes && sameMemberships && sameProficiencies) {
      return app;
    }

    return {
      ...app,
      competencyCertificateIds: nextCompetencyIds,
      selectedFirearmIds: nextFirearmIds,
      safeIds: nextSafeIds,
      membershipIds: nextMembershipIds,
      proficiencyIds: nextProficiencyIds,
    } as Application;
  }, [
    activeFirearmIds,
    app,
    effectiveCertificateIds,
    effectiveMembershipIds,
    effectiveProficiencyIds,
    effectiveSafeIds,
  ]);

  const readiness = React.useMemo(() => {
    if (!appForValidation) return { ready: false };
    const nextDocState = buildDocState(appForValidation, progressItems);
    const nextApp = nextDocState
      ? ({ ...appForValidation, docs: nextDocState } as Application)
      : appForValidation;
    const membershipStatusForValidation = computeMembershipStatus(nextApp, { devModeEnabled });
    return computeDocumentReadiness({
      application: nextApp,
      acknowledgementItems,
      membershipRequirement: membershipRequirement === 'required' ? 'required' : membershipRequirement === 'optional' ? 'optional' : 'hidden',
      membershipStatus: membershipStatusForValidation,
      shouldBypassValidation,
    });
  }, [
    acknowledgementItems,
    appForValidation,
    buildDocState,
    devModeEnabled,
    membershipRequirement,
    progressItems,
    shouldBypassValidation,
  ]);

  const listOrderByAnchor = useMemo(() => {
    const map = new Map<string, number>();
    listData.forEach((row, idx) => {
      if (row.type === 'single') {
        map.set(row.item.key, idx);
        return;
      }
      if (row.type === 'group') {
        row.items.forEach(({ progress }) => map.set(progress.key, idx));
        return;
      }
      if (row.type === 'membership') {
        map.set(row.key, idx);
        return;
      }
      if (row.type === 'proficiency') {
        map.set(row.key, idx);
        return;
      }
      if (row.type === 'activityEvidence') {
        map.set(row.key, idx);
      }
    });
    map.set(DECLARATIONS_ANCHOR, listData.length + 1);
    return map;
  }, [listData]);

  const issueMap = useMemo(() => {
    const byAnchor = new Map<string, DocumentSectionIssue[]>();
    const addIssue = (issue: DocumentSectionIssue) => {
      const bucketKey = issue.anchor || '__global__';
      if (!byAnchor.has(bucketKey)) byAnchor.set(bucketKey, []);
      byAnchor.get(bucketKey)!.push(issue);
    };

    const missingItems = parseMissingItems(readiness.message);
    const missingAnchorByLabel = new Map<string, string>();
    defs.forEach((def) => {
      missingAnchorByLabel.set(normalizeMissingItem(def.label), def.key);
      if (def.label2) {
        missingAnchorByLabel.set(normalizeMissingItem(def.label2), def.key);
      }
    });
    if (firearmAnchorKey) {
      missingAnchorByLabel.set(normalizeMissingItem('Select at least one firearm'), firearmAnchorKey);
    }
    if (competencyAnchorKey) {
      missingAnchorByLabel.set(
        normalizeMissingItem('Select at least one competency certificate'),
        competencyAnchorKey
      );
    }
    if (membershipAnchorKey) {
      missingAnchorByLabel.set(
        normalizeMissingItem('Firearm association membership'),
        membershipAnchorKey
      );
    }
    if (supportingAnchorKey) {
      missingAnchorByLabel.set(normalizeMissingItem(MISSING_SUPPORTING_STATEMENT), supportingAnchorKey);
    }
    const form517AnchorKey = defs.find(
      (def) => (def.__code ?? def.key ?? '').toUpperCase() === 'SAPS_517_FORM'
    )?.key;
    if (form517AnchorKey) {
      missingAnchorByLabel.set(normalizeMissingItem('Required SAPS 517 info'), form517AnchorKey);
    }
    if (proofOfAddressAnchorKey) {
      missingAnchorByLabel.set(normalizeMissingItem('Proof of address'), proofOfAddressAnchorKey);
    }
    missingAnchorByLabel.set(normalizeMissingItem('Complete declarations section'), DECLARATIONS_ANCHOR);

    missingItems.forEach((item) => {
      const normalized = normalizeMissingItem(item);
      let anchor =
        missingAnchorByLabel.get(normalized) ??
        readiness.anchor ??
        undefined;
      if (!anchor && proficiencyAnchorKey) {
        const lower = normalized.toLowerCase();
        if (
          lower.includes('handle and use results') ||
          lower.includes('knowledge of the firearms control') ||
          lower.includes('statement of results')
        ) {
          anchor = proficiencyAnchorKey;
        }
      }
      addIssue({
        key: `missing:${normalized}`,
        severity: 'missing',
        title: 'Missing document',
        message: item,
        anchor,
      });
    });

    if (hasDraftSupportingStatements && supportingAnchorKey) {
      addIssue({
        key: 'missing:draft_supporting',
        severity: 'missing',
        title: 'Missing document',
        message: MISSING_SUPPORTING_STATEMENT,
        anchor: supportingAnchorKey,
      });
    }

    const submittedState = buildSubmittedApplicationWarningIssues({
      form: app?.form ?? (app as any)?.type,
      selectedFirearms,
      selectedCertificates,
      firearmAnchor: firearmAnchorKey,
      competencyAnchor: competencyAnchorKey,
    });
    submittedState.issues.forEach(addIssue);

    const hasExpiredFirearm =
      is518a &&
      !submittedState.hasSubmittedFirearm &&
      selectedFirearms.some((firearm) => isExpired(firearm.validTo));
    const hasExpiredCompetency =
      !submittedState.hasSubmittedCompetency &&
      selectedCertificates.some((cert) => isExpired(cert.expiresAt));
    const expiredMessage = buildExpiredSelectionWarningCopy({
      hasExpiredFirearm,
      hasExpiredCompetency,
    });
    if (expiredMessage && hasExpiredFirearm && firearmAnchorKey) {
      addIssue({
        key: hasExpiredCompetency ? 'warning:expired_items' : 'warning:expired_firearm',
        severity: 'warning',
        title: 'Warning',
        message: expiredMessage,
        anchor: firearmAnchorKey,
      });
    }
    if (expiredMessage && hasExpiredCompetency && competencyAnchorKey) {
      addIssue({
        key: hasExpiredFirearm ? 'warning:expired_items' : 'warning:expired_competency',
        severity: 'warning',
        title: 'Warning',
        message: expiredMessage,
        anchor: competencyAnchorKey,
      });
    }

    if (is518a) {
      buildSectionLimitWarningIssues({
        rule: firearmPolicyRule,
        selectedFirearms,
        firearmAnchor: firearmAnchorKey,
      }).forEach(addIssue);
    }
    if (proofOfAddressFreshness.status === 'warning' && proofOfAddressAnchorKey) {
      addIssue({
        key: 'warning:proof_of_address_age',
        severity: 'warning',
        title: 'Warning',
        message: `Your proof of address date is more than ${appConfig.documentFreshness.proofOfAddress.warningAgeDays} days old. Upload a newer document before it reaches ${appConfig.documentFreshness.proofOfAddress.expiryAgeDays} days.`,
        anchor: proofOfAddressAnchorKey,
      });
    }

    const membershipSubmissionMessage = buildMembershipSubmissionWarningCopy(membershipSubmissionValidity);
    if (membershipSubmissionMessage && membershipAnchorKey) {
      addIssue({
        key:
          membershipSubmissionValidity.status === 'expired'
            ? 'warning:membership_expired'
            : 'warning:membership_submission_window',
        severity: 'warning',
        title: 'Warning',
        message: membershipSubmissionMessage,
        anchor: membershipAnchorKey,
      });
    }
    const membershipDocumentMessage = buildMembershipDocumentFreshnessCopy(membershipDocumentFreshness);
    if (membershipDocumentMessage && membershipAnchorKey) {
      addIssue({
        key:
          membershipDocumentFreshness.status === 'expired'
            ? 'warning:membership_document_expired'
            : 'warning:membership_document_window',
        severity: 'warning',
        title: 'Warning',
        message: membershipDocumentMessage,
        anchor: membershipAnchorKey,
      });
    }
    const supportingStatementMessage = buildSupportingStatementFreshnessCopy(supportingStatementFreshness);
    if (supportingStatementMessage && supportingAnchorKey) {
      addIssue({
        key:
          supportingStatementFreshness.status === 'expired'
            ? 'warning:supporting_statement_expired'
            : 'warning:supporting_statement_window',
        severity: 'warning',
        title: 'Warning',
        message: supportingStatementMessage,
        anchor: supportingAnchorKey,
      });
    }
    const linkedMotivation = app ? resolveApplicationMotivation(app) : null;
    const motivationSource = app?.motivationSource ?? linkedMotivation?.source;
    const motivationWizardStatus = linkedMotivation?.wizardStatus ?? app?.motivationWizardStatus;
    if (motivationSource === 'wizard' && motivationWizardStatus === 'draft' && motivationAnchorKey) {
      addIssue({
        key: 'warning:motivation_wizard_draft',
        severity: 'warning',
        title: 'Warning',
        message: 'Your motivation wizard is still in draft. Complete all required wizard steps and close the wizard to finalize it.',
        anchor: motivationAnchorKey,
      });
    }

    return byAnchor;
  }, [
    app?.motivationSource,
    app?.motivationWizardStatus,
    app?.form,
    competencyAnchorKey,
    defs,
    firearmAnchorKey,
    firearmPolicyRule,
    hasDraftSupportingStatements,
    is517FormWizardReady,
    is518a,
    membershipAnchorKey,
    motivationAnchorKey,
    membershipDocumentFreshness,
    membershipSubmissionValidity,
    proofOfAddressAnchorKey,
    proofOfAddressFreshness.status,
    readiness.anchor,
    readiness.message,
    selectedCertificates,
    selectedFirearms,
    supportingStatementFreshness,
    supportingAnchorKey,
  ]);

  const submissionIssues = useMemo(() => {
    const byKey = new Map<string, DocumentSectionIssue>();
    issueMap.forEach((items) =>
      items.forEach((item) => {
        if (!byKey.has(item.key)) byKey.set(item.key, item);
      })
    );
    return Array.from(byKey.values()).sort((a, b) => {
      const aOrder =
        a.anchor && listOrderByAnchor.has(a.anchor)
          ? (listOrderByAnchor.get(a.anchor) as number)
          : Number.POSITIVE_INFINITY;
      const bOrder =
        b.anchor && listOrderByAnchor.has(b.anchor)
          ? (listOrderByAnchor.get(b.anchor) as number)
          : Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.severity !== b.severity) return a.severity === 'missing' ? -1 : 1;
      return a.message.localeCompare(b.message);
    });
  }, [issueMap, listOrderByAnchor]);

  const hasSectionCountLimitIssue = useMemo(
    () =>
      submissionIssues.some(
        (issue) => issue.key === 'warning:section13_limit' || issue.key === 'warning:section15_limit'
      ),
    [submissionIssues]
  );

  const submitReady =
    readiness.ready &&
    is517FormWizardReady &&
    !hasDraftSupportingStatements &&
    !hasSectionCountLimitIssue;

  const hasExpiredIssue = useCallback(
    (issue: DocumentSectionIssue) =>
      issue.key.includes('expired'),
    [],
  );

  const issuePillForAnchor = useCallback(
    (anchor?: string): DocumentIssuePill | undefined => {
      if (!showIssuePills) return undefined;
      if (!anchor) return undefined;
      let issues = issueMap.get(anchor) ?? [];
      const anchorUpper = String(anchor).toUpperCase();
      const isProficiencyCardAnchor =
        anchorUpper === String(proficiencyAnchorKey ?? '').toUpperCase() ||
        anchorUpper === 'PROFICIENCY';
      if (isProficiencyCardAnchor) {
        const proficiencyIssues: DocumentSectionIssue[] = [];
        issueMap.forEach((bucket, key) => {
          const keyUpper = String(key).toUpperCase();
          if (
            keyUpper === 'PROFICIENCY' ||
            keyUpper.startsWith('PROFICIENCY_') ||
            keyUpper === 'STATEMENT_OF_RESULTS' ||
            keyUpper.startsWith('STATEMENT_OF_RESULTS_') ||
            keyUpper === String(proficiencyAnchorKey ?? '').toUpperCase()
          ) {
            proficiencyIssues.push(...bucket);
          }
        });
        if (proficiencyIssues.length) issues = proficiencyIssues;
      }
      if (!issues?.length) return undefined;
      const hasMissing = issues.some((issue) => issue.severity === 'missing');
      if (hasMissing) {
        return { label: 'Missing information', type: 'missing' };
      }
      const hasExpired = issues.some(hasExpiredIssue);
      if (hasExpired) {
        return { label: 'Expired document', type: 'expired' };
      }
      return { label: 'Warning', type: 'warning' };
    },
    [hasExpiredIssue, issueMap, proficiencyAnchorKey, showIssuePills]
  );

  const issuePillForKeys = useCallback(
    (keys: string[]): DocumentIssuePill | undefined => {
      if (!showIssuePills) return undefined;
      const hasMissing = keys.some((key) =>
        (issueMap.get(key) ?? []).some((issue) => issue.severity === 'missing')
      );
      if (hasMissing) return { label: 'Missing document', type: 'missing' };
      const hasExpired = keys.some((key) =>
        (issueMap.get(key) ?? []).some(hasExpiredIssue)
      );
      if (hasExpired) return { label: 'Expired document', type: 'expired' };
      const hasWarning = keys.some((key) =>
        (issueMap.get(key) ?? []).some((issue) => issue.severity === 'warning')
      );
      if (hasWarning) return { label: 'Warning', type: 'warning' };
      return undefined;
    },
    [hasExpiredIssue, issueMap, showIssuePills]
  );

  const acknowledgementCard = React.useMemo(() => {
    if (!acknowledgementItems.length) return null;
    const selectedCount = acknowledgementItems.filter((ack) => ack.checked).length;
    const status = selectedCount === acknowledgementItems.length
      ? `All ${acknowledgementItems.length} required confirmations selected`
      : selectedCount
        ? `${selectedCount} confirmation${selectedCount === 1 ? '' : 's'} selected`
        : 'Tap a card to confirm';
    const items = acknowledgementItems.map((ack) => ({
      key: ack.key,
      heading: ack.heading,
      text: ack.text,
      selected: ack.checked,
      onToggle: () => toggleAcknowledgement(ack),
    }));
    return (
      <ConfirmationCard
        items={items}
        status={status}
        style={styles.footerCard}
        issuePill={issuePillForAnchor(DECLARATIONS_ANCHOR)}
        collapseOnLoadWhenComplete
      />
    );
  }, [acknowledgementItems, issuePillForAnchor, toggleAcknowledgement]);

  const hasCaptured = (item: DocItemProgress) => {
    if (item.requiredUpload === false) {
      return !!item.acknowledged;
    }
    return hasCapturedUpload(item);
  };

  const describeStatus = (item: DocItemProgress) => {
    if (isIdentityDocItem(item)) return formatIdentityStatus(item);
    return getCardStatus(item);
  };

  const showGroupHelp = React.useCallback(
    (group: GroupedRequirementRow) => {
      const helpWithKey = group.helpSections.find(
        (section) => section.helpKey && section.helpKey.trim().length > 0,
      );
      if (helpWithKey?.helpKey) {
        openHelp(helpWithKey.helpKey.trim());
        return;
      }
      openHelp('helpDocsGeneralUpload');
    },
    [openHelp],
  );

  const showRequirementHelp = React.useCallback(
    (def: DocDefinition) => {
      const trimmedKey = def.helpKey?.trim();
      if (trimmedKey) {
        openHelp(trimmedKey);
        return;
      }
      openHelp('helpDocsGeneralUpload');
    },
    [openHelp],
  );

  const membershipCard = React.useMemo(() => {
    if (!shouldShowMembershipCard) return null;
    const isRequired = membershipRequirement === 'required';
    const statusText =
      isRequired
        ? membershipStatus.requirementSatisfied
          ? 'Captured'
          : 'Pending'
        : membershipStatus.requirementSatisfied
          ? 'Captured (optional)'
          : 'Optional';
    const statusColor = membershipStatus.requirementSatisfied
      ? tones.green.base
      : isRequired
        ? tones.blue.base
        : neutral.base;
    const membershipSelectionMismatch =
      is518a && memberships.length > 0 && effectiveMembershipIds.length !== memberships.length;
    return (
      <SafeSelectionCard
        parentType="Membership"
        cardTitle="Memberships"
        cardStatus={statusText}
        cardStatusColor={statusColor}
        items={memberships}
        selectedIds={effectiveMembershipIds}
        unselectedTone={unselectedMiniTone}
        onToggleItem={(itemId) => toggleMembershipSelection(String(itemId))}
        onPreviewItem={(item) => goMembershipWizard(String(item.id), { push: true })}
        onAdd={() => goMembershipWizard(undefined, { push: true })}
        formatHeading={(item) => (item as Membership).associationName?.trim() || 'Membership'}
        formatMeta={(item) => membershipMeta(item as Membership)}
        getItemVisual={(item) => {
          const membership = item as Membership;
          const health = getMembershipHealth(membership);
          if (health.status === 'warning') {
            return { label: 'Missing info', color: 'orange' as const };
          }
          return getReminderVisualState('membership', membership.membershipExpiresAt);
        }}
        helperText={
          membershipSelectionMismatch
            ? 'Note: Including all memberships may strengthen your application.'
            : !is518a
              ? 'Note: endorsements are not included for competency certificate applications.'
              : undefined
        }
        helperTextColor={membershipSelectionMismatch ? tones.orange.base : undefined}
        style={styles.card}
        issuePill={issuePillForAnchor(membershipAnchorKey || 'MEMBERSHIP')}
        onHelp={() =>
          showRequirementHelp({
            key: membershipAnchorKey || 'MEMBERSHIP',
            label: membershipHelpDef.label,
            help: membershipHelpDef.help,
            helpKey: membershipHelpDef.helpKey,
            kind: 'OTHER' as any,
          })
        }
      />
    );
  }, [
    membershipRequirement,
    membershipStatus.requirementSatisfied,
    memberships,
    effectiveMembershipIds,
    toggleMembershipSelection,
    membershipMeta,
    is518a,
    memberships.length,
    membershipAnchorKey,
    membershipHelpDef.help,
    membershipHelpDef.helpKey,
    membershipHelpDef.label,
    issuePillForAnchor,
    showRequirementHelp,
    shouldShowMembershipCard,
    goMembershipWizard,
  ]);

  const proficiencyCard = React.useMemo(() => {
    if (!shouldShowProficiencyCard) return null;
    const isRequired = proficiencyRequirement === 'required';
    const hasAnySelectedDocs = selectedProficiencyDocs.length > 0;
    const proficiencySelectionMismatch =
      proficiencies.length > 0 && effectiveProficiencyIds.length !== proficiencies.length;
    const statusText = isRequired
      ? (hasAnySelectedDocs ? 'Captured' : 'Pending')
      : (hasAnySelectedDocs ? 'Captured (optional)' : 'Optional');
    const statusColor = hasAnySelectedDocs
      ? tones.green.base
      : isRequired
        ? tones.blue.base
        : neutral.base;
    const subtitle = isRequired
      ? 'Required for this application. Select and capture the relevant proficiency evidence.'
      : "This is generally not required as your competency certificate covers it. Check with your local DFO if you're unsure whether to include it.";
    return (
      <SafeSelectionCard
        parentType="Proficiency"
        cardTitle="Proficiencies"
        subtitle={subtitle}
        cardStatus={statusText}
        cardStatusColor={statusColor}
        items={proficiencies as any}
        selectedIds={effectiveProficiencyIds}
        unselectedTone={unselectedMiniTone}
        onToggleItem={(itemId) => toggleProficiencySelection(String(itemId))}
        onPreviewItem={(item) => goProficiencyWizard(String(item.id), { push: true })}
        onPressItem={(item) => goProficiencyWizard(String(item.id), { push: true })}
        onAdd={() => goProficiencyWizard(undefined, { push: true })}
        formatHeading={(item) => (item as Proficiency).trainingProviderName?.trim() || 'Proficiency'}
        formatMeta={(item) => proficiencyMeta(item as Proficiency)}
        helperText={
          proficiencySelectionMismatch
            ? 'Note: Including all proficiencies may strengthen your application.'
            : undefined
        }
        helperTextColor={proficiencySelectionMismatch ? tones.orange.base : undefined}
        style={styles.card}
        issuePill={issuePillForAnchor(proficiencyAnchorKey || 'PROFICIENCY')}
        onHelp={() =>
          showRequirementHelp({
            key: proficiencyAnchorKey || 'PROFICIENCY',
            label: proficiencyHelpDef.label,
            help: proficiencyHelpDef.help,
            helpKey: proficiencyHelpDef.helpKey,
            kind: 'OTHER' as any,
          })
        }
      />
    );
  }, [
    effectiveProficiencyIds,
    goProficiencyWizard,
    issuePillForAnchor,
    proficiencyRequirement,
    proficiencyAnchorKey,
    proficiencyHelpDef.help,
    proficiencyHelpDef.helpKey,
    proficiencyHelpDef.label,
    proficiencyMeta,
    proficiencies,
    proficiencies.length,
    selectedProficiencyDocs.length,
    shouldShowProficiencyCard,
    showRequirementHelp,
    toggleProficiencySelection,
    tones.green.base,
    neutral.base,
    unselectedMiniTone,
  ]);

  const activityEvidenceCard = React.useMemo(() => {
    if (!shouldShowActivityEvidenceCard) return null;
    const selectedSet = new Set(effectiveActivityEvidenceIds.map(String));
    const cards: Array<{ type: ActivityEvidence['evidenceType']; title: string }> = [
      { type: 'HUNTING', title: 'Hunting evidence' },
      { type: 'SPORT_SHOOTING', title: 'Sport shooting evidence' },
    ];
    const showStrengthHint = selectedSet.size < cards.length;
    const statusText = selectedSet.size > 0 ? 'Captured (optional)' : 'Optional';
    const statusColor = selectedSet.size > 0 ? tones.green.base : neutral.base;
    return (
      <DocumentActionCard
        title={activityEvidenceHelpDef.label}
        subtitle="Optional: include hunting and/or sport shooting photos that support your motivation."
        status={statusText}
        statusColor={statusColor}
        issuePill={issuePillForAnchor(activityEvidenceAnchorKey || 'ACTIVITY_EVIDENCE')}
        actions={[]}
        style={styles.card}
        onHelp={() =>
          showRequirementHelp({
            key: activityEvidenceAnchorKey || 'ACTIVITY_EVIDENCE',
            label: activityEvidenceHelpDef.label,
            help: activityEvidenceHelpDef.help,
            helpKey: activityEvidenceHelpDef.helpKey,
            kind: 'OTHER' as any,
          })
        }
      >
        <View style={styles.groupList}>
          {cards.map((card) => {
            const entity = activityEvidenceItems.find((item) => item.evidenceType === card.type) ?? null;
            const itemId = entity?.id ? String(entity.id) : '';
            const selected = !!itemId && selectedSet.has(itemId);
            const photoCount = entity?.photos?.length ?? 0;
            return (
              <Pressable
                key={card.type}
                onPress={() => {
                  if (itemId) toggleActivityEvidenceSelection(itemId);
                }}
                style={({ pressed }) => [
                  styles.targetCardBase,
                  selected
                    ? styles.targetCardProfile
                    : {
                        backgroundColor: unselectedMiniTone.background,
                        borderColor: unselectedMiniTone.border,
                      },
                  styles.activityEvidenceItem,
                  pressed ? styles.groupRowPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.activityEvidenceTop}>
                  <View style={styles.groupLabelCol}>
                    <Text style={styles.groupLabel}>{card.title}</Text>
                    <Text style={styles.groupStatus}>{`Photos: ${photoCount}`}</Text>
                  </View>
                  <View style={[styles.activityCheck, selected ? styles.activityCheckActive : styles.activityCheckIdle]}>
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color={tones.teal.onBase} />
                    ) : null}
                  </View>
                </View>
                <View style={styles.activityEvidenceActions}>
                  <View />
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      goActivityEvidenceWizard(card.type, entity?.id, { push: true });
                    }}
                    style={({ pressed }) => [
                      styles.activityViewButton,
                      pressed ? styles.groupRowPressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${card.title}`}
                  >
                    <Ionicons name="eye-outline" size={18} color={tones.blue.onBase} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
        {showStrengthHint ? (
          <Text style={styles.activityEvidenceHint}>
            Note: Including activity evidence may strengthen your application.
          </Text>
        ) : null}
      </DocumentActionCard>
    );
  }, [
    activityEvidenceAnchorKey,
    activityEvidenceHelpDef.help,
    activityEvidenceHelpDef.helpKey,
    activityEvidenceHelpDef.label,
    activityEvidenceItems,
    effectiveActivityEvidenceIds,
    goActivityEvidenceWizard,
    issuePillForAnchor,
    neutral.base,
    shouldShowActivityEvidenceCard,
    showRequirementHelp,
    styles.card,
    styles.activityEvidenceActions,
    styles.activityEvidenceItem,
    styles.activityEvidenceHint,
    styles.activityEvidenceTop,
    styles.activityCheck,
    styles.activityCheckActive,
    styles.activityCheckIdle,
    styles.activityViewButton,
    styles.groupLabel,
    styles.groupLabelCol,
    styles.groupList,
    styles.groupRowPressed,
    styles.groupStatus,
    styles.targetCardBase,
    styles.targetCardProfile,
    toggleActivityEvidenceSelection,
    unselectedMiniTone.background,
    unselectedMiniTone.border,
    tones.blue.onBase,
    tones.orange.base,
    tones.green.base,
    tones.teal.onBase,
  ]);

  const markApplicationReady = React.useCallback(() => {
    if (!app) return;
    let next = app as Application;
    let changed = false;

    if (!Array.isArray(next.competencyCertificateIds) || next.competencyCertificateIds.length === 0) {
      if (effectiveCertificateIds.length) {
        next = { ...next, competencyCertificateIds: Array.from(new Set(effectiveCertificateIds)) };
        changed = true;
      }
    }
    if (!Array.isArray(next.selectedFirearmIds) || next.selectedFirearmIds.length === 0) {
      if (activeFirearmIds.length) {
        next = { ...next, selectedFirearmIds: Array.from(new Set(activeFirearmIds)) };
        changed = true;
      }
    }
    if (!Array.isArray(next.safeIds) || next.safeIds.length === 0) {
      if (effectiveSafeIds.length) {
        next = { ...next, safeIds: Array.from(new Set(effectiveSafeIds)) };
        changed = true;
      }
    }
    const nextMembershipIds = Array.from(new Set(effectiveMembershipIds.map(String)));
    const currentMembershipIds = Array.isArray(next.membershipIds) ? next.membershipIds.map(String) : [];
    if (!Array.isArray(next.membershipIds) || currentMembershipIds.join('|') !== nextMembershipIds.join('|')) {
      next = { ...next, membershipIds: nextMembershipIds };
      changed = true;
    }
    const nextProficiencyIds = Array.from(new Set(effectiveProficiencyIds.map(String)));
    const currentProficiencyIds = Array.isArray(next.proficiencyIds) ? next.proficiencyIds.map(String) : [];
    if (!Array.isArray(next.proficiencyIds) || currentProficiencyIds.join('|') !== nextProficiencyIds.join('|')) {
      next = { ...next, proficiencyIds: nextProficiencyIds };
      changed = true;
    }
    const nextActivityEvidenceIds = Array.from(new Set(effectiveActivityEvidenceIds.map(String)));
    const currentActivityEvidenceIds = Array.isArray(next.activityEvidenceIds) ? next.activityEvidenceIds.map(String) : [];
    if (!Array.isArray(next.activityEvidenceIds) || currentActivityEvidenceIds.join('|') !== nextActivityEvidenceIds.join('|')) {
      next = { ...next, activityEvidenceIds: nextActivityEvidenceIds };
      changed = true;
    }

    const nextDeclarations = acknowledgementItems
      .filter((ack) => ack.checked && ack.code)
      .map((ack) => String(ack.code).toUpperCase());
    const currentDeclarations = Array.isArray(next.declarations)
      ? next.declarations.map((value) => String(value).toUpperCase())
      : [];
    if (currentDeclarations.join('|') !== nextDeclarations.join('|')) {
      next = { ...next, declarations: nextDeclarations };
      changed = true;
    }

    const expiredCompetencyIds = selectedCertificates
      .filter((cert) => isExpired(cert.expiresAt))
      .map((cert) => String(cert.id))
      .filter(Boolean);
    const nextExpiredCompetencies = Array.from(new Set(expiredCompetencyIds));
    const currentExpiredCompetencies = Array.isArray(next.includesExpiredCompetencies)
      ? next.includesExpiredCompetencies.map(String)
      : [];
    if (currentExpiredCompetencies.join('|') !== nextExpiredCompetencies.join('|')) {
      next = { ...next, includesExpiredCompetencies: nextExpiredCompetencies };
      changed = true;
    }

    const expiredFirearmIds = selectedFirearms
      .filter((firearm) => isExpired(firearm.validTo))
      .map((firearm) => String(firearm.id))
      .filter(Boolean);
    const nextExpiredLicences = Array.from(new Set(expiredFirearmIds));
    const currentExpiredLicences = Array.isArray(next.includesExpiredLicences)
      ? next.includesExpiredLicences.map(String)
      : [];
    if (currentExpiredLicences.join('|') !== nextExpiredLicences.join('|')) {
      next = { ...next, includesExpiredLicences: nextExpiredLicences };
      changed = true;
    }

    if (next.status !== 'ready') {
      next = { ...next, status: 'ready' } as Application;
      changed = true;
    }
    if (next.userConfirmedAccuracy !== true) {
      next = { ...next, userConfirmedAccuracy: true } as Application;
      changed = true;
    }

    persistAppWithDocs(next, progressItems, false);
    if (changed) {
      setTick((t) => t + 1);
    }

    router.replace({
      pathname: '/application/[id]/ready-actions',
      params: { id: next.id, nav: JSON.stringify(navCtx) },
    } as any);
  }, [
    activeFirearmIds,
    app,
    effectiveCertificateIds,
    effectiveMembershipIds,
    effectiveProficiencyIds,
    effectiveActivityEvidenceIds,
    effectiveSafeIds,
    navCtx,
    persistAppWithDocs,
    router,
    acknowledgementItems,
    selectedCertificates,
    selectedFirearms,
  ]);

  const allAcknowledgementsComplete = React.useMemo(() => {
    if (shouldBypassValidation) return true;
    if (!acknowledgementItems.length) return true;
    return acknowledgementItems.every((ack) => ack.checked);
  }, [acknowledgementItems, shouldBypassValidation]);

  React.useEffect(() => {
    if (!app?.id) return;
    const hasCertSelection = Array.isArray(app.competencyCertificateIds) && app.competencyCertificateIds.length > 0;
    const hasFirearmSelection = Array.isArray(app.selectedFirearmIds) && app.selectedFirearmIds.length > 0;
    const hasSafeSelection = Array.isArray(app.safeIds) && app.safeIds.length > 0;
    const hasMembershipSelection = Array.isArray(app.membershipIds) && app.membershipIds.length > 0;
    const hasProficiencySelection = Array.isArray(app.proficiencyIds) && app.proficiencyIds.length > 0;
    const shouldPersist =
      (!hasCertSelection && effectiveCertificateIds.length > 0) ||
      (!hasFirearmSelection && activeFirearmIds.length > 0) ||
      (!hasSafeSelection && effectiveSafeIds.length > 0) ||
      (!hasMembershipSelection && effectiveMembershipIds.length > 0) ||
      (!hasProficiencySelection && effectiveProficiencyIds.length > 0);
    if (!shouldPersist) return;
    persistLatestAppWithDocs((latest) => {
      let next = latest as Application;
      let changed = false;
      if (!hasCertSelection && effectiveCertificateIds.length > 0) {
        next = { ...next, competencyCertificateIds: Array.from(new Set(effectiveCertificateIds)) };
        changed = true;
      }
      if (!hasFirearmSelection && activeFirearmIds.length > 0) {
        next = { ...next, selectedFirearmIds: Array.from(new Set(activeFirearmIds)) };
        changed = true;
      }
      if (!hasSafeSelection && effectiveSafeIds.length > 0) {
        next = { ...next, safeIds: Array.from(new Set(effectiveSafeIds)) };
        changed = true;
      }
      if (!hasMembershipSelection && effectiveMembershipIds.length > 0) {
        next = { ...next, membershipIds: Array.from(new Set(effectiveMembershipIds)) };
        changed = true;
      }
      if (!hasProficiencySelection && effectiveProficiencyIds.length > 0) {
        next = { ...next, proficiencyIds: Array.from(new Set(effectiveProficiencyIds)) };
        changed = true;
      }
      return changed ? { next } : { next: latest };
    });
  }, [
    activeFirearmIds,
    app?.id,
    effectiveCertificateIds,
    effectiveMembershipIds,
    effectiveProficiencyIds,
    effectiveSafeIds,
    persistLatestAppWithDocs,
  ]);

  const showSubmitButton = app?.status === 'draft';
  const submitDisabled = false;

  const scrollToAnchor = React.useCallback(
    (anchor?: string) => {
      if (!anchor || !listData.length) return;
      const anchorUpper = String(anchor).toUpperCase();
      const isProficiencyAnchor =
        anchorUpper === 'PROFICIENCY' ||
        anchorUpper.startsWith('PROFICIENCY_') ||
        anchorUpper === 'STATEMENT_OF_RESULTS' ||
        anchorUpper.startsWith('STATEMENT_OF_RESULTS_');
      if (anchor === DECLARATIONS_ANCHOR) {
        scrollToDeclarationsCard();
        return;
      }
      const idx = listData.findIndex((item) => {
        if (item.type === 'single') return item.item.key === anchor;
        if (item.type === 'group') return item.items.some(({ progress }) => progress.key === anchor);
        if (item.type === 'membership') return item.key === anchor;
        if (item.type === 'proficiency') {
          if (item.key === anchor) return true;
          if (isProficiencyAnchor) return true;
          return false;
        }
        if (item.type === 'activityEvidence') return item.key === anchor;
        return false;
      });
      if (idx >= 0) {
        try {
          flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
        } catch {
          // retry once when list layout has settled
          setTimeout(() => {
            try {
              flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
            } catch {
              // ignore
            }
          }, 220);
        }
      }
    },
    [listData, scrollToDeclarationsCard],
  );


  const handleSubmitPress = React.useCallback(() => {
    syncLinkedDocsIntoProgress();
    ensureCapturedStatusForAllDocs();
    const proceed = () => markApplicationReady();
    const issues = shouldBypassValidation
      ? submissionIssues.filter((issue) => issue.severity === 'warning')
      : submissionIssues;

    if (!issues.length) {
      setShowIssuePills(false);
      proceed();
      return;
    }

    const warnings = issues.filter((issue) => issue.severity === 'warning');
    const missing = issues.filter((issue) => issue.severity === 'missing');
    const lines: string[] = [];
    if (warnings.length) {
      lines.push(
        warnings.length === 1
          ? 'There is 1 warning to review in the warning card at the bottom of the screen.'
          : `There are ${warnings.length} warnings to review in the warning card at the bottom of the screen.`
      );
    }
    if (missing.length) {
      if (lines.length) lines.push('');
      lines.push('Missing documents:');
      missing.forEach((issue) => lines.push(`- ${issue.message}`));
    }
    lines.push('');
    lines.push('You can continue or return to review these sections.');

    const firstIssueWithAnchor = issues.find((issue) => !!issue.anchor);
    Alert.alert(
      'Submission review',
      lines.join('\n'),
      [
        {
          text: 'Return',
          style: 'cancel',
          onPress: () => {
            setShowIssuePills(true);
            if (firstIssueWithAnchor?.anchor) {
              scrollToAnchor(firstIssueWithAnchor.anchor);
            }
          },
        },
        { text: 'Continue', style: 'destructive', onPress: proceed },
      ],
    );
  }, [
    markApplicationReady,
    submissionIssues,
    shouldBypassValidation,
    scrollToAnchor,
    setShowIssuePills,
    ensureCapturedStatusForAllDocs,
    syncLinkedDocsIntoProgress,
  ]);

  const documentsWarningCard = useMemo(() => {
    const issues = shouldBypassValidation
      ? submissionIssues.filter((issue) => issue.severity === 'warning')
      : submissionIssues;
    if (!issues.length) return null;

    const seen = new Set<string>();
    const items = issues
      .map((issue) => issue.message.trim())
      .filter(Boolean)
      .filter((message) => {
        if (seen.has(message)) return false;
        seen.add(message);
        return true;
      });
    if (!items.length) return null;

    const anchorOrder = new Map<string, number>();
    listData.forEach((item, index) => {
      if (item.type === 'single') {
        anchorOrder.set(item.item.key, index);
        return;
      }
      if (item.type === 'group') {
        item.items.forEach(({ progress }) => anchorOrder.set(progress.key, index));
        return;
      }
      anchorOrder.set(item.key, index);
    });
    anchorOrder.set(DECLARATIONS_ANCHOR, Number.MAX_SAFE_INTEGER);
    let firstAnchor = issues
      .filter((issue) => !!issue.anchor)
      .sort((a, b) => {
        const aRank = anchorOrder.get(a.anchor ?? '') ?? Number.MAX_SAFE_INTEGER;
        const bRank = anchorOrder.get(b.anchor ?? '') ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      })[0]?.anchor;
    if (!firstAnchor && proficiencyAnchorKey) {
      const hasProficiencyIssue = issues.some((issue) => {
        const lower = issue.message.trim().toLowerCase();
        return (
          lower.includes('handle and use results') ||
          lower.includes('knowledge of the firearms control') ||
          lower.includes('statement of results')
        );
      });
      if (hasProficiencyIssue) firstAnchor = proficiencyAnchorKey;
    }
    return {
      heading: 'Warnings (tap to view)',
      items,
      firstAnchor,
    };
  }, [listData, proficiencyAnchorKey, shouldBypassValidation, submissionIssues]);

  const applyDocToProgress = (
    prev: DocItemProgress,
    doc: Document,
    method: 'camera' | 'upload',
    ctx?: DocActionContext,
    options?: { identityDocumentSide?: IdentityDocumentSide }
  ): DocItemProgress => {
    const identityDocumentSide = options?.identityDocumentSide;
    const relatedId = normalizeId(ctx?.relatedId);
    const labelOverride = identityDocumentSide ? identitySideLabels[identityDocumentSide] : ctx?.label;
    if (prev.multiple) {
      let existingInstances = [...(prev.instances ?? [])];
      let matchIdx = -1;

      if (relatedId && identityDocumentSide) {
        matchIdx = existingInstances.findIndex(
          (inst) =>
            normalizeId(inst.relatedId) === relatedId &&
            inst.identityDocumentSide === identityDocumentSide
        );
      }
      if (matchIdx < 0 && relatedId) {
        matchIdx = existingInstances.findIndex(
          (inst) =>
            normalizeId(inst.relatedId) === relatedId &&
            (identityDocumentSide ? inst.identityDocumentSide === identityDocumentSide : !inst.identityDocumentSide)
        );
      }
      if (matchIdx < 0 && !relatedId && identityDocumentSide) {
        matchIdx = existingInstances.findIndex(
          (inst) =>
            !inst.relatedId &&
            inst.identityDocumentSide === identityDocumentSide
        );
      }

      const prevInstance = matchIdx >= 0 ? existingInstances[matchIdx] : undefined;
      const nextInstanceStatus = 'captured';
      const updated: DocInstance = {
        ...(prevInstance ?? {}),
        relatedId,
        label: labelOverride ?? prevInstance?.label ?? ctx?.label,
        documentId: doc.id,
        status: nextInstanceStatus,
        captureMethod: method,
        identityDocumentSide: identityDocumentSide ?? prevInstance?.identityDocumentSide,
      };

      if (matchIdx >= 0) existingInstances[matchIdx] = updated;
      else existingInstances.push(updated);

      const maxUploads = typeof prev.maxUploads === 'number' && prev.maxUploads > 0 ? prev.maxUploads : undefined;
      if (maxUploads && existingInstances.length > maxUploads) {
        existingInstances = existingInstances.slice(existingInstances.length - maxUploads);
      }
      const nextStatus = 'captured'
      return {
        ...prev,
        instances: existingInstances,
        status: nextStatus,
      };
    }
    const nextStatus = 'captured';
    return {
      ...prev,
      documentId: doc.id,
      status: nextStatus,
      captureMethod: method,
      identityDocumentSide: identityDocumentSide ?? prev.identityDocumentSide,
    };
  };

  const syncTargetDocAcrossApps = React.useCallback(
    (doc: Document, item: DocItemProgress, method: CaptureMethod, ctx?: DocActionContext) => {
      const relatedIdStr = normalizeId(ctx?.relatedId);
      if (!relatedIdStr) return;
      const code = (item.code ?? item.key ?? '').toUpperCase();
      const isCompetencyDoc = code.startsWith('COMPETENCY_CERT') || code.startsWith('COMPETENCY');
      if (!isCompetencyDoc) return;

      const allApps = listByType<Application>('Application');
      for (const other of allApps) {
        if (!other || other.id === app?.id) continue;

        const ids = new Set<string>();
        if (Array.isArray(other.competencyCertificateIds)) {
          other.competencyCertificateIds.forEach((cid: any) => ids.add(String(cid)));
        }
        if (!ids.has(relatedIdStr)) continue;

        const docState = other.docs;
        if (!docState) continue;
        const nextDocs = Array.isArray(docState.documents) ? [...docState.documents] : [];
        const exists = nextDocs.some(
          (entry) =>
            String(entry.documentId) === String(doc.id) &&
            normalizeRequirementCode(entry.requirementCode) === normalizeRequirementCode(code)
        );
        if (exists) continue;
        nextDocs.push({
          requirementCode: code,
          kind: (doc.kind ?? 'OTHER') as Document['kind'],
          documentId: String(doc.id),
          source: {
            type: resolveDocSourceType(doc),
            id: doc.parentId ? String(doc.parentId) : undefined,
          },
        });
        const draft = { ...other, docs: { ...docState, documents: nextDocs } } as Application;
        persistAppWithDocs(draft, undefined, false);
      }
    },
    [app, persistAppWithDocs],
  );


  const buildBaseDocs = React.useCallback((): DocItemProgress[] => {
    if (progressItems.length) return progressItems;
    return defs.map(d => ({
      key: d.key,
      code: d.__code ?? d.key,
      label: d.label,
      kind: d.kind,
      status: 'captured',
      multiple: !!d.multiple || d.allowMultipleUploads === true,
      allowMultipleUploads: d.allowMultipleUploads === true,
      allowedKinds: d.allowedKinds as Array<'IMAGE' | 'PDF' | 'OTHER'> | undefined,
      requiredUpload: d.requiredUpload !== false,
      acknowledged: false,
      minUploads: d.minUploads,
      maxUploads: d.maxUploads,
      instances: (d.multiple || d.allowMultipleUploads) ? [] : undefined,
    } as DocItemProgress));
  }, [defs, progressItems]);

  const removeSafeFromApplication = React.useCallback(
    (safeId: string) => {
      const id = String(safeId);
      userChangedRef.current = true;
      persistLatestAppWithDocs((latest) => {
        let changed = false;
        let nextSafeIds: typeof latest.safeIds = latest.safeIds;
        if (Array.isArray(latest.safeIds)) {
          const filtered = latest.safeIds.filter((sid) => String(sid) !== id);
          if (filtered.length !== latest.safeIds.length) {
            nextSafeIds = filtered;
            changed = true;
          }
        }

        const baseDocs = buildBaseDocs();
        let docChanged = false;
        const nextDocs = baseDocs.map((docItem: DocItemProgress) => {
          const code = (docItem.code ?? docItem.key ?? '').toUpperCase();
          if (!isSafeRequirementCode(code) && docItem.kind !== 'SAFE') return docItem;
          const existing = docItem.instances ?? [];
          if (!existing.length) return docItem;
          const filtered = existing.filter(
            (inst: NonNullable<DocItemProgress['instances']>[number]) =>
              String(inst.relatedId ?? '') !== id
          );
          if (filtered.length === existing.length) return docItem;
          docChanged = true;
          const last = filtered[filtered.length - 1];
          return {
            ...docItem,
            instances: filtered,
            status: deriveMultiInstanceStatus(docItem, filtered),
            captureMethod: last?.captureMethod,
            documentId: docItem.multiple ? undefined : last?.documentId ?? docItem.documentId,
          };
        });

        if (!changed && !docChanged) return { next: latest };
        const nextApp = {
          ...latest,
          safeIds: changed ? nextSafeIds : latest.safeIds,
        } as Application;
        return { next: nextApp, docItems: docChanged ? nextDocs : undefined };
      });
    },
    [buildBaseDocs, persistLatestAppWithDocs],
  );

  const toggleSafeSelection = React.useCallback(
    (safeId: string) => {
      const id = String(safeId);
      userChangedRef.current = true;
      const existing = new Set(effectiveSafeIds);
      if (existing.has(id)) {
        if (currentSafeIds.includes(id)) {
          removeSafeFromApplication(id);
          return;
        }
        existing.delete(id);
      } else {
        existing.add(id);
      }
      persistLatestAppWithDocs((latest) => {
        const nextApp = {
          ...latest,
          safeIds: Array.from(existing),
        } as Application;
        return { next: nextApp };
      });
    },
    [currentSafeIds, effectiveSafeIds, persistLatestAppWithDocs, removeSafeFromApplication],
  );

  const updateDoc = React.useCallback((key: string, updater: (prev: DocItemProgress) => DocItemProgress) => {
    const baseDocs = buildBaseDocs();
    const nextDocs = baseDocs.map(item => item.key === key ? updater(item) : item);

    userChangedRef.current = true;
    persistLatestAppWithDocs((latest) => ({
      next: { ...latest } as Application,
      docItems: nextDocs,
    }));
  }, [buildBaseDocs, persistLatestAppWithDocs]);

  const makeDocument = async (
    name: string,
    kind: Document['kind'],
    uri: string,
    mime: string | undefined,
    size: number | undefined,
    requirementKey: string,
    ctx?: DocActionContext,
    extra?: { identityDocumentSide?: IdentityDocumentSide }
  ): Promise<Document> => {
    const relatedId = normalizeId(ctx?.relatedId);
    // Store requirementCode and application linkage for future policy-aware flows
    const stored = await ensureStoredFileAsync(uri, { fileName: name ?? ctx?.label, mime }, devModeEnabled);
    const finalUri = stored.uri;
    const finalSize = typeof size === 'number' ? size : stored.size;
    return withMeta<Document>({
      id: globalThis.crypto?.randomUUID?.() ?? `doc_${Math.random().toString(36).slice(2)}`,
      type: 'Document',
      kind,
      name,
      holderProfileId: (app?.applicantProfileId ?? '') as Document['holderProfileId'],
      uri: finalUri,
      filePath: finalUri,
      mime,
      size: finalSize,
      sha256: '',
      pages: 1,
      applicationId: app!.id,
      requirementCode: requirementKey,
      requirementRelatedId: relatedId,
      requirementRelatedLabel: ctx?.label,
      parentType: 'Application',
      parentId: app!.id,
      capturedAt: new Date().toISOString(),
      identityDocumentSide: extra?.identityDocumentSide,
    } as any);
  };

  const removeFirearmFromApplication = React.useCallback((firearmId: string) => {
    const idToRemove = String(firearmId);
    userChangedRef.current = true;
    persistLatestAppWithDocs((latest) => {
      let selectedIdsChanged = false;
      let nextSelectedFirearmIds: typeof latest.selectedFirearmIds = latest.selectedFirearmIds;
      if (Array.isArray(latest.selectedFirearmIds)) {
        const filtered = latest.selectedFirearmIds.filter((fid) => String(fid) !== idToRemove);
        if (filtered.length !== latest.selectedFirearmIds.length) {
          selectedIdsChanged = true;
          nextSelectedFirearmIds = filtered;
        }
      }

      let inlineFirearmsChanged = false;
      let nextInlineFirearms: typeof latest.firearms = latest.firearms;
      if (Array.isArray(latest.firearms)) {
        const filtered = latest.firearms.filter((firearm: any) => String(firearm?.id ?? '') !== idToRemove);
        if (filtered.length !== latest.firearms.length) {
          inlineFirearmsChanged = true;
          nextInlineFirearms = filtered;
        }
      }

      const baseDocs = buildBaseDocs();
      let docChanged = false;

      const nextDocs = baseDocs.map((docItem: DocItemProgress) => {
        const code = (docItem.code ?? docItem.key ?? '').toUpperCase();
        if (!isFirearmLicenceRequirementCode(code)) return docItem;
        const existing = docItem.instances ?? [];
        if (!existing.length) return docItem;
        const filteredInstances = existing.filter(
          (inst: NonNullable<DocItemProgress['instances']>[number]) => String(inst.relatedId ?? '') !== idToRemove
        );
        if (filteredInstances.length === existing.length) return docItem;
        docChanged = true;
        const lastInstance = filteredInstances[filteredInstances.length - 1];
        return {
          ...docItem,
          instances: filteredInstances,
          status: deriveMultiInstanceStatus(docItem, filteredInstances),
          captureMethod: lastInstance?.captureMethod,
          documentId: docItem.multiple ? undefined : lastInstance?.documentId ?? docItem.documentId,
        };
      });

      if (!selectedIdsChanged && !inlineFirearmsChanged && !docChanged) {
        return { next: latest };
      }

      const nextApp = {
        ...latest,
        selectedFirearmIds: selectedIdsChanged ? nextSelectedFirearmIds : latest.selectedFirearmIds,
        firearms: inlineFirearmsChanged ? nextInlineFirearms : latest.firearms,
      } as Application;
      const nextPrimaryFirearmId = getPrimaryApplicationFirearmId(nextApp);
      const holderProfileId = String(nextApp.applicantProfileId ?? '').trim();
      const linkedMotivation =
        holderProfileId && nextPrimaryFirearmId
          ? findMotivationByHolderAndFirearm(holderProfileId, nextPrimaryFirearmId)
          : null;
      const motivationPatch = linkedMotivation
        ? buildApplicationMotivationMirrorPatch(nextApp, linkedMotivation)
        : {
            motivationId: undefined,
            motivationProfile: undefined,
            motivationText: undefined,
            motivationWizardStatus: undefined,
          };
      const nextWithMotivation = {
        ...nextApp,
        motivationFirearmId: nextPrimaryFirearmId || undefined,
        ...motivationPatch,
      } as Application;

      return { next: nextWithMotivation, docItems: docChanged ? nextDocs : undefined };
    });
  }, [buildBaseDocs, persistLatestAppWithDocs]);

  useEffect(() => {
    if (!app || !is518a) return;
    const hasCategoryFilter = Boolean(selectedCompetencyCategories && selectedCompetencyCategories.size);
    if (!hasCategoryFilter) return;
    const disallowed = currentFirearmIds.filter((id) => !allowedFirearmIds.has(String(id)));
    if (!disallowed.length) return;
    disallowed.forEach((id) => removeFirearmFromApplication(id));
  }, [allowedFirearmIds, app, currentFirearmIds, is518a, removeFirearmFromApplication, selectedCompetencyCategories]);

  const showMaxReachedAlert = React.useCallback((opts: { label: string; max: number }) => {
    Alert.alert(
      'Maximum reached',
      `You have reached the max number of ${opts.label} (${opts.max}) for the application.`
    );
  }, []);

  const showFirearmMaxReachedAlert = React.useCallback(() => {
    if (!Number.isFinite(firearmMaxCount as number)) return;
    const max = Number(firearmMaxCount);
    if (max < 1) return;
    showMaxReachedAlert({ label: 'firearms', max });
  }, [firearmMaxCount, showMaxReachedAlert]);

  const showCompetencyMaxReachedAlert = React.useCallback(() => {
    if (!Number.isFinite(competencyMaxCount as number)) return;
    const max = Number(competencyMaxCount);
    if (max < 1) return;
    showMaxReachedAlert({ label: 'competency certificates', max });
  }, [competencyMaxCount, showMaxReachedAlert]);

  const toggleFirearmSelection = React.useCallback(
    (firearmId: string) => {
      const id = String(firearmId);
      if (maxDisabledFirearmIds.has(id)) {
        showFirearmMaxReachedAlert();
        return;
      }
      if (categoryDisabledFirearmIds.has(id)) return;
      userChangedRef.current = true;
      const selected = new Set(activeFirearmIds);
      if (selected.has(id)) {
        if (currentFirearmIds.includes(id)) {
          removeFirearmFromApplication(id);
          return;
        }
        selected.delete(id);
      } else {
        if (Number.isFinite(firearmMaxCount as number) && selected.size >= Number(firearmMaxCount)) {
          showFirearmMaxReachedAlert();
          return;
        }
        selected.add(id);
      }
      const nextSelectedIds = Array.from(selected);
      persistLatestAppWithDocs((latest) => {
        const holderProfileId = String(latest.applicantProfileId ?? '').trim();
        const primaryFirearmId = nextSelectedIds[0] ? String(nextSelectedIds[0]).trim() : '';
      const linkedMotivation =
        holderProfileId && primaryFirearmId
          ? findMotivationByHolderAndFirearm(holderProfileId, primaryFirearmId)
          : null;
        const motivationPatch = linkedMotivation
          ? buildApplicationMotivationMirrorPatch(latest, linkedMotivation)
          : {
              motivationId: undefined,
              motivationProfile: undefined,
              motivationText: undefined,
              motivationWizardStatus: undefined,
            };
        const next = {
          ...latest,
          selectedFirearmIds: nextSelectedIds,
          motivationFirearmId: primaryFirearmId || undefined,
          ...motivationPatch,
        } as Application;
        return { next };
      });
    },
    [
      activeFirearmIds,
      categoryDisabledFirearmIds,
      currentFirearmIds,
      firearmMaxCount,
      maxDisabledFirearmIds,
      persistLatestAppWithDocs,
      removeFirearmFromApplication,
      showFirearmMaxReachedAlert,
    ],
  );

  const deleteDocumentRecord = React.useCallback(async (documentId?: string) => {
    if (!documentId) return;
    const doc = getById<Document>(documentId);
    if (doc) {
      const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
      for (const path of paths) {
        try {
          await deleteOwnedDocFile(path);
        } catch {
          // ignore file delete errors
        }
      }
    }
    deleteEntity(documentId);
  }, []);

  const removeProofDocument = React.useCallback(async (item: DocItemProgress, documentId: string) => {
    await deleteDocumentRecord(documentId);
    updateDoc(item.key, (prev) => {
      if (prev.multiple) {
        const filtered = (prev.instances ?? []).filter((inst) => inst.documentId !== documentId);
        return {
          ...prev,
          instances: filtered,
          status: deriveMultiInstanceStatus(prev, filtered as NonNullable<DocItemProgress['instances']>),
        };
      }
      const nextStatus =  'captured';
      return {
        ...prev,
        documentId: undefined,
        status: nextStatus,
        captureMethod: undefined,
        identityDocumentSide: undefined,
      };
    });
  }, [deleteDocumentRecord, updateDoc]);

  const confirmRemoveProofDocument = React.useCallback(
    (item: DocItemProgress, documentId: string, label?: string) => {
      const subject = (item.kind === 'ID_CARD' || item.kind === 'ID_BOOK') ? 'Remove ID upload' : 'Remove document';
      const description = label ? label.toLowerCase() : 'this file';
      Alert.alert(
        subject,
        `Remove ${description}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => { void removeProofDocument(item, documentId); } },
        ],
        { cancelable: true }
      );
    },
    [removeProofDocument],
  );

  const onScan = async (item: DocItemProgress, ctx?: DocActionContext) => {
    const allowedKinds = ctx?.allowedKinds ?? item.allowedKinds;
    if (!isImageAllowed(allowedKinds)) {
      Alert.alert('Not supported', 'This document must be uploaded from a file instead of the camera.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to scan a document.');
      return;
    }
    const cameraOptions: ImagePicker.ImagePickerOptions = {
      quality: 1,
      base64: false,
      mediaTypes: 'images',
      exif: false,
    };
    if (jpegExportType) {
      (cameraOptions as Record<string, unknown>).imageExportType = jpegExportType;
    }
    const res = await ImagePicker.launchCameraAsync(cameraOptions);
    if (res.canceled || !res.assets?.length) return;
    const asset = await ensureJpegAsset(res.assets[0]);

    let identityDocumentSide: IdentityDocumentSide | undefined = ctx?.identityDocumentSide;
    if (isIdentityDocItem(item) && !identityDocumentSide) {
      identityDocumentSide = await promptIdentityDocumentSide({ message: 'Select which side you just scanned.' });
      if (!identityDocumentSide) return;
    }
    const remind = shouldRemindOtherIdentitySide(item, identityDocumentSide);

    const doc = await makeDocument(
      asset.fileName ?? ctx?.label ?? item.label,
      item.kind,
      asset.uri,
      asset.mimeType as any,
      asset.fileSize as any,
      item.key,
      ctx,
      identityDocumentSide ? { identityDocumentSide } : undefined
    );
    persist(doc);

    updateDoc(item.key, prev => applyDocToProgress(prev, doc, 'camera', ctx, identityDocumentSide ? { identityDocumentSide } : undefined));
    syncTargetDocAcrossApps(doc, item, 'camera', ctx);

    if (remind) {
      const missingLabel = identityDocumentSide === 'front' ? identitySideLabels.back : identitySideLabels.front;
      const subject = describeIdentityDocumentSubject(item);
      Alert.alert('Reminder', `Remember to capture the ${missingLabel.toLowerCase()} of your ${subject} as well.`);
    }
  };

  const onLibrary = async (item: DocItemProgress, ctx?: DocActionContext) => {
    const allowedKinds = ctx?.allowedKinds ?? item.allowedKinds;
    if (!isImageAllowed(allowedKinds)) {
      Alert.alert('Not supported', 'Photo library uploads are only available for image documents.');
      return;
    }
    const hasPermission = await ensurePhotoLibraryPermission();
    if (!hasPermission) {
      Alert.alert('Permission needed', 'Photo library permission is required to choose an image.');
      return;
    }
    const libraryOptions: ImagePicker.ImagePickerOptions = {
      quality: 1,
      allowsMultipleSelection: false,
      base64: false,
      mediaTypes: 'images',
    };
    if (jpegExportType) {
      (libraryOptions as Record<string, unknown>).imageExportType = jpegExportType;
    }
    const res = await ImagePicker.launchImageLibraryAsync(libraryOptions);
    if (res.canceled || !res.assets?.length) return;
    const asset = await ensureJpegAsset(res.assets[0]);

    let identityDocumentSide: IdentityDocumentSide | undefined = ctx?.identityDocumentSide;
    if (isIdentityDocItem(item) && !identityDocumentSide) {
      identityDocumentSide = await promptIdentityDocumentSide({ message: 'Select which side this photo shows.' });
      if (!identityDocumentSide) return;
    }
    const remind = shouldRemindOtherIdentitySide(item, identityDocumentSide);

    const doc = await makeDocument(
      asset.fileName ?? ctx?.label ?? item.label,
      item.kind,
      asset.uri,
      asset.mimeType as any,
      asset.fileSize as any,
      item.key,
      ctx,
      identityDocumentSide ? { identityDocumentSide } : undefined
    );
    persist(doc);

    updateDoc(item.key, prev => applyDocToProgress(prev, doc, 'upload', ctx, identityDocumentSide ? { identityDocumentSide } : undefined));
    syncTargetDocAcrossApps(doc, item, 'upload', ctx);

    if (remind) {
      const missingLabel = identityDocumentSide === 'front' ? identitySideLabels.back : identitySideLabels.front;
      const subject = describeIdentityDocumentSubject(item);
      Alert.alert('Reminder', `Remember to capture the ${missingLabel.toLowerCase()} of your ${subject} as well.`);
    }
  };

  const onUpload = async (item: DocItemProgress, ctx?: DocActionContext) => {
    const allowedKinds = ctx?.allowedKinds ?? item.allowedKinds;
    const pickerTypes = pickerTypesForKinds(allowedKinds);
    const res = await DocumentPicker.getDocumentAsync({
      type: pickerTypes.length === 1 ? pickerTypes[0] : pickerTypes,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    let asset = res.assets[0];
    const mime = asset.mimeType ?? '';
    const looksLikeImage =
      mime.startsWith('image/') ||
      /\.jpe?g$/i.test(asset.name ?? '') ||
      /\.hei[cf]$/i.test(asset.name ?? '') ||
      /\.png$/i.test(asset.name ?? '');
    if (looksLikeImage) {
      asset = await ensureJpegAsset(asset as any);
    }

    let identityDocumentSide: IdentityDocumentSide | undefined = ctx?.identityDocumentSide;
    if (isIdentityDocItem(item) && !identityDocumentSide) {
      identityDocumentSide = await promptIdentityDocumentSide({ message: 'Select which side this file contains.' });
      if (!identityDocumentSide) return;
    }
    const remind = shouldRemindOtherIdentitySide(item, identityDocumentSide);

    const doc = await makeDocument(
      asset.name ?? ctx?.label ?? item.label,
      item.kind,
      asset.uri,
      asset.mimeType as any,
      ((asset as any).fileSize ?? asset.size) as any,
      item.key,
      ctx,
      identityDocumentSide ? { identityDocumentSide } : undefined
    );
    persist(doc);

    updateDoc(item.key, prev => applyDocToProgress(prev, doc, 'upload', ctx, identityDocumentSide ? { identityDocumentSide } : undefined));
    syncTargetDocAcrossApps(doc, item, 'upload', ctx);

    if (remind) {
      const missingLabel = identityDocumentSide === 'front' ? identitySideLabels.back : identitySideLabels.front;
      const subject = describeIdentityDocumentSubject(item);
      Alert.alert('Reminder', `Remember to capture the ${missingLabel.toLowerCase()} of your ${subject} as well.`);
    }
  };

  const toggleOptional = (item: DocItemProgress) => {
    if (item.requiredUpload !== false) return;
    const nextAck = !item.acknowledged;
    updateDoc(item.key, prev => {
      if (prev.requiredUpload !== false) return prev;
      const nextStatus = nextAck ? 'captured' : 'pending';
      if (prev.status === 'verified') {
        return { ...prev, acknowledged: nextAck };
      }
      return { ...prev, acknowledged: nextAck, status: nextStatus };
    });
  };

  const removeCertificateFromApplication = React.useCallback((certId: string) => {
    const idToRemove = String(certId);
    userChangedRef.current = true;
    persistLatestAppWithDocs((latest) => {
      const currentCertificateIds = Array.isArray(latest.competencyCertificateIds)
        ? latest.competencyCertificateIds
        : null;
      let certIdsChanged = false;
      let nextCertificateIds: typeof latest.competencyCertificateIds = latest.competencyCertificateIds;
      if (currentCertificateIds) {
        const filtered = currentCertificateIds.filter((cid) => String(cid) !== idToRemove);
        if (filtered.length !== currentCertificateIds.length) {
          certIdsChanged = true;
          nextCertificateIds = filtered;
        }
      }

      const baseDocs = buildBaseDocs();
      let docChanged = false;

      const nextDocs = baseDocs.map((docItem: DocItemProgress) => {
        const code = (docItem.code ?? docItem.key ?? '').toUpperCase();
        if (!code.startsWith('COMPETENCY_CERT') && !code.startsWith('COMPETENCY')) return docItem;
        const existing = docItem.instances ?? [];
        if (!existing.length) return docItem;
        const filtered = existing.filter((inst: NonNullable<DocItemProgress['instances']>[number]) =>
          String(inst.relatedId ?? '') !== idToRemove
        );
        if (filtered.length === existing.length) return docItem;
        docChanged = true;
        const lastInstance = filtered[filtered.length - 1];
        return {
          ...docItem,
          instances: filtered,
          status: deriveMultiInstanceStatus(docItem, filtered),
          captureMethod: lastInstance?.captureMethod,
          documentId: docItem.multiple ? undefined : lastInstance?.documentId ?? docItem.documentId,
        };
      });

      if (!certIdsChanged && !docChanged) {
        return { next: latest };
      }

      const nextApp = {
        ...latest,
        competencyCertificateIds: certIdsChanged ? nextCertificateIds : latest.competencyCertificateIds,
      } as Application;

      return { next: nextApp, docItems: docChanged ? nextDocs : undefined };
    });
  }, [buildBaseDocs, persistLatestAppWithDocs]);

  const toggleCertificateSelection = React.useCallback(
    (certId: string) => {
      const id = String(certId);
      if (maxDisabledCertificateIds.has(id)) {
        showCompetencyMaxReachedAlert();
        return;
      }
      userChangedRef.current = true;
      const existing = new Set(effectiveCertificateIds);
      if (existing.has(id)) {
        if (currentCertificateIds.includes(id)) {
          removeCertificateFromApplication(id);
          return;
        }
        existing.delete(id);
      } else {
        if (Number.isFinite(competencyMaxCount as number) && existing.size >= Number(competencyMaxCount)) {
          showCompetencyMaxReachedAlert();
          return;
        }
        existing.add(id);
      }
      persistLatestAppWithDocs((latest) => {
        const nextApp = {
          ...latest,
          competencyCertificateIds: Array.from(existing),
        } as Application;
        return { next: nextApp };
      });
    },
    [
      competencyMaxCount,
      currentCertificateIds,
      effectiveCertificateIds,
      maxDisabledCertificateIds,
      persistLatestAppWithDocs,
      removeCertificateFromApplication,
      showCompetencyMaxReachedAlert,
    ],
  );

  const confirmRemoveCertificate = React.useCallback((certId: string, label?: string) => {
    const trimmed = (label ?? '').trim();
    const displayLabel = trimmed.length ? trimmed : 'this certificate';
    Alert.alert(
      'Remove competency certificate',
      `Remove ${displayLabel} from this application?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeCertificateFromApplication(certId) },
      ]
    );
  }, [removeCertificateFromApplication]);

  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  const onView = async (item: DocItemProgress, ctx?: DocActionContext) => {
    const instance = findInstance(item, { relatedId: ctx?.relatedId, documentId: ctx?.documentId });
    const docId = ctx?.documentId ?? instance?.documentId ?? item.documentId;
    if (!docId) {
      Alert.alert('Nothing to view', 'Capture or upload a document first.');
      return;
    }
    const doc = getById<Document>(docId);
    if (!doc) {
      Alert.alert('Unavailable', 'The document could not be found.');
      return;
    }
    const uri = resolveDocumentUri(doc.uri ?? doc.filePath);
    if (!uri) {
      Alert.alert('Unavailable', 'The document file path is missing.');
      return;
    }
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      Alert.alert('Unavailable', 'The document file could not be found on this device.');
      return;
    }
    const mime = doc.mime ?? '';
    if (mime.startsWith('image/')) {
      setPreviewDoc(doc);
      return;
    }
    const tryOpenUrl = async (target?: string | null) => {
      if (!target) return false;
      try {
        const supported = await Linking.canOpenURL(target);
        if (!supported) return false;
        await Linking.openURL(target);
        return true;
      } catch {
        return false;
      }
    };
    const isHttpUrl = /^https?:\/\//i.test(uri);
    const isFileUrl = uri.startsWith('file://');
    if (mime === 'application/pdf' || (doc.name ?? '').toLowerCase().endsWith('.pdf')) {
      if (Platform.OS === 'android' && isFileUrl) {
        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          if (await tryOpenUrl(contentUri)) {
            return;
          }
        } catch {}
      }
      if (isHttpUrl) {
        try {
          await WebBrowser.openBrowserAsync(uri);
          return;
        } catch {
          // fall through to Linking attempt below
        }
      }
      if (await tryOpenUrl(uri)) {
        return;
      }
      Alert.alert(
        'Unable to open',
        'Could not find an app on this device that can open the PDF. You can export it and open it on another device.'
      );
      return;
    }
    if (Platform.OS === 'android' && isFileUrl) {
      try {
        const contentUri = await FileSystem.getContentUriAsync(uri);
        if (await tryOpenUrl(contentUri)) {
          return;
        }
      } catch {}
    }
    if (await tryOpenUrl(uri)) {
      return;
    }
    Alert.alert('Unable to open', 'Could not open this document on your device.');
  };

  const closePreview = () => setPreviewDoc(null);
  const previewUri = previewDoc ? resolveDocumentUri(previewDoc.uri ?? previewDoc.filePath) : undefined;
  const previewTitle =
    previewDoc?.name ??
    previewDoc?.requirementRelatedLabel ??
    previewDoc?.requirementCode ??
    'Document';

  const renderItem: ListRenderItem<RequirementListItem> = ({ item }) => {
    if (item.type === 'membership') {
      return membershipCard ?? null;
    }
    if (item.type === 'proficiency') {
      return proficiencyCard ?? null;
    }
    if (item.type === 'activityEvidence') {
      return activityEvidenceCard ?? null;
    }
    if (item.type === 'group') {
      const group = item;
      const total = group.items.length;
      const verifiedCount = group.items.filter(({ progress }) => progress.status === 'verified').length;
      const capturedCount = group.items.filter(({ progress }) => hasCaptured(progress)).length;
      const statusText =
        total > 0 && verifiedCount === total
          ? 'Verified'
          : capturedCount > 0
            ? `${capturedCount}/${total} captured`
            : 'Pending';
      const hasAnyHelp = group.helpSections.some((section) => {
        if (section.helpKey && section.helpKey.trim().length > 0) return true;
        return (section.help ?? '').trim().length > 0;
      });

      return (
        <DocumentActionCard
          title={group.title}
          titleNumberOfLines={2}
          onHelp={hasAnyHelp ? () => showGroupHelp(group) : undefined}
          status={statusText}
          statusColor={accentColor}
          issuePill={issuePillForKeys(group.items.map(({ progress }) => progress.key))}
          actions={[]}
          style={styles.card}
        >
          <View style={styles.groupList}>
            {group.items.map(({ progress: docItem, def }, idx) => {
              const rowAllowedKinds = (docItem.allowedKinds ?? def.allowedKinds) as AllowedKind[] | undefined;
              const isOptional = docItem.requiredUpload === false;
              if (isOptional) {
                const isComplete = docItem.acknowledged === true;
                return (
                  <View
                    key={docItem.key}
                    style={[
                      styles.groupRow,
                      idx > 0 && styles.groupRowDivider,
                      styles.targetCardBase,
                      styles.targetCardProfile,
                    ]}
                  >
                    <View style={styles.groupLabelCol}>
                      <Text style={styles.groupLabel} numberOfLines={2}>
                        {docItem.label}
                      </Text>
                      <Text style={styles.groupStatus}>{describeStatus(docItem)}</Text>
                    </View>
                    <FloatingIconRoundButton
                      buttonType="confirm"
                      accessibilityLabel={
                        isComplete
                          ? `Mark ${docItem.label} as incomplete`
                          : `Mark ${docItem.label} as complete`
                      }
                      onPress={() => toggleOptional(docItem)}
                      size="sm"
                      hitSlop={8}
                    />
                  </View>
                );
              }

              const hasDoc = Boolean(docItem.documentId);
              const rowActions: RowActionConfig[] = [];
              if (isImageAllowed(rowAllowedKinds)) {
                rowActions.push({
                  key: `${docItem.key}-scan`,
                  icon: 'camera',
                  tone: tones.blue,
                  backgroundColor: tones.blue.base,
                  pressedBackgroundColor: tones.blue.emphasis,
                  iconColor: tones.blue.onBase,
                  onPress: () => onScan(docItem, { allowedKinds: rowAllowedKinds }),
                  accessibilityLabel: `Scan ${docItem.label}`,
                });
                rowActions.push({
                  key: `${docItem.key}-library`,
                  icon: 'library',
                  tone: tones.blue,
                  backgroundColor: tones.blue.base,
                  pressedBackgroundColor: tones.blue.emphasis,
                  iconColor: tones.blue.onBase,
                  onPress: () => onLibrary(docItem, { allowedKinds: rowAllowedKinds }),
                  accessibilityLabel: `Choose photo for ${docItem.label}`,
                });
              }
              rowActions.push({
                key: `${docItem.key}-upload`,
                icon: UPLOAD_ICON,
                tone: tones.purple,
                onPress: () => onUpload(docItem, { allowedKinds: rowAllowedKinds }),
                accessibilityLabel: `Upload ${docItem.label}`,
              });
              rowActions.push({
                key: `${docItem.key}-view`,
                icon: 'preview',
                tone: tones.blue,
                backgroundColor: tones.blue.base,
                pressedBackgroundColor: tones.blue.emphasis,
                iconColor: tones.blue.onBase,
                onPress: hasDoc ? () => onView(docItem) : undefined,
                disabled: !hasDoc,
                accessibilityLabel: `View ${docItem.label}`,
              });

              return (
                <DocumentRow
                  key={docItem.key}
                  label={docItem.label}
                  status={describeStatus(docItem)}
                  actions={rowActions}
                  divider={idx > 0}
                />
              );
            })}
          </View>
        </DocumentActionCard>
      );
    }

    const { item: progress, def } = item;
    const allowedKinds = (progress.allowedKinds ?? def.allowedKinds) as AllowedKind[] | undefined;
    const statusText = getCardStatus(progress);
    const isOptional = progress.requiredUpload === false;
    const rawCode = (def.__code ?? def.key ?? '').toUpperCase();
    if (rawCode.startsWith('SUPPORTING_STATEMENT')) {
      const completeCount = Array.from(supportingStatementsBySlot.values()).filter((item) => item.status === 'complete').length;
      const draftCount = draftSupportingStatements.length;
      const supportingStatus =
        draftCount > 0
          ? 'Draft in progress'
          : completeCount === supportingCardConfigs.length
            ? 'Complete'
            : completeCount > 0
              ? `${completeCount}/${supportingCardConfigs.length} complete`
              : 'Optional';
      return (
        <DocumentActionCard
          title={progress.label}
          titleNumberOfLines={2}
          onHelp={() => showRequirementHelp(def)}
          issuePill={issuePillForAnchor(progress.key)}
          status={supportingStatus}
          statusColor={accentColor}
          actions={[]}
          style={styles.card}
        >
          <SupportingStatementCards
            cards={supportingCardConfigs}
            statementsBySlot={supportingStatementsBySlot}
            onOpenWizard={openSupportingWizard}
            onClear={clearSupportingStatement}
          />
        </DocumentActionCard>
      );
    }
    const isCompetency = rawCode.startsWith('COMPETENCY_CERT') || rawCode.startsWith('COMPETENCY');
    const isFirearmLicenceRequirement = isFirearmLicenceRequirementCode(rawCode);
    const isSafeRequirement = progress.kind === 'SAFE' || isSafeRequirementCode(rawCode);
    const cardStyle = def.cardStyle ?? (def.allowMultipleUploads ? 'multi' : 'single');
    const isWizardFormRequirement =
      cardStyle === 'statusMini' || (rawCode.startsWith('SAPS_') && rawCode.endsWith('_FORM'));
    if (isWizardFormRequirement) {
      const getWizardRequirementState = () => {
        if (rawCode === 'SAPS_517_FORM') {
          return {
            ready: is517FormWizardReady,
            open: openForm517Wizard,
          };
        }
        return null;
      };
      const wizardState = getWizardRequirementState();
      if (wizardState) {
        const ready = wizardState.ready;
        const openWizard = wizardState.open;
        const items: ProofMiniCard[] = [
          {
            key: `${progress.key}::wizardStatus`,
            label: ready ? 'Information provided' : 'Information missing',
            onPress: openWizard,
            onPreview: openWizard,
            previewDisabled: false,
            style: [
              styles.targetCardBase,
              ready ? styles.targetCardProfile : styles.targetCardWarning,
            ],
          },
        ];
        return (
          <ProofCard
            title={progress.label}
            onHelp={() => showRequirementHelp(def)}
            issuePill={issuePillForAnchor(progress.key)}
            status={ready ? 'Ready' : 'Required'}
            statusColor={ready ? tones.green.base : tones.orange.base}
            items={items}
            helperText="Tap the card or the view button to open the wizard."
            style={styles.card}
          />
        );
      }
    }

    if (isOptional) {
      const isComplete = progress.acknowledged === true;
      return (
        <DocumentActionCard
          title={progress.label}
          titleNumberOfLines={2}
          onHelp={() => showRequirementHelp(def)}
          issuePill={issuePillForAnchor(progress.key)}
          status={statusText}
          statusColor={accentColor}
          actions={[]}
          style={styles.card}
        >
          {/* <View style={styles.optionalRow}>
            <FloatingIconRoundButton
              buttonType="confirm"
              accessibilityLabel={
                isComplete
                  ? `Mark ${progress.label} as incomplete`
                  : `Mark ${progress.label} as complete`
              }
              onPress={() => toggleOptional(progress)}
              size="sm"
            />
          </View> */}
        </DocumentActionCard>
      );
    }

    const isProofId = progress.kind === 'ID_CARD' || progress.kind === 'ID_BOOK' || progress.kind === 'PASSPORT';
    const isProofAddress = progress.kind === 'PROOF_OF_ADDRESS';
    const isAssociationProof = PROOF_CARD_CODES.has(rawCode);

    if (isProofId || isProofAddress || isAssociationProof) {
      const appDoc = (app?.docs?.documents ?? []).find((d) => {
        const code = normalizeRequirementCode(d.requirementCode);
        if (isProofId) return code === 'ID_DOC';
        if (isProofAddress) return code === 'PROOF_ADDRESS';
        return isAssociationProof && code === rawCode;
      });
      const docInstance = findInstance(progress);
      const docId =
        appDoc?.documentId ??
        docInstance?.documentId ??
        (progress.instances ?? []).find((inst) => inst.documentId)?.documentId ??
        progress.documentId ??
        undefined;
      if (!docId && (isProofId || isProofAddress)) {
        const candidate = profileDocs
          .filter((doc) => {
            if (isProofId) {
              const kind = (doc.kind as any)?.toUpperCase?.() ?? '';
              return kind === 'ID_CARD' || kind === 'ID_BOOK' || kind === 'PASSPORT';
            }
            if (isProofAddress) {
              const kind = (doc.kind as any)?.toUpperCase?.() ?? '';
              return kind === 'PROOF_OF_ADDRESS';
            }
            return false;
          })
          .slice()
          .sort((a, b) => {
            const ta = Date.parse(a.updatedAt || a.createdAt || '');
            const tb = Date.parse(b.updatedAt || b.createdAt || '');
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          })[0];
        if (candidate) {
          updateDoc(progress.key, (prev) => {
            if (prev.documentId || (prev.instances ?? []).some((inst) => !!inst.documentId)) return prev;
            const baseStatus: DocItemProgress['status'] =
              prev.status === 'verified' ? 'verified' : 'captured';
            if (prev.multiple || prev.allowMultipleUploads) {
              const nextInstance = {
                documentId: candidate.id,
                status: baseStatus,
                captureMethod: 'upload' as CaptureMethod,
                identityDocumentSide: (candidate as any).identityDocumentSide,
              } as NonNullable<DocItemProgress['instances']>[number];
              return {
                ...prev,
                instances: [nextInstance],
                status: baseStatus,
              };
            }
            return {
              ...prev,
              documentId: candidate.id,
              status: baseStatus,
              captureMethod: 'upload',
              identityDocumentSide: (candidate as any).identityDocumentSide,
            };
          });
        }
      }

      const hasDoc = Boolean(docId || hasCaptured(progress));
      const heading = isProofId
        ? idHeadingForProfile(applicantProfile)
        : isProofAddress
          ? addressHeadingForProfile(applicantProfile)
          : def.label;
      const addHandler = isProofId
        ? () => goProofIdWizard(progress.key, false)
        : isProofAddress
          ? () => goProofAddressWizard(progress.key, false)
          : () => onUpload(progress, { allowedKinds });
      const previewHandler = isProofId
        ? () => goProofIdWizard(progress.key, true)
        : isProofAddress
          ? () => goProofAddressWizard(progress.key, true)
          : hasDoc
            ? () => onView(progress)
            : undefined;
      const isSupportingRequirement = (def as any)?.isSupportingDocument !== false;
      const cardStatus = hasDoc
        ? 'Captured'
        : def.isOptional === true
          ? 'Optional document'
          : isSupportingRequirement
            ? 'Pending'
            : 'Optional document';
      const itemStatus = hasDoc ? 'Captured' : undefined;
      const itemCardStyle = hasDoc
        ? [styles.targetCardBase, styles.targetCardProfile]
        : [styles.targetCardBase, styles.targetCardSurface];
      const helperText = isProofAddress ? 'Must be less than 3 months old.' : '';

      const items: ProofMiniCard[] = [
        {
          key: `${progress.key}::single`,
          label: heading,
          status: hasDoc ? itemStatus : undefined,
          onPress: hasDoc ? previewHandler : undefined,
          onAdd: addHandler,
          onPreview: hasDoc ? previewHandler : undefined,
          onDelete: isAssociationProof && hasDoc && docId ? () => confirmRemoveProofDocument(progress, docId, heading) : undefined,
          addDisabled: hasDoc,
          previewDisabled: !hasDoc,
          deleteDisabled: !isAssociationProof || !hasDoc,
          style: itemCardStyle,
        },
      ];

      // if (devModeEnabled) {
      //   //Debugging proof card state
      //   console.log('[documents] proof-card', {
      //     key: progress.key,
      //     kind: progress.kind,
      //     status: progress.status,
      //     documentId: progress.documentId,
      //     instanceDocId: docInstance?.documentId,
      //     instances: progress.instances?.map((inst) => ({
      //       documentId: inst.documentId,
      //       status: inst.status,
      //       identityDocumentSide: inst.identityDocumentSide,
      //     })),
      //     hasDoc,
      //     buttons: {
      //       addDisabled: items[0].addDisabled,
      //       previewDisabled: items[0].previewDisabled,
      //       deleteDisabled: items[0].deleteDisabled,
      //     },
      //   });
      // }

      return (
        <ProofCard
          title={progress.label}
          onHelp={() => showRequirementHelp(def)}
          issuePill={issuePillForAnchor(progress.key)}
          status={cardStatus}
          statusColor={accentColor}
          items={items}
          itemStyle={undefined}
          helperText={helperText}
          style={styles.card}
        />
      );
    }

    if (cardStyle === 'multi') {
      if (isCompetency) {
        return (
          <CompetencyCertificatesSelectionCard
            certificates={availableCertificates}
            onAdd={() => goAddCompetency(def.key)}
            onToggleCertificate={(id) => toggleCertificateSelection(id)}
            selectedIds={new Set(effectiveCertificateIds)}
            disabledIds={disabledCertificateIds}
            onPressDisabledCertificate={(id) => {
              if (maxDisabledCertificateIds.has(String(id))) {
                showCompetencyMaxReachedAlert();
              }
            }}
            unselectedTone={unselectedMiniTone}
            returnTo={documentPathWithAnchor(def.key)}
            style={styles.card}
            issuePill={issuePillForAnchor(progress.key)}
            onHelp={() => showRequirementHelp(def)}
          />
        );
      }

      if (isFirearmLicenceRequirement) {
        return (
          <FirearmSelectionCard
            firearms={availableFirearms}
            onAdd={() => goAddFirearm(def.key)}
            onToggleFirearm={(id) => toggleFirearmSelection(id)}
            selectedIds={new Set(activeFirearmIds)}
            disabledIds={disabledFirearmIds}
            onPressDisabledFirearm={(id) => {
              if (maxDisabledFirearmIds.has(String(id))) {
                showFirearmMaxReachedAlert();
              }
            }}
            unselectedTone={unselectedMiniTone}
            returnTo={documentPathWithAnchor(def.key)}
            style={styles.card}
            issuePill={issuePillForAnchor(progress.key)}
            onHelp={() => showRequirementHelp(def)}
          />
        );
      }

      if (isSafeRequirement) {
        return (
          <SafeSelectionCard
            safes={availableSafes}
            onAdd={() => goAddSafe(def.key)}
            onToggleSafe={(id) => toggleSafeSelection(id)}
            selectedIds={new Set(effectiveSafeIds)}
            unselectedTone={unselectedMiniTone}
            returnTo={documentPathWithAnchor(def.key)}
            style={styles.card}
            issuePill={issuePillForAnchor(progress.key)}
            onHelp={() => showRequirementHelp(def)}
          />
        );
      }

      const cardStatus = getCardStatus(progress);
      return (
        <DocumentActionCard
          title={progress.label}
          titleNumberOfLines={2}
          onHelp={() => showRequirementHelp(def)}
          issuePill={issuePillForAnchor(progress.key)}
          status={cardStatus}
          statusColor={accentColor}
          actions={[]}
          style={styles.card}
          titleRowStyle={styles.cardTitleRowAligned}
        >
          <Text style={styles.emptyHint}>
            No linked items for this requirement.
          </Text>
        </DocumentActionCard>
      );
    }

    const cardActions: DocumentAction[] = [];
      if (isImageAllowed(allowedKinds)) {
        cardActions.push({
          label: 'Scan',
          icon: 'camera',
          onPress: () => onScan(progress, { allowedKinds }),
          color: tones.blue.base,
        });
        cardActions.push({
          label: 'Library',
          icon: 'library',
          onPress: () => onLibrary(progress, { allowedKinds }),
          color: tones.blue.base,
        });
      }
      cardActions.push({
        label: 'Upload',
        icon: UPLOAD_ICON,
        onPress: () => onUpload(progress, { allowedKinds }),
        color: tones.purple.base,
      });

    const hideStatusPill =
      rawCode.startsWith('MOTIVATION') ||
      rawCode.startsWith('SUPPORTING') ||
      rawCode.startsWith('PASSPORT');

    if (rawCode.startsWith('MOTIVATION')) {
      const miniText = def.help;
      const linkedMotivation = app ? resolveApplicationMotivation(app) : null;
      const motivationSource = app?.motivationSource ?? linkedMotivation?.source;
      const motivationSelection = app?.userToSubmitMotivation;
      const selectedWizard = motivationSource === 'wizard';
      const selectedYes =
        motivationSource === 'standard' ||
        (motivationSource == null && motivationSelection === true);
      const selectedNo =
        motivationSource === 'own' ||
        (motivationSource == null && motivationSelection === false);
      const wizardStatus = linkedMotivation?.wizardStatus ?? app?.motivationWizardStatus;
      const wizardDraft = selectedWizard && wizardStatus === 'draft';
      const wizardComplete = selectedWizard && wizardStatus === 'complete';
      const wizardFirearmId = activeFirearmIds[0] ? String(activeFirearmIds[0]) : '';
      const requiresMembershipForWizard = selectedFirearms.some((firearm) => {
        const rawSection = String(firearm?.section ?? '').toUpperCase();
        const normalized = rawSection.replace(/SECTION/gi, '').replace(/[^0-9]/g, '');
        return normalized === '16';
      });
      const hasSelectedSafe = effectiveSafeIds.length > 0;
      const hasSelectedCompetency = effectiveCertificateIds.length > 0;
      const hasSelectedMembership = effectiveMembershipIds.length > 0;
      const canOpenMotivationWizard =
        is518a &&
        Boolean(app?.id) &&
        Boolean(wizardFirearmId) &&
        hasSelectedCompetency &&
        hasSelectedSafe &&
        (!requiresMembershipForWizard || hasSelectedMembership);
      const motivationWizardDisabledReason = !wizardFirearmId
        ? 'Select the firearm for this 518a application to enable the wizard.'
        : !hasSelectedCompetency
          ? 'Select at least one competency certificate to enable the wizard.'
        : !hasSelectedSafe
          ? 'Select at least one safe to enable the wizard.'
          : requiresMembershipForWizard && !hasSelectedMembership
            ? 'Select at least one membership for section 16 to enable the wizard.'
            : '';
      return (
        <DocumentActionCard
          title={progress.label}
          titleNumberOfLines={2}
          onHelp={() => showRequirementHelp(def)}
          issuePill={issuePillForAnchor(progress.key)}
          status={hideStatusPill ? undefined : statusText}
          statusColor={hideStatusPill ? undefined : accentColor}
          actions={[]}
          style={styles.card}
          titleRowStyle={styles.cardTitleRowAligned}
        >
          <View style={styles.confirmationGroup}>
            {miniText ? <Text style={styles.motivationDescription}>{miniText}</Text> : null}
            {is518a ? (
              <View style={styles.motivationWizardBlock}>
                <Pressable
                  onPress={() => {
                    if (!canOpenMotivationWizard) {
                      if (!wizardFirearmId) {
                        scrollToAnchor(firearmAnchorKey);
                        return;
                      }
                      if (!hasSelectedCompetency) {
                        scrollToAnchor(competencyAnchorKey);
                        return;
                      }
                      if (!hasSelectedSafe) {
                        scrollToAnchor(safeAnchorKey);
                        return;
                      }
                      if (requiresMembershipForWizard && !hasSelectedMembership) {
                        scrollToAnchor(membershipAnchorKey);
                        return;
                      }
                      return;
                    }
                    setMotivationWizardSelection();
                    router.push({
                      pathname: '/motivation/wizard',
                      params: {
                        applicationId: String(app?.id ?? ''),
                        firearmId: wizardFirearmId,
                        selectedMembershipIds: JSON.stringify(effectiveMembershipIds),
                        selectedSafeIds: JSON.stringify(effectiveSafeIds),
                        returnTo: documentPathWithAnchor(progress.key),
                      },
                    } as any);
                  }}
                  style={({ pressed }) => [
                    styles.motivationChoiceButton,
                    wizardDraft ? styles.motivationChoiceButtonWizardDraftActive : null,
                    wizardComplete ? styles.motivationChoiceButtonWizardCompleteActive : null,
                    !canOpenMotivationWizard ? styles.motivationWizardButtonDisabled : null,
                    pressed && canOpenMotivationWizard ? styles.motivationChoiceButtonPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canOpenMotivationWizard, selected: selectedWizard }}
                >
                  <Text
                    style={[
                      styles.motivationChoiceText,
                      wizardDraft ? styles.motivationChoiceTextWizardDraftActive : null,
                      wizardComplete ? styles.motivationChoiceTextWizardCompleteActive : null,
                      !canOpenMotivationWizard ? styles.motivationWizardButtonTextDisabled : null,
                    ]}
                  >
                    Create motivation using wizard
                  </Text>
                </Pressable>
                {!canOpenMotivationWizard ? (
                  <Text style={styles.motivationWizardHint}>
                    {motivationWizardDisabledReason}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.motivationChoiceRow}>
              <Pressable
                onPress={() => setMotivationSelection(true)}
                style={({ pressed }) => [
                  styles.motivationChoiceButton,
                  selectedYes ? styles.motivationChoiceButtonYesActive : null,
                  pressed ? styles.motivationChoiceButtonPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedYes }}
              >
                <Text
                  style={[
                    styles.motivationChoiceText,
                    selectedYes ? styles.motivationChoiceTextYesActive : null,
                  ]}
                >
                  Use standard motivation text
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMotivationSelection(false)}
                style={({ pressed }) => [
                  styles.motivationChoiceButton,
                  selectedNo ? styles.motivationChoiceButtonNoActive : null,
                  pressed ? styles.motivationChoiceButtonPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedNo }}
              >
                <Text
                  style={[
                    styles.motivationChoiceText,
                    selectedNo ? styles.motivationChoiceTextNoActive : null,
                  ]}
                >
                  I'll use my own motivation
                </Text>
              </Pressable>
            </View>
          </View>
        </DocumentActionCard>
      );
    }

    return (
      <DocumentActionCard
        title={progress.label}
        titleNumberOfLines={2}
        onHelp={() => showRequirementHelp(def)}
        issuePill={issuePillForAnchor(progress.key)}
        status={hideStatusPill ? undefined : statusText}
        statusColor={hideStatusPill ? undefined : accentColor}
        actions={cardActions}
        style={styles.card}
        titleRowStyle={styles.cardTitleRowAligned}
      />
    );
  };

  if (!app) {
    return (
      <Screen>
        <View style={{ padding: 20 }}>
          <Text style={{ color: neutral.onSurface, fontWeight: '700', fontSize: 18 }}>Application not found</Text>
          <Pressable style={styles.backBtn} onPress={goClose}>
            <Text style={styles.backBtnTxt}>Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {previewDoc && previewUri ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={closePreview}
        >
          <Pressable style={styles.previewBackdrop} onPress={closePreview}>
            <Pressable
              style={styles.previewCard}
              onPress={(e) => {
                if ('stopPropagation' in e) {
                  // @ts-ignore - PressEvent stopPropagation exists at runtime
                  e.stopPropagation();
                }
              }}
            >
              <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
              <Text style={styles.previewTitle} numberOfLines={2}>{previewTitle}</Text>
              <Pressable style={styles.previewCloseBtn} onPress={closePreview}>
                <Text style={styles.previewCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      <View style={styles.wrap}>
        <View
          onLayout={(event) => {
            headerHeightRef.current = event.nativeEvent.layout.height;
          }}
        >
          <PageHeader
            title="Required Documents"
            onClose={goClose}
            style={styles.header}
          />
        </View>
        {devModeEnabled === true && app?.docs?.documents?.length ? (
          <View style={styles.devCard}>
            <Text style={styles.devCardTitle}>App documents (debug)</Text>
            <ScrollView
              style={styles.devCardScroll}
              contentContainerStyle={[styles.devCardContent, { paddingBottom: 4 + insets.bottom }]}
            >
              {app.docs.documents.map((doc, idx) => (
                <Text key={`${doc.documentId ?? 'doc'}::${idx}`} style={styles.devCardRow}>
                  {`\u2022 ${doc.kind ?? 'UNKNOWN'} — ${doc.documentId ?? 'none'}`}
                </Text>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <PageFlatList
          ref={flatListRef as any}
          data={listData as any[]}
          keyExtractor={(d: any) => d.key}
          renderItem={renderItem as ListRenderItem<any>}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={styles.lead}>
                Select and review the documents required for this application on this screen.
                If any document needs to be added or updated you can do that from here.
              </Text>
            </View>
          }
          onContentSizeChange={(_, height) => {
            listContentHeightRef.current = height;
          }}
          ListFooterComponent={
            <View
              style={styles.footerActions}
              onLayout={(event) => {
                declarationsFooterHeightRef.current = event.nativeEvent.layout.height;
              }}
            >
              {acknowledgementCard}
              {showSubmitButton && documentsWarningCard ? (
                <Pressable
                  onPress={() => {
                    setShowIssuePills(true);
                    if (documentsWarningCard.firstAnchor) {
                      scrollToAnchor(documentsWarningCard.firstAnchor);
                    } else {
                      Alert.alert('Warnings', 'No direct section link is available for these warnings yet.');
                    }
                  }}
                  style={({ pressed }) => [
                    styles.reviewCardWrap,
                    pressed ? styles.reviewCardPressed : null,
                  ]}
                  accessibilityRole="button"
                >
                  <DocumentActionCard
                    title={documentsWarningCard.heading}
                    actions={[]}
                    style={styles.reviewCard}
                    titleStyle={styles.reviewTitle}
                  >
                    <View style={styles.reviewList}>
                      {documentsWarningCard.items.map((item, idx) => (
                        <View key={`${item}-${idx}`} style={styles.reviewItem}>
                          <Text style={styles.reviewBullet}>{'\u2022'}</Text>
                          <Text style={styles.reviewText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </DocumentActionCard>
                </Pressable>
              ) : null}
              {showSubmitButton ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    submitReady ? styles.submitBtnReady : styles.submitBtnWarning,
                    pressed && styles.submitBtnPressed,
                  ]}
                  onPress={handleSubmitPress}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: submitDisabled }}
                >
                  <Text style={[
                    styles.submitBtnTxt,
                    submitReady ? styles.submitBtnTxtReady : styles.submitBtnTxtWarning,
                  ]}
                  >Submit</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      </View>
      <HelpModal {...helpModalProps} />
    </Screen>
  );
};

export default ApplicationDocumentsScreen;

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    wrap: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    devCard: {
      marginTop: 8,
      marginHorizontal: 20,
      padding: 10,
      borderRadius: 10,
      backgroundColor: neutral.onBase,
      borderWidth: 1,
      borderColor: neutral.border,
      gap: 4,
      maxHeight: '33%',
      overflow: 'hidden',
    },
    devCardScroll: {
      maxHeight: '100%',
    },
    intro: { marginTop: 12, marginBottom: 4, gap: 10 },
    lead: { fontSize: 14, lineHeight: 20, color: neutral.base },
    devCardTitle: { fontWeight: '700', color: neutral.base, fontSize: 12 },
    devCardRow: { color: neutral.onSurface, fontSize: 12, lineHeight: 16 },
    devCardContent: { paddingVertical: 4, gap: 4 },
    devCardHeader: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      maxWidth: 200,
    },
    devCardContentHeader: {
      marginTop: 4,
      gap: 4,
    },
    listContent: { paddingBottom: 24 },
    membershipDetails: { gap: 6 },
    membershipDetailText: { color: neutral.base, fontSize: 13 },
    card: { marginTop: 10, overflow: 'hidden' },
    footerCard: { overflow: 'hidden' },
    cardTitleRowAligned: { alignItems: 'center' },
    targetCardBase: { borderRadius: 14, borderWidth: 1 },
    targetCardProfile: {
      backgroundColor: tones.teal.surface,
      borderColor: tones.teal.base,
    },
    targetCardSurface: {
      backgroundColor: neutral.onBase,
      borderColor: neutral.border,
    },
    targetCardWarning: {
      backgroundColor: tones.orange.surface,
      borderColor: tones.orange.emphasis,
    },
    targetCardFirearm: {
      backgroundColor: tones.orange.surface,
      borderColor: tones.orange.border,
    },
    groupList: { gap: 12 },
    activityEvidenceItem: { padding: 12 },
    activityEvidenceTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 10,
    },
    activityEvidenceActions: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    activityCheck: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    activityCheckIdle: {
      borderColor: tones.purple.border,
      backgroundColor: neutral.onBase,
    },
    activityCheckActive: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.base,
    },
    activityViewButton: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tones.blue.base,
    },
    activityEvidenceHint: {
      color: tones.orange.base,
      fontSize: 12,
      fontStyle: 'italic',
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    groupRowTinted: {
      borderRadius: 12,
      padding: 12,
      shadowColor: 'rgba(0,0,0,0.2)',
      shadowOpacity: 0.05,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    groupRowPressable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    groupRowPressed: { opacity: 0.9 },
    groupRowDivider: { borderTopWidth: 1, borderTopColor: neutral.border, paddingTop: 12, marginTop: 12 },
    groupLabelCol: { flex: 1, gap: 4 },
    groupLabel: { color: neutral.onSurface, fontWeight: '600', fontSize: 14 },
    groupStatus: { color: neutral.base, fontSize: 12, fontWeight: '600' },
    groupActions: { alignItems: 'center' },
    optionalRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    emptyHint: { color: neutral.base, fontSize: 12, fontStyle: 'italic', alignSelf: 'flex-start', marginTop: 4 },

    backBtn: { marginTop: 10, borderWidth: 1, borderColor: neutral.border, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    backBtnTxt: { color: neutral.onSurface, fontWeight: '700' },
    footerActions: { marginTop: 10, gap: 12 },
    reviewCardWrap: { borderRadius: 16 },
    reviewCardPressed: { opacity: 0.96 },
    reviewCard: { backgroundColor: tones.orange.surface, borderColor: tones.orange.emphasis },
    reviewTitle: { color: tones.orange.base },
    reviewList: { gap: 10 },
    reviewItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    reviewBullet: { color: tones.orange.base, fontSize: 16, lineHeight: 20, fontWeight: '700' },
    reviewText: { flex: 1, color: tones.orange.base, fontWeight: '600', lineHeight: 20 },
    submitBtn: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnWarning: {
      backgroundColor: tones.orange.base,
    },
    submitBtnReady: {
      backgroundColor: tones.green.base,
    },
    submitBtnPressed: { opacity: 0.92 },
    submitBtnTxt: { fontWeight: '700', fontSize: 16 },
    submitBtnTxtWarning: { color: tones.orange.onBase, fontWeight: '700', fontSize: 16 },
    submitBtnTxtReady: { color: tones.green.onBase, fontWeight: '700', fontSize: 16 },
    confirmationGroup: { gap: 12 },
    motivationDescription: {
      fontSize: 13,
      color: neutral.base,
      fontWeight: '600',
      lineHeight: 18,
    },
    confirmationMiniCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 12,
      backgroundColor: neutral.onBase,
      borderColor: neutral.border,
    },
    confirmationMiniTop: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'flex-start',
      gap: 12,
    },
    confirmationMiniHeadingWrap: {
      flex: 1,
      gap: 4,
    },
    confirmationMiniHeading: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: neutral.onSurface,
    },
    confirmationMiniMeta: {
      fontSize: 13,
      color: neutral.base,
      fontWeight: '600',
      lineHeight: 18,
    },
    confirmationMiniCheckRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    confirmationMiniCheck: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    confirmationMiniCheckIdle: {
      borderColor: tones.purple.border,
      backgroundColor: neutral.onBase,
    },
    confirmationMiniCheckActive: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.base,
    },
    motivationChoiceRow: {
      width: '100%',
      flexDirection: 'column',
      gap: 12,
    },
    motivationChoiceButton: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: neutral.onBase,
      minWidth: 48,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    motivationChoiceButtonYesActive: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    motivationChoiceButtonNoActive: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    motivationChoiceButtonPressed: {
      opacity: 0.92,
    },
    motivationChoiceText: {
      fontSize: 13,
      fontWeight: '700',
      color: neutral.onSurface,
    },
    motivationChoiceTextYesActive: {
      color: tones.teal.base,
    },
    motivationChoiceTextNoActive: {
      color: tones.teal.base,
    },
    motivationChoiceButtonWizardDraftActive: {
      borderColor: tones.orange.base,
      backgroundColor: tones.orange.surface,
    },
    motivationChoiceButtonWizardCompleteActive: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    motivationChoiceTextWizardDraftActive: {
      color: tones.orange.base,
    },
    motivationChoiceTextWizardCompleteActive: {
      color: tones.teal.base,
    },
    motivationSelectionStateRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    motivationSelectionStateText: {
      fontSize: 12,
      fontWeight: '600',
      color: neutral.base,
    },
    motivationWizardBlock: { gap: 6 },
    motivationWizardButtonDisabled: {
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
    },
    motivationWizardButtonTextDisabled: {
      color: neutral.base,
    },
    motivationWizardHint: {
      fontSize: 12,
      lineHeight: 16,
      color: neutral.base,
    },
    targetPressable: { borderRadius: 14 },
    targetPressed: { opacity: 0.95 },
    targetCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 16,
      backgroundColor: neutral.onBase,
    },
    targetHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    targetTitle: { fontSize: 15, fontWeight: '700', color: neutral.onSurface, flex: 1 },
    targetStatus: { fontSize: 13, fontWeight: '600', color: neutral.base },
    targetActionsRow: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'flex-end', marginLeft: 'auto', alignSelf: 'stretch' },
    previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    previewCard: { width: '100%', maxWidth: 420, backgroundColor: neutral.onBase, borderRadius: 18, padding: 16, gap: 12, alignItems: 'center' },
    previewImage: { width: '100%', height: 320, borderRadius: 12, backgroundColor: neutral.surface },
    previewTitle: { color: neutral.onSurface, fontWeight: '700', fontSize: 16, textAlign: 'center' },
    previewCloseBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, backgroundColor: neutral.border },
    previewCloseText: { color: neutral.onSurface, fontWeight: '700' },
  });
