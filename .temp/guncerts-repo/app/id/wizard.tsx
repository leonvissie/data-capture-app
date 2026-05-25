import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  type AlertButton,
} from 'react-native';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import ButtonCard from '../../src/components/ButtonCard';
import ButtonSave from '../../src/components/ButtonSave';
import Button from '../../src/components/Button';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import { useTones } from '../../src/theme/tones';
import { validateName, validateSAId } from '../../src/utils/validators';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApplicantSex, Application, Document, IdentityDocumentSide, Profile, UserPrefs } from '../../src/data/types';
import { ensureUserPrefs, persist, saveUserPrefs, touch, withMeta } from '../../src/data/repo';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { prepareWizardImage } from '../../src/utils/image';
import { deleteDocumentFiles } from '../../src/utils/documentStorage';
import { upsertWizardDocumentFromAsset } from '../../src/utils/wizardDocuments';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import PhotoCaptureCard from '../../src/components/PhotoCaptureCard';
import { nextFrame } from '../../src/utils/ui';
import ProcessingBlocker from '../../src/components/ProcessingBlocker';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { appConfig } from '../../src/config/appConfig';
import { rasterizePdf } from '../../src/pdf/rasterizer';
import { ensureDocumentBarcode } from '../../src/barcode/ensureDocumentBarcode';
import { logger } from '@/src/utils/logger';
import { useDevMode } from '../../src/providers/DevModeProvider';
import HelpModal from '../../src/components/HelpModal';
import { useHelpModal } from '../../src/help';
import { resolveDocumentUri } from '../../src/utils/documentPaths';
import {
  buildWizardBlockingResult,
  showWizardBlockingAlert,
  type WizardBlockingIssue,
} from '../../src/utils/wizardBlockingValidation';

type DocSlot = 'front' | 'back' | 'picture' | 'permit';
const allSlots: DocSlot[] = ['front', 'back', 'picture', 'permit'];

type SheetState = { type: 'idDetails'; title: string } | null;

const getRequiredSlots = (type?: Profile['idType'], foreign = false): DocSlot[] => {
  if (type === 'ID_CARD') return ['front', 'back'];
  if (type === 'ID_BOOK') return ['picture'];
  if (type === 'PASSPORT') return foreign ? ['picture', 'permit'] : ['picture'];
  return [];
};

const kindForIdType = (type?: Profile['idType']): Document['kind'] => {
  if (type === 'ID_BOOK') return 'ID_BOOK' as Document['kind'];
  if (type === 'PASSPORT') return 'PASSPORT' as Document['kind'];
  return 'ID_CARD' as Document['kind'];
};

const labelForIdType = (type?: Profile['idType']) => {
  if (type === 'PASSPORT') return 'passport';
  if (type === 'ID_BOOK') return 'ID book';
  if (type === 'ID_CARD') return 'ID card';
  return 'ID';
};

const docIdType = (doc?: Document): Profile['idType'] | undefined => {
  if (!doc) return undefined;
  const kind = `${doc.kind ?? ''}`.toUpperCase();
  if (kind.includes('PASSPORT')) return 'PASSPORT';
  if (kind.includes('BOOK')) return 'ID_BOOK';
  return 'ID_CARD';
};

const jpegExportType = (ImagePicker as any)?.ImageExportType?.JPEG ?? undefined;
const defaultReturnPath = '/(tabs)/profile';
const WIZARD_HELP_KEY = 'helpWizardId';

