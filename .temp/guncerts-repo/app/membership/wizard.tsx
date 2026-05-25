import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TextInput, Pressable, type AlertButton } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import Button from '../../src/components/Button';
import ButtonSave from '../../src/components/ButtonSave';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import DocumentActionCard from '../../src/components/DocumentActionCard';
import CollapseToggleChip from '../../src/components/CollapseToggleChip';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import { useTones } from '../../src/theme/tones';
import { Document, EndorsementCategory, Firearm, Membership, MembershipDocument, Profile, UserPrefs } from '../../src/data/types';
import { ensureUserPrefs, persist, persistAsync, saveUserPrefs, touch, withMeta } from '../../src/data/repo';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import policy518a from '../../src/policy/518a.json';
import { formatEndorsementDisplayLabel, formatFirearmTitle } from '../../src/utils/firearmDisplay';
import { useDevMode } from '../../src/providers/DevModeProvider';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import HelpModal from '../../src/components/HelpModal';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import { rasterizePdf } from '../../src/pdf/rasterizer';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { base64ToUint8 } from '../../src/pdf/utils';
import { useHelpModal } from '../../src/help';
import { getMembershipDocumentLabel } from '../../src/utils/membershipDocumentLabels';
import { maskDateYYYYMMDD } from '../../src/utils/dateInput';
import {
  buildWizardBlockingResult,
  showWizardBlockingAlert,
  type WizardBlockingIssue,
} from '../../src/utils/wizardBlockingValidation';

type MembershipDocKey = 'membership' | 'letter' | 'dedicatedHunter' | 'dedicatedSport';
const ENDORSEMENT_KIND: MembershipDocument = 'FIREARM_ENDORSEMENT';
const ENDORSEMENT_CATEGORIES: Array<{ value: EndorsementCategory; label: string }> = [
  { value: 'SELF_DEFENCE', label: 'Self defence' },
  { value: 'HUNTING', label: 'Hunting' },
  { value: 'SPORT_SHOOTING', label: 'Sport shooting' },
];
const ENDORSEMENT_CATEGORY_LABELS = new Map<EndorsementCategory, string>(
  ENDORSEMENT_CATEGORIES.map((item) => [item.value, item.label]),
);
type MembershipDocumentDateState = {
  issueDate: string;
  expiryDate: string;
};

type PolicyDoc = {
  code?: string;
  displayOrder?: number;
  label?: string;
  description?: string;
  required?: boolean;
};

type DocConfig = {
  key: MembershipDocKey;
  kind: MembershipDocument;
  label: string;
  description?: string;
  required?: boolean;
};

type MembershipDateCellProps = {
  label: string;
  value?: string;
  onChangeText: (value: string) => void;
  error?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  styles: ReturnType<typeof createStyles>;
  neutralBorder: string;
};

const MembershipDateCell: React.FC<MembershipDateCellProps> = ({
  label,
  value,
  onChangeText,
  error,
  inputRef,
  styles,
  neutralBorder,
}) => {
  const rawValue = typeof value === 'string' ? value : '';
  return (
    <View style={styles.cellWrap}>
      <Text style={styles.cellLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={rawValue}
        onChangeText={(next) => onChangeText(maskDateYYYYMMDD(next))}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={neutralBorder}
        style={[styles.cellInput, error && styles.cellInputError]}
        autoCapitalize="none"
        keyboardType="number-pad"
        autoCorrect={false}
      />
    </View>
  );
};

async function getPdfPageCount(uri: string): Promise<number | null> {
  try {
    const resolved = resolveDocumentUri(uri) ?? uri;
    const data = await FileSystem.readAsStringAsync(resolved, {
      encoding: FileSystem.EncodingType.Base64,
    } as any);
    const bytes = base64ToUint8(data);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch (error) {
    logger.warn('[membership/wizard] Failed to read PDF page count', error);
    return null;
  }
}

type Params = {
  returnTo?: string | string[];
  completeReturnTo?: string | string[];
  membershipId?: string | string[];
  intro?: string | string[];
  nav?: string | string[];
};

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile';
const WIZARD_HELP_KEY = 'helpWizardMembership';

const initialDocs: Record<MembershipDocKey, Document | null> = {
  membership: null,
  letter: null,
  dedicatedHunter: null,
  dedicatedSport: null,
};
const initialDocDateState: Record<MembershipDocKey, MembershipDocumentDateState> = {
  membership: { issueDate: '', expiryDate: '' },
  letter: { issueDate: '', expiryDate: '' },
  dedicatedHunter: { issueDate: '', expiryDate: '' },
  dedicatedSport: { issueDate: '', expiryDate: '' },
};

const normalizeRotation = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeDateInput = (value?: string | null) => `${value ?? ''}`.trim();
const validateDateISO = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isFutureDateISO = (value: string) => {
  if (!validateDateISO(value)) return false;
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return value > todayKey;
};
const todayDateISO = () => {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatFirearmSubtitle = (firearm: Firearm) => {
  const rawType = (firearm.firearmType ?? '').trim();
  const type = rawType === 'HandMachineCarbine' ? 'Hand Machine Carbine' : rawType;
  const action = (firearm.firearmAction ?? '').trim();
  if (type && action) return `${type} (${action})`;
  if (type) return type;
  if (action) return action;
  return 'Firearm details';
};

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

const parseNavParam = (raw?: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
};

export default function MembershipWizardScreen() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const bullet = (text: string, key: string) => (
    <View key={key} style={styles.bulletRow}>
      <Text style={styles.bulletMarker}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
  const params = useLocalSearchParams<Params>();
  const scrollRef = useRef<ScrollView | null>(null);
  const cardPositionsRef = useRef<Partial<Record<MembershipDocKey, number>>>({});
  const endorsementCardPositionsRef = useRef<Record<string, number>>({});
  const endorsementsSectionYRef = useRef<number | null>(null);
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const deletedDocIdsRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);

  const { devModeEnabled } = useDevMode();
  const { open: openHelp, props: helpModalProps } = useHelpModal();

  const navPayload = useMemo(
    () => parseNavParam(Array.isArray(params.nav) ? params.nav[0] : params.nav),
    [params.nav],
  );
  const navCtx = useMemo(
    () =>
      decodeNav({
        ...(navPayload ?? {}),
        returnTo: Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
        onComplete: Array.isArray(params.completeReturnTo) ? params.completeReturnTo[0] : params.completeReturnTo,
      }),
    [navPayload, params.completeReturnTo, params.returnTo],
  );
  const returnToPath = navCtx.routeBack || navCtx.returnTo || defaultReturnPath;
  const completeReturnPath = navCtx.onComplete || returnToPath;
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);
  const membershipIdParam = useMemo(() => {
    const raw = Array.isArray(params.membershipId) ? params.membershipId[0] : params.membershipId;
    const trimmed = `${raw ?? ''}`.trim();
    return trimmed || null;
  }, [params.membershipId]);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing...');
  const [step, setStep] = useState<'info' | 'capture'>('info');
  const [associationName, setAssociationName] = useState('');
  const [enrolledAt, setEnrolledAt] = useState('');
  const [membershipExpiresAt, setMembershipExpiresAt] = useState('');
  const [holderProfileId, setHolderProfileId] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<MembershipDocKey, Document | null>>(initialDocs);
  const [docDates, setDocDates] = useState<Record<MembershipDocKey, MembershipDocumentDateState>>(initialDocDateState);
  const [endorsementDocs, setEndorsementDocs] = useState<Record<string, Document | null>>({});
  const [endorsementIssueDates, setEndorsementIssueDates] = useState<Record<string, string>>({});
  const [endorsementCategories, setEndorsementCategories] = useState<Record<string, EndorsementCategory | ''>>({});
  const [endorsementFirearmByRow, setEndorsementFirearmByRow] = useState<Record<string, string>>({});
  const [pendingRotationByDoc, setPendingRotationByDoc] = useState<Partial<Record<MembershipDocKey, number>>>({});
  const [pendingRotationByEndorsement, setPendingRotationByEndorsement] = useState<Record<string, number>>({});
  const [endorsementsExpanded, setEndorsementsExpanded] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showWizardHints, setShowWizardHints] = useState(true);
  const [prefsProfileId, setPrefsProfileId] = useState<string | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const baselineSignatureRef = useRef<string | null>(null);
  const previousDocIdsRef = useRef<Partial<Record<MembershipDocKey, string | null>>>({});
  const previousEndorsementDocIdsRef = useRef<Record<string, string | null>>({});
  const [baselineReady, setBaselineReady] = useState(false);
  const [showBlockingIssues, setShowBlockingIssues] = useState(false);
  const [duplicateCategoryHighlight, setDuplicateCategoryHighlight] = useState<{
    firearmId: string;
    category: EndorsementCategory;
  } | null>(null);
  const associationInputRef = useRef<TextInput | null>(null);
  const enrolledAtInputRef = useRef<TextInput | null>(null);
  const membershipExpiryInputRef = useRef<TextInput | null>(null);

const policyDocs = useMemo(() => {
  const docs = Array.isArray((policy518a as any)?.requirements)
    ? (policy518a as any).requirements
    : [];
  return docs
    .filter((doc: any) => {
      const code = `${doc?.code ?? ''}`.toUpperCase();
      return code === 'ASSOCIATION_MEMBERSHIP'
        || code === 'ASSOCIATION_LETTER'
        || code === 'DEDICATED_HUNTER_CERT'
        || code === 'DEDICATED_SPORT_CERT';
    }) as PolicyDoc[];
}, []);

  const docConfigsArray = useMemo(() => {
  const mapKey = (code?: string): MembershipDocKey | null => {
    const c = `${code ?? ''}`.toUpperCase();
    if (c === 'ASSOCIATION_MEMBERSHIP') return 'membership';
    if (c === 'ASSOCIATION_LETTER') return 'letter';
    if (c === 'DEDICATED_HUNTER_CERT') return 'dedicatedHunter';
    if (c === 'DEDICATED_SPORT_CERT') return 'dedicatedSport';
    return null;
  };
  const out = policyDocs
    .slice()
    .sort((a, b) => {
      const da = Number.isFinite(a.displayOrder as number) ? (a.displayOrder as number) : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(b.displayOrder as number) ? (b.displayOrder as number) : Number.POSITIVE_INFINITY;
      return da - db;
    })
    .map((doc) => {
      const key = mapKey(doc.code);
      if (!key) return null;
      return {
        ...doc,
        key,
        kind: (doc.code as MembershipDocument) ?? 'ASSOCIATION_MEMBERSHIP',
        label: getMembershipDocumentLabel(doc.code) || doc.label || key,
        description: doc.description,
      } as DocConfig;
    })
    .filter(Boolean) as DocConfig[];
  const ensure = (key: MembershipDocKey, kind: MembershipDocument, label: string) => {
    if (!out.find((cfg) => cfg.key === key)) {
      out.push({ key, kind, label });
    }
  };
  ensure('membership', 'ASSOCIATION_MEMBERSHIP', getMembershipDocumentLabel('ASSOCIATION_MEMBERSHIP') ?? 'Association membership');
  ensure('letter', 'ASSOCIATION_LETTER', getMembershipDocumentLabel('ASSOCIATION_LETTER') ?? 'Proof of membership');
  ensure('dedicatedHunter', 'DEDICATED_HUNTER_CERT', getMembershipDocumentLabel('DEDICATED_HUNTER_CERT') ?? 'Dedicated hunter certificate');
  ensure('dedicatedSport', 'DEDICATED_SPORT_CERT', getMembershipDocumentLabel('DEDICATED_SPORT_CERT') ?? 'Dedicated sport certificate');
  const rank: Record<MembershipDocKey, number> = {
    letter: 0,
    membership: 1,
    dedicatedHunter: 2,
    dedicatedSport: 3,
  };
  return out.sort((a, b) => rank[a.key] - rank[b.key]);
}, [policyDocs]);

const docConfigMap = useMemo(() => {
  const map = new Map<MembershipDocKey, DocConfig>();
  docConfigsArray.forEach((cfg) => map.set(cfg.key, cfg));
  return map;
}, [docConfigsArray]);

const captureOrder = useMemo(() => docConfigsArray.map((cfg) => cfg.key), [docConfigsArray]);

const endorsementFirearms = useMemo(() => {
  const all = listByType<Firearm>('Firearm');
  const filtered = holderProfileId
    ? all.filter((item) => String(item.holderProfileId ?? '') === String(holderProfileId))
    : all;
  return filtered
    .slice()
    .sort((a, b) => {
      const sectionA = String(a.section ?? '').trim().toLowerCase();
      const sectionB = String(b.section ?? '').trim().toLowerCase();
      if (sectionA !== sectionB) return sectionA.localeCompare(sectionB);
      const typeA = String(a.firearmType ?? '').trim().toLowerCase();
      const typeB = String(b.firearmType ?? '').trim().toLowerCase();
      if (typeA !== typeB) return typeA.localeCompare(typeB);
      const makeA = String(a.make ?? '').trim().toLowerCase();
      const makeB = String(b.make ?? '').trim().toLowerCase();
      if (makeA !== makeB) return makeA.localeCompare(makeB);
      const modelA = String(a.model ?? '').trim().toLowerCase();
      const modelB = String(b.model ?? '').trim().toLowerCase();
      if (modelA !== modelB) return modelA.localeCompare(modelB);
      const serialA = String(a.firearmSerialNumber ?? '').trim().toLowerCase();
      const serialB = String(b.firearmSerialNumber ?? '').trim().toLowerCase();
      return serialA.localeCompare(serialB);
    });
}, [holderProfileId]);

  const endorsementRowsByFirearm = useMemo(() => {
    const grouped = new Map<string, string[]>();
    endorsementFirearms.forEach((firearm) => {
      const firearmId = String(firearm.id ?? '');
      if (!firearmId) return;
      grouped.set(firearmId, []);
    });
    Object.entries(endorsementFirearmByRow).forEach(([rowId, firearmId]) => {
      const key = String(firearmId ?? '').trim();
      if (!key) return;
      const bucket = grouped.get(key) ?? [];
      bucket.push(rowId);
      grouped.set(key, bucket);
    });
    endorsementFirearms.forEach((firearm) => {
      const firearmId = String(firearm.id ?? '');
      if (!firearmId) return;
      const bucket = grouped.get(firearmId) ?? [];
      const hasIncompleteRow = bucket.some((rowId) => {
        const hasDoc = !!endorsementDocs[rowId];
        const hasCategory = !!endorsementCategories[rowId];
        return !hasDoc || !hasCategory;
      });
      if (!bucket.length || !hasIncompleteRow) {
        const nextDraftIndex =
          bucket
            .map((rowId) => {
              const match = new RegExp(`^new:${firearmId}:(\\d+)$`).exec(rowId);
              return match ? Number(match[1]) : 0;
            })
            .reduce((max, value) => (value > max ? value : max), 0) + 1;
        bucket.push(`new:${firearmId}:${nextDraftIndex}`);
      }
      grouped.set(firearmId, bucket);
    });
    return grouped;
  }, [endorsementCategories, endorsementDocs, endorsementFirearmByRow, endorsementFirearms]);

  const signatureForState = useCallback(
    (
      name: string,
      membershipDates: { enrolledAt: string; membershipExpiresAt: string },
      stateDocs: Record<MembershipDocKey, Document | null>,
      stateDocDates: Record<MembershipDocKey, MembershipDocumentDateState>,
      stateEndorsements: Record<string, Document | null>,
      stateEndorsementIssueDates: Record<string, string>,
      stateEndorsementCategories: Record<string, EndorsementCategory | ''>,
      stateEndorsementFirearmByRow: Record<string, string>,
    ) => {
      const docSig = (doc: Document | null) => (doc ? `${doc.id}:${doc.updatedAt ?? doc.createdAt ?? ''}` : '');
      const docDateSig = (key: MembershipDocKey) =>
        `${normalizeDateInput(stateDocDates[key]?.issueDate)}:${normalizeDateInput(stateDocDates[key]?.expiryDate)}`;
      const endorsementSig = Object.entries(stateEndorsements)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([rowId, doc]) =>
          `${rowId}:${stateEndorsementFirearmByRow[rowId] ?? ''}:${docSig(doc)}:${normalizeDateInput(stateEndorsementIssueDates[rowId])}:${stateEndorsementCategories[rowId] ?? ''}`
        )
        .join(',');
      return [
        name.trim().toLowerCase(),
        normalizeDateInput(membershipDates.enrolledAt),
        normalizeDateInput(membershipDates.membershipExpiresAt),
        ...captureOrder.map(key => `${docSig(stateDocs[key] ?? null)}:${docDateSig(key)}`),
        endorsementSig,
      ].join('|');
    },
  [captureOrder],
  );

