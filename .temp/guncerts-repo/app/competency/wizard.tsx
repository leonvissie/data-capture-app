import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  LayoutAnimation,
  UIManager,
  Platform,
  TextInput,
} from 'react-native';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import Button from '../../src/components/Button';
import ButtonSave from '../../src/components/ButtonSave';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import { EditTextSheet, SelectSheet } from '../../src/components/EditSheet';
import { useTones } from '../../src/theme/tones';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { CompetencyCertificate, Document, Profile, UserPrefs, Extraction, CompetencyCategory, Firearm } from '../../src/data/types';
import { ensureUserPrefs, saveUserPrefs, persistAsync, touch, persist, withMeta } from '../../src/data/repo';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteEntity, listByType, getById } from '../../src/data/sqlite';
import { performDocumentExtraction } from '../../src/ocr';
import { deleteDocumentFiles } from '../../src/utils/documentStorage';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { logger } from '@/src/utils/logger';
import { mapCompetencyExtraction } from '../../src/ocr/mappers';
import { competencyCertTypes, competencyCertTypeMap } from '../../src/data/competencyCertTypes';
import { parseArrayParam } from '../../src/utils/queryParams';
import { useDevMode } from '../../src/providers/DevModeProvider';
import { appConfig } from '../../src/config/appConfig';
import {
  recalculateAndPersistCompetencyExpiries,
  resolveCompetencyExpiryCompCertCalc,
  resolveCompetencyExpiryFirearmCalc,
} from '../../src/utils/competencyExpiry';
import { rasterizePdf } from '../../src/pdf/rasterizer';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import HelpModal from '../../src/components/HelpModal';
import { useHelpModal } from '../../src/help';
import { maskDateYYYYMMDD } from '../../src/utils/dateInput';
import WizardField from '../../src/components/wizard/WizardField';

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile?scroll=competency';
const WIZARD_HELP_KEY = 'helpWizardCompetency';

type OriginScreen = 'profile' | 'documents' | 'manual' | 'unknown';

const parseOriginScreen = (raw?: string | string[] | null): OriginScreen => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null) return 'unknown';
  const norm = `${value}`.trim().toLowerCase();
  if (!norm) return 'unknown';
  if (norm === 'profile') return 'profile';
  if (norm === 'documents' || norm === 'document') return 'documents';
  if (norm === 'manual') return 'manual';
  return 'unknown';
};

const buildManualFallbackPath = (certificateId?: string | null): string | null => {
  if (!certificateId) return null;
  const params = new URLSearchParams();
  params.set('id', certificateId);
  return `/competency/manual?${params.toString()}`;
};

const fallbackForOrigin = (origin: OriginScreen, certificateId?: string | null): string => {
  if (origin === 'profile') return defaultReturnPath;
  if (origin === 'manual') {
    const manualPath = buildManualFallbackPath(certificateId);
    if (manualPath) return manualPath;
  }
  return defaultReturnPath;
};

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

const CATS: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const CERT_TYPE_OPTIONS = competencyCertTypes
  .filter((option) => option.code === '1.1')
  .map((option) => ({
    value: option.code,
    label: `${option.code}: ${option.label}`,
  }));
const COMPETENCY_EXPIRY_OPTIONS: Array<{
  value: NonNullable<UserPrefs['dfoCompetencyExpiryUsing']>;
  label: string;
}> = [
  { value: 'compIssueDate', label: 'Certificate issue date' },
  { value: 'firearmExpiry', label: 'Linked firearm licence expiry' },
  { value: 'unknown', label: "I don't know" },
];

const formatCertificateTypeLabel = (code?: string | null) => {
  if (!code) return undefined;
  const label = competencyCertTypeMap[code];
  return label ? `${code}: ${label}` : code;
};

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};

const createCategoryColors = (tones: ReturnType<typeof useTones>) => ({
  Handgun: {
    background: tones.green.surface,
    border: tones.green.base,
    activeBorder: tones.green.base,
    text: tones.green.base,
    activeText: tones.green.base,
  },
  Rifle: {
    background: tones.green.surface,
    border: tones.green.base,
    activeBorder: tones.green.base,
    text: tones.green.base,
    activeText: tones.green.base,
  },
  Shotgun: {
    background: tones.green.surface,
    border: tones.green.base,
    activeBorder: tones.green.base,
    text: tones.green.base,
    activeText: tones.green.base,
  },
  HandMachineCarbine: {
    background: tones.green.surface,
    border: tones.green.base,
    activeBorder: tones.green.base,
    text: tones.green.base,
    activeText: tones.green.base,
  },
});

const ocrMissingAlerted = new Set<string>();
const REQUIRED_FIELD_LABELS: Record<RequiredField, string> = {
  calcMethod: 'Expiry calculation method',
  licenceTypeCode: 'Certificate type',
  categories: 'Categories',
  certificateNumber: 'Certificate number',
  issuedAt: 'Issued date',
};

type Draft = {
  categories: CompetencyCategory[];
  licenceTypeCode: string;
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string;
  trainingProvider: string;
  isCurrent: boolean;
};

type DraftField = keyof Draft;

// const FIELD_LABELS: Record<DraftField, string> = {
//   categories: 'Categories',
//   licenceTypeCode: 'Certificate type',
//   certificateNumber: 'Certificate number',
//   issuedAt: 'Issued date',
//   expiresAt: 'Expiry date',
//   trainingProvider: 'Training provider',
//   isCurrent: 'Current status',
// };

const createEmptyDraft = (): Draft => ({
  categories: [],
  licenceTypeCode: '',
  certificateNumber: '',
  issuedAt: '',
  expiresAt: '',
  trainingProvider: '',
  isCurrent: true,
});

const cloneDraft = (draft: Draft): Draft => ({
  ...draft,
  categories: [...draft.categories],
});

const draftFromCertificate = (cert: CompetencyCertificate): Draft => ({
  categories: [...(cert.categories ?? [])],
  licenceTypeCode: Array.isArray(cert.licenceTypes) && cert.licenceTypes.length ? cert.licenceTypes[0] ?? '' : '',
  certificateNumber: cert.certificateNumber ?? '',
  issuedAt: cert.issuedAt ?? '',
  expiresAt: cert.expiresAt ?? '',
  trainingProvider: cert.trainingProvider ?? '',
  isCurrent: cert.isCurrent ?? true,
});

const normalizeString = (value?: string | null) => (value ?? '').trim();
const normalizeForCompare = (value?: string | null) => normalizeString(value).toLowerCase();

const categoriesEqual = (a: CompetencyCategory[], b: CompetencyCategory[]) => {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((val, idx) => val === bs[idx]);
};

const validateDateISO = (value: string) => {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
};

type SheetKey = 'certificateNumber' | 'issuedAt' | 'expiresAt' | 'trainingProvider';

type SheetState =
  | null
  | { type: 'text'; key: SheetKey; title: string; mask?: 'date' }
  | { type: 'select'; key: 'certificateType'; title: string };

type RequiredField = 'calcMethod' | 'licenceTypeCode' | 'categories' | 'certificateNumber' | 'issuedAt';

