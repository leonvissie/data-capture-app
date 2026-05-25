import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  GestureResponderEvent,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../../src/components/Screen';
import TabScrollView from '../../src/components/TabScrollView';
import { useTones } from '../../src/theme/tones';
import { TAB_SPACING } from '../../src/theme/spacing';
import {
  Profile,
  ReferenceInfo,
  Firearm,
  Document,
  CompetencyCertificate,
  Application,
  Safe,
  DocStatus,
  Membership,
  Proficiency,
  ProficiencyDocument,
  SupportingStatement,
  SupportingStatementSlot,
  CompetencyExpiryReminderPreference,
} from '../../src/data/types';
import { listByType, deleteEntity, getById } from '../../src/data/sqlite';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ensureDevicePrefs, ensureUserPrefs, withMeta, touch, persist } from '../../src/data/repo';
import { saveEntity } from '../../src/data/sqlite';
import { resolveWizardRoute } from '../../src/navigation/helpers';
import { IconButtonGroup } from '../../src/components/IconButton';
import { IconRoundButton, FloatingIconRoundButton } from '../../src/components/RoundIconButton';
import WelcomeModal from '../../src/components/WelcomeModal';
import SupportingStatementCards, { SupportingStatementCardConfig } from '../../src/components/supporting/SupportingStatementCards';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { competencyCertTypeMap } from '../../src/data/competencyCertTypes';
import { createProfile, createSupportingStatement, DEFAULT_PROFILE } from '../../src/data/defaults';
import { appConfig } from '../../src/config/appConfig';
import {
  deleteEntityDocuments,
  getActiveApplicationsUsingCertificate,
  getActiveApplicationsUsingFirearm,
  getActiveApplicationsUsingSafe,
  getActiveApplicationsUsingMembership,
  getActiveApplicationsUsingProficiency,
  removeCompetencyAssociations,
  removeFirearmAssociations,
  removeSafeAssociations,
  removeMembershipAssociations,
  removeProficiencyAssociations,
} from '../../src/data/entityCleanup';
import { getMissingProfileFields } from '../../src/utils/profileValidation';
import { useCollapsedPanels } from '../../src/hooks/useCollapsedPanels';
import { logger } from '@/src/utils/logger';
import { getCompetencyReminderExpiryDate, recalculateAndPersistCompetencyExpiries } from '../../src/utils/competencyExpiry';
import { formatSaIdNumber } from '../../src/utils/formatSaIdNumber';
import { compareCompetencyCertificates } from '../../src/utils/competencyCertificates';
import { getCompetencyReminderVisualState, getReminderVisualState } from '../../src/utils/reminderVisuals';
import { getCompetencyCertificateIdsInTerminalApplications, getFirearmIdsInTerminalApplications } from '../../src/utils/applicationUsage';
import { compareCompetenciesByReminderPriority, compareFirearmsByReminderPriority } from '../../src/utils/reminderSort';
import CollapseToggleChip from '../../src/components/CollapseToggleChip';
import { categoryLabel } from '../../src/utils/categoryLabel';
import HelpModal from '../../src/components/HelpModal';
import { useHelpModal } from '../../src/help';
import { useDemoDataResetGuard } from '../../src/demo/useDemoDataResetGuard';
import { prepareReminderRenewalDocuments } from '../../src/utils/reminderRenewalDocuments';
import { resolveActiveReminderApplications } from '../../src/utils/reminderApplicationResolution';
import {
  buildReminderCompletedListRoute,
  prepareReminderCompletedApplication,
} from '../../src/utils/reminderCompletedApplication';
import { getSpouseReference } from '../../src/utils/references';
import { getMembershipHealth } from '../../src/utils/membershipHealth';
import { buildMembershipEndorsementLabels } from '../../src/utils/membershipEndorsements';

const showBackground = true; 

const normalizeId = (value: unknown) => `${value ?? ''}`.trim();
const isDraftOrReady = (status?: string | null) => status === 'draft' || status === 'ready';
const normalizeSection = (raw?: string | null) => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^section\s*/i, '').trim();
  return withoutPrefix || trimmed;
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const isExpired = (value?: string | null) => {
  const date = parseIsoDate(value);
  if (!date) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date.getTime() < todayUtc;
};

const getDaysUntil = (value?: string | null) => {
  const date = parseIsoDate(value);
  if (!date) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((date.getTime() - todayUtc) / MS_PER_DAY);
};

const stripDocIdsFromApplication = (app: Application, targetIds: Set<string>): Application | null => {
  let changed = false;
  let nextDocs = app.docs;

  if (targetIds.has(normalizeId(app.checklistDocumentId))) {
    changed = true;
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) => !targetIds.has(normalizeId(entry.documentId))
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) return null;

  return touch({
    ...app,
    docs: nextDocs,
    checklistDocumentId: targetIds.has(normalizeId(app.checklistDocumentId)) ? undefined : app.checklistDocumentId,
  } as Application);
};


function primarySerial(f: Firearm) {
  return f.frameSerialNumber || f.receiverSerialNumber || f.barrelSerialNo || '';
}

function formatCertificateType(cert: CompetencyCertificate) {
  if (Array.isArray(cert.licenceTypes) && cert.licenceTypes.length) {
    const labels = cert.licenceTypes
      .map((code) => competencyCertTypeMap[code] || code)
      .filter(Boolean);
    if (labels.length) {
      return labels.join(', ');
    }
  }
  return undefined;
}

function formatApplicationLabel(app: Application) {
  const formLabel = app.form === '517g'
    ? 'SAPS 517g'
    : app.form === '518a'
      ? 'SAPS 518a'
      : 'Application';
  const statusLabel = app.status === 'ready'
    ? 'ready'
    : app.status === 'draft'
      ? 'draft'
      : app.status;
  return `${formLabel} (${statusLabel ?? 'unknown'})`;
}

const formatImpactedAppsMessage = (
  apps: Application[],
  subject: string,
  effect: string
) => {
  if (!apps.length) return null;
  const intro = apps.length === 1
    ? `This ${subject} is used in 1 application that has not been submitted yet.`
    : `This ${subject} is used in ${apps.length} applications that have not been submitted yet.`;
  const details = apps.map(app => `• ${formatApplicationLabel(app)}`).join('\n');
  const suffix = `${effect}\n\nAffected application${apps.length > 1 ? 's' : ''}:\n${details}`;
  return `${intro}\n${suffix}`;
};