const currentSignature = useMemo(
  () =>
    signatureForState(
      associationName,
      { enrolledAt, membershipExpiresAt },
      docs,
      docDates,
      endorsementDocs,
      endorsementIssueDates,
      endorsementCategories,
      endorsementFirearmByRow,
    ),
  [
    associationName,
    docDates,
    docs,
    endorsementCategories,
    endorsementDocs,
    endorsementFirearmByRow,
    endorsementIssueDates,
    enrolledAt,
    membershipExpiresAt,
    signatureForState,
  ],
);

  const scrollToDoc = useCallback(
  (key: MembershipDocKey) => {
    const y = cardPositionsRef.current[key];
    if (typeof y !== 'number') return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  },
  [],
);

const scrollToNextDoc = useCallback(
  (current: MembershipDocKey) => {
    const idx = captureOrder.indexOf(current);
    const next = idx >= 0 ? captureOrder[idx + 1] : null;
    if (next) {
      scrollToDoc(next);
      return;
    }
    scrollRef.current?.scrollToEnd?.({ animated: true });
  },
  [captureOrder, scrollToDoc],
);

const introText =
  docConfigMap.get('membership')?.description ||
  'Capture your association membership documents so they are ready for licence applications.';
const pageTitle = 'Membership';

  useEffect(() => {
    const profile = listByType<Profile>('Profile')[0];
    if (profile) {
      setHolderProfileId(profile.id);
      setPrefsProfileId(profile.id);
      const prefs = ensureUserPrefs(profile.id);
      setUserPrefs(prefs);
      const show = prefs.showMembershipWizardHint !== false;
      setShowWizardHints(show);
      setStep(show ? 'info' : 'capture');
    }
  }, []);

  useEffect(() => {
    if (!membershipIdParam) return;
    const existing = getById<Membership>(membershipIdParam);
    if (!existing) return;
    setMembershipId(existing.id);
    setAssociationName(existing.associationName ?? '');
    setEnrolledAt(existing.enrolledAt ?? '');
    setMembershipExpiresAt(existing.membershipExpiresAt ?? '');
    setIsEditMode(true);
    setStep('capture');

    const allDocs = listByType<Document>('Document').filter(
      (doc) => doc.parentType === 'Membership' && doc.parentId === existing.id
    );
    const nextDocs: Record<MembershipDocKey, Document | null> = { ...initialDocs };
    const nextDocDates: Record<MembershipDocKey, MembershipDocumentDateState> = {
      membership: { issueDate: '', expiryDate: '' },
      letter: { issueDate: '', expiryDate: '' },
      dedicatedHunter: { issueDate: '', expiryDate: '' },
      dedicatedSport: { issueDate: '', expiryDate: '' },
    };
    const nextEndorsements: Record<string, Document | null> = {};
    const nextEndorsementIssueDates: Record<string, string> = {};
    const nextEndorsementCategories: Record<string, EndorsementCategory | ''> = {};
    const nextEndorsementFirearmByRow: Record<string, string> = {};
    const matchDoc = (kind: MembershipDocument) =>
      allDocs.find(
        (doc) =>
          (doc.kind as MembershipDocument) === kind ||
          (doc.requirementCode ?? '').toUpperCase() === kind
      ) || null;
    nextDocs.membership = matchDoc('ASSOCIATION_MEMBERSHIP');
    nextDocs.letter = matchDoc('ASSOCIATION_LETTER');
    nextDocs.dedicatedHunter = matchDoc('DEDICATED_HUNTER_CERT');
    nextDocs.dedicatedSport = matchDoc('DEDICATED_SPORT_CERT');
    allDocs.forEach((doc) => {
      const code = String(doc.requirementCode ?? doc.kind ?? '').toUpperCase();
      if (code !== ENDORSEMENT_KIND) return;
      const firearmId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
      if (!firearmId) return;
      const rowId = String(doc.id);
      nextEndorsements[rowId] = doc;
      nextEndorsementFirearmByRow[rowId] = firearmId;
    });
    (existing.membershipDocumentIds ?? []).forEach((entry) => {
      const code = String(entry?.kind ?? '').toUpperCase() as MembershipDocument;
      if (code === ENDORSEMENT_KIND) {
        const rowId = String(entry.documentId ?? '').trim();
        if (!rowId) return;
        const match = allDocs.find((doc) => String(doc.id) === rowId);
        const firearmId =
          String((entry as any).relatedFirearmId ?? '').trim() ||
          (match?.requirementRelatedId ? String(match.requirementRelatedId) : '');
        if (firearmId) nextEndorsementFirearmByRow[rowId] = firearmId;
        nextEndorsementIssueDates[rowId] = normalizeDateInput(entry.issueDate);
        const categoryRaw = String((entry as any).category ?? '').trim().toUpperCase();
        nextEndorsementCategories[rowId] =
          categoryRaw === 'SELF_DEFENCE' || categoryRaw === 'HUNTING' || categoryRaw === 'SPORT_SHOOTING'
            ? (categoryRaw as EndorsementCategory)
            : '';
        return;
      }
      const key =
        code === 'ASSOCIATION_MEMBERSHIP' ? 'membership' :
        code === 'ASSOCIATION_LETTER' ? 'letter' :
        code === 'DEDICATED_HUNTER_CERT' ? 'dedicatedHunter' :
        code === 'DEDICATED_SPORT_CERT' ? 'dedicatedSport' :
        null;
      if (!key) return;
      nextDocDates[key] = {
        issueDate: normalizeDateInput(entry.issueDate),
        expiryDate: normalizeDateInput(entry.expiryDate),
      };
    });
    setDocs(nextDocs);
    setDocDates(nextDocDates);
    setEndorsementDocs(nextEndorsements);
    setEndorsementIssueDates(nextEndorsementIssueDates);
    setEndorsementCategories(nextEndorsementCategories);
    setEndorsementFirearmByRow(nextEndorsementFirearmByRow);
    baselineSignatureRef.current = signatureForState(
      existing.associationName ?? '',
      {
        enrolledAt: existing.enrolledAt ?? '',
        membershipExpiresAt: existing.membershipExpiresAt ?? '',
      },
      nextDocs,
      nextDocDates,
      nextEndorsements,
      nextEndorsementIssueDates,
      nextEndorsementCategories,
      nextEndorsementFirearmByRow,
    );
    setBaselineReady(true);
  }, [membershipIdParam, signatureForState]);

  useEffect(() => {
    if (baselineReady) return;
    if (membershipIdParam) return;
    baselineSignatureRef.current = signatureForState(
      associationName,
      { enrolledAt, membershipExpiresAt },
      docs,
      docDates,
      endorsementDocs,
      endorsementIssueDates,
      endorsementCategories,
      endorsementFirearmByRow,
    );
    setBaselineReady(true);
  }, [
    associationName,
    baselineReady,
    docDates,
    docs,
    endorsementCategories,
    endorsementDocs,
    endorsementFirearmByRow,
    endorsementIssueDates,
    enrolledAt,
    membershipExpiresAt,
    membershipIdParam,
    signatureForState,
  ]);

  useEffect(() => {
    return () => {
      if (savedRef.current) return;
      deletedDocIdsRef.current.clear();
      const created = Array.from(createdDocIdsRef.current);
      created.forEach((id) => {
        const doc = getById<Document>(id);
        if (!doc) return;
        [doc.uri, doc.filePath, doc.thumbPath].forEach((path) => {
          if (!path) return;
          void deleteOwnedDocFile(path).catch(() => {});
        });
        deleteEntity(id);
      });
    };
  }, []);

  useEffect(() => {
    setPendingRotationByDoc((prev) => {
      const next: Partial<Record<MembershipDocKey, number>> = { ...prev };
      let changed = false;
      captureOrder.forEach((key) => {
        const nextId = docs[key]?.id ?? null;
        if (previousDocIdsRef.current[key] !== nextId) {
          previousDocIdsRef.current[key] = nextId;
          if ((next[key] ?? 0) !== 0) {
            next[key] = 0;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [captureOrder, docs]);

  useEffect(() => {
    setPendingRotationByEndorsement((prev) => {
      const next: Record<string, number> = { ...prev };
      let changed = false;
      Object.entries(endorsementDocs).forEach(([firearmId, doc]) => {
        const nextId = doc?.id ?? null;
        if (previousEndorsementDocIdsRef.current[firearmId] !== nextId) {
          previousEndorsementDocIdsRef.current[firearmId] = nextId;
          if ((next[firearmId] ?? 0) !== 0) {
            next[firearmId] = 0;
            changed = true;
          }
        }
      });
      Object.keys(previousEndorsementDocIdsRef.current).forEach((firearmId) => {
        if (firearmId in endorsementDocs) return;
        delete previousEndorsementDocIdsRef.current[firearmId];
        if (firearmId in next) {
          delete next[firearmId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [endorsementDocs]);

  const ensureMembershipId = useCallback(() => {
    if (membershipId) return membershipId;
    const nextId = createRandomId('member');
    setMembershipId(nextId);
    return nextId;
  }, [membershipId]);

  const docLabel = useCallback(
    (config: DocConfig) => {
      const trimmed = associationName.trim();
      if (trimmed) return `${trimmed} — ${config.label}`;
      return config.label;
    },
    [associationName],
  );

  const scrollToEndorsementRow = useCallback((rowId: string) => {
    const sectionY = endorsementsSectionYRef.current;
    if (typeof sectionY === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, sectionY - 12), animated: true });
    }
    requestAnimationFrame(() => {
      const y = endorsementCardPositionsRef.current[rowId];
      const sectionBase = endorsementsSectionYRef.current;
      const absoluteY =
        typeof sectionBase === 'number' && typeof y === 'number'
          ? sectionBase + y
          : undefined;
      if (typeof absoluteY !== 'number') return;
      scrollRef.current?.scrollTo({ y: Math.max(0, absoluteY - 12), animated: true });
    });
  }, []);

  const applyDocMetadata = useCallback(
    (
      doc: Document,
      params: {
        kind: MembershipDocument;
        label: string;
        parentId: string;
        relatedId?: string;
        relatedLabel?: string;
      }
    ) => {
      const updated = touch({
        ...doc,
        kind: params.kind,
        name: params.label,
        requirementCode: params.kind,
        requirementRelatedId: params.relatedId,
        requirementRelatedLabel: params.relatedLabel,
        parentType: 'Membership',
        parentId: params.parentId,
      } as Document);
      void persistAsync(updated);
      return updated;
    },
    [],
  );

  type WizardAsset = ImagePicker.ImagePickerAsset | {
    uri: string;
    mimeType?: string | null;
    name?: string | null;
    fileName?: string | null;
    size?: number | null;
    fileSize?: number | null;
  };

  const ensureProfileId = useCallback(() => {
    if (holderProfileId) return holderProfileId;
    const existingProfile = listByType<Profile>('Profile')[0];
    if (existingProfile) {
      setHolderProfileId(existingProfile.id);
      return existingProfile.id;
    }
    const nextProfile = withMeta<Profile>({
      id: createRandomId('prof'),
      type: 'Profile',
    } as Profile);
    persist(nextProfile);
    setHolderProfileId(nextProfile.id);
    return nextProfile.id;
  }, [holderProfileId]);

  const disablePhotoLibraryAlert = useCallback(() => {
    if (!prefsProfileId) return;
    setUserPrefs(prev => {
      const base = prev ?? ensureUserPrefs(prefsProfileId);
      const updated = { ...base, showPhotoLibraryAlert: false };
      saveUserPrefs(updated);
      return updated;
    });
  }, [prefsProfileId]);

  const saveMembershipDocument = useCallback(
    async (key: MembershipDocKey, asset: WizardAsset) => {
      const config = docConfigMap.get(key);
      if (!config) return;
      const isNewDocument = !docs[key];
      const parentId = ensureMembershipId();
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'Membership',
          parentId,
          holderProfileId: ensureProfileId(),
          label: docLabel(config),
          kind: config.kind,
          createDocumentId: () => createRandomId('doc'),
        },
        existing: docs[key] ?? undefined,
      });
      const label = docLabel(config);
      const updated = applyDocMetadata(document, {
        kind: config.kind,
        label,
        parentId,
        relatedId: parentId,
        relatedLabel: associationName.trim() || label,
      });
      setDocs((prev) => ({ ...prev, [key]: updated }));
      setDocDates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          issueDate: '',
        },
      }));
      if (createdNew) {
        createdDocIdsRef.current.add(updated.id);
      } else {
        createdDocIdsRef.current.delete(updated.id);
      }
      if (
        isNewDocument &&
        (key === 'dedicatedHunter' || key === 'dedicatedSport') &&
        !normalizeDateInput(docDates[key]?.expiryDate) &&
        normalizeDateInput(membershipExpiresAt)
      ) {
        setDocDates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            expiryDate: normalizeDateInput(membershipExpiresAt),
          },
        }));
      }
    },
    [applyDocMetadata, associationName, docDates, docLabel, docConfigMap, docs, ensureMembershipId, ensureProfileId, membershipExpiresAt],
  );

  const saveEndorsementDocument = useCallback(
    async (rowId: string, firearm: Firearm, asset: WizardAsset) => {
      const firearmId = firearm?.id ? String(firearm.id) : '';
      if (!firearmId) return;
      const parentId = ensureMembershipId();
      const title = formatFirearmTitle(firearm);
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'Membership',
          parentId,
          holderProfileId: ensureProfileId(),
          label: title,
          kind: ENDORSEMENT_KIND,
          createDocumentId: () => createRandomId('doc'),
        },
        existing: endorsementDocs[rowId] ?? undefined,
      });
      const updated = applyDocMetadata(document, {
        kind: ENDORSEMENT_KIND,
        label: title,
        parentId,
        relatedId: firearmId,
        relatedLabel: associationName.trim() || 'Membership',
      });
      setEndorsementDocs((prev) => ({ ...prev, [rowId]: updated }));
      setEndorsementFirearmByRow((prev) => ({ ...prev, [rowId]: firearmId }));
      setEndorsementIssueDates((prev) => ({ ...prev, [rowId]: '' }));
      if (createdNew) {
        createdDocIdsRef.current.add(updated.id);
      } else {
        createdDocIdsRef.current.delete(updated.id);
      }
    },
    [applyDocMetadata, associationName, endorsementDocs, ensureMembershipId, ensureProfileId],
  );

  const queueDocRotation = useCallback((key: MembershipDocKey) => {
    setPendingRotationByDoc((prev) => ({ ...prev, [key]: (prev[key] ?? 0) - 90 }));
  }, []);

  const queueEndorsementRotation = useCallback((rowId: string) => {
    setPendingRotationByEndorsement((prev) => ({ ...prev, [rowId]: (prev[rowId] ?? 0) - 90 }));
  }, []);

  const applyPendingMembershipRotations = useCallback(async () => {
    const updatedById = new Map<string, Document>();
    for (const key of captureOrder) {
      const doc = docs[key];
      if (!doc) continue;
      const pending = normalizeRotation(pendingRotationByDoc[key] ?? 0);
      if (!pending) continue;
      const sourceUri = resolveDocumentUri(doc.uri ?? doc.filePath);
      if (!sourceUri) continue;
      const manipulated = await ImageManipulator.manipulateAsync(sourceUri, [{ rotate: pending }], {});
      if (manipulated.uri !== sourceUri) {
        await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
      }
      const updated = touch({ ...doc } as Document);
      persist(updated);
      updatedById.set(updated.id, updated);
    }
    if (!updatedById.size) return docs;
    const nextDocs = { ...docs };
    captureOrder.forEach((key) => {
      const current = nextDocs[key];
      if (current && updatedById.has(current.id)) {
        nextDocs[key] = updatedById.get(current.id)!;
      }
    });
    setDocs(nextDocs);
    setPendingRotationByDoc({});
    return nextDocs;
  }, [captureOrder, docs, pendingRotationByDoc]);

  const applyPendingEndorsementRotations = useCallback(async () => {
    const updatedById = new Map<string, Document>();
    for (const [firearmId, doc] of Object.entries(endorsementDocs)) {
      if (!doc) continue;
      const pending = normalizeRotation(pendingRotationByEndorsement[firearmId] ?? 0);
      if (!pending) continue;
      const sourceUri = resolveDocumentUri(doc.uri ?? doc.filePath);
      if (!sourceUri) continue;
      const manipulated = await ImageManipulator.manipulateAsync(sourceUri, [{ rotate: pending }], {});
      if (manipulated.uri !== sourceUri) {
        await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
      }
      const updated = touch({ ...doc } as Document);
      persist(updated);
      updatedById.set(updated.id, updated);
    }
    if (!updatedById.size) return endorsementDocs;
    const nextDocs = { ...endorsementDocs };
    Object.entries(nextDocs).forEach(([firearmId, doc]) => {
      if (doc && updatedById.has(doc.id)) {
        nextDocs[firearmId] = updatedById.get(doc.id)!;
      }
    });
    setEndorsementDocs(nextDocs);
    setPendingRotationByEndorsement({});
    return nextDocs;
  }, [endorsementDocs, pendingRotationByEndorsement]);

  const handleCapture = useCallback(
    async (key: MembershipDocKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const ok = await ensureCameraPermission({
        title: 'Camera access needed',
        settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
      });
      if (!ok) return;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }
      const config = docConfigMap.get(key);
      const label = config?.label ?? 'document';
      setProcessingLabel(`Uploading ${label.toLowerCase()}`);
      setProcessing(true);
      await nextFrame();
      try {
        const result = await ImagePicker.launchCameraAsync(pickerOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        await saveMembershipDocument(key, asset);
        scrollToNextDoc(key);
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to capture document', error);
        Alert.alert('Unable to use photo', error?.message ?? 'Something went wrong while capturing the photo.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [docConfigMap, processing, saveMembershipDocument, scrollToNextDoc],
  );

  const pickFromLibrary = useCallback(
    async (key: MembershipDocKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const shouldShowPhotoLibraryAlert = userPrefs?.showPhotoLibraryAlert !== false;
      const ok = await ensurePhotoLibraryPermission({
        title: 'Photo library access needed',
        settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
        showLimitedAccessAlert: shouldShowPhotoLibraryAlert,
        onDisableLimitedAccessAlert: disablePhotoLibraryAlert,
      });
      if (!ok) return;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }
      const config = docConfigMap.get(key);
      const label = config?.label ?? 'document';
      setProcessingLabel(`Uploading ${label.toLowerCase()}`);
      setProcessing(true);
      await nextFrame();
      try {
        const result = await ImagePicker.launchImageLibraryAsync(pickerOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        await saveMembershipDocument(key, asset);
        scrollToNextDoc(key);
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to pick document', error);
        Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [disablePhotoLibraryAlert, docConfigMap, processing, saveMembershipDocument, scrollToNextDoc, userPrefs?.showPhotoLibraryAlert],
  );

  const handleUpload = useCallback(
    async (key: MembershipDocKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (!asset?.uri) return;
      const mime = (asset.mimeType ?? '').toLowerCase();
      const isPdf = mime.includes('pdf') || (asset.name ?? '').toLowerCase().endsWith('.pdf');
      const config = docConfigMap.get(key);
      const label = config?.label ?? 'document';
      setProcessingLabel(`Uploading ${label.toLowerCase()}`);
      setProcessing(true);
      await nextFrame();
      try {
        if (isPdf) {
          const pageCount = await getPdfPageCount(asset.uri);
          if (pageCount && pageCount > 1) {
            Alert.alert(
              'Only first page used',
              'This PDF has multiple pages. Only the first page will be used. If the document you need is on another page, use the camera or photo library.'
            );
          }
          const rasterized = await rasterizePdf(asset.uri, 150);
          try {
            const firstPage = rasterized.pages[0];
            if (!firstPage) return;
            const pdfAsset = {
              uri: firstPage.uri,
              mimeType: 'image/jpeg',
              fileName: 'membership.pdf.jpg',
              name: 'membership.pdf.jpg',
            };
            await saveMembershipDocument(key, pdfAsset as any);
            scrollToNextDoc(key);
          } finally {
            await rasterized.cleanup().catch(() => {});
          }
          return;
        }
        const prepared = await prepareWizardImage(asset as any);
        await saveMembershipDocument(key, prepared as any);
        scrollToNextDoc(key);
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to upload document', error);
        Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [docConfigMap, processing, saveMembershipDocument, scrollToNextDoc],
  );

  const handleEndorsementCapture = useCallback(
    async (rowId: string, firearm: Firearm) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const ok = await ensureCameraPermission({
        title: 'Camera access needed',
        settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
      });
      if (!ok) return;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }
      setProcessingLabel('Uploading endorsement');
      setProcessing(true);
      await nextFrame();
      try {
        const result = await ImagePicker.launchCameraAsync(pickerOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        await saveEndorsementDocument(rowId, firearm, asset);
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to capture endorsement document', error);
        Alert.alert('Unable to use photo', error?.message ?? 'Something went wrong while capturing the photo.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [processing, saveEndorsementDocument],
  );

  const handleEndorsementLibrary = useCallback(
    async (rowId: string, firearm: Firearm) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const shouldShowPhotoLibraryAlert = userPrefs?.showPhotoLibraryAlert !== false;
      const ok = await ensurePhotoLibraryPermission({
        title: 'Photo library access needed',
        settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
        showLimitedAccessAlert: shouldShowPhotoLibraryAlert,
        onDisableLimitedAccessAlert: disablePhotoLibraryAlert,
      });
      if (!ok) return;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }
      setProcessingLabel('Uploading endorsement');
      setProcessing(true);
      await nextFrame();
      try {
        const result = await ImagePicker.launchImageLibraryAsync(pickerOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        await saveEndorsementDocument(rowId, firearm, asset);
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to pick endorsement document', error);
        Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [disablePhotoLibraryAlert, processing, saveEndorsementDocument, userPrefs?.showPhotoLibraryAlert],
  );

  const handleEndorsementUpload = useCallback(
    async (rowId: string, firearm: Firearm) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (!asset?.uri) return;
      const mime = (asset.mimeType ?? '').toLowerCase();
      const isPdf = mime.includes('pdf') || (asset.name ?? '').toLowerCase().endsWith('.pdf');
      setProcessingLabel('Uploading endorsement');
      setProcessing(true);
      await nextFrame();
      try {
        if (isPdf) {
          const pageCount = await getPdfPageCount(asset.uri);
          if (pageCount && pageCount > 1) {
            Alert.alert(
              'Only first page used',
              'This PDF has multiple pages. Only the first page will be used. If the document you need is on another page, use the camera or photo library.'
            );
          }
          const rasterized = await rasterizePdf(asset.uri, 150);
          try {
            const firstPage = rasterized.pages[0];
            if (!firstPage) return;
            const pdfAsset = {
              uri: firstPage.uri,
              mimeType: 'image/jpeg',
              fileName: 'endorsement.pdf.jpg',
              name: 'endorsement.pdf.jpg',
            };
            await saveEndorsementDocument(rowId, firearm, pdfAsset as any);
          } finally {
            await rasterized.cleanup().catch(() => {});
          }
          return;
        }
        const prepared = await prepareWizardImage(asset as any);
        await saveEndorsementDocument(rowId, firearm, prepared as any);
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to upload endorsement document', error);
        Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [processing, saveEndorsementDocument],
  );

  const handleDelete = useCallback(
    async (key: MembershipDocKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const doc = docs[key];
      if (!doc) return;
      setProcessing(true);
      try {
        if (createdDocIdsRef.current.has(doc.id)) {
          for (const path of [doc.uri, doc.filePath, doc.thumbPath]) {
            if (!path) continue;
            try {
              await deleteOwnedDocFile(path);
            } catch {
              // ignore cleanup failures
            }
          }
          deleteEntity(doc.id);
          createdDocIdsRef.current.delete(doc.id);
        } else {
          deletedDocIdsRef.current.add(doc.id);
        }
        setPendingRotationByDoc((prev) => ({ ...prev, [key]: 0 }));
        setDocs(prev => ({ ...prev, [key]: null }));
        setDocDates((prev) => ({
          ...prev,
          [key]: { issueDate: '', expiryDate: '' },
        }));
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to delete document', error);
        Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
      } finally {
        setProcessing(false);
      }
    },
    [docs, processing],
  );

  const handleDeleteEndorsement = useCallback(
    async (rowId: string) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const doc = endorsementDocs[rowId];
      if (!doc) return;
      setProcessing(true);
      try {
        if (createdDocIdsRef.current.has(doc.id)) {
          for (const path of [doc.uri, doc.filePath, doc.thumbPath]) {
            if (!path) continue;
            try {
              await deleteOwnedDocFile(path);
            } catch {
              // ignore cleanup failures
            }
          }
          deleteEntity(doc.id);
          createdDocIdsRef.current.delete(doc.id);
        } else {
          deletedDocIdsRef.current.add(doc.id);
        }
        setPendingRotationByEndorsement((prev) => ({ ...prev, [rowId]: 0 }));
        setEndorsementDocs((prev) => ({ ...prev, [rowId]: null }));
        setEndorsementIssueDates((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
        setEndorsementCategories((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
        setEndorsementFirearmByRow((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
      } catch (error: any) {
        logger.warn('[membership/wizard] Failed to delete endorsement document', error);
        Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
      } finally {
        setProcessing(false);
      }
    },
    [endorsementDocs, processing],
  );

  const cleanupDocuments = useCallback(() => {
    setDocs(initialDocs);
    setDocDates(initialDocDateState);
    setEndorsementDocs({});
    setEndorsementIssueDates({});
    setEndorsementCategories({});
    setEndorsementFirearmByRow({});
    deletedDocIdsRef.current.clear();
    createdDocIdsRef.current.forEach((id) => {
      const doc = getById<Document>(id);
      if (!doc) return;
      [doc.uri, doc.filePath, doc.thumbPath].forEach((path) => {
        if (!path) return;
        void deleteOwnedDocFile(path).catch(() => {});
      });
      deleteEntity(id);
    });
    createdDocIdsRef.current.clear();
  }, []);

  const persistShowHint = useCallback(
    (value: boolean) => {
      if (!prefsProfileId) return;
      setUserPrefs(prev => {
        const base = prev ?? ensureUserPrefs(prefsProfileId);
        const updated = { ...base, showMembershipWizardHint: value };
        saveUserPrefs(updated);
        return updated;
      });
    },
    [prefsProfileId],
  );

  const goReturn = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [navCtx, returnToPath, router]);

  const membershipRequired = (docConfigMap.get('membership')?.required ?? false) !== false;
  const letterRequired = (docConfigMap.get('letter')?.required ?? true) !== false;
  const hasDedicatedRequirement = docConfigsArray.some((cfg) => cfg.key === 'dedicatedHunter' || cfg.key === 'dedicatedSport');
  const associationDocsReady =
    (!membershipRequired || !!docs.membership) &&
    (!letterRequired || !!docs.letter);
  const dedicatedDocsReady = !hasDedicatedRequirement || !!docs.dedicatedHunter || !!docs.dedicatedSport;
  const hasAssociationName = associationName.trim().length > 0;
  const hasMembershipExpiry = normalizeDateInput(membershipExpiresAt).length > 0;
  const requirementsMet = devModeEnabled
    ? hasAssociationName && hasMembershipExpiry
    : hasAssociationName && hasMembershipExpiry && associationDocsReady && dedicatedDocsReady;
  const hasChanges = baselineReady && currentSignature !== baselineSignatureRef.current;
  const hasLegacyEndorsementCategoryIssues = useMemo(
    () =>
      Object.entries(endorsementDocs).some(([rowId, doc]) => {
        if (!doc) return false;
        return !endorsementCategories[rowId];
      }),
    [endorsementCategories, endorsementDocs],
  );
  const hasPendingRotation = useMemo(
    () =>
      captureOrder.some((key) => normalizeRotation(pendingRotationByDoc[key] ?? 0) !== 0) ||
      Object.keys(endorsementDocs).some((firearmId) => normalizeRotation(pendingRotationByEndorsement[firearmId] ?? 0) !== 0),
    [captureOrder, endorsementDocs, pendingRotationByDoc, pendingRotationByEndorsement],
  );
  const canSave = (hasChanges || hasPendingRotation) && !processing;

  const duplicateEndorsementCategoryGroups = useMemo(() => {
    const grouped = new Map<string, string[]>();
    Object.entries(endorsementDocs).forEach(([rowId, doc]) => {
      if (!doc) return;
      const firearmId = String(endorsementFirearmByRow[rowId] ?? '').trim();
      const category = endorsementCategories[rowId];
      if (!firearmId || !category) return;
      const key = `${firearmId}::${category}`;
      const rows = grouped.get(key) ?? [];
      rows.push(rowId);
      grouped.set(key, rows);
    });
    return Array.from(grouped.entries())
      .filter(([, rowIds]) => rowIds.length > 1)
      .map(([key, rowIds]) => {
        const [firearmId, category] = key.split('::');
        return {
          firearmId,
          category: category as EndorsementCategory,
          rowIds,
        };
      });
  }, [endorsementCategories, endorsementDocs, endorsementFirearmByRow]);

  useEffect(() => {
    if (!duplicateCategoryHighlight) return;
    const stillExists = duplicateEndorsementCategoryGroups.some(
      (group) =>
        group.firearmId === duplicateCategoryHighlight.firearmId &&
        group.category === duplicateCategoryHighlight.category,
    );
    if (!stillExists) {
      setDuplicateCategoryHighlight(null);
    }
  }, [duplicateCategoryHighlight, duplicateEndorsementCategoryGroups]);

  const blockingValidation = useMemo(() => {
    const issues: WizardBlockingIssue[] = [];
    const push = (issue: WizardBlockingIssue) => issues.push(issue);

    if (!associationName.trim()) {
      push({
        key: 'associationName',
        label: 'Association name',
        kind: 'missing',
        message: 'Enter the association name.',
      });
    }

    const membershipExpiryValue = normalizeDateInput(membershipExpiresAt);
    if (!membershipExpiryValue) {
      push({
        key: 'membershipExpiresAt',
        label: 'Membership expiry date',
        kind: 'missing',
        message: 'Enter the membership expiry date.',
      });
    } else if (!validateDateISO(membershipExpiryValue)) {
      push({
        key: 'membershipExpiresAt',
        label: 'Membership expiry date',
        kind: 'invalid',
        message: 'Use YYYY-MM-DD format.',
      });
    } else if (!isFutureDateISO(membershipExpiryValue)) {
      push({
        key: 'membershipExpiresAt',
        label: 'Membership expiry date',
        kind: 'invalid',
        message: 'Date must be in the future.',
      });
    }

    const enrolledValue = normalizeDateInput(enrolledAt);
    if (enrolledValue && !validateDateISO(enrolledValue)) {
      push({
        key: 'enrolledAt',
        label: 'Enrollment date',
        kind: 'invalid',
        message: 'Use YYYY-MM-DD format.',
      });
    }

    if (!devModeEnabled) {
      if (membershipRequired && !docs.membership) {
        push({
          key: 'doc:membership',
          label: 'Membership card',
          kind: 'missing',
          message: 'Add your association membership card if you have one.',
        });
      }
      if (letterRequired && !docs.letter) {
        push({
          key: 'doc:letter',
          label: 'Proof of current membership',
          kind: 'missing',
          message: 'Add proof of your current membership.',
        });
      }
      if (hasDedicatedRequirement && !docs.dedicatedHunter && !docs.dedicatedSport) {
        push({
          key: 'dedicatedStatus',
          label: 'Dedicated hunter and/or sport shooter status',
          kind: 'missing',
          message: 'Add at least one dedicated hunter or dedicated sport shooter certificate.',
        });
      }
    }

    captureOrder.forEach((key) => {
      const doc = docs[key];
      if (!doc) return;
      const issueDate = normalizeDateInput(docDates[key]?.issueDate);
      if (issueDate && !validateDateISO(issueDate)) {
        push({
          key: `docDate:${key}:issueDate`,
          label: `${docConfigMap.get(key)?.label ?? key} issue date`,
          kind: 'invalid',
          message: 'Use YYYY-MM-DD format.',
        });
      }
      if (key !== 'dedicatedHunter' && key !== 'dedicatedSport') return;
      const expiryDate = normalizeDateInput(docDates[key]?.expiryDate);
      if (!expiryDate) return;
      if (!validateDateISO(expiryDate)) {
        push({
          key: `docDate:${key}:expiryDate`,
          label: `${docConfigMap.get(key)?.label ?? key} expiry date`,
          kind: 'invalid',
          message: 'Use YYYY-MM-DD format.',
        });
        return;
      }
      if (!isFutureDateISO(expiryDate)) {
        push({
          key: `docDate:${key}:expiryDate`,
          label: `${docConfigMap.get(key)?.label ?? key} expiry date`,
          kind: 'invalid',
          message: 'Date must be in the future.',
        });
      }
    });

    Object.entries(endorsementDocs).forEach(([rowId, doc]) => {
      if (!doc) return;
      const firearmId = String(endorsementFirearmByRow[rowId] ?? '').trim();
      const firearm = endorsementFirearms.find((item) => String(item.id ?? '') === firearmId);
      const issueDate = normalizeDateInput(endorsementIssueDates[rowId]);
      if (issueDate && !validateDateISO(issueDate)) {
        push({
          key: `endorsementDate:${rowId}`,
          label: `${firearm ? formatFirearmTitle(firearm) : 'Endorsement'} issue date`,
          kind: 'invalid',
          message: 'Use YYYY-MM-DD format.',
        });
      }
      if (!endorsementCategories[rowId]) {
        push({
          key: `endorsementCategory:${rowId}`,
          label: `${firearm ? formatFirearmTitle(firearm) : 'Endorsement'} category`,
          kind: 'missing',
          message: 'Select endorsement category.',
        });
      }
    });
    const seenCategoryByFirearm = new Map<string, Map<EndorsementCategory, string>>();
    Object.entries(endorsementDocs).forEach(([rowId, doc]) => {
      if (!doc) return;
      const firearmId = String(endorsementFirearmByRow[rowId] ?? '').trim();
      if (!firearmId) return;
      const category = endorsementCategories[rowId];
      if (!category) return;
      const firearm = endorsementFirearms.find((item) => String(item.id ?? '') === firearmId);
      const firearmLabel = firearm ? formatFirearmTitle(firearm) : 'Endorsement';
      const categoryLabel = ENDORSEMENT_CATEGORY_LABELS.get(category) ?? 'Category';
      const seenForFirearm = seenCategoryByFirearm.get(firearmId) ?? new Map<EndorsementCategory, string>();
      const existingRowId = seenForFirearm.get(category);
      if (existingRowId) {
        push({
          key: `endorsementCategory:${rowId}`,
          label: `${firearmLabel} duplicate category`,
          kind: 'invalid',
          message: `Only one ${categoryLabel} endorsement is allowed per firearm.`,
        });
        return;
      }
      seenForFirearm.set(category, rowId);
      seenCategoryByFirearm.set(firearmId, seenForFirearm);
    });

    return buildWizardBlockingResult(issues);
  }, [
    associationName,
    captureOrder,
    devModeEnabled,
    docConfigMap,
    docDates,
    docs,
    endorsementDocs,
    endorsementCategories,
    endorsementFirearmByRow,
    endorsementFirearms,
    endorsementIssueDates,
    enrolledAt,
    hasDedicatedRequirement,
    letterRequired,
    membershipExpiresAt,
    membershipRequired,
  ]);

  const toggleShowHints = useCallback(() => {
    if (processing) return;
    const next = !showWizardHints;
    setShowWizardHints(next);
    persistShowHint(next);
  }, [persistShowHint, processing, showWizardHints]);

  const handleOpenHelp = useCallback(() => {
    openHelp(WIZARD_HELP_KEY);
  }, [openHelp]);

  const focusIssue = useCallback(
    (issueKey?: string) => {
      if (!issueKey) return;
      if (issueKey === 'associationName') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        requestAnimationFrame(() => associationInputRef.current?.focus());
        return;
      }
      if (issueKey === 'membershipExpiresAt') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        requestAnimationFrame(() => membershipExpiryInputRef.current?.focus());
        return;
      }
      if (issueKey === 'enrolledAt') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        requestAnimationFrame(() => enrolledAtInputRef.current?.focus());
        return;
      }
      if (issueKey.startsWith('doc:')) {
        const key = issueKey.replace(/^doc:/, '') as MembershipDocKey;
        scrollToDoc(key);
        return;
      }
      if (issueKey.startsWith('docDate:')) {
        const [, key] = issueKey.split(':') as ['docDate', MembershipDocKey, 'issueDate' | 'expiryDate'];
        scrollToDoc(key);
        return;
      }
      if (issueKey === 'dedicatedStatus') {
        scrollToDoc('dedicatedHunter');
        return;
      }
      if (issueKey.startsWith('endorsementDate:') || issueKey.startsWith('endorsementCategory:')) {
        const rowId = issueKey.split(':').slice(1).join(':').trim();
        if (rowId) {
          scrollToEndorsementRow(rowId);
          return;
        }
        scrollToDoc('dedicatedSport');
        return;
      }
    },
    [scrollToDoc, scrollToEndorsementRow],
  );

  const handleSave = useCallback(async () => {
    setShowBlockingIssues(true);
    if (!duplicateCategoryHighlight && duplicateEndorsementCategoryGroups.length > 0) {
      const first = duplicateEndorsementCategoryGroups[0];
      setDuplicateCategoryHighlight({
        firearmId: first.firearmId,
        category: first.category,
      });
    } else if (duplicateCategoryHighlight && duplicateEndorsementCategoryGroups.length > 0) {
      const stillExists = duplicateEndorsementCategoryGroups.some(
        (group) =>
          group.firearmId === duplicateCategoryHighlight.firearmId &&
          group.category === duplicateCategoryHighlight.category,
      );
      if (!stillExists) {
        const first = duplicateEndorsementCategoryGroups[0];
        setDuplicateCategoryHighlight({
          firearmId: first.firearmId,
          category: first.category,
        });
      }
    }
    if (blockingValidation.hasBlockingIssues) {
      showWizardBlockingAlert(blockingValidation, {
        title: 'Unable to save',
        intro: 'Please correct the following before saving:',
        onPressOk: () => focusIssue(blockingValidation.firstIssueKey),
      });
      return;
    }
    const name = associationName.trim();
    if (!devModeEnabled) {
      if (hasDedicatedRequirement && !docs.dedicatedHunter && !docs.dedicatedSport) {
        return;
      }
      if (hasDedicatedRequirement && !!docs.dedicatedHunter !== !!docs.dedicatedSport) {
        const presentKey = docs.dedicatedHunter ? 'dedicatedHunter' : 'dedicatedSport';
        const presentLabel =
          docConfigMap.get(presentKey)?.label ??
          (presentKey === 'dedicatedHunter' ? 'Dedicated hunter certificate' : 'Dedicated sport shooter certificate');
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Only one dedicated certificate',
            `You’ve only uploaded one dedicated certificate (${presentLabel}). Do you want to continue with only this document?`,
            [
              { text: 'Add another', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', style: 'default', onPress: () => resolve(true) },
            ],
          );
        });
        if (!confirmed) {
          return;
        }
      }
    }
    const profileId = ensureProfileId();
    if (!profileId) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }
    setProcessing(true);
    try {
      const rotatedDocs = await applyPendingMembershipRotations();
      const rotatedEndorsements = await applyPendingEndorsementRotations();
      const id = ensureMembershipId();
      const existing = getById<Membership>(id);
      const fixedDocList = Object.entries(rotatedDocs)
        .map(([key, doc]) => ({ key, doc }))
        .filter(({ doc }) => !!doc) as Array<{ key: string; doc: Document }>;
      const endorsementDocList = Object.entries(rotatedEndorsements)
        .map(([rowId, doc]) => ({ rowId, doc }))
        .filter(({ doc }) => !!doc) as Array<{ rowId: string; doc: Document }>;
      const firearmById = new Map<string, Firearm>();
      endorsementFirearms.forEach((firearm) => {
        if (firearm?.id) {
          firearmById.set(String(firearm.id), firearm);
        }
      });
      const syncedFixedDocs = fixedDocList
        .map(({ key, doc }) => {
          const cfg = docConfigMap.get(key as MembershipDocKey);
          if (!cfg) return null;
          const label = docLabel(cfg);
          return applyDocMetadata(doc, {
            kind: cfg.kind,
            label,
            parentId: id,
            relatedId: id,
            relatedLabel: associationName.trim() || label,
          });
        })
        .filter(Boolean) as Document[];
      const syncedEndorsements = endorsementDocList
        .map(({ rowId, doc }) => {
          const firearmId = String(endorsementFirearmByRow[rowId] ?? '').trim();
          if (!firearmId) return null;
          const firearm = firearmById.get(firearmId);
          const baseTitle = firearm
            ? formatFirearmTitle(firearm)
            : String(doc.name ?? 'Firearm').trim() || 'Firearm';
          const label = formatEndorsementDisplayLabel({
            firearmTitle: baseTitle,
            categories: [endorsementCategories[rowId] ?? ''],
          });
          return applyDocMetadata(doc, {
            kind: ENDORSEMENT_KIND,
            label,
            parentId: id,
            relatedId: firearmId,
            relatedLabel: associationName.trim() || 'Membership',
          });
        })
        .filter(Boolean) as Document[];
      const syncedDocs = [...syncedFixedDocs, ...syncedEndorsements];
      const nextDocDates = {
        membership: { ...docDates.membership },
        letter: { ...docDates.letter },
        dedicatedHunter: { ...docDates.dedicatedHunter },
        dedicatedSport: { ...docDates.dedicatedSport },
      };
      const nextEndorsementIssueDates = { ...endorsementIssueDates };
      const membershipDocumentIds = syncedDocs.map((doc) => {
        const endorsementRowId = doc.kind === ENDORSEMENT_KIND
          ? endorsementDocList.find((entry) => entry.doc?.id === doc.id)?.rowId
          : '';
        const endorsementCategory = endorsementRowId ? endorsementCategories[endorsementRowId] : '';
        return {
          kind: doc.kind as MembershipDocument,
          documentId: doc.id,
          relatedFirearmId:
            doc.kind === ENDORSEMENT_KIND
              ? (doc.requirementRelatedId ? String(doc.requirementRelatedId) : undefined)
              : undefined,
          category:
            doc.kind === ENDORSEMENT_KIND && endorsementCategory
              ? endorsementCategory
              : undefined,
          issueDate:
            doc.kind === ENDORSEMENT_KIND
              ? normalizeDateInput(endorsementRowId ? nextEndorsementIssueDates[endorsementRowId] : '')
              : normalizeDateInput(
                doc.kind === 'ASSOCIATION_MEMBERSHIP'
                  ? nextDocDates.membership.issueDate
                  : doc.kind === 'ASSOCIATION_LETTER'
                    ? nextDocDates.letter.issueDate
                    : doc.kind === 'DEDICATED_HUNTER_CERT'
                      ? nextDocDates.dedicatedHunter.issueDate
                      : doc.kind === 'DEDICATED_SPORT_CERT'
                        ? nextDocDates.dedicatedSport.issueDate
                        : '',
              ) || undefined,
          expiryDate:
            doc.kind === 'DEDICATED_HUNTER_CERT'
              ? normalizeDateInput(nextDocDates.dedicatedHunter.expiryDate) || undefined
              : doc.kind === 'DEDICATED_SPORT_CERT'
                ? normalizeDateInput(nextDocDates.dedicatedSport.expiryDate) || undefined
                : undefined,
        };
      });
      const next = existing
        ? touch({
            ...existing,
            associationName: name,
            enrolledAt: normalizeDateInput(enrolledAt) || undefined,
            membershipExpiresAt: normalizeDateInput(membershipExpiresAt) || undefined,
            holderProfileId: existing.holderProfileId ?? profileId,
            membershipDocumentIds,
          } as Membership)
        : withMeta<Membership>({
            id,
            type: 'Membership',
            associationName: name,
            enrolledAt: normalizeDateInput(enrolledAt) || undefined,
            membershipExpiresAt: normalizeDateInput(membershipExpiresAt) || undefined,
            holderProfileId: profileId,
            membershipDocumentIds,
          } as Membership);
      persist(next);
      const deletedDocIds = Array.from(deletedDocIdsRef.current);
      deletedDocIds.forEach((docId) => {
        const doc = getById<Document>(docId);
        if (!doc) return;
        [doc.uri, doc.filePath, doc.thumbPath].forEach((path) => {
          if (!path) return;
          void deleteOwnedDocFile(path).catch(() => {});
        });
        deleteEntity(docId);
      });
      setDocDates(nextDocDates);
      setEndorsementIssueDates(nextEndorsementIssueDates);
      baselineSignatureRef.current = signatureForState(
        name,
        {
          enrolledAt: normalizeDateInput(enrolledAt),
          membershipExpiresAt: normalizeDateInput(membershipExpiresAt),
        },
        rotatedDocs,
        nextDocDates,
        rotatedEndorsements,
        nextEndorsementIssueDates,
        endorsementCategories,
        endorsementFirearmByRow,
      );
      setBaselineReady(true);
      savedRef.current = true;
      setShowBlockingIssues(false);
      setDuplicateCategoryHighlight(null);
      deletedDocIdsRef.current.clear();
      createdDocIdsRef.current.clear();
      goReturn();
    } catch (error: any) {
      logger.warn('[membership/wizard] Failed to save membership', error);
      Alert.alert('Unable to save', error?.message ?? 'Something went wrong while saving your membership.');
    } finally {
      setProcessing(false);
    }
  }, [applyDocMetadata, applyPendingEndorsementRotations, applyPendingMembershipRotations, associationName, blockingValidation, captureOrder, devModeEnabled, docConfigMap, docDates, docLabel, docs, duplicateCategoryHighlight, duplicateEndorsementCategoryGroups, endorsementCategories, endorsementDocs, endorsementFirearmByRow, endorsementFirearms, endorsementIssueDates, enrolledAt, ensureMembershipId, ensureProfileId, focusIssue, goReturn, hasDedicatedRequirement, membershipExpiresAt, signatureForState]);

  const handleClose = useCallback(() => {
    if (hasChanges || hasPendingRotation) {
      const actions: AlertButton[] = [
        { text: 'Continue editing', style: 'cancel' as const },
        {
          text: 'Discard',
          style: 'destructive' as const,
          onPress: () => {
            cleanupDocuments();
            setStep('info');
            goReturn();
          },
        },
      ];
      if (canSave) {
        actions.push({ text: 'Save', style: 'default', onPress: () => { void handleSave(); } });
      }
      Alert.alert('Unsaved changes', 'Would you like to save your changes before leaving?', actions);
      return;
    }
    if (hasLegacyEndorsementCategoryIssues) {
      Alert.alert(
        'Incomplete endorsement details',
        'One or more endorsements are missing a category. Fix now to avoid application issues later.',
        [
          {
            text: 'Close anyway',
            style: 'destructive',
            onPress: () => {
              cleanupDocuments();
              setStep('info');
              goReturn();
            },
          },
          {
            text: 'Fix now',
            style: 'default',
            onPress: () => {
              setShowBlockingIssues(true);
              focusIssue(
                blockingValidation.firstIssueKey?.startsWith('endorsement')
                  ? blockingValidation.firstIssueKey
                  : Object.entries(endorsementDocs).find(([rowId, doc]) => !!doc && !endorsementCategories[rowId])
                      ? `endorsementCategory:${
                          Object.entries(endorsementDocs).find(([rowId, doc]) => !!doc && !endorsementCategories[rowId])?.[0] ?? ''
                        }`
                      : blockingValidation.firstIssueKey,
              );
            },
          },
        ],
      );
      return;
    }
    cleanupDocuments();
    setStep('info');
    goReturn();
  }, [blockingValidation.firstIssueKey, canSave, cleanupDocuments, endorsementCategories, endorsementDocs, focusIssue, goReturn, handleSave, hasChanges, hasLegacyEndorsementCategoryIssues, hasPendingRotation]);

  const renderCaptureCard = (config: DocConfig) => {
    const key = config.key;
    const doc = docs[key];
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const cardHasError =
      showBlockingIssues &&
      ((config.key === 'membership' && membershipRequired && !doc) ||
        (config.key === 'letter' && letterRequired && !doc) ||
        (config.key === 'dedicatedHunter' && hasDedicatedRequirement && !docs.dedicatedHunter && !docs.dedicatedSport) ||
        (config.key === 'dedicatedSport' && hasDedicatedRequirement && !docs.dedicatedHunter && !docs.dedicatedSport));
    return (
      <View
        key={key}
        onLayout={(event) => {
          cardPositionsRef.current[key] = event.nativeEvent.layout.y;
        }}
      >
        <PhotoCaptureCard
          isError={cardHasError}
          title={config.label}
          helpText={config.description}
          previewUri={uri}
          previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
          previewRotationDegrees={pendingRotationByDoc[key] ?? 0}
          persistRotationOnPreviewClose={false}
          previewKind={uri ? (isPdf ? 'pdf' : 'image') : undefined}
          previewLabel={name || undefined}
          onPressCamera={() => handleCapture(key)}
          onPressLibrary={() => pickFromLibrary(key)}
          onPressRotate={() => queueDocRotation(key)}
          showRotateButton={!!uri && !isPdf}
          onPressUpload={() => handleUpload(key)}
          showUploadButton
          onDelete={() => handleDelete(key)}
          disabled={processing}
          footerContent={doc ? (
            <View style={styles.docDateCard}>
              <MembershipDateCell
                label="Date issued"
                value={docDates[key]?.issueDate}
                error={showBlockingIssues && !!docDates[key]?.issueDate && !validateDateISO(normalizeDateInput(docDates[key]?.issueDate))}
                onChangeText={(value) =>
                  setDocDates((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], issueDate: value },
                  }))
                }
                styles={styles}
                neutralBorder={neutral.border}
              />
              {(key === 'dedicatedHunter' || key === 'dedicatedSport') ? (
                <MembershipDateCell
                  label="Expiry date"
                  value={docDates[key]?.expiryDate}
                  error={
                    showBlockingIssues &&
                    !!docDates[key]?.expiryDate &&
                    (!validateDateISO(normalizeDateInput(docDates[key]?.expiryDate)) ||
                      !isFutureDateISO(normalizeDateInput(docDates[key]?.expiryDate)))
                  }
                  onChangeText={(value) =>
                    setDocDates((prev) => ({
                      ...prev,
                      [key]: { ...prev[key], expiryDate: value },
                    }))
                  }
                  styles={styles}
                  neutralBorder={neutral.border}
                />
              ) : null}
            </View>
          ) : null}
        />
      </View>
    );
  };

  const renderEndorsementCard = (firearm: Firearm, rowId: string, index: number) => {
    const firearmId = firearm?.id ? String(firearm.id) : '';
    const doc = endorsementDocs[rowId] ?? null;
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const title = `Endorsement ${index + 1}`;
    const category = endorsementCategories[rowId] ?? '';
    const hasCategory = !!category;
    const categoryMissing = !!doc && !category;
    const duplicateCategoryActive =
      !!doc &&
      !!duplicateCategoryHighlight &&
      duplicateCategoryHighlight.firearmId === firearmId &&
      category === duplicateCategoryHighlight.category;
    const categoryError = categoryMissing || duplicateCategoryActive;
    return (
      <View
        key={`endorsement_${firearmId}_${rowId}`}
        onLayout={(event) => {
          endorsementCardPositionsRef.current[rowId] = event.nativeEvent.layout.y;
        }}
      >
        <PhotoCaptureCard
          title={title}
          isError={categoryError}
          headerContent={(
            <View style={styles.docDateCard}>
              {/* <Text style={styles.inputLabel}>Category</Text> */}
              <View style={styles.categoryRow}>
                {ENDORSEMENT_CATEGORIES.map((item) => {
                  const selected = category === item.value;
                  return (
                    <Pressable
                      key={`${rowId}_${item.value}`}
                      onPress={() =>
                        setEndorsementCategories((prev) => ({ ...prev, [rowId]: item.value }))
                      }
                      style={[
                        styles.categoryChip,
                        selected && styles.categoryChipSelected,
                        categoryMissing && styles.categoryChipError,
                        selected && duplicateCategoryActive && styles.categoryChipError,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          selected && styles.categoryChipTextSelected,
                          categoryMissing && styles.categoryChipTextError,
                          selected && duplicateCategoryActive && styles.categoryChipTextError,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {hasCategory ? <View style={styles.endorsementHeaderDivider} /> : null}
            </View>
          )}
          previewUri={uri}
          previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
          previewRotationDegrees={pendingRotationByEndorsement[rowId] ?? 0}
          persistRotationOnPreviewClose={false}
          previewKind={uri ? (isPdf ? 'pdf' : 'image') : undefined}
          previewLabel={name || undefined}
          onPressCamera={() => handleEndorsementCapture(rowId, firearm)}
          onPressLibrary={() => handleEndorsementLibrary(rowId, firearm)}
          onPressRotate={() => queueEndorsementRotation(rowId)}
          showRotateButton={!!uri && !isPdf}
          onPressUpload={() => handleEndorsementUpload(rowId, firearm)}
          showUploadButton
          showActionButtons={hasCategory}
          onDelete={() => handleDeleteEndorsement(rowId)}
          disabled={processing}
          footerContent={doc ? (
            <View style={styles.docDateCard}>
              <MembershipDateCell
                label="Date issued"
                value={endorsementIssueDates[rowId]}
                error={
                  showBlockingIssues &&
                  !!endorsementIssueDates[rowId] &&
                  !validateDateISO(normalizeDateInput(endorsementIssueDates[rowId]))
                }
                onChangeText={(value) =>
                  setEndorsementIssueDates((prev) => ({ ...prev, [rowId]: value }))
                }
                styles={styles}
                neutralBorder={neutral.border}
              />
            </View>
          ) : null}
        />
      </View>
    );
  };

  const missingItems = (() => {
    const items: string[] = [];
    if (!hasAssociationName) items.push('Association name');
    if (!hasMembershipExpiry) items.push('Membership expiry date');
    if (membershipRequired && !docs.membership) items.push('Membership card');
    if (letterRequired && !docs.letter) items.push('Proof of current membership');
    if (hasDedicatedRequirement && !docs.dedicatedHunter && !docs.dedicatedSport) {
      items.push('Dedicated hunter and/or sport shooter status');
    }
    Object.entries(endorsementDocs).forEach(([rowId, doc]) => {
      if (!doc) return;
      const category = endorsementCategories[rowId];
      const firearmId = String(endorsementFirearmByRow[rowId] ?? '').trim();
      const firearm = endorsementFirearms.find((item) => String(item.id ?? '') === firearmId);
      const firearmLabel = firearm ? formatFirearmTitle(firearm) : 'Endorsement';
      if (!category) {
        items.push(`${firearmLabel} endorsement category`);
        return;
      }
    });
    const seenCategoryByFirearm = new Map<string, Set<EndorsementCategory>>();
    Object.entries(endorsementDocs).forEach(([rowId, doc]) => {
      if (!doc) return;
      const category = endorsementCategories[rowId];
      if (!category) return;
      const firearmId = String(endorsementFirearmByRow[rowId] ?? '').trim();
      if (!firearmId) return;
      const firearm = endorsementFirearms.find((item) => String(item.id ?? '') === firearmId);
      const firearmLabel = firearm ? formatFirearmTitle(firearm) : 'Endorsement';
      const categoryLabel = ENDORSEMENT_CATEGORY_LABELS.get(category) ?? 'Category';
      const seen = seenCategoryByFirearm.get(firearmId) ?? new Set<EndorsementCategory>();
      if (seen.has(category)) {
        items.push(`${firearmLabel} duplicate endorsement category (${categoryLabel})`);
        return;
      }
      seen.add(category);
      seenCategoryByFirearm.set(firearmId, seen);
    });
    return items;
  })();

  const pageStatus =
    missingItems.length === 0
      ? 'All required documents added.'
      : `Please provide the following:\n• ${missingItems.join('\n• ')}`;
  const statusListItems = showBlockingIssues && blockingValidation.hasBlockingIssues
    ? blockingValidation.issues.map((issue) => issue.label)
    : missingItems;
  const captureStatusStyle =
    statusListItems.length === 0
      ? [styles.captureStatusBox, styles.captureStatusSuccess]
      : [styles.captureStatusBox, styles.captureStatusWarning];

  const showInfoStep = step === 'info';

  return (
    <Screen>
      <View style={styles.container}>
        {null}
        <PageHeader
          title={pageTitle}
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!canSave}
          leadingActions={(
            <IconRoundButton
              buttonType="help"
              accessibilityLabel="Show tips"
              onPress={handleOpenHelp}
              variant="ghost"
              borderColor={neutral.base}
              size="sm"
              hitSlop={8}
            />
          )}
          style={styles.header}
        />
        {showInfoStep ? (
          <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <View style={styles.intro}>
              {/* <Text style={styles.h1}>{pageTitle}</Text> */}
              <Text style={styles.lead}>Upload images of your firearm association membership documents.</Text>
            </View>
            {/* <View style={styles.section}>
              <Text style={styles.sectionTitle}>What you will need</Text>
              {docConfigsArray.map((cfg) => (
                <Text key={cfg.key} style={styles.sectionItem}>• {cfg.label}</Text>
              ))}
            </View> */}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>You’ll need</Text>
              {[
                'Proof of current membership from your firearm association.',
                'Membership card if your association provides one.',
                'Dedicated status certificate(s) (Hunting and/or Sport shooting).',
                'A phone with a camera, or a good quality image of your certificate.',
              ].map((item, index) => bullet(item, `need_${index}`))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tips for a clear photo</Text>
              {[
                'Clean your camera lens to reduce image blur and glare.',
                'Place the documents on a plain, solid-colour background.', 
                'Keep the photo in focus so details are sharp readable.',
                'Hold the camera steady and fill the frame with the document.', 
                'Use good lighting and avoid glare or heavy shadows across the text.',
              ].map((item, index) => bullet(item, `tip_${index}`))}
            </View>

            <View style={styles.hintRow}>
              <View style={styles.hintTextWrap}>
                <Text style={styles.hintLabel}>Show these tips next time</Text>
                <Text style={styles.hintHelp}>You can change this later under Settings → Hints.</Text>
              </View>
              <IconRoundButton
                buttonType={showWizardHints ? 'confirm' : 'stop'}
                accessibilityLabel={showWizardHints ? 'Hide these tips next time' : 'Show these tips next time'}
                onPress={toggleShowHints}
                disabled={processing}
                size={36}
                borderColor={showWizardHints ? tones.green.base : neutral.base}
              />
            </View>
            <Button label="Continue" onPress={() => setStep('capture')} tone="teal" align="center" centerText />
          </PageScrollView>
        ) : (
          <PageScrollView
            ref={scrollRef}
            contentContainerStyle={styles.captureContent}
          >

            <View style={styles.detailsCard}>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Firearm association name</Text>
                <TextInput
                  ref={associationInputRef}
                  value={associationName}
                  onChangeText={setAssociationName}
                  placeholder="e.g. National Hunting Association"
                  style={[styles.input, showBlockingIssues && !hasAssociationName && styles.inputError]}
                  placeholderTextColor={neutral.border}
                  autoCapitalize="words"
                />
              </View>
              <MembershipDateCell
                label="Membership expiry date"
                value={membershipExpiresAt}
                error={
                  showBlockingIssues &&
                  (!hasMembershipExpiry ||
                    !validateDateISO(normalizeDateInput(membershipExpiresAt)) ||
                    !isFutureDateISO(normalizeDateInput(membershipExpiresAt)))
                }
                inputRef={membershipExpiryInputRef}
                onChangeText={setMembershipExpiresAt}
                styles={styles}
                neutralBorder={neutral.border}
              />
              <MembershipDateCell
                label="Enrollment date (optional)"
                value={enrolledAt}
                error={showBlockingIssues && !!enrolledAt && !validateDateISO(normalizeDateInput(enrolledAt))}
                inputRef={enrolledAtInputRef}
                onChangeText={setEnrolledAt}
                styles={styles}
                neutralBorder={neutral.border}
              />
            </View>

            <View style={styles.captureGrid}>
              {docConfigsArray.map((cfg) => renderCaptureCard(cfg))}
            </View>

            <View
              style={styles.endorsementsSection}
              onLayout={(event) => {
                endorsementsSectionYRef.current = event.nativeEvent.layout.y;
              }}
            >
              <DocumentActionCard
                title="Endorsements"
                subtitle="Optional"
                status={
                  endorsementFirearms.length > 0
                    ? `${Object.values(endorsementDocs).filter(Boolean).length} added`
                    : 'No firearms added'
                }
                actions={[]}
                titleTrailing={(
                  <CollapseToggleChip
                    expanded={endorsementsExpanded}
                    onPress={() => setEndorsementsExpanded((prev) => !prev)}
                    tone="grey"
                  />
                )}
              >
                {endorsementsExpanded ? (
                  endorsementFirearms.length === 0 ? (
                    <View style={styles.endorsementsEmpty}>
                      <Text style={styles.endorsementsEmptyText}>
                        Add firearms in your profile first to upload firearm endorsements.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.captureGrid}>
                      {endorsementFirearms.map((firearm, firearmIndex) => {
                        const firearmId = String(firearm.id ?? '');
                        const rowIds = endorsementRowsByFirearm.get(firearmId) ?? [];
                        const firearmSubtitle = formatFirearmSubtitle(firearm);
                        return (
                          <View key={`endorsement_group_${firearmId}`} style={styles.endorsementGroup}>
                            {firearmIndex > 0 ? <View style={styles.endorsementGroupDivider} /> : null}
                            <Text style={styles.endorsementGroupTitle}>{formatFirearmTitle(firearm)}</Text>
                            {firearmSubtitle ? (
                              <Text style={styles.endorsementGroupSubtitle}>{firearmSubtitle}</Text>
                            ) : null}
                            {rowIds.map((rowId, idx) => renderEndorsementCard(firearm, rowId, idx))}
                          </View>
                        );
                      })}
                    </View>
                  )
                ) : null}
              </DocumentActionCard>
            </View>

            <View style={styles.captureStatus}>
              {statusListItems.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setShowBlockingIssues(true);
                    focusIssue(blockingValidation.firstIssueKey);
                  }}
                  style={({ pressed }) => [
                    styles.captureStatusPressable,
                    pressed ? styles.captureStatusPressed : null,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={captureStatusStyle}>
                    <Text style={[styles.captureStatusText, styles.captureStatusTextWarning]}>
                      Please provide the following:
                    </Text>
                    <View style={styles.captureStatusList}>
                      {statusListItems.map((item, idx) => (
                        <View key={`${item}-${idx}`} style={styles.captureStatusItem}>
                          <Text style={styles.captureStatusBullet}>{'\u2022'}</Text>
                          <Text style={[styles.captureStatusText, styles.captureStatusTextWarning]}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Pressable>
              ) : (
                <View style={captureStatusStyle}>
                  <Text style={styles.captureStatusText}>All required documents added.</Text>
                </View>
              )}
            </View>

            <ButtonSave
              label="Save"
              onPress={handleSave}
              disabled={!canSave}
              loading={processing}
              align="center"
            />
          </PageScrollView>
        )}
      </View>
      <ProcessingBlocker visible={processing} label={processingLabel} />
      <HelpModal {...helpModalProps} />
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { marginBottom: 12, paddingHorizontal: 20 },
    headerHelpIconWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerHelpIcon: {
      color: neutral.onBase,
      fontSize: 18,
      lineHeight: 18,
      textAlign: 'center',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      gap: 20,
    },
    intro: { marginBottom: 4, gap: 10 },
    h1: { fontSize: 24, fontWeight: '700', color: neutral.onSurface },
    lead: { fontSize: 16, lineHeight: 22, color: neutral.base },
    section: {
      marginBottom: 4,
      backgroundColor: neutral.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 6,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: neutral.onSurface, marginBottom: 8 },
    sectionItem: { fontSize: 15, lineHeight: 20, color: neutral.base },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
    bulletMarker: { width: 18, fontSize: 16, lineHeight: 20, color: neutral.base },
    bulletText: { flex: 1, fontSize: 15, lineHeight: 20, color: neutral.base },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    hintTextWrap: { flex: 1, gap: 2 },
    hintLabel: { fontSize: 15, fontWeight: '600', color: neutral.onSurface },
    hintHelp: { fontSize: 13, color: neutral.base },
    captureContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
    captureGrid: { gap: 16 },
    endorsementsSection: {
      gap: 10,
      marginTop: 4,
    },
    endorsementGroup: {
      gap: 10,
    },
    endorsementGroupDivider: {
      height: 1,
      backgroundColor: neutral.border,
      marginTop: 4,
      marginBottom: 2,
    },
    endorsementGroupTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: neutral.onSurface,
      marginTop: 4,
    },
    endorsementGroupSubtitle: {
      fontSize: 14,
      color: neutral.base,
      marginBottom: 2,
    },
    endorsementsEmpty: {
      backgroundColor: neutral.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    endorsementsEmptyText: {
      fontSize: 14,
      lineHeight: 20,
      color: neutral.base,
    },
    captureStatus: { marginTop: 0, marginBottom: 0 },
    captureStatusPressable: { borderRadius: 16 },
    captureStatusPressed: { opacity: 0.96 },
    captureStatusBox: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1 },
    captureStatusText: { fontSize: 14, fontWeight: '600', color: neutral.onSurface },
    captureStatusTextWarning: { color: tones.orange.base },
    captureStatusList: { gap: 10, marginTop: 10 },
    captureStatusItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    captureStatusBullet: { color: tones.orange.base, fontSize: 16, lineHeight: 20, fontWeight: '700' },
    captureStatusSuccess: {
      backgroundColor: tones.green.surface,
      borderColor: tones.green.border,
    },
    captureStatusWarning: {
      backgroundColor: tones.orange.surface,
      borderColor: tones.orange.emphasis,
    },
    guidanceCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    guidanceText: {
      fontSize: 14,
      lineHeight: 20,
      color: neutral.base,
    },
    detailsCard: {
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      padding: 14,
    },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    categoryChip: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: neutral.surface,
    },
    categoryChipSelected: {
      borderColor: tones.teal.border,
      backgroundColor: tones.teal.surface,
    },
    categoryChipError: {
      borderColor: tones.orange.base,
      backgroundColor: tones.orange.surface,
    },
    categoryChipText: {
      fontSize: 13,
      color: neutral.base,
      fontWeight: '600',
    },
    categoryChipTextSelected: {
      color: neutral.onSurface,
    },
    categoryChipTextError: {
      color: tones.orange.base,
    },
    endorsementHeaderDivider: {
      marginTop: 0,
      borderTopWidth: 1,
      borderTopColor: neutral.border,
    },
    docDateCard: {
      gap: 12,
      paddingTop: 2,
    },
    cellWrap: { gap: 6 },
    cellLabel: { fontSize: 14, fontWeight: '700', color: tones.teal.base },
    cellInput: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      paddingVertical: 0,
      backgroundColor: tones.neutrals[100],
      color: neutral.onSurface,
      fontSize: 16,
      fontWeight: '600',
    },
    cellInputError: {
      borderColor: tones.red.base,
    },
    inputBlock: {
      gap: 6,
    },
    inputLabel: { fontSize: 14, fontWeight: '700', color: tones.teal.base },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      color: neutral.onSurface,
      backgroundColor: tones.neutrals[100],
    },
    inputError: {
      borderColor: tones.red.base,
    },
  });
