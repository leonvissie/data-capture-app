import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, type AlertButton, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import DateInput from '../../src/components/DateInput';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import { useTones } from '../../src/theme/tones';
import { ActivityEvidence, Document, Profile } from '../../src/data/types';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { persist, persistAsync, touch, withMeta } from '../../src/data/repo';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { prepareWizardImage } from '../../src/utils/image';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { maskDateYYYYMMDD } from '../../src/utils/dateInput';
import { logger } from '@/src/utils/logger';
import { nextFrame } from '../../src/utils/ui';
import {
  buildWizardBlockingResult,
  showWizardBlockingAlert,
  type WizardBlockingIssue,
} from '../../src/utils/wizardBlockingValidation';

type EvidenceType = ActivityEvidence['evidenceType'];
type EvidencePhotoEntry = {
  key: string;
  doc: Document | null;
  capturedAt: string;
  capturedAtSource?: 'camera_now' | 'exif';
};

type Params = {
  evidenceType?: string | string[];
  activityEvidenceId?: string | string[];
  returnTo?: string | string[];
  completeReturnTo?: string | string[];
  nav?: string | string[];
};

const defaultReturnPath = '/(tabs)/firearms?scroll=activityEvidence';

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const normalizeEvidenceType = (value?: string | null): EvidenceType =>
  `${value ?? ''}`.toUpperCase() === 'HUNTING' ? 'HUNTING' : 'SPORT_SHOOTING';

const createEmptyEntry = (): EvidencePhotoEntry => ({
  key: createRandomId('aev_photo'),
  doc: null,
  capturedAt: '',
});

const toIsoDateOnly = (value?: string | null) => `${value ?? ''}`.trim().slice(0, 10);

