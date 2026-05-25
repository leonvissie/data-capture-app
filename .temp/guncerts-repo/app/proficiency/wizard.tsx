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
import ButtonSave from '../../src/components/ButtonSave';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import { useTones } from '../../src/theme/tones';
import { CompetencyCategory, Document, Profile, Proficiency, ProficiencyDocument, UserPrefs } from '../../src/data/types';
import { ensureUserPrefs, saveUserPrefs, persist, persistAsync, touch, withMeta } from '../../src/data/repo';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import { categoryLabel } from '../../src/utils/categoryLabel';
import { rasterizePdf } from '../../src/pdf/rasterizer';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { base64ToUint8 } from '../../src/pdf/utils';
import { maskDateYYYYMMDD } from '../../src/utils/dateInput';
import {
  buildWizardBlockingResult,
  showWizardBlockingAlert,
  type WizardBlockingIssue,
} from '../../src/utils/wizardBlockingValidation';
import { sharedRequirementDefaultsByCode } from '../../src/policy/shared/commonDocuments';

type ProficiencyDocKey =
  | 'trainingCert1'
  | 'trainingCert2'
  | 'trainingCert3'
  | 'trainingCert4'
  | 'knowledgeOfAct'
  | 'handleUse1'
  | 'handleUse2'
  | 'handleUse3'
  | 'handleUse4';
type ProficiencyDocSection = 'proficiency' | 'results';
type ProficiencyDocMeta = { issuedAt: string; serialNumber: string };

type DocConfig = {
  key: ProficiencyDocKey;
  requirementCode: string;
  kind: ProficiencyDocument;
  label: string;
  description?: string;
  section: ProficiencyDocSection;
  requiresCategories?: boolean;
};

const DOC_CONFIGS: DocConfig[] = [
  {
    key: 'trainingCert1',
    requirementCode: 'PROFICIENCY_HANDGUN',
    kind: 'PROFICIENCY_HANDGUN',
    label: 'Proficiency cert 1',
    description: 'Upload a proficiency training certificate and select the covered competency categories.',
    section: 'proficiency',
    requiresCategories: true,
  },
  {
    key: 'trainingCert2',
    requirementCode: 'PROFICIENCY_RIFLE',
    kind: 'PROFICIENCY_RIFLE',
    label: 'Proficiency cert 2',
    description: 'Optional additional certificate from the same training provider.',
    section: 'proficiency',
    requiresCategories: true,
  },
  {
    key: 'trainingCert3',
    requirementCode: 'PROFICIENCY_SHOTGUN',
    kind: 'PROFICIENCY_SHOTGUN',
    label: 'Proficiency cert 3',
    description: 'Optional additional certificate from the same training provider.',
    section: 'proficiency',
    requiresCategories: true,
  },
  {
    key: 'trainingCert4',
    requirementCode: 'PROFICIENCY_HANDMACHINECARBINE',
    kind: 'PROFICIENCY_HANDMACHINECARBINE',
    label: 'Proficiency cert 4',
    description: 'Optional additional certificate from the same training provider.',
    section: 'proficiency',
    requiresCategories: true,
  },
  {
    key: 'knowledgeOfAct',
    requirementCode: 'STATEMENT_OF_RESULTS_KNOWLEDGE',
    kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE',
    label: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_KNOWLEDGE?.label ?? 'Knowledge of the Firearms Control'),
    description: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_KNOWLEDGE?.description ?? ''),
    section: 'results',
  },
  {
    key: 'handleUse1',
    requirementCode: 'STATEMENT_OF_RESULTS_HANDLE_USE_1',
    kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1',
    label: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_1?.label ?? 'Handle and use results 1'),
    description: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_1?.description ?? ''),
    section: 'results',
    requiresCategories: true,
  },
  {
    key: 'handleUse2',
    requirementCode: 'STATEMENT_OF_RESULTS_HANDLE_USE_2',
    kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_2',
    label: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_2?.label ?? 'Handle and use results 2'),
    description: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_2?.description ?? ''),
    section: 'results',
    requiresCategories: true,
  },
  {
    key: 'handleUse3',
    requirementCode: 'STATEMENT_OF_RESULTS_HANDLE_USE_3',
    kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_3',
    label: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_3?.label ?? 'Handle and use results 3'),
    description: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_3?.description ?? ''),
    section: 'results',
    requiresCategories: true,
  },
  {
    key: 'handleUse4',
    requirementCode: 'STATEMENT_OF_RESULTS_HANDLE_USE_4',
    kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_4',
    label: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_4?.label ?? 'Handle and use results 4'),
    description: String((sharedRequirementDefaultsByCode as any).STATEMENT_OF_RESULTS_HANDLE_USE_4?.description ?? ''),
    section: 'results',
    requiresCategories: true,
  },
];

