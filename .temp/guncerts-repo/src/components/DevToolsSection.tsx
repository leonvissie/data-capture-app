import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, FlatList, Platform, Switch, Pressable, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appConfig } from '../config/appConfig';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTones } from '../theme/tones';
import Button from '../components/Button';
import { listByType, eraseAll, deleteEntity, listOutbox, clearOutbox, saveEntity } from '../data/sqlite';
import { Application, Profile, Document, Extraction, AnyEntity, CompetencyCertificate, Firearm, Safe, UserPrefs, DevicePrefs, Feedback, Reminders, Membership, SupportingStatement, Proficiency } from '../data/types';
import { ensurePdfWorkspace, getPdfRootDirectory } from '../pdf/storage';
import { getAppDirectories } from '../utils/appDirectories';
import { getDocsDirUri } from '../utils/docCrypto';
import { useDevMode } from '../providers/DevModeProvider';
import { useLock } from '../providers/LockProvider';
import { saveDevicePrefs, saveUserPrefs } from '../data/repo';
import { createDevicePrefs, createProfile, createUserPrefs } from '../data/defaults';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../utils/documentPaths';
import { ComplianceNoticeService } from '../services/ComplianceNoticeService';
import { palettes } from '../theme/colors';
import { IconRoundButton } from './RoundIconButton';
import HelpTopicContent from './HelpTopicContent';
import { getAllHelpTopics, getHelpUsageScreens } from '../help';
import { removeArchivedApplications } from '../utils/removeArchivedApplications';

type EntityKey =
  | 'Application'
  | 'Profile'
  | 'Document'
  | 'Extraction'
  | 'Firearm'
  | 'CompetencyCertificate'
  | 'Proficiency'
  | 'SupportingStatement'
  | 'UserPrefs'
  | 'DevicePrefs'
  | 'Safe'
  | 'Reminders'
  | 'Feedback';
const ENTITY_OPTIONS: EntityKey[] = [
  'Application',
  'Profile',
  'Document',
  'Extraction',
  'Firearm',
  'Safe',
  'CompetencyCertificate',
  'Proficiency',
  'SupportingStatement',
  'UserPrefs',
  'DevicePrefs',
  'Reminders',
  'Feedback',
];

const SHARED_PDF_DIR = 'shared-pdfs';
const DOC_PREVIEW_DIR = 'doc-previews';
const PDF_DIR = 'pdf';
const COLOR_TONE_KEYS = ['teal', 'purple', 'blue', 'green', 'orange', 'pink', 'red', 'grey', 'lightBlue'] as const;
type ColorToneKey = typeof COLOR_TONE_KEYS[number];

function trimTrailingSlashes(path: string) {
  return path.replace(/\/+$/, '');
}

function hasScheme(path: string) {
  return /^[a-z]+:\/\//i.test(path);
}

function normalizeFileUri(path?: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (hasScheme(trimmed)) {
    if (trimmed.startsWith('file://') || trimmed.startsWith('content://')) {
      return trimmed;
    }
    return null;
  }
  if (trimmed.startsWith('/')) {
    return `file://${trimmed}`;
  }
  return null;
}

