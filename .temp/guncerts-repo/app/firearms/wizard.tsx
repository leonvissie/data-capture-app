import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  Pressable,
  TextInput,
} from 'react-native';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import Button from '../../src/components/Button';
import ButtonSave from '../../src/components/ButtonSave';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import { useTones } from '../../src/theme/tones';
import { EditTextSheet, SelectSheet } from '../../src/components/EditSheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Document, Extraction, Firearm, IdentityDocumentSide, Profile, UserPrefs } from '../../src/data/types';
import { ensureUserPrefs, saveUserPrefs, touch, persist, withMeta } from '../../src/data/repo';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { performDocumentExtraction } from '../../src/ocr';
import { mapFirearmExtraction, type FirearmExtractionDraft } from '../../src/ocr/mappers';
import { parseFirearmText } from '../../src/ocr/parsers';
import { ensureDocumentBarcode } from '../../src/barcode/ensureDocumentBarcode';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { logger } from '@/src/utils/logger';
import { appConfig } from '../../src/config/appConfig';
import { rasterizePdf } from '../../src/pdf/rasterizer';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { base64ToUint8 } from '../../src/pdf/utils';
import { recalculateAndPersistCompetencyExpiries } from '../../src/utils/competencyExpiry';
import { parseArrayParam } from '../../src/utils/queryParams';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import policy518a from '../../src/policy/518a.json';
import {
  FALLBACK_518A_LICENCE_TYPES,
  RawLicenceType,
  normalizeLicenceTypesWithFallback,
} from '../../src/policy/licenceTypes';
import { useDevMode } from '../../src/providers/DevModeProvider';
import { categoryLabel } from '../../src/utils/categoryLabel';
import HelpModal from '../../src/components/HelpModal';
import { useHelpModal } from '../../src/help';
import { searchCalibreCatalogRecordsByAlias } from '../../src/config/motivation/calibreCatalog';
import WizardField from '../../src/components/wizard/WizardField';

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile?scroll=firearms';
const WIZARD_HELP_KEY = 'helpWizardFirearms';

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

type Side = Extract<IdentityDocumentSide, 'front' | 'back'>;
type FirearmEditOrigin = 'profile' | 'documents' | 'manual' | 'unknown';

const originFallbacks: Record<FirearmEditOrigin, string> = {
  profile: '/(tabs)/profile?scroll=firearms',
  documents: '/application/existing',
  manual: '/firearms/manual',
  unknown: defaultReturnPath,
};

type PolicyJson = { licenceTypes?: Record<string, RawLicenceType> };

async function getPdfPageCount(uri: string): Promise<number | null> {
  try {
    const data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    } as any);
    const bytes = base64ToUint8(data);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch (error) {
    logger.warn('[firearms/wizard] Failed to read PDF page count', error);
    return null;
  }
}

type SectionOption = {
  code: string;
  name: string;
  section?: string;
  value: string;
  label: string;
};