export default function CompetencyWizardScreen() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const { open: openHelp, props: helpModalProps } = useHelpModal();
  const bullet = (text: string, key: string) => (
    <View key={key} style={styles.bulletRow}>
      <Text style={styles.bulletMarker}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
  const categoryColors = useMemo(() => createCategoryColors(tones), [tones]);
  const { devModeEnabled } = useDevMode();
  const validationEnabled = appConfig.features.enableValidation && !devModeEnabled;
  const duplicateChecksEnabled = appConfig.features.duplicateChecks;
  const captureScrollRef = useRef<ScrollView | null>(null);
  const certificateNumberInputRef = useRef<TextInput | null>(null);
  const issuedAtInputRef = useRef<TextInput | null>(null);
  const requiredFieldPositions = useRef<Record<RequiredField, number | null>>({
    calcMethod: null,
    licenceTypeCode: null,
    categories: null,
    certificateNumber: null,
    issuedAt: null,
  });
  const missingFieldFlowRef = useRef<{ autoSave: boolean } | null>(null);
  const captureCardTop = useRef(0);
  const params = useLocalSearchParams() as {
    returnTo?: string | string[];
    completeReturnTo?: string | string[];
    nav?: string | string[] | null;
    certificateId?: string | string[];
    selectedCertIds?: string | string[];
    selectionParam?: string | string[];
    previewMode?: string | string[];
    intro?: string | string[] | null;
    origin?: string | string[];
  };
  const originScreen = useMemo(() => parseOriginScreen(params.origin), [params.origin]);
  const navPayload = useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }, [params.nav]);
  const navCtx = useMemo(
    () =>
      decodeNav({
        ...(navPayload ?? {}),
        returnTo: params.returnTo,
        onComplete: params.completeReturnTo,
      }),
    [navPayload, params.completeReturnTo, params.returnTo]
  );
  const seededCertificateId = useMemo(() => {
    const raw = params.certificateId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const trimmed = `${value}`.trim();
    return trimmed || null;
  }, [params.certificateId]);
  const returnToPath =
    navCtx.routeBack ||
    navCtx.returnTo ||
    fallbackForOrigin(originScreen, seededCertificateId) ||
    defaultReturnPath;
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);
  const selectionParam = useMemo(() => {
    const raw = Array.isArray(params.selectionParam) ? params.selectionParam[0] : params.selectionParam;
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value || 'selectedCertIds';
  }, [params.selectionParam]);
  const selectedCertIdsParam = useMemo(
    () => parseArrayParam(params.selectedCertIds),
    [params.selectedCertIds],
  );
  const buildWizardParams = useCallback(
    (ids?: string[]) => {
      const next: Record<string, any> = {};
      const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
      if (returnTo) next.returnTo = returnTo;
      const completeReturnTo = Array.isArray(params.completeReturnTo)
        ? params.completeReturnTo[0]
        : params.completeReturnTo;
      if (completeReturnTo) next.completeReturnTo = completeReturnTo;
      const nav = Array.isArray(params.nav) ? params.nav[0] : params.nav;
      if (nav) next.nav = nav;
      const intro = Array.isArray(params.intro) ? params.intro[0] : params.intro;
      if (intro) next.intro = intro;
      const origin = Array.isArray(params.origin) ? params.origin[0] : params.origin;
      if (origin) next.origin = origin;
      const previewMode = Array.isArray(params.previewMode) ? params.previewMode[0] : params.previewMode;
      if (previewMode) next.previewMode = previewMode;
      if (selectionParam) next.selectionParam = selectionParam;
      const finalIds = ids ?? selectedCertIdsParam;
      if (finalIds.length) next.selectedCertIds = JSON.stringify(finalIds);
      return next;
    },
    [
      params.completeReturnTo,
      params.intro,
      params.nav,
      params.origin,
      params.previewMode,
      params.returnTo,
      selectedCertIdsParam,
      selectionParam,
    ],
  );
  const ensureSelectionWith = useCallback(
    (nextId?: string | null) => {
      const base = new Set(selectedCertIdsParam);
      if (nextId) base.add(String(nextId));
      return Array.from(base);
    },
    [selectedCertIdsParam],
  );
  const seededCertificate = useMemo<CompetencyCertificate | null>(() => {
    if (!seededCertificateId) return null;
    const found = getById<CompetencyCertificate>(seededCertificateId);
    return found ?? null;
  }, [seededCertificateId]);
  const seededTitle = useMemo(() => {
    if (!seededCertificate) return null;
    const certificateNumber = seededCertificate.certificateNumber?.trim();
    if (certificateNumber) return certificateNumber;
    return 'Existing competency certificate';
  }, [seededCertificate]);
  const pageTitle = seededTitle ?? 'Add competency';
  const isEditMode = !!seededCertificateId;
  const fromPreview = useMemo(() => {
    const raw = Array.isArray(params.previewMode) ? params.previewMode[0] : params.previewMode;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'preview';
  }, [params.previewMode]);

  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'info' | 'capture'>(isEditMode ? 'capture' : 'info');
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [prefsProfileId, setPrefsProfileId] = useState<string | null>(null);
  const [showWizardHints, setShowWizardHints] = useState(true);
  const [certificateId, setCertificateId] = useState<string | null>(() => seededCertificateId ?? null);
  const [certificateDoc, setCertificateDoc] = useState<Document | null>(null);
  const [pendingRotationDegrees, setPendingRotationDegrees] = useState(0);
  const [existing, setExisting] = useState<CompetencyCertificate | null>(seededCertificate ?? null);
  const [initialDraft, setInitialDraft] = useState<Draft>(
    seededCertificate ? draftFromCertificate(seededCertificate) : createEmptyDraft(),
  );
  const [draft, setDraft] = useState<Draft>(
    seededCertificate ? draftFromCertificate(seededCertificate) : createEmptyDraft(),
  );
  const [sheet, setSheet] = useState<SheetState>(null);
  const [editingInitial, setEditingInitial] = useState<string>('');
  const [formVisible, setFormVisible] = useState(false);
  const [ocrExtraction, setOcrExtraction] = useState<Extraction | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [extractionApplied, setExtractionApplied] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [initialDocLoaded, setInitialDocLoaded] = useState(false);
  const [initialDocId, setInitialDocId] = useState<string | null>(null);
  const [initialDocSignature, setInitialDocSignature] = useState<string | null>(null);
  const [initialDoc, setInitialDoc] = useState<Document | null>(null);
  const baselineSignatureRef = useRef<string | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const navigatedRef = useRef(false);
  const resetSignatureRef = useRef<string | null>(null);
  const ocrMissingNotifiedRef = useRef<string | null>(null);
  const suppressStatusScrollRef = useRef(false);
  const [showMissingRequired, setShowMissingRequired] = useState(false);
  const [showCalcMethodCard, setShowCalcMethodCard] = useState(false);
  const [ocrNonce, setOcrNonce] = useState(0);
  const skipOcrSignatureRef = useRef<string | null>(null);
  const suppressOcrDocIdRef = useRef<string | null>(null);
  const imageChangePromptedRef = useRef<string | null>(null);
  const licenceTypeAlertedRef = useRef<string | null>(null);

  useEffect(() => {
    const profile = listByType<Profile>('Profile')[0];
    if (!profile) {
      setShowWizardHints(true);
      setStep(isEditMode ? 'capture' : 'info');
      return;
    }
    setPrefsProfileId(profile.id);
    const prefs = ensureUserPrefs(profile.id);
    setUserPrefs(prefs);
    const show = prefs.showCompetencyWizardHint !== false;
    setShowWizardHints(show);
    setStep(isEditMode ? 'capture' : (show ? 'info' : 'capture'));
  }, [isEditMode]);

  useEffect(() => {
    if (seededCertificate) {
      const base = draftFromCertificate(seededCertificate);
      setExisting(seededCertificate);
      setInitialDraft(base);
      setDraft(cloneDraft(base));
      return;
    }
    setExisting(null);
    const empty = createEmptyDraft();
    setInitialDraft(empty);
    setDraft(cloneDraft(empty));
  }, [seededCertificate]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const latestDocRef = useRef<string | null>(null);
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const loadedExistingRef = useRef(false);
  const statusCardTopRef = useRef<number | null>(null);
  const calcMethodTopRef = useRef<number | null>(null);
  const linkDocumentToCertificate = useCallback(
    (doc: Document | null) => {
      setCertificateDoc(doc);
      if (isEditMode) return;
      const parentId = doc?.parentId;
      if (!doc?.id || !parentId) return;
      const cert = getById<CompetencyCertificate>(parentId);
      if (!cert) return;
      if (cert.certificateDocumentId === doc.id) return;
      const updated = touch({ ...cert, certificateDocumentId: doc.id } as CompetencyCertificate);
      void persistAsync(updated);
    },
    [isEditMode],
  );

  useEffect(() => {
    latestDocRef.current = certificateDoc?.id ?? null;
  }, [certificateDoc]);

  const previousDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    const nextId = certificateDoc?.id ?? null;
    if (previousDocIdRef.current !== nextId) {
      previousDocIdRef.current = nextId;
      setPendingRotationDegrees(0);
    }
  }, [certificateDoc?.id]);

  useEffect(() => {
    if (!seededCertificateId) return;
    if (loadedExistingRef.current) return;
    loadedExistingRef.current = true;
    setCertificateId(seededCertificateId);
    const allDocs = listByType<Document>('Document');
    const forCert = allDocs.filter(
      doc => doc.parentType === 'CompetencyCertificate' && doc.parentId === seededCertificateId
    );
    if (!forCert.length) {
      setInitialDocLoaded(true);
      return;
    }
    const preferredId = seededCertificate?.certificateDocumentId?.trim();
    const doc =
      (preferredId ? forCert.find(item => item.id === preferredId) : null) ??
      forCert[0];
    linkDocumentToCertificate(doc ?? null);
    setInitialDoc(doc ?? null);
    setInitialDocId(doc?.id ?? null);
    setInitialDocSignature(
      doc ? `${doc.id}:${doc.updatedAt ?? doc.createdAt ?? ''}` : null,
    );
    setInitialDocLoaded(true);
  }, [linkDocumentToCertificate, seededCertificate?.certificateDocumentId, seededCertificateId]);

  useEffect(() => {
    if (baselineReady) return;
    if (initialDocLoaded) {
      baselineSignatureRef.current = initialDocId ? String(initialDocId) : '';
      setBaselineReady(true);
      return;
    }
    if (!seededCertificateId) {
      baselineSignatureRef.current = '';
      setBaselineReady(true);
    }
  }, [baselineReady, initialDocLoaded, initialDocSignature, seededCertificateId]);

  const captureReady = !!certificateDoc;
  const hasInitialDoc = initialDocLoaded && !!initialDocId;
  const currentDocSignature = certificateDoc ? String(certificateDoc.id ?? '') : '';

  const scrollToStatusCard = useCallback(() => {
    if (suppressStatusScrollRef.current) return;
    const y = statusCardTopRef.current;
    if (typeof y !== 'number') return;
    captureScrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  const hasFormData = useMemo(() => {
    if (draft.categories.length > 0) return true;
    if (normalizeString(draft.licenceTypeCode)) return true;
    if (normalizeString(draft.certificateNumber)) return true;
    if (normalizeString(draft.issuedAt)) return true;
    if (normalizeString(draft.expiresAt)) return true;
    if (normalizeString(draft.trainingProvider)) return true;
    if (draft.isCurrent !== initialDraft.isCurrent) return true;
    return false;
  }, [draft, initialDraft.isCurrent]);

  const handleImageChangeDecision = useCallback(
    (shouldClear: boolean) => {
      if (shouldClear) {
        skipOcrSignatureRef.current = null;
        const empty = createEmptyDraft();
        setInitialDraft(empty);
        setDraft(cloneDraft(empty));
        setExtractionApplied(false);
        setOcrStatus('idle');
        setOcrError(null);
        setOcrExtraction(null);
        setOcrNonce(value => value + 1);
        return;
      }
      skipOcrSignatureRef.current = currentDocSignature || null;
      setOcrStatus('done');
      setOcrError(null);
      setOcrExtraction(null);
      setExtractionApplied(true);
    },
    [currentDocSignature],
  );

  useEffect(() => {
    if (!captureReady || !baselineReady) return;
    const baseline = baselineSignatureRef.current;
    if (baseline && currentDocSignature === baseline) {
      resetSignatureRef.current = null;
      return;
    }
    if (currentDocSignature && currentDocSignature !== resetSignatureRef.current) {
      resetSignatureRef.current = currentDocSignature;
      if (imageChangePromptedRef.current === currentDocSignature) return;
      imageChangePromptedRef.current = currentDocSignature;
      if (!hasFormData) {
        handleImageChangeDecision(true);
        return;
      }
      skipOcrSignatureRef.current = currentDocSignature;
      Alert.alert(
        'Clear form?',
        'You changed the competency certificate image. Do you want to clear the form and re-run OCR?',
        [
          { text: 'Keep', style: 'cancel', onPress: () => handleImageChangeDecision(false) },
          { text: 'Clear', style: 'destructive', onPress: () => handleImageChangeDecision(true) },
        ],
      );
    }
  }, [baselineReady, captureReady, currentDocSignature, handleImageChangeDecision, hasFormData]);

  useEffect(() => {
    return () => {
      if (navigatedRef.current) return;
      const docId = latestDocRef.current;
      if (docId && createdDocIdsRef.current.has(docId)) {
        const doc = getById<Document>(docId);
        if (doc) {
          void deleteDocumentFiles(doc);
        }
        deleteEntity(docId);
        createdDocIdsRef.current.delete(docId);
      }
    };
  }, []);


  const hasImageChanges = useMemo(() => {
    if (!captureReady) return false;
    const baseline = baselineSignatureRef.current;
    if (!baselineReady) return false;
    if (baseline === null) return true;
    return baseline !== currentDocSignature;
  }, [baselineReady, captureReady, currentDocSignature]);
  const normalizeRotation = useCallback((value: number) => ((value % 360) + 360) % 360, []);
  const normalizedPendingRotation = useMemo(
    () => normalizeRotation(pendingRotationDegrees),
    [normalizeRotation, pendingRotationDegrees],
  );
  const queueRotation = useCallback(() => {
    setPendingRotationDegrees((prev) => prev - 90);
  }, []);
  const hasPendingRotation = normalizedPendingRotation !== 0;
  const previewRequiresUpdate = fromPreview && hasInitialDoc && !hasImageChanges;

  const cleanupDocuments = useCallback((opts?: { keepCertificateId?: boolean }) => {
    setCertificateDoc(prev => {
      if (prev && createdDocIdsRef.current.has(prev.id)) {
        void deleteDocumentFiles(prev);
        deleteEntity(prev.id);
        createdDocIdsRef.current.delete(prev.id);
      }
      return null;
    });
    if (!opts?.keepCertificateId) {
      createdDocIdsRef.current.clear();
      setCertificateId(null);
    }
    setInitialDocId(null);
    setInitialDocSignature(null);
    setInitialDocLoaded(false);
    setInitialDoc(null);
  }, []);

  const deleteDocumentArtifacts = useCallback(async (doc?: Document | null) => {
    if (!doc) return;
    try {
      await deleteDocumentFiles(doc);
    } catch (error) {
      logger.warn('[competency/wizard] Failed to delete document files', error);
    }
    deleteEntity(doc.id);
    createdDocIdsRef.current.delete(doc.id);
  }, []);

  const ensureCertificateId = useCallback(() => {
    if (certificateId) return certificateId;
    const nextId = createRandomId('cert');
    setCertificateId(nextId);
    return nextId;
  }, [certificateId]);

  const ensureProfile = useCallback((): Profile => {
    const prof = listByType<Profile>('Profile')[0];
    if (prof) return prof;
    const created = withMeta<Profile>({
      id: globalThis.crypto?.randomUUID?.() ?? `prof_${Math.random().toString(36).slice(2)}`,
      type: 'Profile',
    } as any);
    persist(created);
    return created;
  }, []);

  type WizardAsset = ImagePicker.ImagePickerAsset | {
    uri: string;
    mimeType?: string | null;
    name?: string | null;
    fileName?: string | null;
    size?: number | null;
    fileSize?: number | null;
  };

  const saveCertificateDocument = useCallback(
    async (id: string, asset: WizardAsset, existing?: Document | null) => {
      const label = 'Competency certificate';
      const holder = ensureProfile();
      const allowUpdateExisting =
        !isEditMode || (existing?.id && createdDocIdsRef.current.has(existing.id));
      const existingForUpsert = allowUpdateExisting ? existing : undefined;
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'CompetencyCertificate',
          parentId: id,
          holderProfileId: holder.id,
          label,
          kind: 'COMPETENCY_CERT',
          side: 'front',
          createDocumentId: () => createRandomId('doc'),
        },
        existing: existingForUpsert,
      });
      const updated = touch({
        ...document,
        name: label,
        requirementCode: 'COMPETENCY_CERT',
        requirementRelatedId: id,
        requirementRelatedLabel: label,
      } as Document);
      if (createdNew) {
        createdDocIdsRef.current.add(updated.id);
      }
      return updated;
    },
    [ensureProfile, isEditMode],
  );

  const capturePhoto = useCallback(
    async (id: string, existing?: Document | null): Promise<Document | null> => {
      const ok = await ensureCameraPermission({
        title: 'Camera access needed',
        settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
      });
      if (!ok) return null;
      const cameraOptions: ImagePicker.ImagePickerOptions = {
        quality: 1,
        base64: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        exif: false,
      };
      if (jpegExportType) {
        (cameraOptions as any).imageExportType = jpegExportType;
      }
      setProcessing(true);
      await nextFrame();
      const result = await ImagePicker.launchCameraAsync(cameraOptions as any);
      if (result.canceled || !result.assets?.length) {
        setProcessing(false);
        return null;
      }
      const asset = await prepareWizardImage(result.assets[0]);
      const doc = await saveCertificateDocument(id, asset, existing);
      return doc;
    },
    [saveCertificateDocument, setProcessing],
  );

  const handleInfoContinue = useCallback(() => {
    setStep('capture');
  }, []);

  const calculatedExpiryPreview = useMemo(() => {
    const issuedAt = normalizeString(draft.issuedAt);
    if (!issuedAt || draft.categories.length === 0) return null;
    const profileId = listByType<Profile>('Profile')[0]?.id;
    const firearms = listByType<Firearm>('Firearm');
    const relevantFirearms = profileId
      ? firearms.filter((firearm) => !firearm.holderProfileId || firearm.holderProfileId === profileId)
      : firearms;
    const certificate = {
      categories: draft.categories,
      issuedAt,
    } as CompetencyCertificate;
    return {
      compCert: resolveCompetencyExpiryCompCertCalc({
        certificate,
        firearms: relevantFirearms,
      }),
      firearm: resolveCompetencyExpiryFirearmCalc({
        certificate,
        firearms: relevantFirearms,
      }),
    };
  }, [draft.categories, draft.issuedAt]);

  const selectedCompetencyExpiryMethod = userPrefs?.dfoCompetencyExpiryUsing;
  const compCertCalcMethodSet =
    userPrefs?.compCertCalcMethodSet ??
    (selectedCompetencyExpiryMethod !== undefined && selectedCompetencyExpiryMethod !== 'unknown');
  const displayedCompetencyExpiryMethod =
    !compCertCalcMethodSet && selectedCompetencyExpiryMethod === 'unknown'
      ? undefined
      : selectedCompetencyExpiryMethod;
  const calcMethodDirty = showCalcMethodCard && compCertCalcMethodSet;

  useEffect(() => {
    if (!userPrefs) return;
    setShowCalcMethodCard(!compCertCalcMethodSet);
  }, [userPrefs?.id]);

  const setCompetencyExpiryPreference = useCallback(
    (value: NonNullable<UserPrefs['dfoCompetencyExpiryUsing']>) => {
      if (!prefsProfileId) return;
      setUserPrefs((prev) => {
        const base = prev ?? ensureUserPrefs(prefsProfileId);
        const competencyCalcChanged = base.dfoCompetencyExpiryUsing !== value;
        const updated = {
          ...base,
          dfoCompetencyExpiryUsing: value,
          compCertCalcMethodSet: true,
          ...(competencyCalcChanged
            ? { competencyRemindersResetRequestedAt: new Date().toISOString() }
            : {}),
        } as UserPrefs;
        saveUserPrefs(updated);
        return updated;
      });
    },
    [prefsProfileId],
  );

  const scrollToCalcMethodSection = useCallback(() => {
    const y = calcMethodTopRef.current;
    if (typeof y !== 'number') return;
    captureScrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
  }, []);

  const persistShowHint = useCallback(
    (value: boolean) => {
      if (!prefsProfileId) return;
      setUserPrefs(prev => {
        const base = prev ?? ensureUserPrefs(prefsProfileId);
        const updated = { ...base, showCompetencyWizardHint: value };
        saveUserPrefs(updated);
        return updated;
      });
    },
    [prefsProfileId],
  );

  const disablePhotoLibraryAlert = useCallback(() => {
    if (!prefsProfileId) return;
    setUserPrefs(prev => {
      const base = prev ?? ensureUserPrefs(prefsProfileId);
      const updated = { ...base, showPhotoLibraryAlert: false };
      saveUserPrefs(updated);
      return updated;
    });
  }, [prefsProfileId]);

  const toggleShowHints = useCallback(() => {
    if (processing) return;
    const next = !showWizardHints;
    setShowWizardHints(next);
    persistShowHint(next);
  }, [persistShowHint, processing, showWizardHints]);

  const handleOpenHelp = useCallback(() => {
    openHelp(WIZARD_HELP_KEY);
  }, [openHelp]);

  const scrollToCaptureTop = useCallback(() => {
    captureScrollRef.current?.scrollTo({ y: Math.max(captureCardTop.current - 12, 0), animated: true });
  }, []);

  const pickFromLibrary = useCallback(
    async () => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return null;
      }
      const shouldShowPhotoLibraryAlert = userPrefs?.showPhotoLibraryAlert !== false;
      const ok = await ensurePhotoLibraryPermission({
        title: 'Photo library access needed',
        settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
        showLimitedAccessAlert: shouldShowPhotoLibraryAlert,
        onDisableLimitedAccessAlert: disablePhotoLibraryAlert,
      });
      if (!ok) return null;
      const libraryOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (libraryOptions as any).imageExportType = jpegExportType;
      }
      setProcessing(true);
      await nextFrame();
      const id = ensureCertificateId();
      try {
        const result = await ImagePicker.launchImageLibraryAsync(libraryOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessing(false);
          return null;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        const stored = await saveCertificateDocument(id, asset, certificateDoc);
        linkDocumentToCertificate(stored);
        setTimeout(scrollToCaptureTop, 100);
        return stored;
      } catch (error: any) {
        logger.warn('[competency/wizard] Failed to pick certificate photo', error);
        Alert.alert(
          'Unable to use photo',
          error?.message ?? 'Something went wrong while importing the photo. Please try again.'
        );
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [
      certificateDoc,
      disablePhotoLibraryAlert,
      ensureCertificateId,
      linkDocumentToCertificate,
      processing,
      saveCertificateDocument,
      scrollToCaptureTop,
      userPrefs?.showPhotoLibraryAlert,
    ],
  );

  const handleUpload = useCallback(
    async () => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return null;
      }
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return null;
      const asset = res.assets[0];
      if (!asset?.uri) return null;
      const mime = (asset.mimeType ?? '').toLowerCase();
      const isPdf = mime.includes('pdf') || (asset.name ?? '').toLowerCase().endsWith('.pdf');
      const id = ensureCertificateId();
      setProcessing(true);
      await nextFrame();
      try {
        if (isPdf) {
          const rasterized = await rasterizePdf(asset.uri, 150);
          try {
            if (rasterized.pages.length > 1) {
              Alert.alert(
                'Only first page used',
                'This PDF has multiple pages. Only the first page will be used. If your certificate is on another page, use the camera or photo library.'
              );
            }
            const firstPage = rasterized.pages[0];
            if (!firstPage) return null;
            const pdfAsset = {
              uri: firstPage.uri,
              mimeType: 'image/jpeg',
              fileName: 'competency.pdf.jpg',
              name: 'competency.pdf.jpg',
            };
            const stored = await saveCertificateDocument(id, pdfAsset as any, certificateDoc);
            linkDocumentToCertificate(stored);
            setTimeout(scrollToCaptureTop, 100);
            return stored;
          } finally {
            await rasterized.cleanup().catch(() => {});
          }
        }
        const prepared = await prepareWizardImage(asset as any);
        const stored = await saveCertificateDocument(id, prepared as any, certificateDoc);
        linkDocumentToCertificate(stored);
        setTimeout(scrollToCaptureTop, 100);
        return stored;
      } catch (error: any) {
        logger.warn('[competency/wizard] Failed to upload certificate', error);
        Alert.alert(
          'Unable to use file',
          error?.message ?? 'Something went wrong while importing the file. Please try again.'
        );
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [certificateDoc, ensureCertificateId, linkDocumentToCertificate, prepareWizardImage, processing, saveCertificateDocument, scrollToCaptureTop],
  );

  const captureCertificate = useCallback(
    async (): Promise<Document | null> => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return null;
      }
      const id = ensureCertificateId();
      try {
        const captured = await capturePhoto(id, certificateDoc);
        if (!captured) return null;
        linkDocumentToCertificate(captured);
        setTimeout(scrollToCaptureTop, 100);
        return captured;
      } catch (error: any) {
        logger.warn('[competency/wizard] Failed to capture certificate', error);
        Alert.alert(
          'Capture failed',
          error?.message ?? 'Something went wrong while capturing the photo. Please try again.'
        );
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [capturePhoto, certificateDoc, ensureCertificateId, linkDocumentToCertificate, processing, scrollToCaptureTop],
  );

  const handleCapture = useCallback(() => {
    captureCertificate();
  }, [captureCertificate]);

  const handleLibrary = useCallback(() => {
    pickFromLibrary();
  }, [pickFromLibrary]);

  const handleDelete = useCallback(async () => {
    if (processing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    if (!certificateDoc) return;
    setProcessing(true);
    try {
      if (isEditMode && !createdDocIdsRef.current.has(certificateDoc.id)) {
        setCertificateDoc(null);
      } else {
        await deleteDocumentArtifacts(certificateDoc);
        setCertificateDoc(null);
      }
    } catch (error: any) {
      logger.warn('[competency/wizard] Failed to delete certificate photo', error);
      Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
    } finally {
      setProcessing(false);
    }
  }, [certificateDoc, deleteDocumentArtifacts, isEditMode, processing]);

  const applyPendingImageRotation = useCallback(async (): Promise<Document | null> => {
    if (!certificateDoc) return certificateDoc;
    if (!normalizedPendingRotation) return certificateDoc;
    const sourceUri = resolveDocumentUri(certificateDoc.uri ?? certificateDoc.filePath);
    if (!sourceUri) return certificateDoc;

    const manipulated = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ rotate: normalizedPendingRotation }],
      {},
    );
    if (manipulated.uri !== sourceUri) {
      await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
    }
    const rotated = touch({
      ...certificateDoc,
      identityDocumentSide: 'front',
    } as Document);
    persist(rotated);
    suppressOcrDocIdRef.current = rotated.id;
    setCertificateDoc(rotated);
    setPendingRotationDegrees(0);
    return rotated;
  }, [certificateDoc, normalizedPendingRotation]);

  useEffect(() => {
    if (!certificateDoc) {
      if (formVisible) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setFormVisible(false);
      setOcrExtraction(null);
      setOcrError(null);
      setOcrStatus('idle');
      setExtractionApplied(false);
      return;
    }
    if (suppressOcrDocIdRef.current && suppressOcrDocIdRef.current === certificateDoc.id) {
      suppressOcrDocIdRef.current = null;
      setOcrStatus('done');
      setOcrError(null);
      setExtractionApplied(true);
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFormVisible(true);
    const skipOcrInEdit = isEditMode && !hasImageChanges;
    if (skipOcrInEdit) {
      setOcrExtraction(null);
      setOcrError(null);
      setOcrStatus('done');
      setExtractionApplied(true);
      return;
    }
    if (skipOcrSignatureRef.current && currentDocSignature === skipOcrSignatureRef.current) {
      setOcrExtraction(null);
      setOcrError(null);
      setOcrStatus('done');
      setExtractionApplied(true);
      return;
    }
    setOcrStatus('running');
    suppressStatusScrollRef.current = false;
    setOcrError(null);
    setExtractionApplied(false);
    setOcrProcessing(true);
    const doc = certificateDoc;
    (async () => {
      try {
        const extraction = await performDocumentExtraction(doc, {
          extractionType: 'CompetencyCertificate',
          force: true,
        });
        setOcrExtraction(extraction);
        setOcrError(extraction?.errorMessage ?? null);
      } catch (error: any) {
        setOcrError(error?.message ?? 'Unable to extract data from this document.');
      } finally {
        setOcrStatus('done');
        setOcrProcessing(false);
        void nextFrame().then(scrollToStatusCard);
      }
    })();
  }, [certificateDoc, currentDocSignature, formVisible, hasImageChanges, isEditMode, ocrNonce, scrollToStatusCard]);

  useEffect(() => {
    if (!ocrExtraction) return;
    if (extractionApplied) return;
    if (ocrExtraction.extractionType !== 'CompetencyCertificate') {
      setExtractionApplied(true);
      return;
    }
    const partial = mapCompetencyExtraction(ocrExtraction);
    if (partial.licenceTypeCode && partial.licenceTypeCode !== '1.1') {
      const signature = `${ocrExtraction.id}:${partial.licenceTypeCode}`;
      if (licenceTypeAlertedRef.current !== signature) {
        licenceTypeAlertedRef.current = signature;
        Alert.alert(
          'Unsupported certificate type',
          'Only Competency Certificates to Possess a firearm is currently supported by the app.',
        );
      }
      setDraft(prev => ({
        ...createEmptyDraft(),
        isCurrent: prev.isCurrent,
      }));
      setExtractionApplied(true);
      return;
    }
    const forceOverwrite = isEditMode && hasImageChanges;
    if (forceOverwrite) {
      setDraft(prev => ({
        ...createEmptyDraft(),
        isCurrent: prev.isCurrent,
        certificateNumber: partial.certificateNumber ?? '',
        expiresAt: partial.expiresAt ?? '',
        trainingProvider: partial.trainingProvider ?? '',
        licenceTypeCode: partial.licenceTypeCode ?? '',
        categories: partial.categories ? [...partial.categories] : [],
      }));
      setExtractionApplied(true);
      return;
    }

    setDraft(prev => {
      let next = prev;
      const assign = (key: keyof Draft, value?: string) => {
        if (!value) return;
        const current = typeof prev[key] === 'string' ? prev[key] : '';
        if (current) return;
        next = next === prev ? { ...prev } : next;
        (next as any)[key] = value;
      };

      assign('certificateNumber', partial.certificateNumber);
      assign('expiresAt', partial.expiresAt);
      assign('trainingProvider', partial.trainingProvider);
      assign('licenceTypeCode', partial.licenceTypeCode);
      if ((prev.categories?.length ?? 0) === 0 && partial.categories && partial.categories.length) {
        if (next === prev) {
          next = { ...prev, categories: [...partial.categories] };
        } else {
          (next as Draft).categories = [...partial.categories];
        }
      }
      return next;
    });

    setExtractionApplied(true);
  }, [extractionApplied, hasImageChanges, isEditMode, ocrExtraction]);

  const goReturn = useCallback(
    (ids?: string[]) => {
      const ensured = returnToPath || defaultReturnPath;
      const [base, query = ''] = ensured.split('?');
      const search = new URLSearchParams(query);
      const finalIds = ids ?? selectedCertIdsParam;
      if (finalIds.length) {
        search.set(selectionParam, JSON.stringify(finalIds));
      } else {
        search.delete(selectionParam);
      }
      if (introFlag) {
        search.set('intro', introFlag);
      }
      const target = search.toString() ? `${base}?${search.toString()}` : base;
      backOrReplaceWithContext(
        router as any,
        { ...navCtx, routeBack: target, returnTo: target, onComplete: target },
        defaultReturnPath as any,
      );
    },
    [introFlag, navCtx, returnToPath, router, selectionParam, selectedCertIdsParam],
  );

  const restoreInitialDocAndClose = useCallback(() => {
    const created = Array.from(createdDocIdsRef.current);
    created.forEach((id) => {
      const doc = getById<Document>(id);
      if (doc) {
        void deleteDocumentArtifacts(doc);
      } else {
        deleteEntity(id);
      }
    });
    createdDocIdsRef.current.clear();
    setCertificateDoc(initialDoc ?? null);
    setStep('info');
    goReturn();
  }, [deleteDocumentArtifacts, goReturn, initialDoc]);

  const toggleCat = useCallback((value: CompetencyCategory) => {
    setDraft(prev => {
      const next = new Set(prev.categories ?? []);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, categories: Array.from(next) };
    });
  }, []);

  const missingRequiredFields = useMemo<RequiredField[]>(() => {
    const missing: RequiredField[] = [];
    if (!compCertCalcMethodSet) missing.push('calcMethod');
    if (!normalizeString(draft.licenceTypeCode)) missing.push('licenceTypeCode');
    if (draft.categories.length === 0) missing.push('categories');
    if (!normalizeString(draft.certificateNumber)) missing.push('certificateNumber');
    if (!normalizeString(draft.issuedAt)) missing.push('issuedAt');
    return missing;
  }, [compCertCalcMethodSet, draft]);
  const missingRequiredLabels = useMemo(
    () => missingRequiredFields.map((field) => REQUIRED_FIELD_LABELS[field]),
    [missingRequiredFields],
  );

  const scrollToRequiredField = useCallback((field: RequiredField) => {
    const position = requiredFieldPositions.current[field];
    if (typeof position !== 'number') return;
    captureScrollRef.current?.scrollTo({
      y: Math.max(position - 12, 0),
      animated: true,
    });
  }, []);

  useEffect(() => {
    if (!validationEnabled) return;
    if (!formVisible) return;
    if (ocrStatus !== 'done') return;
    if (ocrExtraction && !extractionApplied) return;
    const key = ocrExtraction?.id ?? (certificateDoc?.id ? `${certificateDoc.id}:manual` : null);
    if (!key) return;
    if (ocrMissingNotifiedRef.current === key) return;
    if (ocrMissingAlerted.has(key)) {
      setShowMissingRequired(true);
      ocrMissingNotifiedRef.current = key;
      return;
    }
    ocrMissingNotifiedRef.current = key;
    setShowMissingRequired(true);
    if (missingRequiredFields.length === 0) return;
    ocrMissingAlerted.add(key);
  }, [
    certificateDoc,
    extractionApplied,
    formVisible,
    missingRequiredFields,
    ocrExtraction,
    ocrStatus,
    validationEnabled,
  ]);

  const openEditor = useCallback((key: SheetKey, title: string, mask?: 'date') => {
    setEditingInitial(draft[key] ?? '');
    setSheet({ type: 'text', key, title, mask });
  }, [draft]);

  const onSaveEditor = useCallback(
    (value: string) => {
      if (!sheet || sheet.type !== 'text') return;
      const nextValue = sheet.mask === 'date' ? value.trim() : value;
      setDraft(prev => ({ ...prev, [sheet.key]: nextValue }));
      setSheet(null);
    },
    [sheet],
  );

  const openCertificateTypeSheet = useCallback(() => {
    setSheet({ type: 'select', key: 'certificateType', title: 'Certificate type' });
  }, []);

  const onPickCertificateType = useCallback((value: string) => {
    setDraft(prev => ({ ...prev, licenceTypeCode: value }));
    setSheet(null);
  }, []);

  const openFirstMissingField = useCallback(
    (fields: RequiredField[]) => {
      if (!fields.length) return;
      const ranked = fields
        .map((field) => ({
          field,
          position: requiredFieldPositions.current[field] ?? Number.POSITIVE_INFINITY,
        }))
        .sort((a, b) => a.position - b.position);
      const target = ranked[0]?.field ?? fields[0];
      scrollToRequiredField(target);
      if (target === 'calcMethod') {
        return;
      }
      if (target === 'licenceTypeCode') {
        openCertificateTypeSheet();
        return;
      }
      if (target === 'certificateNumber') {
        void nextFrame().then(() => certificateNumberInputRef.current?.focus());
        return;
      }
      if (target === 'issuedAt') {
        void nextFrame().then(() => issuedAtInputRef.current?.focus());
        return;
      }
    },
    [openCertificateTypeSheet, scrollToRequiredField],
  );

  const startMissingFieldFlow = useCallback(
    (fields: RequiredField[], opts?: { autoSave?: boolean }) => {
      if (!fields.length) return;
      suppressStatusScrollRef.current = true;
      missingFieldFlowRef.current = { autoSave: opts?.autoSave !== false };
      void nextFrame().then(() => openFirstMissingField(fields));
    },
    [openFirstMissingField],
  );

  const changedFields = useMemo(() => {
    const diffs: DraftField[] = [];
    if (!categoriesEqual(draft.categories, initialDraft.categories)) diffs.push('categories');
    if (normalizeString(draft.licenceTypeCode) !== normalizeString(initialDraft.licenceTypeCode)) diffs.push('licenceTypeCode');
    if (normalizeString(draft.certificateNumber) !== normalizeString(initialDraft.certificateNumber)) diffs.push('certificateNumber');
    if (normalizeString(draft.issuedAt) !== normalizeString(initialDraft.issuedAt)) diffs.push('issuedAt');
    if (normalizeString(draft.expiresAt) !== normalizeString(initialDraft.expiresAt)) diffs.push('expiresAt');
    if (normalizeString(draft.trainingProvider) !== normalizeString(initialDraft.trainingProvider)) diffs.push('trainingProvider');
    if (draft.isCurrent !== initialDraft.isCurrent) diffs.push('isCurrent');
    return diffs;
  }, [draft, initialDraft]);

  const hasUnsavedChanges = changedFields.length > 0 || hasImageChanges || hasPendingRotation || calcMethodDirty;
  const invalidIssued = validationEnabled && !!draft.issuedAt && !validateDateISO(draft.issuedAt);
  const invalidExpires = validationEnabled && !!draft.expiresAt && !validateDateISO(draft.expiresAt);
  const missingCertificateType = validationEnabled && showMissingRequired && !normalizeString(draft.licenceTypeCode);
  const missingCategories = validationEnabled && showMissingRequired && draft.categories.length === 0;
  const missingCertificateNumber = validationEnabled && showMissingRequired && !normalizeString(draft.certificateNumber);
  const missingIssued = validationEnabled && showMissingRequired && !normalizeString(draft.issuedAt);
  const missingCalcMethod = validationEnabled && showMissingRequired && !compCertCalcMethodSet;
  const certificateTypeLabel = useMemo(
    () => formatCertificateTypeLabel(draft.licenceTypeCode),
    [draft.licenceTypeCode],
  );

  const applyCompetencyExpiryUpdates = useCallback(() => {
    const { updatedById } = recalculateAndPersistCompetencyExpiries();
    return updatedById;
  }, []);

  const persistDraft = useCallback((): CompetencyCertificate | null => {
    const trimmedLicenceType = draft.licenceTypeCode.trim();
    const normalizedCertNumber = normalizeString(draft.certificateNumber);
    if (validationEnabled && missingRequiredFields.length > 0) {
      setShowMissingRequired(true);
      const summary = missingRequiredLabels.map((label) => `• ${label}`).join('\n');
      const message = summary
        ? `Please complete the following before saving:\n\n${summary}`
        : 'Please complete the required competency fields before saving.';
      Alert.alert('Missing details', message, [
        {
          text: 'OK',
          onPress: () => {
            startMissingFieldFlow(missingRequiredFields, { autoSave: true });
          },
        },
      ]);
      return null;
    }
    if (validationEnabled && draft.categories.length === 0) {
      Alert.alert('Select categories', 'Pick at least one competency category.');
      return null;
    }
    if (validationEnabled && draft.issuedAt && !validateDateISO(draft.issuedAt)) {
      Alert.alert('Invalid date', 'Issued date should be YYYY-MM-DD, e.g. 2024-05-17');
      return null;
    }
    if (validationEnabled && draft.expiresAt && !validateDateISO(draft.expiresAt)) {
      Alert.alert('Invalid date', 'Expiry date should be YYYY-MM-DD, e.g. 2027-05-17');
      return null;
    }
    if (duplicateChecksEnabled) {
      const comparable = normalizeForCompare(normalizedCertNumber);
      if (comparable) {
        const excludeId = existing?.id ?? certificateId ?? null;
        const duplicate = listByType<CompetencyCertificate>('CompetencyCertificate').find(cert => {
          if (!cert.certificateNumber) return false;
          if (excludeId && String(cert.id) === String(excludeId)) return false;
          return normalizeForCompare(cert.certificateNumber) === comparable;
        });
        if (duplicate) {
          const dupeLabel = duplicate.certificateNumber?.trim() || 'Existing certificate';
          Alert.alert(
            'Duplicate certificate',
            `A competency certificate with number "${dupeLabel}" already exists.`
          );
          return null;
        }
      }
    }

    if (existing) {
      const next = touch({
        ...existing,
        categories: [...draft.categories],
        certificateNumber: normalizedCertNumber || undefined,
        trainingProvider: normalizeString(draft.trainingProvider) || undefined,
        issuedAt: normalizeString(draft.issuedAt) || undefined,
        expiresAt: normalizeString(draft.expiresAt) || undefined,
        isCurrent: draft.isCurrent,
        licenceTypes: trimmedLicenceType ? [trimmedLicenceType] : undefined,
        certificateDocumentId: certificateDoc?.id ?? existing.certificateDocumentId,
      } as CompetencyCertificate);
      persist(next);
      setExisting(next);
      const base = draftFromCertificate(next);
      setInitialDraft(base);
      setDraft(cloneDraft(base));
      return next;
    }

    const holder = ensureProfile();
    const seededId = ensureCertificateId();
    const cert = withMeta<CompetencyCertificate>({
      id: seededId,
      type: 'CompetencyCertificate',
      holderProfileId: holder.id,
      categories: [...draft.categories],
      certificateNumber: normalizedCertNumber || undefined,
      trainingProvider: normalizeString(draft.trainingProvider) || undefined,
      issuedAt: normalizeString(draft.issuedAt) || undefined,
      expiresAt: normalizeString(draft.expiresAt) || undefined,
      certificateDocumentId: certificateDoc?.id ?? undefined,
      isCurrent: draft.isCurrent,
      licenceTypes: trimmedLicenceType ? [trimmedLicenceType] : undefined,
    } as any);
    persist(cert);
    setExisting(cert);
    const base = draftFromCertificate(cert);
    setInitialDraft(base);
    setDraft(cloneDraft(base));
    return cert;
  }, [
    certificateDoc?.id,
    certificateId,
    draft,
    duplicateChecksEnabled,
    ensureCertificateId,
    ensureProfile,
    existing,
    missingRequiredFields,
    missingRequiredLabels,
    startMissingFieldFlow,
    validationEnabled,
  ]);

  const saveChanges = useCallback((opts?: { onSaved?: (nextIds: string[]) => void }) => {
    if (!captureReady) {
      Alert.alert('Capture needed', 'Please capture a photo of your competency certificate.');
      return;
    }
    if (!hasUnsavedChanges) return;
    void (async () => {
      let activeDoc: Document | null = certificateDoc;
      try {
        activeDoc = await applyPendingImageRotation();
      } catch (error: any) {
        logger.warn('[competency/wizard] Failed to apply pending image rotation', error);
        Alert.alert('Unable to save', error?.message ?? 'Something went wrong while applying image rotation.');
        return;
      }
      if (isEditMode && initialDoc && activeDoc && initialDoc.id !== activeDoc.id) {
        void deleteDocumentArtifacts(initialDoc);
      }
      const saved = persistDraft();
      if (!saved) return;
      const updatedMap = applyCompetencyExpiryUpdates();
      const refreshed = updatedMap.get(String(saved.id));
      if (refreshed) {
        setExisting(refreshed);
        const base = draftFromCertificate(refreshed);
        setInitialDraft(base);
        setDraft(cloneDraft(base));
      }
      const nextIds = isEditMode ? selectedCertIdsParam : ensureSelectionWith(saved.id);
      if (opts?.onSaved) {
        navigatedRef.current = true;
        opts.onSaved(nextIds);
        return;
      }
      navigatedRef.current = true;
      goReturn(nextIds);
    })();
  }, [
    applyPendingImageRotation,
    applyCompetencyExpiryUpdates,
    captureReady,
    certificateDoc,
    deleteDocumentArtifacts,
    ensureSelectionWith,
    goReturn,
    hasUnsavedChanges,
    initialDoc,
    isEditMode,
    persistDraft,
    selectedCertIdsParam,
  ]);

  useEffect(() => {
    if (!missingFieldFlowRef.current) return;
    if (!validationEnabled) {
      missingFieldFlowRef.current = null;
      return;
    }
    if (sheet) return;
    if (missingRequiredFields.length > 0) {
      openFirstMissingField(missingRequiredFields);
      return;
    }
    const autoSave = missingFieldFlowRef.current.autoSave;
    missingFieldFlowRef.current = null;
    if (autoSave) {
      saveChanges();
    }
  }, [missingRequiredFields, openFirstMissingField, saveChanges, sheet, validationEnabled]);

  const startAnother = useCallback(
    (ids?: string[]) => {
      navigatedRef.current = true;
      router.replace({
        pathname: '/competency/wizard',
        params: buildWizardParams(ids),
      } as any);
    },
    [buildWizardParams, router],
  );

  const promptAddAnother = useCallback(
    (ids?: string[], opts?: { keepDocs?: boolean }) => {
      Alert.alert(
        'Add another certificate?',
        'Do you want to add another competency certificate now?',
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => {
              if (!opts?.keepDocs) {
                cleanupDocuments();
                setStep('info');
              }
              goReturn(ids);
            },
          },
          {
            text: 'Yes',
            onPress: () => startAnother(ids),
          },
        ],
      );
    },
    [cleanupDocuments, goReturn, startAnother],
  );

  const handleSave = useCallback(() => {
    if (isEditMode) {
      saveChanges();
      return;
    }
    saveChanges({ onSaved: (nextIds) => promptAddAnother(nextIds, { keepDocs: true }) });
  }, [isEditMode, promptAddAnother, saveChanges]);

  const handleClose = useCallback(() => {
    setSheet(null);
    if (processing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    if (hasUnsavedChanges) {
      Alert.alert('Save changes?', 'Would you like to save your changes before leaving?', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            if (isEditMode) {
              restoreInitialDocAndClose();
              return;
            }
            cleanupDocuments();
            setStep('info');
            goReturn();
          },
        },
        {
          text: 'Save',
          onPress: () => {
            if (isEditMode) {
              saveChanges();
              return;
            }
            saveChanges({ onSaved: (nextIds) => promptAddAnother(nextIds, { keepDocs: true }) });
          },
        },
      ]);
      return;
    }
    if (!isEditMode) {
      cleanupDocuments();
      setStep('info');
      goReturn();
      return;
    }
    restoreInitialDocAndClose();
    return;
  }, [
    cleanupDocuments,
    goReturn,
    hasUnsavedChanges,
    isEditMode,
    processing,
    promptAddAnother,
    restoreInitialDocAndClose,
    saveChanges,
  ]);

  const shouldShowStatus =
    processing ||
    ocrStatus === 'running' ||
    (initialDocLoaded && captureReady && (hasImageChanges || ocrError !== null));

  const skipOcrInEdit = isEditMode && !hasImageChanges;
  const ocrSuccess = ocrStatus === 'done' && !!ocrExtraction && !ocrError;
  const ocrReady = ocrStatus === 'done' && (ocrSuccess || skipOcrInEdit);
  const statusMessage = processing
    ? 'Processing your certificate photo...'
    : previewRequiresUpdate
      ? 'Capture a new photo to replace the existing certificate before continuing.'
      : captureReady
        ? ocrStatus === 'done'
          ? ocrSuccess || skipOcrInEdit
            ? 'Review and update the competency details below.'
            : 'Unable to extract data. Retake/upload image or manually update below.'
          : ocrStatus === 'running'
            ? 'Preparing your details...'
            : 'Review and update the competency details below.'
        : 'Capture a clear photo of the certificate to continue.';
  const statusStyle = processing
    ? [styles.captureStatusBox, styles.captureStatusInfo]
    : captureReady
      ? ocrReady
        ? [styles.captureStatusBox, styles.captureStatusSuccess]
        : [styles.captureStatusBox, styles.captureStatusWarning]
      : [styles.captureStatusBox, styles.captureStatusInfo];

  const Pill = ({ value }: { value: CompetencyCategory }) => {
    const selected = draft.categories.includes(value);
    const palette = categoryColors[value];
    const label = CATEGORY_LABELS[value] ?? value;
    return (
      <Pressable
        onPress={() => toggleCat(value)}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: selected ? palette.background : neutral.onBase,
            borderColor: missingCategories
              ? tones.orange.base
              : selected
                ? palette.activeBorder
                : palette.border,
            borderWidth: selected ? 2 : 1,
          },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.pillTxt,
            selected && styles.pillTxtSelected,
            { color: missingCategories ? tones.orange.base : selected ? palette.activeText : palette.text },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const Cell = ({
    label,
    value,
    onPress,
    warning,
    onLayout,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    warning?: boolean;
    onLayout?: (event: any) => void;
  }) => {
    const rawValue = typeof value === 'string' ? value : '';
    const trimmed = rawValue.trim();
    const hasValue = trimmed.length > 0;
    const displayValue = hasValue ? rawValue : 'Tap to add';
    return (
      <View style={{ marginBottom: 14 }} onLayout={onLayout}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cell,
            warning && styles.cellWarning,
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text
            style={[
              styles.value,
              !hasValue && styles.placeholder,
              warning && styles.valueWarning,
            ]}
            numberOfLines={2}
          >
            {displayValue}
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>
    );
  };

  const renderCaptureCard = (
    title: string,
    doc: Document | null,
    onCamera: () => void,
    onLibrary: () => void,
  ) => {
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    return (
      <PhotoCaptureCard
        title={title}
        helpText="Make sure the certificate details are sharp and legible."
        previewUri={uri}
        previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
        previewRotationDegrees={pendingRotationDegrees}
        persistRotationOnPreviewClose={false}
        previewKind={uri ? (isPdf ? 'pdf' : 'image') : undefined}
        previewLabel={"Tap to view"}
        onPressCamera={onCamera}
        onPressLibrary={onLibrary}
        onPressRotate={queueRotation}
        showRotateButton={!!uri && !isPdf}
        onPressUpload={handleUpload}
        // showUploadButton
        onDelete={handleDelete}
        deleteConfirmMessage="This will remove the image and clear the form data."
        disabled={processing}
        onLayout={(e) => {
          captureCardTop.current = e.nativeEvent.layout.y;
        }}
      />
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        {null}
        <PageHeader
          title={pageTitle}
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!hasUnsavedChanges}
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

        {step === 'info' ? (
          <PageScrollView contentContainerStyle={styles.content}>
            <View style={styles.intro}>
              {/* <Text style={styles.h1}>Scan your competency certificate</Text> */}
              <Text style={styles.lead}>
                We’ll help you capture the photo and extract the key details automatically.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>You’ll need</Text>
              {[
                'Your SAPS competency certificate and good lighting.',
                'A phone with a camera to take a photo of your certificate.',
                'You can also upload an existing photo of your competency certificate from your photo library.',
              ].map((item, index) => bullet(item, `need_${index}`))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tips for a clear photo</Text>
              {[
                'Clean your camera lens to reduce image blur and glare.',
                'Use good lighting and avoid glare or heavy shadows across the text.',
                'Place the certificate on a plain, solid-colour background.', 
                'Keep the photo in focus so details are sharp readable.',
                'Hold the camera steady and fill the frame with the certificate page.', 
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

            <Button label="Continue" onPress={handleInfoContinue} tone="teal" align="center" centerText />
          </PageScrollView>
        ) : (
          <PageScrollView ref={captureScrollRef} contentContainerStyle={styles.captureContent}>
            <Text style={styles.captureIntro}>
              {isEditMode
                ? 'Here is the photo of your competency certificate.'
                : 'Take a clear photo of your competency certificate. The app will try to extract the key details automatically. The uploaded document is used to complete your application and build a supporting document bundle.'}
            </Text>

            {step === 'capture' && showCalcMethodCard ? (
              <View
                style={[styles.calcMethodSection, missingCalcMethod && styles.calcMethodSectionWarning]}
                onLayout={(e) => {
                  calcMethodTopRef.current = e.nativeEvent.layout.y;
                  requiredFieldPositions.current.calcMethod = e.nativeEvent.layout.y;
                }}
              >
                <View style={styles.optionHeaderRow}>
                  <View style={styles.optionHeaderTextWrap}>
                    <Text style={styles.label}>Competency expiry calculation method:</Text>
                  </View>
                  <IconRoundButton
                    buttonType="help"
                    accessibilityLabel="Help for competency expiry setting"
                    onPress={() => openHelp('helpSettingsCompCertCalc')}
                    size="sm"
                    hitSlop={8}
                  />
                </View>
                <Text style={styles.helpSmall}>
                  Choose the method your DFO uses to calculate competency expiry so reminders are timely and relevant.
                </Text>
                <Text style={styles.helpSmall}>
                  You can always change this later in the Settings tab under Preferences.
                </Text>
                <View style={styles.options}>
                  {COMPETENCY_EXPIRY_OPTIONS.map(({ value, label }) => {
                    const selected = displayedCompetencyExpiryMethod === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setCompetencyExpiryPreference(value)}
                        style={[styles.radioRow, selected && styles.radioRowSelected]}
                        accessibilityRole="button"
                      >
                        <View style={[styles.radioOuter, selected && styles.radioOuterActive]}>
                          {selected && <View style={styles.radioInner} />}
                        </View>
                        <Text style={styles.radioLabel}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {renderCaptureCard('Competency Certificate', certificateDoc, handleCapture, handleLibrary)}

            {shouldShowStatus ? (
              <View
                style={styles.captureStatus}
                onLayout={(e) => {
                  statusCardTopRef.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={statusStyle}>
                  <Text style={styles.captureStatusText}>{statusMessage}</Text>
                </View>
              </View>
            ) : null}

            {formVisible ? (
              <Text style={styles.formHeading}>Competency details</Text>
            ) : null}

            {formVisible ? (
              <View style={styles.formSection}>
                <Cell
                  label="Certificate type"
                  value={certificateTypeLabel}
                  onPress={openCertificateTypeSheet}
                  warning={missingCertificateType}
                  onLayout={(e) => {
                    requiredFieldPositions.current.licenceTypeCode = e.nativeEvent.layout.y;
                  }}
                />
                <View
                  style={[styles.categoriesSection, missingCategories && styles.categoriesSectionWarning]}
                  onLayout={(e) => {
                    requiredFieldPositions.current.categories = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={[styles.sectionTitle, missingCategories && styles.sectionTitleWarning]}>Categories</Text>
                  <View style={styles.pillsRow}>
                    {CATS.map(c => (<Pill key={c} value={c} />))}
                  </View>
                </View>

                <View
                  style={{ marginBottom: 14 }}
                  onLayout={(e) => {
                    requiredFieldPositions.current.certificateNumber = e.nativeEvent.layout.y;
                  }}
                >
                  <WizardField
                    label="Certificate number"
                    value={draft.certificateNumber}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, certificateNumber: value }))}
                    placeholder="Required"
                    labelColor={styles.label.color}
                    autoCapitalize="characters"
                    hasError={missingCertificateNumber}
                    inputRef={certificateNumberInputRef}
                    inputStyle={[
                      styles.inlineDateInput,
                      missingCertificateNumber ? styles.inlineDateInputWarning : null,
                    ]}
                  />
                </View>
                <View
                  style={{ marginBottom: 14 }}
                  onLayout={(e) => {
                    requiredFieldPositions.current.issuedAt = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.label}>Date issued</Text>
                  <TextInput
                    ref={issuedAtInputRef}
                    value={draft.issuedAt}
                    onChangeText={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        issuedAt: maskDateYYYYMMDD(value),
                      }))
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={neutral.border}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.inlineDateInput,
                      (invalidIssued || missingIssued) ? styles.inlineDateInputWarning : null,
                    ]}
                  />
                </View>
              </View>
            ) : null}

            {formVisible && calculatedExpiryPreview ? (
              <View style={styles.calcInfoCard}>
                <Text style={styles.calcInfoTitle}>Calculated expiry dates</Text>
                <Text style={styles.calcInfoLine}>
                  Cert issue date expiry: {calculatedExpiryPreview.compCert ?? 'Not available'}
                </Text>
                <Text style={styles.calcInfoLine}>
                  Firearm-based expiry: {calculatedExpiryPreview.firearm ?? 'Not available'}
                </Text>
              </View>
            ) : null}

            <ButtonSave
              onPress={handleSave}
              disabled={!captureReady || !hasUnsavedChanges || processing}
              loading={processing}
              align="center"
            />
          </PageScrollView>
        )}
      </View>
      <ProcessingBlocker
        visible={processing || ocrProcessing}
        label={processing ? 'Processing...' : 'Extracting details...'}
      />
      <HelpModal {...helpModalProps} />

      {sheet?.type === 'text' && (
        <EditTextSheet
          visible
          title={sheet.title}
          initial={editingInitial}
          placeholder={sheet.title}
          onCancel={() => setSheet(null)}
          onSave={onSaveEditor}
          keyboardType={sheet.mask === 'date' ? 'numeric' : 'default'}
          mask={sheet.mask}
          autoCapitalize="characters"
        />
      )}

      {sheet?.type === 'select' && sheet.key === 'certificateType' && (
        <SelectSheet
          visible
          title={sheet.title}
          options={CERT_TYPE_OPTIONS}
          selected={draft.licenceTypeCode || undefined}
          onCancel={() => setSheet(null)}
          onPick={(value) => onPickCertificateType(String(value))}
        />
      )}
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
    sectionTitle: { fontSize: 14, fontWeight: '600', color: tones.teal.base, marginBottom: 8 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
    bulletMarker: { width: 18, fontSize: 16, lineHeight: 20, color: neutral.base },
    bulletText: { flex: 1, fontSize: 15, lineHeight: 20, color: neutral.base },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    hintTextWrap: { flex: 1, gap: 2 },
    hintLabel: { fontSize: 15, fontWeight: '600', color: neutral.onSurface },
    hintHelp: { fontSize: 13, color: neutral.base },
    captureContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
    captureIntro: { fontSize: 14, lineHeight: 20,color: neutral.base },
    captureStatus: { marginTop: 0, marginBottom: 0 },
    captureStatusBox: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
    captureStatusText: { fontSize: 14, fontWeight: '600', color: neutral.onSurface },
    captureStatusSuccess: {
      backgroundColor: tones.green.surface,
      borderWidth: 1,
      borderColor: tones.green.border,
    },
    captureStatusWarning: {
      backgroundColor: tones.orange.surface,
      borderWidth: 1,
      borderColor: tones.orange.border,
    },
    captureStatusInfo: {
      backgroundColor: tones.blue.surface,
      borderWidth: 1,
      borderColor: tones.blue.border,
    },
    calcMethodSection: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 8,
    },
    calcMethodSectionWarning: {
      borderColor: tones.orange.base,
    },
    calcInfoCard: {
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: tones.blue.surface,
      borderWidth: 1,
      borderColor: tones.blue.border,
      gap: 6,
    },
    calcInfoTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: tones.blue.base,
    },
    calcInfoLine: {
      fontSize: 14,
      lineHeight: 20,
      color: neutral.onSurface,
    },
    optionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    optionHeaderTextWrap: {
      flex: 1,
    },
    helpSmall: {
      fontSize: 13,
      lineHeight: 18,
      color: neutral.base,
    },
    options: {
      gap: 10,
    },
    radioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
    },
    radioRowSelected: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: neutral.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: neutral.onBase,
    },
    radioOuterActive: {
      borderColor: tones.teal.base,
    },
    radioInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tones.teal.base,
    },
    radioLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: neutral.onSurface,
      fontWeight: '600',
    },
    formHeading: { fontSize: 18, fontWeight: '700', color: neutral.onSurface, marginTop: 6 },
    formSection: { paddingTop: 0 },
    categoriesSection: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      padding: 10,
      marginBottom: 12
    },
    categoriesSectionWarning: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tones.orange.base,
      padding: 10,
      marginBottom: 12,
    },
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
    pillTxt: { fontWeight: '600' },
    pillTxtSelected: { fontWeight: '800' },
    label: { color: tones.teal.base, marginBottom: 6, fontWeight: '700' },
    sectionTitleWarning: { color: tones.orange.base },
    cell: {
      backgroundColor: neutral.onBase,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: 'rgba(0,0,0,0.2)',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    cellWarning: {
      borderColor: tones.orange.base,
    },
    inlineDateInput: {
      backgroundColor: neutral.onBase,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      color: neutral.onSurface,
      fontSize: 16,
      fontWeight: '600',
    },
    inlineDateInputWarning: {
      borderColor: tones.orange.base,
      color: tones.orange.base,
    },
    value: { fontSize: 16, color: neutral.onSurface, fontWeight: '600' },
    valueWarning: { color: tones.orange.base },
    placeholder: { color: neutral.border, fontWeight: '500' },
    chev: { fontSize: 24, color: neutral.border, marginLeft: 8 },
  });