async function deleteUriIfExists(path?: string | null): Promise<boolean> {
  const uri = normalizeFileUri(path);
  if (!uri) return false;
  if (!uri.startsWith('file://')) {
    // We only have permission for app-managed file:// uris; skip others.
    return false;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return false;
  } catch {
    // If info lookup fails (e.g., file already gone), continue to delete attempt.
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch (err) {
    logger.warn('[dev-tools] delete failed', uri, err);
    return false;
  }
  return false;
}

async function deleteDirectoryIfExists(path?: string | null) {
  if (!path) return;
  const normalized = path.endsWith('/') ? path : `${path}/`;
  await deleteUriIfExists(normalized);
}

async function resolveBaseDirectories(): Promise<string[]> {
  const bases = new Set<string>();
  const add = (candidate?: string | null) => {
    if (typeof candidate === 'string' && candidate.length) {
      bases.add(trimTrailingSlashes(candidate));
    }
  };

  try {
    const { cacheDirectory, documentDirectory } = await getAppDirectories();
    add(cacheDirectory);
    add(documentDirectory);
  } catch (err) {
    logger.warn('[dev-tools] base directory resolution failed', err);
  }

  if (typeof FileSystem.cacheDirectory === 'string') {
    add(FileSystem.cacheDirectory);
  }
  if (typeof FileSystem.documentDirectory === 'string') {
    add(FileSystem.documentDirectory);
  }

  return Array.from(bases);
}

async function resolveSubdirectories(name: string): Promise<string[]> {
  const bases = await resolveBaseDirectories();
  return bases.map((base) => `${base}/${name}`);
}

function looksLikePdf(maybePath?: string | null, meta?: { mime?: string | null; name?: string | null }) {
  if (!maybePath && !meta?.name && !meta?.mime) return false;
  const lowerMime = meta?.mime?.toLowerCase();
  if (lowerMime === 'application/pdf') return true;
  const lowerName = meta?.name?.toLowerCase();
  if (lowerName?.endsWith('.pdf')) return true;
  const lowerPath = maybePath?.toLowerCase() ?? '';
  if (lowerPath.startsWith('data:')) return false;
  return /\.pdf(?:$|\?)/.test(lowerPath);
}

type DevToolsSectionProps = {
  onWipeComplete?: () => void;
};

export default function DevToolsSection({ onWipeComplete }: DevToolsSectionProps) {
  const router = useRouter();
  const { lock } = useLock();
  const APP_ENV = appConfig.buildEnv;
  const APP_VERSION = (Constants.expoConfig as any)?.version ?? 'unknown';
  const APP_BUILD =
    Platform.OS === 'ios'
      ? (Constants.expoConfig as any)?.ios?.buildNumber
      : Platform.OS === 'android'
        ? (Constants.expoConfig as any)?.android?.versionCode
        : (Constants.expoConfig as any)?.ios?.buildNumber ?? (Constants.expoConfig as any)?.android?.versionCode;
  const APP_VERSION_BUILD = APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION;
  const showDevSection = appConfig.features.showDevTools;
  const { devModeEnabled, setDevModeEnabled, testPaymentEnabled, setTestPaymentEnabled } = useDevMode();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const devButtonProps = useMemo(
    () => ({ style: styles.devButton, labelStyle: styles.devButtonLabel }),
    [styles]
  );

  useEffect(() => {
    if (!showDevSection) {
      setDevModeEnabled(false);
    }
  }, [setDevModeEnabled, showDevSection]);

  if (!showDevSection) return null;

  const [tick, setTick] = useState(0);
  const [selectedEntity, setSelectedEntity] = useState<EntityKey>('Application');
  const [pdfDiag, setPdfDiag] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [showColorSchemeModal, setShowColorSchemeModal] = useState(false);
  const [showHelpPreviewModal, setShowHelpPreviewModal] = useState(false);
  const [activeSwatchKey, setActiveSwatchKey] = useState<string | null>(null);
  const [noticeDebug, setNoticeDebug] = useState<{
    required: boolean;
    currentVersion?: string;
    currentBuild?: string;
    acceptedVersion?: string;
    acceptedBuild?: string;
    acceptedAt?: string;
  } | null>(null);

  const apps = useMemo(() => listByType<Application>('Application'), [tick]);
  const profiles = useMemo(() => listByType<Profile>('Profile'), [tick]);
  const userprefs = useMemo(() => listByType<UserPrefs>('UserPrefs'), [tick]);
  const deviceprefs = useMemo(() => listByType<DevicePrefs>('DevicePrefs'), [tick]);
  const feedback = useMemo(() => listByType<Feedback>('Feedback'), [tick]);
  const documents = useMemo(() => listByType<Document>('Document'), [tick]);
  const extractions = useMemo(() => listByType<Extraction>('Extraction'), [tick]);
  const competencyCerts = useMemo(
    () => listByType<CompetencyCertificate>('CompetencyCertificate'),
    [tick]
  );
  const firearms = useMemo(() => listByType<Firearm>('Firearm'), [tick]);
  const safes = useMemo(() => listByType<Safe>('Safe'), [tick]);
  const proficiencies = useMemo(() => listByType<Proficiency>('Proficiency'), [tick]);
  const supportingStatements = useMemo(
    () => listByType<SupportingStatement>('SupportingStatement'),
    [tick]
  );
  const reminders = useMemo(() => listByType<Reminders>('Reminders'), [tick]);
  const helpTopics = useMemo(
    () => getAllHelpTopics().slice().sort((a, b) => a.key.localeCompare(b.key)),
    []
  );

  // Refresh counts on focus (e.g., after creating data elsewhere)
  useFocusEffect(
    useCallback(() => {
      setTick(t => t + 1);
    }, [])
  );

  const refreshComplianceDebug = useCallback(async () => {
    const current = ComplianceNoticeService.getCurrentIdentifiers();
    const stored = await ComplianceNoticeService.getStoredAcceptance();
    const required = await ComplianceNoticeService.requiresAcknowledgement(appConfig.complianceNotice.trigger);
    setNoticeDebug({
      required,
      currentVersion: current.version,
      currentBuild: current.build,
      acceptedVersion: stored?.acceptedVersion,
      acceptedBuild: stored?.acceptedBuild,
      acceptedAt: stored?.acceptedAt,
    });
  }, []);

  useEffect(() => {
    if (!devModeEnabled) return;
    void refreshComplianceDebug();
  }, [devModeEnabled, refreshComplianceDebug]);

  const getItems = (key: EntityKey): AnyEntity[] => {
    switch (key) {
      case 'Application': return apps;
      case 'Profile': return profiles;
      case 'UserPrefs': return userprefs;
      case 'DevicePrefs': return deviceprefs;
      case 'Reminders': return reminders;
      case 'Document': return documents;
      case 'Extraction': return extractions;
      case 'Firearm': return firearms;
      case 'Safe': return safes;
      case 'Proficiency': return proficiencies;
      case 'SupportingStatement': return supportingStatements;
      case 'CompetencyCertificate': return competencyCerts;
      case 'Feedback': return feedback;
      default: return [];
    }
  };

  const selectedItems = getItems(selectedEntity);

  const openDataViewer = useCallback(
    (entity: EntityKey) => router.push({ pathname: '/dev-data-viewer', params: { entity } } as any),
    [router]
  );

  const Row = ({ label, value, onPress }: { label: string; value: string | number; onPress?: () => void }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        onPress && pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={styles.k}>{label}</Text>
      <Text style={styles.v}>{String(value)}</Text>
    </Pressable>
  );

  const performRemoveApplicationData = useCallback(async () => {
    if (busy) return;

    const currentApplications = listByType<Application>('Application');
    const allDocs = listByType<Document>('Document');
    const docsToRemove = allDocs.filter((doc) => {
      if (!doc.applicationId) return false;
      const mime = (doc.mime ?? '').toLowerCase();
      const name = (doc.name ?? doc.filePath ?? '').toLowerCase();
      return mime === 'application/pdf' || name.endsWith('.pdf');
    });

    if (!currentApplications.length && !docsToRemove.length) {
      Alert.alert('No application data', 'There are no applications or related PDF documents to remove.');
      return;
    }

    setBusy(true);
    try {
      const appIds = new Set(currentApplications.map((app) => String(app.id)));
      const docIds = new Set(docsToRemove.map((doc) => String(doc.id)));

      const fileCandidates = new Set<string>();
      currentApplications.forEach((app) => {
        if (app.pdfPath) fileCandidates.add(app.pdfPath);
        if (app.documentBundlePath) fileCandidates.add(app.documentBundlePath);
      });
      docsToRemove.forEach((doc) => {
        if (doc.uri) fileCandidates.add(doc.uri);
        if (doc.filePath) fileCandidates.add(doc.filePath);
        if (doc.thumbPath) fileCandidates.add(doc.thumbPath);
      });

      for (const uri of fileCandidates) {
        await deleteUriIfExists(uri);
      }

      const outboxItems = listOutbox();
      outboxItems.forEach((item) => {
        const entityId = item.entityId ? String(item.entityId) : '';
        const isApplication = item.entityType === 'Application' && entityId && appIds.has(entityId);
        const isDocument = item.entityType === 'Document' && entityId && docIds.has(entityId);
        if (isApplication || isDocument) {
          clearOutbox(item.id);
        }
      });

      docsToRemove.forEach((doc) => deleteEntity(doc.id));
      currentApplications.forEach((app) => deleteEntity(app.id));

      setTick((t) => t + 1);
      Alert.alert('Done', 'Applications and related PDF documents removed.');
    } catch (err: any) {
      logger.warn('[dev-tools] remove application data failed', err);
      Alert.alert('Remove failed', err?.message ?? 'Unable to remove application data.');
    } finally {
      setBusy(false);
    }
  }, [busy, setTick]);

  const confirmRemoveApplicationData = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Remove application data?',
      'Deletes applications and related PDF documents only. Keeps memberships, proficiencies, endorsements, supporting documents, profile info, competency certificates, and firearms.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void performRemoveApplicationData();
          },
        },
      ],
    );
  }, [busy, performRemoveApplicationData]);

  const performClearReminders = useCallback(() => {
    if (busy) return;
    try {
      reminders.forEach((reminder) => deleteEntity(reminder.id));
      setTick((t) => t + 1);
      Alert.alert('Done', 'Reminder records cleared.');
    } catch (err: any) {
      logger.warn('[dev-tools] clear reminders failed', err);
      Alert.alert('Clear failed', err?.message ?? 'Unable to clear reminder records.');
    }
  }, [busy, reminders, setTick]);

  const confirmClearReminders = useCallback(() => {
    if (busy) return;
    const count = reminders.length;
    if (!count) {
      Alert.alert('No reminders found', 'There are no reminder records to clear.');
      return;
    }
    Alert.alert(
      'Clear reminders?',
      `This will delete ${count} reminder record${count === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => performClearReminders() },
      ],
    );
  }, [busy, performClearReminders, reminders.length]);

  const lockAndShowFirstLoadSetup = useCallback(() => {
    if (busy) return;
    if (!userprefs.length) {
      Alert.alert('No user prefs', 'There are no user preferences to update.');
      return;
    }
    try {
      userprefs.forEach((prefs) => {
        saveUserPrefs({
          ...prefs,
          applicationIntent: undefined,
          welcomeFlow: undefined,
          isFirstLoad: true,
          showFirstTimeSetup: true,
        });
      });
      setTick((t) => t + 1);
      lock();
    } catch (err: any) {
      logger.warn('[dev-tools] lock + first load failed', err);
      Alert.alert('Update failed', err?.message ?? 'Unable to update first-load state.');
    }
  }, [busy, lock, userprefs]);

  const performRemoveArchivedApplications = useCallback(async () => {
    if (busy) return;

    const archivedApps = listByType<Application>('Application').filter((app) => app.status === 'archived');
    if (!archivedApps.length) {
      Alert.alert('No archived applications', 'There are no archived applications to remove.');
      return;
    }

    setBusy(true);
    try {
      const removedCount = await removeArchivedApplications();
      setTick((t) => t + 1);
      Alert.alert(
        'Done',
        `Removed ${removedCount} archived application${removedCount === 1 ? '' : 's'} and cleared generated PDF files.`,
      );
    } catch (err: any) {
      logger.warn('[dev-tools] remove archived applications failed', err);
      Alert.alert('Remove failed', err?.message ?? 'Unable to remove archived applications.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const confirmRemoveArchivedApplications = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Remove archived applications?',
      'Deletes archived application records and clears generated PDF files such as checklists, supporting PDFs, application PDFs, and bundles.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void performRemoveArchivedApplications();
          },
        },
      ],
    );
  }, [busy, performRemoveArchivedApplications]);

  const performWipeDb = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [previewDirs, sharedDirs, pdfDirs] = await Promise.all([
        resolveSubdirectories(DOC_PREVIEW_DIR),
        resolveSubdirectories(SHARED_PDF_DIR),
        resolveSubdirectories(PDF_DIR),
      ]);
      const cleanupTargets = new Set<string>([
        ...previewDirs,
        ...sharedDirs,
        ...pdfDirs,
      ]);
      for (const dir of cleanupTargets) {
        await deleteDirectoryIfExists(dir);
      }

      await deleteDirectoryIfExists(getDocsDirUri());

      eraseAll();
      const profile = createProfile();
      saveEntity(profile);
      const nextUserPrefs = createUserPrefs(profile.id);
      const nextDevicePrefs = createDevicePrefs({ holderProfileId: profile.id });
      saveUserPrefs(nextUserPrefs);
      saveDevicePrefs(nextDevicePrefs);
      setPdfDiag([]);
      setTick((t) => t + 1);
      onWipeComplete?.();
      Alert.alert('Done', 'Local database and cached files cleared.');
    } catch (err: any) {
      logger.warn('[dev-tools] wipe db failed', err);
      Alert.alert('Wipe failed', err?.message ?? 'Unable to wipe the local database.');
    } finally {
      setBusy(false);
    }
  }, [busy, setTick]);

  const confirmWipeDb = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Wipe local data?',
      'Deletes all records, cached files, and outbox entries (keeps passcode).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: () => {
            void performWipeDb();
          },
        },
      ],
    );
  }, [busy, performWipeDb]);

  const performWipeAllButPrefs = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [previewDirs, sharedDirs, pdfDirs] = await Promise.all([
        resolveSubdirectories(DOC_PREVIEW_DIR),
        resolveSubdirectories(SHARED_PDF_DIR),
        resolveSubdirectories(PDF_DIR),
      ]);
      const cleanupTargets = new Set<string>([
        ...previewDirs,
        ...sharedDirs,
        ...pdfDirs,
      ]);
      for (const dir of cleanupTargets) {
        await deleteDirectoryIfExists(dir);
      }

      await deleteDirectoryIfExists(getDocsDirUri());

      const deleteByType = <T extends AnyEntity>(type: T['type']) => {
        listByType<T>(type).forEach((entity) => deleteEntity(entity.id));
      };

      deleteByType<Application>('Application');
      deleteByType<Document>('Document');
      deleteByType<Extraction>('Extraction');
      deleteByType<Firearm>('Firearm');
      deleteByType<CompetencyCertificate>('CompetencyCertificate');
      deleteByType<Reminders>('Reminders');
      deleteByType<Feedback>('Feedback');
      deleteByType<any>('Safe');
      deleteByType<any>('Membership');
      deleteByType<any>('SupportingStatement');

      listOutbox().forEach((item) => clearOutbox(item.id));

      setPdfDiag([]);
      setTick((t) => t + 1);
      onWipeComplete?.();
      Alert.alert('Done', 'Local data cleared (profile + device prefs kept).');
    } catch (err: any) {
      logger.warn('[dev-tools] wipe all but prefs failed', err);
      Alert.alert('Wipe failed', err?.message ?? 'Unable to wipe the local data.');
    } finally {
      setBusy(false);
    }
  }, [busy, setTick]);

  const confirmWipeAllButPrefs = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Wipe data (keep profile + device prefs)?',
      'Deletes all records, cached files, and outbox entries except Profile and Device prefs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: () => {
            void performWipeAllButPrefs();
          },
        },
      ],
    );
  }, [busy, performWipeAllButPrefs]);

  const performClearCompCalcMethod = useCallback((mode: 'unknown' | 'undefined') => {
    if (busy) return;
    if (!userprefs.length) {
      Alert.alert('No user prefs', 'There are no user preferences to update.');
      return;
    }
    setBusy(true);
    try {
      userprefs.forEach((prefs) => {
        saveUserPrefs({
          ...prefs,
          dfoCompetencyExpiryUsing: mode === 'unknown' ? 'unknown' : undefined,
          compCertCalcMethodSet: false,
          competencyRemindersResetRequestedAt: new Date().toISOString(),
        });
      });
      setTick((t) => t + 1);
      Alert.alert(
        'Done',
        `Competency calculation method was cleared and set to ${mode === 'unknown' ? '"I don’t know"' : 'undefined'}.`,
      );
    } catch (err: any) {
      logger.warn('[dev-tools] clear competency calc method failed', err);
      Alert.alert('Update failed', err?.message ?? 'Unable to clear competency calculation method.');
    } finally {
      setBusy(false);
    }
  }, [busy, userprefs]);

  const confirmClearCompCalcMethod = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Clear competency calc method?',
      'Choose whether the competency expiry method should be reset to I don’t know or left undefined.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set undefined',
          onPress: () => performClearCompCalcMethod('undefined'),
        },
        {
          text: 'Set I don’t know',
          onPress: () => performClearCompCalcMethod('unknown'),
        },
      ],
    );
  }, [busy, performClearCompCalcMethod]);

  const performClearProfileReferences = useCallback(() => {
    if (busy) return;
    if (!profiles.length) {
      Alert.alert('No profiles', 'There are no profile records to update.');
      return;
    }
    setBusy(true);
    try {
      profiles.forEach((profile) => {
        saveEntity({
          ...profile,
          references: [],
        } as Profile);
      });
      setTick((t) => t + 1);
      Alert.alert('Done', 'Profile.references cleared.');
    } catch (err: any) {
      logger.warn('[dev-tools] clear profile references failed', err);
      Alert.alert('Clear failed', err?.message ?? 'Unable to clear Profile.references.');
    } finally {
      setBusy(false);
    }
  }, [busy, profiles]);

  const confirmClearProfileReferences = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Clear Profile.references?',
      'This removes all reference entries from profile records.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: performClearProfileReferences },
      ],
    );
  }, [busy, performClearProfileReferences]);

  const performPruneOrphanDocuments = useCallback(() => {
    if (busy) return;
    setBusy(true);
    try {
      const docs = listByType<Document>('Document');
      const profilesById = new Map(profiles.map((item) => [String(item.id), item]));
      const certsById = new Map(competencyCerts.map((item) => [String(item.id), item]));
      const membershipsById = new Map(listByType<Membership>('Membership').map((item) => [String(item.id), item]));
      const safesById = new Map(safes.map((item) => [String(item.id), item]));
      const firearmsById = new Map(firearms.map((item) => [String(item.id), item]));
      const supportingById = new Map(listByType<SupportingStatement>('SupportingStatement').map((item) => [String(item.id), item]));

      let removed = 0;
      let kept = 0;

      docs.forEach((doc) => {
        if ((doc.kind as string) === 'ADDRESS') {
          kept += 1;
          return;
        }
        const parentType = doc.parentType;
        const parentId = doc.parentId ? String(doc.parentId) : '';
        if (!parentType || !parentId) {
          deleteEntity(doc.id);
          removed += 1;
          return;
        }

        const isLinked = (() => {
          switch (parentType) {
            case 'Profile': {
              const parent = profilesById.get(parentId);
              if (!parent) return false;
              return String(parent.documentIdFront ?? '') === String(doc.id)
                || String(parent.documentIdBack ?? '') === String(doc.id);
            }
            case 'CompetencyCertificate': {
              const parent = certsById.get(parentId);
              if (!parent) return false;
              return String(parent.certificateDocumentId ?? '') === String(doc.id);
            }
            case 'Membership': {
              const parent = membershipsById.get(parentId);
              if (!parent) return false;
              return (parent.membershipDocumentIds ?? []).some((entry) => String(entry.documentId) === String(doc.id));
            }
            case 'Safe': {
              const parent = safesById.get(parentId);
              if (!parent) return false;
              return (parent.safePhotos ?? []).some((entry) => String(entry.documentId) === String(doc.id));
            }
            case 'SupportingStatement': {
              const parent = supportingById.get(parentId);
              if (!parent) return false;
              return String(parent.documentId ?? '') === String(doc.id);
            }
            case 'Firearm': {
              return firearmsById.has(parentId);
            }
            default:
              return false;
          }
        })();

        if (!isLinked) {
          deleteEntity(doc.id);
          removed += 1;
          return;
        }
        kept += 1;
      });

      Alert.alert('Document links checked', `${removed} orphaned documents removed. ${kept} kept.`);
      setTick((t) => t + 1);
    } catch (err: any) {
      logger.warn('[dev-tools] prune documents failed', err);
      Alert.alert('Check failed', err?.message ?? 'Unable to validate document links.');
    } finally {
      setBusy(false);
    }
  }, [busy, competencyCerts, firearms, profiles, safes, setTick]);

  const confirmPruneOrphanDocuments = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Validate document links?',
      'This will remove Document entries that are missing a valid parent or are not referenced by their parent.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: performPruneOrphanDocuments },
      ],
    );
  }, [busy, performPruneOrphanDocuments]);

  const removePdfFiles = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const currentDocs = listByType<Document>('Document');
      const currentApps = listByType<Application>('Application');
      const candidates = new Set<string>();

      const register = (rawPath?: string | null, meta?: { mime?: string | null; name?: string | null }) => {
        if (!rawPath) return;
        if (!looksLikePdf(rawPath, meta)) return;
        const resolved = resolveDocumentUri(rawPath) ?? rawPath;
        const normalized = normalizeFileUri(resolved);
        if (!normalized || !normalized.startsWith('file://')) return;
        candidates.add(normalized);
      };

      currentDocs.forEach((doc) => {
        register(doc.uri, { mime: doc.mime, name: doc.name });
        register(doc.filePath, { mime: doc.mime, name: doc.name });
      });

      currentApps.forEach((app) => {
        register(app.pdfPath, { mime: 'application/pdf', name: app.pdfPath });
      });

      let removed = 0;
      for (const uri of candidates) {
        const ok = await deleteUriIfExists(uri);
        if (ok) {
          removed += 1;
        }
      }

      Alert.alert(
        'PDF cleanup complete',
        removed
          ? `Removed ${removed} PDF file${removed === 1 ? '' : 's'}.`
          : 'No PDF files found to delete.'
      );
    } catch (err: any) {
      logger.warn('[dev-tools] remove pdf files failed', err);
      Alert.alert('PDF cleanup failed', err?.message ?? 'Unable to remove PDF files.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const renderEntityCard = ({ item }: { item: AnyEntity }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {item.type} • {new Date(item.updatedAt).toLocaleString()}
      </Text>
      <Text selectable style={styles.mono}>
        {JSON.stringify(item, null, 2)}
      </Text>
    </View>
  );

  const runPdfDiagnostics = useCallback(async () => {
    const lines: string[] = [];
    lines.push(`Platform: ${Platform.OS}`);

    // Execution environment & debugger checks
    const execEnv = (Constants as any)?.executionEnvironment ?? 'unknown';
    const isHermes = !!(global as any).HermesInternal;
    const hasNativeCallSyncHook = typeof (global as any).nativeCallSyncHook === 'function';
    // Heuristic: when remote JS debugging is enabled, Hermes is usually off and nativeCallSyncHook is missing
    const isRemoteDebugging = !isHermes && !hasNativeCallSyncHook;
    lines.push(`executionEnvironment: ${String(execEnv)}`);
    lines.push(`engine: ${isHermes ? 'Hermes' : 'Non‑Hermes'}`);
    lines.push(`remoteDebugging: ${isRemoteDebugging ? 'ON' : 'OFF'}`);

    if (isRemoteDebugging) {
      lines.push(
        'Remote JS Debugging appears to be ON — many native modules (incl. expo‑file‑system) may not work. Disable it in the Dev Menu and re‑run.'
      );
      setPdfDiag(lines);
      return;
    }

    // Only run on native (iOS/Android). Web lacks native FileSystem.
    if (Platform.OS === 'web') {
      lines.push('Environment: web — native FileSystem not available. Skipping native checks.');
      setPdfDiag(lines);
      return;
    }

    // Basic module sanity check
    try {
      // Accessing a couple of known exports; if the module isn't linked, this may be undefined
      const fsKeys = Object.keys(FileSystem ?? {});
      if (fsKeys.length === 0 || typeof FileSystem.getInfoAsync !== 'function') {
        lines.push('expo-file-system module seems unavailable or not linked.');
        setPdfDiag(lines);
        return;
      }
    } catch (e) {
      lines.push(`expo-file-system access error: ${String((e as Error)?.message || e)}`);
      setPdfDiag(lines);
      return;
    }

    let docDir: string | null = null;
    let cacheDir: string | null = null;
    try {
      const dirs = await getAppDirectories();
      docDir = dirs.documentDirectory ?? null;
      cacheDir = dirs.cacheDirectory ?? null;
    } catch (dirErr) {
      lines.push(`getAppDirectories error: ${(dirErr as Error)?.message ?? String(dirErr)}`);
    }

    if (!docDir || !cacheDir) {
      docDir = docDir ?? null;
      cacheDir = cacheDir ?? null;
    }

    const hasDoc = typeof docDir === 'string' && (docDir?.length ?? 0) > 0;
    const hasCache = typeof cacheDir === 'string' && (cacheDir?.length ?? 0) > 0;

    lines.push(`documentDirectory: ${docDir ?? 'null'}`);
    lines.push(`cacheDirectory: ${cacheDir ?? 'null'}`);

    // If both are missing, the native module isn't initialized
    if (!hasDoc && !hasCache) {
      lines.push('No documentDirectory or cacheDirectory detected — FileSystem unavailable in this env.');
      setPdfDiag(lines);
      return;
    }

    const root = await getPdfRootDirectory();
    lines.push(`pdfRootDirectory: ${root ?? 'null (resolver failed)'}`);

    try {
      await ensurePdfWorkspace();
      lines.push('ensurePdfWorkspace: success ✅');
    } catch (err: any) {
      lines.push(`ensurePdfWorkspace: ERROR ❌ -> ${err?.message ?? String(err)}`);
    }

    if (root) {
      const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
      const testPath = `${normalizedRoot}diag-${Date.now()}.txt`;
      try {
        await FileSystem.writeAsStringAsync(testPath, 'pdf diag test');
        lines.push(`writeTest: wrote to ${testPath}`);
        await FileSystem.getInfoAsync(testPath);
        await FileSystem.deleteAsync(testPath);
        lines.push('cleanup: success');
      } catch (err: any) {
        lines.push(`writeTest: ERROR ❌ -> ${err?.message ?? String(err)}`);
      }
    } else {
      lines.push('writeTest: skipped (no pdfRootDirectory)');
    }

    setPdfDiag(lines);
  }, []);

  return (
    <View style={styles.content}>
      <Text style={styles.h1}>Dev tools (for beta testing)</Text>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Developer mode</Text>
          <Text style={styles.toggleHelp}>Toggle dev-only diagnostics across the app.</Text>
        </View>
        <Switch value={devModeEnabled} onValueChange={setDevModeEnabled} />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Test payment</Text>
          <Text style={styles.toggleHelp}>Show test payment UI on the payment screen.</Text>
        </View>
        <Switch value={testPaymentEnabled} onValueChange={setTestPaymentEnabled} />
      </View>

      <Row label="APP_ENV" value={APP_ENV} />
      <Row label="APP_VERSION (BUILD)" value={APP_VERSION_BUILD} />

      {devModeEnabled ? (
        <View style={styles.noticeDebugCard}>
          <Text style={styles.noticeDebugTitle}>Compliance notice debug</Text>
          <Text style={styles.noticeDebugLine}>trigger: {appConfig.complianceNotice.trigger}</Text>
          <Text style={styles.noticeDebugLine}>required now: {noticeDebug?.required ? 'yes' : 'no'}</Text>
          <Text style={styles.noticeDebugLine}>current version: {noticeDebug?.currentVersion ?? 'unknown'}</Text>
          <Text style={styles.noticeDebugLine}>current build: {noticeDebug?.currentBuild ?? 'unknown'}</Text>
          <Text style={styles.noticeDebugLine}>accepted version: {noticeDebug?.acceptedVersion ?? 'none'}</Text>
          <Text style={styles.noticeDebugLine}>accepted build: {noticeDebug?.acceptedBuild ?? 'none'}</Text>
          <Text style={styles.noticeDebugLine}>accepted at: {noticeDebug?.acceptedAt ?? 'none'}</Text>
        </View>
      ) : null}


      <Button
        label="Motivation wizard"
        sublabel="Open the dev motivation wizard flow"
        onPress={() => router.push('/motivation/wizard' as any)}
        tone="green"
        disabled={busy}
        {...devButtonProps}
      />
      
      <Button
        label="Lock app"
        // sublabel="Lock immediately and return to the unlock screen."
        onPress={lock}
        tone="blue"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Lock app + first-time setup"
        onPress={lockAndShowFirstLoadSetup}
        tone="blue"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Clear reminders"
        onPress={confirmClearReminders}
        tone="orange"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Clear comp calc method"
        onPress={confirmClearCompCalcMethod}
        tone="orange"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Clear Profile.references"
        onPress={confirmClearProfileReferences}
        tone="orange"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Remove application data"
        // sublabel="Delete applications & supporting files; keep profile data"
        onPress={confirmRemoveApplicationData}
        tone="orange"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Wipe all but Profile & Prefs"
        onPress={confirmWipeAllButPrefs}
        tone="red"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Wipe DB & storage"
        // sublabel="Remove all records, cached files, and outbox entries"
        onPress={confirmWipeDb}
        tone="red"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Remove orphaned documents"
        onPress={confirmPruneOrphanDocuments}
        tone="teal"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Color scheme"
        onPress={() => setShowColorSchemeModal(true)}
        tone="purple"
        disabled={busy}
        {...devButtonProps}
      />

      <Button
        label="Help content preview"
        onPress={() => setShowHelpPreviewModal(true)}
        tone="blue"
        disabled={busy}
        {...devButtonProps}
      />


      {devModeEnabled ? (
        <>
          <Row label="Profiles" value={profiles.length} onPress={() => openDataViewer('Profile')} />
          <Row label="User prefs" value={userprefs.length} onPress={() => openDataViewer('UserPrefs')} />
          <Row label="Device prefs" value={deviceprefs.length} onPress={() => openDataViewer('DevicePrefs')} />
          <Row label="Reminders" value={reminders.length} onPress={() => openDataViewer('Reminders')} />
          <Row label="Feedback" value={feedback.length} onPress={() => openDataViewer('Feedback')} />
          <Row label="Applications" value={apps.length} onPress={() => openDataViewer('Application')} />
          <Row label="Proficiencies" value={proficiencies.length} onPress={() => openDataViewer('Proficiency')} />
          <Row label="Character references" value={supportingStatements.length} onPress={() => openDataViewer('SupportingStatement')} />
          <Row label="Competency certs" value={competencyCerts.length} onPress={() => openDataViewer('CompetencyCertificate')} />
          <Row label="Firearms" value={firearms.length} onPress={() => openDataViewer('Firearm')} />
          <Row label="Safes" value={safes.length} onPress={() => openDataViewer('Safe')} />
          <Row label="Documents" value={documents.length} onPress={() => openDataViewer('Document')} />
          <Row label="Extractions" value={extractions.length} onPress={() => openDataViewer('Extraction')} />
        </>
      ) : null}

      {/* <Button
        label="Preview component"
        sublabel="Document-style card with configurable buttons"
        onPress={() => router.push('/dev-button-card' as any)}
        tone="blue"
      /> */}

      {/* <Button
        label="Open Data Viewer"
        sublabel="Browse raw entities"
        onPress={() => router.push('/dev-data-viewer' as any)}
        tone="blue"
      /> */}

      {/* <Button
        label="Open OCR Debugger"
        sublabel="Verify expo-mlkit-ocr wiring"
        onPress={() => router.push('/dev-ocr-debugger' as any)}
        tone="blue"
      /> */}

      {/* <Button
        label="Run PDF diagnostics"
        sublabel="Update 1 · Check FileSystem availability for PDF generation"
        onPress={runPdfDiagnostics}
        tone="grey"
        disabled={busy}
      /> */}

      {/* <Button
        label="Preview a PDF"
        sublabel="Load bundled assets/pdf/271.pdf in a simple viewer"
        onPress={() => router.push('/dev-preview-pdf' as any)}
        tone="grey"
      /> */}

      {/* {pdfDiag.length ? (
        <View style={styles.diagBox}>
          {pdfDiag.map((line, idx) => (
            <Text key={idx} selectable style={styles.diagText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null} */}

      {/* <Button
        label="Remove PDF files"
        sublabel="Delete all app-referenced PDFs from local storage"
        onPress={removePdfFiles}
        tone="grey"
        disabled={busy}
      /> */}

      {/* Data viewer */}
      {/* <Text style={styles.h2}>Data viewer</Text>
      <View style={styles.pickerWrap} accessible accessibilityLabel="Entity picker">
        <Picker
          selectedValue={selectedEntity}
          onValueChange={(v) => setSelectedEntity(v as EntityKey)}
          dropdownIconColor={neutral.onSurface as any}
          style={styles.picker}
        >
          {ENTITY_OPTIONS.map(k => (
            <Picker.Item key={k} label={k} value={k} />
          ))}
        </Picker>
      </View>

      <Text style={styles.help}>
        Showing {selectedItems.length} {selectedEntity}{selectedItems.length === 1 ? '' : 's'}
      </Text>

      <FlatList
        data={selectedItems}
        keyExtractor={(e) => e.id}
        renderItem={renderEntityCard}
        contentContainerStyle={{ paddingBottom: 24 }}
      /> */}

      <Modal
        visible={showHelpPreviewModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHelpPreviewModal(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        hardwareAccelerated
      >
        <View style={styles.helpPreviewOverlay}>
          <SafeAreaView style={styles.helpPreviewShell} edges={['top']}>
            <View style={styles.helpPreviewModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Help content preview</Text>
              <IconRoundButton
                buttonType="close"
                size="sm"
                onPress={() => setShowHelpPreviewModal(false)}
                accessibilityLabel="Close help content preview"
                style={styles.modalCloseButton}
              />
            </View>

            <ScrollView
              style={styles.helpPreviewScroll}
              contentContainerStyle={styles.helpPreviewList}
              showsVerticalScrollIndicator
              bounces={false}
            >
              {helpTopics.map((topic) => {
                const screens = getHelpUsageScreens(topic.key);
                return (
                  <View key={topic.key} style={styles.helpPreviewCard}>
                    <Text style={styles.helpPreviewKey}>{topic.key}</Text>
                    <Text style={styles.helpPreviewSubtitle}>
                      {screens.length ? screens.join(' • ') : 'No direct call sites found'}
                    </Text>
                    <Text style={styles.helpPreviewHeading}>{topic.heading}</Text>
                    <HelpTopicContent sections={topic.sections} style={styles.helpPreviewBody} />
                  </View>
                );
              })}
            </ScrollView>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={showColorSchemeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowColorSchemeModal(false)}
      >
        <Pressable style={styles.modalScrim} onPress={() => setShowColorSchemeModal(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Color scheme preview</Text>
              <IconRoundButton
                buttonType="close"
                size="sm"
                onPress={() => setShowColorSchemeModal(false)}
                accessibilityLabel="Close color scheme preview"
                style={styles.modalCloseButton}
              />
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.schemeColumns}>
                  {(['light', 'dark'] as const).map((mode) => {
                    const modeTones = palettes[mode].tones;
                    return (
                      <View key={mode} style={styles.schemeColumn}>
                        <Text style={styles.schemeColumnTitle}>{mode.toUpperCase()}</Text>
                        {COLOR_TONE_KEYS.map((toneKey) => {
                          const tone = modeTones[toneKey as ColorToneKey];
                          return (
                            <View key={`${mode}-${toneKey}`} style={styles.toneCard}>
                              <Text style={styles.toneLabel}>{toneKey}</Text>
                              <Pressable
                                onPressIn={() => setActiveSwatchKey(`${mode}-${toneKey}`)}
                                onPressOut={() => setActiveSwatchKey((current) => (current === `${mode}-${toneKey}` ? null : current))}
                                onPress={() => {}}
                                style={[
                                  styles.outerSwatch,
                                  {
                                    backgroundColor: tone.surface,
                                    borderColor: tone.border,
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.innerSwatch,
                                    {
                                      backgroundColor:
                                        activeSwatchKey === `${mode}-${toneKey}` ? tone.emphasis : tone.base,
                                    },
                                  ]}
                                />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    content: { gap: 16 },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, marginBottom: 6 },
    h2: { fontSize: 18, fontWeight: '700', color: neutral.onSurface, marginTop: 12 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: neutral.border,
    },
    k: { color: neutral.base },
    v: { color: neutral.onSurface, fontWeight: '700' },
    pickerWrap: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 10,
      overflow: 'hidden',
    },
    picker: { color: neutral.onSurface, height: 48 },
    card: { padding: 12, borderWidth: 1, borderColor: neutral.border, borderRadius: 12, marginTop: 10 },
    cardTitle: { color: neutral.onSurface, fontWeight: '700', marginBottom: 8 },
    mono: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      color: neutral.onSurface,
    },
    help: { color: neutral.base, marginTop: 6 },
    diagBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      gap: 4,
    },
    diagText: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      fontSize: 12,
      color: neutral.onSurface,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: neutral.border,
    },
    toggleLabel: { fontSize: 16, fontWeight: '600', color: neutral.onSurface },
    toggleHelp: { fontSize: 13, color: neutral.base, marginTop: 4 },
    noticeDebugCard: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: neutral.surface,
      gap: 2,
    },
    noticeDebugTitle: { fontSize: 13, fontWeight: '700', color: neutral.onSurface, marginBottom: 4 },
    noticeDebugLine: { fontSize: 12, color: neutral.base },
    devButton: {
      borderRadius: 10,
      paddingVertical: 10,
    },
    devButtonLabel: {
      fontSize: 14,
      fontWeight: '700',
    },
    helpPreviewOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-start',
    },
    helpPreviewShell: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    helpPreviewModalCard: {
      flex: 1,
      marginTop: Platform.OS === 'ios' ? 54 : 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      overflow: 'hidden',
      gap: 10,
    },
    modalScrim: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      padding: 16,
    },
    modalCard: {
      maxHeight: '90%',
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 14,
      backgroundColor: neutral.onBase,
      padding: 12,
      gap: 10,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 36,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: neutral.onSurface,
      textAlign: 'center',
    },
    modalCloseButton: {
      position: 'absolute',
      right: 0,
    },
    modalScroll: {
      maxHeight: '100%',
    },
    modalScrollContent: {
      paddingBottom: 8,
    },
    helpPreviewScroll: {
      flex: 1,
    },
    helpPreviewList: {
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 24,
      gap: 14,
    },
    helpPreviewCard: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 12,
      backgroundColor: neutral.surface,
      padding: 14,
      gap: 10,
    },
    helpPreviewKey: {
      fontSize: 15,
      fontWeight: '800',
      color: neutral.onSurface,
    },
    helpPreviewSubtitle: {
      fontSize: 12,
      color: neutral.base,
    },
    helpPreviewHeading: {
      fontSize: 20,
      fontWeight: '800',
      color: neutral.onSurface,
      paddingTop: 4,
    },
    helpPreviewBody: {
      paddingTop: 2,
    },
    schemeColumns: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
      minWidth: '100%',
      alignSelf: 'stretch',
      justifyContent: 'space-between',
    },
    schemeColumn: {
      flex: 1,
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 12,
      backgroundColor: neutral.surface,
      padding: 10,
      gap: 10,
      alignItems: 'center',
    },
    schemeColumnTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: neutral.onSurface,
    },
    toneCard: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 10,
      backgroundColor: neutral.onBase,
      padding: 8,
      gap: 6,
      alignItems: 'center',
    },
    toneLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: neutral.onSurface,
      textTransform: 'capitalize',
    },
    outerSwatch: {
      width: 96,
      height: 96,
      borderWidth: 3,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    innerSwatch: {
      width: 54,
      height: 54,
      borderRadius: 6,
    },
  });