const DOC_ORDER = DOC_CONFIGS.map((config) => config.key);
const DOCS_BY_SECTION: Record<ProficiencyDocSection, DocConfig[]> = {
  proficiency: DOC_CONFIGS.filter((cfg) => cfg.section === 'proficiency'),
  results: DOC_CONFIGS.filter((cfg) => cfg.section === 'results'),
};
const COMPETENCY_CATEGORIES: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const CERT_SLOT_KEYS: ProficiencyDocKey[] = ['trainingCert1', 'trainingCert2', 'trainingCert3', 'trainingCert4'];
const TRAINING_DOC_KIND_BY_INDEX: ProficiencyDocument[] = [
  'PROFICIENCY_HANDGUN',
  'PROFICIENCY_RIFLE',
  'PROFICIENCY_SHOTGUN',
  'PROFICIENCY_HANDMACHINECARBINE',
];

const initialDocs: Record<ProficiencyDocKey, Document | null> = {
  trainingCert1: null,
  trainingCert2: null,
  trainingCert3: null,
  trainingCert4: null,
  knowledgeOfAct: null,
  handleUse1: null,
  handleUse2: null,
  handleUse3: null,
  handleUse4: null,
};
const initialDocMeta: Record<ProficiencyDocKey, ProficiencyDocMeta> = {
  trainingCert1: { issuedAt: '', serialNumber: '' },
  trainingCert2: { issuedAt: '', serialNumber: '' },
  trainingCert3: { issuedAt: '', serialNumber: '' },
  trainingCert4: { issuedAt: '', serialNumber: '' },
  knowledgeOfAct: { issuedAt: '', serialNumber: '' },
  handleUse1: { issuedAt: '', serialNumber: '' },
  handleUse2: { issuedAt: '', serialNumber: '' },
  handleUse3: { issuedAt: '', serialNumber: '' },
  handleUse4: { issuedAt: '', serialNumber: '' },
};

const normalizeRotation = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
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
    logger.warn('[proficiency/wizard] Failed to read PDF page count', error);
    return null;
  }
}

type Params = {
  returnTo?: string | string[];
  completeReturnTo?: string | string[];
  proficiencyId?: string | string[];
  nav?: string | string[];
};

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile?scroll=proficiencies';

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

