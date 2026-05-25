import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TextInput, Pressable, type AlertButton } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import Button from '../../src/components/Button';
import ButtonSave from '../../src/components/ButtonSave';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import { useTones } from '../../src/theme/tones';
import { Document, Profile, Safe, SafePhotoCategory, UserPrefs } from '../../src/data/types';
import { ensureUserPrefs, persist, saveUserPrefs, touch, withMeta } from '../../src/data/repo';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import { logger } from '@/src/utils/logger';
import { ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import HelpModal from '../../src/components/HelpModal';
import { useHelpModal } from '../../src/help';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import { useDemoDataResetGuard } from '../../src/demo/useDemoDataResetGuard';
import {
  buildWizardBlockingResult,
  showWizardBlockingAlert,
  type WizardBlockingIssue,
} from '../../src/utils/wizardBlockingValidation';

type SafeCaptureKey = 'closed' | 'open' | 'bolts' | 'serial' | 'sabs';

type CaptureOption = {
  key: SafeCaptureKey;
  label: string;
  category: SafePhotoCategory;
  hint: string;
};

const captureOptions: CaptureOption[] = [
  { key: 'closed', label: 'Closed (required)', category: 'CLOSED', hint: 'Full view of the safe while closed.' },
  { key: 'open', label: 'Open (required)', category: 'OPEN', hint: 'Empty interior view with the door open (empty for your security).' },
  { key: 'bolts', label: 'Bolts (recommended)', category: 'BOLTS', hint: 'Show mounting bolts or anchors.' },
  { key: 'serial', label: 'Serial number (recommended)', category: 'SERIAL', hint: 'Close-up of the serial/plate.' },
  { key: 'sabs', label: 'SABS certification (optional)', category: 'SABS', hint: 'Photo of the certification document, sticker or plate.' },
];
const requiredCaptureKeys: SafeCaptureKey[] = ['closed', 'open'];

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile';
const WIZARD_HELP_KEY = 'helpWizardSafe';
const annexAFieldMap = require('../../assets/fieldmap/518aAnnexA.json');

const safeDescriptionKeys = ['safeDescription1', 'safeDescription2', 'safeDescription3', 'safeDescription4'] as const;
const safeDescriptionMaxLens = safeDescriptionKeys.map((key) => {
  const fields = annexAFieldMap?.fields ?? [];
  const match = fields.find((field: any) => field?.key === key);
  return typeof match?.maxLen === 'number' ? match.maxLen : 0;
});
const safeDescriptionMaxTotal = safeDescriptionMaxLens.reduce((sum, len) => sum + (len > 0 ? len : 0), 0);

const initialDocsState: Record<SafeCaptureKey, Document | null> = {
  closed: null,
  open: null,
  bolts: null,
  serial: null,
  sabs: null,
};

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

export default function SafeWizardScreen() {
  const router = useRouter();
  const guardDemoReset = useDemoDataResetGuard();
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
  const scrollRef = useRef<ScrollView | null>(null);
  const cardPositionsRef = useRef<Partial<Record<SafeCaptureKey, number>>>({});
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    completeReturnTo?: string | string[];
    safeId?: string | string[];
    intro?: string | string[];
    nav?: string | string[];
  }>();
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
  const returnToPath = navCtx.routeBack || navCtx.returnTo || defaultReturnPath;
  const completeReturnPath = navCtx.onComplete || returnToPath;
  const buildWizardParams = useCallback(() => {
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
    return next;
  }, [params.completeReturnTo, params.intro, params.nav, params.returnTo]);
  const safeIdParam = useMemo(() => {
    const raw = params.safeId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = `${value ?? ''}`.trim();
    return trimmed || null;
  }, [params.safeId]);
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);

  const scrollToCard = useCallback((key: SafeCaptureKey) => {
    const y = cardPositionsRef.current[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  }, []);

  const scrollToNextCard = useCallback(
    (current: SafeCaptureKey) => {
      const order = captureOptions.map(item => item.key);
      const idx = order.indexOf(current);
      const next = idx >= 0 ? order[idx + 1] : null;
      if (next) {
        scrollToCard(next);
      } else {
        scrollRef.current?.scrollToEnd?.({ animated: true });
      }
    },
    [scrollToCard],
  );

  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing...');
  const [step, setStep] = useState<'info' | 'capture'>('info');
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [prefsProfileId, setPrefsProfileId] = useState<string | null>(null);
  const [showWizardHints, setShowWizardHints] = useState(true);
  const safeIdRef = useRef<string | null>(null);
  const [safeId, setSafeId] = useState<string | null>(null);
  const [safeName, setSafeName] = useState('');
  const [docs, setDocs] = useState<Record<SafeCaptureKey, Document | null>>(initialDocsState);
  const [pendingRotationByKey, setPendingRotationByKey] = useState<Record<SafeCaptureKey, number>>({
    closed: 0,
    open: 0,
    bolts: 0,
    serial: 0,
    sabs: 0,
  });
  const [extraDocCount, setExtraDocCount] = useState(0);
  const [safeNotes, setSafeNotes] = useState('');
  const [notesHeight, setNotesHeight] = useState(44);
  const [isEditMode, setIsEditMode] = useState(false);
  const baselineSignatureRef = useRef<string | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const navigatedRef = useRef(false);
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const deletedDocIdsRef = useRef<Set<string>>(new Set());
  const loadedExistingRef = useRef(false);
  const [showBlockingIssues, setShowBlockingIssues] = useState(false);

  useEffect(() => {
    const profile = listByType<Profile>('Profile')[0];
    if (!profile) {
      setShowWizardHints(true);
      setStep('info');
      return;
    }
    setPrefsProfileId(profile.id);
    const prefs = ensureUserPrefs(profile.id);
    setUserPrefs(prefs);
    const show = prefs.showSafeWizardHint !== false;
    setShowWizardHints(show);
    setStep(show ? 'info' : 'capture');
  }, []);

  useEffect(() => {
    if (step === 'capture') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [step]);

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
      const stillUsed = remaining.some(other => other.id !== doc.id && other.ocrExtractionId === doc.ocrExtractionId);
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
      deletedDocIdsRef.current.clear();
      const created = Array.from(createdDocIdsRef.current);
      created.forEach(docId => {
        void deleteDocumentById(docId);
      });
    };
  }, [deleteDocumentById]);

  const cleanupDocuments = useCallback(() => {
    setDocs(prev => {
      Object.values(prev).forEach(doc => {
        if (doc && createdDocIdsRef.current.has(doc.id)) {
          void deleteDocumentArtifacts(doc);
          createdDocIdsRef.current.delete(doc.id);
        }
      });
      return initialDocsState;
    });
    deletedDocIdsRef.current.clear();
    createdDocIdsRef.current.clear();
    safeIdRef.current = null;
    setSafeId(null);
  }, [deleteDocumentArtifacts]);

  const ensureSafeId = useCallback(() => {
    if (safeIdRef.current) return safeIdRef.current;
    if (safeId) {
      safeIdRef.current = safeId;
      return safeId;
    }
    const nextId = createRandomId('safe');
    safeIdRef.current = nextId;
    setSafeId(nextId);
    return nextId;
  }, [safeId]);

  const signatureForState = useCallback(
    (opts?: { docs?: Record<SafeCaptureKey, Document | null>; name?: string; notes?: string; extraCount?: number }) => {
      const docSig = (doc: Document | null) => (doc ? `${doc.id}:${doc.updatedAt ?? doc.createdAt ?? ''}` : '');
      const stateDocs = opts?.docs ?? docs;
      const name = (opts?.name ?? safeName).trim().toLowerCase();
      const notes = (opts?.notes ?? safeNotes).trim().toLowerCase();
      const extraCount = opts?.extraCount ?? extraDocCount;
      return [
        name,
        notes,
        ...captureOptions.map(opt => docSig(stateDocs[opt.key] ?? null)),
        `${extraCount}`,
      ].join('|');
    },
    [docs, extraDocCount, safeName, safeNotes],
  );

  const currentSignature = useMemo(() => signatureForState(), [signatureForState]);
  const normalizeRotation = useCallback((value: number) => ((value % 360) + 360) % 360, []);
  const hasPendingRotation = useMemo(
    () => captureOptions.some((opt) => normalizeRotation(pendingRotationByKey[opt.key]) !== 0),
    [normalizeRotation, pendingRotationByKey],
  );

  const labelForOption = useCallback(
    (option: CaptureOption) => {
      return option.label;
    },
    [],
  );

  useEffect(() => {
    if (!safeIdParam || loadedExistingRef.current) return;
    const existingSafe = getById<Safe>(safeIdParam);
    if (!existingSafe) return;
    loadedExistingRef.current = true;
    safeIdRef.current = existingSafe.id;
    setSafeId(existingSafe.id);
    setSafeName(existingSafe.safeName ?? '');
    setSafeNotes(existingSafe.notes ?? '');
    setIsEditMode(true);
    setShowWizardHints(false);
    setStep('capture');

    const allDocs = listByType<Document>('Document');
    const forSafe = allDocs.filter(doc => doc.parentType === 'Safe' && doc.parentId === existingSafe.id);
    const nextDocs: Record<SafeCaptureKey, Document | null> = { ...initialDocsState };
    const remaining = [...forSafe];
    const photoByCategory = new Map(
      (existingSafe.safePhotos ?? []).map((entry) => [entry.category, entry.documentId] as const),
    );
    captureOptions.forEach((option) => {
      const byCategoryId = photoByCategory.get(option.category);
      if (byCategoryId) {
        const idx = remaining.findIndex((doc) => String(doc.id) === String(byCategoryId));
        if (idx >= 0) {
          nextDocs[option.key] = remaining.splice(idx, 1)[0];
          return;
        }
      }
      const idx = remaining.findIndex((doc) => {
        const name = (doc.name ?? '').toLowerCase();
        const related = (doc.requirementRelatedLabel ?? '').toLowerCase();
        const label = option.label.toLowerCase();
        return name.includes(label) || related.includes(label);
      });
      if (idx >= 0) {
        nextDocs[option.key] = remaining.splice(idx, 1)[0];
      }
    });
    setDocs(nextDocs);
    setExtraDocCount(remaining.length);
    const baseSignature = signatureForState({
      docs: nextDocs,
      name: existingSafe.safeName ?? '',
      notes: existingSafe.notes ?? '',
      extraCount: remaining.length,
    });
    baselineSignatureRef.current = baseSignature;
    setBaselineReady(true);
  }, [safeIdParam, signatureForState]);

  const previousDocIdsRef = useRef<Record<SafeCaptureKey, string | null>>({
    closed: null,
    open: null,
    bolts: null,
    serial: null,
    sabs: null,
  });
  useEffect(() => {
    const nextPending = { ...pendingRotationByKey };
    let changed = false;
    captureOptions.forEach((opt) => {
      const nextId = docs[opt.key]?.id ?? null;
      if (previousDocIdsRef.current[opt.key] !== nextId) {
        previousDocIdsRef.current[opt.key] = nextId;
        if (nextPending[opt.key] !== 0) {
          nextPending[opt.key] = 0;
          changed = true;
        }
      }
    });
    if (changed) {
      setPendingRotationByKey(nextPending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  useEffect(() => {
    if (baselineReady) return;
    if (loadedExistingRef.current) return;
    baselineSignatureRef.current = signatureForState();
    setBaselineReady(true);
  }, [baselineReady, signatureForState]);

  type WizardAsset = ImagePicker.ImagePickerAsset | {
    uri: string;
    mimeType?: string | null;
    name?: string | null;
    fileName?: string | null;
    size?: number | null;
    fileSize?: number | null;
  };

  const saveSafeDocument = useCallback(
    async (option: CaptureOption, asset: WizardAsset, existing?: Document | null) => {
      const id = ensureSafeId();
      const profileId = prefsProfileId ?? listByType<Profile>('Profile')[0]?.id ?? '';
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'Safe',
          parentId: id,
          holderProfileId: profileId,
          label: labelForOption(option),
          kind: 'SAFE',
          side: 'not_applicable',
          createDocumentId: () => createRandomId('doc'),
        },
        existing,
      });
      const label = labelForOption(option);
      const updated = touch({
        ...document,
        name: label,
        requirementCode: option.category,
        requirementRelatedId: id,
        requirementRelatedLabel: label,
      } as Document);
      if (createdNew) {
        createdDocIdsRef.current.add(updated.id);
      }
      return updated;
    },
    [ensureSafeId, labelForOption, prefsProfileId],
  );

  const capturePhoto = useCallback(
    async (option: CaptureOption, existing?: Document | null) => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to continue.');
        return null;
      }
      const cameraOptions: ImagePicker.ImagePickerOptions = {
        quality: 1,
        base64: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        exif: false,
      };
      if (jpegExportType) {
        (cameraOptions as any).imageExportType = jpegExportType;
      }
      setProcessingLabel(`Uploading ${option.label.toLowerCase()}`);
      setProcessing(true);
      await nextFrame();
      const result = await ImagePicker.launchCameraAsync(cameraOptions as any);
      if (result.canceled || !result.assets?.length) {
        setProcessingLabel('Processing...');
        setProcessing(false);
        return null;
      }
      const asset = await prepareWizardImage(result.assets[0]);
      const doc = await saveSafeDocument(option, asset, existing);
      return doc;
    },
    [saveSafeDocument, setProcessing],
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

  const handleCapture = useCallback(
    async (key: SafeCaptureKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const option = captureOptions.find(item => item.key === key);
      if (!option) return;
      try {
        const existing = docs[key];
        const stored = await capturePhoto(option, existing ?? undefined);
        if (stored) {
          setProcessing(true);
          await nextFrame();
          setDocs(prev => ({ ...prev, [key]: stored }));
          setTimeout(() => scrollToNextCard(key), 100);
        }
      } catch (error: any) {
        logger.warn('[safe/wizard] Failed to capture safe photo', error);
        Alert.alert(
          'Capture failed',
          error?.message ?? 'Something went wrong while capturing the photo. Please try again.'
        );
      } finally {
        setProcessing(false);
      }
    },
    [capturePhoto, docs, processing, scrollToNextCard],
  );

  const pickFromLibrary = useCallback(
    async (key: SafeCaptureKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const option = captureOptions.find(item => item.key === key);
      if (!option) return;
      const shouldShowPhotoLibraryAlert = userPrefs?.showPhotoLibraryAlert !== false;
      const ok = await ensurePhotoLibraryPermission({
        title: 'Photo library access needed',
        settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
        showLimitedAccessAlert: shouldShowPhotoLibraryAlert,
        onDisableLimitedAccessAlert: disablePhotoLibraryAlert,
      });
      if (!ok) return;
      const libraryOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      };
      if (jpegExportType) {
        (libraryOptions as any).imageExportType = jpegExportType;
      }
      try {
        setProcessingLabel(`Uploading ${option.label.toLowerCase()}`);
        setProcessing(true);
        await nextFrame();
        const result = await ImagePicker.launchImageLibraryAsync(libraryOptions as any);
        if (result.canceled || !result.assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = await prepareWizardImage(result.assets[0]);
        const existing = docs[key];
        const stored = await saveSafeDocument(option, asset, existing);
        setDocs(prev => ({ ...prev, [key]: stored }));
        setTimeout(() => scrollToNextCard(key), 100);
      } catch (error: any) {
        logger.warn('[safe/wizard] Failed to pick safe photo', error);
        Alert.alert(
          'Unable to use photo',
          error?.message ?? 'Something went wrong while importing the photo. Please try again.'
        );
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [disablePhotoLibraryAlert, docs, processing, saveSafeDocument, scrollToNextCard, userPrefs?.showPhotoLibraryAlert],
  );


  const handleDelete = useCallback(
    async (key: SafeCaptureKey) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const doc = docs[key];
      if (!doc) return;
      setProcessing(true);
      try {
        if (createdDocIdsRef.current.has(doc.id)) {
          await deleteDocumentArtifacts(doc);
        } else {
          deletedDocIdsRef.current.add(doc.id);
        }
        setDocs(prev => ({ ...prev, [key]: null }));
      } catch (error: any) {
        console.warn('[safe/wizard] Failed to delete safe photo', error);
        Alert.alert(
          'Delete failed',
          error?.message ?? 'Something went wrong while deleting this photo.'
        );
      } finally {
        setProcessing(false);
      }
    },
    [deleteDocumentArtifacts, docs, processing],
  );

  const goReturn = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [navCtx, returnToPath, router]);

  const capturedCount = useMemo(
    () => Object.values(docs).filter(Boolean).length + extraDocCount,
    [docs, extraDocCount],
  );
  const missingRequiredOptions = useMemo(
    () =>
      requiredCaptureKeys
        .filter((key) => !docs[key])
        .map((key) => {
          if (key === 'closed') return 'Photo of safe closed';
          if (key === 'open') return 'Photo of safe open';
          return captureOptions.find((option) => option.key === key)?.label.replace(/\s*\(required\)\s*/i, '') ?? key;
        }),
    [docs],
  );
  const trimmedNotes = safeNotes.trim();
  const safeNotesTooLong = safeDescriptionMaxTotal > 0 && trimmedNotes.length > safeDescriptionMaxTotal;
  const hasChanges = baselineReady && currentSignature !== baselineSignatureRef.current;
  const isDirty = hasChanges || hasPendingRotation;
  const canSave = (hasChanges || hasPendingRotation) && !processing;

  const focusIssue = useCallback((issueKey?: string) => {
    if (!issueKey) return;
    if (issueKey.startsWith('doc:')) {
      const key = issueKey.replace(/^doc:/, '') as SafeCaptureKey;
      scrollToCard(key);
    }
  }, [scrollToCard]);

  const blockingValidation = useMemo(() => {
    const issues: WizardBlockingIssue[] = [];
    requiredCaptureKeys.forEach((key) => {
      if (docs[key]) return;
      const option = captureOptions.find((item) => item.key === key);
      const label =
        key === 'closed'
          ? 'Photo of safe closed'
          : key === 'open'
            ? 'Photo of safe open'
            : option?.label.replace(/\s*\(required\)\s*/i, '') ?? key;
      const message =
        key === 'closed'
          ? 'Add a photo of the safe while closed.'
          : key === 'open'
            ? 'Add a photo of the safe while open.'
            : `Add the ${label.toLowerCase()} photo.`;
      issues.push({
        key: `doc:${key}`,
        label,
        kind: 'missing',
        message,
      });
    });
    return buildWizardBlockingResult(issues);
  }, [docs]);

  const queueRotation = useCallback((key: SafeCaptureKey) => {
    setPendingRotationByKey((prev) => ({ ...prev, [key]: prev[key] - 90 }));
  }, []);

  const applyPendingImageRotations = useCallback(async () => {
    const nextDocs: Record<SafeCaptureKey, Document | null> = { ...docs };
    let changed = false;
    for (const option of captureOptions) {
      const degrees = normalizeRotation(pendingRotationByKey[option.key]);
      if (!degrees) continue;
      const doc = docs[option.key];
      if (!doc) continue;
      const sourceUri = resolveDocumentUri(doc.uri ?? doc.filePath);
      if (!sourceUri) continue;
      const manipulated = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ rotate: degrees }],
        {},
      );
      if (manipulated.uri !== sourceUri) {
        await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
      }
      const updated = touch({
        ...doc,
      } as Document);
      persist(updated);
      nextDocs[option.key] = updated;
      changed = true;
    }
    if (changed) {
      setDocs(nextDocs);
    }
    setPendingRotationByKey({
      closed: 0,
      open: 0,
      bolts: 0,
      serial: 0,
      sabs: 0,
    });
    return nextDocs;
  }, [docs, normalizeRotation, pendingRotationByKey]);

  const saveSafe = useCallback(async (opts?: { onSaved?: () => void }) => {
    setShowBlockingIssues(true);
    if (blockingValidation.hasBlockingIssues) {
      showWizardBlockingAlert(blockingValidation, {
        title: 'Unable to save',
        intro: 'Please correct the following before saving:',
        onPressOk: () => focusIssue(blockingValidation.firstIssueKey),
      });
      return;
    }
    if (safeNotesTooLong) {
      Alert.alert(
        'Safe description too long',
        `Only the first ${safeDescriptionMaxTotal} characters will be used in the 518a Annex A form.`
      );
    }
    if (!hasChanges && !hasPendingRotation) return;
    const profile = listByType<Profile>('Profile')[0];
    if (!profile) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }
    setProcessing(true);
    try {
      const activeDocs = await applyPendingImageRotations();
      const id = ensureSafeId();
      const existing = getById<Safe>(id);
      const trimmedName = safeName.trim();
      const trimmedNotes = safeNotes.trim();
      const safePhotos = captureOptions
        .map(opt => {
          const doc = activeDocs[opt.key];
          return doc ? { category: opt.category, documentId: doc.id } : null;
        })
        .filter(Boolean) as NonNullable<Safe['safePhotos']>;
      const nextSafe = existing
        ? touch({
            ...existing,
            safeName: trimmedName || existing.safeName,
            holderProfileId: existing.holderProfileId ?? profile.id,
            notes: trimmedNotes || undefined,
            safePhotos,
          } as Safe)
        : withMeta<Safe>({
            id,
            type: 'Safe',
            safeName: trimmedName || undefined,
            holderProfileId: profile.id,
            notes: trimmedNotes || undefined,
            safePhotos,
          } as Safe);
      persist(nextSafe);
      const deletedDocIds = Array.from(deletedDocIdsRef.current);
      deletedDocIds.forEach((docId) => {
        const doc = getById<Document>(docId);
        if (!doc) return;
        [doc.uri, doc.filePath, doc.thumbPath].forEach((path) => {
          if (!path) return;
          void deleteOwnedDocFile(path).catch(() => {});
        });
        if (doc.ocrExtractionId) {
          const remaining = listByType<Document>('Document');
          const stillUsed = remaining.some(other => other.id !== doc.id && other.ocrExtractionId === doc.ocrExtractionId);
          if (!stillUsed) {
            deleteEntity(doc.ocrExtractionId);
          }
        }
        deleteEntity(docId);
      });
      baselineSignatureRef.current = signatureForState({
        docs: activeDocs,
        name: trimmedName,
        notes: trimmedNotes,
        extraCount: extraDocCount,
      });
      setBaselineReady(true);
      setShowBlockingIssues(false);
      deletedDocIdsRef.current.clear();
      navigatedRef.current = true;
      if (opts?.onSaved) {
        opts.onSaved();
        return;
      }
      backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
    } catch (error: any) {
      logger.warn('[safe/wizard] Failed to save safe', error);
      Alert.alert(
        'Unable to save',
        error?.message ?? 'Something went wrong while saving your safe. Please try again.'
      );
    } finally {
      setProcessing(false);
    }
  }, [applyPendingImageRotations, blockingValidation, ensureSafeId, extraDocCount, focusIssue, hasChanges, hasPendingRotation, navCtx, returnToPath, router, safeName, safeNotes, signatureForState]);

  const startAnother = useCallback(() => {
    navigatedRef.current = true;
    router.replace({
      pathname: '/safe/wizard',
      params: buildWizardParams(),
    } as any);
  }, [buildWizardParams, router]);

  const promptAddAnother = useCallback(() => {
    Alert.alert(
      'Add another safe?',
      'Do you want to add another safe now?',
      [
        {
          text: 'No',
          style: 'cancel',
          onPress: () => {
            goReturn();
          },
        },
        {
          text: 'Yes',
          onPress: () => {
            void (async () => {
              if (await guardDemoReset('safe')) return;
              startAnother();
            })();
          },
        },
      ],
    );
  }, [goReturn, guardDemoReset, startAnother]);

  const handleSave = useCallback(() => {
    if (isEditMode) {
      void saveSafe();
      return;
    }
    void saveSafe({ onSaved: () => promptAddAnother() });
  }, [isEditMode, promptAddAnother, saveSafe]);

  const handleClose = useCallback(() => {
    if (processing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    if (hasChanges || hasPendingRotation) {
      const actions: AlertButton[] = [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            cleanupDocuments();
            setStep('info');
            goReturn();
          },
        },
      ];
      if (canSave) {
        actions.push({
          text: 'Save',
          onPress: () => {
            if (isEditMode) {
              void saveSafe();
              return;
            }
            void saveSafe({ onSaved: () => promptAddAnother() });
          },
        });
      }
      Alert.alert('Save changes?', 'Would you like to save your changes before leaving?', actions);
      return;
    }
    if (!isEditMode) {
      cleanupDocuments();
      setStep('info');
      goReturn();
      return;
    }
    cleanupDocuments();
    setStep('info');
    goReturn();
  }, [cleanupDocuments, goReturn, hasChanges, hasPendingRotation, isEditMode, processing, promptAddAnother, saveSafe]);


  const persistShowHint = useCallback(
    (value: boolean) => {
      if (!prefsProfileId) return;
      setUserPrefs(prev => {
        const base = prev ?? ensureUserPrefs(prefsProfileId);
        const updated = { ...base, showSafeWizardHint: value };
        saveUserPrefs(updated);
        return updated;
      });
    },
    [prefsProfileId],
  );

  const toggleShowHints = useCallback(() => {
    if (processing) return;
    const next = !showWizardHints;
    setShowWizardHints(next);
    persistShowHint(next);
  }, [persistShowHint, processing, showWizardHints]);

  const handleOpenHelp = useCallback(() => {
    openHelp(WIZARD_HELP_KEY);
  }, [openHelp]);

  const handleChangeSafeName = useCallback(
    (value: string) => {
      setSafeName(value);
    },
    [],
  );

  const handleChangeNotes = useCallback(
    (value: string) => {
      setSafeNotes(value);
    },
    [],
  );

  const renderCaptureCard = (option: CaptureOption) => {
    const doc = docs[option.key];
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const cardHasError = showBlockingIssues && requiredCaptureKeys.includes(option.key) && !doc;
    return (
      <PhotoCaptureCard
        key={option.key}
        isError={cardHasError}
        title={option.label}
        helpText={option.hint}
        imageUri={uri}
        previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
        previewRotationDegrees={pendingRotationByKey[option.key]}
        persistRotationOnPreviewClose={false}
        onPressCamera={() => handleCapture(option.key)}
        onPressLibrary={() => pickFromLibrary(option.key)}
        onPressRotate={() => queueRotation(option.key)}
        showRotateButton={!!uri}
        onDelete={() => handleDelete(option.key)}
        disabled={processing}
        onLayout={(e) => {
          cardPositionsRef.current[option.key] = e.nativeEvent.layout.y;
        }}
      />
    );
  };

  const statusListItems = showBlockingIssues && blockingValidation.hasBlockingIssues
    ? blockingValidation.issues.map((issue) => issue.label)
    : missingRequiredOptions;
  const successMessage = `${capturedCount} photo${capturedCount === 1 ? '' : 's'} added.`;

  const pageTitle = isEditMode ? 'Edit safe' : 'Add firearm storage';
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
              {/* <Text style={styles.h1}>Capture your safe</Text> */}
              <Text style={styles.lead}>
                Take photos of your safe so you can keep proof of compliance handy and include it in your renewal application when needed.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Before you start</Text>
              {[
                'For your safety, make sure the safe is empty and accessible.', 
                'Wipe dust or glare off the plates and serials.', 
                'It is recommended that you include photos of the safe closed, open (no contents), and the bolts securing it to a fixed surface.', 
              ].map((item, index) => bullet(item, `need_${index}`))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tips for a clear photo</Text>
              {[
                'Clean your camera lens to reduce image blur and glare.',
                'Use good lighting to keep labels readable. Avoid glare or reflections.', 
                'Hold the camera steady and fill the frame with the safe.', 
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

            <Button label="Continue" onPress={() => setStep('capture')} tone="teal" align="center" centerText />
          </PageScrollView>
        ) : (
          <PageScrollView ref={scrollRef} contentContainerStyle={styles.captureContent}>
            {isEditMode ? null : (
              <Text style={styles.captureIntro}>
                Take or upload photos of your safe.
              </Text>
            )}

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Safe name (optional)</Text>
                <TextInput
                  value={safeName}
                  onChangeText={handleChangeSafeName}
                  placeholder="e.g. Bedroom safe"
                  style={styles.input}
                  placeholderTextColor={neutral.border} />
                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  value={safeNotes}
                  onChangeText={handleChangeNotes}
                  placeholder="Provide description of safe (used in firearm renewal applications)"
                  style={[
                    styles.textArea,
                    { height: Math.max(80, notesHeight) },
                    safeNotesTooLong ? styles.inputWarning : null,
                  ]}
                  placeholderTextColor={neutral.border} multiline
                  onContentSizeChange={(e) => setNotesHeight(e.nativeEvent.contentSize.height)}
                  textAlignVertical="top"
                />
                {safeNotesTooLong ? (
                  <Text style={styles.inputHelpWarning}>
                    Only the first {safeDescriptionMaxTotal} characters will be used in the 518a Annex A form.
                </Text>
              ) : null}
            </View>

            <View style={styles.captureGrid}>
              {captureOptions.map(renderCaptureCard)}
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
                  <View style={[styles.captureStatusBox, styles.captureStatusWarning]}>
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
                <View style={[styles.captureStatusBox, styles.captureStatusSuccess]}>
                  <Text style={styles.captureStatusText}>{successMessage}</Text>
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
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
    bulletMarker: { width: 18, fontSize: 16, lineHeight: 20, color: neutral.base },
    bulletText: { flex: 1, fontSize: 15, lineHeight: 20, color: neutral.base },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    hintTextWrap: { flex: 1, gap: 2 },
    hintLabel: { fontSize: 15, fontWeight: '600', color: neutral.onSurface },
    hintHelp: { fontSize: 13, color: neutral.base },
    captureContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
    captureIntro: { fontSize: 15, color: neutral.base },
    captureGrid: { gap: 16 },
    captureStatus: { marginTop: 0, marginBottom: 0 },
    captureStatusBox: {
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
    },
    captureStatusPressable: { borderRadius: 16 },
    captureStatusPressed: { opacity: 0.96 },
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
    inputBlock: {
      gap: 6,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
    },
    inputLabel: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      color: neutral.onSurface,
      backgroundColor: tones.neutrals[100],
    },
    textArea: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: neutral.onSurface,
      backgroundColor: tones.neutrals[100],
      lineHeight: 20,
    },
    inputWarning: {
      borderColor: tones.orange.base,
    },
    inputHelpWarning: {
      fontSize: 13,
      color: tones.orange.base,
    },
  });
