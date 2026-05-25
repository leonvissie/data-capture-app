import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Pressable, type AlertButton } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import ButtonSave from '../../src/components/ButtonSave';
import Button from '../../src/components/Button';
import { AddressSheet, EditTextSheet } from '../../src/components/EditSheet';
import { useTones } from '../../src/theme/tones';
import { Document, Profile, UserPrefs } from '../../src/data/types';
import { ensureUserPrefs, persist, persistAsync, saveUserPrefs, touch } from '../../src/data/repo';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import HelpModal from '../../src/components/HelpModal';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { rasterizePdf } from '../../src/pdf/rasterizer';
import { addressTooLongAlertMessage, getAddressLengthLimit, isAddressTooLong } from '../../src/utils/addressLength';
import { validateAddressSingleLine, validatePostCode } from '../../src/utils/validators';
import { useHelpModal } from '../../src/help';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import {
  buildWizardBlockingResult,
  showWizardBlockingAlert,
  type WizardBlockingIssue,
} from '../../src/utils/wizardBlockingValidation';

type AddressSlot = 'residential';

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile';
const WIZARD_HELP_KEY = 'helpWizardAddress';

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

const slotMeta: Record<AddressSlot, { title: string; label: string; code: string; help: string }> = {
  residential: {
    title: 'Residential address',
    label: 'Residential address',
    code: 'RESIDENTIAL_ADDRESS',
    help: 'Utility bill, bank statement, or municipal letter (within 3 months).',
  },
};

const parseNavParam = (raw?: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
};

type AddressSheetKey = 'address' | 'addressPostal';
type SheetState =
  | { type: 'address'; key: AddressSheetKey; title: string }
  | { type: 'text'; key: 'proofOfAddressDate'; title: string; mask?: 'date' }
  | null;

const normalizeAddressValue = (value?: string | null) => (value ?? '').trim();

const addressSignature = (address?: Profile['address']) => {
  if (!address) return '';
  return [
    normalizeAddressValue(address.line1),
    normalizeAddressValue(address.line2),
    normalizeAddressValue(address.suburb),
    normalizeAddressValue(address.city),
    normalizeAddressValue(address.postCode),
    normalizeAddressValue(address.singleLine),
  ].join('|');
};

const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;
const validateDateISO = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const toDateInputValue = (value?: string | null) => {
  if (!value) return '';
  return value.slice(0, 10);
};