const POLICY_LICENCE_TYPES = (policy518a as PolicyJson).licenceTypes;
const TYPES: NonNullable<Firearm['firearmType']>[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const ACTIONS: NonNullable<Firearm['firearmAction']>[] = ['Semi-automatic', 'Automatic', 'Manual', 'Other'];

const SECTION_OPTIONS: SectionOption[] = normalizeLicenceTypesWithFallback(
  POLICY_LICENCE_TYPES,
  FALLBACK_518A_LICENCE_TYPES
)
  .filter((entry) => {
    const status = entry.status?.trim().toLowerCase();
    return !status || status === 'active';
  })
  .map(({ code, name, section }) => {
    const trimmedSection = section?.trim();
    const label = trimmedSection ? `${trimmedSection}: ${name}` : name;
    const value = trimmedSection ?? label;
    return { code, name, section: trimmedSection, value, label };
  });

type FirearmDraft = {
  barCodeIdNumber: string;
  barcodeInitialSurname: string;
  firearmType: Firearm['firearmType'] | '';
  make: string;
  model: string;
  firearmAction: Firearm['firearmAction'] | '';
  manufacturerNameAddress: string;
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
};

type DraftField = keyof FirearmDraft;
type TextSheetKey = Exclude<DraftField, 'firearmType' | 'firearmAction'>;

type SheetState =
  | null
  | { type: 'text'; key: TextSheetKey; title: string; mask?: 'date'; multiline?: boolean; maxLength?: number }
  | { type: 'select'; key: 'firearmType' | 'firearmAction'; title: string }
  | { type: 'section'; key: 'section'; title: string };

const FIELD_LABELS: Record<DraftField, string> = {
  barCodeIdNumber: 'Barcode ID number',
  barcodeInitialSurname: 'Barcode initials + surname',
  firearmType: 'Type',
  make: 'Make',
  model: 'Model',
  firearmAction: 'Action',
  manufacturerNameAddress: 'Manufacturer name & address',
  firearmSerialNumber: 'Serial number',
  calibre: 'Calibre',
  licenseNumber: 'Licence number',
  section: 'Section',
  validFrom: 'Valid from',
  validTo: 'Valid to',
  barrelMake: 'Barrel make',
  barrelSerialNo: 'Barrel serial number',
  receiverMake: 'Receiver make',
  receiverSerialNumber: 'Receiver serial number',
  frameMake: 'Frame make',
  frameSerialNumber: 'Frame serial number',
};

const createEmptyDraft = (): FirearmDraft => ({
  barCodeIdNumber: '',
  barcodeInitialSurname: '',
  firearmType: '',
  make: '',
  model: '',
  firearmAction: '',
  manufacturerNameAddress: '',
  firearmSerialNumber: '',
  calibre: '',
  licenseNumber: '',
  section: '',
  validFrom: '',
  validTo: '',
  barrelMake: '',
  barrelSerialNo: '',
  receiverMake: '',
  receiverSerialNumber: '',
  frameMake: '',
  frameSerialNumber: '',
});

const draftFromFirearm = (firearm: Firearm): FirearmDraft => ({
  barCodeIdNumber: firearm.barCodeIdNumber ?? '',
  barcodeInitialSurname: firearm.barcodeInitialSurname ?? '',
  firearmType: firearm.firearmType ?? '',
  make: firearm.make ?? '',
  model: firearm.model ?? '',
  firearmAction: firearm.firearmAction ?? '',
  manufacturerNameAddress: firearm.manufacturerNameAddress ?? '',
  firearmSerialNumber: firearm.firearmSerialNumber ?? '',
  calibre: firearm.calibre ?? '',
  licenseNumber: firearm.licenseNumber ?? '',
  section: firearm.section ?? '',
  validFrom: firearm.validFrom ?? '',
  validTo: firearm.validTo ?? '',
  barrelMake: firearm.barrelMake ?? '',
  barrelSerialNo: firearm.barrelSerialNo ?? '',
  receiverMake: firearm.receiverMake ?? '',
  receiverSerialNumber: firearm.receiverSerialNumber ?? '',
  frameMake: firearm.frameMake ?? '',
  frameSerialNumber: firearm.frameSerialNumber ?? '',
});

const normalize = (value?: string | null) => (value ?? '').trim();
const normalizeForCompare = (value?: string | null) => normalize(value).toLowerCase();
const normalizeBarcodeMatch = (value?: string | null) =>
  normalize(value).toUpperCase().replace(/\s+/g, '');
const isNoneValue = (value?: string | null) => normalize(value).toUpperCase() === 'NONE';

const computeIsCurrent = (validTo?: string | null) => {
  const trimmed = (validTo ?? '').trim();
  if (!trimmed) return true;
  const expiryDate = new Date(trimmed);
  if (Number.isNaN(expiryDate.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);
  return expiryDate >= today;
};

const toCanonicalSection = (value?: string | null) => {
  const normalized = normalize(value || '');
  if (!normalized) return undefined;
  const match = SECTION_OPTIONS.find(
    (option) => normalized === option.value || normalized === option.label
  );
  return match?.value ?? normalized;
};

const isSectionAllowed = (value?: string | null) => {
  const normalized = normalize(value || '');
  if (!normalized) return true;
  return SECTION_OPTIONS.some((option) => normalized === option.value || normalized === option.label);
};

const formatBarcodeSummary = (doc: Document) => {
  const barcodeRaw = (doc.barcodeData ?? '').trim();
  if (!barcodeRaw) return 'Back barcode detected';
  const parsed = parseFirearmText(barcodeRaw);
  const fields = parsed.fields ?? {};
  const make = normalize(fields.make);
  const model = normalize(fields.model);
  const serial = normalize(fields.firearmSerialNumber);
  const makeModel = [make, model].filter(Boolean).join(' ').trim();
  if (makeModel && serial) return `${makeModel} (${serial})`;
  if (makeModel) return makeModel;
  if (serial) return `Serial ${serial}`;
  return 'Back barcode detected';
};

export default function FirearmWizardScreen() {
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
  const { devModeEnabled } = useDevMode();
  const validationEnabled = appConfig.features.enableValidation && !devModeEnabled;
  const duplicateChecksEnabled = appConfig.features.duplicateChecks;
  const scrollRef = useRef<ScrollView | null>(null);
  const statusTop = useRef(0);
  const headerHeight = useRef(0);
  const missingFieldFlowRef = useRef<{ autoSave: boolean; pendingAutoSave: boolean } | null>(null);
  const makeInputRef = useRef<TextInput | null>(null);
  const modelInputRef = useRef<TextInput | null>(null);
  const serialInputRef = useRef<TextInput | null>(null);
  const licenceNumberInputRef = useRef<TextInput | null>(null);
  const validFromInputRef = useRef<TextInput | null>(null);
  const validToInputRef = useRef<TextInput | null>(null);
  const params = useLocalSearchParams() as {
    returnTo?: string | string[];
    selectionReturnTo?: string | string[];
    intro?: string | string[] | null;
    nav?: string | string[] | null;
    firearmId?: string | string[];
    origin?: string | string[];
    hideContinue?: string | string[];
    previewMode?: string | string[];
    selectedFirearmIds?: string | string[];
    selectionParam?: string | string[];
  };
  const origin = useMemo<FirearmEditOrigin>(() => {
    const raw = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    if (!raw) return 'unknown';
    const norm = `${raw}`.trim().toLowerCase();
    if (norm === 'profile') return 'profile';
    if (norm === 'documents') return 'documents';
    if (norm === 'manual') return 'manual';
    return 'unknown';
  }, [params.origin]);
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
        onComplete: params.selectionReturnTo,
      }),
    [navPayload, params.returnTo, params.selectionReturnTo],
  );
  const returnToPath = navCtx.routeBack || navCtx.returnTo || originFallbacks[origin] || defaultReturnPath;
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);
  const previewMode = useMemo(() => {
    const raw = Array.isArray(params.previewMode) ? params.previewMode[0] : params.previewMode;
    return raw ? `${raw}` : null;
  }, [params.previewMode]);
  const selectionParam = useMemo(() => {
    const raw = Array.isArray(params.selectionParam) ? params.selectionParam[0] : params.selectionParam;
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value || 'selectedFirearmIds';
  }, [params.selectionParam]);
  const seededSelection = useMemo(
    () => parseArrayParam(params.selectedFirearmIds),
    [params.selectedFirearmIds],
  );
  const buildWizardParams = useCallback(
    (ids?: string[]) => {
      const next: Record<string, any> = {};
      const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
      if (returnTo) next.returnTo = returnTo;
      const selectionReturnTo = Array.isArray(params.selectionReturnTo)
        ? params.selectionReturnTo[0]
        : params.selectionReturnTo;
      if (selectionReturnTo) next.selectionReturnTo = selectionReturnTo;
      const intro = Array.isArray(params.intro) ? params.intro[0] : params.intro;
      if (intro) next.intro = intro;
      const nav = Array.isArray(params.nav) ? params.nav[0] : params.nav;
      if (nav) next.nav = nav;
      const origin = Array.isArray(params.origin) ? params.origin[0] : params.origin;
      if (origin) next.origin = origin;
      const hideContinue = Array.isArray(params.hideContinue) ? params.hideContinue[0] : params.hideContinue;
      if (hideContinue) next.hideContinue = hideContinue;
      if (previewMode) next.previewMode = previewMode;
      if (selectionParam) next.selectionParam = selectionParam;
      const finalIds = ids ?? seededSelection;
      if (finalIds.length) next.selectedFirearmIds = JSON.stringify(finalIds);
      return next;
    },
    [
      params.hideContinue,
      params.intro,
      params.nav,
      params.origin,
      previewMode,
      params.returnTo,
      params.selectionReturnTo,
      seededSelection,
      selectionParam,
    ],
  );
  const ensureSelectionWith = useCallback(
    (nextId?: string | null) => {
      const base = new Set(seededSelection);
      if (nextId) base.add(String(nextId));
      return Array.from(base);
    },
    [seededSelection],
  );

  const scrollToStatus = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: Math.max(statusTop.current - headerHeight.current - 12, 0),
      animated: true,
    });
  }, []);
  const seededFirearmId = useMemo(() => {
    const raw = params.firearmId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const trimmed = `${value}`.trim();
    return trimmed || null;
  }, [params.firearmId]);
  const seededFirearm = useMemo<Firearm | null>(() => {
    if (!seededFirearmId) return null;
    const found = getById<Firearm>(seededFirearmId);
    return found ?? null;
  }, [seededFirearmId]);
  const seededTitle = useMemo(() => {
    if (!seededFirearm) return null;
    const label = [seededFirearm.make, seededFirearm.model].filter(Boolean).join(' ').trim();
    if (label) return label;
    const serial = (seededFirearm.firearmSerialNumber ?? '').trim();
    if (serial) return serial;
    return 'Existing firearm';
  }, [seededFirearm]);
  const seededSerial = useMemo(() => {
    if (!seededFirearm) return null;
    const serial = (seededFirearm.firearmSerialNumber ?? '').trim();
    return serial || null;
  }, [seededFirearm]);
  const pageTitle = seededTitle
    ? `${seededTitle}${seededSerial ? ` (${seededSerial})` : ''}`
    : 'Add a firearm';
  const isEditMode = !!seededFirearmId;
  const existing = seededFirearm;

  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string>('Processing...');
  const [step, setStep] = useState<'info' | 'capture'>(isEditMode ? 'capture' : 'info');
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [prefsProfileId, setPrefsProfileId] = useState<string | null>(null);
  const [showWizardHints, setShowWizardHints] = useState(true);
  const [firearmId, setFirearmId] = useState<string | null>(() => seededFirearmId ?? null);
  const [frontDoc, setFrontDoc] = useState<Document | null>(null);
  const [backDoc, setBackDoc] = useState<Document | null>(null);
  const [pendingRotationBySide, setPendingRotationBySide] = useState<Record<Side, number>>({
    front: 0,
    back: 0,
  });
  const [bothSidesSinglePage, setBothSidesSinglePage] = useState(false);
  const [docRecord, setDocRecord] = useState<Document | null>(null);
  const [ocrExtraction, setOcrExtraction] = useState<Extraction | null>(null);
  const [extractionApplied, setExtractionApplied] = useState(false);
  const [extractionAttempted, setExtractionAttempted] = useState(false);
  const [workflowStarted, setWorkflowStarted] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [barcodeProcessing, setBarcodeProcessing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [initialDraft, setInitialDraft] = useState<FirearmDraft>(
    existing ? draftFromFirearm(existing) : createEmptyDraft(),
  );
  const [draft, setDraft] = useState<FirearmDraft>(
    existing ? draftFromFirearm(existing) : createEmptyDraft(),
  );

  const missingRequiredFields = useMemo(() => {
    const missing: Array<
      | 'firearmType'
      | 'make'
      | 'model'
      | 'firearmSerialNumber'
      | 'calibre'
      | 'licenseNumber'
      | 'section'
      | 'validFrom'
      | 'validTo'
    > = [];
    if (!validationEnabled) return missing;
    if (!draft.firearmType) missing.push('firearmType');
    if (!normalize(draft.make)) missing.push('make');
    if (!normalize(draft.model)) missing.push('model');
    if (!normalize(draft.firearmSerialNumber)) missing.push('firearmSerialNumber');
    if (!normalize(draft.calibre)) missing.push('calibre');
    if (!manualMode) {
      if (!normalize(draft.licenseNumber)) missing.push('licenseNumber');
      if (!normalize(draft.section)) missing.push('section');
      if (!normalize(draft.validFrom)) missing.push('validFrom');
      if (!normalize(draft.validTo)) missing.push('validTo');
    }
    return missing;
  }, [
    draft.calibre,
    draft.firearmSerialNumber,
    draft.firearmType,
    draft.licenseNumber,
    draft.make,
    draft.model,
    draft.section,
    draft.validFrom,
    draft.validTo,
    manualMode,
    validationEnabled,
  ]);
  const missingRequiredSet = useMemo(
    () => new Set(missingRequiredFields),
    [missingRequiredFields],
  );
  const [sheet, setSheet] = useState<SheetState>(null);
  const [editingInitial, setEditingInitial] = useState<string>('');
  const extractedCalibre = useMemo(() => {
    if (!ocrExtraction || ocrExtraction.extractionType !== 'FirearmLicence') return '';
    return mapFirearmExtraction(ocrExtraction).calibre?.trim() ?? '';
  }, [ocrExtraction]);
  const hasExtractedCalibre = extractedCalibre.length > 0;
  const resolveCalibreFilterPills = useCallback((query: string) => {
    return searchCalibreCatalogRecordsByAlias(query, 18).map((entry) => ({
      key: entry.key,
      label: entry.label,
      value: entry.label,
    }));
  }, []);
  const navigatedRef = useRef(false);
  const [initialDocsLoaded, setInitialDocsLoaded] = useState(false);
  const [initialFrontDoc, setInitialFrontDoc] = useState<Document | null>(null);
  const [initialBackDoc, setInitialBackDoc] = useState<Document | null>(null);
  const backDeletedRef = useRef(false);
  const allowActionPromptRef = useRef(false);
  const workflowSignatureRef = useRef<string | null>(null);
  const workflowInFlightRef = useRef(false);
  const suppressWorkflowSignatureRef = useRef<string | null>(null);
  const manualModeBootstrapRef = useRef(false);
  const [showMissingRequired, setShowMissingRequired] = useState(false);
  const barcodeMismatchRef = useRef<string | null>(null);

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
    const show = prefs.showFirearmWizardHint !== false;
    setShowWizardHints(show);
    setStep(isEditMode ? 'capture' : (show ? 'info' : 'capture'));
  }, [isEditMode]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (existing) {
      const base = draftFromFirearm(existing);
      setInitialDraft(base);
      setDraft(base);
      return;
    }
    const empty = createEmptyDraft();
    setInitialDraft(empty);
    setDraft(empty);
  }, [existing]);

  const latestDocsRef = useRef<{ front?: string; back?: string }>({});
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    latestDocsRef.current.front = frontDoc?.id;
  }, [frontDoc]);
  useEffect(() => {
    latestDocsRef.current.back = backDoc?.id;
  }, [backDoc]);

  const normalizeRotation = useCallback((value: number) => {
    return ((value % 360) + 360) % 360;
  }, []);

  const queueSideRotation = useCallback((side: Side) => {
    setPendingRotationBySide((prev) => ({ ...prev, [side]: prev[side] - 90 }));
  }, []);

  const hasPendingRotation = useMemo(
    () =>
      normalizeRotation(pendingRotationBySide.front) !== 0 ||
      normalizeRotation(pendingRotationBySide.back) !== 0,
    [normalizeRotation, pendingRotationBySide.back, pendingRotationBySide.front],
  );

  const previousDocIdsRef = useRef<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  useEffect(() => {
    const nextId = frontDoc?.id ?? null;
    if (previousDocIdsRef.current.front !== nextId) {
      previousDocIdsRef.current.front = nextId;
      setPendingRotationBySide((prev) => ({ ...prev, front: 0 }));
    }
  }, [frontDoc?.id]);
  useEffect(() => {
    const nextId = backDoc?.id ?? null;
    if (previousDocIdsRef.current.back !== nextId) {
      previousDocIdsRef.current.back = nextId;
      setPendingRotationBySide((prev) => ({ ...prev, back: 0 }));
    }
  }, [backDoc?.id]);

  const deleteDocumentArtifacts = useCallback(async (doc?: Document | null) => {
    if (!doc) return;
    const seen = new Set<string>();
    for (const uri of [doc.uri, doc.filePath, doc.thumbPath]) {
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      try {
        await deleteOwnedDocFile(uri);
      } catch {
        // ignore failures
      }
    }
    if (doc.ocrExtractionId) {
      const remaining = listByType<Document>('Document');
      const stillUsed = remaining.some(
        other => other.id !== doc.id && other.ocrExtractionId === doc.ocrExtractionId
      );
      if (!stillUsed) {
        deleteEntity(doc.ocrExtractionId);
      }
    }
    deleteEntity(doc.id);
    createdDocIdsRef.current.delete(doc.id);
  }, []);

  const deleteDocumentById = useCallback(
    async (docId?: string | null) => {
      if (!docId) return;
      const doc = getById<Document>(docId);
      if (doc) {
        await deleteDocumentArtifacts(doc);
      }
    },
    [deleteDocumentArtifacts],
  );

  useEffect(() => {
    return () => {
      if (navigatedRef.current) return;
      const { front, back } = latestDocsRef.current;
      const created = createdDocIdsRef.current;
      if (front && created.has(front)) {
        void deleteDocumentById(front);
        created.delete(front);
      }
      if (back && created.has(back)) {
        void deleteDocumentById(back);
        created.delete(back);
      }
    };
  }, [deleteDocumentById]);

  const cleanupDocuments = useCallback((opts?: { keepFirearmId?: boolean }) => {
    setFrontDoc(prev => {
      if (prev && createdDocIdsRef.current.has(prev.id)) {
        void deleteDocumentArtifacts(prev);
        createdDocIdsRef.current.delete(prev.id);
      }
      return null;
    });
    setBackDoc(prev => {
      if (prev && createdDocIdsRef.current.has(prev.id)) {
        void deleteDocumentArtifacts(prev);
        createdDocIdsRef.current.delete(prev.id);
      }
      return null;
    });
    if (!opts?.keepFirearmId) {
      createdDocIdsRef.current.clear();
      setFirearmId(null);
    }
    setInitialDocsLoaded(false);
  }, [deleteDocumentArtifacts]);

  const ensureFirearmId = useCallback(() => {
    if (firearmId) return firearmId;
    const nextId = createRandomId('gun');
    setFirearmId(nextId);
    return nextId;
  }, [firearmId]);

  type WizardAsset = ImagePicker.ImagePickerAsset | {
    uri: string;
    mimeType?: string | null;
    name?: string | null;
    fileName?: string | null;
    size?: number | null;
    fileSize?: number | null;
  };

  const saveLicenceDocument = useCallback(
    async (id: string, side: Side, asset: WizardAsset, existing?: Document | null) => {
      const label = side === 'front' ? 'Firearm licence (front)' : 'Firearm licence (back)';
      const profileId =
        prefsProfileId ??
        existing?.holderProfileId ??
        listByType<Profile>('Profile')[0]?.id ??
        '';
      const allowUpdateExisting =
        !isEditMode || (existing?.id && createdDocIdsRef.current.has(existing.id));
      const existingForUpsert = allowUpdateExisting ? existing : undefined;
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'Firearm',
          parentId: id,
          holderProfileId: profileId,
          label,
          kind: 'FIREARM_LICENCE',
          side,
          createDocumentId: () => createRandomId('doc'),
        },
        existing: existingForUpsert,
      });
      const updated = touch({
        ...document,
        name: label,
        requirementCode: 'FIREARM_LICENCE',
        requirementRelatedId: id,
        requirementRelatedLabel: label,
      } as Document);
      if (createdNew) {
        createdDocIdsRef.current.add(updated.id);
      }
      return updated;
    },
    [bothSidesSinglePage, isEditMode, prefsProfileId],
  );

  const capturePhoto = useCallback(
    async (side: Side, id: string, existing?: Document | null): Promise<Document | null> => {
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
      setProcessingLabel(`Uploading ${side} of licence`);
      setProcessing(true);
      await nextFrame();
      const result = await ImagePicker.launchCameraAsync(cameraOptions as any);
      if (result.canceled || !result.assets?.length) {
        setProcessingLabel('Processing...');
        setProcessing(false);
        return null;
      }
      const asset = await prepareWizardImage(result.assets[0]);
      const doc = await saveLicenceDocument(id, side, asset, existing);
      return doc;
    },
    [saveLicenceDocument, setProcessing],
  );

  const handleInfoContinue = useCallback(() => {
    setStep('capture');
  }, []);

  useEffect(() => {
    if (step === 'capture') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [step]);

  const persistShowHint = useCallback(
    (value: boolean) => {
      if (!prefsProfileId) return;
      setUserPrefs(prev => {
        const base = prev ?? ensureUserPrefs(prefsProfileId);
        const updated = { ...base, showFirearmWizardHint: value };
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

  const signatureForState = useCallback(
    (front: Document | null, back: Document | null) => {
      const docSig = (doc: Document | null) => {
        if (!doc?.id) return '';
        const updated = doc.updatedAt ?? doc.createdAt ?? '';
        const sha = doc.sha256 ?? '';
        return `${doc.id}:${updated}:${sha}`;
      };
      return `${docSig(front)}|${docSig(back)}`;
    },
    [],
  );

  const currentSignature = useMemo(
    () => signatureForState(frontDoc, backDoc),
    [backDoc, frontDoc, signatureForState],
  );
  const initialSignature = useMemo(
    () => signatureForState(initialFrontDoc, initialBackDoc),
    [initialBackDoc, initialFrontDoc, signatureForState],
  );
  const captureReady = !!frontDoc && (!!backDoc || bothSidesSinglePage);
  const normalizeBarcodeType = useCallback((value?: string | null) => {
    return (value ?? '').trim().toLowerCase();
  }, []);
  const isPdf417Barcode = useCallback(
    (doc?: Document | null) => {
      if (!doc?.barcodeData?.trim()) return false;
      const normalized = normalizeBarcodeType(doc.barcodeType);
      return !normalized || normalized.includes('pdf417');
    },
    [normalizeBarcodeType],
  );
  const hasBarcode = isPdf417Barcode(docRecord);
  const hasImageChanges = useMemo(
    () => currentSignature !== initialSignature,
    [currentSignature, initialSignature],
  );
  const changedFields = useMemo(() => {
    const keys = Object.keys(FIELD_LABELS) as DraftField[];
    const diffs: DraftField[] = [];
    for (const key of keys) {
      const isSelectField = key === 'firearmType' || key === 'firearmAction';
      const current = isSelectField ? (draft[key] || '') : normalize(draft[key]);
      const initial = isSelectField ? (initialDraft[key] || '') : normalize(initialDraft[key]);
      if (current !== initial) diffs.push(key);
    }
    return diffs;
  }, [draft, initialDraft]);
  const hasUnsavedChanges = changedFields.length > 0 || hasImageChanges || hasPendingRotation;
  const shouldShowStatus = useMemo(
    () => manualMode || processing || (captureReady && (!isEditMode || hasUnsavedChanges)),
    [captureReady, hasUnsavedChanges, isEditMode, manualMode, processing],
  );

  const resetFormForRescan = useCallback(() => {
    const empty = createEmptyDraft();
    setInitialDraft(empty);
    setDraft(empty);
    setExtractionApplied(false);
    setOcrExtraction(null);
    setExtractionAttempted(false);
    setDocRecord(null);
    setWorkflowStarted(false);
  }, []);

  const resetDraftForBarcodeWorkflow = useCallback(() => {
    setDraft(createEmptyDraft());
    setShowMissingRequired(false);
  }, []);

  const swapDocumentFileData = useCallback(async (front: Document, back: Document) => {
    const frontFile = {
      filePath: front.filePath,
      uri: front.uri ?? front.filePath,
      thumbPath: front.thumbPath,
      size: front.size,
      mime: front.mime,
      pages: front.pages,
      sha256: front.sha256,
      barcodeData: front.barcodeData,
      barcodeType: front.barcodeType,
    };
    const backFile = {
      filePath: back.filePath,
      uri: back.uri ?? back.filePath,
      thumbPath: back.thumbPath,
      size: back.size,
      mime: back.mime,
      pages: back.pages,
      sha256: back.sha256,
      barcodeData: back.barcodeData,
      barcodeType: back.barcodeType,
    };
    const updatedFront = touch({
      ...front,
      ...backFile,
      ocrExtractionId: undefined,
    } as Document);
    const updatedBack = touch({
      ...back,
      ...frontFile,
      ocrExtractionId: undefined,
    } as Document);
    persist(updatedFront);
    persist(updatedBack);
    return { front: updatedFront, back: updatedBack };
  }, []);

  const runBarcodeWorkflow = useCallback(
    async (frontOverride?: Document | null, backOverride?: Document | null) => {
      const front = frontOverride ?? frontDoc;
      const back = backOverride ?? backDoc;
      if (!front || (!back && !bothSidesSinglePage)) return;
      const resolvedBack = back ?? front;
      workflowSignatureRef.current = signatureForState(front, resolvedBack);
      setWorkflowStarted(true);

      setProcessingLabel('Processing...');
      setProcessing(true);
      await nextFrame();
      resetDraftForBarcodeWorkflow();
      setExtractionApplied(false);
      setOcrExtraction(null);
      setExtractionAttempted(false);
      setDocRecord(null);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFormVisible(true);
      allowActionPromptRef.current = true;

      try {
        let ensuredFront = front;
        let ensuredBack = resolvedBack;
        if (!front.barcodeData?.trim()) {
          ensuredFront = await ensureDocumentBarcode(front);
        }
        if (resolvedBack.id === front.id) {
          ensuredBack = ensuredFront;
        } else if (!resolvedBack.barcodeData?.trim()) {
          ensuredBack = await ensureDocumentBarcode(resolvedBack);
        }

        if (ensuredFront !== front) setFrontDoc(ensuredFront);
        if (ensuredBack !== resolvedBack) setBackDoc(ensuredBack);

        let finalFront = ensuredFront;
        let finalBack = ensuredBack;
        let frontHasBarcode = isPdf417Barcode(ensuredFront);
        let backHasBarcode = isPdf417Barcode(ensuredBack);

        if (frontHasBarcode && !backHasBarcode && ensuredBack.id !== ensuredFront.id) {
          const swapped = await swapDocumentFileData(ensuredFront, ensuredBack);
          finalFront = swapped.front;
          finalBack = swapped.back;
          setFrontDoc(finalFront);
          setBackDoc(finalBack);
          frontHasBarcode = !!finalFront.barcodeData?.trim();
          backHasBarcode = !!finalBack.barcodeData?.trim();
        }

        if (frontHasBarcode && backHasBarcode) {
          const backSummary = formatBarcodeSummary(finalBack);
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Barcodes found on both images',
              `The barcode from the image of the back of the licence will be used:\n\n${backSummary}\n\nReview the uploaded images to ensure you have uploaded the front and back of the firearm licence.`,
              [
                {
                  text: 'Continue',
                  style: 'default',
                  onPress: () => resolve(),
                },
              ],
            );
          });
        }

        workflowSignatureRef.current = signatureForState(finalFront, finalBack);

        const barcodeDoc = backHasBarcode ? finalBack : frontHasBarcode ? finalFront : null;
        setDocRecord(barcodeDoc ?? finalBack ?? finalFront);

        if (barcodeDoc && isPdf417Barcode(barcodeDoc)) {
          setBarcodeProcessing(true);
          try {
            const extraction = await performDocumentExtraction(barcodeDoc, {
              extractionType: 'FirearmLicence',
              force: true,
            });
            setOcrExtraction(extraction);
          } catch (error) {
            logger.warn('[firearms/wizard] Extraction failed', error);
            setBarcodeProcessing(false);
          } finally {
            setExtractionAttempted(true);
          }
        } else {
          setExtractionAttempted(true);
          setBarcodeProcessing(false);
        }
      } catch (error: any) {
        logger.warn('[firearms/wizard] Failed to prepare form data', error);
        setBarcodeProcessing(false);
      } finally {
        setProcessing(false);
      }
    },
    [
      backDoc,
      bothSidesSinglePage,
      ensureDocumentBarcode,
      frontDoc,
      performDocumentExtraction,
      resetDraftForBarcodeWorkflow,
      swapDocumentFileData,
      scrollToStatus,
      signatureForState,
    ],
  );

  useEffect(() => {
    if (manualMode) return;
    if (
      suppressWorkflowSignatureRef.current &&
      suppressWorkflowSignatureRef.current === currentSignature
    ) {
      suppressWorkflowSignatureRef.current = null;
      return;
    }
    if (!captureReady) {
      workflowSignatureRef.current = null;
      setWorkflowStarted(false);
      return;
    }
    if (processing) return;
    if (isEditMode && !initialDocsLoaded) return;
    // In edit mode, only re-run extraction when the uploaded licence images changed.
    // Field edits alone should not trigger barcode/OCR re-application.
    if (isEditMode && !hasImageChanges) return;
    if (workflowSignatureRef.current === currentSignature) return;
    if (workflowInFlightRef.current) return;
    workflowInFlightRef.current = true;
    void (async () => {
      try {
        await runBarcodeWorkflow();
      } finally {
        workflowInFlightRef.current = false;
      }
    })();
  }, [
    captureReady,
    currentSignature,
    hasImageChanges,
    initialDocsLoaded,
    isEditMode,
    processing,
    runBarcodeWorkflow,
    suppressWorkflowSignatureRef,
    manualMode,
  ]);

  const pickFromLibrary = useCallback(
    async (side: Side) => {
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
      setProcessingLabel(`Uploading ${side} of licence`);
      setProcessing(true);
      await nextFrame();
      const id = ensureFirearmId();
      const existing = side === 'front' ? frontDoc : backDoc;
      try {
        const result = await ImagePicker.launchImageLibraryAsync(libraryOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return null;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        const stored = await saveLicenceDocument(id, side, asset, existing);
        const finalDoc = stored;
        if (side === 'front') {
          setFrontDoc(finalDoc);
          if (bothSidesSinglePage) {
            setBackDoc(finalDoc);
            backDeletedRef.current = false;
          }
        } else {
          setBackDoc(finalDoc);
          backDeletedRef.current = false;
        }
        return finalDoc;
      } catch (error: any) {
        logger.warn('[firearms/wizard] Failed to pick licence photo', error);
        Alert.alert(
          'Unable to use photo',
          error?.message ?? 'Something went wrong while importing the photo. Please try again.'
        );
        return null;
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [
      backDoc,
      bothSidesSinglePage,
      disablePhotoLibraryAlert,
      ensureFirearmId,
      prepareWizardImage,
      frontDoc,
      processing,
      saveLicenceDocument,
      userPrefs?.showPhotoLibraryAlert,
    ],
  );

  const promptPdfSideOrder = useCallback((): Promise<boolean | null> => {
    return new Promise((resolve) => {
      Alert.alert(
        'Select front side',
        'This PDF has two pages. Which page shows the front side?',
        [
          { text: 'Page 1 is front', onPress: () => resolve(false) },
          { text: 'Page 2 is front', onPress: () => resolve(true) },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ],
      );
    });
  }, []);

  const handleUpload = useCallback(
    async (side: Side) => {
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
      const id = ensureFirearmId();
      const existing = side === 'front' ? frontDoc : backDoc;
      try {
        setProcessingLabel(`Uploading ${side} of licence`);
        setProcessing(true);
        await nextFrame();
        if (isPdf) {
          const pageCount = await getPdfPageCount(asset.uri);
          if (pageCount && pageCount > 2) {
            Alert.alert(
              'PDF too long',
              'Firearm licence uploads support a maximum of 2 pages. Please upload a 2-page PDF or use the camera/photo library.'
            );
            return null;
          }
          const rasterized = await rasterizePdf(asset.uri, 150);
          try {
            const pages = rasterized.pages;
            const hasTwoPages = (pageCount ?? pages.length) >= 2;
            if (hasTwoPages && pages.length < 2) {
              Alert.alert(
                'Only first page used',
                'This PDF has multiple pages but only the first page could be processed. Please use the camera or photo library to capture both sides.'
              );
              return null;
            }
            if (hasTwoPages) {
              const swap = await promptPdfSideOrder();
              if (swap === null) return null;
              const frontPage = swap ? pages[1] : pages[0];
              const backPage = swap ? pages[0] : pages[1];
              const frontDocNext = await saveLicenceDocument(id, 'front', makePdfAsset(frontPage, 'front'), frontDoc ?? undefined);
              const backDocNext = await saveLicenceDocument(id, 'back', makePdfAsset(backPage, 'back'), backDoc ?? undefined);
              setFrontDoc(frontDocNext);
              setBackDoc(backDocNext);
              backDeletedRef.current = false;
              return frontDocNext;
            }
            const firstPage = pages[0];
            if (!firstPage) return null;
            if ((pageCount ?? 0) > 1) {
              Alert.alert(
                'Only first page used',
                'This PDF has multiple pages. Only the first page will be used. If the back of the licence is on another page, use the camera or photo library.'
              );
            }
            const stored = await saveLicenceDocument(id, side, makePdfAsset(firstPage, side), existing ?? undefined);
            const finalDoc = stored;
            if (side === 'front') {
              setFrontDoc(finalDoc);
              if (bothSidesSinglePage) {
                setBackDoc(finalDoc);
                backDeletedRef.current = false;
              }
            } else {
              setBackDoc(finalDoc);
              backDeletedRef.current = false;
            }
            return finalDoc;
          } finally {
            await rasterized.cleanup().catch(() => {});
          }
        }
        const prepared = await prepareWizardImage(asset as any);
        const stored = await saveLicenceDocument(id, side, prepared as any, existing);
        const finalDoc = stored;
        if (side === 'front') {
          setFrontDoc(finalDoc);
          if (bothSidesSinglePage) {
            setBackDoc(finalDoc);
            backDeletedRef.current = false;
          }
        } else {
          setBackDoc(finalDoc);
          backDeletedRef.current = false;
        }
        return finalDoc;
      } catch (error: any) {
        logger.warn('[firearms/wizard] Failed to upload licence file', error);
        Alert.alert(
          'Unable to use file',
          error?.message ?? 'Something went wrong while importing the file. Please try again.'
        );
        return null;
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [
      backDoc,
      bothSidesSinglePage,
      ensureFirearmId,
      prepareWizardImage,
      promptPdfSideOrder,
      frontDoc,
      processing,
      saveLicenceDocument,
    ],
  );

  const makePdfAsset = (page: { uri: string }, label: string) => {
    const fileName = `firearm-licence-${label}.jpg`;
    return {
      uri: page.uri,
      mimeType: 'image/jpeg',
      fileName,
      name: fileName,
    } as any;
  };

  const captureLicenceSide = useCallback(
    async (side: Side): Promise<Document | null> => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return null;
      }
      const id = ensureFirearmId();
      const existing = side === 'front' ? frontDoc : backDoc;
      try {
        const captured = await capturePhoto(side, id, existing);
        if (!captured) return null;
        setProcessing(true);
        const finalDoc = captured;
        if (side === 'front') {
          setFrontDoc(finalDoc);
          if (bothSidesSinglePage) {
            setBackDoc(finalDoc);
            backDeletedRef.current = false;
          }
        } else {
          setBackDoc(finalDoc);
          backDeletedRef.current = false;
        }
        return finalDoc;
      } catch (error: any) {
        logger.warn('[firearms/wizard] Failed to capture licence side', error);
        Alert.alert(
          'Capture failed',
          error?.message ?? 'Something went wrong while capturing the photo. Please try again.'
        );
        return null;
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [
      backDoc,
      bothSidesSinglePage,
      capturePhoto,
      ensureFirearmId,
      frontDoc,
      processing,
    ],
  );

  const handleCaptureFront = useCallback(() => {
    captureLicenceSide('front');
  }, [captureLicenceSide]);

  const handleLibraryFront = useCallback(() => {
    pickFromLibrary('front');
  }, [pickFromLibrary]);

  const handleCaptureBack = useCallback(() => {
    captureLicenceSide('back');
  }, [captureLicenceSide]);

  const handleLibraryBack = useCallback(() => {
    pickFromLibrary('back');
  }, [pickFromLibrary]);

  const handleDeleteSide = useCallback(
    async (side: Side) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const doc = side === 'front' ? frontDoc : backDoc;
      if (!doc) return;
      if (isEditMode && !createdDocIdsRef.current.has(doc.id)) {
        if (side === 'front') {
          setFrontDoc(null);
        } else {
          setBackDoc(null);
          resetFormForRescan();
          backDeletedRef.current = true;
        }
        return;
      }
      setProcessingLabel('Removing photo...');
      setProcessing(true);
      try {
        await deleteDocumentArtifacts(doc);
        if (side === 'front') {
          setFrontDoc(null);
        } else {
          setBackDoc(null);
          resetFormForRescan();
          backDeletedRef.current = true;
        }
      } catch (error: any) {
        logger.warn('[firearms/wizard] Failed to delete licence photo', error);
        Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [backDoc, deleteDocumentArtifacts, frontDoc, isEditMode, processing, resetFormForRescan],
  );

  const profileFirearmsPath = defaultReturnPath;
  const goReturn = useCallback(
    (ids?: string[]) => {
      const ensured = returnToPath || profileFirearmsPath;
      const [base, query = ''] = ensured.split('?');
      const search = new URLSearchParams(query);
      const finalIds = ids ?? seededSelection;
      if (finalIds.length) {
        search.set(selectionParam, JSON.stringify(finalIds));
      } else {
        search.delete(selectionParam);
      }
      if (introFlag) {
        search.set('intro', introFlag);
      }
      const target = search.toString() ? `${base}?${search.toString()}` : base;
      backOrReplaceWithContext(router as any, { ...navCtx, routeBack: target, returnTo: target }, profileFirearmsPath as any);
    },
    [introFlag, navCtx, profileFirearmsPath, returnToPath, router, seededSelection, selectionParam],
  );

  const hasFormData = useMemo(() => {
    if (draft.firearmType) return true;
    if (draft.firearmAction) return true;
    const values = [
      draft.make,
      draft.model,
      draft.manufacturerNameAddress,
      draft.firearmSerialNumber,
      draft.calibre,
      draft.licenseNumber,
      draft.section,
      draft.validFrom,
      draft.validTo,
      draft.barrelMake,
      draft.barrelSerialNo,
      draft.receiverMake,
      draft.receiverSerialNumber,
      draft.frameMake,
      draft.frameSerialNumber,
    ];
    return values.some(value => normalize(value).length > 0);
  }, [draft]);

  const applyPendingImageRotations = useCallback(async () => {
    const sideEntries: Array<{ side: Side; doc: Document | null }> = [
      { side: 'front', doc: frontDoc },
      { side: 'back', doc: backDoc },
    ];
    const perDoc = new Map<string, { doc: Document; degrees: number; sides: Set<Side> }>();

    sideEntries.forEach(({ side, doc }) => {
      if (!doc) return;
      const pending = normalizeRotation(pendingRotationBySide[side]);
      if (!pending) return;
      const current = perDoc.get(doc.id);
      perDoc.set(doc.id, {
        doc,
        degrees: normalizeRotation((current?.degrees ?? 0) + pending),
        sides: current?.sides ? new Set([...current.sides, side]) : new Set<Side>([side]),
      });
    });

    if (!perDoc.size) {
      return { nextFront: frontDoc, nextBack: backDoc };
    }

    const updatedById = new Map<string, Document>();
    for (const { doc, degrees, sides } of perDoc.values()) {
      if (!degrees) continue;
      const sourceUri = resolveDocumentUri(doc.uri ?? doc.filePath);
      if (!sourceUri) continue;
      const manipulated = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ rotate: degrees }],
        {},
      );
      if (manipulated.uri !== sourceUri) {
        try {
          await FileSystem.deleteAsync(sourceUri, { idempotent: true });
        } catch {
          // ignore
        }
        await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
      }
      const info = await FileSystem.getInfoAsync(sourceUri).catch(() => null as any);
      const nextSide: IdentityDocumentSide =
        sides.size > 1 ? 'both' : (Array.from(sides)[0] ?? doc.identityDocumentSide ?? 'not_applicable');
      const rotated = touch({
        ...doc,
        size: typeof info?.size === 'number' ? info.size : doc.size,
        identityDocumentSide: nextSide,
      } as Document);
      persist(rotated);
      updatedById.set(doc.id, rotated);
    }

    const nextFront = frontDoc && updatedById.has(frontDoc.id) ? updatedById.get(frontDoc.id)! : frontDoc;
    const nextBack = backDoc && updatedById.has(backDoc.id) ? updatedById.get(backDoc.id)! : backDoc;
    const nextSignature = signatureForState(nextFront, nextBack);
    suppressWorkflowSignatureRef.current = nextSignature;
    workflowSignatureRef.current = nextSignature;
    if (nextFront !== frontDoc || nextBack !== backDoc) {
      if (nextFront !== frontDoc) setFrontDoc(nextFront);
      if (nextBack !== backDoc) setBackDoc(nextBack);
    }
    setWorkflowStarted(false);
    setPendingRotationBySide({ front: 0, back: 0 });
    return { nextFront, nextBack };
  }, [backDoc, frontDoc, normalizeRotation, pendingRotationBySide, signatureForState]);


  const handleMarkBothSides = useCallback(async () => {
    if (bothSidesSinglePage) {
      setBothSidesSinglePage(false);
      return;
    }
    if (!frontDoc) {
      Alert.alert('Upload front image first', 'Add the front image before marking both sides on one page.');
      return;
    }
    if (backDoc && backDoc.id !== frontDoc.id) {
      await deleteDocumentArtifacts(backDoc);
      createdDocIdsRef.current.delete(backDoc.id);
    }
    setBothSidesSinglePage(true);
    setFrontDoc(frontDoc);
    setBackDoc(frontDoc);
    backDeletedRef.current = false;
    workflowSignatureRef.current = null;
  }, [
    backDoc,
    bothSidesSinglePage,
    deleteDocumentArtifacts,
    frontDoc,
  ]);

  const handleSwapUploads = useCallback(async () => {
    if (!frontDoc || !backDoc) {
      Alert.alert('Upload both sides', 'Add both sides before swapping uploads.');
      return;
    }
    if (processing) return;
    setProcessingLabel('Processing...');
    setProcessing(true);
    try {
      const swapped = await swapDocumentFileData(frontDoc, backDoc);
      setFrontDoc(swapped.front);
      setBackDoc(swapped.back);
      backDeletedRef.current = false;
      workflowSignatureRef.current = null;
    } finally {
      setProcessing(false);
    }
  }, [backDoc, frontDoc, processing, swapDocumentFileData]);

  const keepFormVisibleOnMissingFront = !frontDoc && !!backDoc && hasFormData;

  useEffect(() => {
    if (!isEditMode) return;
    if (!initialDocsLoaded) return;
    if (formVisible) return;
    if (hasFormData || frontDoc || backDoc) {
      setFormVisible(true);
    }
  }, [backDoc, formVisible, frontDoc, hasFormData, initialDocsLoaded, isEditMode]);

  useEffect(() => {
    if (manualMode) return;
    if (!frontDoc || (!backDoc && !bothSidesSinglePage)) {
      if (formVisible && !keepFormVisibleOnMissingFront) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      if (!keepFormVisibleOnMissingFront) {
        setFormVisible(false);
      }
      return;
    }
    if (processing) return;
  }, [
    bothSidesSinglePage,
    formVisible,
    frontDoc,
    backDoc,
    keepFormVisibleOnMissingFront,
    manualMode,
    processing,
  ]);

  const toggleManualMode = useCallback(() => {
    if (processing || barcodeProcessing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    setManualMode((prev) => {
      const next = !prev;
      if (next) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setWorkflowStarted(false);
        setBarcodeProcessing(false);
        setFormVisible(true);
      }
      return next;
    });
  }, [barcodeProcessing, processing]);

  useEffect(() => {
    if (!isEditMode || !seededFirearmId) return;
    const allDocs = listByType<Document>('Document');
    const forFirearm = allDocs.filter(
      doc => doc.parentType === 'Firearm' && doc.parentId === seededFirearmId
    );
    if (!forFirearm.length) {
      setInitialFrontDoc(null);
      setInitialBackDoc(null);
      setFrontDoc(null);
      setBackDoc(null);
      setInitialDocsLoaded(true);
      return;
    }
    const sorted = forFirearm
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.createdAt || a.updatedAt || '');
        const tb = Date.parse(b.createdAt || b.updatedAt || '');
        return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
      });
    const normalizeSide = (side?: Document['identityDocumentSide']) =>
      (side ?? 'not_applicable') as IdentityDocumentSide;
    const sideHint = (doc: Document): Side | null => {
      const haystack = `${doc.name ?? ''} ${doc.requirementRelatedLabel ?? ''}`.toLowerCase();
      if (haystack.includes('front')) return 'front';
      if (haystack.includes('back')) return 'back';
      return null;
    };
    const findFirstBySide = (side: IdentityDocumentSide, excludeId?: string | null) =>
      sorted.find(doc => normalizeSide(doc.identityDocumentSide) === side && (!excludeId || doc.id !== excludeId));
    const findByHint = (side: Side, excludeId?: string | null) =>
      sorted.find(doc => sideHint(doc) === side && (!excludeId || doc.id !== excludeId));
    const findBoth = (excludeId?: string | null) =>
      sorted.find(doc => normalizeSide(doc.identityDocumentSide) === 'both' && (!excludeId || doc.id !== excludeId));
    const front = findFirstBySide('front') ?? findByHint('front') ?? findBoth() ?? sorted[0] ?? null;
    const back =
      findFirstBySide('back', front?.id) ??
      findByHint('back', front?.id) ??
      findBoth(front?.id) ??
      sorted.find(doc => doc.id !== front?.id) ??
      null;
    const bothSides = !!front && !back;
    setBothSidesSinglePage(bothSides);
    setInitialFrontDoc(front ?? null);
    setInitialBackDoc(bothSides ? front ?? null : back ?? null);
    setFrontDoc(front ?? null);
    setBackDoc(bothSides ? front ?? null : back ?? null);
    backDeletedRef.current = false;
    setInitialDocsLoaded(true);
  }, [isEditMode, seededFirearmId]);

  useEffect(() => {
    if (!isEditMode) return;
    if (!initialDocsLoaded) return;
    if (manualModeBootstrapRef.current) return;
    manualModeBootstrapRef.current = true;
    if (frontDoc || backDoc) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setManualMode(true);
    setWorkflowStarted(false);
    setBarcodeProcessing(false);
    setFormVisible(true);
  }, [backDoc, frontDoc, initialDocsLoaded, isEditMode]);

  useEffect(() => {
    if (!frontDoc) {
      setBothSidesSinglePage(false);
    }
  }, [frontDoc]);

  useEffect(() => {
    if (!ocrExtraction) return;
    if (extractionApplied) return;
    if (ocrExtraction.extractionType !== 'FirearmLicence') {
      setBarcodeProcessing(false);
      setExtractionApplied(true);
      return;
    }
    const partial = mapFirearmExtraction(ocrExtraction);
    setDraft(prev => {
      let next = prev;
      const assign = (key: keyof FirearmExtractionDraft, value?: string) => {
        if (!value) return;
        const current = typeof prev[key] === 'string' ? prev[key] : '';
        if (normalize(current) === value.trim()) return;
        next = next === prev ? { ...prev } : next;
        (next as any)[key] = value;
      };

      assign('firearmType', partial.firearmType ?? undefined);
      assign('barCodeIdNumber', partial.barCodeIdNumber);
      assign('barcodeInitialSurname', partial.barcodeInitialSurname);
      assign('make', partial.make);
      assign('model', partial.model);
      assign('firearmSerialNumber', partial.firearmSerialNumber);
      assign('calibre', partial.calibre);
      assign('licenseNumber', partial.licenseNumber);
      assign('section', partial.section);
      assign('validFrom', partial.validFrom);
      assign('validTo', partial.validTo);
      assign('barrelMake', partial.barrelMake);
      assign('barrelSerialNo', partial.barrelSerialNo);
      assign('receiverMake', partial.receiverMake);
      assign('receiverSerialNumber', partial.receiverSerialNumber);
      assign('frameMake', partial.frameMake);
      assign('frameSerialNumber', partial.frameSerialNumber);
      return next;
    });
    setBarcodeProcessing(false);
    setExtractionApplied(true);
  }, [extractionApplied, ocrExtraction]);

  const sectionAlertedRef = useRef(false);
  useEffect(() => {
    sectionAlertedRef.current = false;
  }, [currentSignature]);
  useEffect(() => {
    barcodeMismatchRef.current = null;
  }, [currentSignature]);

  const restoreInitialDocsAndClose = useCallback(() => {
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
    setFrontDoc(initialFrontDoc ?? null);
    setBackDoc(initialBackDoc ?? null);
    setStep('info');
    goReturn();
  }, [deleteDocumentArtifacts, goReturn, initialBackDoc, initialFrontDoc]);

  const discardInvalidSection = useCallback(() => {
    if (isEditMode) {
      restoreInitialDocsAndClose();
      return;
    }  



    cleanupDocuments();
    setStep('info');
    goReturn();
  }, [cleanupDocuments, goReturn, isEditMode, restoreInitialDocsAndClose]);

  const openSection = useCallback(() => {
    setSheet({ type: 'section', key: 'section', title: 'Section' });
  }, []);

  useEffect(() => {
    if (!extractionApplied) return;
    if (sectionAlertedRef.current) return;
    if (!draft.section) return;
    if (isSectionAllowed(draft.section)) return;
    sectionAlertedRef.current = true;
    Alert.alert(
      'Section not supported',
      `The section extracted from your licence isn't available in the app's list of licence sections. Please choose a valid section before continuing.`,
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: discardInvalidSection,
        },
        {
          text: 'Edit',
          onPress: openSection,
        },
      ],
    );
  }, [discardInvalidSection, draft.section, extractionApplied, openSection]);

  const getBarcodeMismatchMessage = useCallback(() => {
    const profile = listByType<Profile>('Profile')[0];
    if (!profile) return null;
    const barcodeId = normalizeBarcodeMatch(draft.barCodeIdNumber);
    const barcodeName = normalizeBarcodeMatch(draft.barcodeInitialSurname);
    if (!barcodeId && !barcodeName) return null;
    const profileId = normalizeBarcodeMatch(profile.idNumber);
    const profileName = normalizeBarcodeMatch(`${profile.initials ?? ''} ${profile.surname ?? ''}`);
    const lines: string[] = ['We found a mismatch between your profile and firearm licence data:'];
    const formatValue = (value?: string | null, opts?: { uppercase?: boolean }) => {
      const trimmed = normalize(value);
      if (!trimmed) return '—';
      return opts?.uppercase ? trimmed.toUpperCase() : trimmed;
    };
    if (barcodeId && profileId && barcodeId !== profileId) {
      lines.push('', 'Firearm licence ID (Profile ID)');
      lines.push(`${formatValue(draft.barCodeIdNumber)} (${formatValue(profile.idNumber)})`);
    }
    if (barcodeName && profileName && barcodeName !== profileName) {
      lines.push('', 'Firearm licence name (Profile initials & surname)');
      lines.push(
        `${formatValue(draft.barcodeInitialSurname, { uppercase: true })} (${formatValue(
          `${profile.initials ?? ''} ${profile.surname ?? ''}`,
          { uppercase: true },
        )})`,
      );
    }
    if (lines.length === 1) return null;
    const signature = `${barcodeId}|${barcodeName}|${profile.id}`;
    barcodeMismatchRef.current = signature;
    return lines.join('\n');
  }, [draft.barCodeIdNumber, draft.barcodeInitialSurname]);

  const openText = useCallback(
    (key: TextSheetKey, title: string, mask?: 'date') => {
      const rawValue = draft[key] ?? '';
      const initialValue = typeof rawValue === 'string' && rawValue.trim().toUpperCase() === 'NONE'
        ? ''
        : rawValue;
      setEditingInitial(initialValue);
      setSheet({
        type: 'text',
        key,
        title,
        mask,
        multiline: key === 'manufacturerNameAddress',
      });
    },
    [draft],
  );

  const openType = useCallback(() => {
    setSheet({ type: 'select', key: 'firearmType', title: 'Firearm type' });
  }, []);

  const openAction = useCallback(() => {
    setSheet({ type: 'select', key: 'firearmAction', title: 'Firearm action' });
  }, []);

  const openFirstMissingField = useCallback(
    (fields: Array<
      | 'firearmType'
      | 'make'
      | 'model'
      | 'firearmSerialNumber'
      | 'calibre'
      | 'licenseNumber'
      | 'section'
      | 'validFrom'
      | 'validTo'
    >) => {
      if (!fields.length) return;
      const order: Array<
        | 'firearmType'
        | 'make'
        | 'model'
        | 'firearmSerialNumber'
        | 'calibre'
        | 'licenseNumber'
        | 'section'
        | 'validFrom'
        | 'validTo'
      > = [
        'firearmType',
        'make',
        'model',
        'firearmSerialNumber',
        'calibre',
        'licenseNumber',
        'section',
        'validFrom',
        'validTo',
      ];
      const target = order.find((key) => fields.includes(key)) ?? fields[0];
      if (target === 'firearmType') {
        openType();
        return;
      }
      if (target === 'make') {
        makeInputRef.current?.focus();
        return;
      }
      if (target === 'model') {
        modelInputRef.current?.focus();
        return;
      }
      if (target === 'firearmSerialNumber') {
        serialInputRef.current?.focus();
        return;
      }
      if (target === 'calibre') {
        openText('calibre', 'Calibre');
        return;
      }
      if (target === 'licenseNumber') {
        licenceNumberInputRef.current?.focus();
        return;
      }
      if (target === 'section') {
        openSection();
        return;
      }
      if (target === 'validFrom') {
        validFromInputRef.current?.focus();
        return;
      }
      if (target === 'validTo') {
        validToInputRef.current?.focus();
      }
    },
    [openSection, openText, openType],
  );

  const startMissingFieldFlow = useCallback(
    (
      fields: Array<
        | 'firearmType'
        | 'make'
        | 'model'
        | 'firearmSerialNumber'
        | 'calibre'
        | 'licenseNumber'
        | 'section'
        | 'validFrom'
        | 'validTo'
      >,
      opts?: { autoSave?: boolean },
    ) => {
      if (!fields.length) return;
      missingFieldFlowRef.current = {
        autoSave: opts?.autoSave !== false,
        pendingAutoSave: opts?.autoSave !== false,
      };
      void nextFrame().then(() => openFirstMissingField(fields));
    },
    [openFirstMissingField],
  );

  const cancelMissingFieldFlow = useCallback(() => {
    missingFieldFlowRef.current = null;
    setSheet(null);
  }, []);

  const onSaveField = useCallback(
    (value: string) => {
      if (!sheet || sheet.type !== 'text') return;
      const nextValue = sheet.mask === 'date' ? value.trim() : value;
      const isMake =
        sheet.key === 'make' ||
        sheet.key === 'barrelMake' ||
        sheet.key === 'receiverMake' ||
        sheet.key === 'frameMake';
      const isSerial =
        sheet.key === 'firearmSerialNumber' ||
        sheet.key === 'barrelSerialNo' ||
        sheet.key === 'receiverSerialNumber' ||
        sheet.key === 'frameSerialNumber';
      const previousValue = draft[sheet.key] ?? '';
      const commitSave = () => {
        setDraft(prev => ({ ...prev, [sheet.key]: nextValue }));
        setSheet(null);
      };

      if (sheet.key === 'manufacturerNameAddress') {
        const trimmed = nextValue.trim();
        if (trimmed.length > 140) {
          Alert.alert(
            'Manufacturer info too long',
            'This entry is longer than 140 characters and might not fit in the application form.',
            [
              { text: 'Edit', style: 'cancel' },
              { text: 'Continue', onPress: commitSave },
            ],
          );
          return;
        }
      }

      commitSave();
      if (!isMake && !isSerial) return;
      const normalizedNext = normalize(nextValue);
      const normalizedPrev = normalize(previousValue);
      if (!normalizedNext || normalizedNext === normalizedPrev) return;
      if (isMake) {
        Alert.alert('Update make', 'Use this make for all parts?', [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            onPress: () =>
              setDraft(prev => ({
                ...prev,
                make: normalizedNext,
                barrelMake: normalizedNext,
                receiverMake: normalizedNext,
                frameMake: normalizedNext,
              })),
          },
        ]);
        return;
      }
      Alert.alert('Update serial numbers', 'Use this serial number for all parts?', [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () =>
            setDraft(prev => ({
              ...prev,
              firearmSerialNumber: normalizedNext,
              barrelSerialNo: normalizedNext,
              receiverSerialNumber: normalizedNext,
              frameSerialNumber: normalizedNext,
            })),
        },
      ]);
    },
    [draft, sheet],
  );

  const onPickType = useCallback((value: Firearm['firearmType']) => {
    setDraft(prev => ({ ...prev, firearmType: value ?? '' }));
    setSheet(null);
  }, []);

  const onPickAction = useCallback((value: Firearm['firearmAction']) => {
    setDraft(prev => ({ ...prev, firearmAction: value ?? '' }));
    setSheet(null);
  }, []);

  const onPickSection = useCallback((option: SectionOption) => {
    setDraft(prev => ({ ...prev, section: option.value }));
    setSheet(null);
  }, []);

  const copyMakeAndSerialToAll = useCallback(() => {
    const make = normalize(draft.make);
    const serial = normalize(draft.firearmSerialNumber);
    if (!make || !serial) {
      Alert.alert('Missing info', 'Please enter Make and Serial number first.');
      return;
    }
    setDraft(prev => ({
      ...prev,
      barrelMake: make,
      receiverMake: make,
      frameMake: make,
      barrelSerialNo: serial,
      receiverSerialNumber: serial,
      frameSerialNumber: serial,
    }));
  }, [draft.make, draft.firearmSerialNumber]);

  const actionSubtitle = useMemo(() => {
    if (!hasBarcode) return null;
    const type = draft.firearmType ? categoryLabel(draft.firearmType) : 'Type';
    const makeModel = [draft.make, draft.model].filter(Boolean).join(' ').trim();
    const serial =
      draft.firearmSerialNumber ||
      draft.receiverSerialNumber ||
      draft.frameSerialNumber ||
      draft.barrelSerialNo ||
      '';
    const name = makeModel || '—';
    const serialLabel = serial || '—';
    return `${type}: ${name} (${serialLabel})`;
  }, [
    draft.barrelSerialNo,
    draft.firearmSerialNumber,
    draft.firearmType,
    draft.frameSerialNumber,
    draft.make,
    draft.model,
    draft.receiverSerialNumber,
    hasBarcode,
  ]);
  const actionPromptedRef = useRef<string | null>(null);
  useEffect(() => {
    actionPromptedRef.current = null;
  }, [currentSignature]);

  useEffect(() => {
    if (isEditMode && !allowActionPromptRef.current) return;
    if (!formVisible) return;
    if (!captureReady) return;
    if (!extractionAttempted) return;
    if (hasBarcode && barcodeProcessing) return;
    if (draft.firearmAction) return;
    if (actionPromptedRef.current === currentSignature) return;
    allowActionPromptRef.current = false;
    actionPromptedRef.current = currentSignature;
    Alert.alert('Select action', 'Please choose the firearm action.', [
      { text: 'OK', onPress: openAction },
    ]);
    setTimeout(() => {
      scrollToStatus();
    }, 50);
  }, [
    captureReady,
    currentSignature,
    draft.firearmAction,
    extractionAttempted,
    barcodeProcessing,
    formVisible,
    hasBarcode,
    isEditMode,
    openAction,
    scrollToStatus,
  ]);

  const persistDraft = useCallback((): Firearm | null => {
    if (validationEnabled && missingRequiredFields.length > 0) {
      setShowMissingRequired(true);
      Alert.alert('Missing details', 'Please complete the required firearm fields before saving.', [
        { text: 'OK', onPress: () => startMissingFieldFlow(missingRequiredFields, { autoSave: true }) },
      ]);
      return null;
    }
    if (validationEnabled) {
      const canonicalSection = toCanonicalSection(draft.section);
      if (
        canonicalSection === 'Section 13' &&
        draft.firearmType &&
        draft.firearmType !== 'Handgun' &&
        draft.firearmType !== 'Shotgun'
      ) {
        Alert.alert(
          'Invalid firearm type',
          'Section 13 licences are only available for Handgun or Shotgun firearms.'
        );
        return null;
      }
    }
    const actionSelection = draft.firearmAction || undefined;
    if (duplicateChecksEnabled) {
      const makeValue = normalizeForCompare(draft.make);
      const serialValue = normalizeForCompare(draft.firearmSerialNumber);
      if (makeValue && serialValue) {
        const excludeId = existing?.id ?? firearmId ?? null;
        const duplicate = listByType<Firearm>('Firearm').find(firearm => {
          if (excludeId && String(firearm.id) === String(excludeId)) return false;
          return normalizeForCompare(firearm.make) === makeValue
            && normalizeForCompare(firearm.firearmSerialNumber) === serialValue;
        });
        if (duplicate) {
          const makeLabel = duplicate.make?.trim() || 'Unknown make';
          const serialLabel = duplicate.firearmSerialNumber?.trim() || 'Unknown serial';
          Alert.alert(
            'Duplicate firearm',
            `A firearm with make "${makeLabel}" and serial number "${serialLabel}" already exists.`,
          );
          return null;
        }
      }
    }

    const normalizedValidFrom = normalize(draft.validFrom);
    const normalizedValidTo = normalize(draft.validTo);
    const computedIsCurrent = computeIsCurrent(normalizedValidTo);
    const applyIsCurrent = <T extends Firearm>(firearm: T): T => ({
      ...firearm,
      isCurrent: computedIsCurrent,
    });

    if (existing) {
      const next = touch(
        applyIsCurrent({
          ...existing,
          firearmType: draft.firearmType,
          firearmAction: actionSelection,
          barCodeIdNumber: normalize(draft.barCodeIdNumber) || undefined,
          barcodeInitialSurname: normalize(draft.barcodeInitialSurname) || undefined,
          make: normalize(draft.make) || undefined,
          model: normalize(draft.model) || undefined,
          manufacturerNameAddress: normalize(draft.manufacturerNameAddress) || undefined,
          firearmSerialNumber: normalize(draft.firearmSerialNumber) || undefined,
          calibre: normalize(draft.calibre) || undefined,
          licenseNumber: normalize(draft.licenseNumber) || undefined,
          section: toCanonicalSection(draft.section),
          validFrom: normalizedValidFrom || undefined,
          validTo: normalizedValidTo || undefined,
          barrelMake: normalize(draft.barrelMake) || undefined,
          barrelSerialNo: normalize(draft.barrelSerialNo) || undefined,
          receiverMake: normalize(draft.receiverMake) || undefined,
          receiverSerialNumber: normalize(draft.receiverSerialNumber) || undefined,
          frameMake: normalize(draft.frameMake) || undefined,
          frameSerialNumber: normalize(draft.frameSerialNumber) || undefined,
        } as Firearm),
      );
      persist(next);
      return next;
    }

    const id = ensureFirearmId();
    const holderProfileId = prefsProfileId ?? listByType<Profile>('Profile')[0]?.id ?? '';
    const firearm = withMeta<Firearm>(
      applyIsCurrent({
        id,
        type: 'Firearm',
        holderProfileId,
        barCodeIdNumber: normalize(draft.barCodeIdNumber) || undefined,
        barcodeInitialSurname: normalize(draft.barcodeInitialSurname) || undefined,
        firearmType: draft.firearmType || undefined,
        firearmAction: actionSelection,
        make: normalize(draft.make) || undefined,
        model: normalize(draft.model) || undefined,
        manufacturerNameAddress: normalize(draft.manufacturerNameAddress) || undefined,
        firearmSerialNumber: normalize(draft.firearmSerialNumber) || undefined,
        calibre: normalize(draft.calibre) || undefined,
        licenseNumber: normalize(draft.licenseNumber) || undefined,
        section: toCanonicalSection(draft.section),
        validFrom: normalizedValidFrom || undefined,
        validTo: normalizedValidTo || undefined,
        barrelMake: normalize(draft.barrelMake) || undefined,
        barrelSerialNo: normalize(draft.barrelSerialNo) || undefined,
        receiverMake: normalize(draft.receiverMake) || undefined,
        receiverSerialNumber: normalize(draft.receiverSerialNumber) || undefined,
        frameMake: normalize(draft.frameMake) || undefined,
        frameSerialNumber: normalize(draft.frameSerialNumber) || undefined,
      } as Firearm),
    );
    persist(firearm);
    return firearm;
  }, [
    draft,
    duplicateChecksEnabled,
    ensureFirearmId,
    existing,
    firearmId,
    missingRequiredFields,
    prefsProfileId,
    startMissingFieldFlow,
    validationEnabled,
  ]);

  const confirmNoneValuesBeforeSave = useCallback(
    (onConfirm: () => void) => {
      if (!validationEnabled) {
        onConfirm();
        return;
      }
      const noneFields = (Object.keys(FIELD_LABELS) as DraftField[])
        .filter(field => field !== 'firearmAction')
        .filter(field => {
          const raw = draft[field];
          if (typeof raw !== 'string') return false;
          return raw.trim().toUpperCase() === 'NONE';
        });
      if (noneFields.length) {
        const message = `The following fields are still set to "NONE":\n${noneFields
          .map(field => `- ${FIELD_LABELS[field]}`)
          .join('\n')}\n\nDo you want to save with these values?`;
        Alert.alert('Confirm NONE values', message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'destructive', onPress: onConfirm },
        ]);
        return;
      }
      onConfirm();
    },
    [draft, validationEnabled],
  );

  const saveChanges = useCallback((opts?: { onSaved?: (nextIds: string[]) => void }) => {
    if (!manualMode && !captureReady) {
      Alert.alert('Capture needed', 'Please capture photos of both the front and back of the licence.');
      return;
    }
    if (!hasUnsavedChanges) return;
    confirmNoneValuesBeforeSave(() => {
      void (async () => {
        let nextFront: Document | null = frontDoc;
        let nextBack: Document | null = backDoc;
        try {
          const rotated = await applyPendingImageRotations();
          nextFront = rotated.nextFront;
          nextBack = rotated.nextBack;
        } catch (error: any) {
          logger.warn('[firearms/wizard] Failed to apply pending image rotation', error);
          Alert.alert(
            'Unable to save',
            error?.message ?? 'Something went wrong while applying image rotation.',
          );
          return;
        }
        const activeFront = nextFront ?? frontDoc;
        const activeBack = nextBack ?? backDoc;

        if (bothSidesSinglePage && activeFront) {
          setFrontDoc(activeFront);
          setBackDoc(activeFront);
          backDeletedRef.current = false;
          const parentId = activeFront.parentId ?? seededFirearmId ?? firearmId ?? null;
          if (parentId) {
            listByType<Document>('Document')
              .filter(
                doc =>
                  doc.parentType === 'Firearm' &&
                  doc.parentId === parentId &&
                  doc.kind === 'FIREARM_LICENCE' &&
                  doc.id !== activeFront.id
              )
              .forEach(doc => {
                void deleteDocumentArtifacts(doc);
              });
          }
        }

        if (isEditMode) {
          const initialDocs = [initialFrontDoc, initialBackDoc].filter(Boolean) as Document[];
          initialDocs.forEach((doc) => {
            if (doc.id !== activeFront?.id && doc.id !== activeBack?.id) {
              void deleteDocumentArtifacts(doc);
            }
          });
        }
        const saved = persistDraft();
        if (!saved) return;
        recalculateAndPersistCompetencyExpiries();
        const nextIds = isEditMode ? seededSelection : ensureSelectionWith(saved.id);
        if (opts?.onSaved) {
          navigatedRef.current = true;
          opts.onSaved(nextIds);
          return;
        }
        navigatedRef.current = true;
        goReturn(nextIds);
      })();
    });
  }, [
    applyPendingImageRotations,
    backDoc,
    bothSidesSinglePage,
    captureReady,
    manualMode,
    confirmNoneValuesBeforeSave,
    deleteDocumentArtifacts,
    frontDoc,
    firearmId,
    hasUnsavedChanges,
    initialBackDoc,
    initialFrontDoc,
    isEditMode,
    persistDraft,
    seededSelection,
    seededFirearmId,
    ensureSelectionWith,
    goReturn,
  ]);

  useEffect(() => {
    const flow = missingFieldFlowRef.current;
    if (!flow) return;
    if (!validationEnabled) {
      missingFieldFlowRef.current = null;
      return;
    }
    if (sheet) return;
    if (missingRequiredFields.length === 0 && flow.pendingAutoSave) {
      missingFieldFlowRef.current = null;
      saveChanges();
      return;
    }
    // Inline fields are already focused once by startMissingFieldFlow; avoid
    // re-focusing on every keypress while required fields are still missing.
    if (missingRequiredFields.length > 0) {
      if (flow.autoSave) {
        missingFieldFlowRef.current = { ...flow, pendingAutoSave: true };
      } else {
        missingFieldFlowRef.current = null;
      }
      return;
    }
    missingFieldFlowRef.current = null;
  }, [missingRequiredFields, openFirstMissingField, saveChanges, sheet, validationEnabled]);

  const startAnother = useCallback(
    (ids?: string[]) => {
      navigatedRef.current = true;
      router.replace({
        pathname: '/firearms/wizard',
        params: buildWizardParams(ids),
      } as any);
    },
    [buildWizardParams, router],
  );

  const promptAddAnother = useCallback(
    (ids?: string[], opts?: { keepDocs?: boolean }) => {
      Alert.alert(
        'Add another firearm?',
        'Do you want to add another firearm now?',
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
    const mismatchMessage = getBarcodeMismatchMessage();
    if (mismatchMessage) {
      Alert.alert(
        'Profile mismatch',
        `${mismatchMessage}\n\nAre you sure you want to continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => {
              if (hasUnsavedChanges) {
                if (isEditMode) {
                  saveChanges();
                  return;
                }
                saveChanges({ onSaved: (nextIds) => promptAddAnother(nextIds, { keepDocs: true }) });
                return;
              }
              if (!isEditMode) {
                promptAddAnother(undefined, { keepDocs: false });
                return;
              }
              goReturn();
            },
          },
        ],
      );
      return;
    }
    if (isEditMode) {
      saveChanges();
      return;
    }
    saveChanges({ onSaved: (nextIds) => promptAddAnother(nextIds, { keepDocs: true }) });
  }, [getBarcodeMismatchMessage, isEditMode, promptAddAnother, saveChanges]);

  const handleClose = useCallback(() => {
    if (processing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    const mismatchMessage = getBarcodeMismatchMessage();
    if (mismatchMessage) {
      Alert.alert(
        'Profile mismatch',
        `${mismatchMessage}\n\nAre you sure you want to continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => {
              if (hasUnsavedChanges) {
                if (isEditMode) {
                  saveChanges();
                  return;
                }
                saveChanges({ onSaved: (nextIds) => promptAddAnother(nextIds, { keepDocs: true }) });
                return;
              }
              if (!isEditMode) {
                promptAddAnother(undefined, { keepDocs: false });
                return;
              }
              goReturn();
            },
          },
        ],
      );
      return;
    }
    if (backDeletedRef.current) {
      Alert.alert('No changes saved', 'The back image is missing. If you leave now, no changes will be made.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            if (isEditMode) {
              restoreInitialDocsAndClose();
              return;
            }
            cleanupDocuments();
            setStep('info');
            goReturn();
          },
        },
      ]);
      return;
    }
    if (!backDoc && frontDoc && hasFormData) {
      Alert.alert('No changes saved', 'The back image is missing. If you leave now, no changes will be made.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            if (isEditMode) {
              restoreInitialDocsAndClose();
              return;
            }
            cleanupDocuments();
            setStep('info');
            goReturn();
          },
        },
      ]);
      return;
    }
    if (!frontDoc && backDoc && hasFormData) {
      Alert.alert('No changes saved', 'The front image is missing. If you leave now, no changes will be made.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            if (isEditMode) {
              restoreInitialDocsAndClose();
              return;
            }
            cleanupDocuments();
            setStep('info');
            goReturn();
          },
        },
      ]);
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
              restoreInitialDocsAndClose();
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
    restoreInitialDocsAndClose();
    return;
  }, [
    cleanupDocuments,
    frontDoc,
    backDoc,
    goReturn,
    getBarcodeMismatchMessage,
    hasFormData,
    hasUnsavedChanges,
    isEditMode,
    processing,
    restoreInitialDocsAndClose,
    promptAddAnother,
    saveChanges,
  ]);

  const statusMessage = processing
    ? 'Processing your licence photos...'
    : manualMode
      ? 'Manual capture mode enabled. Barcode extraction is bypassed and you can enter the firearm details below.'
    : captureReady
      ? extractionAttempted
        ? hasBarcode
          ? 'Barcode successfully extracted. Review and update the firearm details below.'
          : 'Unable to extract barcode data. Retake/upload image or manually update firearm details below.\n\nSome older firearm licence barcodes do not contain enough data for automatic scanning. If that happens, enter the firearm details manually.'
        : workflowStarted
          ? 'Preparing your details...'
          : 'Review your images and save when ready.'
      : isEditMode
        ? 'Both images are required to continue.'
        : 'Add both images to continue.';
  const statusStyle = processing
    ? [styles.captureStatusBox, styles.captureStatusInfo]
    : captureReady && extractionAttempted && hasBarcode
      ? [styles.captureStatusBox, styles.captureStatusSuccess]
      : captureReady
        ? [styles.captureStatusBox, styles.captureStatusWarning]
        : [styles.captureStatusBox, styles.captureStatusInfo];

  const renderCaptureCard = (
    side: Side,
    title: string,
    doc: Document | null,
    onCamera: () => void,
    onLibrary: () => void,
  ) => {
    const hasBarcode = !!doc?.barcodeData?.trim();
    const helpText = hasBarcode
      ? 'Barcode detected'
      : side === 'front'
        ? 'Frame the card in good lighting and keep it steady.'
        : 'Make sure the barcode and card edges are sharp and glare-free.';
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');

    return (
      <PhotoCaptureCard
        key={side}
        title={title}
        helpText={helpText}
        previewUri={uri}
        previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
        previewRotationDegrees={pendingRotationBySide[side]}
        persistRotationOnPreviewClose={false}
        previewKind={uri ? (isPdf ? 'pdf' : 'image') : undefined}
        previewLabel={name || undefined}
        onPressCamera={onCamera}
        onPressLibrary={onLibrary}
        onPressRotate={() => queueSideRotation(side)}
        showRotateButton={!!uri && !isPdf}
        onPressUpload={() => handleUpload(side)}
        // showUploadButton
        onDelete={() => handleDeleteSide(side)}
        deleteConfirmMessage={
          side === 'back'
            ? 'This will remove the image and clear the form data.'
            : 'This will remove the image but keep the form data.'
        }
        deleteConfirmTitle={side === 'front' ? 'Remove front image?' : undefined}
        disabled={processing}
      />
    );
  };

  const Cell = ({
    label,
    value,
    onPress,
    warning,
    required,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    warning?: boolean;
    required?: boolean;
  }) => {
    const trimmed = value?.trim() ?? '';
    const isNone = trimmed.toUpperCase() === 'NONE';
    const displayValue = trimmed || (required ? 'Required (tap to add)' : 'Optional (tap to add)');
    return (
      <View style={{ marginBottom: 14 }}>
        <Text style={[required ? styles.labelRequired : styles.labelOptional, warning && styles.labelWarning]}>
          {label}
        </Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cell,
            pressed && { opacity: 0.92 },
            isNone && styles.cellNone,
            warning && styles.cellWarning,
          ]}
        >
          <Text
            style={[
              styles.value,
              !trimmed && styles.placeholder,
              isNone && styles.valueNone,
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

  return (
    <Screen>
      <View style={styles.container}>
        {null}
        <View
          onLayout={(event) => {
            headerHeight.current = event.nativeEvent.layout.height;
          }}
        >
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
        </View>
        {step === 'info' ? (
        <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <View style={styles.intro}>
              {/* <Text style={styles.h1}>Capture your firearm licence</Text> */}
              <Text style={styles.lead}>
                We will guide you through photographing the front and back of your licence card and
                scan the barcode to prefill the firearm details.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Before you start</Text>
              {[
                'Have your SAPS firearm licence card ready.',
                'A plain, solid-colour background to put your card on.',
                'Remove anything that could be obstructing the barcode, like stickers or dirt.',
                'Make sure you can photograph/upload images of the FRONT and BACK of the card.',
                'NOTE: some older firearm licence barcodes will not scan. Input firearm info manually in these instances.',
              ].map((item, index) => bullet(item, `need_${index}`))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tips for a clear photo</Text>
              {[
                'Clean your camera lens to reduce image blur and glare.',
                'Place the licence card on a plain, solid-colour background.', 
                'Keep the photo in focus so details are sharp readable.',
                'Hold the camera steady and fill the frame with the licence card.', 
                'Use good lighting and avoid glare or reflections on the card.', 
              ].map((item, index) => bullet(item, `photo_${index}`))}
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
          <PageScrollView ref={scrollRef} contentContainerStyle={styles.captureContent}>
            <Text style={styles.captureIntro}>
              {isEditMode
                ? 'Here are the photos of your licence.'
                : 'Add your firearm manually or by taking clear photos of both sides of your firearm licence card. The app will try to extract the key details automatically.'}
            </Text>

            {!isEditMode || (isEditMode && !frontDoc && !backDoc) ? (
              <View style={styles.captureModeToggleWrap}>
                <Button
                  label={manualMode ? 'Switch to barcode mode' : 'Add manually'}
                  onPress={toggleManualMode}
                  tone="grey"
                  centerText
                  centerContent
                  disabled={processing || barcodeProcessing}
                  style={styles.captureModeToggleButton}
                />
              </View>
            ) : null}

            {!manualMode ? (
              <View style={styles.captureGrid}>
                {renderCaptureCard(
                  'front',
                  bothSidesSinglePage ? 'Firearm licence' : 'Front of licence',
                  frontDoc,
                  handleCaptureFront,
                  handleLibraryFront
                )}
                {!bothSidesSinglePage
                  ? renderCaptureCard('back', 'Back of licence', backDoc, handleCaptureBack, handleLibraryBack)
                  : null}
              </View>
            ) : null}

            {/* <View style={styles.captureControls}>
              <Button
                label={bothSidesSinglePage ? 'Upload two images' : 'Upload contains both sides'}
                onPress={handleMarkBothSides}
                tone="grey"
                disabled={!frontDoc || processing}
                style={styles.captureControlButton}
              />
              {!bothSidesSinglePage ? (
                <Button
                  label="Swap uploads"
                  onPress={handleSwapUploads}
                  tone="grey"
                  disabled={!frontDoc || !backDoc || processing}
                  style={styles.captureControlButton}
                />
              ) : null}
            </View> */}

            {shouldShowStatus ? (
              <View
                style={styles.captureStatus}
                onLayout={(event) => {
                  statusTop.current = event.nativeEvent.layout.y;
                }}
              >
                <View style={statusStyle}>
                  <Text style={styles.captureStatusText}>{statusMessage}</Text>
                </View>
              </View>
            ) : null}

            {formVisible ? (
              <View style={styles.detailsCard}>
                <View style={styles.detailsHeader}>
                  <Text style={styles.detailsTitle}>Firearm details</Text>
                </View>
            <Cell label="Action" value={draft.firearmAction} onPress={openAction} required />
            <WizardField
              label="Manufacturer name & address"
              value={draft.manufacturerNameAddress}
              onChangeText={(value) => setDraft(prev => ({ ...prev, manufacturerNameAddress: value }))}
              placeholder="Optional"
              labelColor={styles.labelOptional.color}
              autoCapitalize="characters"
              hasError={isNoneValue(draft.manufacturerNameAddress) || normalize(draft.manufacturerNameAddress).length > 140}
            />
            {normalize(draft.manufacturerNameAddress).length > 140 ? (
              <Text style={styles.helpWarning}>
                This entry is longer than 140 characters and might not fit in the application form.
              </Text>
            ) : null}
            <Cell
              label="Type"
              value={draft.firearmType ? categoryLabel(draft.firearmType) : undefined}
              onPress={openType}
              required
              warning={showMissingRequired && missingRequiredSet.has('firearmType')}
                />
                <WizardField
                  label="Make"
                  value={draft.make}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, make: value }))}
                  placeholder="Required"
                  labelColor={styles.labelRequired.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.make) || (showMissingRequired && missingRequiredSet.has('make'))}
                  inputRef={makeInputRef}
                />
                <WizardField
                  label="Model"
                  value={draft.model}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, model: value }))}
                  placeholder="Required"
                  labelColor={styles.labelRequired.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.model) || (showMissingRequired && missingRequiredSet.has('model'))}
                  inputRef={modelInputRef}
                />
                <WizardField
                  label="Serial Number"
                  value={draft.firearmSerialNumber}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, firearmSerialNumber: value }))}
                  placeholder="Required"
                  labelColor={styles.labelRequired.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.firearmSerialNumber) || (showMissingRequired && missingRequiredSet.has('firearmSerialNumber'))}
                  inputRef={serialInputRef}
                />
                <Cell
                  label="Calibre"
                  value={draft.calibre}
                  onPress={() => openText('calibre', 'Calibre')}
                  required
                  warning={showMissingRequired && missingRequiredSet.has('calibre')}
                />
                <WizardField
                  label="Licence number"
                  value={draft.licenseNumber}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, licenseNumber: value }))}
                  placeholder={manualMode ? 'Optional' : 'Required'}
                  labelColor={manualMode ? styles.labelOptional.color : styles.labelRequired.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.licenseNumber) || (showMissingRequired && missingRequiredSet.has('licenseNumber'))}
                  inputRef={licenceNumberInputRef}
                />
                <Cell
                  label="Section"
                  value={draft.section}
                  onPress={openSection}
                  required={!manualMode}
                  warning={showMissingRequired && missingRequiredSet.has('section')}
                />
                <WizardField
                  label="Valid from"
                  value={draft.validFrom}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, validFrom: value }))}
                  placeholder={manualMode ? 'Optional' : 'Required'}
                  mask="date"
                  autoCapitalize="characters"
                  labelColor={manualMode ? styles.labelOptional.color : styles.labelRequired.color}
                  hasError={isNoneValue(draft.validFrom) || (showMissingRequired && missingRequiredSet.has('validFrom'))}
                  inputRef={validFromInputRef}
                />
                <WizardField
                  label="Valid to"
                  value={draft.validTo}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, validTo: value }))}
                  placeholder={manualMode ? 'Optional' : 'Required'}
                  mask="date"
                  autoCapitalize="characters"
                  labelColor={manualMode ? styles.labelOptional.color : styles.labelRequired.color}
                  hasError={isNoneValue(draft.validTo) || (showMissingRequired && missingRequiredSet.has('validTo'))}
                  inputRef={validToInputRef}
                />
                <Pressable
                  onPress={copyMakeAndSerialToAll}
                  style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.copyBtnTxt}>Make and serial number same for all</Text>
                </Pressable>
                <WizardField
                  label="Barrel make"
                  value={draft.barrelMake}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, barrelMake: value }))}
                  placeholder="Optional"
                  labelColor={styles.labelOptional.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.barrelMake)}
                />
                <WizardField
                  label="Barrel serial number"
                  value={draft.barrelSerialNo}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, barrelSerialNo: value }))}
                  placeholder="Optional"
                  labelColor={styles.labelOptional.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.barrelSerialNo)}
                />
                <WizardField
                  label="Receiver make"
                  value={draft.receiverMake}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, receiverMake: value }))}
                  placeholder="Optional"
                  labelColor={styles.labelOptional.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.receiverMake)}
                />
                <WizardField
                  label="Receiver serial number"
                  value={draft.receiverSerialNumber}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, receiverSerialNumber: value }))}
                  placeholder="Optional"
                  labelColor={styles.labelOptional.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.receiverSerialNumber)}
                />
                <WizardField
                  label="Frame make"
                  value={draft.frameMake}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, frameMake: value }))}
                  placeholder="Optional"
                  labelColor={styles.labelOptional.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.frameMake)}
                />
                <WizardField
                  label="Frame serial number"
                  value={draft.frameSerialNumber}
                  onChangeText={(value) => setDraft(prev => ({ ...prev, frameSerialNumber: value }))}
                  placeholder="Optional"
                  labelColor={styles.labelOptional.color}
                  autoCapitalize="characters"
                  hasError={isNoneValue(draft.frameSerialNumber)}
                />
              </View>
            ) : null}

            <ButtonSave
              onPress={handleSave}
              disabled={(!manualMode && !captureReady) || !hasUnsavedChanges || processing}
              loading={processing}
            />
          </PageScrollView>
        )}
      </View>
      <ProcessingBlocker
        visible={processing || barcodeProcessing}
        label={processing ? processingLabel : 'Extracting barcode data...'}
      />
      <HelpModal {...helpModalProps} />

      {sheet?.type === 'text' && (
        <EditTextSheet
          visible
          title={sheet.title}
          initial={editingInitial}
          placeholder={sheet.title}
          onCancel={cancelMissingFieldFlow}
          onSave={onSaveField}
          keyboardType={sheet.mask === 'date' ? 'numeric' : 'default'}
          mask={sheet.mask}
          multiline={sheet.multiline}
          maxLength={sheet.maxLength}
          autoCapitalize="characters"
          resolveFilterPills={
            sheet.key === 'calibre' && !hasExtractedCalibre ? resolveCalibreFilterPills : undefined
          }
        />
      )}

      {sheet?.type === 'select' && sheet.key === 'firearmType' && (
        <SelectSheet
          visible
          title={sheet.title}
          options={TYPES.map(t => ({ value: t, label: categoryLabel(t) }))}
          selected={draft.firearmType as any}
          onCancel={cancelMissingFieldFlow}
          onPick={(value) => onPickType(value as Firearm['firearmType'])}
        />
      )}

      {sheet?.type === 'select' && sheet.key === 'firearmAction' && (
        <SelectSheet
          visible
          title={sheet.title}
          subtitle={actionSubtitle}
          options={ACTIONS.map(action => ({ value: action, label: action }))}
          selected={draft.firearmAction ? (draft.firearmAction as any) : undefined}
          onCancel={cancelMissingFieldFlow}
          onPick={(value) => onPickAction(value as Firearm['firearmAction'])}
        />
      )}

      {sheet?.type === 'section' && (
        <SelectSheet
          visible
          title={sheet.title}
          options={SECTION_OPTIONS.map((option) => ({ value: option.code, label: option.label }))}
          selected={
            SECTION_OPTIONS.find(
              (option) => draft.section === option.value || draft.section === option.label
            )?.code as any
          }
          onCancel={cancelMissingFieldFlow}
          onPick={(value) => {
            const selectedOption = SECTION_OPTIONS.find((option) => option.code === value);
            if (selectedOption) onPickSection(selectedOption);
          }}
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
    sectionTitle: { fontSize: 16, fontWeight: '600', color: neutral.onSurface, marginBottom: 8 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
    bulletMarker: { width: 18, fontSize: 16, lineHeight: 20, color: neutral.base },
    bulletText: { flex: 1, fontSize: 15, lineHeight: 20, color: neutral.base },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    hintTextWrap: { flex: 1, gap: 2 },
    hintLabel: { fontSize: 15, fontWeight: '600', color: neutral.onSurface },
    hintHelp: { fontSize: 13, color: neutral.base },
    captureContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
    captureHeading: { fontSize: 22, fontWeight: '700', color: neutral.onSurface },
    captureIntro: { color: neutral.base, fontSize: 14, lineHeight: 20 },
    captureControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    captureControlButton: { flex: 1, minWidth: 180 },
    captureModeToggleWrap: { marginTop: -2 },
    captureModeToggleButton: { alignSelf: 'flex-start' },
    captureGrid: { gap: 16 },
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
    detailsCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      padding: 16,
      gap: 12,
    },
    detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    detailsTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    labelRequired: { color: tones.teal.base, marginBottom: 6, fontWeight: '700' },
    labelOptional: { color: neutral.base, marginBottom: 6, fontWeight: '700' },
    labelWarning: { color: tones.orange.base },
    cell: {
      backgroundColor: neutral.onBase,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minHeight: 44,
      borderWidth: 1,
      borderColor: neutral.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cellWarning: {
      backgroundColor: tones.orange.surface,
      borderColor: tones.orange.border,
    },
    cellNone: {
      backgroundColor: tones.orange.surface,
      borderColor: tones.orange.border,
    },
    value: { fontSize: 16, color: neutral.onSurface, flex: 1, marginRight: 10 },
    valueWarning: { color: tones.orange.onSurface },
    valueNone: { color: tones.orange.onSurface },
    helpWarning: { color: tones.orange.base, fontSize: 13, marginTop: -6, marginBottom: 6 },
    placeholder: { color: neutral.base },
    chev: { color: neutral.base, fontSize: 20 },
    copyBtn: {
      marginTop: 6,
      marginBottom: 12,
      backgroundColor: tones.teal.base,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    copyBtnPressed: {
      backgroundColor: tones.teal.emphasis,
    },
    copyBtnTxt: { color: tones.green.onBase, fontWeight: '700', fontSize: 13 },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(10, 20, 31, 0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: neutral.onBase,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10, color: neutral.onSurface },
    pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    pill: {
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
    },
    pillSelected: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    pillPressed: {
      borderColor: neutral.base,
      backgroundColor: neutral.surface,
      opacity: 0.92,
    },
    pillPressedSelected: {
      borderColor: tones.teal.emphasis,
      backgroundColor: tones.teal.emphasis,
      opacity: 0.92,
    },
    pillTxt: { fontSize: 13, color: neutral.onSurface },
    pillTxtSelected: { color: tones.teal.onSurface, fontWeight: '700' },
    sheetCloseBtn: {
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: neutral.surface,
    },
    sheetCloseBtnPressed: {
      backgroundColor: neutral.emphasis,
    },
    sheetCloseBtnTxt: { color: neutral.onSurface, fontWeight: '600' },
  });