const createRandomId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`;

const slotTitles: Record<DocSlot, string> = {
  front: 'Front side',
  back: 'Back side',
  picture: 'Picture page',
  permit: 'Permanent residence permit',
};

const idDocumentKinds: Document['kind'][] = ['ID_CARD', 'ID_BOOK', 'PASSPORT'];

const signatureForState = ({
  docs,
  idType,
  isForeignNational,
}: {
  docs: Partial<Record<DocSlot, Document>>;
  idType?: Profile['idType'];
  isForeignNational: boolean;
}) => {
  const slotSig = (slot: DocSlot) => {
    const doc = docs[slot];
    if (!doc) return `${slot}:`;
    const stamp = doc.updatedAt ?? doc.createdAt ?? '';
    return `${slot}:${doc.id}:${stamp}`;
  };
  return `${idType ?? ''}|${isForeignNational ? '1' : '0'}|${slotSig('front')}|${slotSig('back')}|${slotSig('picture')}|${slotSig('permit')}`;
};

const normalizeIdentitySide = (value?: IdentityDocumentSide | null) => {
  return (value ?? 'both') as IdentityDocumentSide;
};

const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;

const parseNavParam = (raw?: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
};

const deriveInitialsFromNames = (names?: string) => {
  if (!names) return '';
  const parts = names
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part[0] ?? '');
  return parts.length ? parts.join('').toUpperCase() : '';
};

const parsePdf417Profile = (raw?: string | null) => {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length < 5) return null;
  const surname = (parts[0] ?? '').trim();
  const givenNames = (parts[1] ?? '').trim();
  const idNumber = (parts[4] ?? '').trim().replace(/\D/g, '');
  if (!surname && !givenNames && !idNumber) return null;
  return {
    surname,
    givenNames,
    idNumber,
    initials: deriveInitialsFromNames(givenNames),
  };
};

function IdDetailsSheet({
  visible,
  title,
  idType,
  initial,
  errors,
  onClearError,
  onValidateIdNumber,
  onCancel,
  onSave,
  styles,
}: {
  visible: boolean;
  title: string;
  idType: Profile['idType'];
  initial: {
    idNumber: string;
    givenNames: string;
    initials: string;
    surname: string;
    sexAtBirth?: ApplicantSex;
  };
  errors?: {
    idNumber?: boolean;
    givenNames?: boolean;
    surname?: boolean;
    sexAtBirth?: boolean;
  };
  onClearError?: (field: 'idNumber' | 'givenNames' | 'surname' | 'sexAtBirth') => void;
  onValidateIdNumber?: (value: string) => void;
  onCancel: () => void;
  onSave: (value: {
    idNumber: string;
    givenNames: string;
    initials: string;
    surname: string;
    sexAtBirth: ApplicantSex;
  }) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [idNumber, setIdNumber] = useState(initial.idNumber ?? '');
  const [givenNames, setGivenNames] = useState(initial.givenNames ?? '');
  const [initials, setInitials] = useState(initial.initials ?? '');
  const [surname, setSurname] = useState(initial.surname ?? '');
  const [sexAtBirth, setSexAtBirth] = useState<ApplicantSex>(initial.sexAtBirth ?? 'unknown');
  const initialsDirtyRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setIdNumber(initial.idNumber ?? '');
    setGivenNames(initial.givenNames ?? '');
    setInitials(initial.initials ?? '');
    setSurname(initial.surname ?? '');
    setSexAtBirth(initial.sexAtBirth ?? 'unknown');
    initialsDirtyRef.current = false;
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleIdChange = useCallback(
    (value: string) => {
      onClearError?.('idNumber');
      if (idType === 'PASSPORT') {
        const next = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
        setIdNumber(next);
      } else {
        const next = value.replace(/\D/g, '').slice(0, 13);
        setIdNumber(next);
      }
    },
    [idType],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onCancel} />
          <View style={[styles.sheet, { paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom) }]}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <ScrollView
              style={styles.fieldScroll}
              contentContainerStyle={styles.fieldScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{idType === 'PASSPORT' ? 'Passport number' : 'ID number'}</Text>
                <TextInput
                  style={[styles.sheetInput, errors?.idNumber && styles.sheetInputError]}
                  value={idNumber}
                  onChangeText={handleIdChange}
                  onBlur={() => onValidateIdNumber?.(idNumber)}
                  keyboardType={idType === 'PASSPORT' ? 'default' : 'number-pad'}
                  autoCapitalize={idType === 'PASSPORT' ? 'characters' : 'none'}
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Full names</Text>
                <TextInput
                  style={[styles.sheetInput, errors?.givenNames && styles.sheetInputError]}
                  value={givenNames}
                  onChangeText={(value) => {
                    onClearError?.('givenNames');
                    setGivenNames(value);
                    if (!initialsDirtyRef.current) {
                      setInitials(deriveInitialsFromNames(value));
                    }
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Surname</Text>
                <TextInput
                  style={[styles.sheetInput, errors?.surname && styles.sheetInputError]}
                  value={surname}
                  onChangeText={(value) => {
                    onClearError?.('surname');
                    setSurname(value);
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Initials</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={initials}
                  onChangeText={(value) => {
                    initialsDirtyRef.current = true;
                    setInitials(value);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              {idType === 'PASSPORT' ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Sex at birth</Text>
                  <Text style={styles.fieldHelpText}>
                    Required when a South African ID number is not available.
                  </Text>
                  <View style={styles.optionRow}>
                    {(['female', 'male'] as ApplicantSex[]).map((option) => {
                      const selected = sexAtBirth === option;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => {
                            onClearError?.('sexAtBirth');
                            setSexAtBirth(option);
                          }}
                          style={[
                            styles.optionButton,
                            selected ? styles.optionButtonSelected : null,
                            errors?.sexAtBirth ? styles.optionButtonError : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionButtonText,
                              selected ? styles.optionButtonTextSelected : null,
                            ]}
                          >
                            {option === 'female' ? 'Female' : 'Male'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.sheetRow}>
              <Pressable style={[styles.sheetBtn, styles.sheetCancel]} onPress={onCancel}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.sheetBtn, styles.sheetSave]}
                onPress={() =>
                  onSave({ idNumber, givenNames, initials, surname, sexAtBirth })
                }
              >
                <Text style={styles.sheetSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function IdWizardScreen() {
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
  const cardPositionsRef = useRef<Partial<Record<DocSlot, number>>>({});
  const params = useLocalSearchParams<{
    nav?: string | string[];
    returnTo?: string | string[];
    completeReturnTo?: string | string[];
    previewMode?: string | string[];
    mode?: string | string[];
    intro?: string | string[];
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
        returnTo: Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
        onComplete: Array.isArray(params.completeReturnTo) ? params.completeReturnTo[0] : params.completeReturnTo,
      }),
    [navPayload, params.completeReturnTo, params.returnTo]
  );
  const returnToPath = navCtx.routeBack || navCtx.returnTo || defaultReturnPath;
  const completeReturnPath = navCtx.onComplete || returnToPath;
  const encodedReturnTo = useMemo(() => encodeURIComponent(returnToPath), [returnToPath]);
  const encodedCompleteReturnTo = useMemo(() => encodeURIComponent(completeReturnPath), [completeReturnPath]);
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);
  const fromPreview = useMemo(() => {
    const raw = Array.isArray(params.previewMode) ? params.previewMode[0] : params.previewMode;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'preview';
  }, [params.previewMode]);
  const editMode = useMemo(() => {
    const raw = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    const norm = `${raw ?? ''}`.trim().toLowerCase();
    if (!norm) return fromPreview;
    return norm === 'edit' || norm === '1' || norm === 'true' || norm === 'yes' || fromPreview;
  }, [fromPreview, params.mode]);

  const initialProfile = useMemo(() => {
    const existing = listByType<Profile>('Profile')[0];
    if (existing) return existing;
    return withMeta<Profile>({
      id: createRandomId('prof'),
      type: 'Profile',
    } as Profile);
  }, []);
  const initialIdType = useMemo<Profile['idType']>(() => {
    const allDocs = listByType<Document>('Document').filter(
      doc => doc.parentType === 'Profile' && doc.parentId === initialProfile.id && idDocumentKinds.includes(doc.kind),
    );
    const latest = allDocs
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })[0];
    const docType = docIdType(latest);
    if (docType) return docType;
    if (initialProfile.idType) return initialProfile.idType;
    return 'ID_CARD';
  }, [initialProfile.id, initialProfile.idType]);
  const initialProfileIdType = useMemo<Profile['idType'] | undefined>(() => initialProfile.idType, [initialProfile.idType]);
  const initialDocType = useMemo<Profile['idType'] | null>(() => {
    const allDocs = listByType<Document>('Document').filter(
      doc => doc.parentType === 'Profile' && doc.parentId === initialProfile.id && idDocumentKinds.includes(doc.kind),
    );
    if (!allDocs.length) return null;
    const latest = allDocs
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })[0];
    return docIdType(latest) ?? null;
  }, [initialProfile.id]);
  const initialIdTypeRef = useRef<Profile['idType']>(initialIdType);
  const initialIdNumberRef = useRef<string>(initialProfile.idNumber?.trim() ?? '');
  const initialGivenNamesRef = useRef<string>(initialProfile.givenNames?.trim() ?? '');
  const initialSurnameRef = useRef<string>(initialProfile.surname?.trim() ?? '');
  const initialInitialsRef = useRef<string>(initialProfile.initials?.trim() ?? '');
  const initialForeignRef = useRef<boolean>(!!initialProfile.isForeignNational);
  const initialSexAtBirthRef = useRef<ApplicantSex>(initialProfile.sexAtBirth ?? 'unknown');
  const { devModeEnabled } = useDevMode();
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [idType, setIdType] = useState<Profile['idType']>(initialIdType);
  const [idNumber, setIdNumber] = useState<string>(initialProfile.idNumber?.trim() ?? '');
  const [givenNames, setGivenNames] = useState<string>(initialProfile.givenNames?.trim() ?? '');
  const [surname, setSurname] = useState<string>(initialProfile.surname?.trim() ?? '');
  const [initials, setInitials] = useState<string>(initialProfile.initials?.trim() ?? '');
  const [idNumberBlurred, setIdNumberBlurred] = useState(false);
  const [idNumberValidationMessage, setIdNumberValidationMessage] = useState<string | null>(null);
  const [isForeignNational, setIsForeignNational] = useState<boolean>(!!initialProfile.isForeignNational);
  const [sexAtBirth, setSexAtBirth] = useState<ApplicantSex>(initialProfile.sexAtBirth ?? 'unknown');
  const [docs, setDocs] = useState<Partial<Record<DocSlot, Document>>>({});
  const [pendingRotationBySlot, setPendingRotationBySlot] = useState<Partial<Record<DocSlot, number>>>({});
  const [bothSidesSinglePage, setBothSidesSinglePage] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processing...');
  const [barcodeProcessing, setBarcodeProcessing] = useState(false);
  const [barcodeProfile, setBarcodeProfile] = useState<{
    surname: string;
    givenNames: string;
    initials: string;
    idNumber: string;
  } | null>(null);
  const [barcodeExtracted, setBarcodeExtracted] = useState(false);
  const [barcodeAttempted, setBarcodeAttempted] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [idDetailErrors, setIdDetailErrors] = useState<{
    idNumber?: boolean;
    givenNames?: boolean;
    surname?: boolean;
    sexAtBirth?: boolean;
  }>({});
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [prefsProfileId, setPrefsProfileId] = useState<string | null>(null);
  const [showWizardHints, setShowWizardHints] = useState(true);
  const [step, setStep] = useState<'info' | 'capture'>(editMode ? 'capture' : 'info');
  const createdDocIdsRef = useRef<Set<string>>(new Set());
  const savedRef = useRef(false);
  const [showBlockingIssues, setShowBlockingIssues] = useState(false);
  const baselineSignatureRef = useRef<string | null>(null);
  const mismatchAlertShownRef = useRef(false);
  const prevForeignRef = useRef(isForeignNational);
  const initialsTouchedRef = useRef(false);
  const barcodeSignatureRef = useRef<string | null>(null);
  const suppressBarcodeSignatureRef = useRef<string | null>(null);
  const barcodeInFlightRef = useRef(false);
  const nonPdf417SignatureRef = useRef<string | null>(null);
  const previousDocIdsRef = useRef<Partial<Record<DocSlot, string | null>>>({});

  const goReturn = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, returnToPath as any);
  }, [navCtx, returnToPath, router]);

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
        const updated = { ...base, showIdWizardHint: value };
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

  useEffect(() => {
    const allDocs = listByType<Document>('Document');
    const kindFilter = kindForIdType(idType);
    const relevant = allDocs
      .filter(
        doc =>
          doc.parentType === 'Profile' &&
          doc.parentId === profile.id &&
          doc.kind === kindFilter,
      )
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
    const normalizeSide = (side?: IdentityDocumentSide | null) => (side ?? 'both') as IdentityDocumentSide;
    const findBySide = (side: IdentityDocumentSide, excludeId?: string | null) =>
      relevant.find(doc => normalizeSide(doc.identityDocumentSide) === side && (!excludeId || doc.id !== excludeId));

    let front: Document | undefined;
    let back: Document | undefined;
    let picture: Document | undefined;
    let permit: Document | undefined;

    if (idType === 'ID_CARD') {
      front = findBySide('front') ?? findBySide('both');
      back = findBySide('back', front?.id) ?? findBySide('both', front?.id);
    } else if (idType === 'ID_BOOK') {
      picture = findBySide('both') ?? findBySide('front') ?? findBySide('back') ?? relevant[0];
    } else if (idType === 'PASSPORT') {
      picture =
        relevant.find(doc => doc.kind === 'PASSPORT' && normalizeSide(doc.identityDocumentSide) !== 'not_applicable') ||
        findBySide('both') ||
        findBySide('front') ||
        relevant[0];
      permit =
        relevant.find(doc => doc.requirementRelatedLabel === 'Permanent Residence Permit') ||
        findBySide('not_applicable') ||
        undefined;
    } else {
      // fallback when idType is unknown
      picture = findBySide('both') ?? findBySide('front') ?? relevant[0];
    }

    const nextDocs = {
      front: front ?? undefined,
      back: back ?? undefined,
      picture: picture ?? undefined,
      permit: permit ?? undefined,
    };
    setDocs(nextDocs);
    if (baselineSignatureRef.current === null) {
      baselineSignatureRef.current = signatureForState({
        docs: nextDocs,
        idType: initialIdTypeRef.current,
        isForeignNational: initialForeignRef.current,
      });
    }
  }, [idType, isForeignNational, profile.id]);

  const cleanupCreatedDocs = useCallback(async () => {
    const ids = Array.from(createdDocIdsRef.current);
    if (!ids.length) return;
    await Promise.all(
      ids.map(async id => {
        const doc = getById<Document>(id);
        if (doc) {
          await deleteDocumentFiles(doc);
        }
        deleteEntity(id);
      }),
    );
    createdDocIdsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        void cleanupCreatedDocs();
      }
    };
  }, [cleanupCreatedDocs]);

  const requiredSlots = useMemo(() => getRequiredSlots(idType, isForeignNational), [idType, isForeignNational]);

  const getContextForSlot = useCallback(
    (slot: DocSlot) => {
      if (!profile?.id) return null;
      const kind = kindForIdType(idType);
      const base = {
        parentType: 'Profile' as const,
        parentId: profile.id,
        holderProfileId: profile.id,
        createDocumentId: () => createRandomId('doc'),
      };
      switch (slot) {
        case 'front':
          return { ...base, label: 'ID front', kind, side: 'front' as const };
        case 'back':
          return { ...base, label: 'ID back', kind, side: 'back' as const };
        case 'picture':
          if (idType === 'PASSPORT') {
            return { ...base, label: 'Passport picture page', kind, side: 'front' as const };
          }
          if (idType === 'ID_BOOK') {
            return { ...base, label: 'ID book picture page', kind, side: 'front' as const };
          }
          return { ...base, label: 'ID photo', kind, side: 'both' as const };
        case 'permit':
          return { ...base, label: 'Permanent Residence Permit', kind: 'PASSPORT' as Document['kind'], side: 'not_applicable' as const };
        default:
          return null;
      }
    },
    [idType, profile?.id],
  );

  const scrollToSlot = useCallback(
    (slot: DocSlot) => {
      const y = cardPositionsRef.current[slot];
      if (typeof y === 'number') {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      }
    },
    [],
  );


  const scrollToNextSlot = useCallback(
    (slot: DocSlot) => {
      const order = requiredSlots;
      const idx = order.indexOf(slot);
      const next = idx >= 0 ? order[idx + 1] : null;
      if (next) {
        scrollToSlot(next);
        return;
      }
      scrollRef.current?.scrollToEnd?.({ animated: true });
    },
    [requiredSlots, scrollToSlot],
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

  const savePdfPageForSlot = useCallback(
    async (
      page: { uri: string },
      slot: DocSlot,
      context: ReturnType<typeof getContextForSlot>,
      existing?: Document | null,
    ) => {
      if (!context) return null;
      const fileName = `id-${slot}.jpg`;
      const pdfAsset = {
        uri: page.uri,
        mimeType: 'image/jpeg',
        fileName,
        name: fileName,
      };
      const { document, createdNew } = await upsertWizardDocumentFromAsset({
        asset: pdfAsset as any,
        context,
        existing: existing ?? undefined,
      });
      const hydrated = getById<Document>(document.id) ?? document;
      if (createdNew) {
        createdDocIdsRef.current.add(hydrated.id);
      }
      return hydrated;
    },
    [],
  );

  const getUpsertExistingDoc = useCallback((existing?: Document | null) => {
    if (!existing) return undefined;
    return createdDocIdsRef.current.has(existing.id) ? existing : undefined;
  }, []);

  const pickImage = useCallback(
    async (slot: DocSlot, source: 'camera' | 'library') => {
      if (!idType) {
        Alert.alert('Choose ID type', 'Select an ID type before adding photos.');
        return;
      }
      const ctx = getContextForSlot(slot);
      if (!ctx) {
        Alert.alert('Profile missing', 'Add your profile details before capturing ID photos.');
        return;
      }
      try {
        if (source === 'camera') {
          const ok = await ensureCameraPermission({
            title: 'Camera access needed',
            settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
          });
          if (!ok) return;
        } else {
          const prefs = ensureUserPrefs(profile.id);
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
        setProcessingLabel(`Uploading ${slotTitles[slot].toLowerCase()}`);
        setProcessing(true);
        await nextFrame();
        const result = await picker({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          base64: false,
          exif: false,
          allowsMultipleSelection: false,
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          ...(jpegExportType ? { imageExportType: jpegExportType } : {}),
        } as any);
        if (!result || (result as any).canceled) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const asset = (result as any).assets?.[0];
        if (!asset) {
          setProcessingLabel('Processing...');
          setProcessing(false);
          return;
        }
        const image = await prepareWizardImage(asset);
        const existing = docs[slot];
        const { document, createdNew } = await upsertWizardDocumentFromAsset({
          asset: image,
          context: ctx,
          existing: getUpsertExistingDoc(existing),
        });
        const hydrated = getById<Document>(document.id) ?? document;
        if (createdNew) {
          createdDocIdsRef.current.add(hydrated.id);
        }
        setDocs(prev => ({ ...prev, [slot]: hydrated }));
        setTimeout(() => scrollToNextSlot(slot), 100);
      } catch (error: any) {
        Alert.alert('Capture failed', error?.message ?? 'Unable to save this photo. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [docs, getContextForSlot, getUpsertExistingDoc, idType, promptPdfSideOrder, savePdfPageForSlot, scrollToNextSlot],
  );

  const handleUpload = useCallback(
    async (slot: DocSlot) => {
      if (!idType) {
        Alert.alert('Choose ID type', 'Select an ID type before adding photos.');
        return;
      }
      const ctx = getContextForSlot(slot);
      if (!ctx) {
        Alert.alert('Profile missing', 'Add your profile details before uploading ID files.');
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
      try {
        setProcessingLabel(`Uploading ${slotTitles[slot].toLowerCase()}`);
        setProcessing(true);
        await nextFrame();
        if (isPdf) {
          const rasterized = await rasterizePdf(asset.uri, 150);
          try {
            const pages = rasterized.pages;
            if (idType === 'ID_CARD' && pages.length > 2) {
              Alert.alert(
                'PDF too long',
                'ID card uploads support a maximum of 2 pages. Please upload a 2-page PDF or use the camera/photo library.'
              );
              return;
            }
            if (idType !== 'ID_CARD' && pages.length > 1) {
              Alert.alert(
                'Only first page used',
                'This PDF has multiple pages. Only the first page will be used. If your ID page is on another page, use the camera or photo library.'
              );
            }
            if (idType === 'ID_CARD' && pages.length >= 2) {
              const swap = await promptPdfSideOrder();
              if (swap === null) return;
              const frontPage = swap ? pages[1] : pages[0];
              const backPage = swap ? pages[0] : pages[1];
              const frontCtx = getContextForSlot('front');
              const backCtx = getContextForSlot('back');
              if (!frontCtx || !backCtx) return;
              const frontDoc = await savePdfPageForSlot(frontPage, 'front', frontCtx, getUpsertExistingDoc(docs.front));
              const backDoc = await savePdfPageForSlot(backPage, 'back', backCtx, getUpsertExistingDoc(docs.back));
              const nextDocs = { ...docs };
              if (frontDoc) nextDocs.front = frontDoc;
              if (backDoc) nextDocs.back = backDoc;
              setDocs(nextDocs);
              setTimeout(() => scrollToNextSlot(slot), 100);
              return;
            }
            const firstPage = pages[0];
            if (!firstPage) return;
            const stored = await savePdfPageForSlot(firstPage, slot, ctx, getUpsertExistingDoc(docs[slot]));
            if (stored) {
              setDocs(prev => ({ ...prev, [slot]: stored }));
              setTimeout(() => scrollToNextSlot(slot), 100);
            }
            return;
          } finally {
            await rasterized.cleanup().catch(() => {});
          }
        }
        const prepared = await prepareWizardImage(asset as any);
        const existing = docs[slot];
        const { document, createdNew } = await upsertWizardDocumentFromAsset({
          asset: prepared as any,
          context: ctx,
          existing: getUpsertExistingDoc(existing),
        });
        const hydrated = getById<Document>(document.id) ?? document;
        if (createdNew) {
          createdDocIdsRef.current.add(hydrated.id);
        }
        setDocs(prev => ({ ...prev, [slot]: hydrated }));
        setTimeout(() => scrollToNextSlot(slot), 100);
      } catch (error: any) {
        Alert.alert('Upload failed', error?.message ?? 'Unable to save this file. Please try again.');
      } finally {
        setProcessingLabel('Processing...');
        setProcessing(false);
      }
    },
    [docs, getContextForSlot, getUpsertExistingDoc, idType, scrollToNextSlot],
  );

  const handleDelete = useCallback(
    async (slot: DocSlot) => {
      if (processing) {
        Alert.alert('Please wait', 'Finishing up the current step…');
        return;
      }
      const doc = docs[slot];
      if (!doc) return;
      setProcessing(true);
      try {
        if (createdDocIdsRef.current.has(doc.id)) {
          await deleteDocumentFiles(doc);
          deleteEntity(doc.id);
          createdDocIdsRef.current.delete(doc.id);
        }
        setDocs(prev => ({ ...prev, [slot]: undefined }));
      } catch (error: any) {
        Alert.alert('Delete failed', error?.message ?? 'Something went wrong while deleting this photo.');
      } finally {
        setProcessing(false);
      }
    },
    [docs, processing],
  );

  useEffect(() => {
    setPendingRotationBySlot((prev) => {
      const next: Partial<Record<DocSlot, number>> = { ...prev };
      let changed = false;
      allSlots.forEach((slot) => {
        const nextId = docs[slot]?.id ?? null;
        if (previousDocIdsRef.current[slot] !== nextId) {
          previousDocIdsRef.current[slot] = nextId;
          if ((next[slot] ?? 0) !== 0) {
            next[slot] = 0;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [docs]);

  const queueRotation = useCallback((slot: DocSlot) => {
    setPendingRotationBySlot((prev) => ({ ...prev, [slot]: (prev[slot] ?? 0) - 90 }));
  }, []);

  const applyPendingImageRotations = useCallback(async () => {
    const perDoc = new Map<string, { doc: Document; degrees: number }>();
    requiredSlots.forEach((slot) => {
      const doc = docs[slot];
      if (!doc) return;
      const pending = normalizeRotation(pendingRotationBySlot[slot] ?? 0);
      if (!pending) return;
      const current = perDoc.get(doc.id);
      perDoc.set(doc.id, {
        doc,
        degrees: normalizeRotation((current?.degrees ?? 0) + pending),
      });
    });
    if (!perDoc.size) return docs;
    const updatedById = new Map<string, Document>();
    for (const { doc, degrees } of perDoc.values()) {
      if (!degrees) continue;
      const sourceUri = resolveDocumentUri(doc.uri ?? doc.filePath);
      if (!sourceUri) continue;
      const manipulated = await ImageManipulator.manipulateAsync(sourceUri, [{ rotate: degrees }], {});
      if (manipulated.uri !== sourceUri) {
        await FileSystem.copyAsync({ from: manipulated.uri, to: sourceUri });
      }
      const updated = touch({ ...doc } as Document);
      persist(updated);
      updatedById.set(updated.id, updated);
    }
    const nextDocs: Partial<Record<DocSlot, Document>> = { ...docs };
    allSlots.forEach((slot) => {
      const current = nextDocs[slot];
      if (current && updatedById.has(current.id)) {
        nextDocs[slot] = updatedById.get(current.id)!;
      }
    });
    setDocs(nextDocs);
    const nextSignature = signatureForState({ docs: nextDocs, idType, isForeignNational });
    suppressBarcodeSignatureRef.current = nextSignature;
    barcodeSignatureRef.current = nextSignature;
    const cleared: Partial<Record<DocSlot, number>> = {};
    allSlots.forEach((slot) => {
      cleared[slot] = 0;
    });
    setPendingRotationBySlot(cleared);
    return nextDocs;
  }, [docs, idType, isForeignNational, pendingRotationBySlot, requiredSlots]);

  // const confirmIdTypeChange = useCallback(
  //   (previousType?: Profile['idType'], nextType?: Profile['idType']) => {
  //     return new Promise<boolean>((resolve) => {
  //       Alert.alert(
  //         'Replace ID type',
  //         `You’re changing your ID type from ${labelForIdType(previousType)} to ${labelForIdType(nextType)}. This will replace your existing ID photos and update any draft applications.`,
  //         [
  //           { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
  //           { text: 'Change ID type', style: 'destructive', onPress: () => resolve(true) },
  //         ],
  //       );
  //     });
  //   },
  //   [],
  // );

  const deleteObsoleteIdDocs = useCallback(
    async (profileId: string, keepIds: Set<string>) => {
      const allIdDocs = listByType<Document>('Document').filter(
        (doc) =>
          doc.parentType === 'Profile' &&
          doc.parentId === profileId &&
          idDocumentKinds.includes(doc.kind),
      );
      const toDelete = allIdDocs.filter(doc => !keepIds.has(doc.id));
      if (!toDelete.length) return;
      await Promise.all(
        toDelete.map(async doc => {
          await deleteDocumentFiles(doc);
          deleteEntity(doc.id);
          createdDocIdsRef.current.delete(doc.id);
        }),
      );
    },
    [],
  );

  const selectIdentityDocsForItem = useCallback(
    (item: any, available: Document[]) => {
      const preferredSide = item.identityDocumentSide as IdentityDocumentSide | undefined;
      const allowMultiple = !!item.multiple || !!item.allowMultipleUploads;
      const candidates = available
        .slice()
        .sort((a, b) => {
          const ta = Date.parse(a.updatedAt || a.createdAt || '');
          const tb = Date.parse(b.updatedAt || b.createdAt || '');
          return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
        });
      const pickLatestBySide = (side: IdentityDocumentSide) =>
        candidates.find(doc => normalizeIdentitySide(doc.identityDocumentSide) === side);

      if (preferredSide) {
        const match =
          pickLatestBySide(preferredSide) ||
          (preferredSide !== 'both' ? pickLatestBySide('both') : undefined) ||
          candidates[0];
        return match ? [match] : [];
      }

      const latestFront = pickLatestBySide('front');
      const latestBack = pickLatestBySide('back');
      const latestBoth = pickLatestBySide('both');
      const latestOther = pickLatestBySide('not_applicable');
      const selected: Document[] = [];
      if (latestFront) selected.push(latestFront);
      if (latestBack && !selected.includes(latestBack)) selected.push(latestBack);
      if (selected.length < 2 && latestBoth && !selected.includes(latestBoth)) selected.push(latestBoth);
      if (!selected.length && latestOther) selected.push(latestOther);
      if (!selected.length && candidates.length) selected.push(candidates[0]);
      return allowMultiple ? selected : selected.slice(0, 1);
    },
    [],
  );

  const updateApplicationsWithIdDocs = useCallback(
    async (profileId: string, newDocs: Document[]) => {
      if (!profileId || !newDocs.length) return;
      const targetApps = listByType<Application>('Application').filter(
        (app) =>
          (app.status === 'draft' || app.status === 'ready') &&
          String(app.applicantProfileId ?? '') === String(profileId),
      );
      if (!targetApps.length) return;

      await Promise.all(
        targetApps.map(async (app) => {
          const docState = app.docs;
          if (!docState) return;
          const docCache = new Map<string, Document>();
          const ensureLinkedDoc = (doc: Document) => {
            const cached = docCache.get(doc.id);
            if (cached) return cached;
            const needsLink =
              doc.applicationId !== app.id ||
              (doc.requirementCode ?? '').toUpperCase() !== 'ID_DOC';
            if (!needsLink) {
              docCache.set(doc.id, doc);
              return doc;
            }
            const updated = touch({
              ...doc,
              applicationId: app.id,
              requirementCode: 'ID_DOC',
            } as Document);
            persist(updated);
            docCache.set(updated.id, updated);
            return updated;
          };

          const linkedDocs = newDocs.map((doc) => ensureLinkedDoc(doc));
          const existing = Array.isArray(docState.documents) ? docState.documents : [];
          const nextEntries = [...existing];
          let changed = false;

          linkedDocs.forEach((doc) => {
            const exists = nextEntries.some((entry) => String(entry.documentId) === String(doc.id));
            if (exists) return;
            nextEntries.push({
              requirementCode: 'ID_DOC',
              kind: (doc.kind ?? 'ID_CARD') as Document['kind'],
              documentId: String(doc.id),
              source: {
                type: 'Profile',
                id: doc.parentId ? String(doc.parentId) : undefined,
              },
            });
            changed = true;
          });

          if (!changed) return;
          const updatedApp = touch({ ...app, docs: { ...docState, documents: nextEntries } } as Application);
          persist(updatedApp);
        }),
      );
    },
    [selectIdentityDocsForItem],
  );

  const discardChanges = useCallback(() => {
    void cleanupCreatedDocs().finally(() => {
      goReturn();
    });
  }, [cleanupCreatedDocs, goReturn]);

  const hasAllRequiredDocs = useMemo(() => {
    const ready = requiredSlots.every(slot => !!docs[slot]);
    if (ready) return true;
    if (!profile?.id) return false;
    const allDocs = listByType<Document>('Document');
    const kindFilter = kindForIdType(idType);
    const relevant = allDocs
      .filter(
        doc =>
          doc.parentType === 'Profile' &&
          doc.parentId === profile.id &&
          doc.kind === kindFilter,
      )
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
    const normalizeSide = (side?: IdentityDocumentSide | null) => (side ?? 'both') as IdentityDocumentSide;
    const findBySide = (side: IdentityDocumentSide, excludeId?: string | null) =>
      relevant.find(doc => normalizeSide(doc.identityDocumentSide) === side && (!excludeId || doc.id !== excludeId));

    let front: Document | undefined;
    let back: Document | undefined;
    let picture: Document | undefined;
    let permit: Document | undefined;

    if (idType === 'ID_CARD') {
      front = findBySide('front') ?? findBySide('both');
      back = findBySide('back', front?.id) ?? findBySide('both', front?.id);
    } else if (idType === 'ID_BOOK') {
      picture = findBySide('both') ?? findBySide('front') ?? findBySide('back') ?? relevant[0];
    } else if (idType === 'PASSPORT') {
      picture =
        relevant.find(doc => doc.kind === 'PASSPORT' && normalizeSide(doc.identityDocumentSide) !== 'not_applicable') ||
        findBySide('both') ||
        findBySide('front') ||
        relevant[0];
      permit =
        relevant.find(doc => doc.requirementRelatedLabel === 'Permanent Residence Permit') ||
        findBySide('not_applicable') ||
        undefined;
    } else {
      picture = findBySide('both') ?? findBySide('front') ?? relevant[0];
    }

    const storedDocs = { front, back, picture, permit };
    return requiredSlots.every(slot => !!storedDocs[slot]);
  }, [docs, idType, profile?.id, requiredSlots]);
  useEffect(() => {
    setPrefsProfileId(profile.id);
    const prefs = ensureUserPrefs(profile.id);
    setUserPrefs(prefs);
    const show = prefs.showIdWizardHint !== false;
    setShowWizardHints(show);
    setStep(editMode ? 'capture' : (show ? 'info' : 'capture'));
  }, [editMode, profile.id]);

  useEffect(() => {
    setIdNumberBlurred(false);
    setIdNumberValidationMessage(null);
  }, [idType]);

  const currentSignature = useMemo(() => {
    return signatureForState({ docs, idType, isForeignNational });
  }, [docs, idType, isForeignNational]);
  const hasPendingRotation = useMemo(
    () =>
      requiredSlots.some((slot) => normalizeRotation(pendingRotationBySlot[slot] ?? 0) !== 0),
    [pendingRotationBySlot, requiredSlots],
  );

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

  const getNonPdf417Label = useCallback(
    (doc?: Document | null) => {
      if (!doc?.barcodeData?.trim()) return null;
      const normalized = normalizeBarcodeType(doc.barcodeType);
      if (!normalized || normalized.includes('pdf417')) return null;
      return doc.barcodeType?.trim() || normalized.toUpperCase();
    },
    [normalizeBarcodeType],
  );

  const barcodeWorkflowEnabled = appConfig.features.enableIdBarcodeExtraction;
  const canRunBarcodeWorkflow = useMemo(
    () =>
      barcodeWorkflowEnabled &&
      idType === 'ID_CARD' &&
      !!docs.front &&
      (!!docs.back || bothSidesSinglePage),
    [barcodeWorkflowEnabled, bothSidesSinglePage, docs.back, docs.front, idType],
  );

  const runBarcodeWorkflow = useCallback(async () => {
    const front = docs.front;
    const back = docs.back ?? docs.front;
    if (!front || !back) return;
    barcodeSignatureRef.current = currentSignature;
    setBarcodeProcessing(true);
    await nextFrame();
    try {
      const ensuredFront = await ensureDocumentBarcode(front);
      const ensuredBack = front.id === back.id ? ensuredFront : await ensureDocumentBarcode(back);
      if (ensuredFront !== front || ensuredBack !== back) {
        setDocs(prev => ({
          ...prev,
          front: ensuredFront,
          back: ensuredBack,
        }));
      }
      const frontHasPdf417 = isPdf417Barcode(ensuredFront);
      const backHasPdf417 = isPdf417Barcode(ensuredBack);
      const barcodeDoc = frontHasPdf417 ? ensuredFront : backHasPdf417 ? ensuredBack : null;
      setBarcodeAttempted(true);
      if (!barcodeDoc?.barcodeData?.trim()) {
        const nonPdf417Label =
          (!frontHasPdf417 ? getNonPdf417Label(ensuredFront) : null) ??
          (!backHasPdf417 ? getNonPdf417Label(ensuredBack) : null);
        if (nonPdf417Label && nonPdf417SignatureRef.current !== currentSignature) {
          nonPdf417SignatureRef.current = currentSignature;
          logger.log('[id/wizard] Barcode found but not PDF417', { type: nonPdf417Label });
          Alert.alert(
            'Unsupported barcode type',
            `Barcode found but not PDF417 (${nonPdf417Label}). We’ll continue without auto-fill.`,
          );
        }
        setBarcodeExtracted(false);
        setBarcodeProfile(null);
        return;
      }
      const parsed = parsePdf417Profile(barcodeDoc.barcodeData);
      if (!parsed?.idNumber) {
        setBarcodeExtracted(false);
        setBarcodeProfile(null);
        return;
      }
      if (frontHasPdf417 && !backHasPdf417 && ensuredBack.id !== ensuredFront.id) {
        setDocs(prev => ({
          ...prev,
          front: ensuredBack,
          back: ensuredFront,
        }));
      }
      setBarcodeProfile(parsed);
      setBarcodeExtracted(true);
      if (parsed.idNumber) {
        setIdNumber(parsed.idNumber);
        setIdNumberBlurred(true);
        setIdNumberValidationMessage(null);
      }
      setGivenNames(parsed.givenNames);
      setSurname(parsed.surname);
      setInitials(parsed.initials);
      initialsTouchedRef.current = false;
    } finally {
      setBarcodeProcessing(false);
    }
  }, [currentSignature, docs.back, docs.front, ensureDocumentBarcode]);

  useEffect(() => {
    if (!barcodeWorkflowEnabled) {
      setBarcodeExtracted(false);
      setBarcodeProfile(null);
      setBarcodeAttempted(false);
      barcodeSignatureRef.current = null;
      nonPdf417SignatureRef.current = null;
      initialsTouchedRef.current = false;
      return;
    }
    if (idType !== 'ID_CARD') {
      setBarcodeExtracted(false);
      setBarcodeProfile(null);
      setBarcodeAttempted(false);
      barcodeSignatureRef.current = null;
      nonPdf417SignatureRef.current = null;
      initialsTouchedRef.current = false;
      return;
    }
    if (!canRunBarcodeWorkflow) {
      setBarcodeExtracted(false);
      setBarcodeProfile(null);
      setBarcodeAttempted(false);
      barcodeSignatureRef.current = null;
      nonPdf417SignatureRef.current = null;
      initialsTouchedRef.current = false;
      return;
    }
    if (
      suppressBarcodeSignatureRef.current &&
      suppressBarcodeSignatureRef.current === currentSignature
    ) {
      suppressBarcodeSignatureRef.current = null;
      return;
    }
    if (processing || barcodeProcessing) return;
    if (barcodeSignatureRef.current === currentSignature) return;
    if (barcodeInFlightRef.current) return;
    barcodeInFlightRef.current = true;
    void (async () => {
      try {
        await runBarcodeWorkflow();
      } finally {
        barcodeInFlightRef.current = false;
      }
    })();
  }, [
    barcodeProcessing,
    canRunBarcodeWorkflow,
    currentSignature,
    idType,
    processing,
    barcodeWorkflowEnabled,
    runBarcodeWorkflow,
  ]);

  useEffect(() => {
    const justEnabled = isForeignNational && !prevForeignRef.current;
    prevForeignRef.current = isForeignNational;
    if (!justEnabled) return;
    if (idType !== 'PASSPORT') return;
    if (!requiredSlots.includes('permit')) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToSlot('permit');
      });
    });
  }, [idType, isForeignNational, requiredSlots, scrollToSlot]);

  const formatSaIdNumber = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 6) return digits;
    if (digits.length <= 10) return `${digits.slice(0, 6)} ${digits.slice(6)}`;
    if (digits.length <= 12) return `${digits.slice(0, 6)} ${digits.slice(6, 10)} ${digits.slice(10)}`;
    return `${digits.slice(0, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 12)} ${digits.slice(12)}`;
  }, []);

  const trimmedIdNumber = idNumber.trim();
  const hasIdNumber = trimmedIdNumber.length > 0;
  const validationEnabled = appConfig.features.enableValidation && !devModeEnabled;
  const barcodeLocked = idType === 'ID_CARD' && (barcodeExtracted || !!profile.idBarcodeExtracted);
  const passportError = useMemo(() => {
    if (!validationEnabled || !hasIdNumber || idType !== 'PASSPORT') return null;
    if (!/^[A-Za-z0-9]+$/.test(trimmedIdNumber)) {
      return 'Passport number must be alphanumeric.';
    }
    if (trimmedIdNumber.length > 10) {
      return 'Passport number must be 10 characters or fewer.';
    }
    return null;
  }, [hasIdNumber, idType, trimmedIdNumber, validationEnabled]);
  const idNumberError =
    validationEnabled && hasIdNumber && idType !== 'PASSPORT'
      ? (idNumberBlurred ? idNumberValidationMessage : null)
      : passportError;
  const trimmedGivenNames = givenNames.trim();
  const trimmedSurname = surname.trim();
  const trimmedInitials = initials.trim();
  const derivedInitials = deriveInitialsFromNames(trimmedGivenNames);
  const hasRequiredNames =
    devModeEnabled ||
    barcodeLocked ||
    (trimmedGivenNames.length > 0 &&
      trimmedSurname.length > 0 &&
      (trimmedInitials.length > 0 || derivedInitials.length > 0));
  const idTypeLabel = labelForIdType(idType);
  const fullNameValue =
    trimmedGivenNames || trimmedSurname || trimmedInitials
      ? `${trimmedGivenNames}${trimmedInitials ? ` (${trimmedInitials})` : ''}${trimmedSurname ? ` ${trimmedSurname}` : ''}`.trim()
      : undefined;
  const idNumberCellError = validationEnabled && (!hasIdNumber || !!idNumberError);
  const namesCellError = validationEnabled && !hasRequiredNames;
  const idNumberChanged = trimmedIdNumber !== initialIdNumberRef.current;
  const namesChanged =
    trimmedGivenNames !== initialGivenNamesRef.current ||
    trimmedSurname !== initialSurnameRef.current ||
    trimmedInitials !== initialInitialsRef.current;
  const sexAtBirthChanged = sexAtBirth !== initialSexAtBirthRef.current;
  const hasChanges = useMemo(() => {
    if (!baselineSignatureRef.current) {
      return idNumberChanged || namesChanged || sexAtBirthChanged;
    }
    return (
      baselineSignatureRef.current !== currentSignature ||
      idNumberChanged ||
      namesChanged ||
      sexAtBirthChanged ||
      hasPendingRotation
    );
  }, [currentSignature, hasPendingRotation, idNumberChanged, namesChanged, sexAtBirthChanged]);
  const idDebug = useMemo(() => ({
    idNumber,
    trimmedIdNumber,
    initialIdNumber: initialIdNumberRef.current,
    idNumberChanged,
    hasChanges,
    hasAllRequiredDocs,
    idNumberError,
  }), [hasAllRequiredDocs, hasChanges, idNumber, idNumberChanged, idNumberError, trimmedIdNumber]);
  const effectiveShowHints = userPrefs ? userPrefs.showIdWizardHint !== false : showWizardHints;
  const canSave = hasChanges && !processing;

  const renderCaptureCard = (slot: DocSlot) => {
    const doc = docs[slot];
    const uri = doc?.uri ?? doc?.filePath ?? null;
    const name = doc?.name ?? '';
    const mime = (doc?.mime ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const hint = slot === 'permit' ? 'Include your permanent residence permit photo.' : 'Make sure details are readable and in focus.';
    const title =
      slot === 'front' && bothSidesSinglePage && idType === 'ID_CARD'
        ? 'ID card (both sides)'
        : slotTitles[slot];

    return (
      <PhotoCaptureCard
        key={slot}
        isError={showBlockingIssues && validationEnabled && requiredSlots.includes(slot) && !doc}
        title={title}
        required={requiredSlots.includes(slot)}
        helpText={hint}
        previewUri={uri}
        previewVersionKey={doc?.updatedAt ?? doc?.createdAt}
        previewRotationDegrees={pendingRotationBySlot[slot] ?? 0}
        persistRotationOnPreviewClose={false}
        previewKind={uri ? (isPdf ? 'pdf' : 'image') : undefined}
        previewLabel={name || undefined}
        onPressCamera={() => pickImage(slot, 'camera')}
        onPressLibrary={() => pickImage(slot, 'library')}
        onPressRotate={() => queueRotation(slot)}
        showRotateButton={!!uri && !isPdf}
        onPressUpload={() => handleUpload(slot)}
        // showUploadButton
        onDelete={() => handleDelete(slot)}
        disabled={processing}
        onLayout={(e) => {
          cardPositionsRef.current[slot] = e.nativeEvent.layout.y;
        }}
      />
    );
  };

  const idNumberDisplayValue = useMemo(
    () => (idType === 'PASSPORT' ? idNumber : formatSaIdNumber(idNumber)),
    [formatSaIdNumber, idNumber, idType],
  );
  const shouldShowStatus =
    barcodeWorkflowEnabled &&
    idType === 'ID_CARD' &&
    !!docs.front &&
    !!docs.back &&
    !bothSidesSinglePage;
  const statusMessage = processing || barcodeProcessing
    ? 'Processing your ID photos...'
    : barcodeExtracted
      ? 'Barcode successfully extracted. Review the details below.'
      : barcodeAttempted
        ? 'No barcode detected. Please enter your details manually.'
        : 'Scanning for barcode...';
  const statusStyle = processing || barcodeProcessing
    ? [styles.captureStatusBox, styles.captureStatusInfo]
    : barcodeExtracted
      ? [styles.captureStatusBox, styles.captureStatusSuccess]
      : barcodeAttempted
        ? [styles.captureStatusBox, styles.captureStatusWarning]
        : [styles.captureStatusBox, styles.captureStatusInfo];
  const alertBarcodeLocked = useCallback(() => {
    Alert.alert(
      'ID details locked',
      'Your details were captured from the barcode. Update your ID photos to change them.'
    );
  }, []);

  const openIdDetails = useCallback(() => {
    if (barcodeLocked) {
      alertBarcodeLocked();
      return;
    }
    setIdDetailErrors({});
    setSheet({ type: 'idDetails', title: 'ID details' });
  }, [alertBarcodeLocked, barcodeLocked]);

  const focusIssue = useCallback((issueKey?: string) => {
    if (!issueKey) return;
    if (issueKey === 'idType') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (
      issueKey === 'idDetails:idNumber' ||
      issueKey === 'idDetails:names' ||
      issueKey === 'idDetails:sexAtBirth'
    ) {
      scrollRef.current?.scrollToEnd?.({ animated: true });
      requestAnimationFrame(() => {
        openIdDetails();
      });
      return;
    }
    if (issueKey.startsWith('doc:')) {
      const slot = issueKey.replace(/^doc:/, '') as DocSlot;
      scrollToSlot(slot);
    }
  }, [openIdDetails, scrollToSlot]);

  const blockingValidation = useMemo(() => {
    const issues: WizardBlockingIssue[] = [];
    if (validationEnabled) {
      if (!idType) {
        issues.push({
          key: 'idType',
          label: 'ID type',
          kind: 'missing',
          message: 'Choose your ID type.',
        });
      }
      if (!trimmedIdNumber) {
        issues.push({
          key: 'idDetails:idNumber',
          label: 'ID number',
          kind: 'missing',
          message: 'Enter your ID number.',
        });
      }
      if (!hasRequiredNames) {
        issues.push({
          key: 'idDetails:names',
          label: 'Personal details',
          kind: 'missing',
          message: 'Enter your given names, surname, and initials.',
        });
      }
      if (idType === 'PASSPORT' && passportError) {
        issues.push({
          key: 'idDetails:idNumber',
          label: 'Passport number',
          kind: 'invalid',
          message: passportError,
        });
      }
      if (idType === 'PASSPORT' && sexAtBirth === 'unknown') {
        issues.push({
          key: 'idDetails:sexAtBirth',
          label: 'Sex at birth',
          kind: 'missing',
          message: 'Select sex at birth.',
        });
      }
      if (idType !== 'PASSPORT' && trimmedIdNumber) {
        const validationMessage = validateSAId(trimmedIdNumber);
        if (validationMessage) {
          issues.push({
            key: 'idDetails:idNumber',
            label: 'ID number',
            kind: 'invalid',
            message: validationMessage,
          });
        }
      }
      requiredSlots.forEach((slot) => {
        if (docs[slot]) return;
        issues.push({
          key: `doc:${slot}`,
          label: slotTitles[slot],
          kind: 'missing',
          message: `Add ${slotTitles[slot].toLowerCase()}.`,
        });
      });
    }
    return buildWizardBlockingResult(issues);
  }, [docs, hasRequiredNames, idType, passportError, requiredSlots, sexAtBirth, trimmedIdNumber, validationEnabled]);

  const blockingItems = showBlockingIssues && blockingValidation.hasBlockingIssues
    ? blockingValidation.issues.map((issue) => issue.label)
    : [];

  const validateIdNumberField = useCallback(
    (value: string) => {
      const raw = value.trim();
      if (!raw) {
        setIdDetailErrors(prev => {
          if (!prev.idNumber) return prev;
          const next = { ...prev };
          delete next.idNumber;
          return next;
        });
        return;
      }
      if (idType === 'PASSPORT') {
        const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
        if (!/^[A-Za-z0-9]+$/.test(cleaned) || cleaned.length > 10 || cleaned.length === 0) {
          setIdDetailErrors(prev => ({ ...prev, idNumber: true }));
          return;
        }
        setIdDetailErrors(prev => {
          if (!prev.idNumber) return prev;
          const next = { ...prev };
          delete next.idNumber;
          return next;
        });
        return;
      }

      const digits = raw.replace(/\D/g, '').slice(0, 13);
      if (validationEnabled) {
        const validationMessage = validateSAId(digits);
        if (validationMessage) {
          setIdDetailErrors(prev => ({ ...prev, idNumber: true }));
          return;
        }
      }
      setIdDetailErrors(prev => {
        if (!prev.idNumber) return prev;
        const next = { ...prev };
        delete next.idNumber;
        return next;
      });
    },
    [idType, validationEnabled],
  );

  const saveIdDetails = useCallback(
    (value: {
      idNumber: string;
      givenNames: string;
      initials: string;
      surname: string;
      sexAtBirth: ApplicantSex;
    }) => {
      const rawId = value.idNumber.trim();
      const trimmedGiven = value.givenNames.trim();
      const trimmedInitials = value.initials.trim();
      const trimmedSurname = value.surname.trim();
      const nextErrors: {
        idNumber?: boolean;
        givenNames?: boolean;
        surname?: boolean;
        sexAtBirth?: boolean;
      } = {};

      let err: string | null = null;
      if (trimmedGiven) err = validateName(trimmedGiven);
      if (!err && trimmedSurname) err = validateName(trimmedSurname);
      if (err) {
        if (!trimmedGiven || err === validateName(trimmedGiven)) nextErrors.givenNames = true;
        if (!trimmedSurname || err === validateName(trimmedSurname)) nextErrors.surname = true;
        setIdDetailErrors(nextErrors);
        Alert.alert('Invalid input', err);
        return;
      }
      if (validationEnabled && (!trimmedGiven || !trimmedSurname)) {
        if (!trimmedGiven) nextErrors.givenNames = true;
        if (!trimmedSurname) nextErrors.surname = true;
        setIdDetailErrors(nextErrors);
        Alert.alert('Missing personal details', 'Enter your given names and surname to continue.');
        return;
      }

      if (idType === 'PASSPORT') {
        const cleaned = rawId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
        if (!cleaned) {
          nextErrors.idNumber = true;
          setIdDetailErrors(nextErrors);
          Alert.alert('Missing passport number', 'Enter your passport number to continue.');
          return;
        }
        if (!/^[A-Za-z0-9]+$/.test(cleaned)) {
          nextErrors.idNumber = true;
          setIdDetailErrors(nextErrors);
          Alert.alert('Invalid passport number', 'Passport number must be alphanumeric.');
          return;
        }
        if (cleaned.length > 10) {
          nextErrors.idNumber = true;
          setIdDetailErrors(nextErrors);
          Alert.alert('Invalid passport number', 'Passport number must be 10 characters or fewer.');
          return;
        }
        if (value.sexAtBirth !== 'female' && value.sexAtBirth !== 'male') {
          nextErrors.sexAtBirth = true;
          setIdDetailErrors(nextErrors);
          Alert.alert('Missing sex at birth', 'Select sex at birth to continue.');
          return;
        }
        setIdNumber(cleaned);
        setIdNumberBlurred(true);
        setIdNumberValidationMessage(null);
        setSexAtBirth(value.sexAtBirth);
      } else {
        const digits = rawId.replace(/\D/g, '').slice(0, 13);
        if (!digits) {
          nextErrors.idNumber = true;
          setIdDetailErrors(nextErrors);
          Alert.alert('Missing ID number', 'Enter your ID number to continue.');
          return;
        }
        if (validationEnabled) {
          const validationMessage = validateSAId(digits);
          if (validationMessage) {
            setIdNumberBlurred(true);
            setIdNumberValidationMessage(validationMessage);
            nextErrors.idNumber = true;
            setIdDetailErrors(nextErrors);
            Alert.alert('Invalid ID number', validationMessage);
            return;
          }
        }
        setIdNumber(digits);
        setIdNumberBlurred(true);
        setIdNumberValidationMessage(null);
        setSexAtBirth('unknown');
      }

      setGivenNames(trimmedGiven);
      setSurname(trimmedSurname);
      const nextInitials = (trimmedInitials || deriveInitialsFromNames(trimmedGiven)).toUpperCase();
      initialsTouchedRef.current = !!trimmedInitials;
      setInitials(nextInitials);
      setIdDetailErrors({});
      setSheet(null);
    },
    [idType, initialProfile.sexAtBirth, validationEnabled],
  );

  useEffect(() => {
    if (!barcodeLocked) return;
    if (!hasIdNumber) return;
    setIdNumberBlurred(true);
    setIdNumberValidationMessage(null);
  }, [barcodeLocked, hasIdNumber]);

  useEffect(() => {
    if (idType !== 'ID_CARD') return;
    if (barcodeExtracted) return;
    if (initialsTouchedRef.current) return;
    if (!givenNames.trim()) return;
    setInitials(deriveInitialsFromNames(givenNames));
  }, [barcodeExtracted, givenNames, idType]);

  const buildWizardReturnPath = useCallback(() => {
    const qs: string[] = [];
    if (navCtx.returnTo || navCtx.routeBack) qs.push(`returnTo=${encodedReturnTo}`);
    if (navCtx.onComplete || navCtx.routeBack) qs.push(`completeReturnTo=${encodedCompleteReturnTo}`);
    if (params.previewMode) qs.push(`previewMode=${encodeURIComponent(Array.isArray(params.previewMode) ? params.previewMode[0] ?? '' : params.previewMode ?? '')}`);
    if (params.mode) qs.push(`mode=${encodeURIComponent(Array.isArray(params.mode) ? params.mode[0] ?? '' : params.mode ?? '')}`);
    if (params.intro) qs.push(`intro=${encodeURIComponent(Array.isArray(params.intro) ? params.intro[0] ?? '' : params.intro ?? '')}`);
    if (params.nav) {
      const rawNav = Array.isArray(params.nav) ? params.nav[0] : params.nav;
      if (rawNav) qs.push(`nav=${encodeURIComponent(rawNav)}`);
    }
    const query = qs.filter(Boolean).join('&');
    return query ? `/id/wizard?${query}` : '/id/wizard';
  }, [encodedCompleteReturnTo, encodedReturnTo, navCtx.onComplete, navCtx.returnTo, navCtx.routeBack, params.intro, params.mode, params.nav, params.previewMode]);

  const promptProfileMismatch = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (idType === 'PASSPORT' && profile.isForeignNational !== isForeignNational) {
        const updated = touch({ ...profile, isForeignNational });
        persist(updated);
        setProfile(updated);
      }
      Alert.alert(
        'ID type mismatch',
        'Your captured ID looks different from your profile ID type. Update your profile to keep things in sync?',
        [
          {
            text: 'Edit your profile',
            style: 'default',
            onPress: () => {
              const routeBack = navCtx.routeBack || navCtx.returnTo || navCtx.onComplete || '/(tabs)/profile';
              savedRef.current = true;
              router.replace({
                pathname: '/profile/edit',
                params: { returnTo: encodeURIComponent(routeBack) },
              } as any);
              resolve(false);
            },
          },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
      );
    });
  }, [idType, isForeignNational, navCtx, profile, router]);

  useEffect(() => {
    if (mismatchAlertShownRef.current) return;
    if (!initialProfileIdType) return;
    if (!initialDocType || initialDocType === initialProfileIdType) return;
    mismatchAlertShownRef.current = true;
    void promptProfileMismatch();
  }, [initialDocType, initialProfileIdType, promptProfileMismatch]);

  const handleSave = useCallback(async () => {
    setShowBlockingIssues(true);
    if (blockingValidation.hasBlockingIssues) {
      if (idType !== 'PASSPORT' && trimmedIdNumber) {
        const validationMessage = validateSAId(trimmedIdNumber);
        if (validationMessage) {
          setIdNumberBlurred(true);
          setIdNumberValidationMessage(validationMessage);
        }
      }
      showWizardBlockingAlert(blockingValidation, {
        title: 'Unable to save',
        intro: 'Please correct the following before saving:',
        onPressOk: () => focusIssue(blockingValidation.firstIssueKey),
      });
      return;
    }
    // const idTypeChanged = !!profile.idType && profile.idType !== idType;
    // if (idTypeChanged) {
    //   const confirmed = await confirmIdTypeChange(profile.idType, idType);
    //   if (!confirmed) return;
    // }
    setProcessing(true);
    try {
      const activeDocs = await applyPendingImageRotations();
      const keepDocs = Object.values(activeDocs).filter(Boolean) as Document[];
      const keepIds = new Set(keepDocs.map(doc => doc.id));
      if (profile.id) {
        await deleteObsoleteIdDocs(profile.id, keepIds);
      }

      const nextDocumentIdFront =
        idType === 'ID_CARD'
          ? activeDocs.front?.id
          : idType === 'ID_BOOK'
          ? activeDocs.picture?.id ?? activeDocs.front?.id ?? activeDocs.back?.id
          : idType === 'PASSPORT'
          ? activeDocs.picture?.id
          : undefined;
      const nextDocumentIdBack =
        idType === 'ID_CARD'
          ? activeDocs.back?.id
          : idType === 'PASSPORT' && isForeignNational
          ? activeDocs.permit?.id
          : undefined;
      const barcodeValues = idType === 'ID_CARD' && barcodeExtracted ? barcodeProfile : null;
      const effectiveIdNumber = barcodeValues?.idNumber || trimmedIdNumber;
      const effectiveGivenNames = barcodeValues?.givenNames || trimmedGivenNames || undefined;
      const effectiveSurname = barcodeValues?.surname || trimmedSurname || undefined;
      const effectiveInitials =
        (trimmedInitials || deriveInitialsFromNames(effectiveGivenNames)) || undefined;
      const effectiveSexAtBirth = idType === 'PASSPORT' ? sexAtBirth : 'unknown';
      const nextBarcodeFlag = idType === 'ID_CARD' ? !!barcodeValues : false;
      const shouldUpdateProfile =
        profile.idType !== idType ||
        (profile.idNumber ?? '').trim() !== effectiveIdNumber ||
        (profile.sexAtBirth ?? 'unknown') !== effectiveSexAtBirth ||
        profile.documentIdFront !== nextDocumentIdFront ||
        profile.documentIdBack !== nextDocumentIdBack ||
        profile.idBarcodeExtracted !== nextBarcodeFlag ||
        (profile.givenNames ?? '') !== (effectiveGivenNames ?? '') ||
        (profile.surname ?? '') !== (effectiveSurname ?? '') ||
        (profile.initials ?? '') !== (effectiveInitials ?? '');
      const shouldUpdateForeignNational = idType === 'PASSPORT' && profile.isForeignNational !== isForeignNational;
      if (shouldUpdateProfile || shouldUpdateForeignNational) {
        const nextProfile = touch({
          ...profile,
          ...(shouldUpdateProfile
              ? {
                  idType,
                  idNumber: effectiveIdNumber,
                  sexAtBirth: effectiveSexAtBirth,
                  documentIdFront: nextDocumentIdFront,
                  documentIdBack: nextDocumentIdBack,
                  givenNames: effectiveGivenNames,
                  surname: effectiveSurname,
                  initials: effectiveInitials,
                  idBarcodeExtracted: nextBarcodeFlag,
                }
              : {}),
          ...(shouldUpdateForeignNational ? { isForeignNational } : {}),
        });
        persist(nextProfile);
        setProfile(nextProfile);
      }
      await updateApplicationsWithIdDocs(profile.id, keepDocs);
      baselineSignatureRef.current = signatureForState({ docs: activeDocs, idType, isForeignNational });
      initialIdNumberRef.current = effectiveIdNumber;
      initialGivenNamesRef.current = effectiveGivenNames ?? '';
      initialSurnameRef.current = effectiveSurname ?? '';
      initialInitialsRef.current = effectiveInitials ?? '';
      initialIdTypeRef.current = idType ?? initialIdTypeRef.current;
      initialForeignRef.current = isForeignNational;
      initialSexAtBirthRef.current = effectiveSexAtBirth;
      setShowBlockingIssues(false);
      savedRef.current = true;
      goReturn();
    } catch (error: any) {
      Alert.alert('Save failed', error?.message ?? 'Unable to save your ID details right now.');
    } finally {
      setProcessing(false);
    }
  }, [
    barcodeExtracted,
    barcodeProfile,
    applyPendingImageRotations,
    blockingValidation,
    deleteObsoleteIdDocs,
    docs,
    deriveInitialsFromNames,
    focusIssue,
    goReturn,
    hasRequiredNames,
    idType,
    isForeignNational,
    passportError,
    profile,
    sexAtBirth,
    trimmedGivenNames,
    trimmedInitials,
    trimmedIdNumber,
    trimmedSurname,
    updateApplicationsWithIdDocs,
    validationEnabled,
  ]);

  const handleMarkBothSides = useCallback(() => {
    if (idType !== 'ID_CARD') return;
    if (bothSidesSinglePage) {
      setBothSidesSinglePage(false);
      return;
    }
    const front = docs.front;
    if (!front) {
      Alert.alert('Upload front image first', 'Add the front image before marking both sides on one page.');
      return;
    }
    setDocs(prev => ({ ...prev, back: front }));
    setBothSidesSinglePage(true);
  }, [bothSidesSinglePage, docs.front, idType]);

  const handleSwapUploads = useCallback(() => {
    if (idType !== 'ID_CARD') return;
    const front = docs.front;
    const back = docs.back;
    if (!front || !back) {
      Alert.alert('Upload both sides', 'Add both sides before swapping uploads.');
      return;
    }
    setBothSidesSinglePage(false);
    setDocs(prev => ({ ...prev, front: back, back: front }));
  }, [docs.back, docs.front, idType]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      const actions: AlertButton[] = [
        { text: 'Continue editing', style: 'cancel' as const },
        { text: 'Discard', style: 'destructive' as const, onPress: discardChanges },
      ];
      if (canSave) {
        actions.push({ text: 'Save', onPress: () => { void handleSave(); } });
      }
      Alert.alert('Unsaved changes', 'Would you like to save your changes before leaving?', actions);
      return;
    }
    goReturn();
  }, [canSave, discardChanges, handleSave, hasChanges, goReturn]);

  const Cell = ({
    label,
    value,
    onPress,
    required,
    error,
    multiline,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    required?: boolean;
    error?: boolean;
    multiline?: boolean;
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, required && styles.requiredLabel]}>{required ? `${label} *` : label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.cell,
          multiline && styles.cellMultiline,
          error && styles.cellError,
          pressed && { opacity: 0.92 },
        ]}
      >
        <Text
          style={[
            styles.value,
            styles.valueText,
            !value && styles.placeholder,
            error && styles.errorText,
          ]}
          numberOfLines={multiline ? undefined : 2}
          ellipsizeMode="tail"
        >
          {value || 'Tap to add'}
        </Text>
        <Text style={[styles.chev, error && styles.chevError]}>›</Text>
      </Pressable>
    </View>
  );



  return (
    <Screen>
      <View style={styles.container}>
        {null}
        <PageHeader
          title="Proof of ID"
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!canSave || barcodeProcessing}
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
              {/* <Text style={styles.h1}>Capture your ID</Text> */}
              <Text style={styles.lead}>
                We will guide you through photographing your ID or passport so your details are ready when you need them.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Before you start</Text>
              {[
                'Have your ID card, ID book, or passport ready.',
                'Use a plain, solid-colour background.',
                'Make sure the document is clean and unobstructed.',
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
                buttonType={effectiveShowHints ? 'confirm' : 'stop'}
                accessibilityLabel={effectiveShowHints ? 'Hide these tips next time' : 'Show these tips next time'}
                onPress={toggleShowHints}
                disabled={processing}
                size={36}
                borderColor={effectiveShowHints ? tones.green.base : neutral.base}
              />
            </View>

            <Button label="Continue" onPress={() => setStep('capture')} tone="teal" align="center" centerText />
          </PageScrollView>
        ) : (
        <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <Text style={styles.lede}>
            {editMode
              ? 'View or update your ID.'
              : 'Choose your ID type and upload the required sides. The upload document is used to build a supporting document bundle.'}
          </Text>

          <ButtonCard
            title="ID type"
            buttons={[
              {
                label: 'ID card',
                // sublabel: 'Smart card format',
                tone: idType === 'ID_CARD' ? 'blue' : 'grey',
                variant: idType === 'ID_CARD' ? 'solid' : 'outline',
                borderColor: idType === 'ID_CARD' ? undefined : neutral.border,
                style: styles.idTypeButton,
                onPress: () => {
                  setIdType('ID_CARD');
                  setIsForeignNational(false);
                },
              },
              {
                label: 'ID book',
                // sublabel: 'Green ID book',
                tone: idType === 'ID_BOOK' ? 'blue' : 'grey',
                variant: idType === 'ID_BOOK' ? 'solid' : 'outline',
                borderColor: idType === 'ID_BOOK' ? undefined : neutral.border,
                style: styles.idTypeButton,
                onPress: () => {
                  setIdType('ID_BOOK');
                  setIsForeignNational(false);
                },
              },
              {
                label: 'Passport',
                // sublabel: 'International travel document',
                tone: idType === 'PASSPORT' ? 'blue' : 'grey',
                variant: idType === 'PASSPORT' ? 'solid' : 'outline',
                borderColor: idType === 'PASSPORT' ? undefined : neutral.border,
                style: styles.idTypeButton,
                onPress: () => {
                  setIdType('PASSPORT');
                },
              },
            ]}
          />

          {requiredSlots.includes('front') ? renderCaptureCard('front') : null}
          {requiredSlots.includes('back') && !bothSidesSinglePage ? renderCaptureCard('back') : null}
          {requiredSlots.includes('picture') ? renderCaptureCard('picture') : null}
          {idType === 'PASSPORT' ? (
            <ButtonCard
              title="Are you a foreign national?"
              columns={2}
              rows={1}
              centerText
              buttons={[
                {
                  label: 'No',
                  tone: !isForeignNational ? 'blue' : 'grey',
                  variant: !isForeignNational ? 'solid' : 'outline',
                  borderColor: isForeignNational ? neutral.border : undefined,
                  onPress: () => setIsForeignNational(false),
                },
                {
                  label: 'Yes',
                  tone: isForeignNational ? 'blue' : 'grey',
                  variant: isForeignNational ? 'solid' : 'outline',
                  borderColor: !isForeignNational ? neutral.border : undefined,
                  onPress: () => setIsForeignNational(true),
                },
              ]}
            />
          ) : null}
          {requiredSlots.includes('permit') ? renderCaptureCard('permit') : null}
          {shouldShowStatus ? (
            <View style={styles.captureStatus}>
              <View style={statusStyle}>
                <Text style={styles.captureStatusText}>{statusMessage}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.detailsTitle}>ID details</Text>
            </View>
            <Cell
              label={idTypeLabel ? `ID Number: (${idTypeLabel})` : 'ID Number'}
              value={idNumberDisplayValue}
              onPress={openIdDetails}
              required
              error={showBlockingIssues && validationEnabled && idNumberCellError}
            />
            <Cell
              label="Full Names"
              value={fullNameValue}
              onPress={openIdDetails}
              required
              error={showBlockingIssues && validationEnabled && namesCellError}
              multiline
            />
            {idType === 'PASSPORT' ? (
              <Cell
                label="Sex at Birth"
                value={
                  sexAtBirth === 'female'
                    ? 'Female'
                    : sexAtBirth === 'male'
                    ? 'Male'
                    : undefined
                }
                onPress={openIdDetails}
                required
                error={
                  showBlockingIssues &&
                  validationEnabled &&
                  sexAtBirth === 'unknown'
                }
              />
            ) : null}
          </View>

          {blockingItems.length > 0 ? (
            <View style={styles.captureStatus}>
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
                <View style={[styles.captureStatusBox, styles.captureStatusWarningCard]}>
                  <Text style={[styles.captureStatusText, styles.captureStatusTextWarning]}>
                    Please provide the following:
                  </Text>
                  <View style={styles.captureStatusList}>
                    {blockingItems.map((item, idx) => (
                      <View key={`${item}-${idx}`} style={styles.captureStatusItem}>
                        <Text style={styles.captureStatusBullet}>{'\u2022'}</Text>
                        <Text style={[styles.captureStatusText, styles.captureStatusTextWarning]}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Pressable>
            </View>
          ) : null}

          {/* {idType === 'ID_CARD' ? (
            <View style={styles.captureControls}>
              <Button
                label={bothSidesSinglePage ? 'Upload two images' : 'Upload contains both sides'}
                onPress={handleMarkBothSides}
                tone="grey"
                disabled={!docs.front || processing}
                style={styles.captureControlButton}
              />
              {!bothSidesSinglePage ? (
                <Button
                  label="Swap uploads"
                  onPress={handleSwapUploads}
                  tone="grey"
                  disabled={!docs.front || !docs.back || processing}
                  style={styles.captureControlButton}
                />
              ) : null}
            </View>
          ) : null} */}

          <ButtonSave
            label="Save"
            onPress={handleSave}
            disabled={!canSave || barcodeProcessing}
            loading={processing}
            iconPosition="left"
            fullWidth
            align="center"
          />
        </PageScrollView>
        )}
      </View>
      <ProcessingBlocker
        visible={processing || barcodeProcessing}
        label={processing ? processingLabel : 'Extracting barcode data...'}
      />
      <HelpModal {...helpModalProps} />
      {sheet?.type === 'idDetails' && (
        <IdDetailsSheet
          visible
          title={sheet.title}
          idType={idType}
          initial={{
            idNumber,
            givenNames,
            initials,
            surname,
            sexAtBirth,
          }}
          errors={idDetailErrors}
          onClearError={(field) => {
            setIdDetailErrors(prev => {
              if (!prev[field]) return prev;
              const next = { ...prev };
              delete next[field];
              return next;
            });
          }}
          onValidateIdNumber={validateIdNumberField}
          onCancel={() => setSheet(null)}
          onSave={saveIdDetails}
          styles={styles}
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
    cellError: {
      borderColor: tones.red.base,
    },
    value: { fontSize: 16, color: neutral.onSurface, flex: 1, marginRight: 10 },
    valueText: { fontWeight: '600' },
    placeholder: { color: neutral.base },
    errorText: { color: tones.red.base },
    chev: { color: neutral.base, fontSize: 20 },
    chevError: { color: tones.red.base },
    captureStatus: { marginTop: 4, marginBottom: 16 },
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
    captureStatusPressable: { borderRadius: 16 },
    captureStatusPressed: { opacity: 0.96 },
    captureStatusWarningCard: {
      borderRadius: 16,
      backgroundColor: tones.orange.surface,
      borderWidth: 1,
      borderColor: tones.orange.emphasis,
    },
    captureStatusTextWarning: { color: tones.orange.base },
    captureStatusList: { gap: 10, marginTop: 10 },
    captureStatusItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    captureStatusBullet: { color: tones.orange.base, fontSize: 16, lineHeight: 20, fontWeight: '700' },
    captureControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    captureControlButton: { flex: 1, minWidth: 180 },
    idTypeButton: { minHeight: 48, paddingVertical: 12 },
    kav: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: neutral.onBase, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 12 },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    sheetInput: {
      backgroundColor: neutral.onBase,
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 16,
      color: neutral.onSurface,
    },
    sheetInputError: { borderColor: tones.red.base },
    sheetRow: { flexDirection: 'row', gap: 10, marginTop: 0 },
    sheetBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    sheetCancel: { backgroundColor: neutral.surface },
    sheetSave: { backgroundColor: tones.teal.base },
    sheetCancelText: { color: neutral.onSurface, fontWeight: '700' },
    sheetSaveText: { color: tones.teal.onBase, fontWeight: '700' },
    fieldLabel: { color: neutral.base, fontWeight: '600' },
    fieldHelpText: { color: neutral.base, fontSize: 13, lineHeight: 18, marginTop: 4 },
    fieldBlock: { marginBottom: 10 },
    fieldScroll: { maxHeight: 360 },
    fieldScrollContent: { paddingBottom: 4 },
    optionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    optionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    optionButtonSelected: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    optionButtonError: {
      borderColor: tones.red.base,
    },
    optionButtonText: {
      color: neutral.onSurface,
      fontWeight: '600',
    },
    optionButtonTextSelected: {
      color: tones.teal.base,
    },
  });