export default function ProfileOverviewTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openHelp, props: helpModalProps } = useHelpModal();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const guardDemoReset = useDemoDataResetGuard();
  const { scroll, intro } = useLocalSearchParams<{ scroll?: 'profile' | 'firearms' | 'competency' | 'memberships' | 'proficiencies' | 'safes' | 'supporting'; intro?: string | string[] }>();
  const showIntroFromParam = useMemo(() => {
    const value = Array.isArray(intro) ? intro[0] : intro;
    return value === '1' || value === 'true';
  }, [intro]);
  const [tick, setTick] = useState(0);
  const [introVisible, setIntroVisible] = useState(false);
  const competencyExpiryBackfillDoneRef = useRef(false);
  const profile = useMemo(() => listByType<Profile>('Profile')[0] ?? null, [tick]);
  const userPrefs = useMemo(
    () => (profile?.id ? ensureUserPrefs(profile.id) : null),
    [profile?.id, tick],
  );
  const competencyExpiryPreference =
    (userPrefs?.dfoCompetencyExpiryUsing ?? 'unknown') as CompetencyExpiryReminderPreference;
  useFocusEffect(
    useCallback(() => {
      if (!competencyExpiryBackfillDoneRef.current) {
        const { updatedCount } = recalculateAndPersistCompetencyExpiries();
        competencyExpiryBackfillDoneRef.current = true;
        if (updatedCount > 0) {
          setTick((t) => t + 1);
          return;
        }
      }
      setTick((t) => t + 1);
    }, [])
  );

  useEffect(() => {
    if (showIntroFromParam) {
      setIntroVisible(true);
    }
  }, [showIntroFromParam]);

  const fullName = [profile?.givenNames, profile?.surname].filter(Boolean).join(' ');
  const idTypeLabel = profile?.idType === 'ID_CARD'
    ? 'ID Card'
    : profile?.idType === 'ID_BOOK'
      ? 'ID Book'
      : profile?.idType === 'PASSPORT'
        ? 'Passport'
        : undefined;
  const formattedIdNumber = useMemo(() => {
    const raw = profile?.idNumber ?? '';
    if (!raw) return undefined;
    return profile?.idType === 'PASSPORT' ? raw : formatSaIdNumber(raw);
  }, [profile?.idNumber, profile?.idType]);
  const idPair = idTypeLabel && formattedIdNumber ? `${idTypeLabel}: ${formattedIdNumber}` : (idTypeLabel || formattedIdNumber);

  const cellphone = profile?.mobile;
  const home = profile?.homePhone;
  const work = profile?.workPhone;
  const spouseReference = useMemo<ReferenceInfo | undefined>(() => getSpouseReference(profile), [profile]);
  const partnerType = spouseReference?.type?.trim() || spouseReference?.relationshipDetail?.trim() || undefined;
  const partnerFullName = spouseReference?.fullNames?.trim() || undefined;
  const partnerIdNumber = spouseReference?.idNumber?.trim() || undefined;
  const hasPartnerInfo = !!(partnerFullName || partnerIdNumber);
  const isLikelySaId = (value?: string) => {
    if (!value) return false;
    const trimmed = value.trim();
    const noSpaces = trimmed.replace(/\s+/g, '');
    const digits = noSpaces.replace(/\D/g, '');
    if (digits.length !== 13 || digits !== noSpaces) return false;
    const yy = Number.parseInt(digits.slice(0, 2), 10);
    const mm = Number.parseInt(digits.slice(2, 4), 10);
    const dd = Number.parseInt(digits.slice(4, 6), 10);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return false;
    const yearA = 1900 + yy;
    const yearB = 2000 + yy;
    const isValidDate = (year: number) => {
      const date = new Date(Date.UTC(year, mm - 1, dd));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === mm &&
        date.getUTCDate() === dd
      );
    };
    return isValidDate(yearA) || isValidDate(yearB);
  };
  const partnerIdTypeLabel = isLikelySaId(partnerIdNumber) ? 'ID' : 'Passport';
  const partnerTitleBase = partnerType || 'Spouse/Partner';
  const partnerTitleLabel = `${partnerTitleBase} (${partnerIdTypeLabel}):`;
  const partnerIdBracketValue = partnerIdNumber ? `(${partnerIdNumber})` : undefined;
  const employmentTrade = profile?.employment?.tradeOrProfession?.trim() || undefined;
  const employmentSelfEmployed = profile?.employment?.selfEmployedDetail?.trim() || undefined;
  const employmentEmployer = profile?.employment?.employerName?.trim() || undefined;
  const employmentAddress = [
    profile?.employment?.employerAddress?.line1,
    profile?.employment?.employerAddress?.line2,
    profile?.employment?.employerAddress?.suburb,
    profile?.employment?.employerAddress?.city,
    profile?.employment?.employerAddress?.postCode,
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(', ') || undefined;
  const hasEmploymentInfo = !!(
    employmentTrade ||
    employmentSelfEmployed ||
    employmentEmployer ||
    employmentAddress
  );
  const addressLine = profile?.address?.singleLine;
  const postcode = profile?.address?.postCode;
  const addressPair = [addressLine, postcode].filter(Boolean).join('  •  ');
  const residenceType = profile?.address?.homeType?.trim() || undefined;
  const homeSecurity = (profile?.address?.securityMeasures ?? [])
    .map((item) => `${item}`.trim())
    .filter(Boolean)
    .join(', ') || undefined;
  const postalLine = profile?.addressPostal?.singleLine;
  const postalPostcode = profile?.addressPostal?.postCode;
  const postalPair = [postalLine, postalPostcode].filter(Boolean).join('  •  ');

  const scrollRef = useRef<ScrollViewType>(null);
  const profileTop = useRef(0);
  const firearmsTop = useRef(0);
  const competencyTop = useRef(0);
  const membershipsTop = useRef(0);
  const proficienciesTop = useRef(0);
  const supportingTop = useRef(0);
  const safesTop = useRef(0);
  const { collapsed, setSectionCollapsed } = useCollapsedPanels('profile', ['profile', 'competency', 'firearms', 'safes', 'memberships', 'proficiencies', 'supporting']);
  const [profileOpen, setProfileOpen] = useState(!collapsed.profile);
  const profileRotate = useRef(new Animated.Value(1)).current;
  const [competencyOpen, setCompetencyOpen] = useState(!collapsed.competency);
  const compRotate = useRef(new Animated.Value(1)).current;
  const [membershipsOpen, setMembershipsOpen] = useState(!collapsed.memberships);
  const membershipsRotate = useRef(new Animated.Value(1)).current;
  const [proficienciesOpen, setProficienciesOpen] = useState(!collapsed.proficiencies);
  const proficienciesRotate = useRef(new Animated.Value(1)).current;
  const [supportingOpen, setSupportingOpen] = useState(!collapsed.supporting);
  const supportingRotate = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const makeLayoutToggle = (
    open: boolean,
    setOpen: (v: boolean) => void,
    rotation: Animated.Value,
    sectionKey: string,
  ) => () => {
    const next = !open;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(next);
    setSectionCollapsed(sectionKey, !next);
    Animated.timing(rotation, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  };

  const openLayoutSection = useCallback(
    (
      sectionKey: string,
      setOpen: (v: boolean) => void,
      rotation: Animated.Value,
    ) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOpen(true);
      setSectionCollapsed(sectionKey, false);
      Animated.timing(rotation, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    },
    [setSectionCollapsed],
  );

  const openProfileSection = useCallback(
    () => openLayoutSection('profile', setProfileOpen, profileRotate),
    [openLayoutSection, profileRotate],
  );
  const openCompetencySection = useCallback(
    () => openLayoutSection('competency', setCompetencyOpen, compRotate),
    [openLayoutSection, compRotate],
  );
  const openMembershipsSection = useCallback(
    () => openLayoutSection('memberships', setMembershipsOpen, membershipsRotate),
    [openLayoutSection, membershipsRotate],
  );
  const openProficienciesSection = useCallback(
    () => openLayoutSection('proficiencies', setProficienciesOpen, proficienciesRotate),
    [openLayoutSection, proficienciesRotate],
  );
  const openSupportingSection = useCallback(
    () => openLayoutSection('supporting', setSupportingOpen, supportingRotate),
    [openLayoutSection, supportingRotate],
  );

  const scrollToSection = useCallback(() => {
    if (!scrollRef.current || !scroll) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const y = scroll === 'profile'
          ? profileTop.current
          : scroll === 'firearms'
            ? firearmsTop.current
            : scroll === 'competency'
              ? competencyTop.current
              : scroll === 'memberships'
                ? membershipsTop.current
                : scroll === 'proficiencies'
                  ? proficienciesTop.current
                : scroll === 'supporting'
                  ? supportingTop.current
                  : safesTop.current;
        scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: false });
      });
    });
  }, [scroll]);

  useEffect(() => {
    scrollToSection();
  }, [scrollToSection]);

  useFocusEffect(
    useCallback(() => {
      scrollToSection();
    }, [scrollToSection])
  );

  const terminalCompetencyIds = useMemo(() => getCompetencyCertificateIdsInTerminalApplications('517g'), [tick]);
  const terminalFirearmIds = useMemo(() => getFirearmIdsInTerminalApplications('518a'), [tick]);

  // Load firearms and group/sort
  const firearms = useMemo(
    () => listByType<Firearm>('Firearm')
      .slice()
      .sort((a, b) => compareFirearmsByReminderPriority(a, b, {
        terminalIds: terminalFirearmIds,
        compareBase: (left, right) => {
        const secA = (left.section ?? '').toString().toLowerCase();
        const secB = (right.section ?? '').toString().toLowerCase();
        const secCmp = secA.localeCompare(secB);
        if (secCmp !== 0) return secCmp;
        const am = `${left.make ?? ''} ${left.model ?? ''} ${primarySerial(left)}`.trim().toLowerCase();
        const bm = `${right.make ?? ''} ${right.model ?? ''} ${primarySerial(right)}`.trim().toLowerCase();
        return am.localeCompare(bm);
        },
      })),
    [terminalFirearmIds, tick]
  );

  // Documents cache (for resolving certificateDocumentId to a name/uri)
  const documents = useMemo(() => listByType<Document>('Document'), [tick]);
  const findApplicationsReferencingDocs = useCallback((docIds: string[]) => {
    const targets = new Set(docIds.map(normalizeId));
    return listByType<Application>('Application').filter(app => {
      if (!isDraftOrReady(app.status)) return false;
      if (targets.has(normalizeId(app.checklistDocumentId))) return true;
      const docs = app.docs?.documents ?? [];
      return docs.some((entry) => targets.has(normalizeId(entry.documentId)));
    });
  }, []);

  const purgeDocsFromApplications = useCallback((docIds: string[]) => {
    const targets = new Set(docIds.map(normalizeId));
    const apps = listByType<Application>('Application');
    let updated = 0;
    for (const app of apps) {
      const next = stripDocIdsFromApplication(app, targets);
      if (next) {
        persist(next);
        updated += 1;
      }
    }
    return updated;
  }, []);

  // Competency certificates (v1 entity), filtered to current profile if available
  const certificates = useMemo(
    () => {
      const profId = profile?.id;
      const all = listByType<CompetencyCertificate>('CompetencyCertificate');
      const filtered = profId ? all.filter(c => c.holderProfileId === profId) : all;
      return filtered.slice().sort((a, b) => compareCompetenciesByReminderPriority(a, b, {
        preference: competencyExpiryPreference,
        terminalIds: terminalCompetencyIds,
        compareBase: compareCompetencyCertificates,
      }));
    },
    [competencyExpiryPreference, terminalCompetencyIds, tick, profile?.id]
  );

  const openCompetencyPreview = useCallback((certificateId: string) => {
    router.push({
      pathname: '/competency/wizard',
      params: {
        origin: 'profile',
        nav: JSON.stringify({ returnTo: '/(tabs)/profile?scroll=competency', origin: '/(tabs)/profile?scroll=competency' }),
        certificateId,
        previewMode: '1',
        hideContinue: '1',
      },
    } as any);
  }, [router]);

  const openReminderRenewalFromProfile = useCallback((certificateId: string) => {
    try {
      const result = prepareReminderRenewalDocuments('competency', certificateId, '/(tabs)/profile?scroll=competency');
      if (result.kind === 'multiple') {
        const hasReady = result.applications.some((app) => app.status === 'ready');
        const hasDraft = result.applications.some((app) => app.status === 'draft');
        const listNav = encodeURIComponent(JSON.stringify({
          returnTo: '/(tabs)/profile?scroll=competency',
          routeBack: '/(tabs)/profile?scroll=competency',
          origin: '/(tabs)/profile?scroll=competency',
          clearRouteBackHistory: true,
        }));
        Alert.alert(
          'Choose renewal',
          'More than one active renewal application already includes this item. Open the relevant application list and choose which one to continue.',
          [
            ...(hasDraft
              ? [{ text: 'Open draft applications', onPress: () => router.push({ pathname: '/application/existing', params: { nav: listNav } } as any) }]
              : []),
            ...(hasReady
              ? [{ text: 'Open ready applications', onPress: () => router.push({ pathname: '/application/ready', params: { nav: listNav } } as any) }]
              : []),
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      router.push(result.route as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open the renewal application.';
      Alert.alert('Unable to continue', message);
    }
  }, [router]);

  const openCompletedCompetencyFromProfile = useCallback((certificateId: string) => {
    try {
      const result = prepareReminderCompletedApplication(
        'competency',
        certificateId,
        '/(tabs)/profile?scroll=competency',
      );
      if (result.kind === 'multiple') {
        const hasSubmitted = result.applications.some((app) => app.status === 'submitted');
        const hasArchived = result.applications.some((app) => app.status === 'archived');
        Alert.alert(
          'Choose completed application',
          'More than one completed renewal application already includes this item. Open the relevant application list and choose which one to continue.',
          [
            ...(hasSubmitted
              ? [{ text: 'Open completed applications', onPress: () => router.push(buildReminderCompletedListRoute('submitted', '/(tabs)/profile?scroll=competency') as any) }]
              : []),
            ...(hasArchived
              ? [{ text: 'Open archived applications', onPress: () => router.push(buildReminderCompletedListRoute('archived', '/(tabs)/profile?scroll=competency') as any) }]
              : []),
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      if (result.kind === 'none') {
        openCompetencyPreview(certificateId);
        return;
      }
      router.push(result.route as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open the completed application.';
      Alert.alert('Unable to continue', message);
    }
  }, [openCompetencyPreview, router]);

  const handleCompetencyCardPress = useCallback((certificate: CompetencyCertificate) => {
    const reminderExpiryDate = getCompetencyReminderExpiryDate(
      certificate,
      competencyExpiryPreference,
    );
    const reminderVisual = terminalCompetencyIds.has(String(certificate.id))
      ? { label: 'Renewal application created', color: 'green' as const, daysUntil: getDaysUntil(reminderExpiryDate) ?? 0 }
      : getCompetencyReminderVisualState(certificate, competencyExpiryPreference);

    if (
      reminderVisual?.color === 'red' ||
      reminderVisual?.color === 'orange' ||
      reminderVisual?.color === 'info'
    ) {
      const activeResolution = resolveActiveReminderApplications('competency', String(certificate.id));
      const renewMessage =
        activeResolution.kind === 'none'
          ? 'Do you want to view this competency certificate or start a renewal application?'
          : activeResolution.kind === 'single'
            ? 'A renewal application for this competency certificate is already in progress. Do you want to view the certificate or open the renewal?'
            : 'More than one renewal application for this competency certificate is already in progress. Do you want to view the certificate or choose a renewal to open?';
      const renewLabel =
        activeResolution.kind === 'none'
          ? 'Start renewal'
          : activeResolution.kind === 'single'
            ? 'Open renewal'
            : 'Choose renewal';
      Alert.alert(
        'Competency certificate',
        renewMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: renewLabel, onPress: () => openReminderRenewalFromProfile(String(certificate.id)) },
          { text: 'View', onPress: () => openCompetencyPreview(String(certificate.id)) },
        ],
      );
      return;
    }

    if (reminderVisual?.color === 'green') {
      Alert.alert(
        'Completed renewal',
        'Do you want to view the completed application?',
        [
          { text: 'No', onPress: () => openCompetencyPreview(String(certificate.id)) },
          { text: 'Yes', onPress: () => openCompletedCompetencyFromProfile(String(certificate.id)) },
        ],
      );
      return;
    }

    openCompetencyPreview(String(certificate.id));
  }, [competencyExpiryPreference, openCompetencyPreview, openCompletedCompetencyFromProfile, openReminderRenewalFromProfile, terminalCompetencyIds]);

  const memberships = useMemo(() => {
    const profId = profile?.id;
    const all = listByType<Membership>('Membership');
    const filtered = profId ? all.filter((m) => !m.holderProfileId || m.holderProfileId === profId) : all;
    return filtered
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
  }, [profile?.id, tick]);

  const proficiencies = useMemo(() => {
    const profId = profile?.id;
    const all = listByType<Proficiency>('Proficiency');
    const filtered = profId ? all.filter((p) => !p.holderProfileId || p.holderProfileId === profId) : all;
    return filtered
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
  }, [profile?.id, tick]);

  // Safes
  const safes = useMemo(() => {
    const profId = profile?.id;
    const all = listByType<Safe>('Safe');
    const filtered = profId ? all.filter(s => !s.holderProfileId || s.holderProfileId === profId) : all;
    return filtered
      .slice()
      .sort((a, b) => {
        const an = (a.safeName ?? '').toLowerCase();
        const bn = (b.safeName ?? '').toLowerCase();
        return an.localeCompare(bn);
      });
  }, [profile?.id, tick]);

  const supportingStatements = useMemo(() => {
    const profId = profile?.id;
    const all = listByType<SupportingStatement>('SupportingStatement');
    return profId ? all.filter((s) => s.holderProfileId === profId) : all;
  }, [profile?.id, tick]);

  const supportingBySlot = useMemo(() => {
    const map = new Map<SupportingStatementSlot, SupportingStatement>();
    supportingStatements.forEach((stmt) => {
      if (stmt?.slot) map.set(stmt.slot, stmt);
    });
    return map;
  }, [supportingStatements]);

  const handleDeleteProfileIds = useCallback(async () => {
    if (!profile?.id) {
      Alert.alert('Profile missing', 'Create your profile before managing ID documents.');
      return;
    }
    const ownedDocs = listByType<Document>('Document').filter(
      d =>
        d.parentType === 'Profile' &&
        d.parentId === profile.id &&
        (d.kind === 'ID_CARD' || d.kind === 'ID_BOOK' || d.kind === 'PASSPORT')
    );
    if (!ownedDocs.length) {
      Alert.alert('No ID documents', 'No ID photos to delete.');
      return;
    }
    const docIds = ownedDocs.map(doc => normalizeId(doc.id));
    const affectedApps = findApplicationsReferencingDocs(docIds);
    const warning = formatImpactedAppsMessage(
      affectedApps,
      'set of ID photos',
      'Deleting them will remove them from the application and delete the photos.'
    );
    Alert.alert(
      'Delete ID photos',
      warning ?? 'Remove all ID photos attached to your profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (docIds.length) purgeDocsFromApplications(docIds);
              for (const doc of ownedDocs) {
                const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
                for (const path of paths) {
                  try { await deleteOwnedDocFile(path); } catch { }
                }
                deleteEntity(doc.id);
              }
              setTick(t => t + 1);
            } catch (error) {
              logger.warn('[profile] Failed to delete ID docs', error);
              Alert.alert('Delete failed', 'Unable to delete ID photos right now.');
            }
          },
        },
      ],
    );
  }, [findApplicationsReferencingDocs, profile?.id, purgeDocsFromApplications, setTick]);

  const hasIdDocs = useMemo(
    () =>
      !!profile?.id &&
      documents.some(d =>
        d.parentType === 'Profile' &&
        d.parentId === profile.id &&
        (d.kind === 'ID_CARD' || d.kind === 'ID_BOOK' || d.kind === 'PASSPORT')
      ),
    [documents, profile?.id],
  );
  const hasAddressDocs = useMemo(
    () =>
      !!profile?.id &&
      documents.some(d => d.parentType === 'Profile' && d.parentId === profile.id && d.kind === 'PROOF_OF_ADDRESS'),
    [documents, profile?.id],
  );
  const profileComplete = useMemo(
    () => getMissingProfileFields(profile).length === 0,
    [profile]
  );
  const checklistStatus = useMemo(
    () => {
      const hasSection16 = firearms.some(
        (firearm) =>
          normalizeSection(
            firearm.section ?? (firearm as any).licenceSection ?? (firearm as any).licenseSection ?? ''
          ) === '16'
      );
      return {
        profileComplete,
        hasCompetency: certificates.length > 0,
        hasFirearm: firearms.length > 0,
        hasSafe: safes.length > 0,
        hasIdProof: hasIdDocs,
        hasAddressProof: hasAddressDocs,
        hasMembership: memberships.length > 0,
        requiresMembership: hasSection16,
      };
    },
    [
      certificates.length,
      firearms,
      hasAddressDocs,
      hasIdDocs,
      memberships.length,
      profileComplete,
      safes.length,
    ]
  );
  const welcomeMode = useMemo<'demo' | 'new' | 'renewal' | 'unknown'>(() => {
    if (userPrefs?.applicationIntent === 'new') return 'new';
    if (userPrefs?.applicationIntent === 'renewal') return 'renewal';
    return 'unknown';
  }, [userPrefs?.applicationIntent]);
  const supportingIntentNote = useMemo(() => {
    if (userPrefs?.applicationIntent === 'new') {
      return 'For a new competency application you are required to provide 2/3 contacts in addition to your spouse (if married).\n\n You are welcome to use our character reference wizard to add these or use your own.';
    }
    if (userPrefs?.applicationIntent === 'renewal') {
      return 'Check with your DFO as they might require 3 character references for applications. You are welcome to use our character reference wizard or use your own.';
    }
    return null;
  }, [userPrefs?.applicationIntent]);

  const openIdPreview = useCallback(() => {
    const resolved = resolveWizardRoute('id', 'profile');
    if (!resolved) return;
    router.replace({
      pathname: resolved.routeTo as any,
      params: {
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          onComplete: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
        }),
      },
    } as any);
  }, [router]);

  const handleAddAddress = useCallback(() => {
    const resolved = resolveWizardRoute('address', 'profile');
    if (!resolved) return;
    router.replace({
      pathname: resolved.routeTo as any,
      params: {
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
          origin: resolved.routeBack,
        }),
      },
    } as any);
  }, [router]);

  const handleDeleteAddress = useCallback(async () => {
    if (!profile?.id) {
      Alert.alert('Profile missing', 'Create your profile before managing addresses.');
      return;
    }
    const ownedDocs = documents.filter(
      d => d.parentType === 'Profile' && d.parentId === profile.id && d.kind === 'PROOF_OF_ADDRESS'
    );
    if (!ownedDocs.length) {
      Alert.alert('No address documents', 'No address proof to delete.');
      return;
    }
    const docIds = ownedDocs.map(doc => normalizeId(doc.id));
    const affectedApps = findApplicationsReferencingDocs(docIds);
    const warning = formatImpactedAppsMessage(
      affectedApps,
      'proof of address photos',
      'Deleting them will remove them from the application and delete the photos.'
    );
    Alert.alert(
      'Delete address proof',
      warning ?? 'Remove all proof of address photos?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (docIds.length) purgeDocsFromApplications(docIds);
              for (const doc of ownedDocs) {
                const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
                for (const path of paths) {
                  try { await deleteOwnedDocFile(path); } catch { }
                }
                deleteEntity(doc.id);
              }
              setTick(t => t + 1);
            } catch (error) {
              logger.warn('[profile] Failed to delete address docs', error);
              Alert.alert('Delete failed', 'Unable to delete address proof right now.');
            }
          },
        },
      ],
    );
  }, [documents, findApplicationsReferencingDocs, profile?.id, purgeDocsFromApplications, setTick]);

  const openAddressPreview = useCallback(() => {
    const resolved = resolveWizardRoute('address', 'profile');
    if (!resolved) return;
    router.replace({
      pathname: resolved.routeTo as any,
      params: { nav: JSON.stringify({ returnTo: resolved.routeBack, clearRouteBackHistory: resolved.clearRouteBackHistory, origin: resolved.routeBack }) },
    } as any);
  }, [router]);

  const handleDeleteFirearm = useCallback(async (id: string) => {
    try {
      await removeFirearmAssociations(id);
      await deleteEntityDocuments('Firearm', id);
      deleteEntity(id);
      recalculateAndPersistCompetencyExpiries();
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[profile] Failed to delete firearm', error);
      Alert.alert('Delete failed', 'Unable to delete this firearm. Please try again.');
    }
  }, [setTick]);

  const handleDeleteCert = useCallback(async (id: string) => {
    try {
      await removeCompetencyAssociations(id);
      await deleteEntityDocuments('CompetencyCertificate', id);
      deleteEntity(id);
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[profile] Failed to delete competency certificate', error);
      Alert.alert('Delete failed', 'Unable to delete this competency certificate. Please try again.');
    }
  }, [setTick]);

  const confirmDeleteFirearm = useCallback(async (id: string) => {
    if (await guardDemoReset('firearm')) return;
    const impacted = getActiveApplicationsUsingFirearm(id);
    const proceed = () => { void handleDeleteFirearm(id); };

    if (!impacted.length) {
      Alert.alert('Delete firearm', 'Are you sure you want to delete this firearm?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: proceed },
      ]);
      return;
    }

    const intro = impacted.length === 1
      ? 'This firearm is used in 1 application that has not been submitted yet.'
      : `This firearm is used in ${impacted.length} applications that have not been submitted yet.`;
    const details = impacted
      .map(app => `• ${formatApplicationLabel(app)}`)
      .join('\n');
    const message = `${intro}\nDeleting it will remove it from the application${impacted.length > 1 ? 's' : ''} and delete related documents.\n\nAffected application${impacted.length > 1 ? 's' : ''}:\n${details}`;

    Alert.alert(
      'Delete firearm',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete anyway', style: 'destructive', onPress: proceed },
      ],
    );
  }, [guardDemoReset, handleDeleteFirearm]);

  const openFirearmLicenceEditor = useCallback(
    (firearmId: string) => {
      if (!firearmId) return;
      const resolved = resolveWizardRoute('firearm', 'profile');
      if (!resolved) return;
      router.replace({
        pathname: '/firearms/wizard',
        params: {
          firearmId,
          origin: 'profile',
          nav: JSON.stringify({
            routeBack: resolved.routeBack,
            returnTo: resolved.routeBack,
            onComplete: resolved.routeBack,
            clearRouteBackHistory: resolved.clearRouteBackHistory,
            origin: resolved.routeBack,
          }),
          hideContinue: '1',
        },
      } as any);
    },
    [router],
  );

  const openSafeWizard = useCallback(
    (safeId?: string) => {
      void (async () => {
        if (!safeId && (await guardDemoReset('safe'))) return;
        const resolved = resolveWizardRoute('safe', 'profile');
        if (!resolved) return;
        const params: Record<string, string> = {
          nav: JSON.stringify({
            routeBack: resolved.routeBack,
            returnTo: resolved.routeBack,
            onComplete: resolved.routeBack,
            clearRouteBackHistory: resolved.clearRouteBackHistory,
            origin: resolved.routeBack,
          }),
        };
        if (safeId) params.safeId = safeId;
        router.replace({
          pathname: resolved.routeTo as any,
          params,
        } as any);
      })();
    },
    [guardDemoReset, router],
  );

  const confirmDeleteCert = useCallback(async (id: string) => {
    if (await guardDemoReset('competency certificate')) return;
    const impacted = getActiveApplicationsUsingCertificate(id);
    const proceed = () => { void handleDeleteCert(id); };

    if (!impacted.length) {
      Alert.alert('Delete certificate', 'Are you sure you want to delete this competency certificate?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: proceed },
      ]);
      return;
    }

    const intro = impacted.length === 1
      ? 'This competency certificate is used in 1 application that has not been submitted yet.'
      : `This competency certificate is used in ${impacted.length} applications that have not been submitted yet.`;
    const details = impacted
      .map(app => `• ${formatApplicationLabel(app)}`)
      .join('\n');
    const message = `${intro}\nDeleting it will remove it from the application${impacted.length > 1 ? 's' : ''} and delete related documents.\n\nAffected application${impacted.length > 1 ? 's' : ''}:\n${details}`;

    Alert.alert(
      'Delete certificate',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete anyway', style: 'destructive', onPress: proceed },
      ],
    );
  }, [guardDemoReset, handleDeleteCert]);

  const handleDeleteSafe = useCallback(async (safeId: string) => {
    try {
      await removeSafeAssociations(safeId);
      const docs = listByType<Document>('Document').filter(
        d => d.parentType === 'Safe' && d.parentId === safeId
      );
      const docIds = docs.map(doc => normalizeId(doc.id));
      if (docIds.length) {
        purgeDocsFromApplications(docIds);
      }
      for (const doc of docs) {
        const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
        for (const path of paths) {
          try { await deleteOwnedDocFile(path); } catch { }
        }
        deleteEntity(doc.id);
      }
      deleteEntity(safeId);
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[profile] Failed to delete safe', error);
      Alert.alert('Delete failed', 'Unable to delete this safe. Please try again.');
    }
  }, [purgeDocsFromApplications]);

  const confirmDeleteSafe = useCallback(async (safeId: string) => {
    if (await guardDemoReset('safe')) return;
    const docs = listByType<Document>('Document').filter(
      d => d.parentType === 'Safe' && d.parentId === safeId
    );
    const docIds = docs.map(doc => normalizeId(doc.id));
    const affectedAppsFromDocs = docIds.length ? findApplicationsReferencingDocs(docIds) : [];
    const impactedByLink = getActiveApplicationsUsingSafe(safeId);
    const uniqueApps = [...new Map([...affectedAppsFromDocs, ...impactedByLink].map(app => [app.id, app])).values()];
    const warning = formatImpactedAppsMessage(
      uniqueApps,
      'safe and its photos',
      'Deleting it will remove its photos from the application.'
    );
    Alert.alert(
      'Delete safe',
      warning ?? 'Are you sure you want to delete this safe and its photos?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void handleDeleteSafe(safeId); } },
      ],
    );
  }, [findApplicationsReferencingDocs, getActiveApplicationsUsingSafe, guardDemoReset, handleDeleteSafe]);

  const handleDeleteMembership = useCallback(async (membershipId: string) => {
    try {
      await removeMembershipAssociations(membershipId);
      const docs = listByType<Document>('Document').filter(
        d => d.parentType === 'Membership' && d.parentId === membershipId
      );
      const docIds = docs.map(doc => normalizeId(doc.id));
      if (docIds.length) {
        purgeDocsFromApplications(docIds);
      }
      for (const doc of docs) {
        const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
        for (const path of paths) {
          try { await deleteOwnedDocFile(path); } catch { }
        }
        deleteEntity(doc.id);
      }
      deleteEntity(membershipId);
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[profile] Failed to delete membership', error);
      Alert.alert('Delete failed', 'Unable to delete this membership. Please try again.');
    }
  }, [purgeDocsFromApplications]);

  const confirmDeleteMembership = useCallback((membershipId: string) => {
    const docs = listByType<Document>('Document').filter(
      d => d.parentType === 'Membership' && d.parentId === membershipId
    );
    const docIds = docs.map(doc => normalizeId(doc.id));
    const affectedApps = docIds.length ? findApplicationsReferencingDocs(docIds) : [];
    const impactedByLink = getActiveApplicationsUsingMembership(membershipId);
    const uniqueApps = [...new Map([...affectedApps, ...impactedByLink].map(app => [app.id, app])).values()];
    const warning = formatImpactedAppsMessage(
      uniqueApps,
      'membership and its documents',
      'Deleting it will remove its documents from the application.'
    );
    Alert.alert(
      'Delete membership',
      warning ?? 'Are you sure you want to delete this membership and its documents?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void handleDeleteMembership(membershipId); } },
      ],
    );
  }, [findApplicationsReferencingDocs, handleDeleteMembership]);

  const handleAddId = useCallback(() => {
    router.push({
      pathname: '/id/wizard',
      params: {
        nav: JSON.stringify({ returnTo: '/(tabs)/profile', onComplete: '/(tabs)/profile' }),
      },
    } as any);
  }, [router]);

  const openMembershipWizard = useCallback((membershipId?: string) => {
    const resolved = resolveWizardRoute('membership', 'profile');
    if (!resolved) return;
    const params: Record<string, any> = {
      nav: JSON.stringify({ returnTo: resolved.routeBack, clearRouteBackHistory: resolved.clearRouteBackHistory, origin: resolved.routeBack }),
    };
    if (membershipId) params.membershipId = membershipId;
    router.replace({ pathname: resolved.routeTo as any, params } as any);
  }, [router]);

  const handleDeleteProficiency = useCallback(async (proficiencyId: string) => {
    try {
      await removeProficiencyAssociations(proficiencyId);
      const docs = listByType<Document>('Document').filter(
        d => d.parentType === 'Proficiency' && d.parentId === proficiencyId
      );
      for (const doc of docs) {
        const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
        for (const path of paths) {
          try { await deleteOwnedDocFile(path); } catch { }
        }
        deleteEntity(doc.id);
      }
      deleteEntity(proficiencyId);
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[profile] Failed to delete proficiency', error);
      Alert.alert('Delete failed', 'Unable to delete this proficiency. Please try again.');
    }
  }, []);

  const confirmDeleteProficiency = useCallback((proficiencyId: string) => {
    const docs = listByType<Document>('Document').filter(
      d => d.parentType === 'Proficiency' && d.parentId === proficiencyId
    );
    const docIds = docs.map(doc => normalizeId(doc.id));
    const affectedApps = docIds.length ? findApplicationsReferencingDocs(docIds) : [];
    const impactedByLink = getActiveApplicationsUsingProficiency(proficiencyId);
    const uniqueApps = [...new Map([...affectedApps, ...impactedByLink].map(app => [app.id, app])).values()];
    const warning = formatImpactedAppsMessage(
      uniqueApps,
      'proficiency and its documents',
      'Deleting it will remove its documents from the application.'
    );
    Alert.alert(
      'Delete proficiency',
      warning ?? 'Are you sure you want to delete this proficiency and its documents?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void handleDeleteProficiency(proficiencyId); } },
      ],
    );
  }, [findApplicationsReferencingDocs, handleDeleteProficiency]);

  const openProficiencyWizard = useCallback((proficiencyId?: string) => {
    const resolved = resolveWizardRoute('proficiency', 'profile');
    if (!resolved) return;
    const params: Record<string, any> = {
      nav: JSON.stringify({ returnTo: resolved.routeBack, clearRouteBackHistory: resolved.clearRouteBackHistory, origin: resolved.routeBack }),
    };
    if (proficiencyId) params.proficiencyId = proficiencyId;
    router.replace({ pathname: resolved.routeTo as any, params } as any);
  }, [router]);

  const ensureSupportingStatement = useCallback(
    (slot: SupportingStatementSlot) => {
      if (!profile?.id) return null;
      const existing = supportingBySlot.get(slot);
      if (existing) return existing;
      const created = createSupportingStatement(profile.id, { slot });
      saveEntity(created);
      setTick((t) => t + 1);
      return created;
    },
    [profile?.id, supportingBySlot],
  );

  const updateSupportingStatement = useCallback(
    (statement: SupportingStatement, updates: Partial<SupportingStatement>) => {
      const next = touch({ ...statement, ...updates } as SupportingStatement);
      saveEntity(next);
      setTick((t) => t + 1);
      return next;
    },
    [],
  );

  const openSupportingWizard = useCallback((slot: SupportingStatementSlot) => {
    const statement = supportingBySlot.get(slot);
    const target = statement ?? ensureSupportingStatement(slot);
    if (!target) return;
    updateSupportingStatement(target, { mode: 'wizard' });
    const resolved = resolveWizardRoute('supportingStatement', 'profile');
    if (!resolved) {
      router.push({
        pathname: '/supporting/wizard',
        params: { statementId: target.id, slot },
      } as any);
      return;
    }
    const nav = {
      returnTo: resolved.routeBack,
      origin: resolved.routeBack,
      routeBack: resolved.routeBack,
      clearRouteBackHistory: resolved.clearRouteBackHistory,
    };
    router.replace({
      pathname: resolved.routeTo as any,
      params: { statementId: target.id, slot, nav: JSON.stringify(nav) },
    } as any);
  }, [supportingBySlot, ensureSupportingStatement, updateSupportingStatement, router]);

  const openSupportingWizardNew = useCallback((slot: SupportingStatementSlot) => {
    if (!profile?.id) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }
    const created = createSupportingStatement(profile.id, { slot, mode: 'wizard' });
    saveEntity(created);
    setTick((t) => t + 1);
    const resolved = resolveWizardRoute('supportingStatement', 'profile');
    if (!resolved) {
      router.push({
        pathname: '/supporting/wizard',
        params: { statementId: created.id, slot, new: '1' },
      } as any);
      return;
    }
    const nav = {
      returnTo: resolved.routeBack,
      origin: resolved.routeBack,
      routeBack: resolved.routeBack,
      clearRouteBackHistory: resolved.clearRouteBackHistory,
    };
    router.replace({
      pathname: resolved.routeTo as any,
      params: { statementId: created.id, slot, new: '1', nav: JSON.stringify(nav) },
    } as any);
  }, [profile?.id, router]);

  const clearSupportingStatement = useCallback(async (slot: SupportingStatementSlot) => {
    const statement = supportingBySlot.get(slot);
    if (!statement) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }
    const linkedDoc = statement.documentId
      ? getById<Document>(String(statement.documentId))
      : undefined;
    if (linkedDoc) {
      try {
        const paths = [linkedDoc.uri, linkedDoc.filePath, linkedDoc.thumbPath].filter(Boolean) as string[];
        for (const path of paths) {
          try {
            await deleteOwnedDocFile(path);
          } catch {
            // ignore delete errors
          }
        }
      } catch {
        // ignore delete errors
      }
      deleteEntity(linkedDoc.id);
    }
    deleteEntity(statement.id);
    setTick((t) => t + 1);
  }, [supportingBySlot]);

  const membershipDocLabelsById = useMemo(() => {
    const labelsByMembershipId = new Map<string, { documents: string[]; endorsements: string[] }>();
    const seenByMembershipId = new Map<string, { documents: Set<string>; endorsements: Set<string> }>();
    const documentOrder = new Map<string, number>([
      ['Membership proof', 0],
      ['Membership card', 1],
      ['Dedicated hunter', 2],
      ['Dedicated sport shooter', 3],
    ]);

    const docsById = new Map(documents.map((doc) => [String(doc.id), doc] as const));
    const firearmsById = new Map(firearms.map((firearm) => [String(firearm.id), firearm] as const));

    documents.forEach((doc) => {
      if (doc.parentType !== 'Membership' || !doc.parentId) return;
      const membershipId = String(doc.parentId);
      const kind = `${doc.kind ?? ''}`.toUpperCase();
      const isEndorsement = kind === 'FIREARM_ENDORSEMENT';
      let label: string | undefined;
      if (kind === 'ASSOCIATION_MEMBERSHIP') label = 'Membership card';
      else if (kind === 'ASSOCIATION_LETTER') label = 'Membership proof';
      else if (kind === 'DEDICATED_HUNTER_CERT') label = 'Dedicated hunter';
      else if (kind === 'DEDICATED_SPORT_CERT') label = 'Dedicated sport shooter';
      else if (kind === 'FIREARM_ENDORSEMENT') return;
      else label = doc.name || kind;
      if (!label) return;

      const seen = seenByMembershipId.get(membershipId) ?? {
        documents: new Set<string>(),
        endorsements: new Set<string>(),
      };
      const seenBucket = isEndorsement ? seen.endorsements : seen.documents;
      if (seenBucket.has(label)) return;
      seenBucket.add(label);
      seenByMembershipId.set(membershipId, seen);

      const existing = labelsByMembershipId.get(membershipId) ?? {
        documents: [],
        endorsements: [],
      };
      const target = isEndorsement ? existing.endorsements : existing.documents;
      target.push(label);
      if (!isEndorsement) {
        target.sort((a, b) => (documentOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (documentOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
      }
      labelsByMembershipId.set(membershipId, existing);
    });

    memberships.forEach((membership) => {
      const membershipId = String(membership.id);
      const existing = labelsByMembershipId.get(membershipId) ?? {
        documents: [],
        endorsements: [],
      };
      existing.endorsements = buildMembershipEndorsementLabels({
        membership,
        documentsById: docsById,
        firearmsById,
      });
      labelsByMembershipId.set(membershipId, existing);
    });

    return labelsByMembershipId;
  }, [documents, firearms, memberships]);

  const proficiencyDocLabelsById = useMemo(() => {
    const labelsByProficiencyId = new Map<
      string,
      { training: string[]; results: string[] }
    >();
    const docsByProficiencyId = new Map<string, Set<ProficiencyDocument>>();

    documents.forEach((doc) => {
      if (doc.parentType !== 'Proficiency' || !doc.parentId) return;
      const proficiencyId = String(doc.parentId);
      const kind = `${doc.kind ?? doc.requirementCode ?? ''}`.toUpperCase() as ProficiencyDocument;
      const existing = docsByProficiencyId.get(proficiencyId) ?? new Set<ProficiencyDocument>();
      existing.add(kind);
      docsByProficiencyId.set(proficiencyId, existing);
    });

    const resultsOrder: Array<{ kind: ProficiencyDocument; label: string }> = [
      { kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE', label: 'Knowledge of the Act' },
      { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1', label: 'Handle and use 1' },
      { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_2', label: 'Handle and use 2' },
      { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_3', label: 'Handle and use 3' },
      { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_4', label: 'Handle and use 4' },
    ];
    const categoryRank: Record<string, number> = {
      Handgun: 0,
      Rifle: 1,
      Shotgun: 2,
      HandMachineCarbine: 3,
    };

    proficiencies.forEach((proficiency) => {
      const proficiencyId = String(proficiency.id);
      const docKinds = docsByProficiencyId.get(proficiencyId) ?? new Set<ProficiencyDocument>();
      const trainingEntries = Array.isArray(proficiency.proficiencyCertificates)
        ? proficiency.proficiencyCertificates
        : [];
      const training = trainingEntries.length
        ? trainingEntries
            .flatMap((entry) =>
              (entry.categories ?? [])
                .slice()
                .sort((a, b) => (categoryRank[a] ?? 99) - (categoryRank[b] ?? 99))
                .map((category) => categoryLabel(category))
                .filter(Boolean)
            )
        : (proficiency.proficiencyDocumentIds ?? [])
            .filter((entry) =>
              entry.kind === 'PROFICIENCY_HANDGUN' ||
              entry.kind === 'PROFICIENCY_RIFLE' ||
              entry.kind === 'PROFICIENCY_SHOTGUN' ||
              entry.kind === 'PROFICIENCY_HANDMACHINECARBINE'
            )
            .map((entry) => {
              if (entry.kind === 'PROFICIENCY_HANDGUN') return 'Handgun';
              if (entry.kind === 'PROFICIENCY_RIFLE') return 'Rifle';
              if (entry.kind === 'PROFICIENCY_SHOTGUN') return 'Shotgun';
              return 'Hand Machine Carbine';
            })
            .filter(Boolean)
      ;
      const dedupedTraining = Array.from(new Set(training));
      const results = resultsOrder
        .filter(({ kind }) => docKinds.has(kind))
        .flatMap(({ kind, label }) => {
          if (!kind.startsWith('STATEMENT_OF_RESULTS_HANDLE_USE_')) return [label];
          const categories =
            (proficiency.proficiencyDocumentIds ?? [])
              .find((entry) => entry.kind === kind)
              ?.categories?.slice()
              ?.sort((a, b) => (categoryRank[a] ?? 99) - (categoryRank[b] ?? 99))
              ?.map((category) => categoryLabel(category))
              ?.filter(Boolean) ?? [];
          return categories.length ? categories : [label];
        });
      const dedupedResults = Array.from(new Set(results));
      const displayCategoryRank: Record<string, number> = {
        Handgun: 0,
        Rifle: 1,
        Shotgun: 2,
        'Hand Machine Carbine': 3,
      };
      const knowledgeLabel = 'Knowledge of the Act';
      const sortByDisplayCategoryOrder = (a: string, b: string) =>
        (displayCategoryRank[a] ?? 99) - (displayCategoryRank[b] ?? 99);
      dedupedTraining.sort(sortByDisplayCategoryOrder);
      const hasKnowledge = dedupedResults.includes(knowledgeLabel);
      const sortedResultCategories = dedupedResults
        .filter((value) => value !== knowledgeLabel)
        .sort(sortByDisplayCategoryOrder);
      const orderedResults = hasKnowledge
        ? [knowledgeLabel, ...sortedResultCategories]
        : sortedResultCategories;

      labelsByProficiencyId.set(proficiencyId, { training: dedupedTraining, results: orderedResults });
    });

    return labelsByProficiencyId;
  }, [documents, proficiencies]);

  const supportingCardConfigs: SupportingStatementCardConfig[] = [
    {
      slot: 'spouse_family',
      title: 'Spouse / Family',
    },
    {
      slot: 'friend_colleague_neighbour',
      title: 'Friend / Colleague / Neighbour',
    },
    {
      slot: 'additional_reference',
      title: 'Additional Reference',
    },
  ];

  const Row = ({
    label,
    value,
    onPress,
    labelColor,
    valueColor,
    disableValueTrimming = false,
    inline = false,
  }: {
    label: string;
    value?: string;
    onPress?: () => void;
    labelColor?: string;
    valueColor?: string;
    disableValueTrimming?: boolean;
    inline?: boolean;
  }) => (
    onPress ? (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, inline && styles.rowInline, pressed && { opacity: 0.85 }]}
      >
        <Text style={[styles.rowLabel, inline && styles.rowLabelInline, labelColor ? { color: labelColor } : null]}>{label}</Text>
        <Text
          style={[styles.rowValue, inline && styles.rowValueInline, !value && styles.muted, valueColor ? { color: valueColor } : null]}
          numberOfLines={disableValueTrimming ? undefined : inline ? 1 : 2}
        >
          {value || '—'}
        </Text>
      </Pressable>
    ) : (
      <View style={[styles.row, inline && styles.rowInline]}>
        <Text style={[styles.rowLabel, inline && styles.rowLabelInline, labelColor ? { color: labelColor } : null]}>{label}</Text>
        <Text
          style={[styles.rowValue, inline && styles.rowValueInline, !value && styles.muted, valueColor ? { color: valueColor } : null]}
          numberOfLines={disableValueTrimming ? undefined : inline ? 1 : 2}
        >
          {value || '—'}
        </Text>
      </View>
    )
  );

  const handleProfileCardPress = useCallback(() => {
    if (!profile) {
      const { id, createdAt, updatedAt, schemaVersion, version, ...profileSeed } = DEFAULT_PROFILE;
      const created = createProfile(profileSeed);
      saveEntity(created);
      ensureUserPrefs(created.id);
      ensureDevicePrefs(created.id);
      setTick(t => t + 1);
      router.push('/profile/edit' as any);
      return;
    }
    router.push('/profile/edit' as any);
  }, [profile, router]);

  const goEditSection = useCallback(
    (section: string | null) => {
      router.push({
        pathname: '/profile/edit',
        params: section ? { section } : undefined,
      } as any);
    },
    [router],
  );

  return (
    <Screen>
      <TabScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.h1}>Your Profile</Text>
        <View style={styles.headerRow}>
          <Pressable
            onPress={makeLayoutToggle(profileOpen, setProfileOpen, profileRotate, 'profile')}
            style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={styles.h2}>Your details</Text>
            <CollapseToggleChip
              expanded={profileOpen}
              onPress={makeLayoutToggle(profileOpen, setProfileOpen, profileRotate, 'profile')}
              showLabel={false}
              tone="purple"
              backgroundColor="transparent"
              borderColor={neutral.onSurface}
              textColor={neutral.onSurface}
              iconColor={neutral.onSurface}
              style={styles.sectionToggleChip}
            />
          </Pressable>
          {profileOpen ? (
            <IconRoundButton
              buttonType="edit"
              accessibilityLabel="Edit profile"
              onPress={() => router.push('/profile/edit' as any)}
              variant="solid"
              size="sm"
              hitSlop={8}
            />
          ) : null}

        </View>

        {profileOpen ? (
          <View style={styles.sectionBody}>
            <View
              onLayout={(e) => { profileTop.current = e.nativeEvent.layout.y; }}
              style={[styles.card, styles.profileCard, showBackground && styles.backgroundProfile]}
            >
              <Text style={styles.cardHint}>Tap a row to view &amp; edit</Text>
              <View style={styles.profileEditArea}>
                <Row label="Email:" value={profile?.email} onPress={() => goEditSection('contactInfo')} />
                <Row label="Cellphone:" value={cellphone} onPress={() => goEditSection('contactInfo')} inline />
                <Row label="Home phone:" value={home} onPress={() => goEditSection('contactInfo')} inline />
                <Row label="Work phone:" value={work} onPress={() => goEditSection('contactInfo')} inline />
                {hasEmploymentInfo ? (
                  <>
                    <View style={styles.profileDivider} />
                    <Row
                      label="Employment:"
                      value={[employmentTrade, employmentEmployer].filter(Boolean).join(' • ') || undefined}
                      onPress={() => goEditSection('employment')}
                      disableValueTrimming
                    />
                    {employmentSelfEmployed ? (
                      <Row
                        label="Self-employed:"
                        value={employmentSelfEmployed}
                        onPress={() => goEditSection('employment')}
                        disableValueTrimming
                      />
                    ) : null}
                    {employmentAddress ? (
                      <Row
                        label="Business address:"
                        value={employmentAddress}
                        onPress={() => goEditSection('employment')}
                        disableValueTrimming
                      />
                    ) : null}
                  </>
                ) : null}
                {hasPartnerInfo ? (
                  <View style={styles.profileDivider} />
                ) : null}
                {hasPartnerInfo ? (
                  <Row
                    label={partnerTitleLabel}
                    value={[partnerFullName, partnerIdBracketValue].filter(Boolean).join('\n')}
                    onPress={() => goEditSection('partnerDetails')}
                    disableValueTrimming
                  />
                ) : null}
                {/* <Text style={styles.cardHint}>Tap to view &amp; edit</Text> */}
              </View>

              <Pressable
                onPress={handleAddId}
                accessibilityRole="button"
                style={({ pressed }) => [styles.idMiniCard, pressed && { opacity: 0.94 }]}
              >
                <View style={styles.idMiniHeader}>
                  <Text style={styles.idLabel}>Proof of ID</Text>
                  <IconButtonGroup spacing={8} style={styles.idButtons}>
                    {!hasIdDocs ? (
                      <IconRoundButton
                        buttonType="add"
                        accessibilityLabel="Add ID photos"
                        onPress={handleAddId}
                        size="sm"
                        hitSlop={8}
                      />
                    ) : null}
                    {hasIdDocs ? (
                      <FloatingIconRoundButton
                        buttonType="preview"
                        accessibilityLabel="Preview ID photos"
                        onPress={openIdPreview}
                        size="sm"
                        hitSlop={8}
                      />
                    ) : null}
                    {hasIdDocs ? (
                      <FloatingIconRoundButton
                        buttonType="delete"
                        accessibilityLabel="Delete ID photos"
                        onPress={handleDeleteProfileIds}
                        size="sm"
                        hitSlop={8}
                      />
                    ) : null}
                  </IconButtonGroup>
                </View>
                <View style={styles.idMiniDivider} />
                <View style={styles.idMiniDetails}>
                  <Row
                    label="Name (Initials)"
                    value={[fullName, profile?.initials ? `(${profile.initials})` : null].filter(Boolean).join(' ') || undefined}
                    onPress={handleAddId}
                  />
                  <Row label={idTypeLabel || 'ID'} value={formattedIdNumber} onPress={handleAddId} />
                </View>
                {/* <Text style={styles.cardHint}>Tap to view &amp; edit</Text> */}
              </Pressable>

              <Pressable
                onPress={handleAddAddress}
                accessibilityRole="button"
                style={({ pressed }) => [styles.idMiniCard, pressed && { opacity: 0.94 }]}
              >
                <View style={styles.idMiniHeader}>
                  <Text style={styles.idLabel}>Proof of Address</Text>
                  <IconButtonGroup spacing={8} style={styles.idButtons}>
                    {!hasAddressDocs ? (
                      <IconRoundButton
                        buttonType="add"
                        accessibilityLabel="Add address proof"
                        onPress={handleAddAddress}
                        size="sm"
                        hitSlop={8}
                      />
                    ) : null}
                    {hasAddressDocs ? (
                      <FloatingIconRoundButton
                        buttonType="preview"
                        accessibilityLabel="Preview address proof"
                        onPress={openAddressPreview}
                        size="sm"
                        hitSlop={8}
                      />
                    ) : null}
                    {hasAddressDocs ? (
                      <FloatingIconRoundButton
                        buttonType="delete"
                        accessibilityLabel="Delete address proof"
                        onPress={handleDeleteAddress}
                        size="sm"
                        hitSlop={8}
                      />
                    ) : null}
                  </IconButtonGroup>
                </View>
                <View style={styles.idMiniDivider} />
                <View style={styles.idMiniDetails}>
                  <Row
                    label="Residential address"
                    value={addressPair || undefined}
                    onPress={handleAddAddress}
                    disableValueTrimming
                  />
                  {residenceType ? (
                    <Row
                      label="Residence type"
                      value={residenceType}
                      onPress={handleAddAddress}
                      disableValueTrimming
                    />
                  ) : null}
                  {homeSecurity ? (
                    <Row
                      label="Home security"
                      value={homeSecurity}
                      onPress={handleAddAddress}
                      disableValueTrimming
                    />
                  ) : null}
                  <Row
                    label="Postal address"
                    value={postalPair || undefined}
                    onPress={handleAddAddress}
                    disableValueTrimming
                  />
                </View>
                {/* <Text style={styles.cardHint}>Tap to view &amp; edit</Text> */}
              </Pressable>
            </View>

          </View>
          
        ) : null}

        <Pressable
          onPress={() => (profileOpen ? router.push('/profile/edit' as any) : openProfileSection())}
          style={({ pressed }) => [
            styles.secAddBtn,
            !profileOpen && styles.secAddBtnCollapsed,
            pressed && (profileOpen ? styles.secAddBtnPressed : styles.secAddBtnCollapsedPressed),
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.secAddBtnTxt, !profileOpen && styles.secAddBtnTxtCollapsed]}>
            {profileOpen ? 'Edit profile' : 'Expand profile'}
          </Text>
          
        </Pressable>

        {/* --- Your competency certificates --- */}
        <View
          style={styles.sectionSpacing}
          onLayout={(e) => { competencyTop.current = e.nativeEvent.layout.y; }}
        >
          <View style={styles.sectionDivider} />
          <View style={styles.headerRow}>
            <Pressable
              onPress={makeLayoutToggle(competencyOpen, setCompetencyOpen, compRotate, 'competency')}
              style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.h2}>Competencies ({certificates.length})</Text>
              <CollapseToggleChip
                expanded={competencyOpen}
                onPress={makeLayoutToggle(competencyOpen, setCompetencyOpen, compRotate, 'competency')}
                showLabel={false}
                tone="purple"
                backgroundColor="transparent"
                borderColor={neutral.onSurface}
                textColor={neutral.onSurface}
                iconColor={neutral.onSurface}
                style={styles.sectionToggleChip}
              />
            </Pressable>
            {competencyOpen ? (
                <IconRoundButton
                  buttonType="add"
                  accessibilityLabel="Add competency certificate"
                  onPress={() => {
                    void (async () => {
                      if (await guardDemoReset('competency certificate')) return;
                      router.push({
                        pathname: '/competency/wizard',
                        params: {
                          returnTo: encodeURIComponent('/(tabs)/profile?scroll=competency'),
                          completeReturnTo: encodeURIComponent('/(tabs)/profile?scroll=competency'),
                        },
                      } as any);
                    })();
                  }}
                  variant="solid"
                  size="sm"
                  hitSlop={8}
              />
            ) : null}
          </View>

          {competencyOpen ? (
            <View style={styles.sectionBody}>
              <Text style={styles.emptyNote}>
                If you receive a new/replacement competency certificate it is better to add it as a new competency. You can delete the old one or keep it for your records.
              </Text>
              {certificates.length === 0 ? (
                <Text style={styles.emptyNote}>
                  No competency certificates captured yet.
                </Text>
              ) : (
                <View style={styles.cardList}>
                  {certificates.map((c) => {
                    const certType = formatCertificateType(c);
                    const expiresLabel = c.expiresAt;
                    const reminderExpiryDate = getCompetencyReminderExpiryDate(
                      c,
                      competencyExpiryPreference,
                    );
                    const reminderVisual = terminalCompetencyIds.has(String(c.id))
                      ? { label: 'Renewal application created', color: 'green' as const, daysUntil: getDaysUntil(reminderExpiryDate) ?? 0 }
                      : getCompetencyReminderVisualState(c, competencyExpiryPreference);
                    const reminderTone =
                      reminderVisual?.color === 'red'
                        ? tones.red
                        : reminderVisual?.color === 'orange'
                          ? tones.orange
                          : reminderVisual?.color === 'green'
                            ? tones.green
                            : reminderVisual?.color === 'info'
                              ? tones.blue
                          : null;
                    const compCalcDaysUntilExpiry = getDaysUntil(c.expiresAtCompCertCalc);
                    const compCalcLabel =
                      compCalcDaysUntilExpiry !== null
                        ? compCalcDaysUntilExpiry <= 0
                          ? 'Cert issue date expiry (expired)'
                          : `Cert issue date expiry (${compCalcDaysUntilExpiry} days)`
                        : 'Cert issue date expiry';
                    const compCalcValue = c.expiresAtCompCertCalc
                      ? [c.issuedAt, c.expiresAtCompCertCalc].filter(Boolean).join(' - ')
                      : '-';
                    const firearmCalcDaysUntilExpiry = getDaysUntil(c.expiresAtFirearmCalc);
                    const firearmCalcLabel =
                      firearmCalcDaysUntilExpiry !== null
                        ? firearmCalcDaysUntilExpiry <= 0
                          ? 'Firearm-based expiry (expired)'
                          : `Firearm-based expiry (${firearmCalcDaysUntilExpiry} days)`
                        : 'Firearm-based expiry';
                    const firearmCalcValue = c.expiresAtFirearmCalc
                      ? [c.issuedAt, c.expiresAtFirearmCalc].filter(Boolean).join(' - ')
                      : 'No firearms in Vault';
                    const reminderTextColor = reminderTone?.base;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => handleCompetencyCardPress(c)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.fCard,
                          { borderColor: tones.teal.border },
                          pressed && { opacity: 0.94 },
                          showBackground && styles.backgroundCompetency,
                          reminderTone && {
                            backgroundColor: reminderTone.surface,
                            borderColor: reminderTone.border,
                          },
                        ]}
                      >
                        {reminderVisual ? (
                          <View style={[styles.expiredPill, { backgroundColor: reminderTone?.base }]}>
                            <Text style={styles.expiredPillText}>{reminderVisual.label}</Text>
                          </View>
                        ) : null}
                        <Row label="Competency to:" value={certType} labelColor={reminderTextColor} valueColor={reminderTextColor} />
                        <Row
                          label="Categories"
                          value={
                            Array.isArray(c.categories) && c.categories.length
                              ? c.categories.map(categoryLabel).filter(Boolean).join(', ')
                              : undefined
                          }
                          labelColor={reminderTextColor}
                          valueColor={reminderTextColor}
                        />
                        <Row label="Certificate no." value={c.certificateNumber} labelColor={reminderTextColor} valueColor={reminderTextColor} />
                        {/* Temporarily replaced legacy validity row; keep data available for potential re-introduction. */}
                        <Row label="Issued on" value={c.issuedAt} labelColor={reminderTextColor} valueColor={reminderTextColor} />
                        <Row label={compCalcLabel} value={compCalcValue} labelColor={reminderTextColor} valueColor={reminderTextColor} />
                        <Row label={firearmCalcLabel} value={firearmCalcValue} labelColor={reminderTextColor} valueColor={reminderTextColor} />

                        <IconButtonGroup spacing={8} style={styles.cardActions}>
                          <FloatingIconRoundButton
                            buttonType="help"
                            accessibilityLabel="Help for competency certificate expiry calculations"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              openHelp('helpDocsCompCert');
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                          <FloatingIconRoundButton
                            buttonType="preview"
                            accessibilityLabel="Edit competency certificate photo"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              openCompetencyPreview(String(c.id));
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                          <FloatingIconRoundButton
                            buttonType="delete"
                            accessibilityLabel="Delete certificate"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              void confirmDeleteCert(c.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                        </IconButtonGroup>
                        <Text style={[styles.cardHint, reminderTextColor ? { color: reminderTextColor } : null]}>Tap to view &amp; edit</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              if (!competencyOpen) {
                openCompetencySection();
                return;
              }
              void (async () => {
                if (await guardDemoReset('competency certificate')) return;
                router.push({
                  pathname: '/competency/wizard',
                  params: {
                    returnTo: encodeURIComponent('/(tabs)/profile?scroll=competency'),
                    completeReturnTo: encodeURIComponent('/(tabs)/profile?scroll=competency'),
                  },
                } as any);
              })();
            }}
            style={({ pressed }) => [
              styles.secAddBtn,
              !competencyOpen && styles.secAddBtnCollapsed,
              pressed && (competencyOpen ? styles.secAddBtnPressed : styles.secAddBtnCollapsedPressed),
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.secAddBtnTxt, !competencyOpen && styles.secAddBtnTxtCollapsed]}>
              {competencyOpen ? 'Add competency cert' : 'Expand competency certs'}
            </Text>
          </Pressable>
        </View>

        {/* --- Association memberships --- */}
        <View
          style={styles.sectionSpacing}
          onLayout={(e) => { membershipsTop.current = e.nativeEvent.layout.y; }}
        >
          <View style={styles.sectionDivider} />
          <View style={styles.headerRow}>
            <Pressable
              onPress={makeLayoutToggle(membershipsOpen, setMembershipsOpen, membershipsRotate, 'memberships')}
              style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.h2}>Memberships ({memberships.length})</Text>
              <CollapseToggleChip
                expanded={membershipsOpen}
                onPress={makeLayoutToggle(membershipsOpen, setMembershipsOpen, membershipsRotate, 'memberships')}
                showLabel={false}
                tone="purple"
                backgroundColor="transparent"
                borderColor={neutral.onSurface}
                textColor={neutral.onSurface}
                iconColor={neutral.onSurface}
                style={styles.sectionToggleChip}
              />
            </Pressable>
            {membershipsOpen ? (
              <IconRoundButton
                buttonType="add"
                accessibilityLabel="Add membership"
                onPress={() => openMembershipWizard()}
                variant="solid"
                size="sm"
                hitSlop={8}
              />
            ) : null}
          </View>

          {membershipsOpen ? (
            <View style={styles.sectionBody}>
              {memberships.length === 0 ? (
                <Text style={styles.emptyNote}>No memberships captured yet.</Text>
              ) : (
                <View style={styles.cardList}>
                  {memberships.map((membership) => {
                    const membershipHealth = getMembershipHealth(membership);
                    const hasMembershipIssue = membershipHealth.status === 'warning';
                    const docLabels = membershipDocLabelsById.get(membership.id) ?? {
                      documents: [],
                      endorsements: [],
                    };
                    const reminderVisual = getReminderVisualState('membership', membership.membershipExpiresAt);
                    const reminderTone =
                      reminderVisual?.color === 'red'
                        ? tones.red
                        : reminderVisual?.color === 'orange'
                          ? tones.orange
                          : reminderVisual?.color === 'green'
                            ? tones.green
                            : reminderVisual?.color === 'info'
                              ? tones.blue
                              : null;
                    const reminderTextColor = reminderTone?.base;
                    const issueTone = hasMembershipIssue ? tones.orange : null;
                    const cardTone = issueTone ?? reminderTone;
                    const metaTextColor = issueTone?.base ?? reminderTextColor;
                    const hintText = membershipHealth.ctaText;
                    return (
                      <Pressable
                        key={membership.id}
                        onPress={() => openMembershipWizard(membership.id)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.fCard,
                          styles.membershipCard,
                          showBackground && styles.backgroundMembership,
                          cardTone && {
                            backgroundColor: cardTone.surface,
                            borderColor: cardTone.border,
                          },
                          pressed && { opacity: 0.94 },
                        ]}
                      >
                        {reminderVisual ? (
                          <View style={[styles.expiredPill, { backgroundColor: reminderTone?.base }]}>
                            <Text style={styles.expiredPillText}>{reminderVisual.label}</Text>
                          </View>
                        ) : null}
                        <Row
                          label="Association name"
                          value={membership.associationName || 'Unnamed association'}
                          labelColor={metaTextColor}
                          valueColor={metaTextColor}
                        />
                        <Row
                          label="Documents"
                          value={docLabels.documents.length ? docLabels.documents.join(', ') : 'None yet'}
                          disableValueTrimming
                          labelColor={metaTextColor}
                          valueColor={metaTextColor}
                        />
                        <Row
                          label="Endorsements"
                          value={docLabels.endorsements.length ? docLabels.endorsements.join(', ') : 'None'}
                          disableValueTrimming
                          labelColor={metaTextColor}
                          valueColor={metaTextColor}
                        />
                        <IconButtonGroup spacing={8} style={styles.cardActions}>
                          <FloatingIconRoundButton
                            buttonType="preview"
                            accessibilityLabel="Edit membership"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              openMembershipWizard(membership.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                          <FloatingIconRoundButton
                            buttonType="delete"
                            accessibilityLabel="Delete membership"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              confirmDeleteMembership(membership.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                        </IconButtonGroup>
                        <Text
                          style={[
                            styles.cardHint,
                            metaTextColor ? { color: metaTextColor } : null,
                          ]}
                        >
                          {hintText}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          <Pressable
            onPress={() => membershipsOpen ? openMembershipWizard() : openMembershipsSection()}
            style={({ pressed }) => [
              styles.secAddBtn,
              !membershipsOpen && styles.secAddBtnCollapsed,
              pressed && (membershipsOpen ? styles.secAddBtnPressed : styles.secAddBtnCollapsedPressed),
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.secAddBtnTxt, !membershipsOpen && styles.secAddBtnTxtCollapsed]}>
              {membershipsOpen ? 'Add membership' : 'Expand memberships'}
            </Text>
          </Pressable>
        </View>

        {/* --- Proficiencies --- */}
        <View
          style={styles.sectionSpacing}
          onLayout={(e) => { proficienciesTop.current = e.nativeEvent.layout.y; }}
        >
          <View style={styles.sectionDivider} />
          <View style={styles.headerRow}>
            <Pressable
              onPress={makeLayoutToggle(proficienciesOpen, setProficienciesOpen, proficienciesRotate, 'proficiencies')}
              style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.h2}>Proficiencies ({proficiencies.length})</Text>
              <CollapseToggleChip
                expanded={proficienciesOpen}
                onPress={makeLayoutToggle(proficienciesOpen, setProficienciesOpen, proficienciesRotate, 'proficiencies')}
                showLabel={false}
                tone="purple"
                backgroundColor="transparent"
                borderColor={neutral.onSurface}
                textColor={neutral.onSurface}
                iconColor={neutral.onSurface}
                style={styles.sectionToggleChip}
              />
            </Pressable>
            {proficienciesOpen ? (
              <IconRoundButton
                buttonType="add"
                accessibilityLabel="Add proficiency"
                onPress={() => openProficiencyWizard()}
                variant="solid"
                size="sm"
                hitSlop={8}
              />
            ) : null}
          </View>

          {proficienciesOpen ? (
            <View style={styles.sectionBody}>
              <Text style={styles.sectionNote}>
                Create a separate proficiency entry for each training provider that issued your
                proficiency documents.
              </Text>
              {proficiencies.length === 0 ? (
                <Text style={styles.emptyNote}>
                  No proficiencies captured yet. Add one entry per training provider.
                </Text>
              ) : (
                <View style={styles.cardList}>
                  {proficiencies.map((proficiency) => {
                    const docLabels = proficiencyDocLabelsById.get(proficiency.id) ?? {
                      training: [],
                      results: [],
                    };
                    return (
                      <Pressable
                        key={proficiency.id}
                        onPress={() => openProficiencyWizard(proficiency.id)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.fCard,
                          styles.membershipCard,
                          showBackground && styles.backgroundMembership,
                          pressed && { opacity: 0.94 },
                        ]}
                      >
                        <Row label="Training provider" value={proficiency.trainingProviderName || 'Unnamed provider'} />
                        <Row
                          label="Training certificates/proficiencies"
                          value={docLabels.training.length ? docLabels.training.join(', ') : 'None yet'}
                          disableValueTrimming
                        />
                        <Row
                          label="Statement of Results"
                          value={docLabels.results.length ? docLabels.results.join(', ') : 'None yet'}
                          disableValueTrimming
                        />
                        <IconButtonGroup spacing={8} style={styles.cardActions}>
                          <FloatingIconRoundButton
                            buttonType="preview"
                            accessibilityLabel="Edit proficiency"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              openProficiencyWizard(proficiency.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                          <FloatingIconRoundButton
                            buttonType="delete"
                            accessibilityLabel="Delete proficiency"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              confirmDeleteProficiency(proficiency.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                        </IconButtonGroup>
                        <Text style={styles.cardHint}>Tap to view &amp; edit</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          <Pressable
            onPress={() => proficienciesOpen ? openProficiencyWizard() : openProficienciesSection()}
            style={({ pressed }) => [
              styles.secAddBtn,
              !proficienciesOpen && styles.secAddBtnCollapsed,
              pressed && (proficienciesOpen ? styles.secAddBtnPressed : styles.secAddBtnCollapsedPressed),
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.secAddBtnTxt, !proficienciesOpen && styles.secAddBtnTxtCollapsed]}>
              {proficienciesOpen ? 'Add proficiency provider' : 'Expand proficiencies'}
            </Text>
          </Pressable>
        </View>

        {!appConfig.features.hideSupportingStatements ? (
          <View
            style={styles.sectionSpacing}
            onLayout={(e) => { supportingTop.current = e.nativeEvent.layout.y; }}
          >
          <View style={styles.sectionDivider} />
          <View style={styles.headerRow}>
            <Pressable
              onPress={makeLayoutToggle(supportingOpen, setSupportingOpen, supportingRotate, 'supporting')}
              style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.h2}>Character references</Text>
              <CollapseToggleChip
                expanded={supportingOpen}
                onPress={makeLayoutToggle(supportingOpen, setSupportingOpen, supportingRotate, 'supporting')}
                showLabel={false}
                tone="purple"
                backgroundColor="transparent"
                borderColor={neutral.onSurface}
                textColor={neutral.onSurface}
                iconColor={neutral.onSurface}
                style={styles.sectionToggleChip}
              />
            </Pressable>
          </View>

            {supportingOpen ? (
              <View style={styles.sectionBody}>
                {userPrefs?.applicationIntent === 'new' ? (
                  <>
                    <Text style={styles.emptyNote}>
                      For a new competency application you are required to provide 2 contacts in addition to your spouse (if married).
                    </Text>
                    <Text style={styles.emptyNote}>
                      Adding character references using our wizard will automatically populate the interview contact details for your new competency application.
                    </Text>
                    <Text style={styles.emptyNote}>
                      You are welcome to use your own character references if you already have them.
                    </Text>
                  </>
                ) : userPrefs?.applicationIntent === 'renewal' ? (
                  <>
                    <Text style={styles.emptyNote}>
                      Check with your DFO as they might require 3 character references for applications.
                    </Text>
                    <Text style={styles.emptyNote}>
                      You are welcome to use our character reference wizard to add these or use your own.
                    </Text>
                  </>
                ) : null}
                <Text></Text>
                
                <SupportingStatementCards
                cards={supportingCardConfigs}
                statementsBySlot={supportingBySlot}
                onOpenWizard={openSupportingWizard}
                onOpenNew={openSupportingWizardNew}
                onClear={clearSupportingStatement}
              />
            </View>
          ) : null}

          {!supportingOpen ? (
            <Pressable
              onPress={openSupportingSection}
              style={({ pressed }) => [
                styles.secAddBtn,
                styles.secAddBtnCollapsed,
                pressed && styles.secAddBtnCollapsedPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.secAddBtnTxt, styles.secAddBtnTxtCollapsed]}>
                Expand character references
              </Text>
            </Pressable>
          ) : null}
          </View>
        ) : null}

        <WelcomeModal
          visible={introVisible}
          onClose={() => setIntroVisible(false)}
          checklist={checklistStatus}
          mode={welcomeMode}
          applicationIntent={userPrefs?.applicationIntent}
          applicationType={userPrefs?.applicationType}
          welcomeFlow={userPrefs?.welcomeFlow}
        />
        <HelpModal {...helpModalProps} />
      </TabScrollView>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    content: { gap: TAB_SPACING },

    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, marginBottom: TAB_SPACING },

    backgroundProfile: { backgroundColor: tones.teal.surface },
    backgroundCompetency: { backgroundColor: tones.teal.surface },
    backgroundMembership: { backgroundColor: tones.teal.surface },
    expiredCard: { backgroundColor: tones.red.surface, borderColor: tones.red.border },

    card: {
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: neutral.border,
      padding: 16,
      gap: 8,
      shadowColor: 'rgba(0,0,0,0.2)',
      shadowOpacity: 0.03,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 1 },
    },
    profileCard: {
      borderColor: tones.teal.border,
      borderWidth: 2,
    },
    membershipCard: {
      borderColor: tones.teal.border,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: tones.teal.base, marginBottom: 4 },
    cardHint: { marginTop: 0, marginBottom: 4, color: tones.purple.base, fontSize: 12 },
    cardHintExpired: { color: tones.red.base },
    expiredPill: {
      width: '100%',
      backgroundColor: tones.red.base,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    expiredPillText: {
      color: neutral.onBase,
      fontWeight: '700',
      textAlign: 'center',
    },

    row: { marginTop: 2 },
    rowInline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    rowLabel: { color: neutral.base, fontWeight: '700', marginBottom: 2 },
    rowLabelInline: { marginBottom: 0, flexShrink: 1 },
    rowValue: { color: neutral.onSurface, fontWeight: '600' },
    rowValueInline: { flexShrink: 1, textAlign: 'left' },
    profileDivider: { height: 1, backgroundColor: neutral.border, marginVertical: 6 },
    muted: { color: neutral.border, fontWeight: '500' },
    idActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      borderRadius: 12,
    },
    idMiniCard: {
      borderWidth: 2,
      borderColor: tones.teal.border,
      backgroundColor: neutral.onBase,
      borderRadius: 12,
      padding: 10,
      gap: 8,
    },
    idMiniHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    idMiniDivider: {
      height: 1,
      backgroundColor: neutral.border,
      opacity: 0.6,
      marginTop: 4,
      marginBottom: 4,
    },
    idMiniDetails: { gap: 6 },
    profileEditArea: { gap: 6 },
    idLabel: { color: neutral.onSurface, fontWeight: '700', fontSize: 14 },
    idButtons: { flex: 1, justifyContent: 'flex-end' },

    h2: { fontSize: 18, fontWeight: '800', color: neutral.onSurface, marginBottom: 0 },
    headerToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionToggleChip: { marginLeft: 2 },
    groupTitle: { color: neutral.base, fontWeight: '800', marginBottom: 6 },
    emptyNote: { color: neutral.base, marginBottom: 8, lineHeight: 20 },
    sectionNote: { color: neutral.base, marginBottom: 8, lineHeight: 20 },

    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
    sectionSpacing: { marginTop: TAB_SPACING + 8, gap: TAB_SPACING },
    sectionDivider: {
      height: 2,
      backgroundColor: neutral.border,
      marginHorizontal: 2,
      marginBottom: 2,
    },

    fCard: {
      position: 'relative',
      borderRadius: 14,
      borderWidth: 2,
      padding: 14,
      paddingBottom: 16,
      marginBottom: 0,
      gap: 6,
    },

    secAddBtn: {
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.base,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secAddBtnPressed: {
      backgroundColor: tones.teal.emphasis,
    },
    secAddBtnTxt: { color: tones.teal.onBase, fontWeight: '800' },
    secAddBtnCollapsed: {
      borderColor: tones.grey.base,
      backgroundColor: tones.grey.base,
    },
    secAddBtnCollapsedPressed: {
      backgroundColor: tones.grey.emphasis,
    },
    secAddBtnTxtCollapsed: { color: tones.grey.onBase },

    cardList: { gap: 12, marginBottom: 2 },
    sectionBody: { marginBottom: 6 },

    cardActions: { marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap', alignSelf: 'flex-end' },
    // --- modal styles ---
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxHeight: '85%',
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: neutral.border,
      padding: 16,
      gap: 12,
    },
    modalTitle: { fontSize: 16, fontWeight: '800', color: neutral.onSurface },
    modalBody: { flexGrow: 1, paddingVertical: 8, width: '100%' },
    previewImage: { width: '100%', height: 300, borderRadius: 8, backgroundColor: neutral.surface },
    previewScroll: { maxHeight: 360, width: '100%' },
    previewScrollContent: { gap: 16, paddingVertical: 4 },
    previewItem: { gap: 8, alignItems: 'center' },
    previewItemTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface, textAlign: 'center' },
    previewSpinner: { marginVertical: 24 },
    previewError: { color: tones.red.onSurface, textAlign: 'center', marginVertical: 12 },
    previewHint: { fontSize: 12, color: neutral.base, textAlign: 'center' },
    modalActions: { marginTop: 12, alignItems: 'center', gap: 12 },
    modalActionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
    modalActionItem: { alignItems: 'center', gap: 8 },
    modalActionLabel: { fontSize: 12, fontWeight: '600' },
  });
