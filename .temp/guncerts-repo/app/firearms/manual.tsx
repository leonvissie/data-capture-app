import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Modal, ActivityIndicator, Platform, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../../src/components/Screen';
import { useTones } from '../../src/theme/tones';
import { Document, Firearm, IdentityDocumentSide, Extraction } from '../../src/data/types';
import { withMeta, persist, touch } from '../../src/data/repo';
import { EditTextSheet, SelectSheet } from '../../src/components/EditSheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import Button from '../../src/components/Button';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import { appConfig } from '../../src/config/appConfig';
import policy518a from '../../src/policy/518a.json';
import {
  FALLBACK_518A_LICENCE_TYPES,
  RawLicenceType,
  normalizeLicenceTypesWithFallback,
} from '../../src/policy/licenceTypes';
import { parseArrayParam } from '../../src/utils/queryParams';
import { ensureDocumentBarcode } from '../../src/barcode/ensureDocumentBarcode';
import { loadDocumentPreview } from '../../src/utils/documentPreview';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import ButtonSave from '../../src/components/ButtonSave';
import { useDevMode } from '../../src/providers/DevModeProvider';
import { getExtractionForDocument, performDocumentExtraction } from '../../src/ocr';
import { mapFirearmExtraction, type FirearmExtractionDraft } from '../../src/ocr/mappers';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { logger } from '@/src/utils/logger';
import { categoryLabel } from '../../src/utils/categoryLabel';
import { recalculateAndPersistCompetencyExpiries } from '../../src/utils/competencyExpiry';
import { useDemoDataResetGuard } from '../../src/demo/useDemoDataResetGuard';
import { searchCalibreCatalogRecordsByAlias } from '../../src/config/motivation/calibreCatalog';

