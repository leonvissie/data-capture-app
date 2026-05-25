import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform, BackHandler, LayoutAnimation } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Screen from '../../../src/components/Screen';
import PageHeader from '../../../src/components/PageHeader';
import PageScrollView from '../../../src/components/PageScrollView';
import { useTones } from '../../../src/theme/tones';
import Button from '../../../src/components/Button';
import DocumentActionCard from '../../../src/components/DocumentActionCard';
import { Application, CompetencyCertificate, Document, Firearm, Membership, Profile, SupportingStatement } from '../../../src/data/types';
import { deleteEntity, getById, listByType } from '../../../src/data/sqlite';
import { persist, touch } from '../../../src/data/repo';
import { clearProfileProofOfAddress } from '../../../src/data/entityCleanup';
import { resolveRequirementsForApplication } from '../../../src/policy/resolve';
import { generateOrGetChecklistPdf } from '../../../src/pdf/checklist';
import { Asset } from 'expo-asset';
import policy517g from '../../../src/policy/517g.json';
import policy518a from '../../../src/policy/518a.json';
import { addressTooLongAlertMessage, getAddressLengthLimit, isAddressTooLong } from '../../../src/utils/addressLength';
import { computeDocumentReadiness, computeMembershipStatus, type DocumentReadinessResult } from '../../../src/utils/applicationReady';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system/next';
import { getAppDirectories } from '../../../src/utils/appDirectories';
import { generateApplicationPdf } from '../../../src/pdf/applications';
import {
  generateSupportingDocumentsPdf,
  generateSupportingStatementsPdf,
  type PdfPageProgress,
} from '../../../src/pdf/supporting';
import { generateMotivationPdf } from '../../../src/pdf/motivation';
import { generateDocumentBundlePdf } from '../../../src/pdf/bundle';
import { PdfPreview } from '../../../src/components/PdfPreview';
import { decodeNav, statusToListPath, resolveDocumentsNav, buildDocumentsRoute, backOrReplaceWithContext } from '../../../src/navigation/helpers';
import ProcessingOverlay from '../../../src/components/ProcessingOverlay';
import { resolveApplicationFirearms, resolveApplicationCompetencyCertificates } from '../../../src/pdf/context';
import { ApplicationCard, FORM_LABEL_MAP, licenceLabel } from '../../../src/components/ApplicationCard';
import { appConfig } from '../../../src/config/appConfig';
import { finaliseApplication } from '../../../src/utils/finaliseApplication';
import { IconRoundButton } from '../../../src/components/RoundIconButton';
import { logger } from '@/src/utils/logger';
import { formatFirearmTitle } from '../../../src/utils/firearmDisplay';
import { resolveDocumentUri, toRelativeDocumentPath } from '../../../src/utils/documentPaths';
import { sharePdf } from '../../../src/utils/sharePdf';
import { deleteOwnedDocFile } from '../../../src/utils/docCrypto';
import { isDemoDatasetActive } from '../../../src/demo/demoState';
import { useLock } from '../../../src/providers/LockProvider';
import { getProofOfAddressFreshness } from '../../../src/utils/proofOfAddressFreshness';
import { buildMembershipSubmissionWarningCopy, getMembershipSubmissionValidity } from '../../../src/utils/membershipSubmissionValidity';
import { buildMembershipDocumentFreshnessCopy, getMembershipDocumentFreshness } from '../../../src/utils/membershipDocumentFreshness';
import {
  buildSupportingStatementFreshnessCopy,
  getSupportingStatementFreshness,
  resolveSupportingStatementsForApplication,
} from '../../../src/utils/supportingStatementFreshness';
import { isDeviceOffline } from '../../../src/utils/connectivity';
import { prefetchIapPriceForApplication } from '../../../src/iap/useIapPurchase';
import {
  DECLARATIONS_ANCHOR,
  MISSING_SUPPORTING_STATEMENT,
  buildExpiredSelectionWarningCopy,
  buildMissingItemOrder,
  buildMissingMessage,
  buildSectionLimitWarningIssues,
  buildSubmittedApplicationWarningIssues,
  getFirearmMaxRule,
  normalizeMissingItem,
  parseMissingItems,
  sortMissingItems,
  type DocumentSectionIssue,
} from '../../../src/utils/documentIssues';
import { resolveActiveReminderApplications, type ReminderRenewalItemType } from '../../../src/utils/reminderApplicationResolution';
import { resolveApplicationMotivation } from '../../../src/utils/motivationStore';
import { ensureApplicationPdfFreshness } from '../../../src/utils/applicationPdfFreshness';
import { composeMotivation } from '../../../src/config/motivation/composer';
import { resolveEvidenceFromApplication } from '../../../src/config/motivation/evidenceResolver';
import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionType,
} from '../../../src/config/motivation/sentenceBank.types';

// Helpers
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const idDocKinds: Document['kind'][] = ['ID_CARD', 'ID_BOOK', 'PASSPORT'];
const docIdType = (doc?: Document): Profile['idType'] | undefined => {
  if (!doc) return undefined;
  const kind = `${doc.kind ?? ''}`.toUpperCase();
  if (kind.includes('PASSPORT')) return 'PASSPORT';
  if (kind.includes('BOOK')) return 'ID_BOOK';
  return 'ID_CARD';
};
const labelForIdType = (type?: Profile['idType']) => {
  if (type === 'PASSPORT') return 'passport';
  if (type === 'ID_BOOK') return 'ID book';
  if (type === 'ID_CARD') return 'ID card';
  return 'ID';
};
const formatFormTitle = (form?: string | null) => {
  if (!form) return null;
  const normalized = String(form).trim();
  if (!normalized) return null;
  const match = /^(\d+)([a-z])$/i.exec(normalized);
  if (!match) return normalized;
  return `${match[1]}(${match[2].toLowerCase()})`;
};

const normalizeReminderForm = (value?: string | null) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^e/, '');
  if (normalized === '517g' || normalized === '518a') return normalized as '517g' | '518a';
  return null;
};

const compareApplicationsNewestFirst = (a: Application, b: Application) => {
  const updatedA = Date.parse(a.updatedAt || '');
  const updatedB = Date.parse(b.updatedAt || '');
  const createdA = Date.parse(a.createdAt || '');
  const createdB = Date.parse(b.createdAt || '');
  const updatedDiff = (Number.isNaN(updatedB) ? 0 : updatedB) - (Number.isNaN(updatedA) ? 0 : updatedA);
  if (updatedDiff !== 0) return updatedDiff;
  return (Number.isNaN(createdB) ? 0 : createdB) - (Number.isNaN(createdA) ? 0 : createdA);
};

const formatConflictFirearmLabel = (firearm: Firearm) => {
  return formatFirearmTitle(firearm, 'Firearm licence');
};

const formatConflictCompetencyLabel = (certificate: CompetencyCertificate) =>
  certificate.certificateNumber?.trim() || 'Competency certificate';

const SUPPORTING_STATEMENT_SLOT_ORDER: Record<string, number> = {
  spouse_family: 0,
  friend_colleague_neighbour: 1,
  additional_reference: 2,
};

const MOTIVATION_PURPOSE_OPTIONS = new Set<MotivationPurposeType>([
  'self_defence',
  'hunting',
  'sport_shooting',
  'mixed_hunting_sport',
]);

function inferSectionTypeFromFirearmSection(value?: string | null): MotivationSectionType | null {
  const normalized = `${value ?? ''}`.toLowerCase();
  if (normalized.includes('13')) return 's13';
  if (normalized.includes('15')) return 's15';
  if (normalized.includes('16')) return 's16';
  return null;
}

function buildMotivationEvidenceKeys(
  applicationType: MotivationApplicationType,
  sectionType: MotivationSectionType
): string[] {
  const keys = ['competency_certificate', 'proficiency_certificate', 'safe_photos'];
  if (applicationType === 'renewal') keys.push('existing_licence_copy');
  if (sectionType === 's16') {
    keys.push('association_membership', 'dedicated_status', 'firearm_endorsement');
  }
  return Array.from(new Set(keys));
}

function buildProfileName(profile: Profile | null): string {
  return [profile?.givenNames, profile?.surname].filter(Boolean).join(' ').trim();
}

function buildProfileInitials(profile: Profile | null): string {
  return `${profile?.initials ?? ''}`.trim();
}

function recomposeWizardMotivationText(application: Application): string | null {
  if (application.motivationSource !== 'wizard' || !application.motivationProfile) return null;
  const selectedFirearmIds = Array.isArray(application.selectedFirearmIds)
    ? application.selectedFirearmIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  if (!selectedFirearmIds.length) return null;
  const selectedFirearmId = selectedFirearmIds[0];
  const allFirearms = listByType<Firearm>('Firearm');
  const targetFirearm =
    allFirearms.find((item) => String(item.id) === selectedFirearmId) ?? null;
  if (!targetFirearm) return null;

  const sectionType = inferSectionTypeFromFirearmSection(targetFirearm.section);
  if (!sectionType) return null;

  let purposeType: MotivationPurposeType;
  if (sectionType === 's13') {
    purposeType = 'self_defence';
  } else if (targetFirearm.purpose && MOTIVATION_PURPOSE_OPTIONS.has(targetFirearm.purpose)) {
    purposeType = targetFirearm.purpose;
  } else {
    const hasHunting = Boolean(
      application.motivationProfile.huntingProfile?.species?.length ||
      application.motivationProfile.huntingProfile?.terrainTags?.length ||
      application.motivationProfile.huntingProfile?.distanceBand
    );
    const hasSport = Boolean(
      application.motivationProfile.sportProfile?.disciplineTags?.length ||
      application.motivationProfile.sportProfile?.participationFrequency
    );
    if (hasHunting && hasSport) purposeType = 'mixed_hunting_sport';
    else if (hasHunting) purposeType = 'hunting';
    else purposeType = 'sport_shooting';
  }

  const profileId = String(application.applicantProfileId ?? '').trim();
  const applicantProfile = profileId ? getById<Profile>(profileId) ?? null : null;
  const selectedMembershipIds = new Set(
    (application.membershipIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)
  );
  const associationName = listByType<Membership>('Membership')
    .filter((membership) => selectedMembershipIds.has(String(membership.id)))
    .map((membership) => `${membership.associationName ?? ''}`.trim())
    .filter(Boolean)
    .join(', ');
  const comparisonCount = allFirearms.filter(
    (item) => String(item.id) !== String(targetFirearm.id)
  ).length;
  const selectedSafeIds = (application.safeIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);

  const values = {
    applicationType: 'renewal' as MotivationApplicationType,
    sectionType,
    purposeType,
    applicantFullName: buildProfileName(applicantProfile),
    applicantInitials: buildProfileInitials(applicantProfile),
    applicantSex: applicantProfile?.sexAtBirth,
    associationName,
    requiresComparison: comparisonCount > 0,
    comparisonFirearmCount: comparisonCount,
    firearmMake: targetFirearm.make,
    firearmModel: targetFirearm.model,
    firearmCalibre: targetFirearm.calibre,
    firearmSerialNumber: targetFirearm.firearmSerialNumber,
    firearmType: targetFirearm.firearmType,
    firearmAction: targetFirearm.firearmAction,
    competencyCategories: [targetFirearm.firearmType],
    homeType: applicantProfile?.address?.homeType,
    securityMeasures: applicantProfile?.address?.securityMeasures ?? [],
    usedFirearmsSince: applicantProfile?.usedFirearmsSince,
    firearmOwnerSince: applicantProfile?.firearmOwnerSince,
    motivationProfile: {
      ...application.motivationProfile,
      supportProfile: {
        ...(application.motivationProfile.supportProfile ?? {}),
        selectedSafeIds,
      },
    },
  };

  const composed = composeMotivation({
    application,
    applicationType: 'renewal',
    sectionType,
    purposeType,
    evidenceKeys: buildMotivationEvidenceKeys('renewal', sectionType),
    resolvedEvidence: resolveEvidenceFromApplication(application),
    values,
  });
  const nextText = `${composed.text ?? ''}`.trim();
  return nextText || null;
}