const resolveExifDate = (asset: any): string => {
  const exif = asset?.exif;
  if (!exif || typeof exif !== 'object') return '';
  const candidates = [
    exif.DateTimeOriginal,
    exif.DateTimeDigitized,
    exif.DateTime,
    exif.dateTimeOriginal,
    exif.dateTimeDigitized,
    exif.dateTime,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim();
    if (!raw) continue;
    const normalized = raw.replace(/\//g, ':').replace('T', ' ');
    const exifMatch = /^(\d{4}):(\d{2}):(\d{2})/.exec(normalized);
    if (exifMatch) {
      const iso = `${exifMatch[1]}-${exifMatch[2]}-${exifMatch[3]}`;
      if (isIsoDate(iso)) return iso;
    }
    const iso = toIsoDateOnly(raw);
    if (isIsoDate(iso)) return iso;
  }
  return '';
};

export default function ActivityWizardScreen() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const params = useLocalSearchParams<Params>();
  const scrollRef = useRef<ScrollView | null>(null);
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const deletedDocIdsRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);
  const baselineSignatureRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

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
        returnTo: Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
        onComplete: Array.isArray(params.completeReturnTo) ? params.completeReturnTo[0] : params.completeReturnTo,
      }),
    [navPayload, params.completeReturnTo, params.returnTo],
  );
  const returnToPath = navCtx.routeBack || navCtx.returnTo || defaultReturnPath;
  const evidenceType = useMemo(
    () => normalizeEvidenceType(Array.isArray(params.evidenceType) ? params.evidenceType[0] : params.evidenceType),
    [params.evidenceType],
  );
  const activityEvidenceIdParam = useMemo(() => {
    const raw = Array.isArray(params.activityEvidenceId) ? params.activityEvidenceId[0] : params.activityEvidenceId;
    const trimmed = `${raw ?? ''}`.trim();
    return trimmed || null;
  }, [params.activityEvidenceId]);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [activityEvidenceId, setActivityEvidenceId] = useState<string | null>(null);
  const [entries, setEntries] = useState<EvidencePhotoEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing...');
  const [baselineReady, setBaselineReady] = useState(false);
  const [showBlockingIssues, setShowBlockingIssues] = useState(false);

  const signatureForState = useCallback((stateEntries: EvidencePhotoEntry[]) => {
    const sig = stateEntries
      .filter((entry) => !!entry.doc)
      .map((entry) => {
        const doc = entry.doc!;
        return `${doc.id}:${doc.updatedAt ?? doc.createdAt ?? ''}:${entry.capturedAt.trim()}:${entry.capturedAtSource ?? ''}`;
      })
      .join('|');
    return sig;
  }, []);

  const currentSignature = useMemo(() => signatureForState(entries), [entries, signatureForState]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const profile = listByType<Profile>('Profile')[0] ?? null;
    if (!profile?.id) return;
    setProfileId(profile.id);

    const explicit = activityEvidenceIdParam ? getById<ActivityEvidence>(activityEvidenceIdParam) : null;
    const sameType = listByType<ActivityEvidence>('ActivityEvidence').find(
      (item) =>
        String(item.holderProfileId ?? '') === String(profile.id) &&
        item.evidenceType === evidenceType &&
        !item.deleted,
    );
    const existing = explicit ?? sameType ?? null;
    if (existing) {
      setActivityEvidenceId(existing.id);
      const loaded = (existing.photos ?? []).map((photo, index) => ({
        key: `${existing.id}_${index}_${photo.documentId}`,
        doc: getById<Document>(String(photo.documentId)) ?? null,
        capturedAt: String(photo.capturedAt ?? ''),
        capturedAtSource: photo.capturedAtSource,
      }));
      const seeded = [...loaded, createEmptyEntry()];
      setEntries(seeded);
      baselineSignatureRef.current = signatureForState(seeded);
      setBaselineReady(true);
      return;
    }
    const seeded = [createEmptyEntry()];
    setEntries(seeded);
    baselineSignatureRef.current = signatureForState(seeded);
    setBaselineReady(true);
  }, [activityEvidenceIdParam, evidenceType, signatureForState]);

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

  const ensureActivityEvidenceId = useCallback(() => {
    if (activityEvidenceId) return activityEvidenceId;
    const nextId = createRandomId('aev');
    setActivityEvidenceId(nextId);
    return nextId;
  }, [activityEvidenceId]);

  const ensureProfileId = useCallback(() => {
    if (profileId) return profileId;
    const profile = listByType<Profile>('Profile')[0] ?? null;
    if (profile?.id) {
      setProfileId(profile.id);
      return profile.id;
    }
    const created = withMeta<Profile>({ id: createRandomId('prof'), type: 'Profile' } as Profile);
    persist(created);
    setProfileId(created.id);
    return created.id;
  }, [profileId]);

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

  const upsertEntryDoc = useCallback(
    async (
      key: string,
      asset: { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null },
      mode: 'camera' | 'library' | 'upload',
      exifDate = '',
    ) => {
      const current = entries.find((entry) => entry.key === key);
      if (!current) return;
      const parentId = ensureActivityEvidenceId();
      const holderId = ensureProfileId();
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset,
        context: {
          parentType: 'ActivityEvidence',
          parentId,
          holderProfileId: holderId,
          label: `${evidenceType === 'HUNTING' ? 'Hunting' : 'Sport shooting'} evidence photo`,
          kind: 'ACTIVITY_EVIDENCE',
          createDocumentId: () => createRandomId('doc'),
        },
        existing: current.doc ?? undefined,
      });
      const nowDate = new Date().toISOString().slice(0, 10);
      const capturedAt = mode === 'camera' ? nowDate : mode === 'library' ? exifDate : current.capturedAt;
      const source = mode === 'camera' ? 'camera_now' : mode === 'library' && exifDate ? 'exif' : current.capturedAtSource;

      setEntries((prev) => {
        const idx = prev.findIndex((entry) => entry.key === key);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], doc: document, capturedAt, capturedAtSource: source };
        if (!next.some((entry) => !entry.doc)) {
          next.push(createEmptyEntry());
        }
        return next;
      });

      if (createdNew) {
        createdDocIdsRef.current.add(document.id);
      } else {
        createdDocIdsRef.current.delete(document.id);
      }
    },
    [ensureActivityEvidenceId, ensureProfileId, entries, evidenceType],
  );

  const handleCapture = useCallback(
    async (key: string) => {
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
        const result = await ImagePicker.launchCameraAsync(pickerOptions as any);
        if (result.canceled || !result.assets?.length) return;
        await withProcessing('Uploading activity photo', async () => {
          const prepared = await prepareWizardImage(result.assets[0]);
          await upsertEntryDoc(
            key,
            {
              uri: prepared.uri,
              mimeType: prepared.mimeType,
              fileName: prepared.fileName,
              fileSize: prepared.fileSize,
            },
            'camera',
          );
        });
      } catch (error: any) {
        Alert.alert('Unable to use photo', error?.message ?? 'Something went wrong while capturing the photo.');
      }
    },
    [processing, upsertEntryDoc, withProcessing],
  );

  const pickFromLibrary = useCallback(
    async (key: string) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const ok = await ensurePhotoLibraryPermission({
        title: 'Photo library access needed',
        settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
      });
      if (!ok) return;

      try {
        const pickerOptions: ImagePicker.ImagePickerOptions = {
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 1,
          exif: true,
        };
        const result = await ImagePicker.launchImageLibraryAsync(pickerOptions as any);
        if (result.canceled || !result.assets?.length) return;
        const exifDate = resolveExifDate(result.assets[0]);
        await withProcessing('Uploading activity photo', async () => {
          const prepared = await prepareWizardImage(result.assets[0]);
          await upsertEntryDoc(
            key,
            {
              uri: prepared.uri,
              mimeType: prepared.mimeType,
              fileName: prepared.fileName,
              fileSize: prepared.fileSize,
            },
            'library',
            exifDate,
          );
        });
      } catch (error: any) {
        Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
      }
    },
    [processing, upsertEntryDoc, withProcessing],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const target = entries.find((entry) => entry.key === key);
      if (!target?.doc) return;
      setProcessing(true);
      try {
        if (createdDocIdsRef.current.has(target.doc.id)) {
          for (const path of [target.doc.uri, target.doc.filePath, target.doc.thumbPath]) {
            if (!path) continue;
            try {
              await deleteOwnedDocFile(path);
            } catch {
              // ignore cleanup failures
            }
          }
          deleteEntity(target.doc.id);
          createdDocIdsRef.current.delete(target.doc.id);
        } else {
          deletedDocIdsRef.current.add(target.doc.id);
        }
        setEntries((prev) => {
          const remaining = prev
            .filter((entry) => entry.key !== key)
            .map((entry) => (entry.doc ? entry : null))
            .filter(Boolean) as EvidencePhotoEntry[];
          return [...remaining, createEmptyEntry()];
        });
      } catch (error: any) {
        logger.warn('[activity/wizard] Failed to delete document', error);
        Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
      } finally {
        setProcessing(false);
      }
    },
    [entries, processing],
  );

  const cleanupDocuments = useCallback(() => {
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

  const hasChanges = baselineReady && currentSignature !== baselineSignatureRef.current;
  const canSave = hasChanges && !processing;

  const blockingValidation = useMemo(() => {
    const issues: WizardBlockingIssue[] = [];
    entries.forEach((entry, index) => {
      if (!entry.doc) return;
      if (!isIsoDate(entry.capturedAt)) {
        issues.push({
          key: `doc:${entry.key}`,
          label: `Photo ${index + 1}: captured date`,
          kind: 'missing',
          message: 'Enter captured date in YYYY-MM-DD format.',
        });
      }
    });
    return buildWizardBlockingResult(issues);
  }, [entries]);

  const handleSave = useCallback(async () => {
    setShowBlockingIssues(true);
    if (blockingValidation.hasBlockingIssues) {
      showWizardBlockingAlert(blockingValidation, {
        title: 'Unable to save',
        intro: 'Please correct the following before saving:',
      });
      return;
    }
    const pid = ensureProfileId();
    if (!pid) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }

    setProcessing(true);
    try {
      const id = ensureActivityEvidenceId();
      const existing = getById<ActivityEvidence>(id);
      const photos = entries
        .filter((entry) => !!entry.doc)
        .map((entry) => ({
          documentId: String(entry.doc!.id),
          capturedAt: entry.capturedAt.trim(),
          capturedAtSource: entry.capturedAtSource,
        }));
      const next = existing
        ? touch({ ...existing, holderProfileId: existing.holderProfileId ?? pid, evidenceType, photos } as ActivityEvidence)
        : withMeta<ActivityEvidence>({
            id,
            type: 'ActivityEvidence',
            holderProfileId: pid,
            evidenceType,
            photos,
          } as ActivityEvidence);
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

      baselineSignatureRef.current = signatureForState(entries);
      setBaselineReady(true);
      savedRef.current = true;
      setShowBlockingIssues(false);
      deletedDocIdsRef.current.clear();
      createdDocIdsRef.current.clear();
      goReturn();
    } catch (error: any) {
      logger.warn('[activity/wizard] Failed to save activity evidence', error);
      Alert.alert('Unable to save', error?.message ?? 'Something went wrong while saving your activity evidence.');
    } finally {
      setProcessing(false);
    }
  }, [blockingValidation, ensureActivityEvidenceId, ensureProfileId, entries, evidenceType, goReturn, signatureForState]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
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
  }, [canSave, cleanupDocuments, goReturn, handleSave, hasChanges]);

  const heading = evidenceType === 'HUNTING' ? 'Hunting evidence' : 'Sport shooting evidence';

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title={heading}
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!canSave}
          style={styles.header}
        />
        <PageScrollView ref={scrollRef} contentContainerStyle={styles.captureContent}>
          <View style={styles.trainingCard}>
            <Text style={styles.trainingCardTitle}>
              {evidenceType === 'HUNTING' ? 'Hunting evidence' : 'Sport shooting evidence'}
            </Text>
            <Text style={styles.trainingCardHelp}>
              Add one or more photos of your {evidenceType === 'HUNTING' ? 'hunting' : 'sport shooting'} activity.
            </Text>
            <View style={styles.captureGrid}>
              {entries.map((entry, index) => {
                const uri = entry.doc?.uri ?? entry.doc?.filePath ?? null;
                const name = entry.doc?.name ?? '';
                const showDateError = showBlockingIssues && !!entry.doc && !isIsoDate(entry.capturedAt);
                return (
                  <PhotoCaptureCard
                    key={entry.key}
                    title={`${evidenceType === 'HUNTING' ? 'Hunting photo' : 'Sport shooting photo'} ${index + 1}`}
                    helpText={
                      entry.doc
                        ? entry.capturedAtSource === 'exif'
                          ? 'Captured date extracted from photo metadata.'
                          : undefined
                        : 'Upload a photo of your activity.'
                    }
                    previewUri={uri}
                    previewVersionKey={entry.doc?.updatedAt ?? entry.doc?.createdAt}
                    previewKind={uri ? 'image' : undefined}
                    previewLabel={name || undefined}
                    onPressCamera={() => { void handleCapture(entry.key); }}
                    onPressLibrary={() => { void pickFromLibrary(entry.key); }}
                    onDelete={() => { void handleDelete(entry.key); }}
                    disabled={processing}
                    footerContent={
                      entry.doc ? (
                        <DateInput
                          label="Captured at"
                          value={entry.capturedAt}
                          onChangeText={(value) =>
                            setEntries((prev) =>
                              prev.map((item) =>
                                item.key === entry.key ? { ...item, capturedAt: maskDateYYYYMMDD(value) } : item,
                              ),
                            )
                          }
                          error={showDateError}
                          errorText="Captured date is required (YYYY-MM-DD)."
                        />
                      ) : null
                    }
                  />
                );
              })}
            </View>
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
    container: { flex: 1 },
    header: { marginBottom: 12, paddingHorizontal: 20 },
    captureContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
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
  });