const TYPES: NonNullable<Firearm['firearmType']>[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const ACTIONS: NonNullable<Firearm['firearmAction']>[] = ['Semi-automatic', 'Automatic', 'Manual', 'Other'];
const SIDE_LABELS: Record<IdentityDocumentSide, string> = {
  front: 'Front',
  back: 'Back',
  both: 'Both sides',
  not_applicable: 'Not applicable',
};

type PolicyJson = { licenceTypes?: Record<string, RawLicenceType> };

type SectionOption = {
  code: string;
  name: string;
  section?: string;
  value: string;
  label: string;
};

const POLICY_LICENCE_TYPES = (policy518a as PolicyJson).licenceTypes;

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
  firearmType: Firearm['firearmType'] | '';
  make: string;
  model: string;
  firearmAction: Firearm['firearmAction'] | 'NONE';
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
  | { type: 'text'; key: TextSheetKey; title: string; mask?: 'date' }
  | { type: 'select'; key: 'firearmType' | 'firearmAction'; title: string }
  | { type: 'section'; key: 'section'; title: string };

const FIELD_LABELS: Record<DraftField, string> = {
  firearmType: 'Type',
  make: 'Make',
  model: 'Model',
  firearmAction: 'Action',
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
  firearmType: '',
  make: '',
  model: '',
  firearmAction: 'NONE',
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

const cloneDraft = (draft: FirearmDraft): FirearmDraft => ({ ...draft });

const draftFromFirearm = (firearm: Firearm): FirearmDraft => ({
  firearmType: firearm.firearmType ?? '',
  make: firearm.make ?? '',
  model: firearm.model ?? '',
  firearmAction: firearm.firearmAction ?? 'NONE',
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

export default function ManualFirearmScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const guardDemoReset = useDemoDataResetGuard();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const { devModeEnabled } = useDevMode();
  const validationEnabled = appConfig.features.enableValidation && !devModeEnabled;
  const duplicateChecksEnabled = appConfig.features.duplicateChecks;
  const params = useLocalSearchParams() as {
    docId?: string | string[];
    id?: string | string[];
    returnTo?: string | string[];
    completeReturnTo?: string | string[];
    nav?: string | string[];
    selectedFirearmIds?: string | string[];
    selectionParam?: string | string[];
    fromWizard?: string | string[];
    intro?: string | string[] | null;
    forceOverwrite?: string | string[];
    requireAction?: string | string[];
  };

  const docId = useMemo(() => {
    const raw = params.docId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.docId]);

  const id = useMemo(() => {
    const raw = params.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.id]);

  const selectionParam = useMemo(() => {
    const raw = Array.isArray(params.selectionParam) ? params.selectionParam[0] : params.selectionParam;
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value || 'selectedFirearmIds';
  }, [params.selectionParam]);
  const forceOverwrite = useMemo(() => {
    const raw = Array.isArray(params.forceOverwrite) ? params.forceOverwrite[0] : params.forceOverwrite;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'force';
  }, [params.forceOverwrite]);
  const requireAction = useMemo(() => {
    const raw = Array.isArray(params.requireAction) ? params.requireAction[0] : params.requireAction;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'require';
  }, [params.requireAction]);

  const cameFromWizard = useMemo(() => {
    const raw = Array.isArray(params.fromWizard) ? params.fromWizard[0] : params.fromWizard;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'wizard';
  }, [params.fromWizard]);

  const seededSelection = useMemo(
    () => parseArrayParam(params.selectedFirearmIds),
    [params.selectedFirearmIds]
  );
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
    [navPayload, params.completeReturnTo, params.returnTo],
  );
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);

  const returnToPath = useMemo(() => {
    const raw =
      navCtx.routeBack ||
      navCtx.onComplete ||
      navCtx.returnTo ||
      (Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo);
    if (!raw && raw !== '') return undefined;
    let decoded = String(raw ?? '').trim();
    if (!decoded) return undefined;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Ignore decode errors
    }
    if (decoded && !decoded.startsWith('/')) decoded = `/${decoded}`;
    return decoded;
  }, [navCtx.onComplete, navCtx.returnTo, navCtx.routeBack, params.returnTo]);

  const ensureSelectionWith = useCallback(
    (nextId?: string | null) => {
      const base = new Set(seededSelection);
      if (nextId) base.add(String(nextId));
      return Array.from(base);
    },
    [seededSelection],
  );

  const profileFirearmsPath = '/(tabs)/profile?scroll=firearms';

  const goReturn = useCallback(
    (ids?: string[]) => {
      const buildTarget = () => {
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
        return search.toString() ? `${base}?${search.toString()}` : base;
      };

      const target = buildTarget();

      if (cameFromWizard) {
        router.replace(target as any);
        return;
      }

      backOrReplaceWithContext(router as any, { ...navCtx, routeBack: target, returnTo: target }, profileFirearmsPath as any);
    },
    [cameFromWizard, introFlag, navCtx, profileFirearmsPath, returnToPath, router, seededSelection, selectionParam],
  );

  const wizardReturnParams = useMemo(() => {
    const base = returnToPath ?? '/(tabs)/profile?scroll=firearms';
    const [path, query = ''] = base.split('?');
    const search = new URLSearchParams(query);
    if (introFlag) {
      search.set('intro', introFlag);
    }
    const encoded = encodeURIComponent(search.toString() ? `${path}?${search.toString()}` : path);
    return {
      returnTo: encoded,
      selectionReturnTo: encoded,
      intro: introFlag ?? undefined,
      nav: encodeURIComponent(JSON.stringify({ ...navCtx, routeBack: base, returnTo: base })),
    };
  }, [introFlag, navCtx, returnToPath]);

  const handlePostSave = useCallback(
    (nextIds: string[], wasExisting: boolean) => {
      if (cameFromWizard && !wasExisting) {
        Alert.alert(
          'Add another firearm?',
          'Do you want to add another firearm now?',
          [
            {
              text: 'No',
              style: 'cancel',
              onPress: () => goReturn(nextIds),
            },
            {
              text: 'Yes',
              onPress: () => {
                void (async () => {
                  if (await guardDemoReset('firearm')) return;
                  router.replace({
                    pathname: '/firearms/wizard',
                    params: wizardReturnParams,
                  } as any);
                })();
              },
            },
          ],
        );
        return;
      }
      goReturn(nextIds);
    },
    [cameFromWizard, goReturn, guardDemoReset, router, wizardReturnParams],
  );

  const [existing, setExisting] = useState<Firearm | null>(null);
  const [initialDraft, setInitialDraft] = useState<FirearmDraft>(createEmptyDraft());
  const [draft, setDraft] = useState<FirearmDraft>(createEmptyDraft());
  const [ocrExtraction, setOcrExtraction] = useState<Extraction | null>(null);
  const [extractionApplied, setExtractionApplied] = useState(false);
  const [docRecord, setDocRecord] = useState<Document | null>(null);

  const parentFirearmId = useMemo(() => {
    return existing?.id ?? (id ? String(id) : docRecord?.parentId ?? null);
  }, [docRecord?.parentId, existing?.id, id]);

  const manualReturnPath = useMemo(() => {
    const search = new URLSearchParams();
    if (id) search.set('id', id);
    if (docId) search.set('docId', docId);
    const rawReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
    if (rawReturnTo) search.set('returnTo', String(rawReturnTo));
    const rawSelectedIds = Array.isArray(params.selectedFirearmIds)
      ? params.selectedFirearmIds[0]
      : params.selectedFirearmIds;
    if (rawSelectedIds) search.set('selectedFirearmIds', String(rawSelectedIds));
    const rawSelectionParam = Array.isArray(params.selectionParam)
      ? params.selectionParam[0]
      : params.selectionParam;
    if (rawSelectionParam) search.set('selectionParam', String(rawSelectionParam));
    const rawFromWizard = Array.isArray(params.fromWizard) ? params.fromWizard[0] : params.fromWizard;
    if (rawFromWizard) search.set('fromWizard', String(rawFromWizard));
    const query = search.toString();
    return query ? `/firearms/manual?${query}` : '/firearms/manual';
  }, [docId, id, params.fromWizard, params.returnTo, params.selectedFirearmIds, params.selectionParam]);

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
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewDocs, setPreviewDocs] = useState<Document[]>([]);
  const [previewState, setPreviewState] = useState<Record<
    string,
    {
      uri: string | null;
      mime?: string;
      error: string | null;
      loading: boolean;
    }
  >>({});

  const attachDocumentToFirearm = useCallback(
    (firearmId: string) => {
      if (!docId) return;
      const doc = getById<Document>(String(docId));
      if (!doc) return;
      if (doc.parentType === 'Firearm' && doc.parentId === firearmId) return;
      const updated = touch({
        ...doc,
        parentType: 'Firearm',
        parentId: firearmId,
      } as Document);
      persist(updated);
    },
    [docId],
  );

  useEffect(() => {
    if (id) {
      const fx = getById<Firearm>(String(id));
      if (fx) {
        setExisting(fx);
        const base = draftFromFirearm(fx);
        setInitialDraft(base);
        setDraft(cloneDraft(base));
        return;
      }
    }

    setExisting(null);
    const base = createEmptyDraft();
    setInitialDraft(base);
    setDraft(cloneDraft(base));
  }, [id]);

  useEffect(() => {
    if (!docId) {
      setDocRecord(null);
      return;
    }
    const doc = getById<Document>(String(docId));
    setDocRecord(doc ?? null);
  }, [docId]);

  const gatherPreviewDocs = useCallback((): Document[] => {
    const allDocs = listByType<Document>('Document');
    const targetId = parentFirearmId;
    let docs = targetId
      ? allDocs.filter(d => d.parentType === 'Firearm' && d.parentId === targetId)
      : [];
    if (docRecord) {
      const exists = docs.some(d => d.id === docRecord.id);
      if (!exists) {
        docs = [docRecord, ...docs];
      }
    }
    const sortedByRecency = docs.sort((a, b) => {
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
    const frontDoc = sortedByRecency.find(d => d.identityDocumentSide === 'front');
    const backDoc = sortedByRecency.find(d => d.identityDocumentSide === 'back');
    const prioritized: Document[] = [];
    if (frontDoc) prioritized.push(frontDoc);
    if (backDoc && backDoc.id !== frontDoc?.id) prioritized.push(backDoc);
    if (!prioritized.length) {
      return sortedByRecency;
    }
    const remainder = sortedByRecency.filter(doc => !prioritized.some(item => item.id === doc.id));
    return [...prioritized, ...remainder];
  }, [docRecord, parentFirearmId]);

  const openPreviewModal = useCallback(() => {
    const docs = gatherPreviewDocs();
    if (!docs.length) {
      Alert.alert('No licence photos', 'We could not find any licence images for this firearm yet.');
      return;
    }
    const initialState = docs.reduce<Record<string, { uri: string | null; mime?: string; error: string | null; loading: boolean }>>(
      (acc, doc) => {
        acc[doc.id] = {
          uri: null,
          mime: doc.mime,
          error: null,
          loading: true,
        };
        return acc;
      },
      {},
    );
    setPreviewDocs(docs);
    setPreviewState(initialState);
    setPreviewVisible(true);
  }, [gatherPreviewDocs]);

  const closePreviewModal = useCallback(() => {
    setPreviewVisible(false);
    setPreviewDocs([]);
    setPreviewState({});
  }, []);

  useEffect(() => {
    if (!previewVisible) return;
    let cancelled = false;
    (async () => {
      await Promise.all(
        previewDocs.map(async doc => {
          try {
            setPreviewState(prev => ({
              ...prev,
              [doc.id]: { ...(prev[doc.id] ?? { uri: null, mime: doc.mime, error: null }), loading: true },
            }));
            const res = await loadDocumentPreview(doc);
            if (cancelled) return;
            if (res?.uri) {
              setPreviewState(prev => ({
                ...prev,
                [doc.id]: {
                  ...(prev[doc.id] ?? { uri: null, mime: doc.mime, error: null }),
                  uri: res.uri,
                  mime: res.mime,
                  error: null,
                  loading: false,
                },
              }));
            } else {
              setPreviewState(prev => ({
                ...prev,
                [doc.id]: {
                  ...(prev[doc.id] ?? { uri: null, mime: doc.mime, error: null }),
                  uri: null,
                  mime: res?.mime,
                  error: 'Preview not available for this document.',
                  loading: false,
                },
              }));
            }
          } catch (error: any) {
            if (cancelled) return;
            logger.warn('[firearms/manual] Failed to load preview', error);
            setPreviewState(prev => ({
              ...prev,
              [doc.id]: {
                ...(prev[doc.id] ?? { uri: null, mime: doc.mime, error: null }),
                uri: null,
                error: error?.message ?? 'Unable to load preview for this document.',
                loading: false,
              },
            }));
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [previewDocs, previewVisible]);

  const ensuringBarcodeFor = useRef<string | null>(null);
  useEffect(() => {
    if (!docRecord) {
      setOcrExtraction(null);
      setExtractionApplied(false);
      ensuringBarcodeFor.current = null;
      return;
    }
    if (docRecord.barcodeData?.trim()) {
      ensuringBarcodeFor.current = null;
      return;
    }
    const docIdRef = docRecord.id;
    if (ensuringBarcodeFor.current === docIdRef) return;
    ensuringBarcodeFor.current = docIdRef;
    let cancelled = false;
    (async () => {
      try {
        const updated = await ensureDocumentBarcode(docRecord);
        if (cancelled) return;
        if (updated.barcodeData?.trim()) {
          ensuringBarcodeFor.current = null;
          setDocRecord(updated);
        } else {
          ensuringBarcodeFor.current = null;
        }
      } catch (error) {
        if (!cancelled) {
          ensuringBarcodeFor.current = null;
          logger.warn('[firearms/manual] Failed to ensure barcode', error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docRecord]);

  useEffect(() => {
    if (!docRecord) return;
    const existingExtraction = getExtractionForDocument(docRecord);
    if (existingExtraction) {
      setOcrExtraction(existingExtraction);
      return;
    }
    if (docRecord.barcodeData?.trim()) {
      (async () => {
        try {
          const extraction = await performDocumentExtraction(docRecord, {
            extractionType: 'FirearmLicence',
            force: true,
          });
          setOcrExtraction(extraction);
        } catch (error) {
          logger.warn('[firearms/manual] Extraction from barcode failed', error);
        }
      })();
    }
  }, [docRecord]);

  useEffect(() => {
    if (!ocrExtraction) return;
    if (extractionApplied) return;
    if (ocrExtraction.extractionType !== 'FirearmLicence') {
      setExtractionApplied(true);
      return;
    }
    const partial = mapFirearmExtraction(ocrExtraction);
    let mutated = false;

    setDraft(prev => {
      let next = prev;
      const maybe = (key: keyof FirearmDraft, value?: string) => {
        if (!value) return;
        const current = typeof prev[key] === 'string' ? prev[key] : '';
        if (!forceOverwrite && current) return;
        if (forceOverwrite && current.trim() === value.trim()) return;
        next = next === prev ? { ...prev } : next;
        (next as any)[key] = value;
        mutated = true;
      };

      maybe('firearmType', partial.firearmType ?? undefined);
      maybe('make', partial.make);
      maybe('model', partial.model);
      maybe('firearmSerialNumber', partial.firearmSerialNumber);
      maybe('calibre', partial.calibre);
      maybe('licenseNumber', partial.licenseNumber);
      maybe('section', partial.section);
      maybe('validFrom', partial.validFrom);
      maybe('validTo', partial.validTo);
      maybe('barrelMake', partial.barrelMake);
      maybe('barrelSerialNo', partial.barrelSerialNo);
      maybe('receiverMake', partial.receiverMake);
      maybe('receiverSerialNumber', partial.receiverSerialNumber);
      maybe('frameMake', partial.frameMake);
      maybe('frameSerialNumber', partial.frameSerialNumber);
      if (requireAction && prev.firearmAction !== 'NONE') {
        next = next === prev ? { ...prev } : next;
        next.firearmAction = 'NONE';
        mutated = true;
      }
      return next;
    });

    if (mutated && !forceOverwrite && !requireAction) {
      setInitialDraft(prev => ({ ...prev, ...partial }));
    }
    setExtractionApplied(true);
  }, [extractionApplied, forceOverwrite, ocrExtraction, requireAction]);

  const sectionAlertedRef = useRef(false);
  const discardInvalidSection = useCallback(async () => {
    if (cameFromWizard && docRecord?.id && docId && docRecord.id === docId) {
      const paths = [docRecord.uri, docRecord.filePath, docRecord.thumbPath].filter(Boolean) as string[];
      for (const path of paths) {
        try {
          await deleteOwnedDocFile(path);
        } catch {
          // ignore cleanup failures
        }
      }
      if (docRecord.ocrExtractionId) {
        deleteEntity(docRecord.ocrExtractionId);
      }
      deleteEntity(docRecord.id);
    }
    goReturn();
  }, [cameFromWizard, docId, docRecord, goReturn]);

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
          onPress: () => {
            void discardInvalidSection();
          },
        },
        {
          text: 'Edit',
          onPress: () => {
            openSection();
          },
        },
      ],
    );
  }, [discardInvalidSection, draft.section, extractionApplied, openSection]);


  const openText = useCallback(
    (key: TextSheetKey, title: string, mask?: 'date') => {
      setEditingInitial(draft[key] ?? '');
      setSheet({ type: 'text', key, title, mask });
    },
    [draft],
  );

  const openType = useCallback(() => {
    setSheet({ type: 'select', key: 'firearmType', title: 'Firearm type' });
  }, []);

  const openAction = useCallback(() => {
    setSheet({ type: 'select', key: 'firearmAction', title: 'Firearm action' });
  }, []);

  const onSaveField = useCallback(
    (value: string) => {
      if (!sheet || sheet.type !== 'text') return;
      const nextValue = sheet.mask === 'date' ? value.trim() : value;
      setDraft(prev => ({ ...prev, [sheet.key]: nextValue }));
      setSheet(null);
    },
    [sheet],
  );

  const onPickType = useCallback((value: Firearm['firearmType']) => {
    setDraft(prev => ({ ...prev, firearmType: value ?? '' }));
    setSheet(null);
  }, []);

  const onPickAction = useCallback((value: Firearm['firearmAction']) => {
    setDraft(prev => ({ ...prev, firearmAction: value ?? 'NONE' }));
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

  const changedFieldLabels = useMemo(
    () => changedFields.map(field => FIELD_LABELS[field]),
    [changedFields],
  );

  const hasUnsavedChanges = changedFields.length > 0;

  const barcodeData = docRecord?.barcodeData?.trim() || null;
  const rawBarcodeType = docRecord?.barcodeType;
  const barcodeLabel =
    typeof rawBarcodeType === 'string' && rawBarcodeType.trim()
      ? rawBarcodeType.trim().toUpperCase()
      : 'PDF417';
  const actionSubtitle = useMemo(() => {
    if (!barcodeData) return null;
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
    barcodeData,
    draft.barrelSerialNo,
    draft.firearmSerialNumber,
    draft.firearmType,
    draft.frameSerialNumber,
    draft.make,
    draft.model,
    draft.receiverSerialNumber,
  ]);

  const persistDraft = useCallback((): Firearm | null => {
    if (validationEnabled && !draft.firearmType) {
      Alert.alert('Missing type', 'Please choose the firearm type.', [
        { text: 'OK', onPress: openType },
      ]);
      return null;
    }
    if (validationEnabled) {
      const canonicalSection = toCanonicalSection(draft.section);
      if (canonicalSection === 'Section 13' && draft.firearmType && draft.firearmType !== 'Handgun') {
        Alert.alert(
          'Invalid firearm type',
          'Section 13 licences are only available for Handgun firearms.'
        );
        return null;
      }
    }
    const actionSelection = draft.firearmAction !== 'NONE' ? draft.firearmAction : undefined;
    if (validationEnabled && !actionSelection) {
      Alert.alert('Missing action', 'Please choose the firearm action.', [
        { text: 'OK', onPress: openAction },
      ]);
      return null;
    }
    if (validationEnabled && !normalize(draft.make) && !normalize(draft.model)) {
      Alert.alert('Missing details', 'Please enter at least a Make or Model.');
      return null;
    }
    if (duplicateChecksEnabled) {
      const makeValue = normalizeForCompare(draft.make);
      const serialValue = normalizeForCompare(draft.firearmSerialNumber);
      if (makeValue && serialValue) {
        const excludeId = existing?.id ?? id ?? null;
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
            `A firearm with make "${makeLabel}" and serial number "${serialLabel}" already exists.`
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
          make: normalize(draft.make) || undefined,
          model: normalize(draft.model) || undefined,
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
        } as Firearm)
      );
      persist(next);
      setExisting(next);
      const base = draftFromFirearm(next);
      setInitialDraft(base);
      setDraft(cloneDraft(base));
      return next;
    }

    const seededId = id ? String(id) : undefined;
    const firearm = withMeta<Firearm>(
      applyIsCurrent({
        id: seededId ?? (globalThis.crypto?.randomUUID?.() ?? `gun_${Math.random().toString(36).slice(2)}`),
        type: 'Firearm',
        firearmType: draft.firearmType || undefined,
        firearmAction: actionSelection,
        make: normalize(draft.make) || undefined,
        model: normalize(draft.model) || undefined,
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
      } as any)
    );
    persist(firearm);
    attachDocumentToFirearm(firearm.id);
    setExisting(firearm);
    const base = draftFromFirearm(firearm);
    setInitialDraft(base);
    setDraft(cloneDraft(base));
    return firearm;
  }, [
    attachDocumentToFirearm,
    draft,
    duplicateChecksEnabled,
    existing,
    id,
    openAction,
    openType,
    validationEnabled,
  ]);

  const confirmNoneValuesBeforeSave = useCallback(
    (onConfirm: () => void) => {
      if (!validationEnabled) {
        onConfirm();
        return;
      }
      const actionValue = (draft.firearmAction ?? '').trim().toUpperCase();
      if (actionValue === 'NONE') {
        Alert.alert('Missing action', 'Please choose the firearm action.', [
          { text: 'OK', onPress: openAction },
        ]);
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
    [draft, openAction, validationEnabled],
  );

  const performSave = useCallback(() => {
    const editingExisting = !!existing;
    const saved = persistDraft();
    if (!saved) return;
    attachDocumentToFirearm(saved.id);
    recalculateAndPersistCompetencyExpiries();
    const nextIds = editingExisting ? seededSelection : ensureSelectionWith(saved.id);
    handlePostSave(nextIds, editingExisting);
  }, [
    attachDocumentToFirearm,
    ensureSelectionWith,
    existing,
    handlePostSave,
    persistDraft,
    seededSelection,
  ]);

  const handleSave = useCallback(() => {
    if (!hasUnsavedChanges) {
      goReturn();
      return;
    }
    confirmNoneValuesBeforeSave(performSave);
  }, [confirmNoneValuesBeforeSave, goReturn, hasUnsavedChanges, performSave]);

  const handleSaveAndClose = useCallback(() => {
    if (!hasUnsavedChanges) {
      goReturn();
      return;
    }
    confirmNoneValuesBeforeSave(performSave);
  }, [confirmNoneValuesBeforeSave, goReturn, hasUnsavedChanges, performSave]);

  const handleDiscard = useCallback(() => {
    setDraft(cloneDraft(initialDraft));
    goReturn();
  }, [initialDraft, goReturn]);

  const handleClose = useCallback(() => {
    setSheet(null);
    if (requireAction && draft.firearmAction === 'NONE') {
      Alert.alert('Action required', 'Please choose the firearm action before closing.');
      return;
    }
    if (!hasUnsavedChanges) {
      goReturn();
      return;
    }
    const message = `You have unsaved changes:\n${changedFieldLabels.map(label => `• ${label}`).join('\n')}`;
    Alert.alert('Unsaved changes', message, [
      { text: 'Discard', style: 'destructive', onPress: handleDiscard },
      { text: 'Save', onPress: handleSaveAndClose },
    ]);
  }, [changedFieldLabels, draft.firearmAction, goReturn, handleDiscard, handleSaveAndClose, hasUnsavedChanges, requireAction]);

  const handleOpenEditor = useCallback(() => {
    const navPayload = {
      ...navCtx,
      routeBack: manualReturnPath,
      returnTo: manualReturnPath,
      clearRouteBackHistory: false,
    };
    const nextParams: Record<string, string> = {
      origin: 'manual',
      returnTo: encodeURIComponent(manualReturnPath),
      hideContinue: '1',
      nav: encodeURIComponent(JSON.stringify(navPayload)),
    };
    if (parentFirearmId) {
      nextParams.firearmId = parentFirearmId;
    }
    router.push({ pathname: '/firearms/wizard', params: nextParams } as any);
  }, [manualReturnPath, navCtx, parentFirearmId, router]);

  const showDevDiagnostics = useMemo(() => {
    return appConfig.isDev && appConfig.features.showDevTools && devModeEnabled;
  }, [devModeEnabled]);

  const Cell = ({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) => {
    const trimmed = value?.trim() ?? '';
    const isNone = trimmed.toUpperCase() === 'NONE';
    const displayValue = trimmed || 'Tap to add';
    return (
      <View style={{ marginBottom: 14 }}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cell,
            pressed && { opacity: 0.92 },
            isNone && styles.cellNone,
          ]}
        >
          <Text
            style={[
              styles.value,
              !trimmed && styles.placeholder,
              isNone && styles.valueNone,
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
        <PageHeader
          title={existing ? 'Edit firearm' : 'Firearm details'}
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!hasUnsavedChanges}
          style={styles.header}
          extraActions={
            <IconRoundButton
              buttonType="preview"
              accessibilityLabel="Edit licence capture"
              onPress={handleOpenEditor}
              size="sm"
              hitSlop={8}
            />
          }
        />
        <PageScrollView contentContainerStyle={styles.content}>
          {showDevDiagnostics && barcodeData ? (
            <View style={[styles.ocrBanner, styles.ocrBannerInfo]}>
              <Text style={[styles.ocrBannerText, styles.ocrBannerTextInfo]}>
                {`Barcode detected (${barcodeLabel})`}
              </Text>
              <Text selectable style={styles.barcodeValue}>{barcodeData}</Text>
            </View>
          ) : null}

          <Cell
            label="Type"
            value={draft.firearmType ? categoryLabel(draft.firearmType) : undefined}
            onPress={openType}
          />
          <Cell label="Make" value={draft.make} onPress={() => openText('make', 'Make')} />
          <Cell label="Model" value={draft.model} onPress={() => openText('model', 'Model')} />
          <Cell label="Action" value={draft.firearmAction} onPress={openAction} />
          <Cell label="Serial Number" value={draft.firearmSerialNumber} onPress={() => openText('firearmSerialNumber', 'Serial Number')} />
          <Cell label="Calibre" value={draft.calibre} onPress={() => openText('calibre', 'Calibre')} />
          <Cell label="Licence number" value={draft.licenseNumber} onPress={() => openText('licenseNumber', 'Licence number')} />
          <Cell label="Section" value={draft.section} onPress={openSection} />
          <Cell label="Valid from" value={draft.validFrom} onPress={() => openText('validFrom', 'Valid from', 'date')} />
          <Cell label="Valid to" value={draft.validTo} onPress={() => openText('validTo', 'Valid to', 'date')} />
          <Pressable
            onPress={copyMakeAndSerialToAll}
            style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.copyBtnTxt}>Make and serial number same for all</Text>
          </Pressable>
          <Cell label="Barrel make" value={draft.barrelMake} onPress={() => openText('barrelMake', 'Barrel make')} />
          <Cell label="Barrel serial number" value={draft.barrelSerialNo} onPress={() => openText('barrelSerialNo', 'Barrel serial number')} />
          <Cell label="Receiver make" value={draft.receiverMake} onPress={() => openText('receiverMake', 'Receiver make')} />
          <Cell label="Receiver serial number" value={draft.receiverSerialNumber} onPress={() => openText('receiverSerialNumber', 'Receiver serial number')} />
          <Cell label="Frame make" value={draft.frameMake} onPress={() => openText('frameMake', 'Frame make')} />
          <Cell label="Frame serial number" value={draft.frameSerialNumber} onPress={() => openText('frameSerialNumber', 'Frame serial number')} />
          <ButtonSave
            onPress={handleSave}
            disabled={!hasUnsavedChanges}
            style={styles.saveButton}
          />
        </PageScrollView>
      </View>

      {previewVisible ? (
        <Modal visible transparent animationType="fade" onRequestClose={closePreviewModal}>
          <View style={styles.previewBackdrop}>
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Licence photos</Text>
              <Text style={styles.previewMeta}>
                {previewDocs.length === 1
                  ? 'Showing 1 captured photo'
                  : `Showing ${previewDocs.length} captured photos`}
              </Text>
              <ScrollView
                style={styles.previewScroll}
                contentContainerStyle={[styles.previewScrollContent, { paddingBottom: 4 + insets.bottom }]}
              >
                {previewDocs.map(doc => {
                  const state = previewState[doc.id];
                  const mime = (state?.mime ?? doc.mime ?? '').toLowerCase();
                  const isPdf = mime.includes('pdf');
                  const sideLabel =
                    doc.identityDocumentSide && SIDE_LABELS[doc.identityDocumentSide]
                      ? SIDE_LABELS[doc.identityDocumentSide]
                      : doc.identityDocumentSide || 'Document';
                  return (
                    <View key={doc.id} style={styles.previewItem}>
                      <Text style={styles.previewItemTitle}>{sideLabel}</Text>
                      {doc.name ? (
                        <Text style={styles.previewHint} numberOfLines={2}>
                          {doc.name}
                        </Text>
                      ) : null}
                      {state?.loading ? (
                        <ActivityIndicator
                          size="large"
                          color={tones.teal.base}
                          style={styles.previewLoader}
                        />
                      ) : state?.uri && !isPdf ? (
                        <Image source={{ uri: state.uri }} style={styles.previewImage} resizeMode="contain" />
                      ) : (
                        <Text style={styles.previewErrorText}>
                          {state?.error ??
                            (isPdf
                              ? 'PDF previews are not supported. The file has been cached on your device.'
                              : 'Preview unavailable for this document.')}
                        </Text>
                      )}
                      {state?.uri && isPdf ? (
                        <Text style={styles.previewHint} numberOfLines={2}>
                          Cached file: {state.uri}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
              <Button
                label="Close"
                tone="grey"
                variant="ghost"
                onPress={closePreviewModal}
                style={styles.previewCloseButton}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {sheet?.type === 'text' && (
        <EditTextSheet
          visible
          title={sheet.title}
          initial={editingInitial}
          placeholder={sheet.title}
          onCancel={() => setSheet(null)}
          onSave={onSaveField}
          keyboardType={sheet.mask === 'date' ? 'numeric' : 'default'}
          mask={sheet.mask}
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
          onCancel={() => setSheet(null)}
          onPick={(value) => onPickType(value as Firearm['firearmType'])}
        />
      )}

      {sheet?.type === 'select' && sheet.key === 'firearmAction' && (
        <SelectSheet
          visible
          title={sheet.title}
          subtitle={actionSubtitle}
          options={ACTIONS.map(action => ({ value: action, label: action }))}
          selected={draft.firearmAction === 'NONE' ? undefined : (draft.firearmAction as any)}
          onCancel={() => setSheet(null)}
          onPick={(value) => onPickAction(value as Firearm['firearmAction'])}
        />
      )}

      {sheet?.type === 'section' && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSheet(null)}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={{ flex: 1 }} onPress={() => setSheet(null)} />
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{sheet.title}</Text>
              <View style={styles.pillsWrap}>
                {SECTION_OPTIONS.map((option) => {
                  const normalizedSection = draft.section || '';
                  const selected =
                    normalizedSection === option.value ||
                    normalizedSection === option.label;
                  return (
                    <Pressable
                      key={option.code}
                      onPress={() => onPickSection(option)}
                      accessibilityRole="button"
                      accessibilityLabel={`${option.code} ${option.label}`}
                      style={[styles.pill, selected && styles.pillSelected]}
                    >
                      <Text style={[styles.pillTxt, selected && styles.pillTxtSelected]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => setSheet(null)}
                style={styles.sheetCloseBtn}
                accessibilityRole="button"
              >
                <Text style={styles.sheetCloseBtnTxt}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    content: { gap: 10, paddingBottom: 32 },
    saveButton: { marginTop: 4 },
    ocrBanner: {
      marginBottom: 12,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    ocrBannerInfo: {
      backgroundColor: tones.blue.surface,
      borderColor: tones.blue.border,
    },
    ocrBannerText: { flex: 1, fontSize: 14, fontWeight: '600' },
    ocrBannerTextInfo: { color: tones.blue.onSurface },
    barcodeValue: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 16,
      color: tones.blue.onSurface,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Courier' }),
    },
    label: { color: tones.teal.base, marginBottom: 6, fontWeight: '700' },

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
    cellNone: {
      borderColor: tones.orange.base,
    },
    value: { fontSize: 16, color: neutral.onSurface, fontWeight: '600' },
    valueNone: { color: tones.orange.base },
    placeholder: { color: neutral.border, fontWeight: '500' },
    chev: { fontSize: 24, color: neutral.border, marginLeft: 8 },

    copyBtn: {
      marginVertical: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tones.green.base,
      backgroundColor: tones.green.base,
    },
    copyBtnPressed: {
      borderColor: tones.green.emphasis,
      backgroundColor: tones.green.emphasis,
    },
    copyBtnTxt: { color: tones.green.onBase, fontWeight: '700' },
    previewBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    previewCard: {
      width: '100%',
      maxWidth: 420,
      maxHeight: 520,
      borderRadius: 16,
      backgroundColor: neutral.onBase,
      padding: 20,
      gap: 12,
      shadowColor: 'rgba(0,0,0,0.2)',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    previewTitle: { fontSize: 18, fontWeight: '700', color: neutral.onSurface, textAlign: 'center' },
    previewMeta: { fontSize: 14, color: neutral.base, textAlign: 'center' },
    previewScroll: { maxHeight: 360 },
    previewScrollContent: { gap: 16, paddingVertical: 4 },
    previewItem: { gap: 8 },
    previewItemTitle: { fontSize: 16, fontWeight: '600', color: neutral.onSurface, textAlign: 'center' },
    previewImage: {
      width: '100%',
      height: 280,
      borderRadius: 12,
      backgroundColor: neutral.surface,
    },
    previewLoader: { marginVertical: 24 },
    previewErrorText: {
      fontSize: 14,
      color: tones.red.onSurface,
      textAlign: 'center',
      marginVertical: 16,
    },
    previewHint: { fontSize: 12, color: neutral.base, textAlign: 'center' },
    previewCloseButton: { marginTop: 8 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: neutral.onBase, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 16 },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
    },
    pillSelected: { backgroundColor: tones.teal.surface, borderColor: tones.teal.border },
    pillTxt: { color: neutral.onSurface, fontWeight: '600' },
    pillTxtSelected: { color: tones.teal.onSurface },
    sheetCloseBtn: {
      marginTop: 4,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: neutral.border,
      alignItems: 'center',
    },
    sheetCloseBtnTxt: { color: neutral.onSurface, fontWeight: '700' },
  });