export default function AddressWizardScreen() {
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
  const scrollRef = useRef<ScrollView | null>(null);
  const params = useLocalSearchParams<{
    nav?: string | string[];
    returnTo?: string | string[];
    completeReturnTo?: string | string[];
    previewMode?: string | string[];
    intro?: string | string[];
  }>();
  const navPayload = useMemo(() => parseNavParam(Array.isArray(params.nav) ? params.nav[0] : params.nav), [params.nav]);
  const navCtx = useMemo(
    () =>
      decodeNav({
        ...(navPayload ?? {}),
        returnTo: Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
        onComplete: Array.isArray(params.completeReturnTo) ? params.completeReturnTo[0] : params.completeReturnTo,
      }),
    [navPayload, params.completeReturnTo, params.returnTo]
  );
  const returnToPath = navCtx.routeBack || navCtx.returnTo || defaultReturnPath;
  const completeReturnPath = navCtx.onComplete || returnToPath;

  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [residentialDoc, setResidentialDoc] = useState<Document | null>(null);
  const [pendingRotationDegrees, setPendingRotationDegrees] = useState(0);
  const [address, setAddress] = useState<Profile['address'] | undefined>(undefined);
  const [addressPostal, setAddressPostal] = useState<Profile['addressPostal'] | undefined>(undefined);
  const [proofOfAddressDate, setProofOfAddressDate] = useState('');
  const [hasPostalAddress, setHasPostalAddress] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing...');
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [prefsProfileId, setPrefsProfileId] = useState<string | null>(null);
  const [showWizardHints, setShowWizardHints] = useState(true);
  const [step, setStep] = useState<'info' | 'capture'>('info');
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const deletedDocIdsRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);
  const baselineSignatureRef = useRef<string | null>(null);
  const initialAddressRef = useRef<string>('');
  const initialPostalAddressRef = useRef<string>('');
  const initialHasPostalRef = useRef<boolean>(false);
  const initialProofDateRef = useRef<string>('');
  const showHintsValue = userPrefs ? userPrefs.showAddressWizardHint !== false : showWizardHints;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showBlockingIssues, setShowBlockingIssues] = useState(false);

  useEffect(() => {
    const existingProfile = listByType<Profile>('Profile')[0];
    if (!existingProfile) return;
    setProfileId(existingProfile.id);
    setProfile(existingProfile);
    setAddress(existingProfile.address ? { ...existingProfile.address } : undefined);
    setAddressPostal(existingProfile.addressPostal ? { ...existingProfile.addressPostal } : undefined);
    const nextHasPostal = existingProfile.hasPostalAddress ?? !!existingProfile.addressPostal;
    setHasPostalAddress(nextHasPostal);
    initialAddressRef.current = addressSignature(existingProfile.address);
    initialPostalAddressRef.current = addressSignature(existingProfile.addressPostal);
    initialHasPostalRef.current = nextHasPostal;
    setPrefsProfileId(existingProfile.id);
    const prefs = ensureUserPrefs(existingProfile.id);
    setUserPrefs(prefs);
    const show = prefs.showAddressWizardHint !== false;
    setShowWizardHints(show);
    setStep(show ? 'info' : 'capture');

    const docs = listByType<Document>('Document').filter(
      doc => doc.parentType === 'Profile' && doc.parentId === existingProfile.id && doc.kind === 'PROOF_OF_ADDRESS',
    );
    const matchByCode = (code: string) =>
      docs.find(doc => (doc.requirementCode ?? '').toUpperCase() === code.toUpperCase());
    const matchByLabel = (label: string) =>
      docs.find(doc => (doc.requirementRelatedLabel ?? '').toUpperCase() === label.toUpperCase());

    const existingResidential = matchByCode(slotMeta.residential.code) ?? matchByLabel(slotMeta.residential.label) ?? docs[0];
    if (existingResidential && baselineSignatureRef.current === null) {
      baselineSignatureRef.current = `${existingResidential.id}:${existingResidential.updatedAt ?? existingResidential.createdAt ?? ''}`;
    }
    setResidentialDoc(existingResidential ?? null);
    const nextProofDate = toDateInputValue(
      existingProfile.proofOfAddressDate ?? existingResidential?.capturedAt ?? existingResidential?.createdAt ?? '',
    );
    setProofOfAddressDate(nextProofDate);
    initialProofDateRef.current = nextProofDate;
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
        const updated = { ...base, showAddressWizardHint: value };
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

  const openAddress = useCallback(
    (key: AddressSheetKey, title: string) => {
      setSheet({ key, title, type: 'address' });
    },
    [],
  );

  const openProofOfAddressDate = useCallback(() => {
    setSheet({ type: 'text', key: 'proofOfAddressDate', title: 'Letter date', mask: 'date' });
  }, []);

  const buildSingleLineAddress = useCallback((parts: {
    line1: string;
    line2: string;
    suburb: string;
    city: string;
  }) => {
    const items = [parts.line1, parts.line2, parts.suburb, parts.city]
      .map(value => value.trim())
      .filter(Boolean);
    return items.join(', ');
  }, []);

  const saveAddress = useCallback(
    (key: AddressSheetKey, value: {
      line1: string;
      line2: string;
      suburb: string;
      city: string;
      postCode: string;
    }) => {
      const line1 = value.line1.trim();
      const line2 = value.line2.trim();
      const suburb = value.suburb.trim();
      const city = value.city.trim();
      const postCode = value.postCode.trim();

      if (!line1) {
        Alert.alert('Invalid input', 'Line 1 is required.');
        return;
      }
      if (!suburb && !city) {
        Alert.alert('Invalid input', 'Please provide a suburb or city.');
        return;
      }

      const postCodeErr = validatePostCode(postCode);
      if (postCodeErr) {
        Alert.alert('Invalid input', postCodeErr);
        return;
      }

      const singleLine = buildSingleLineAddress({ line1, line2, suburb, city });
      const addressErr = validateAddressSingleLine(singleLine);
      if (addressErr) {
        Alert.alert('Invalid input', addressErr);
        return;
      }

      const commitSave = () => {
        const normalize = (v: string) => (v ? v : undefined);
        const updated = {
          ...(key === 'address' ? address : addressPostal),
          line1: normalize(line1),
          line2: normalize(line2),
          suburb: normalize(suburb),
          city: normalize(city),
          postCode: normalize(postCode),
          singleLine: normalize(singleLine),
        };
        if (key === 'address') {
          setAddress(updated);
        } else {
          setAddressPostal(updated);
        }
        setSheet(null);
      };

      if (isAddressTooLong(singleLine)) {
        const limit = getAddressLengthLimit();
        const addressLen = singleLine.trim().length;
        Alert.alert(
          'Address too long',
          addressTooLongAlertMessage(limit, addressLen),
          [
            { text: 'Edit', style: 'cancel' },
            { text: 'Continue', onPress: commitSave },
          ],
        );
        return;
      }

      commitSave();
    },
    [address, addressPostal, buildSingleLineAddress],
  );

  const handleToggleHasPostal = useCallback(() => {
    setHasPostalAddress(prev => {
      const next = !prev;
      if (!next) {
        setAddressPostal(undefined);
      }
      return next;
    });
  }, []);

  const deleteDocumentArtifacts = useCallback(async (doc?: Document | null) => {
    if (!doc) return;
    const seen = new Set<string>();
    for (const uri of [doc.uri, doc.filePath, doc.thumbPath]) {
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      try {
        await deleteOwnedDocFile(uri);
      } catch {
        // ignore cleanup failures
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
      if (savedRef.current) return;
      deletedDocIdsRef.current.clear();
      const created = Array.from(createdDocIdsRef.current);
      created.forEach(id => {
        void deleteDocumentById(id);
      });
    };
  }, [deleteDocumentById]);

  const ensureProfileId = useCallback(() => {
    if (profileId) return profileId;
    const existingProfile = listByType<Profile>('Profile')[0];
    if (existingProfile) {
      setProfileId(existingProfile.id);
      return existingProfile.id;
    }
    return null;
  }, [profileId]);

  const persistDocMetadata = useCallback((doc: Document, slot: AddressSlot) => {
    const meta = slotMeta[slot];
    const updated = touch({
      ...doc,
      requirementCode: meta.code,
      requirementRelatedLabel: meta.label,
      name: meta.label,
    } as Document);
    void persistAsync(updated);
    return updated;
  }, []);

  const pickImage = useCallback(
    async (source: 'camera' | 'library') => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const parentId = ensureProfileId();
      if (!parentId) {
        Alert.alert('Profile missing', 'Add your profile details before capturing address proof.');
        return;
      }

      if (source === 'camera') {
        const ok = await ensureCameraPermission({
          title: 'Camera access needed',
          settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
        });
        if (!ok) return;
      } else {
        const prefs = ensureUserPrefs(parentId);
        const shouldShowPhotoLibraryAlert = prefs.showPhotoLibraryAlert !== false;
        const ok = await ensurePhotoLibraryPermission({
          title: 'Photo library access needed',
          settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
          showLimitedAccessAlert: shouldShowPhotoLibraryAlert,
          onDisableLimitedAccessAlert: () => {
            const updated = { ...prefs, showPhotoLibraryAlert: false };
            saveUserPrefs(updated);
          },
        });
        if (!ok) return;
      }

      const picker =
        source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      if (jpegExportType) {
        (pickerOptions as any).imageExportType = jpegExportType;
      }

      setProcessingLabel('Uploading residential address');
      setProcessing(true);
      await nextFrame();
      try {
        const result = await picker(pickerOptions as any);
        if (!result || (result as any).canceled || !(result as any).assets?.length) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = await prepareWizardImage((result as any).assets[0]);
        const existingForUpsert =
          residentialDoc && createdDocIdsRef.current.has(residentialDoc.id) ? residentialDoc : undefined;
        if (residentialDoc && !createdDocIdsRef.current.has(residentialDoc.id)) {
          deletedDocIdsRef.current.add(residentialDoc.id);
        }
        const { document, createdNew } = await upsertWizardDocumentFromAsset({
          asset,
          context: {
            parentType: 'Profile',
            parentId,
            holderProfileId: parentId,
            label: slotMeta.residential.label,
            kind: 'PROOF_OF_ADDRESS',
            side: 'not_applicable',
            createDocumentId: () => createRandomId('doc'),
          },
          existing: existingForUpsert,
        });
        const tagged = persistDocMetadata(document, 'residential');
        if (createdNew) {
          createdDocIdsRef.current.add(tagged.id);
        }
        setResidentialDoc(tagged);
        setProofOfAddressDate(toDateInputValue(tagged.capturedAt ?? tagged.createdAt ?? new Date().toISOString()));
        setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
      } catch (error: any) {
        Alert.alert('Unable to save photo', error?.message ?? 'Something went wrong while saving this photo.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [ensureProfileId, persistDocMetadata, processing, residentialDoc],
  );

  const handleUpload = useCallback(
    async () => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const parentId = ensureProfileId();
      if (!parentId) {
        Alert.alert('Profile missing', 'Add your profile details before uploading address proof.');
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
      setProcessingLabel('Uploading residential address');
      setProcessing(true);
      await nextFrame();
      try {
        if (isPdf) {
          const rasterized = await rasterizePdf(asset.uri, 150);
          try {
            if (rasterized.pages.length > 1) {
              Alert.alert(
                'Only first page used',
                'Only the first page will be used. Make sure your name and address are on page 1. If not, use the camera or photo library instead.'
              );
            }
            const firstPage = rasterized.pages[0];
            if (!firstPage) return;
            const pdfAsset = {
              uri: firstPage.uri,
              mimeType: 'image/jpeg',
              fileName: 'address.pdf.jpg',
              name: 'address.pdf.jpg',
            };
            const existingForUpsert =
              residentialDoc && createdDocIdsRef.current.has(residentialDoc.id) ? residentialDoc : undefined;
            if (residentialDoc && !createdDocIdsRef.current.has(residentialDoc.id)) {
              deletedDocIdsRef.current.add(residentialDoc.id);
            }
            const { document, createdNew } = await upsertWizardDocumentFromAsset({
              asset: pdfAsset as any,
            context: {
              parentType: 'Profile',
              parentId,
              holderProfileId: parentId,
              label: slotMeta.residential.label,
              kind: 'PROOF_OF_ADDRESS',
              side: 'not_applicable',
              createDocumentId: () => createRandomId('doc'),
            },
              existing: existingForUpsert,
            });
            const hydrated = persistDocMetadata(document, 'residential');
            if (createdNew) createdDocIdsRef.current.add(hydrated.id);
            setResidentialDoc(hydrated);
            setProofOfAddressDate(toDateInputValue(hydrated.capturedAt ?? hydrated.createdAt ?? new Date().toISOString()));
          } finally {
            await rasterized.cleanup().catch(() => {});
          }
          return;
        }
        const prepared = await prepareWizardImage(asset as any);
        const existingForUpsert =
          residentialDoc && createdDocIdsRef.current.has(residentialDoc.id) ? residentialDoc : undefined;
        if (residentialDoc && !createdDocIdsRef.current.has(residentialDoc.id)) {
          deletedDocIdsRef.current.add(residentialDoc.id);
        }
        const { document, createdNew } = await upsertWizardDocumentFromAsset({
          asset: prepared as any,
          context: {
            parentType: 'Profile',
            parentId,
            holderProfileId: parentId,
            label: slotMeta.residential.label,
            kind: 'PROOF_OF_ADDRESS',
            side: 'not_applicable',
            createDocumentId: () => createRandomId('doc'),
          },
          existing: existingForUpsert,
        });
        const hydrated = persistDocMetadata(document, 'residential');
        if (createdNew) createdDocIdsRef.current.add(hydrated.id);
        setResidentialDoc(hydrated);
        setProofOfAddressDate(toDateInputValue(hydrated.capturedAt ?? hydrated.createdAt ?? new Date().toISOString()));
      } catch (error: any) {
        Alert.alert('Unable to use file', error?.message ?? 'Something went wrong while importing the file. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [ensureProfileId, persistDocMetadata, processing, residentialDoc],
  );

  const handleDelete = useCallback(async () => {
    if (processing) {
      Alert.alert('Please wait', 'Finishing up the current step…');
      return;
    }
    if (!residentialDoc) return;
    setProcessing(true);
    try {
      if (createdDocIdsRef.current.has(residentialDoc.id)) {
        await deleteDocumentArtifacts(residentialDoc);
      } else {
        deletedDocIdsRef.current.add(residentialDoc.id);
      }
      setResidentialDoc(null);
      setProofOfAddressDate('');
    } catch (error: any) {
      Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
    } finally {
      setProcessing(false);
    }
  }, [deleteDocumentArtifacts, processing, residentialDoc]);

  const currentSignature = useMemo(() => {
    if (!residentialDoc) return '';
    return `${residentialDoc.id}:${residentialDoc.updatedAt ?? residentialDoc.createdAt ?? ''}`;
  }, [residentialDoc]);
  const normalizedPendingRotation = useMemo(
    () => normalizeRotation(pendingRotationDegrees),
    [pendingRotationDegrees],
  );
  const hasPendingRotation = normalizedPendingRotation !== 0;

  useEffect(() => {
    if (baselineSignatureRef.current === null) {
      baselineSignatureRef.current = currentSignature;
    }
  }, [currentSignature]);

  useEffect(() => {
    if (!residentialDoc && pendingRotationDegrees !== 0) {
      setPendingRotationDegrees(0);
    }
  }, [pendingRotationDegrees, residentialDoc]);

  const hasChanges = useMemo(() => {
    const baseline = baselineSignatureRef.current;
    if (baseline === null) return false;
    return baseline !== currentSignature;
  }, [currentSignature]);

  const applyPendingImageRotation = useCallback(async (): Promise<Document | null> => {
    if (!residentialDoc) return residentialDoc;
    if (!normalizedPendingRotation) return residentialDoc;
    const sourceUri = resolveDocumentUri(residentialDoc.uri ?? residentialDoc.filePath);
    if (!sourceUri) return residentialDoc;
    const manipulated = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ rotate: normalizedPendingRotation }],
      {},
    );
    if (manipulated.uri !== sourceUri) {
      await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
    }
    const updated = touch({ ...residentialDoc } as Document);
    persist(updated);
    setResidentialDoc(updated);
    setPendingRotationDegrees(0);
    return updated;
  }, [normalizedPendingRotation, residentialDoc]);

  const addressChanged = addressSignature(address) !== initialAddressRef.current;
  const postalAddressChanged = addressSignature(addressPostal) !== initialPostalAddressRef.current;
  const postalToggleChanged = hasPostalAddress !== initialHasPostalRef.current;
  const proofDateChanged = proofOfAddressDate !== initialProofDateRef.current;

  const renderCaptureCard = () => {
    const doc = residentialDoc;
    const meta = slotMeta.residential;
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    return (
      <PhotoCaptureCard
        isError={showBlockingIssues && !residentialDoc}
        title={meta.title}
        required
        helpText={meta.help}
        previewUri={uri}
        previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
        previewRotationDegrees={pendingRotationDegrees}
        persistRotationOnPreviewClose={false}
        previewKind={uri ? (isPdf ? 'pdf' : 'image') : undefined}
        previewLabel={name || undefined}
        onPressCamera={() => pickImage('camera')}
        onPressLibrary={() => pickImage('library')}
        onPressRotate={() => setPendingRotationDegrees((prev) => prev - 90)}
        showRotateButton={!!uri && !isPdf}
        onPressUpload={handleUpload}
        showUploadButton
        onDelete={handleDelete}
        disabled={processing}
      />
    );
  };

  const hasUnsavedChanges = hasChanges || hasPendingRotation || addressChanged || postalAddressChanged || postalToggleChanged || proofDateChanged;
  const canSave = hasUnsavedChanges && !processing;
  const saveDisabled = processing || !canSave;
  const focusIssue = useCallback((issueKey?: string) => {
    if (!issueKey) return;
    if (issueKey === 'residentialDoc') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (issueKey === 'address') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      requestAnimationFrame(() => openAddress('address', 'Residential address'));
      return;
    }
    if (issueKey === 'proofOfAddressDate') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      requestAnimationFrame(() => openProofOfAddressDate());
      return;
    }
    if (issueKey === 'addressPostal') {
      scrollRef.current?.scrollToEnd?.({ animated: true });
      requestAnimationFrame(() => openAddress('addressPostal', 'Postal address'));
    }
  }, [openAddress, openProofOfAddressDate]);

  const blockingValidation = useMemo(() => {
    const issues: WizardBlockingIssue[] = [];
    if (!residentialDoc) {
      issues.push({
        key: 'residentialDoc',
        label: 'Residential address proof',
        kind: 'missing',
        message: 'Capture proof of your residential address.',
      });
    }
    if (!address?.singleLine || !address?.postCode) {
      issues.push({
        key: 'address',
        label: 'Residential address',
        kind: 'missing',
        message: 'Enter your residential address.',
      });
    }
    if (!proofOfAddressDate) {
      issues.push({
        key: 'proofOfAddressDate',
        label: 'Letter date',
        kind: 'missing',
        message: 'Enter the letter date.',
      });
    } else if (!validateDateISO(proofOfAddressDate)) {
      issues.push({
        key: 'proofOfAddressDate',
        label: 'Letter date',
        kind: 'invalid',
        message: 'Use YYYY-MM-DD format.',
      });
    }
    if (hasPostalAddress && (!addressPostal?.singleLine || !addressPostal?.postCode)) {
      issues.push({
        key: 'addressPostal',
        label: 'Postal address',
        kind: 'missing',
        message: 'Enter your postal address.',
      });
    }
    return buildWizardBlockingResult(issues);
  }, [address, addressPostal, hasPostalAddress, proofOfAddressDate, residentialDoc]);

  const statusListItems = showBlockingIssues && blockingValidation.hasBlockingIssues
    ? blockingValidation.issues.map((issue) => issue.label)
    : [
        ...(!residentialDoc ? ['Residential address proof'] : []),
        ...((!address?.singleLine || !address?.postCode) ? ['Residential address'] : []),
        ...((!proofOfAddressDate || !validateDateISO(proofOfAddressDate)) ? ['Letter date'] : []),
        ...(hasPostalAddress && (!addressPostal?.singleLine || !addressPostal?.postCode) ? ['Postal address'] : []),
      ];

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
    let activeDoc: Document | null = residentialDoc;
    try {
      activeDoc = await applyPendingImageRotation();
    } catch (error: any) {
      Alert.alert('Unable to save', error?.message ?? 'Something went wrong while applying image rotation.');
      return;
    }
    if (profile) {
      const residentialAddressChanged = addressSignature(address) !== initialAddressRef.current;
      const nextResidentialAddress = address
        ? residentialAddressChanged
          ? {
              ...address,
              province: '',
              homeType: undefined,
              securityMeasures: [],
            }
          : { ...address }
        : undefined;
      const nextProfile = touch({
        ...profile,
        proofOfAddressDate,
        address: nextResidentialAddress,
        addressPostal: hasPostalAddress ? (addressPostal ? { ...addressPostal } : undefined) : undefined,
        hasPostalAddress,
      });
      persist(nextProfile);
      setProfile(nextProfile);
      initialAddressRef.current = addressSignature(nextProfile.address);
      initialPostalAddressRef.current = addressSignature(nextProfile.addressPostal);
      initialHasPostalRef.current = nextProfile.hasPostalAddress ?? false;
      initialProofDateRef.current = proofOfAddressDate;
    }
    const deletedDocIds = Array.from(deletedDocIdsRef.current);
    deletedDocIds.forEach(id => {
      const doc = getById<Document>(id);
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
      deleteEntity(id);
    });
    baselineSignatureRef.current = activeDoc
      ? `${activeDoc.id}:${activeDoc.updatedAt ?? activeDoc.createdAt ?? ''}`
      : '';
    savedRef.current = true;
    setShowBlockingIssues(false);
    deletedDocIdsRef.current.clear();
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [
    address,
    addressPostal,
    applyPendingImageRotation,
    blockingValidation,
    focusIssue,
    hasPostalAddress,
    navCtx,
    profile,
    proofOfAddressDate,
    residentialDoc,
    returnToPath,
    router,
  ]);

  const discardChanges = useCallback(() => {
    const created = Array.from(createdDocIdsRef.current);
    if (created.length) {
      created.forEach(id => {
        void deleteDocumentById(id);
      });
      createdDocIdsRef.current.clear();
    }
    deletedDocIdsRef.current.clear();
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [deleteDocumentById, navCtx, returnToPath, router]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const actions: AlertButton[] = [
        { text: 'Continue editing', style: 'cancel' as const },
        { text: 'Discard', style: 'destructive' as const, onPress: discardChanges },
      ];
      if (canSave) {
        actions.push({ text: 'Save', onPress: handleSave });
      }
      Alert.alert('Unsaved changes', 'Would you like to save your changes before leaving?', actions);
      return;
    }
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [canSave, discardChanges, handleSave, hasUnsavedChanges, navCtx, returnToPath, router]);

  const Cell = ({
    label,
    value,
    onPress,
    required,
    error,
    multiline,
    disabled,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    required?: boolean;
    error?: boolean;
    multiline?: boolean;
    disabled?: boolean;
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, required && styles.requiredLabel]}>{required ? `${label} *` : label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={({ pressed }) => [
          styles.cell,
          multiline && styles.cellMultiline,
          disabled && styles.cellDisabled,
          error && styles.cellError,
          pressed && !disabled && { opacity: 0.92 },
        ]}
      >
        <Text
          style={[
            styles.value,
            styles.valueText,
            !value && styles.placeholder,
            disabled && styles.valueDisabled,
            error && styles.errorText,
          ]}
          numberOfLines={multiline ? undefined : 2}
          ellipsizeMode="tail"
        >
          {value || 'Tap to add'}
        </Text>
        <Text style={[styles.chev, disabled && styles.chevDisabled, error && styles.chevError]}>›</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <View style={styles.container}>
        {null}
        <PageHeader
          title="Proof of address"
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={saveDisabled}
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
          <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <View style={styles.intro}>
              {/* <Text style={styles.h1}>Capture proof of address</Text> */}
              <Text style={styles.lead}>
                We will guide you through capturing proof of your residential address so it is ready when you need it.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Before you start</Text>
              {[
                'Use a document less than 3 months old.',
                'Make sure your name and address are clearly visible.',
                'Use a plain background and good lighting.',
              ].map((item, index) => bullet(item, `need_${index}`))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tips for a clear photo</Text>
              {[
                'Fill the frame with the document.',
                'Avoid glare or shadows across the text.',
                'Keep the camera steady so details stay sharp.',
              ].map((item, index) => bullet(item, `tip_${index}`))}
            </View>

            <View style={styles.hintRow}>
              <View style={styles.hintTextWrap}>
                <Text style={styles.hintLabel}>Show these tips next time</Text>
                <Text style={styles.hintHelp}>You can change this later under Settings → Hints.</Text>
              </View>
              <IconRoundButton
                buttonType={showHintsValue ? 'confirm' : 'stop'}
                accessibilityLabel={showHintsValue ? 'Hide these tips next time' : 'Show these tips next time'}
                onPress={toggleShowHints}
                disabled={processing}
                size={36}
                borderColor={showHintsValue ? tones.green.base : neutral.base}
              />
            </View>

            <Button label="Continue" onPress={() => setStep('capture')} tone="teal" align="center" centerText />
          </PageScrollView>
        ) : (
          <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <Text style={styles.lede}>
              Capture proof of your residential address. The uploaded document is used to build a supporting document bundle.
            </Text>

            {renderCaptureCard()}

            <View style={styles.detailsCard}>
              <View style={styles.detailsHeader}>
                <Text style={styles.detailsTitle}>Address details</Text>
              </View>
              <Cell
                label="Address"
                value={
                  address?.singleLine && address?.postCode
                    ? `${address.singleLine}, ${address.postCode}`
                    : address?.singleLine ?? address?.postCode
                }
                onPress={() => openAddress('address', 'Residential address')}
                required
                multiline
                error={showBlockingIssues && (!address?.singleLine || !address?.postCode)}
              />
              <Cell
                label="Letter date"
                value={proofOfAddressDate}
                onPress={() => {
                  if (!residentialDoc) {
                    Alert.alert(
                      'Upload proof first',
                      'You can change the letter date after you upload a proof of address document.',
                    );
                    return;
                  }
                  openProofOfAddressDate();
                }}
                required
                disabled={!residentialDoc}
                error={showBlockingIssues && (!proofOfAddressDate || !validateDateISO(proofOfAddressDate))}
              />
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Has postal address</Text>
                <IconRoundButton
                  buttonType={hasPostalAddress ? 'confirm' : 'stop'}
                  accessibilityLabel={hasPostalAddress ? 'Remove postal address' : 'Add a postal address'}
                  onPress={handleToggleHasPostal}
                  borderColor={hasPostalAddress ? tones.green.base : neutral.base}
                  size={36}
                  hitSlop={8}
                  style={styles.toggleButton}
                />
              </View>
              {hasPostalAddress ? (
                <Cell
                  label="Postal address (excluding postcode)"
                  value={addressPostal?.singleLine && addressPostal?.postCode
                    ? `${addressPostal.singleLine}, ${addressPostal.postCode}`
                    : addressPostal?.singleLine ?? addressPostal?.postCode}
                  onPress={() => openAddress('addressPostal', 'Postal address')}
                  required={hasPostalAddress}
                  multiline
                  error={showBlockingIssues && hasPostalAddress && (!addressPostal?.singleLine || !addressPostal?.postCode)}
                />
              ) : null}
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
                  <Text style={styles.captureStatusText}>All required details added.</Text>
                </View>
              )}
            </View>

            <ButtonSave
              label="Save"
              onPress={handleSave}
              disabled={saveDisabled}
              loading={processing}
              align="center"
            />
          </PageScrollView>
        )}
      </View>
      <ProcessingBlocker visible={processing} label={processingLabel} />
      <HelpModal {...helpModalProps} />
      {sheet?.type === 'address' && (
        <AddressSheet
          visible
          title={sheet.title}
          initial={sheet.key === 'address' ? address : addressPostal}
          onCancel={() => setSheet(null)}
          onSave={(value) => saveAddress(sheet.key, value)}
        />
      )}
      {sheet?.type === 'text' && sheet.key === 'proofOfAddressDate' && (
        <EditTextSheet
          visible
          title={sheet.title}
          initial={proofOfAddressDate}
          placeholder="YYYY-MM-DD"
          mask={sheet.mask}
          autoCapitalize="none"
          onCancel={() => setSheet(null)}
          onSave={(value) => {
            setProofOfAddressDate(value.trim());
            setSheet(null);
          }}
        />
      )}
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { marginBottom: 12 },
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
    content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
    intro: { marginBottom: 4, gap: 10 },
    h1: { fontSize: 24, fontWeight: '700', color: neutral.onSurface },
    lead: { fontSize: 16, lineHeight: 22, color: neutral.base },
    lede: { color: neutral.base, fontSize: 15, lineHeight: 20 },
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
    label: { color: tones.teal.base, marginBottom: 6, fontWeight: '700' },
    requiredLabel: { color: tones.teal.base },
    captureStatus: { marginTop: 0, marginBottom: 0 },
    captureStatusPressable: { borderRadius: 16 },
    captureStatusPressed: { opacity: 0.96 },
    captureStatusBox: {
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
    },
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
    },
    cellMultiline: { alignItems: 'flex-start' },
    cellDisabled: {
      backgroundColor: neutral.surface,
    },
    cellError: {
      borderColor: tones.red.base,
    },
    value: { fontSize: 16, color: neutral.onSurface, flex: 1, marginRight: 10 },
    valueText: { fontWeight: '600' },
    placeholder: { color: neutral.base },
    valueDisabled: { color: neutral.base },
    errorText: { color: tones.red.base },
    chev: { color: neutral.base, fontSize: 20 },
    chevDisabled: { opacity: 0.5 },
    chevError: { color: tones.red.base },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    toggleLabel: { color: neutral.onSurface, fontWeight: '700' },
    toggleButton: { marginLeft: 12 },
  });