export default function ProficiencyWizardScreen() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const params = useLocalSearchParams<Params>();
  const scrollRef = useRef<ScrollView | null>(null);
  const cardPositionsRef = useRef<Partial<Record<ProficiencyDocKey, number>>>({});
  const sectionCardYRef = useRef<Partial<Record<ProficiencyDocSection, number>>>({});
  const sectionGridYRef = useRef<Partial<Record<ProficiencyDocSection, number>>>({});
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const deletedDocIdsRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);
  const trainingProviderInputRef = useRef<TextInput | null>(null);

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
  const proficiencyIdParam = useMemo(() => {
    const raw = Array.isArray(params.proficiencyId) ? params.proficiencyId[0] : params.proficiencyId;
    const trimmed = `${raw ?? ''}`.trim();
    return trimmed || null;
  }, [params.proficiencyId]);

  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing...');
  const [trainingProviderName, setTrainingProviderName] = useState('');
  const [holderProfileId, setHolderProfileId] = useState<string | null>(null);
  const [proficiencyId, setProficiencyId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<ProficiencyDocKey, Document | null>>(initialDocs);
  const [pendingRotationByDoc, setPendingRotationByDoc] = useState<Partial<Record<ProficiencyDocKey, number>>>({});
  const [categoriesByDocKey, setCategoriesByDocKey] = useState<Partial<Record<ProficiencyDocKey, CompetencyCategory[]>>>({});
  const [docMetaByKey, setDocMetaByKey] = useState<Record<ProficiencyDocKey, ProficiencyDocMeta>>(initialDocMeta);
  const scrollRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousDocIdsRef = useRef<Partial<Record<ProficiencyDocKey, string | null>>>({});
  const baselineSignatureRef = useRef<string | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [showBlockingIssues, setShowBlockingIssues] = useState(false);
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);

  const signatureForState = useCallback(
    (
      name: string,
      stateDocs: Record<ProficiencyDocKey, Document | null>,
      stateDocMeta: Record<ProficiencyDocKey, ProficiencyDocMeta>,
      stateCategoriesByDocKey: Partial<Record<ProficiencyDocKey, CompetencyCategory[]>>,
    ) => {
      const docSig = (doc: Document | null) => (doc ? `${doc.id}:${doc.updatedAt ?? doc.createdAt ?? ''}` : '');
      const metaSig = (key: ProficiencyDocKey) =>
        `${stateDocMeta[key]?.issuedAt?.trim() ?? ''}:${stateDocMeta[key]?.serialNumber?.trim() ?? ''}`;
      const categoriesSig = (key: ProficiencyDocKey) => {
        const categories = stateCategoriesByDocKey[key] ?? [];
        if (!categories.length) return '';
        return [...categories].sort().join(',');
      };
      return [
        name.trim().toLowerCase(),
        ...DOC_ORDER.map((key) => docSig(stateDocs[key] ?? null)),
        ...DOC_ORDER.map((key) => metaSig(key)),
        ...DOC_ORDER.map((key) => categoriesSig(key)),
      ].join('|');
    },
    [],
  );

  const currentSignature = useMemo(
    () => signatureForState(trainingProviderName, docs, docMetaByKey, categoriesByDocKey),
    [categoriesByDocKey, docMetaByKey, docs, signatureForState, trainingProviderName],
  );

  const scrollToDoc = useCallback((key: ProficiencyDocKey) => {
    const y = cardPositionsRef.current[key];
    if (typeof y !== 'number') return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, []);

  const scrollToDocWithRetry = useCallback((key: ProficiencyDocKey, attempt = 0) => {
    const y = cardPositionsRef.current[key];
    if (typeof y === 'number' && Number.isFinite(y) && y >= 0) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
      return;
    }
    if (attempt >= 14) return;
    if (scrollRetryTimeoutRef.current) {
      clearTimeout(scrollRetryTimeoutRef.current);
    }
    scrollRetryTimeoutRef.current = setTimeout(() => {
      scrollToDocWithRetry(key, attempt + 1);
    }, 40);
  }, []);

  const scrollToNextDoc = useCallback((current: ProficiencyDocKey) => {
    const idx = DOC_ORDER.indexOf(current);
    const next = idx >= 0 ? DOC_ORDER[idx + 1] : null;
    if (next) {
      scrollToDoc(next);
      return;
    }
    scrollRef.current?.scrollToEnd?.({ animated: true });
  }, [scrollToDoc]);

  useEffect(() => {
    const profile = listByType<Profile>('Profile')[0];
    if (profile) {
      setHolderProfileId(profile.id);
      const prefs = ensureUserPrefs(profile.id);
      setUserPrefs(prefs);
    }
  }, []);

  const disablePhotoLibraryAlert = useCallback(() => {
    if (!holderProfileId) return;
    setUserPrefs((prev) => {
      const base = prev ?? ensureUserPrefs(holderProfileId);
      const updated = { ...base, showPhotoLibraryAlert: false };
      saveUserPrefs(updated);
      return updated;
    });
  }, [holderProfileId]);

  useEffect(() => {
    if (!proficiencyIdParam) return;
    const existing = getById<Proficiency>(proficiencyIdParam);
    if (!existing) return;
    setProficiencyId(existing.id);
    setTrainingProviderName(existing.trainingProviderName ?? '');

    const allDocs = listByType<Document>('Document').filter(
      (doc) => doc.parentType === 'Proficiency' && doc.parentId === existing.id,
    );
    const nextDocs: Record<ProficiencyDocKey, Document | null> = { ...initialDocs };
    const byKind = (kind: ProficiencyDocument) =>
      allDocs.find(
        (doc) =>
          (doc.kind as ProficiencyDocument) === kind ||
          (doc.requirementCode ?? '').toUpperCase() === kind,
      ) || null;

    DOC_CONFIGS.forEach((config) => {
      nextDocs[config.key] = byKind(config.kind);
    });

    // Backward compatibility: map old single-category proficiency docs to training cert slots.
    if (!nextDocs.trainingCert1 && !nextDocs.trainingCert2 && !nextDocs.trainingCert3 && !nextDocs.trainingCert4) {
      const legacyByCategory = [
        byKind('PROFICIENCY_HANDGUN'),
        byKind('PROFICIENCY_RIFLE'),
        byKind('PROFICIENCY_SHOTGUN'),
        byKind('PROFICIENCY_HANDMACHINECARBINE'),
      ].filter(Boolean) as Document[];
      legacyByCategory.forEach((doc, index) => {
        const slot = CERT_SLOT_KEYS[index];
        if (!slot) return;
        nextDocs[slot] = doc;
      });
    }

    const categoryMap: Partial<Record<ProficiencyDocKey, CompetencyCategory[]>> = {};
    const metaMap: Record<ProficiencyDocKey, ProficiencyDocMeta> = { ...initialDocMeta };
    const certificateEntries = Array.isArray(existing.proficiencyCertificates) ? existing.proficiencyCertificates : [];
    DOC_CONFIGS.forEach((config, index) => {
      const entry =
        (existing.proficiencyDocumentIds ?? []).find((item) => item.kind === config.kind) ??
        (config.section === 'proficiency' ? certificateEntries[index] : undefined);
      if (entry?.categories?.length) categoryMap[config.key] = entry.categories;
      metaMap[config.key] = {
        issuedAt: `${entry?.issuedAt ?? ''}`.trim(),
        serialNumber: `${entry?.serialNumber ?? ''}`.trim(),
      };
    });

    setDocs(nextDocs);
    setCategoriesByDocKey(categoryMap);
    setDocMetaByKey(metaMap);
    baselineSignatureRef.current = signatureForState(
      existing.trainingProviderName ?? '',
      nextDocs,
      metaMap,
      categoryMap,
    );
    setBaselineReady(true);
  }, [proficiencyIdParam, signatureForState]);

  useEffect(() => {
    if (baselineReady) return;
    if (proficiencyIdParam) return;
    baselineSignatureRef.current = signatureForState(
      trainingProviderName,
      docs,
      docMetaByKey,
      categoriesByDocKey,
    );
    setBaselineReady(true);
  }, [
    baselineReady,
    categoriesByDocKey,
    docMetaByKey,
    docs,
    proficiencyIdParam,
    signatureForState,
    trainingProviderName,
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
      const next: Partial<Record<ProficiencyDocKey, number>> = { ...prev };
      let changed = false;
      DOC_ORDER.forEach((key) => {
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
  }, [docs]);

  useEffect(() => {
    return () => {
      if (scrollRetryTimeoutRef.current) {
        clearTimeout(scrollRetryTimeoutRef.current);
      }
    };
  }, []);

  const ensureProficiencyId = useCallback(() => {
    if (proficiencyId) return proficiencyId;
    const nextId = createRandomId('profy');
    setProficiencyId(nextId);
    return nextId;
  }, [proficiencyId]);

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

  const applyDocMetadata = useCallback(
    (
      doc: Document,
      params: {
        kind: ProficiencyDocument;
        label: string;
        parentId: string;
        relatedId?: string;
        relatedLabel?: string;
      },
    ) => {
      const updated = touch({
        ...doc,
        kind: params.kind,
        name: params.label,
        requirementCode: params.kind,
        requirementRelatedId: params.relatedId,
        requirementRelatedLabel: params.relatedLabel,
        parentType: 'Proficiency',
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

  const saveProficiencyDocument = useCallback(
    async (key: ProficiencyDocKey, asset: WizardAsset) => {
      const config = DOC_CONFIGS.find((item) => item.key === key);
      if (!config) return;
      const parentId = ensureProficiencyId();
      const label = `${trainingProviderName.trim() || 'Proficiency'} - ${config.label.replace(' (optional)', '')}`;
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'Proficiency',
          parentId,
          holderProfileId: ensureProfileId(),
          label,
          kind: config.kind,
          createDocumentId: () => createRandomId('doc'),
        },
        existing: docs[key] ?? undefined,
      });
      const updated = applyDocMetadata(document, {
        kind: config.kind,
        label,
        parentId,
        relatedId: parentId,
        relatedLabel: trainingProviderName.trim() || 'Proficiency',
      });
      setDocs((prev) => ({ ...prev, [key]: updated }));
      if (createdNew) {
        createdDocIdsRef.current.add(updated.id);
      } else {
        createdDocIdsRef.current.delete(updated.id);
      }
    },
    [applyDocMetadata, docs, ensureProficiencyId, ensureProfileId, trainingProviderName],
  );

  const queueDocRotation = useCallback((key: ProficiencyDocKey) => {
    setPendingRotationByDoc((prev) => ({ ...prev, [key]: (prev[key] ?? 0) - 90 }));
  }, []);

  const applyPendingRotations = useCallback(async () => {
    const updatedById = new Map<string, Document>();
    for (const key of DOC_ORDER) {
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
    DOC_ORDER.forEach((key) => {
      const current = nextDocs[key];
      if (current && updatedById.has(current.id)) {
        nextDocs[key] = updatedById.get(current.id)!;
      }
    });
    setDocs(nextDocs);
    setPendingRotationByDoc({});
    return nextDocs;
  }, [docs, pendingRotationByDoc]);

  const withProcessing = useCallback(async (label: string, fn: () => Promise<void>) => {
    setProcessingLabel(label);
    setProcessing(true);
    await nextFrame();
    try {
      await fn();
    } finally {
      setProcessingLabel('Processing...');
      setProcessing(false);
    }
  }, []);

  const handleCapture = useCallback(async (key: ProficiencyDocKey) => {
    if (processing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    const ok = await ensureCameraPermission({
      title: 'Camera access needed',
      settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
    });
    if (!ok) return;

    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }
      const result = await ImagePicker.launchCameraAsync(pickerOptions as any);
      if (result.canceled || !result.assets?.length) return;
      await withProcessing('Uploading proficiency document', async () => {
        const asset = await prepareWizardImage(result.assets[0]);
        await saveProficiencyDocument(key, asset);
      });
    } catch (error: any) {
      Alert.alert('Unable to use photo', error?.message ?? 'Something went wrong while capturing the photo.');
    }
  }, [processing, saveProficiencyDocument, scrollToNextDoc, withProcessing]);

  const pickFromLibrary = useCallback(async (key: ProficiencyDocKey) => {
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

    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions as any);
      if (result.canceled || !result.assets?.length) return;
      await withProcessing('Uploading proficiency document', async () => {
        const asset = await prepareWizardImage(result.assets[0]);
        await saveProficiencyDocument(key, asset);
      });
    } catch (error: any) {
      Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
    }
  }, [disablePhotoLibraryAlert, processing, saveProficiencyDocument, scrollToNextDoc, userPrefs?.showPhotoLibraryAlert, withProcessing]);

  const handleUpload = useCallback(async (key: ProficiencyDocKey) => {
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

    await withProcessing('Uploading proficiency document', async () => {
      if (isPdf) {
        const pageCount = await getPdfPageCount(asset.uri);
        if (pageCount && pageCount > 1) {
          Alert.alert(
            'Only first page used',
            'This PDF has multiple pages. Only the first page will be used. If the document you need is on another page, use the camera or photo library.',
          );
        }
        const rasterized = await rasterizePdf(asset.uri, 150);
        try {
          const firstPage = rasterized.pages[0];
          if (!firstPage) return;
          const pdfAsset = {
            uri: firstPage.uri,
            mimeType: 'image/jpeg',
            fileName: 'proficiency.pdf.jpg',
            name: 'proficiency.pdf.jpg',
          };
          await saveProficiencyDocument(key, pdfAsset as any);
        } finally {
          await rasterized.cleanup().catch(() => {});
        }
        return;
      }

      const prepared = await prepareWizardImage(asset as any);
      await saveProficiencyDocument(key, prepared as any);
    });
  }, [processing, saveProficiencyDocument, withProcessing]);

  const handleDelete = useCallback(async (key: ProficiencyDocKey) => {
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
      setDocs((prev) => ({ ...prev, [key]: null }));
      setDocMetaByKey((prev) => ({ ...prev, [key]: { issuedAt: '', serialNumber: '' } }));
    } catch (error: any) {
      logger.warn('[proficiency/wizard] Failed to delete document', error);
      Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
    } finally {
      setProcessing(false);
    }
  }, [docs, processing]);

  const cleanupDocuments = useCallback(() => {
    setDocs(initialDocs);
    setDocMetaByKey(initialDocMeta);
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

  const goReturn = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [navCtx, returnToPath, router]);

  const hasProviderName = trainingProviderName.trim().length > 0;
  const hasAtLeastOneDocument = useMemo(
    () => DOC_ORDER.some((key) => !!docs[key]),
    [docs],
  );
  const hasChanges = baselineReady && currentSignature !== baselineSignatureRef.current;
  const hasPendingRotation = useMemo(
    () => DOC_ORDER.some((key) => normalizeRotation(pendingRotationByDoc[key] ?? 0) !== 0),
    [pendingRotationByDoc],
  );
  const missingItems = useMemo(() => {
    const items: string[] = [];
    if (!hasProviderName) items.push('Training provider name');
    if (!hasAtLeastOneDocument) items.push('At least one proficiency document');
    DOC_CONFIGS.forEach((config) => {
      if (!config.requiresCategories) return;
      if (!docs[config.key]) return;
      const categories = categoriesByDocKey[config.key] ?? [];
      if (!categories.length) items.push(`${config.label}: competency categories`);
    });
    return items;
  }, [categoriesByDocKey, docs, hasAtLeastOneDocument, hasProviderName]);
  const captureStatusStyle =
    missingItems.length === 0
      ? [styles.captureStatusBox, styles.captureStatusSuccess]
      : [styles.captureStatusBox, styles.captureStatusWarning];
  const canSave = (hasChanges || hasPendingRotation) && !processing;
  const visibleResultConfigs = useMemo(() => {
    const results = DOCS_BY_SECTION.results;
    const knowledge = results.find((cfg) => cfg.key === 'knowledgeOfAct');
    const h1 = results.find((cfg) => cfg.key === 'handleUse1');
    const h2 = results.find((cfg) => cfg.key === 'handleUse2');
    const h3 = results.find((cfg) => cfg.key === 'handleUse3');
    const h4 = results.find((cfg) => cfg.key === 'handleUse4');
    const visible: DocConfig[] = [];
    if (knowledge) visible.push(knowledge);
    if (h1) visible.push(h1);
    if ((docs.handleUse1 && h2) || docs.handleUse2) visible.push(h2!);
    if ((docs.handleUse2 && h3) || docs.handleUse3) visible.push(h3!);
    if ((docs.handleUse3 && h4) || docs.handleUse4) visible.push(h4!);
    return visible;
  }, [docs.handleUse1, docs.handleUse2, docs.handleUse3, docs.handleUse4]);
  const visibleTrainingConfigs = useMemo(() => {
    const training = DOCS_BY_SECTION.proficiency;
    const t1 = training.find((cfg) => cfg.key === 'trainingCert1');
    const t2 = training.find((cfg) => cfg.key === 'trainingCert2');
    const t3 = training.find((cfg) => cfg.key === 'trainingCert3');
    const t4 = training.find((cfg) => cfg.key === 'trainingCert4');
    const visible: DocConfig[] = [];
    if (t1) visible.push(t1);
    if ((docs.trainingCert1 && t2) || docs.trainingCert2) visible.push(t2!);
    if ((docs.trainingCert2 && t3) || docs.trainingCert3) visible.push(t3!);
    if ((docs.trainingCert3 && t4) || docs.trainingCert4) visible.push(t4!);
    return visible;
  }, [docs.trainingCert1, docs.trainingCert2, docs.trainingCert3, docs.trainingCert4]);

  const focusIssue = useCallback((issueKey?: string) => {
    if (!issueKey) return;
    if (issueKey === 'trainingProviderName') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      requestAnimationFrame(() => trainingProviderInputRef.current?.focus());
      return;
    }
    if (issueKey.startsWith('doc:')) {
      const key = issueKey.replace(/^doc:/, '') as ProficiencyDocKey;
      scrollToDocWithRetry(key);
    }
  }, [scrollToDocWithRetry]);

  const blockingValidation = useMemo(() => {
    const issues: WizardBlockingIssue[] = [];
    if (!hasProviderName) {
      issues.push({
        key: 'trainingProviderName',
        label: 'Training provider name',
        kind: 'missing',
        message: 'Enter the training provider name.',
      });
    }
    if (!hasAtLeastOneDocument) {
      issues.push({
        key: `doc:${DOC_ORDER[0]}`,
        label: 'Proficiency document',
        kind: 'missing',
        message: 'Add at least one proficiency document.',
      });
    }
    DOC_CONFIGS.forEach((config) => {
      if (!config.requiresCategories) return;
      if (!docs[config.key]) return;
      const categories = categoriesByDocKey[config.key] ?? [];
      if (categories.length) return;
      issues.push({
        key: `doc:${config.key}`,
        label: `${config.label}: competency categories`,
        kind: 'missing',
        message: `Select at least one competency category for ${config.label}.`,
      });
    });
    return buildWizardBlockingResult(issues);
  }, [categoriesByDocKey, docs, hasAtLeastOneDocument, hasProviderName]);
  const statusListItems = showBlockingIssues && blockingValidation.hasBlockingIssues
    ? blockingValidation.issues.map((issue) => issue.label)
    : missingItems;

  const handleSave = useCallback(async () => {
    setShowBlockingIssues(true);
    if (blockingValidation.hasBlockingIssues) {
      showWizardBlockingAlert(blockingValidation, {
        title: 'Unable to save',
        intro: 'Please correct the following before saving:',
        onPressOk: () => focusIssue(blockingValidation.firstIssueKey),
      });
      return;
    }
    const name = trainingProviderName.trim();

    const profileId = ensureProfileId();
    if (!profileId) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }

    setProcessing(true);
    try {
      const rotatedDocs = await applyPendingRotations();
      const id = ensureProficiencyId();
      const existing = getById<Proficiency>(id);

      const syncedDocs = Object.entries(rotatedDocs)
        .map(([key, doc]) => ({ key, doc }))
        .filter(({ doc }) => !!doc)
        .map(({ key, doc }) => {
          const config = DOC_CONFIGS.find((item) => item.key === key);
          if (!config) return null;
          const label = `${name} - ${config.label.replace(' (optional)', '')}`;
          return applyDocMetadata(doc as Document, {
            kind: config.kind,
            label,
            parentId: id,
            relatedId: id,
            relatedLabel: name,
          });
        })
        .filter(Boolean) as Document[];

      const proficiencyDocumentIds = syncedDocs.map((doc) => {
        const config = DOC_CONFIGS.find((item) => item.kind === (doc.kind as ProficiencyDocument));
        const key = config?.key;
        return {
          kind: doc.kind as ProficiencyDocument,
          documentId: doc.id,
          issuedAt: key ? (docMetaByKey[key]?.issuedAt?.trim() || undefined) : undefined,
          serialNumber: key ? (docMetaByKey[key]?.serialNumber?.trim() || undefined) : undefined,
          categories:
            config?.requiresCategories && config.key
              ? (categoriesByDocKey[config.key] ?? [])
              : undefined,
        };
      });
      const proficiencyCertificates = syncedDocs
        .filter((doc) => TRAINING_DOC_KIND_BY_INDEX.includes(doc.kind as ProficiencyDocument))
        .map((doc) => {
          const config = DOC_CONFIGS.find((item) => item.kind === (doc.kind as ProficiencyDocument));
          const key = config?.key;
          return {
            kind: doc.kind as 'PROFICIENCY_HANDGUN' | 'PROFICIENCY_RIFLE' | 'PROFICIENCY_SHOTGUN' | 'PROFICIENCY_HANDMACHINECARBINE',
            documentId: doc.id,
            issuedAt: key ? (docMetaByKey[key]?.issuedAt?.trim() || undefined) : undefined,
            serialNumber: key ? (docMetaByKey[key]?.serialNumber?.trim() || undefined) : undefined,
            categories: key ? (categoriesByDocKey[key] ?? []) : [],
          };
        });

      const next = existing
        ? touch({
            ...existing,
            trainingProviderName: name,
            holderProfileId: existing.holderProfileId ?? profileId,
            proficiencyDocumentIds,
            proficiencyCertificates,
          } as Proficiency)
        : withMeta<Proficiency>({
            id,
            type: 'Proficiency',
            trainingProviderName: name,
            holderProfileId: profileId,
            proficiencyDocumentIds,
            proficiencyCertificates,
          } as Proficiency);

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
      baselineSignatureRef.current = signatureForState(name, rotatedDocs, docMetaByKey, categoriesByDocKey);
      setBaselineReady(true);
      savedRef.current = true;
      setShowBlockingIssues(false);
      deletedDocIdsRef.current.clear();
      createdDocIdsRef.current.clear();
      goReturn();
    } catch (error: any) {
      logger.warn('[proficiency/wizard] Failed to save proficiency', error);
      Alert.alert('Unable to save', error?.message ?? 'Something went wrong while saving your proficiency.');
    } finally {
      setProcessing(false);
    }
  }, [applyDocMetadata, applyPendingRotations, blockingValidation, categoriesByDocKey, docMetaByKey, ensureProfileId, ensureProficiencyId, focusIssue, goReturn, signatureForState, trainingProviderName]);

  const handleClose = useCallback(() => {
    if (hasChanges || hasPendingRotation) {
      const actions: AlertButton[] = [
        { text: 'Continue editing', style: 'cancel' as const },
        {
          text: 'Discard',
          style: 'destructive' as const,
          onPress: () => {
            cleanupDocuments();
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
    cleanupDocuments();
    goReturn();
  }, [canSave, cleanupDocuments, goReturn, handleSave, hasChanges, hasPendingRotation]);

  const renderCaptureCard = (config: DocConfig) => {
    const key = config.key;
    const doc = docs[key];
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const missingCategories =
      showBlockingIssues &&
      !!doc &&
      !!config.requiresCategories &&
      (categoriesByDocKey[key] ?? []).length === 0;
    return (
      <View
        key={key}
        onLayout={(event) => {
          const section = DOC_CONFIGS.find((cfg) => cfg.key === key)?.section;
          if (!section) return;
          const gridY = sectionGridYRef.current[section];
          if (typeof gridY !== 'number' || !Number.isFinite(gridY)) return;
          cardPositionsRef.current[key] = gridY + event.nativeEvent.layout.y;
        }}
      >
        <PhotoCaptureCard
          isError={(showBlockingIssues && !hasAtLeastOneDocument && !doc) || missingCategories}
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
          footerContent={
            doc ? (
              <View style={styles.docDetailCard}>
                <View style={styles.docMetaBlock}>
                  <Text style={styles.docMetaLabel}>Date issued</Text>
                  <TextInput
                    value={docMetaByKey[key]?.issuedAt ?? ''}
                    onChangeText={(value) =>
                      setDocMetaByKey((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], issuedAt: maskDateYYYYMMDD(value) },
                      }))
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={neutral.border}
                    style={styles.docMetaInput}
                    autoCapitalize="none"
                    keyboardType="number-pad"
                  />
                  <Text style={styles.docMetaLabel}>Serial number</Text>
                  <TextInput
                    value={docMetaByKey[key]?.serialNumber ?? ''}
                    onChangeText={(value) =>
                      setDocMetaByKey((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], serialNumber: value.toUpperCase() },
                      }))
                    }
                    placeholder="e.g. TRN-12345"
                    placeholderTextColor={neutral.border}
                    style={styles.docMetaInput}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
                {config.requiresCategories ? (
                  <>
                    <View style={styles.metaDivider} />
                    <Text style={[styles.categoriesLabel, missingCategories ? styles.categoriesLabelError : null]}>
                      Competency categories
                    </Text>
                    <View style={styles.categoriesPills}>
                      {COMPETENCY_CATEGORIES.map((category) => {
                        const selected = (categoriesByDocKey[key] ?? []).includes(category);
                        return (
                          <Pressable
                            key={`${key}-${category}`}
                            onPress={() =>
                              setCategoriesByDocKey((prev) => {
                                const current = new Set(prev[key] ?? []);
                                if (current.has(category)) current.delete(category);
                                else current.add(category);
                                return { ...prev, [key]: Array.from(current) };
                              })
                            }
                            style={[
                              styles.categoryPill,
                              selected ? styles.categoryPillSelected : null,
                              missingCategories ? styles.categoryPillError : null,
                            ]}
                          >
                            <Text style={[styles.categoryPillText, selected ? styles.categoryPillTextSelected : null]}>
                              {categoryLabel(category)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null
          }
        />
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Proficiency"
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!canSave}
          style={styles.header}
        />
        <PageScrollView ref={scrollRef} contentContainerStyle={styles.captureContent}>
          <View style={styles.intro}>
            <Text style={styles.lead}>
              Capture the proficiency documents issued by one training provider in this entry. If another provider issued any of your other proficiencies, add a separate proficiency entry for that provider from the Profile tab.
            </Text>
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Training provider name</Text>
            <Text style={styles.inputHelp}>
              Use one proficiency entry per training provider.
            </Text>
            <TextInput
              ref={trainingProviderInputRef}
              value={trainingProviderName}
              onChangeText={setTrainingProviderName}
              placeholder="e.g. Proficiency Training Centre"
              style={[styles.input, showBlockingIssues && !hasProviderName && styles.inputError]}
              placeholderTextColor={neutral.border}
              autoCapitalize="words"
            />
          </View>

          <View
            style={styles.trainingCard}
            onLayout={(event) => {
              sectionCardYRef.current.proficiency = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.trainingCardTitle}>Training certs/Proficiencies</Text>
            <Text style={styles.trainingCardHelp}>
              Add one or more proficiency documents issued by this training provider.
            </Text>
            <View
              style={styles.captureGrid}
              onLayout={(event) => {
                const sectionY = sectionCardYRef.current.proficiency ?? 0;
                sectionGridYRef.current.proficiency = sectionY + event.nativeEvent.layout.y;
              }}
            >
              {visibleTrainingConfigs.map((cfg) => renderCaptureCard(cfg))}
            </View>
          </View>

          <View
            style={styles.trainingCard}
            onLayout={(event) => {
              sectionCardYRef.current.results = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.trainingCardTitle}>Statement of results</Text>
            <Text style={styles.trainingCardHelp}>
              Add knowledge and handle/use statements of results from this training provider.
            </Text>
            <View
              style={styles.captureGrid}
              onLayout={(event) => {
                const sectionY = sectionCardYRef.current.results ?? 0;
                sectionGridYRef.current.results = sectionY + event.nativeEvent.layout.y;
              }}
            >
              {visibleResultConfigs.map((cfg) => renderCaptureCard(cfg))}
            </View>
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
                <Text style={styles.captureStatusText}>All required details added.</Text>
              </View>
            )}
          </View>

          <View style={styles.saveWrap}>
            <ButtonSave
              onPress={handleSave}
              disabled={!canSave}
              loading={processing}
            />
          </View>
        </PageScrollView>

        <ProcessingBlocker visible={processing} label={processingLabel} />
      </View>
    </Screen>
  );
}

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: { marginBottom: 12, paddingHorizontal: 20 },
    captureContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
    intro: { marginBottom: 4, gap: 10 },
    lead: { fontSize: 14, lineHeight: 20, color: neutral.base },
    inputBlock: {
      gap: 6,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
    },
    inputLabel: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    inputHelp: {
      fontSize: 13,
      lineHeight: 18,
      color: neutral.base,
    },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      backgroundColor: tones.neutrals[100],
      color: neutral.onSurface,
    },
    inputError: {
      borderColor: tones.red.base,
    },
    trainingCard: {
      gap: 10,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
    },
    trainingCardTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    trainingCardHelp: {
      fontSize: 13,
      lineHeight: 18,
      color: neutral.base,
    },
    captureGrid: { gap: 12 },
    docDetailCard: {
      gap: 10,
      paddingTop: 2,
    },
    docMetaBlock: { gap: 6 },
    docMetaLabel: { fontSize: 13, fontWeight: '700', color: neutral.onSurface },
    docMetaInput: {
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      backgroundColor: tones.neutrals[100],
      color: neutral.onSurface,
    },
    metaDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: neutral.border,
      marginVertical: 2,
    },
    categoriesLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: tones.teal.base,
    },
    categoriesLabelError: {
      color: tones.orange.base,
    },
    categoriesPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryPill: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: tones.neutrals[100],
    },
    categoryPillSelected: {
      backgroundColor: tones.teal.surface,
      borderColor: tones.teal.border,
    },
    categoryPillError: {
      borderColor: tones.orange.base,
      backgroundColor: tones.orange.surface,
    },
    categoryPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: neutral.onSurface,
    },
    categoryPillTextSelected: {
      color: tones.teal.onSurface,
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
    saveWrap: { marginTop: 8 },
  });