export default function ReadyApplicationActionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string | string[];
    nav?: string | string[];
    listNav?: string | string[];
    listPath?: string | string[];
    hideHome?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const { eraseAndReset } = useLock();
  const [activeAction, setActiveAction] = useState<'checklist' | 'application' | 'supporting' | 'finalise' | 'bundle' | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [policyPdfPath, setPolicyPdfPath] = useState<string | null>(null);
  const [policyFieldMapPath, setPolicyFieldMapPath] = useState<string | null>(null);
  const [, setSupportingHeadings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<PdfPageProgress | null>(null);
  const [tick, setTick] = useState(0);
  const [demoDatasetActive, setDemoDatasetActive] = useState(false);
  const idTypeMismatchAlertShownRef = useRef(false);
  const proofOfAddressExpiryAlertShownRef = useRef<string | null>(null);
  const dbg = (...a: any[]) => logger.log('[ready-actions]', ...a);
  const paymentOfflineMessage = 'Your device appears to be offline. Internet access is required to complete payment.';

  const id = useMemo(() => {
    const raw = params.id;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? String(value) : '';
  }, [params.id]);

  const application = useMemo(() => (id ? getById<Application>(id) : undefined), [id, tick]);
  const nav = useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!raw) return decodeNav();
    try {
      return decodeNav(JSON.parse(raw));
    } catch {
      return decodeNav();
    }
  }, [params.nav]);
  const navRaw = useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    return raw ? String(raw) : undefined;
  }, [params.nav]);
  const listNavRaw = useMemo(() => {
    const raw = Array.isArray(params.listNav) ? params.listNav[0] : params.listNav;
    return raw ? String(raw) : undefined;
  }, [params.listNav]);
  const listPath = useMemo(() => {
    const raw = Array.isArray(params.listPath) ? params.listPath[0] : params.listPath;
    return raw ? String(raw) : undefined;
  }, [params.listPath]);
  const hideHome = useMemo(() => {
    const raw = Array.isArray(params.hideHome) ? params.hideHome[0] : params.hideHome;
    return raw === '1' || raw === 'true';
  }, [params.hideHome]);
  const currentReadyActionsPath = useMemo(() => {
    if (!id) return '/application/ready';
    const query = new URLSearchParams();
    if (navRaw) query.set('nav', navRaw);
    if (listNavRaw) query.set('listNav', listNavRaw);
    if (listPath) query.set('listPath', listPath);
    if (hideHome) query.set('hideHome', '1');
    const serialized = query.toString();
    return serialized ? `/application/${id}/ready-actions?${serialized}` : `/application/${id}/ready-actions`;
  }, [hideHome, id, listNavRaw, listPath, navRaw]);
  const applicantProfile = useMemo(() => {
    if (!application?.applicantProfileId) return null;
    const prof = getById<Profile>(String(application.applicantProfileId));
    return prof ?? null;
  }, [application?.applicantProfileId, tick]);

  const resetPreviewState = useCallback(() => {
    setActiveAction(null);
    setPdfUri(null);
    setPolicyPdfPath(null);
    setPolicyFieldMapPath(null);
    setSupportingHeadings([]);
  }, []);

  const closeModal = useCallback(() => {
    resetPreviewState();
  }, [resetPreviewState]);

  useEffect(() => {
    if (idTypeMismatchAlertShownRef.current) return;
    if (!application || application.status !== 'ready') return;
    if (!applicantProfile?.id || !applicantProfile.idType) return;
    const docs = listByType<Document>('Document').filter(
      (doc) =>
        doc.parentType === 'Profile' &&
        String(doc.parentId ?? '') === String(applicantProfile.id) &&
        idDocKinds.includes(doc.kind),
    );
    if (!docs.length) return;
    const latest = docs
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })[0];
    const docType = docIdType(latest);
    if (!docType || docType === applicantProfile.idType) return;
    idTypeMismatchAlertShownRef.current = true;
    Alert.alert(
      'ID type mismatch',
      `Your uploaded ID looks like a ${labelForIdType(docType)}, but your profile is set to ${labelForIdType(applicantProfile.idType)}. Update your profile or replace the ID photos before submitting.`
    );
  }, [applicantProfile?.id, applicantProfile?.idType, application, tick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await isDemoDatasetActive();
      if (!cancelled) setDemoDatasetActive(active);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showDemoDataBlockedAlert = useCallback(() => {
    Alert.alert(
      'Demo data active',
      'You must erase demo data and reset the app before paying, finalising, or exporting this application.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset app',
          style: 'destructive',
          onPress: () => {
            router.push('/reset' as any);
          },
        },
      ],
    );
  }, [router]);

  const proofOfAddressFreshness = useMemo(
    () => getProofOfAddressFreshness(applicantProfile?.proofOfAddressDate),
    [applicantProfile?.proofOfAddressDate],
  );

  useEffect(() => {
    if (!applicantProfile?.id) return;
    if (proofOfAddressFreshness.status !== 'expired') return;
    const alertKey = `${applicantProfile.id}:${applicantProfile.proofOfAddressDate ?? ''}`;
    if (proofOfAddressExpiryAlertShownRef.current === alertKey) return;
    proofOfAddressExpiryAlertShownRef.current = alertKey;
    let cancelled = false;
    (async () => {
      const result = await clearProfileProofOfAddress(applicantProfile.id);
      if (!result.changed || cancelled) return;
      setTick((prev) => prev + 1);
      Alert.alert(
        'Proof of address removed',
        `Your proof of address was removed because it is more than ${appConfig.documentFreshness.proofOfAddress.expiryAgeDays} days old. Please upload a newer document.`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [applicantProfile?.id, applicantProfile?.proofOfAddressDate, proofOfAddressFreshness.status]);

  const handleMoveToDraft = useCallback((anchor?: string, opts?: { showIssues?: boolean; target?: 'wizard' | 'documents' }) => {
    if (!application) return;
    try {
      if (application.status !== 'draft') {
        const next = touch({ ...application, status: 'draft' } as Application);
        persist(next);
        setTick((t) => t + 1);
      }
      const nextNav = resolveDocumentsNav('ready', { id: application.id }, {
        origin: nav.returnTo || '/application/ready',
        returnTo: nav.returnTo || '/application/ready',
        routeBack: nav.routeBack || nav.returnTo || '/application/ready',
      });
      const { pathname, params } = buildDocumentsRoute({ id: application.id, nav: nextNav, mode: 'edit' });
      const nextParams = {
        ...params,
        ...(anchor ? { anchor } : {}),
        ...(opts?.showIssues ? { showIssues: '1' } : {}),
      };
      router.replace({ pathname, params: nextParams } as any);
    } catch (err: any) {
      logger.warn('move to draft error', err);
      Alert.alert(
        'Unable to move to drafts',
        err?.message ?? 'An unexpected error occurred while updating the application.'
      );
    }
  }, [application, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => false);
    return () => sub.remove();
  }, []);

  const ensureSharedDirectory = useCallback(async (): Promise<string> => {
    const { cacheDirectory, documentDirectory } = await getAppDirectories();
    const baseDir = cacheDirectory || documentDirectory;
    if (!baseDir) throw new Error('No writable directory available for PDF.');

    // Normalize and construct target dir
    const normalizedBase = baseDir.replace(/\/+$/, '');
    const sharedDir = `${normalizedBase}/shared-pdfs`;

    // Check what exists at the path
    const info = await FileSystem.getInfoAsync(sharedDir);
    if (info.exists && info.isDirectory) {
      return sharedDir;
    }

    if (info.exists && !info.isDirectory) {
      // A file is blocking our directory path; remove it first
      await FileSystem.deleteAsync(sharedDir, { idempotent: true });
    }

    // Create the directory (will throw only on unexpected errors)
    await FileSystem.makeDirectoryAsync(sharedDir, { intermediates: true });
    return sharedDir;
  }, []);

  const prepareShareablePdf = useCallback(async (uri: string, baseName: string): Promise<string> => {
    const raw = uri.trim();
    if (!raw) throw new Error('Missing PDF URI.');

    // Normalize file/local forms early
    if (raw.startsWith('file://')) return raw;
    if (raw.startsWith('/')) return `file://${raw}`;

    // Case: embedded base64 data URI
    if (raw.startsWith('data:application/pdf')) {
      const sharedDir = await ensureSharedDirectory();
      const targetName = `${baseName}-${uid()}.pdf`;
      const targetPath = `${sharedDir}/${targetName}`;

      // Ensure clean destination then write
      await FileSystem.deleteAsync(targetPath, { idempotent: true }).catch(() => { });
      const file = new FSFile(targetPath);
      const commaIdx = raw.indexOf(',');
      const base64 = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw;
      await file.write(base64, { encoding: 'base64' });

      // Return normalized file URI
      return targetPath.startsWith('file://') ? targetPath : `file://${targetPath}`;
    }

    // Case: remote http(s)
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const sharedDir = await ensureSharedDirectory();
      const targetName = `${baseName}-${uid()}.pdf`;
      const targetPath = `${sharedDir}/${targetName}`;

      // Pre-delete if it happens to exist
      await FileSystem.deleteAsync(targetPath, { idempotent: true }).catch(() => { });

      const targetFile = new FSFile(targetPath);
      const { uri: downloadedUri } = await FileSystem.downloadAsync(raw, targetFile.uri);
      const normalized = downloadedUri.startsWith('file://') ? downloadedUri : `file://${downloadedUri}`;
      return normalized;
    }

    // Otherwise resolve relative doc paths into the current docs directory
    return resolveDocumentUri(raw) ?? raw;
  }, [ensureSharedDirectory]);

    const paymentReceived = !!(application as any)?.paymentReceived;

  const getFreshApplication = useCallback((): Application | null => {
    if (!application?.id) return null;
    return (
      ensureApplicationPdfFreshness(String(application.id)) ??
      getById<Application>(String(application.id)) ??
      application
    );
  }, [application]);


  const handleChecklistPress = useCallback(async () => {
    const currentApplication = getFreshApplication();
    if (!currentApplication) return;
    setProcessingLabel('Preparing checklist...');
    setLoading(true);
    try {
      const doc = await generateOrGetChecklistPdf({ ...currentApplication, checklistDocumentId: undefined } as Application);
      const targetUri = resolveDocumentUri(doc.uri ?? doc.filePath);
      if (!targetUri) {
        throw new Error('Checklist PDF path missing');
      }
      dbg('prepareShareablePdf ->', targetUri);
      const shareableUri = await prepareShareablePdf(targetUri, 'checklist');

      setPdfUri(shareableUri);
      setActiveAction('checklist');
      router.push({
        pathname: '/application/[id]/preview',
        params: {
          id: currentApplication.id,
          uri: encodeURIComponent(shareableUri),
          title: 'Document Checklist',
          paid: paymentReceived ? '1' : '0',
        },
      } as any);
      setTick((t) => t + 1);
    } catch (err: any) {
      logger.warn('checklist pdf error', err);
      Alert.alert(
        'Unable to prepare checklist',
        err?.message ?? 'An unexpected error occurred while generating the checklist PDF.'
      );
    } finally {
      setLoading(false);
      setProcessingLabel(null);
    }
  }, [applicantProfile, getFreshApplication, prepareShareablePdf]);

  const handleApplicationPress = useCallback(async () => {
    const currentApplication = getFreshApplication();
    if (!currentApplication) return;

    const addressLimit = getAddressLengthLimit(currentApplication.form);
    const residential = applicantProfile?.address?.singleLine;
    const postal = applicantProfile?.addressPostal?.singleLine;
    const residentialTooLong = isAddressTooLong(residential, currentApplication.form);
    const postalTooLong = isAddressTooLong(postal, currentApplication.form);
    const tooLongField = residentialTooLong ? 'address.singleLine' : postalTooLong ? 'addressPostal.singleLine' : null;

    const proceed = async () => {
      setProcessingLabel('Preparing application PDF...');
      setLoading(true);
      try {
        const form = (currentApplication.form || currentApplication.type || '').toLowerCase();
        const policySource =
          form === '517g' ? (policy517g as any) : form === '518a' ? (policy518a as any) : null;
        let policyPath = (policySource?.pdf as string | undefined) ?? null;
        let fieldMapPath = (policySource?.pdfFieldMap as string | undefined) ?? null;

        let shareableUri: string | null = null;

        try {
          const generated = await generateApplicationPdf(currentApplication);
          if (generated?.uri) {
            policyPath = generated.policyPdfPath ?? policyPath;
            fieldMapPath = generated.policyFieldMapPath ?? fieldMapPath;
            if (generated.diagnostics?.length) {
              logger.log('[ready-actions] application pdf diagnostics', generated.diagnostics);
            }
            shareableUri = await prepareShareablePdf(generated.uri, 'application');
          }
        } catch (generationErr) {
          logger.warn('application pdf auto-fill error', generationErr);
        }

        if (!shareableUri) {
          let assetModule: number | null = null;
          if (form === '517g') {
            assetModule = require('../../../assets/pdf/517g.pdf');
          } else if (form === '518a') {
            assetModule = require('../../../assets/pdf/518a.pdf');
          }

          if (!assetModule) {
            throw new Error('No application PDF available for this form.');
          }

          const asset = Asset.fromModule(assetModule);
          if (!asset.downloaded) {
            await asset.downloadAsync().catch(() => undefined);
          }
          const fileUri = asset?.localUri || asset?.uri;
          if (!fileUri) throw new Error('Unable to resolve application PDF asset.');
          const normalizedUri = fileUri.startsWith('file://')
            ? fileUri
            : fileUri.startsWith('/')
              ? `file://${fileUri}`
              : fileUri;
          shareableUri = await prepareShareablePdf(normalizedUri, 'application');
        }

        if (!shareableUri) {
          throw new Error('Failed to prepare application PDF.');
        }

        setPolicyPdfPath(policyPath);
        setPolicyFieldMapPath(fieldMapPath ?? null);
        setPdfUri(shareableUri);
        setActiveAction('application');
        const formTitle = formatFormTitle(currentApplication.form || (currentApplication as any).type);
        const applicationTitle = formTitle ? `${formTitle} Application` : 'Application';
        router.push({
          pathname: '/application/[id]/preview',
          params: {
            id: currentApplication.id,
            uri: encodeURIComponent(shareableUri),
            title: applicationTitle,
            paid: paymentReceived ? '1' : '0',
          },
        } as any);
      } catch (err: any) {
        logger.warn('application pdf error', err);
        Alert.alert(
          'Unable to open application',
          err?.message ?? 'An unexpected error occurred while preparing the application PDF.'
        );
      } finally {
        setLoading(false);
        setProcessingLabel(null);
      }
    };

    if (tooLongField) {
      Alert.alert(
        'Address too long',
        addressTooLongAlertMessage(addressLimit),
        [
          {
            text: 'Edit',
            style: 'cancel',
            onPress: () => {
              router.push({
                pathname: '/profile/edit',
                params: {
                  section: tooLongField === 'addressPostal.singleLine' ? 'postalAddress' : 'residentialAddress',
                  focusField: tooLongField,
                  returnTo: encodeURIComponent(`/application/${currentApplication.id}/ready-actions`),
                },
              } as any);
            },
          },
          { text: 'Continue', onPress: proceed },
        ],
      );
      return;
    }

    proceed();
  }, [applicantProfile?.address?.singleLine, applicantProfile?.addressPostal?.singleLine, getFreshApplication, paymentReceived, prepareShareablePdf, router]);

  const handleSupportingPress = useCallback(async () => {
    const currentApplication = getFreshApplication();
    if (!currentApplication) return;

    const proceed = async () => {
      setProcessingLabel('Bundling supporting documents...');
      setProcessingProgress(null);
      setLoading(true);
      setPolicyPdfPath(null);
      setPolicyFieldMapPath(null);
      try {
        const bundle = await generateSupportingDocumentsPdf(currentApplication, {
          onProgress: (progress) => {
            setProcessingProgress(progress);
          },
        });
        const targetUri = bundle?.uri ?? bundle?.path;
        if (!targetUri) {
          throw new Error('Supporting documents PDF path missing');
        }
        const shareableUri = await prepareShareablePdf(targetUri, 'supporting-documents');
        setPdfUri(shareableUri);
        setSupportingHeadings(bundle.headings ?? []);
        setActiveAction('supporting');
        router.push({
          pathname: '/application/[id]/preview',
          params: {
            id: currentApplication.id,
            uri: encodeURIComponent(shareableUri),
            title: 'Supporting documents',
            paid: paymentReceived ? '1' : '0',
            headings: encodeURIComponent(JSON.stringify(bundle.headings ?? [])),
            reqs: encodeURIComponent(JSON.stringify(bundle.checklistRequirements ?? [])),
          },
        } as any);
        setTick((t) => t + 1);
      } catch (err: any) {
        logger.warn('supporting pdf error', err);
        const rawMessage = err?.message ?? 'An unexpected error occurred while preparing the supporting documents PDF.';
        let friendlyMessage: string;
        if (/No supporting documents were found/.test(rawMessage)) {
          friendlyMessage = 'No supporting documents are linked to this application yet. Upload or attach the required files in the Documents step before bundling them.';
        } else if (/No supporting document pages/.test(rawMessage)) {
          friendlyMessage = 'None of the supporting documents could be bundled. Please verify the files are accessible on this device and try again.';
        } else {
          friendlyMessage = rawMessage;
        }
        Alert.alert('Unable to prepare supporting documents', friendlyMessage);
      } finally {
        setLoading(false);
        setProcessingLabel(null);
        setProcessingProgress(null);
      }
    };

    proceed();
  }, [getFreshApplication, paymentReceived, prepareShareablePdf, router]);

  const handleSupportingStatementsPress = useCallback(async () => {
    const currentApplication = getFreshApplication();
    if (!currentApplication) return;
    setProcessingLabel('Preparing character references...');
    setLoading(true);
    setPolicyPdfPath(null);
    setPolicyFieldMapPath(null);
    try {
      const generated = await generateSupportingStatementsPdf(currentApplication);
      const targetUri = generated?.uri ?? generated?.path;
      if (!targetUri) {
        throw new Error('Character references PDF path missing');
      }
      const shareableUri = await prepareShareablePdf(targetUri, 'supporting-statements');
      setPdfUri(shareableUri);
      setActiveAction('supporting');
      router.push({
        pathname: '/application/[id]/preview',
        params: {
          id: currentApplication.id,
          uri: encodeURIComponent(shareableUri),
          title: 'Character references',
          paid: paymentReceived ? '1' : '0',
          headings: encodeURIComponent(JSON.stringify(generated.headings ?? [])),
        },
      } as any);
      setTick((t) => t + 1);
    } catch (err: any) {
      logger.warn('character references pdf error', err);
      Alert.alert(
        'Unable to prepare character references',
        err?.message ?? 'An unexpected error occurred while preparing the character references PDF.'
      );
    } finally {
      setLoading(false);
      setProcessingLabel(null);
    }
  }, [getFreshApplication, paymentReceived, prepareShareablePdf, router]);
  const handleMotivationPress = useCallback(async () => {
    const currentApplication = getFreshApplication();
    if (!currentApplication) return;
    let refreshedApplication = currentApplication;
    const recomposedText = recomposeWizardMotivationText(currentApplication);
    if (recomposedText && recomposedText !== `${currentApplication.motivationText ?? ''}`.trim()) {
      refreshedApplication = touch({
        ...currentApplication,
        motivationText: recomposedText,
      } as Application);
      persist(refreshedApplication);
    }
    const linkedMotivation = resolveApplicationMotivation(refreshedApplication);
    const applicationForMotivation = {
      ...refreshedApplication,
      motivationText: linkedMotivation?.text ?? refreshedApplication.motivationText,
    } as Application;
    setProcessingLabel('Preparing motivation...');
    setLoading(true);
    setPolicyPdfPath(null);
    setPolicyFieldMapPath(null);
    try {
      const generated = await generateMotivationPdf(applicationForMotivation);
      const targetUri = generated?.uri ?? generated?.path;
      if (!targetUri) {
        throw new Error('Motivation PDF path missing');
      }
      const shareableUri = await prepareShareablePdf(targetUri, 'motivation-letter');
      setPdfUri(shareableUri);
      setActiveAction('supporting');
      router.push({
        pathname: '/application/[id]/preview',
        params: {
          id: currentApplication.id,
          uri: encodeURIComponent(shareableUri),
          title: 'Motivation letter',
          paid: paymentReceived ? '1' : '0',
        },
      } as any);
      setTick((t) => t + 1);
    } catch (err: any) {
      logger.warn('motivation pdf error', err);
      Alert.alert(
        'Unable to prepare motivation',
        err?.message ?? 'An unexpected error occurred while preparing the motivation PDF.'
      );
    } finally {
      setLoading(false);
      setProcessingLabel(null);
    }
  }, [getFreshApplication, paymentReceived, prepareShareablePdf, router]);

  const handleArchive = useCallback(() => {
    if (!application) return;
    Alert.alert('Archive application?', 'Archived applications are hidden from active lists.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: () => {
          try {
            setProcessingLabel('Archiving application...');
            const updated = touch({ ...application, status: 'archived' } as Application);
            persist(updated);
            setTick((t) => t + 1);
            resetPreviewState();
          } catch (err: any) {
            logger.warn('archive application error', err);
            Alert.alert(
              'Unable to archive',
              err?.message ?? 'An unexpected error occurred while archiving the application.'
            );
          } finally {
            setProcessingLabel(null);
          }
        },
      },
    ]);
  }, [application, resetPreviewState]);

  const deleteApplicationRecord = useCallback(async (applicationId: string) => {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        deleteEntity(applicationId);
      } catch (error) {
        logger.warn('[ready-actions] deleteEntity threw', { applicationId, attempt, error });
      }
      const exists = getById<Application>(applicationId);
      if (!exists) return true;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
    logger.warn('[ready-actions] Application still present after delete retries', { applicationId });
    return false;
  }, []);

  const deleteApplicationsWithPdfs = useCallback(async (applicationsToDelete: Application[]) => {
    if (!applicationsToDelete.length) return 0;
    let deletedCount = 0;
    setProcessingLabel('Deleting applications...');
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      for (const candidate of applicationsToDelete) {
        const docs = listByType<Document>('Document').filter((doc) => doc.applicationId === candidate.id);
        const pdfDocs = docs.filter((doc) => {
          const mime = (doc.mime ?? '').toLowerCase();
          const name = (doc.name ?? doc.filePath ?? '').toLowerCase();
          return mime === 'application/pdf' || name.endsWith('.pdf');
        });
        for (const doc of pdfDocs) {
          const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
          for (const path of paths) {
            try {
              await deleteOwnedDocFile(path);
            } catch {
              // ignore storage delete errors
            }
          }
          try {
            deleteEntity(doc.id);
          } catch {
            // ignore doc delete failures
          }
        }
        const deleted = await deleteApplicationRecord(String(candidate.id));
        if (deleted) deletedCount += 1;
      }
      setTick((value) => value + 1);
      return deletedCount;
    } finally {
      setProcessingLabel(null);
    }
  }, [deleteApplicationRecord]);

  const closeTarget = React.useMemo(() => statusToListPath(application?.status), [application?.status]);
  const baseTarget = React.useMemo(
    () => (nav.routeBack || nav.returnTo || nav.origin || closeTarget) as string | undefined,
    [closeTarget, nav.origin, nav.returnTo, nav.routeBack],
  );

  const handleClose = React.useCallback(() => {
    if (listNavRaw && listPath) {
      router.replace({
        pathname: listPath as any,
        params: { nav: listNavRaw },
      } as any);
      return;
    }
    backOrReplaceWithContext(
      router as any,
      { ...nav, routeBack: baseTarget } as any,
      (baseTarget || closeTarget) as any,
    );
  }, [baseTarget, closeTarget, listNavRaw, listPath, nav, router]);

  const handleDeleteArchivedApplication = useCallback(() => {
    if (!application || application.status !== 'archived') return;
    const formTitle = FORM_LABEL_MAP[application.form];
    const rawLicence =
      (application as any).licenceTypes ??
      (application as any).licenseTypes ??
      (application as any).licenseType ??
      (application as any).licenceType;
    const lic = licenceLabel(application.form, rawLicence);
    const updated = (application.updatedAt || application.createdAt)
      ? new Date(application.updatedAt || application.createdAt!).toLocaleDateString()
      : '—';
    const message = `${formTitle}`
      + (lic ? `\nLicence type: ${lic}` : '')
      + (application.status ? `\nStatus: ${application.status}` : '')
      + `\nUpdated: ${updated}`
      + '\n\nThis delete cannot be undone. Make sure you have a copy of the application before deleting it.';

    Alert.alert('Permanently delete application?', message, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const docs = listByType<Document>('Document').filter((doc) => doc.applicationId === application.id);
            const pdfDocs = docs.filter((doc) => {
              const mime = (doc.mime ?? '').toLowerCase();
              const name = (doc.name ?? doc.filePath ?? '').toLowerCase();
              return mime === 'application/pdf' || name.endsWith('.pdf');
            });

            setProcessingLabel('Deleting application...');
            try {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              for (const doc of pdfDocs) {
                const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
                for (const path of paths) {
                  try {
                    await deleteOwnedDocFile(path);
                  } catch {
                    // ignore storage delete errors
                  }
                }
                try {
                  deleteEntity(doc.id);
                } catch {
                  // ignore doc delete failures
                }
              }
              await deleteApplicationRecord(String(application.id));
              handleClose();
            } finally {
              setProcessingLabel(null);
            }
          })();
        },
      },
    ]);
  }, [application, deleteApplicationRecord, handleClose]);

  const handleHome = useCallback(() => {
    router.replace('/(tabs)' as any);
  }, [baseTarget, nav, router]);

  const documentsReadyState: DocumentReadinessResult = useMemo(() => {
    if (!application) return { ready: false } as const;

    const firearms = resolveApplicationFirearms(application).map((firearm) => ({
      id: String(firearm.id),
      make: firearm.make,
      model: firearm.model,
      firearmType: firearm.firearmType,
      section: (firearm as any).section,
      licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
      licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
      licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
      licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
    }));

    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms,
    });

  const acknowledgementItems =
      resolved.declarations?.map((ack) => ({
        key: ack.key,
        applicationField: ack.applicationField,
        code: ack.code,
        checked: ack.code
          ? (application.declarations ?? []).map((value) => String(value).toUpperCase()).includes(String(ack.code).toUpperCase())
          : false,
      })) ?? [];

    const membershipRequirement =
      application?.requireMembership === true
        ? 'required'
        : resolved?.membershipRequirement === 'required'
          ? 'required'
          : resolved?.membershipRequirement === 'optional'
            ? 'optional'
            : 'hidden';
    const membershipStatus = computeMembershipStatus(application);

    const baseState = computeDocumentReadiness({
      application,
      acknowledgementItems,
      membershipRequirement,
      membershipStatus,
      shouldBypassValidation: false,
    });
    const missingItemOrder = buildMissingItemOrder(
      resolved.requirements.map((req) => ({
        label: req.label,
        code: req.code ?? req.key,
        displayOrder: req.displayOrder,
      }))
    );
    const supportingAnchor = resolved.requirements.find((req) =>
      String(req.code ?? '').toUpperCase().startsWith('SUPPORTING_STATEMENT')
    )?.key;
    const supportingDrafts = listByType<SupportingStatement>('SupportingStatement').filter((statement) => {
      const status = `${statement.status ?? 'empty'}`.toLowerCase();
      if (status !== 'draft') return false;
      const sameProfile =
        application.applicantProfileId &&
        String(statement.holderProfileId ?? '') === String(application.applicantProfileId);
      const sameApplication =
        statement.applicationId && String(statement.applicationId) === String(application.id);
      return Boolean(sameApplication || sameProfile);
    });
    const mergedItems = parseMissingItems(baseState.message);
    if (
      supportingDrafts.length > 0 &&
      !mergedItems.some((item) => normalizeMissingItem(item) === normalizeMissingItem(MISSING_SUPPORTING_STATEMENT))
    ) {
      mergedItems.push(MISSING_SUPPORTING_STATEMENT);
    }
    const orderedItems = sortMissingItems(mergedItems, missingItemOrder);
    const message = buildMissingMessage(orderedItems);
    if (!message) {
      return supportingDrafts.length > 0
        ? {
            ready: false,
            message: buildMissingMessage([MISSING_SUPPORTING_STATEMENT]),
            anchor: baseState.anchor ?? supportingAnchor,
          }
        : baseState;
    }
    return {
      ready: false,
      message,
      anchor: baseState.anchor ?? (supportingDrafts.length > 0 ? supportingAnchor : undefined),
    };
  }, [application, tick]);
  const documentsReady = documentsReadyState.ready;
  const terminalDuplicateApplicationsCard = useMemo(() => {
    if (!application) return null;
    if (application.status !== 'submitted' && application.status !== 'archived') return null;
    const normalizedForm = normalizeReminderForm(application.form ?? (application as any).type);
    const itemType: ReminderRenewalItemType | null =
      normalizedForm === '517g' ? 'competency' : normalizedForm === '518a' ? 'firearm' : null;
    if (!itemType) return null;

    const sourceItems =
      itemType === 'firearm'
        ? resolveApplicationFirearms(application).map((firearm) => ({
            id: String(firearm.id ?? ''),
            label: formatConflictFirearmLabel(firearm),
          }))
        : resolveApplicationCompetencyCertificates(application).map((certificate) => ({
            id: String(certificate.id ?? ''),
            label: formatConflictCompetencyLabel(certificate),
          }));

    const uniqueItems = sourceItems.filter(
      (item, index, items) => item.id && items.findIndex((candidate) => candidate.id === item.id) === index
    );
    if (!uniqueItems.length) return null;

    const applicationsById = new Map<string, Application>();
    const itemLabels: string[] = [];
    uniqueItems.forEach((item) => {
      const resolved = resolveActiveReminderApplications(itemType, item.id);
      const others = resolved.applications.filter((candidate) => String(candidate.id) !== String(application.id));
      if (!others.length) return;
      itemLabels.push(item.label);
      others.forEach((candidate) => {
        applicationsById.set(String(candidate.id), candidate);
      });
    });

    const applications = Array.from(applicationsById.values()).sort(compareApplicationsNewestFirst);
    if (!applications.length) return null;

    return {
      itemType,
      itemLabels,
      applications,
      draftApplications: applications.filter((candidate) => candidate.status === 'draft'),
      readyApplications: applications.filter((candidate) => candidate.status === 'ready'),
    };
  }, [application, tick]);
  const conflictListNav = useMemo(
    () =>
      encodeURIComponent(
        JSON.stringify({
          returnTo: currentReadyActionsPath,
          routeBack: currentReadyActionsPath,
          origin: currentReadyActionsPath,
          clearRouteBackHistory: true,
        }),
      ),
    [currentReadyActionsPath],
  );
  const openTerminalDuplicateApplications = useCallback(() => {
    if (!terminalDuplicateApplicationsCard) return;
    const hasDraft = terminalDuplicateApplicationsCard.draftApplications.length > 0;
    const hasReady = terminalDuplicateApplicationsCard.readyApplications.length > 0;
    Alert.alert(
      'Other applications found',
      'Other matching applications are still in draft or ready status.',
      [
        ...(hasDraft
          ? [{ text: 'Open draft applications', onPress: () => router.push({ pathname: '/application/existing', params: { nav: conflictListNav } } as any) }]
          : []),
        ...(hasReady
          ? [{ text: 'Open ready applications', onPress: () => router.push({ pathname: '/application/ready', params: { nav: conflictListNav } } as any) }]
          : []),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [conflictListNav, router, terminalDuplicateApplicationsCard]);
  const confirmDeleteTerminalDuplicateApplications = useCallback(
    (applicationsToDelete: Application[], label: string) => {
      if (!terminalDuplicateApplicationsCard || !applicationsToDelete.length) return;
      const noun = terminalDuplicateApplicationsCard.itemType === 'firearm' ? 'firearm licence' : 'competency certificate';
      const count = applicationsToDelete.length;
      Alert.alert(
        'Delete applications?',
        `Delete ${count} ${label} application${count === 1 ? '' : 's'} that still include this ${noun}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const deletedCount = await deleteApplicationsWithPdfs(applicationsToDelete);
                if (deletedCount !== count) {
                  Alert.alert(
                    'Delete incomplete',
                    `Deleted ${deletedCount} of ${count} application${count === 1 ? '' : 's'}.`,
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [deleteApplicationsWithPdfs, terminalDuplicateApplicationsCard],
  );
  const handleDeleteTerminalDuplicateApplications = useCallback(() => {
    if (!terminalDuplicateApplicationsCard) return;
    const hasDraft = terminalDuplicateApplicationsCard.draftApplications.length > 0;
    const hasReady = terminalDuplicateApplicationsCard.readyApplications.length > 0;
    Alert.alert(
      'Delete other applications',
      'Choose which matching applications to delete. This cannot be undone.',
      [
        ...(hasDraft
          ? [{
              text: 'Delete draft applications',
              style: 'destructive' as const,
              onPress: () =>
                confirmDeleteTerminalDuplicateApplications(
                  terminalDuplicateApplicationsCard.draftApplications,
                  'draft',
                ),
            }]
          : []),
        ...(hasReady
          ? [{
              text: 'Delete ready applications',
              style: 'destructive' as const,
              onPress: () =>
                confirmDeleteTerminalDuplicateApplications(
                  terminalDuplicateApplicationsCard.readyApplications,
                  'ready',
                ),
            }]
          : []),
        ...(hasDraft && hasReady
          ? [{
              text: 'Delete all',
              style: 'destructive' as const,
              onPress: () =>
                confirmDeleteTerminalDuplicateApplications(
                  terminalDuplicateApplicationsCard.applications,
                  'draft and ready',
                ),
            }]
          : []),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [confirmDeleteTerminalDuplicateApplications, terminalDuplicateApplicationsCard]);
  const selectedMemberships = useMemo(() => {
    if (!application) return [] as Membership[];
    const ids = new Set(
      (Array.isArray(application.membershipIds) ? application.membershipIds : [])
        .filter(Boolean)
        .map(String)
    );
    if (!ids.size) return [] as Membership[];
    return listByType<Membership>('Membership').filter((membership) => membership?.id && ids.has(String(membership.id)));
  }, [application, tick]);
  const membershipSubmissionValidity = useMemo(
    () => getMembershipSubmissionValidity(selectedMemberships),
    [selectedMemberships],
  );
  const membershipDocumentFreshness = useMemo(
    () => getMembershipDocumentFreshness(selectedMemberships),
    [selectedMemberships],
  );
  const proofOfAddressAnchor = useMemo(() => {
    if (!application) return undefined;
    const selectedFirearms = resolveApplicationFirearms(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    return resolved.requirements.find((req) => String(req.code ?? req.key ?? '').toUpperCase() === 'PROOF_ADDRESS')?.key;
  }, [application]);
  const membershipAnchor = useMemo(() => {
    if (!application) return undefined;
    const selectedFirearms = resolveApplicationFirearms(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    return resolved.requirements.find((req) => String(req.code ?? req.key ?? '').toUpperCase() === 'MEMBERSHIP')?.key;
  }, [application]);
  const supportingAnchor = useMemo(() => {
    if (!application) return undefined;
    const selectedFirearms = resolveApplicationFirearms(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    return resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().startsWith('SUPPORTING_STATEMENT')
    )?.key;
  }, [application]);
  const sectionCountLimitIssues = useMemo(() => {
    if (!application) return [] as DocumentSectionIssue[];
    if (String((application.form ?? (application as any).type ?? '')).toLowerCase() !== '518a') return [];
    const selectedFirearms = resolveApplicationFirearms(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    const firearmAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('FIREARM')
    )?.key;
    return buildSectionLimitWarningIssues({
      rule: getFirearmMaxRule(policy518a as any),
      selectedFirearms,
      firearmAnchor,
    });
  }, [application, tick]);
  const hasSectionCountLimitIssue = sectionCountLimitIssues.length > 0;
  const submittedApplicationWarningState = useMemo(() => {
    if (!application) {
      return {
        hasSubmittedFirearm: false,
        hasSubmittedCompetency: false,
        issues: [] as DocumentSectionIssue[],
      };
    }
    const selectedFirearms = resolveApplicationFirearms(application);
    const selectedCertificates = resolveApplicationCompetencyCertificates(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    const firearmAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('FIREARM')
    )?.key;
    const competencyAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('COMPETENCY')
    )?.key;
    return buildSubmittedApplicationWarningIssues({
      form: application.form ?? (application as any).type,
      selectedFirearms,
      selectedCertificates,
      firearmAnchor,
      competencyAnchor,
    });
  }, [application, tick]);
  const submittedApplicationWarningIssues = submittedApplicationWarningState.issues;
  const expiredWarningIssues = useMemo(() => {
    if (!application) return [] as DocumentSectionIssue[];
    const selectedFirearms = resolveApplicationFirearms(application);
    const selectedCertificates = resolveApplicationCompetencyCertificates(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    const firearmAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('FIREARM')
    )?.key;
    const competencyAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('COMPETENCY')
    )?.key;
    const hasExpiredFirearm =
      !submittedApplicationWarningState.hasSubmittedFirearm &&
      (application.includesExpiredLicences ?? []).length > 0;
    const hasExpiredCompetency =
      !submittedApplicationWarningState.hasSubmittedCompetency &&
      (application.includesExpiredCompetencies ?? []).length > 0;
    const message = buildExpiredSelectionWarningCopy({
      hasExpiredFirearm,
      hasExpiredCompetency,
    });
    if (!message) return [] as DocumentSectionIssue[];
    const issues: DocumentSectionIssue[] = [];
    if (hasExpiredFirearm && firearmAnchor) {
      issues.push({
        key: hasExpiredCompetency ? 'warning:expired_items' : 'warning:expired_firearm',
        severity: 'warning',
        title: 'Warning',
        message,
        anchor: firearmAnchor,
      });
    }
    if (hasExpiredCompetency && competencyAnchor) {
      issues.push({
        key: hasExpiredFirearm ? 'warning:expired_items' : 'warning:expired_competency',
        severity: 'warning',
        title: 'Warning',
        message,
        anchor: competencyAnchor,
      });
    }
    return issues;
  }, [application, submittedApplicationWarningState.hasSubmittedCompetency, submittedApplicationWarningState.hasSubmittedFirearm, tick]);
  const proofOfAddressWarningIssues = useMemo(() => {
    if (proofOfAddressFreshness.status !== 'warning' || !proofOfAddressAnchor) return [] as DocumentSectionIssue[];
    return [
      {
        key: 'warning:proof_of_address_age',
        severity: 'warning' as const,
        title: 'Warning',
        message: `Your proof of address date is more than ${appConfig.documentFreshness.proofOfAddress.warningAgeDays} days old. Upload a newer document before it reaches ${appConfig.documentFreshness.proofOfAddress.expiryAgeDays} days.`,
        anchor: proofOfAddressAnchor,
      },
    ] as DocumentSectionIssue[];
  }, [proofOfAddressAnchor, proofOfAddressFreshness.status]);
  const membershipSubmissionIssues = useMemo(() => {
    const message = buildMembershipSubmissionWarningCopy(membershipSubmissionValidity);
    if (!message || !membershipAnchor) return [] as DocumentSectionIssue[];
    return [
      {
        key:
          membershipSubmissionValidity.status === 'expired'
            ? 'warning:membership_expired'
            : 'warning:membership_submission_window',
        severity: 'warning' as const,
        title: 'Warning',
        message,
        anchor: membershipAnchor,
      },
    ] as DocumentSectionIssue[];
  }, [membershipAnchor, membershipSubmissionValidity]);
  const hasExpiredMembershipSubmissionIssue = membershipSubmissionValidity.status === 'expired';
  const membershipDocumentFreshnessIssues = useMemo(() => {
    const message = buildMembershipDocumentFreshnessCopy(membershipDocumentFreshness);
    if (!message || !membershipAnchor) return [] as DocumentSectionIssue[];
    return [
      {
        key:
          membershipDocumentFreshness.status === 'expired'
            ? 'warning:membership_document_expired'
            : 'warning:membership_document_window',
        severity: 'warning' as const,
        title: 'Warning',
        message,
        anchor: membershipAnchor,
      },
    ] as DocumentSectionIssue[];
  }, [membershipAnchor, membershipDocumentFreshness]);
  const hasExpiredMembershipDocumentFreshnessIssue = membershipDocumentFreshness.status === 'expired';
  const supportingStatements = useMemo(
    () =>
      application
        ? resolveSupportingStatementsForApplication(
            application,
            listByType<SupportingStatement>('SupportingStatement'),
          )
        : ([] as SupportingStatement[]),
    [application, tick],
  );
  const supportingStatementFreshness = useMemo(
    () => getSupportingStatementFreshness(supportingStatements),
    [supportingStatements],
  );
  const supportingStatementFreshnessIssues = useMemo(() => {
    const message = buildSupportingStatementFreshnessCopy(supportingStatementFreshness);
    if (!message || !supportingAnchor) return [] as DocumentSectionIssue[];
    return [
      {
        key:
          supportingStatementFreshness.status === 'expired'
            ? 'warning:supporting_statement_expired'
            : 'warning:supporting_statement_window',
        severity: 'warning' as const,
        title: 'Warning',
        message,
        anchor: supportingAnchor,
      },
    ] as DocumentSectionIssue[];
  }, [supportingAnchor, supportingStatementFreshness]);
  const hasExpiredSupportingStatementFreshnessIssue = supportingStatementFreshness.status === 'expired';
  const motivationDraftIssues = useMemo(() => {
    if (!application) return [] as DocumentSectionIssue[];
    const linkedMotivation = resolveApplicationMotivation(application);
    const source = application.motivationSource ?? linkedMotivation?.source;
    const status = linkedMotivation?.wizardStatus ?? application.motivationWizardStatus;
    if (source !== 'wizard' || status !== 'draft') {
      return [] as DocumentSectionIssue[];
    }
    const selectedFirearms = resolveApplicationFirearms(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    const motivationAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().startsWith('MOTIVATION')
    )?.key;
    return [
      {
        key: 'warning:motivation_wizard_draft',
        severity: 'warning',
        title: 'Warning',
        message: 'Your motivation wizard is still in draft. Complete all required wizard steps and close the wizard to finalize it.',
        anchor: motivationAnchor,
      },
    ] as DocumentSectionIssue[];
  }, [application, tick]);
  const demoDataIssues = useMemo(() => {
    if (!application) return [] as DocumentSectionIssue[];
    if (!demoDatasetActive) return [] as DocumentSectionIssue[];
    const selectedFirearms = resolveApplicationFirearms(application);
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms: selectedFirearms.map((firearm) => ({
        id: String(firearm.id),
        make: firearm.make,
        model: firearm.model,
        firearmType: firearm.firearmType,
        section: (firearm as any).section,
        licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
        licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
        licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
        licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
      })),
    });
    const firearmAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('FIREARM')
    )?.key;
    const competencyAnchor = resolved.requirements.find((req) =>
      String(req.code ?? req.key ?? '').toUpperCase().includes('COMPETENCY')
    )?.key;
    return [
      {
        key: 'warning:demo_dataset_active',
        severity: 'warning',
        title: 'Warning',
        message: 'Demo data is active on this device.',
        anchor: firearmAnchor ?? competencyAnchor ?? resolved.requirements[0]?.key,
      },
    ] as DocumentSectionIssue[];
  }, [application, demoDatasetActive, tick]);
  const hasDemoDataIssue = demoDataIssues.length > 0;

  const supportingStatementsPreviewState = useMemo(() => {
    if (!application) {
      return {
        canPreview: false,
        count: 0,
      };
    }
    const firearms = resolveApplicationFirearms(application).map((firearm) => ({
      id: String(firearm.id),
      make: firearm.make,
      model: firearm.model,
      firearmType: firearm.firearmType,
      section: (firearm as any).section,
      licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
      licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
      licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
      licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
    }));
    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms,
    });
    const hasSupportingStatementRequirement = resolved.requirements.some((req) => {
      const code = String(req.code ?? '').toUpperCase();
      return code.startsWith('SUPPORTING_STATEMENT') && (req as any).isSupportingDocument === true;
    });
    if (!hasSupportingStatementRequirement) {
      return {
        canPreview: false,
        count: 0,
      };
    }

    const linkedIds = new Set<string>(
      Array.isArray(application.supportingStatementIds)
        ? application.supportingStatementIds.filter(Boolean).map((id) => String(id))
        : []
    );
    const profileId = application.applicantProfileId ? String(application.applicantProfileId) : '';
    const statements = listByType<SupportingStatement>('SupportingStatement')
      .filter((statement) => {
        const status = `${statement.status ?? 'empty'}`.toLowerCase();
        if (status !== 'draft' && status !== 'complete') return false;
        const byApplicationId =
          statement.applicationId && String(statement.applicationId) === String(application.id);
        const byLinkedId = statement.id ? linkedIds.has(String(statement.id)) : false;
        const byProfileId = profileId && String(statement.holderProfileId ?? '') === profileId;
        return Boolean(byApplicationId || byLinkedId || byProfileId);
      })
      .sort((a, b) => {
        const orderA = SUPPORTING_STATEMENT_SLOT_ORDER[a.slot ?? ''] ?? Number.MAX_SAFE_INTEGER;
        const orderB = SUPPORTING_STATEMENT_SLOT_ORDER[b.slot ?? ''] ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
    const count = statements.length;
    return {
      canPreview: count === 1 || count === 2,
      count: Math.min(2, count),
    };
  }, [application, tick]);
  const canReviewMotivation =
    application?.status === 'ready' && application?.motivationSource === 'wizard';

  const missingDocsCard = useMemo(() => {
    const message = documentsReadyState.message ?? '';
    if (application?.status === 'submitted' || application?.status === 'archived') return null;
    const missingLines = parseMissingItems(message);

    let issues: DocumentSectionIssue[] = [];
    if (application) {
      const selectedFirearms = resolveApplicationFirearms(application);
      const resolved = resolveRequirementsForApplication({
        application: {
          id: application.id,
          form: (application as any).form || (application as any).type,
          licenseType: (application as any).licenseType ?? (application as any).licenceType,
          licenceType: (application as any).licenceType ?? (application as any).licenseType,
          licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
          licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
        },
        firearms: selectedFirearms.map((firearm) => ({
          id: String(firearm.id),
          make: firearm.make,
          model: firearm.model,
          firearmType: firearm.firearmType,
          section: (firearm as any).section,
          licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
          licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
          licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
          licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
        })),
      });

      const firearmAnchor = resolved.requirements.find((req) =>
        String(req.code ?? req.key ?? '').toUpperCase().includes('FIREARM')
      )?.key;
      const competencyAnchor = resolved.requirements.find((req) =>
        String(req.code ?? req.key ?? '').toUpperCase().includes('COMPETENCY')
      )?.key;
      const membershipAnchor = resolved.requirements.find((req) =>
        String(req.code ?? req.key ?? '').toUpperCase() === 'MEMBERSHIP'
      )?.key;
      const supportingAnchor = resolved.requirements.find((req) =>
        String(req.code ?? req.key ?? '').toUpperCase().startsWith('SUPPORTING_STATEMENT')
      )?.key;
      const proficiencyAnchor = resolved.requirements.find((req) =>
        String(req.code ?? req.key ?? '').toUpperCase() === 'PROFICIENCY'
      )?.key;
      const form517Anchor = resolved.requirements.find((req) =>
        String(req.code ?? req.key ?? '').toUpperCase() === 'SAPS_517_FORM'
      )?.key;

      const missingAnchorByLabel = new Map<string, string | undefined>();
      resolved.requirements.forEach((req) => {
        missingAnchorByLabel.set(normalizeMissingItem(req.label), req.key);
      });
      if (firearmAnchor) {
        missingAnchorByLabel.set(normalizeMissingItem('Select at least one firearm'), firearmAnchor);
      }
      if (competencyAnchor) {
        missingAnchorByLabel.set(normalizeMissingItem('Select at least one competency certificate'), competencyAnchor);
      }
      if (membershipAnchor) {
        missingAnchorByLabel.set(normalizeMissingItem('Firearm association membership'), membershipAnchor);
      }
      if (supportingAnchor) {
        missingAnchorByLabel.set(normalizeMissingItem(MISSING_SUPPORTING_STATEMENT), supportingAnchor);
      }
      const proficiencyAnchorTarget = proficiencyAnchor || 'PROFICIENCY';
      missingAnchorByLabel.set(
        normalizeMissingItem('Select at least one proficiency entry'),
        proficiencyAnchorTarget
      );
      if (form517Anchor) {
        missingAnchorByLabel.set(normalizeMissingItem('Required SAPS 517 info'), form517Anchor);
      }
      missingAnchorByLabel.set(normalizeMissingItem('Complete declarations section'), DECLARATIONS_ANCHOR);

      const missingIssues: DocumentSectionIssue[] = missingLines.map((line, idx) => {
        const normalized = normalizeMissingItem(line);
        let anchor = missingAnchorByLabel.get(normalized) ?? documentsReadyState.anchor;
        if (!anchor) {
          const lower = normalized.toLowerCase();
          if (
            lower.includes('handle and use results') ||
            lower.includes('knowledge of the firearms control') ||
            lower.includes('statement of results') ||
            lower.includes('proficiency required')
          ) {
            anchor = proficiencyAnchorTarget;
          }
        }
        return {
          key: `missing:${normalized}:${idx}`,
          severity: 'missing',
          title: 'Missing document',
          message: line,
          anchor,
        };
      });

      const sectionLimitIssues =
        String((application.form ?? (application as any).type ?? '')).toLowerCase() === '518a'
          ? buildSectionLimitWarningIssues({
              rule: getFirearmMaxRule(policy518a as any),
              selectedFirearms,
              firearmAnchor,
            })
          : [];
      const selectedCertificates = resolveApplicationCompetencyCertificates(application);
      const submittedIssues = buildSubmittedApplicationWarningIssues({
        form: application.form ?? (application as any).type,
        selectedFirearms,
        selectedCertificates,
        firearmAnchor,
        competencyAnchor,
      }).issues;

      issues = [
        ...submittedIssues,
        ...expiredWarningIssues,
        ...proofOfAddressWarningIssues,
        ...membershipSubmissionIssues,
        ...membershipDocumentFreshnessIssues,
        ...supportingStatementFreshnessIssues,
        ...motivationDraftIssues,
        ...sectionLimitIssues,
        ...demoDataIssues,
        ...missingIssues,
      ];
    }

    if (!issues.length) return null;

    const anchorOrder = new Map<string, number>();
    if (application) {
      const selectedFirearms = resolveApplicationFirearms(application);
      const resolved = resolveRequirementsForApplication({
        application: {
          id: application.id,
          form: (application as any).form || (application as any).type,
          licenseType: (application as any).licenseType ?? (application as any).licenceType,
          licenceType: (application as any).licenceType ?? (application as any).licenseType,
          licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
          licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
        },
        firearms: selectedFirearms.map((firearm) => ({
          id: String(firearm.id),
          make: firearm.make,
          model: firearm.model,
          firearmType: firearm.firearmType,
          section: (firearm as any).section,
          licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
          licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
          licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
          licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
        })),
      });
      resolved.requirements.forEach((req, index) => {
        if (req.key) anchorOrder.set(req.key, index);
      });
      anchorOrder.set(DECLARATIONS_ANCHOR, Number.MAX_SAFE_INTEGER);
    }
    let firstMissingAnchor = issues
      .filter((issue) => !!issue.anchor)
      .sort((a, b) => {
        const aRank = anchorOrder.get(a.anchor ?? '') ?? Number.MAX_SAFE_INTEGER;
        const bRank = anchorOrder.get(b.anchor ?? '') ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      })[0]?.anchor;
    const proficiencyAnchorFallback = (() => {
      const proficiencyIssue = issues.find((issue) => {
        const lower = String(issue.message ?? '').toLowerCase();
        return (
          lower.includes('handle and use results') ||
          lower.includes('knowledge of the firearms control') ||
          lower.includes('statement of results') ||
          lower.includes('proficiency required')
        );
      });
      return proficiencyIssue?.anchor;
    })();
    if (proficiencyAnchorFallback) {
      firstMissingAnchor = proficiencyAnchorFallback;
    }
    const uniqueIssues = issues.filter(
      (issue, index, array) => array.findIndex((candidate) => candidate.key === issue.key) === index
    );
    const demoOnly =
      uniqueIssues.length === 1 &&
      uniqueIssues[0]?.key === 'warning:demo_dataset_active';
    const heading = demoOnly ? 'Demo Mode Active' : 'Warnings (tap to view)';
    return {
      heading,
      items: uniqueIssues.map((issue) => issue.message),
      firstMissingAnchor,
      actionable: !demoOnly,
    };
  }, [application, application?.status, demoDataIssues, documentsReadyState.anchor, documentsReadyState.message, expiredWarningIssues, membershipDocumentFreshnessIssues, membershipSubmissionIssues, motivationDraftIssues, proofOfAddressWarningIssues, supportingStatementFreshnessIssues]);

  const handleFinalisePress = useCallback(async () => {
    if (!application) return;
    const demoBypassesPayment = demoDatasetActive;
    if (
      !demoBypassesPayment &&
      appConfig.features.paymentBehaviour === 'iap' &&
      (Platform.OS === 'ios' || Platform.OS === 'android')
    ) {
      void prefetchIapPriceForApplication(application, Platform.OS === 'ios' ? 'ios' : 'android');
    }
    const offlinePaymentIssues =
      !demoBypassesPayment && (await isDeviceOffline())
        ? [
            {
              key: 'warning:payment_offline',
              severity: 'warning' as const,
              title: 'Warning',
              message: paymentOfflineMessage,
            } as DocumentSectionIssue,
          ]
        : [];
    const hasBlockingIssue =
      !documentsReady ||
      hasSectionCountLimitIssue ||
      hasExpiredMembershipSubmissionIssue ||
      hasExpiredMembershipDocumentFreshnessIssue ||
      hasExpiredSupportingStatementFreshnessIssue ||
      motivationDraftIssues.length > 0 ||
      offlinePaymentIssues.length > 0 ||
      (!demoBypassesPayment && hasDemoDataIssue);
    if (hasBlockingIssue) {
      const hasMissingDocuments = parseMissingItems(documentsReadyState.message).length > 0;
      const blockingIssues = [
        ...sectionCountLimitIssues,
        ...(!demoBypassesPayment ? demoDataIssues : []),
        ...(!demoBypassesPayment ? offlinePaymentIssues : []),
        ...(hasExpiredMembershipSubmissionIssue ? membershipSubmissionIssues : []),
        ...(hasExpiredMembershipDocumentFreshnessIssue ? membershipDocumentFreshnessIssues : []),
        ...(hasExpiredSupportingStatementFreshnessIssue ? supportingStatementFreshnessIssues : []),
        ...motivationDraftIssues,
      ].filter(
        (issue, index, array) => array.findIndex((candidate) => candidate.key === issue.key) === index
      );
      const hasBlockingIssues = blockingIssues.length > 0;
      const offlineOnlyBlock =
        !hasMissingDocuments &&
        blockingIssues.length === 1 &&
        blockingIssues[0]?.key === 'warning:payment_offline';
      if (offlineOnlyBlock) {
        Alert.alert('Submission blocked', paymentOfflineMessage);
        return;
      }
      const alertTitle = hasMissingDocuments && hasBlockingIssues
        ? 'Missing documents and blocking issues'
        : hasMissingDocuments
          ? 'Missing documents'
          : 'Submission blocked';
      const detailLines: string[] = [];
      if (documentsReadyState.message) {
        detailLines.push(documentsReadyState.message);
      }
      if (blockingIssues.length) {
        if (detailLines.length) detailLines.push('');
        detailLines.push('Blocking issues:');
        blockingIssues.forEach((issue) => detailLines.push(`- ${issue.message}`));
      }
      detailLines.push('');
      if (hasDemoDataIssue && !demoBypassesPayment) {
        detailLines.push('This application cannot be finalised because demo data is active.');
        detailLines.push('');
      }
      detailLines.push('You cannot finalise until all required documents are added and blocking issues are resolved. Do you want to update now?');
      Alert.alert(
        alertTitle,
        detailLines.join('\n'),
        [
          { text: 'No', style: 'cancel' },
              {
                text: 'Yes',
                style: 'default',
                onPress: () => {
                  handleMoveToDraft(missingDocsCard?.firstMissingAnchor, { showIssues: true });
                },
              },
            ],
          );
      return;
    }
    Alert.alert(
      demoBypassesPayment ? 'Finalise demo application' : 'Finalise application',
      demoBypassesPayment
        ? 'Are you sure you want to finalise this demo application?\n\nPayment will be skipped.'
        : 'Are you sure you want to pay and finalise your application?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            const behaviour = appConfig.features.paymentBehaviour;
            if (!demoBypassesPayment && (behaviour === 'test' || behaviour === 'final' || behaviour === 'iap')) {
              router.push({
                pathname: '/application/[id]/payment',
                params: { id: application.id },
              } as any);
              return;
            }

            setProcessingLabel(demoBypassesPayment ? 'Finalising demo application...' : 'Finalising application...');
            setLoading(true);
            try {
              await finaliseApplication(application);
              setTick((t) => t + 1);
            } catch (err: any) {
              logger.warn('finalise application error', err);
              Alert.alert(
                'Unable to finalise',
                err?.message ?? 'An unexpected error occurred while updating the application.'
              );
            } finally {
              setLoading(false);
              setProcessingLabel(null);
            }
          },
        },
      ]
    );
  }, [
    application,
    documentsReady,
    documentsReadyState.message,
    demoDatasetActive,
    handleMoveToDraft,
    hasDemoDataIssue,
    hasExpiredMembershipDocumentFreshnessIssue,
    hasExpiredMembershipSubmissionIssue,
    hasExpiredSupportingStatementFreshnessIssue,
    hasSectionCountLimitIssue,
    missingDocsCard?.firstMissingAnchor,
    demoDataIssues,
    expiredWarningIssues,
    membershipDocumentFreshnessIssues,
    membershipSubmissionIssues,
    motivationDraftIssues,
    paymentOfflineMessage,
    proofOfAddressWarningIssues,
    router,
    sectionCountLimitIssues,
    submittedApplicationWarningIssues,
    supportingStatementFreshnessIssues,
  ]);

  const { fileName: currentFileName, path: currentPath } = useMemo(() => {
    const raw = typeof pdfUri === 'string' ? pdfUri : '';
    if (!raw) return { fileName: null as string | null, path: null as string | null };
    // Handle base64 and non-file URIs
    if (raw.startsWith('data:application/pdf;base64,')) {
      return { fileName: 'embedded.pdf', path: 'data:application/pdf;base64,…' };
    }
    // Normalize file://
    const normalized = raw.startsWith('file://') ? raw.slice('file://'.length) : raw;
    const parts = normalized.split('/');
    const name = parts[parts.length - 1] || 'document.pdf';
    return { fileName: name, path: normalized };
  }, [pdfUri]);

  // const paymentReceived = !!(application as any)?.paymentReceived;

  const isSubmitted = application?.status === 'submitted';
  const isArchived = application?.status === 'archived';
  const paymentBehaviour = appConfig.features.paymentBehaviour;
  const hideInvoiceSummary = paymentBehaviour === 'message' || paymentBehaviour === 'test';
  const showPaymentInfoCard = (isSubmitted || isArchived) && !hideInvoiceSummary && !demoDatasetActive;
  const paymentInfoRows = useMemo(() => {
    const fallback = '-';
    const iap = application?.iap;
    const isIos = Platform.OS === 'ios';
    const idLabel = isIos ? 'Transaction ID' : 'Order ID';
    const idValue = isIos ? iap?.transactionId : iap?.orderId;
    const dateLabel = isIos ? 'Transaction Date' : 'Purchase Time';
    const rawDate = isIos ? iap?.transactionDate : iap?.purchaseTime;
    let dateValue = fallback;
    if (rawDate) {
      const parsed = Date.parse(rawDate);
      dateValue = Number.isNaN(parsed) ? rawDate : new Date(parsed).toLocaleString();
    }
    let amountValue = fallback;
    if (iap?.displayPrice && iap.displayPrice.trim()) {
      amountValue = iap.displayPrice.trim();
    } else if (typeof iap?.price === 'number' && Number.isFinite(iap.price)) {
      const fixed = iap.price.toFixed(2);
      amountValue = iap.currency ? `${iap.currency} ${fixed}` : fixed;
    }
    return [
      { label: idLabel, value: idValue?.trim() ? idValue : fallback },
      { label: dateLabel, value: dateValue },
      { label: 'Amount', value: amountValue },
    ];
  }, [application?.iap, isArchived, isSubmitted]);
  const headerTitle = useMemo(() => {
    if (application?.status === 'ready') return 'Document review';
    if (application?.status === 'submitted') return 'Final documents';
    if (application?.status === 'archived') return 'Archived documents';
    return 'Ready application';
  }, [application?.status]);

  const showComingSoon = useCallback((featureName: string) => {
    Alert.alert('Coming soon', `${featureName} will be available soon.`);
  }, []);

  const ensureDocumentBundle = useCallback(
    async (app: Application) => {
      // Prefer cached bundle if present
      const candidate = app.documentBundlePath || app.pdfPath || '';
      if (candidate) {
        try {
          const resolvedCandidate = resolveDocumentUri(candidate) ?? candidate;
          const info = await FileSystem.getInfoAsync(resolvedCandidate);
          if (info.exists) {
            return { uri: resolvedCandidate, path: resolvedCandidate };
          }
        } catch {
          // fall through to regeneration
        }
      }

      const generated = await generateDocumentBundlePdf(app);
      const storedPath = toRelativeDocumentPath(generated.path) ?? generated.path;
      const updated = touch({
        ...app,
        documentBundlePath: storedPath,
        documentBundlePageCount: generated.pageCount,
        pdfPath: storedPath,
      } as Application);
      persist(updated);
      setTick((t) => t + 1);
      return { uri: generated.uri, path: generated.path };
    },
    [setTick]
  );

  const handleDocumentBundlePress = useCallback(async () => {
    const currentApplication = getFreshApplication();
    if (!currentApplication) return;
    if (
      demoDatasetActive &&
      currentApplication.status !== 'submitted' &&
      currentApplication.status !== 'archived'
    ) {
      showDemoDataBlockedAlert();
      return;
    }
    setProcessingLabel('Preparing document bundle...');
    setLoading(true);
    try {
      const bundle = await ensureDocumentBundle(currentApplication);
      const shareableUri = await prepareShareablePdf(bundle.uri, 'document-bundle');

      setPdfUri(shareableUri);
      setActiveAction('bundle');
      router.push({
        pathname: '/application/[id]/preview',
        params: {
          id: currentApplication.id,
          uri: encodeURIComponent(shareableUri),
          title: 'Document bundle',
          paid: paymentReceived ? '1' : '0',
        },
      } as any);
    } catch (err: any) {
      logger.warn('document bundle error', err);
      Alert.alert(
        'Unable to open document bundle',
        err?.message ?? 'An unexpected error occurred while preparing the document bundle.'
      );
    } finally {
      setLoading(false);
      setProcessingLabel(null);
    }
  }, [demoDatasetActive, ensureDocumentBundle, getFreshApplication, paymentReceived, prepareShareablePdf, router, showDemoDataBlockedAlert]);

  const handleSummaryCardPress = useCallback(() => {
    if (!application) return;
    if (application.status === 'submitted' || application.status === 'archived') {
      void handleDocumentBundlePress();
      return;
    }
    if (application.status !== 'ready') return;
    if (missingDocsCard?.actionable) {
      handleMoveToDraft(missingDocsCard.firstMissingAnchor, { showIssues: true });
      return;
    }
    if (missingDocsCard) return;
    handleMoveToDraft();
  }, [application, handleDocumentBundlePress, handleMoveToDraft, missingDocsCard]);

  const handleInvoicePress = useCallback(() => {
    showComingSoon('Invoice');
  }, [showComingSoon]);

  const handleShareCurrentPdf = useCallback(async () => {
    if (!pdfUri) return;
    try {
      await sharePdf(pdfUri, 'Share PDF');
    } catch (err: any) {
      logger.warn('current pdf share error', err);
      Alert.alert('Unable to share PDF', err?.message ?? 'An error occurred while sharing the PDF.');
    }
  }, [pdfUri]);

  const fsDocumentDirectory = FileSystem.documentDirectory ?? null;
  const fsCacheDirectory = FileSystem.cacheDirectory ?? null;
  const isFileSystemAvailable = Boolean(fsDocumentDirectory || fsCacheDirectory);

  const competencyCertificatesById = useMemo<Record<string, CompetencyCertificate>>(() => {
    if (!application) return {};
    const certs = resolveApplicationCompetencyCertificates(application);
    return certs.reduce<Record<string, CompetencyCertificate>>((acc, cert) => {
      acc[cert.id] = cert;
      return acc;
    }, {});
  }, [application, tick]);

  const firearmsById = useMemo<Record<string, Firearm>>(() => {
    if (!application) return {};
    const firearms = resolveApplicationFirearms(application);
    return firearms.reduce<Record<string, Firearm>>((acc, firearm) => {
      acc[firearm.id] = firearm;
      return acc;
    }, {});
  }, [application, tick]);
  const competencyCount = useMemo(
    () => Object.keys(competencyCertificatesById).length,
    [competencyCertificatesById]
  );
  const firearmCount = useMemo(
    () => Object.keys(firearmsById).length,
    [firearmsById]
  );

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title={headerTitle}
          onClose={handleClose}
          leadingActions={!hideHome ? (
            <IconRoundButton
              buttonType="home"
              accessibilityLabel="Home"
              onPress={handleHome}
              size="sm"
              hitSlop={8}
            />
          ) : undefined}
          style={styles.header}
        />

        <PageScrollView contentContainerStyle={styles.body}>
          {application ? (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>
                {application.form === '518a'
                  ? 'Firearm licence renewal:'
                  : application.form === '517'
                    ? 'New competency application:'
                    : 'Competency renewal:'}
              </Text>
              {application.status !== 'draft' ? (
                <View style={styles.summaryCard}>
                  <ApplicationCard
                    application={application}
                    onPress={handleSummaryCardPress}
                    competencyCertificates={competencyCertificatesById}
                    firearms={firearmsById}
                    showHeader={false}
                    showStatusBadge={false}
                    showMetaRow={false}
                    showActions={false}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Application not found</Text>
            </View>
          )}

          {missingDocsCard ? (
            <Pressable
              disabled={!missingDocsCard.actionable}
              onPress={() => handleMoveToDraft(missingDocsCard.firstMissingAnchor, { showIssues: true })}
              style={({ pressed }) => [
                styles.missingCardWrap,
                missingDocsCard.actionable && pressed ? styles.missingCardPressed : null,
              ]}
              accessibilityRole={missingDocsCard.actionable ? 'button' : undefined}
            >
              <DocumentActionCard
                title={missingDocsCard.heading}
                actions={[]}
                style={styles.missingCard}
                titleStyle={styles.missingTitle}
              >
                <View style={styles.missingList}>
                  {missingDocsCard.items.map((item, idx) => (
                    <View key={`${item}-${idx}`} style={styles.missingItem}>
                      <Text style={styles.missingBullet}>{'\u2022'}</Text>
                      <Text style={styles.missingText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </DocumentActionCard>
            </Pressable>
          ) : null}

          {terminalDuplicateApplicationsCard ? (
            <DocumentActionCard
              title="Other renewal applications found"
              subtitle={
                terminalDuplicateApplicationsCard.itemType === 'firearm'
                  ? 'Other draft or ready firearm renewal applications still include this firearm.'
                  : 'Other draft or ready competency renewal applications still include this certificate.'
              }
              subtitleStyle={styles.terminalConflictSubtitle}
              actionsRowStyle={styles.terminalConflictActionsRow}
              actions={[
                {
                  label: 'View',
                  icon: 'preview',
                  onPress: openTerminalDuplicateApplications,
                  color: tones.teal.base,
                  hideLabel: true,
                },
                {
                  label: 'Delete',
                  icon: 'delete',
                  onPress: handleDeleteTerminalDuplicateApplications,
                  color: tones.red.base,
                  hideLabel: true,
                },
              ]}
              style={styles.missingCard}
              titleStyle={styles.missingTitle}
            >
              <View style={styles.missingList}>
                {terminalDuplicateApplicationsCard.itemLabels.map((item, idx) => (
                  <View key={`${item}-${idx}`} style={styles.missingItem}>
                    <Text style={styles.missingBullet}>{'\u2022'}</Text>
                    <Text style={styles.missingText}>{item}</Text>
                  </View>
                ))}
              </View>
            </DocumentActionCard>
          ) : null}

          {showPaymentInfoCard ? (
            <View style={styles.paymentInfoCard}>
              <Text style={styles.paymentInfoTitle}>Invoice summary</Text>
              {paymentInfoRows.map((row, index) => (
                index < 2 ? (
                  <View key={row.label} style={styles.paymentInfoBlock}>
                    <Text style={styles.paymentInfoLabel}>{row.label}</Text>
                    <Text style={styles.paymentInfoBlockValue}>{row.value}</Text>
                  </View>
                ) : (
                  <Text key={row.label} style={styles.paymentInfoInlineValue}>
                    {`${row.label}: ${row.value}`}
                  </Text>
                )
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            {isArchived ? (
              <>
                <Button label="View/share application" onPress={handleDocumentBundlePress} tone="teal" />
                {appConfig.features.allowArchivedApplicationDeletion ? (
                  <Button label="Delete application" onPress={handleDeleteArchivedApplication} tone="red" />
                ) : null}
                {/* <Button label="View/share invoice" onPress={handleInvoicePress} tone="blue" /> */}
              </>
            ) : isSubmitted ? (
              <>
                <Button label="View/share application" onPress={handleDocumentBundlePress} tone="teal" />
                {/* <Button label="View/share invoice" onPress={handleInvoicePress} tone="teal" /> */}
                <Button label="Archive application" onPress={handleArchive} tone="orange" />
              </>
          ) : (
            <>
          {application?.status === 'ready' ? (
            <Text style={styles.summarySubtitleReady}>
              {demoDatasetActive
                ? 'NOTE: Draft watermarks are removed once the demo application has been finalised.'
                : 'NOTE: Draft watermarks are removed once payment confirmation has been received.'}
            </Text>
          ) : null}
                <Button label="Review checklist" onPress={handleChecklistPress} tone="teal"/>
                <Button label="Review application" onPress={handleApplicationPress} tone="teal" />
                {supportingStatementsPreviewState.canPreview ? (
                  <Button
                    label="Review character references"
                    onPress={handleSupportingStatementsPress}
                    tone="teal"
                  />
                ) : null}
                {canReviewMotivation ? (
                  <Button label="Review motivation" onPress={handleMotivationPress} tone="teal" />
                ) : null}
                <Button label="Review supporting documents" onPress={handleSupportingPress} tone="teal"/>
                <Button
                  label={demoDatasetActive ? 'Finalise demo application' : 'Pay & finalise'}
                  sublabel={demoDatasetActive ? 'View the finalised demo application' : 'Pay and finalise your application'}
                  onPress={handleFinalisePress}
                  tone={demoDatasetActive ? 'blue' : documentsReady && !hasSectionCountLimitIssue && !hasDemoDataIssue && !hasExpiredMembershipSubmissionIssue && !hasExpiredMembershipDocumentFreshnessIssue && !hasExpiredSupportingStatementFreshnessIssue && motivationDraftIssues.length === 0 ? 'blue' : 'grey'}
                />
                {application?.form === '517' ? (
                  <>
                    <Button
                      label="Update required documents"
                      sublabel="Add or update required document uploads"
                      onPress={() => handleMoveToDraft(undefined, { target: 'documents' })}
                      tone="orange"
                    />
                  </>
                ) : (
                  <Button 
                    label="Make changes" 
                    sublabel="Go back to make changes to the application"
                    onPress={() => handleMoveToDraft()} 
                    tone="orange"/>
                )}
              </>
            )}
          </View>

          {/* {application?.status === 'submitted' ? (
            <Text style={styles.summarySubtitleSubmitted}>Final documents are available below.</Text>
          ) : null} */}
        </PageScrollView>

      </View>
      <ProcessingOverlay
        visible={!!processingLabel}
        label={processingLabel ?? 'Processing...'}
        progressCurrent={processingProgress?.current}
        progressTotal={processingProgress?.total}
        progressDelayMs={1000}
      />
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    body: { paddingTop: 12, gap: 24, justifyContent: 'flex-start' },
    summary: { gap: 0 },
    summaryTitle: { fontSize: 18, fontWeight: '700', color: tones.blue.base },
    summarySubtitleReady: { fontSize: 14, color: tones.orange.base },
    summarySubtitleSubmitted: { fontSize: 14, color: tones.blue.base },
    summaryCard: { marginTop: 12 },
    missingCardWrap: { borderRadius: 16 },
    missingCardPressed: { opacity: 0.96 },
    missingCard: { backgroundColor: tones.orange.surface, borderColor: tones.orange.emphasis },
    missingTitle: { fontSize: 16, color: tones.orange.base },
    missingList: { gap: 10 },
    missingItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    missingBullet: { color: tones.orange.base, fontSize: 16, lineHeight: 20, fontWeight: '700' },
    missingText: { flex: 1, color: tones.orange.base, fontWeight: '600', lineHeight: 20 },
    paymentInfoCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tones.blue.border,
      backgroundColor: tones.blue.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    paymentInfoTitle: {
      fontSize: 14,
      color: tones.blue.emphasis,
      fontWeight: '700',
      marginBottom: 2,
    },
    paymentInfoBlock: {
      gap: 3,
    },
    paymentInfoLabel: {
      flex: 1,
      fontSize: 13,
      color: tones.blue.base,
      fontWeight: '600',
    },
    paymentInfoBlockValue: {
      fontSize: 13,
      color: tones.blue.emphasis,
      fontWeight: '700',
    },
    paymentInfoInlineValue: {
      fontSize: 13,
      color: tones.blue.emphasis,
      fontWeight: '700',
      marginTop: 4,
    },
    terminalConflictSubtitle: {
      color: tones.orange.base,
      fontWeight: '600',
    },
    terminalConflictActionsRow: {
      marginTop: 0,
      paddingTop: 0,
      borderTopWidth: 0,
      gap: 10,
      justifyContent: 'flex-end',
    },
    actions: { gap: 12 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  });
