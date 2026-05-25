import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, StyleSheet, View } from 'react-native';
import Screen from '../../src/components/Screen';
import TabScrollView from '../../src/components/TabScrollView';
import { useTones } from '../../src/theme/tones';
import { TAB_SPACING } from '../../src/theme/spacing';
import { deleteEntity, getFirstProfile, listByType, saveEntity } from '../../src/data/sqlite';
import {
  Application,
  CompetencyCertificate,
  CompetencyExpiryReminderPreference,
  Document,
  Firearm,
  Membership,
  Proficiency,
  Reminders,
  Safe,
  UserPrefs,
} from '../../src/data/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Button from '../../src/components/Button';
import WelcomeModal, { WelcomeChecklistStatus, WelcomeMode } from '../../src/components/WelcomeModal';
import { ensureUserPrefs, ensureDevicePrefs, saveUserPrefs, saveDevicePrefs } from '../../src/data/repo';
import { createDevicePrefs, createProfile, createReminder, createUserPrefs } from '../../src/data/defaults';
import { getMissingProfileFields } from '../../src/utils/profileValidation';
import { REMINDER_CONFIG, ReminderConfig, ReminderCode } from '../../src/config/reminders';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import { getDaysUntil, pickTriggeredReminder } from '../../src/utils/reminderVisuals';
import { categoryLabel } from '../../src/utils/categoryLabel';
import { formatFirearmTitle } from '../../src/utils/firearmDisplay';
import {
  getCompetencyCertificateIdsInTerminalApplications,
  getFirearmIdsInTerminalApplications,
} from '../../src/utils/applicationUsage';
import { getCompetencyReminderExpiryDate } from '../../src/utils/competencyExpiry';
import { prepareReminderRenewalDocuments } from '../../src/utils/reminderRenewalDocuments';
import {
  buildReminderCompletedListRoute,
  prepareReminderCompletedApplication,
} from '../../src/utils/reminderCompletedApplication';
import {
  resolveActiveReminderApplications,
  type ReminderRenewalItemType,
} from '../../src/utils/reminderApplicationResolution';
import { isDemoDatasetActive } from '../../src/demo/demoState';

const normalizeSection = (raw?: string | null) => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^section\s*/i, '').trim();
  return withoutPrefix || trimmed;
};

const hasSection16Firearm = (firearms: Firearm[]) =>
  firearms.some(
    (firearm) =>
      normalizeSection(
        firearm.section ?? (firearm as any).licenceSection ?? (firearm as any).licenseSection ?? ''
      ) === '16'
  );

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

const reminderConfigs = Object.values(REMINDER_CONFIG);
const competencyConfigs = reminderConfigs.filter((config) => config.code.startsWith('CompCert'));
const firearmConfigs = reminderConfigs.filter((config) => config.code.startsWith('Firearm'));

const buildCompetencyDetail = (certificate: CompetencyCertificate) => {
  const certificateNumber = certificate.certificateNumber?.trim() || 'Unknown certificate';
  const categories = (certificate.categories ?? []).map(categoryLabel).filter(Boolean).join(', ') || '-';
  return `${certificateNumber} (${categories})`;
};

const formatExpirySummary = (label: string, value?: string | null) =>
  `${label}: ${value?.trim() || 'Not available'}`;

const buildFirearmDetail = (firearm: Firearm) => {
  return formatFirearmTitle(firearm);
};

type ReminderCard = {
  key: string;
  itemId: string;
  reminderCode: ReminderCode;
  config: ReminderConfig;
  detail: string;
  inProgressNote?: string;
  expiryDate: string;
  route: '/(tabs)/profile' | '/(tabs)/firearms';
  scrollTarget: 'competency' | 'firearms';
  daysUntilExpiry: number | null;
  overrideColor?: ReminderConfig['color'] | 'info';
  overrideName?: string;
  overrideText?: string;
  overrideText2?: string | null;
};

const reminderItemTypeForCard = (card: ReminderCard): ReminderRenewalItemType | null => {
  if (card.reminderCode.startsWith('CompCert')) return 'competency';
  if (card.reminderCode.startsWith('Firearm')) return 'firearm';
  return null;
};

export default function ApplicationsHome() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const statusToneMap = useMemo(
    () => ({
      info: tones.blue,
      green: tones.green,
      orange: tones.orange,
      red: tones.red,
      neutral: tones.grey,
    }),
    [tones.blue, tones.green, tones.orange, tones.red, tones.grey]
  );
  const { intro } = useLocalSearchParams<{ intro?: string | string[] }>();
  const showIntroFromParam = useMemo(() => {
    const value = Array.isArray(intro) ? intro[0] : intro;
    return value === '1' || value === 'true';
  }, [intro]);
  const [draftsCount, setDraftsCount] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [profileValidated, setProfileValidated] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [checklistStatus, setChecklistStatus] = useState<WelcomeChecklistStatus>({});
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [reminderCards, setReminderCards] = useState<ReminderCard[]>([]);
  const isChecklistComplete = useCallback(
    (status: WelcomeChecklistStatus, intent?: UserPrefs['applicationIntent'], type?: UserPrefs['applicationType']) => {
      const newBaseComplete =
        !!status.profileComplete &&
        !!status.hasIdProof &&
        !!status.hasAddressProof;
      if (intent === 'new') {
        if (type === 'competency') {
          return newBaseComplete && !!status.hasProficiency;
        }
        if (type === 'firearm') {
          return false;
        }
        return newBaseComplete;
      }
      const renewalCompetencyOnly = intent === 'renewal' && type === 'competency';
      const renewalBaseComplete =
        !!status.profileComplete &&
        !!status.hasIdProof &&
        !!status.hasAddressProof &&
        !!status.hasCompetency;
      if (renewalCompetencyOnly) {
        return renewalBaseComplete;
      }
      const baseComplete =
        renewalBaseComplete &&
        !!status.hasFirearm &&
        !!status.hasSafe;
      if (status.requiresMembership) {
        return baseComplete && !!status.hasMembership;
      }
      return baseComplete;
    },
    []
  );

  const refreshCounts = useCallback(() => {
    void (async () => {
      const active = await isDemoDatasetActive();
      setDemoModeActive(active);
    })();
    const apps = listByType<Application>('Application');
    setDraftsCount(apps.filter(a => a.status === 'draft').length);
    setReadyCount(apps.filter(a => a.status === 'ready').length);
    setSubmittedCount(apps.filter(a => a.status === 'submitted').length);
    setArchivedCount(apps.filter(a => a.status === 'archived').length);

    const firstProfile = getFirstProfile();
    let profile = firstProfile;
    let activePrefs: UserPrefs | null = null;
    if (!profile) {
      profile = createProfile();
      saveEntity(profile);
      const prefs = createUserPrefs(profile.id);
      const devicePrefs = createDevicePrefs({ holderProfileId: profile.id });
      saveUserPrefs(prefs);
      saveDevicePrefs(devicePrefs);
      setUserPrefs(prefs);
      activePrefs = prefs;
    } else {
      const prefs = ensureUserPrefs(profile.id);
      ensureDevicePrefs(profile.id);
      setUserPrefs(prefs);
      activePrefs = prefs;
    }
    const missingProfileFields = getMissingProfileFields(profile);
    const profileComplete = missingProfileFields.length === 0;
    setProfileValidated(profileComplete);

    const competency = listByType<CompetencyCertificate>('CompetencyCertificate').filter(
      cert => cert.holderProfileId === profile.id
    );
    const firearms = listByType<Firearm>('Firearm').filter(
      firearm => firearm.holderProfileId === profile.id
    );
    const safes = listByType<Safe>('Safe');
    const documents = listByType<Document>('Document');
    const memberships = listByType<Membership>('Membership');
    const proficiencies = listByType<Proficiency>('Proficiency').filter(
      (proficiency) => proficiency.holderProfileId === profile.id
    );
      const remindRenewal = activePrefs?.remindRenewal;
      const competencyExpiryPreference =
        (activePrefs?.dfoCompetencyExpiryUsing ?? 'unknown') as CompetencyExpiryReminderPreference;
      const remindersResetRequestedAt = activePrefs?.remindersResetRequestedAt;
      const competencyRemindersResetRequestedAt = activePrefs?.competencyRemindersResetRequestedAt;
      if (remindRenewal === true && remindersResetRequestedAt) {
        const remindersAll = listByType<Reminders>('Reminders');
        remindersAll
        .filter(reminder => reminder.holderProfileId === profile.id)
        .forEach(reminder => {
          deleteEntity(reminder.id);
        });
      setReminderCards([]);
        const nextPrefs = {
          ...activePrefs,
          remindersResetRequestedAt: undefined,
        } as UserPrefs;
        saveUserPrefs(nextPrefs);
        setUserPrefs(nextPrefs);
        activePrefs = nextPrefs;
      }

      if (remindRenewal === true && competencyRemindersResetRequestedAt) {
        const remindersAll = listByType<Reminders>('Reminders');
        remindersAll
          .filter(
            reminder =>
              reminder.holderProfileId === profile.id &&
              String(reminder.reminderCode ?? '').startsWith('CompCert'),
          )
          .forEach(reminder => {
            deleteEntity(reminder.id);
          });
        const nextPrefs = {
          ...activePrefs,
          competencyRemindersResetRequestedAt: undefined,
        } as UserPrefs;
        saveUserPrefs(nextPrefs);
        setUserPrefs(nextPrefs);
        activePrefs = nextPrefs;
      }

    if (remindRenewal === false) {
      setReminderCards([]);
    } else {
      const remindersAll = listByType<Reminders>('Reminders');
      const reminders = remindersAll.filter(reminder => reminder.holderProfileId === profile.id);
      const validItemIds = new Set<string>([
        ...competency.map(cert => cert.id).filter(Boolean),
        ...firearms.map(firearm => firearm.id).filter(Boolean),
      ]);
      const expiryByItemId = new Map<string, string>();
      competency.forEach((cert) => {
        if (!cert.id) return;
        expiryByItemId.set(
          String(cert.id),
          getCompetencyReminderExpiryDate(cert, competencyExpiryPreference) ?? '',
        );
      });
      firearms.forEach((firearm) => {
        if (!firearm.id) return;
        expiryByItemId.set(String(firearm.id), firearm.validTo?.trim() ?? '');
      });
      reminders
        .filter(reminder => reminder.itemId && !validItemIds.has(reminder.itemId))
        .forEach(reminder => {
          deleteEntity(reminder.id);
        });
      reminders
        .filter((reminder) => {
          if (!reminder.itemId) return false;
          const currentExpiryValue = expiryByItemId.get(String(reminder.itemId));
          if (currentExpiryValue == null) return false;
          return (reminder.expiryValue ?? '') !== currentExpiryValue;
        })
        .forEach((reminder) => {
          deleteEntity(reminder.id);
        });
      const cleanedReminders = reminders.filter((reminder) => {
        if (!reminder.itemId) return true;
        if (!validItemIds.has(reminder.itemId)) return false;
        const currentExpiryValue = expiryByItemId.get(String(reminder.itemId));
        if (currentExpiryValue == null) return false;
        return (reminder.expiryValue ?? '') === currentExpiryValue;
      });

      const reminderByItemId = new Map<string, Reminders[]>();
      cleanedReminders.forEach(reminder => {
        if (!reminder.itemId) return;
        const existing = reminderByItemId.get(reminder.itemId) ?? [];
        existing.push(reminder);
        reminderByItemId.set(reminder.itemId, existing);
      });

      const nextCards: ReminderCard[] = [];
      const submittedCompetencyIds = getCompetencyCertificateIdsInTerminalApplications('517g');
      const submittedFirearmIds = getFirearmIdsInTerminalApplications('518a');

      const buildCard = (
        itemId: string,
        config: ReminderConfig,
        detail: string,
        daysUntil: number,
        expiryDate: string,
        overrides?: Pick<ReminderCard, 'overrideColor' | 'overrideName' | 'overrideText' | 'overrideText2'>,
      ) => {
        const key = `${itemId}:${config.code}`;
        const suppressedItems = reminderByItemId.get(itemId) ?? [];
        const suppressedCodes = new Set(
          suppressedItems.filter(item => item.showReminder === false).map(item => item.reminderCode)
        );
        const suppressedDays = suppressedItems
          .filter(item => item.showReminder === false)
          .map(item => REMINDER_CONFIG[item.reminderCode]?.daysToExpiry)
          .filter(
            (value): value is ReminderConfig['daysToExpiry'] => typeof value === 'number'
          );
        const minSuppressedDays = suppressedDays.length ? Math.min(...suppressedDays) : null;

        if (suppressedCodes.has(config.code)) return;
        if (minSuppressedDays !== null && config.daysToExpiry > minSuppressedDays) return;
        if (daysUntil > config.daysToExpiry) return;
        const itemType = config.code.startsWith('CompCert') ? 'competency' : 'firearm';
        const activeApplications = resolveActiveReminderApplications(itemType, itemId);
        const inProgressNote =
          activeApplications.kind === 'none' ? '(TAP TO RENEW)' : '(DRAFT IN PROGRESS: TAP TO VIEW)';

        nextCards.push({
          key,
          itemId,
          reminderCode: config.code,
          config,
          detail,
          inProgressNote,
          expiryDate,
          route: config.code.startsWith('CompCert') ? '/(tabs)/profile' : '/(tabs)/firearms',
          scrollTarget: config.code.startsWith('CompCert') ? 'competency' : 'firearms',
          daysUntilExpiry: Number.isFinite(daysUntil) ? daysUntil : null,
          ...(overrides ?? {}),
        });
      };

      competency.forEach(cert => {
        if (cert.id && submittedCompetencyIds.has(String(cert.id))) return;
        const compCalcDate = cert.expiresAtCompCertCalc?.trim() || '';
        const firearmCalcDate = cert.expiresAtFirearmCalc?.trim() || '';
        const reminderExpiryDate = getCompetencyReminderExpiryDate(cert, competencyExpiryPreference);
        const daysUntil = getDaysUntil(reminderExpiryDate);
        const config = pickTriggeredReminder(daysUntil, competencyConfigs);
        if (!config || !cert.id) return;

        const compDaysUntil = getDaysUntil(compCalcDate);
        const firearmDaysUntil = getDaysUntil(firearmCalcDate);
        const compConfig = pickTriggeredReminder(compDaysUntil, competencyConfigs);
        const firearmConfig = pickTriggeredReminder(firearmDaysUntil, competencyConfigs);
        const hasConflictingCalcOutcomes =
          !!compCalcDate &&
          !!firearmCalcDate &&
          (compConfig?.code ?? null) !== (firearmConfig?.code ?? null);

        if (competencyExpiryPreference === 'unknown' && hasConflictingCalcOutcomes) {
          buildCard(
            cert.id,
            config,
            buildCompetencyDetail(cert),
            daysUntil ?? config.daysToExpiry,
            reminderExpiryDate?.trim() ?? '',
            {
              overrideColor: 'info',
              overrideName: 'Warning: Competency certificate expiry may differ',
              overrideText:
                'Your competency certificate may need renewal depending on how your DFO calculates validity.',
              overrideText2: [
                formatExpirySummary('Cert issue date expiry', compCalcDate),
                formatExpirySummary('Firearm-based expiry', firearmCalcDate),
              ].join('\n'),
            },
          );
          return;
        }

        buildCard(
          cert.id,
          config,
          buildCompetencyDetail(cert),
          daysUntil ?? config.daysToExpiry,
          reminderExpiryDate?.trim() ?? ''
        );
      });

      firearms.forEach(firearm => {
        if (firearm.id && submittedFirearmIds.has(String(firearm.id))) return;
        const daysUntil = getDaysUntil(firearm.validTo);
        const config = pickTriggeredReminder(daysUntil, firearmConfigs);
        if (!config || !firearm.id) return;
        buildCard(
          firearm.id,
          config,
          buildFirearmDetail(firearm),
          daysUntil ?? config.daysToExpiry,
          firearm.validTo?.trim() ?? ''
        );
      });

      nextCards.sort((a, b) => a.config.daysToExpiry - b.config.daysToExpiry);
      setReminderCards(nextCards);
    }

    const hasIdProofDocs = documents.some(doc =>
      doc.kind === 'ID_CARD' || doc.kind === 'ID_BOOK' || doc.kind === 'PASSPORT'
    );
    const hasIdProfileFields =
      !!profile?.givenNames?.trim() &&
      !!profile?.surname?.trim() &&
      !!profile?.initials?.trim();
    const hasIdProof = hasIdProofDocs && hasIdProfileFields;
    const hasAddressProofDocs = documents.some(doc => doc.kind === 'PROOF_OF_ADDRESS');
    const hasAddressProfileFields =
      !!profile?.address?.line1?.trim() &&
      (!!profile?.address?.suburb?.trim() || !!profile?.address?.city?.trim()) &&
      !!profile?.address?.postCode?.trim();
    const hasAddressProof = hasAddressProofDocs && hasAddressProfileFields;
    const profileMemberships = profile?.id
      ? memberships.filter(m => !m.holderProfileId || m.holderProfileId === profile.id)
      : memberships;
    const hasSection16 = hasSection16Firearm(firearms);

    const nextChecklistStatus: WelcomeChecklistStatus = {
      profileComplete,
      debugProfile: {
        id: profile?.id,
        email: profile?.email,
        mobile: profile?.mobile,
      },
      hasIdProof,
      hasAddressProof,
      hasCompetency: competency.length > 0,
      hasProficiency: proficiencies.length > 0,
      hasFirearm: firearms.length > 0,
      hasSafe: safes.length > 0,
      hasMembership: profileMemberships.length > 0,
      requiresMembership: hasSection16,
    };
    setChecklistStatus(nextChecklistStatus);
  }, []);

  // 🔁 Recalculate whenever this screen becomes focused (e.g., after creating a draft)
  useFocusEffect(
    useCallback(() => {
      refreshCounts();
    }, [refreshCounts])
  );

  useEffect(() => {
    if (showIntroFromParam) {
      setWelcomeVisible(true);
    }
  }, [showIntroFromParam]);

  useEffect(() => {
    if (!welcomeVisible) return;
    refreshCounts();
  }, [refreshCounts, welcomeVisible]);
  useEffect(() => {
    if (userPrefs?.isFirstLoad) {
      setWelcomeVisible(true);
    }
  }, [userPrefs?.isFirstLoad]);

  const goToChooser = () => {
    router.push('/new-application' as any); // cast is fine until route types refresh
  };
  const goToProfileTab = () => {
    router.push('/(tabs)/profile' as any);
  };
  const goToGetStarted = () => {
    setWelcomeVisible(true);
  };
  const checklistComplete = isChecklistComplete(
    checklistStatus,
    userPrefs?.applicationIntent,
    userPrefs?.applicationType,
  );
  const welcomeMode: WelcomeMode = useMemo(() => {
    if (demoModeActive) return 'demo';
    if (userPrefs?.applicationIntent === 'new') return 'new';
    if (userPrefs?.applicationIntent === 'renewal') return 'renewal';
    return 'unknown';
  }, [demoModeActive, userPrefs?.applicationIntent]);
  const handleWelcomeClose = () => {
    setWelcomeVisible(false);
    if (!userPrefs) return;
    if (userPrefs.isFirstLoad) {
      const next = { ...userPrefs, isFirstLoad: false } as UserPrefs;
      saveUserPrefs(next);
      setUserPrefs(next);
    }
  };
  const handleDismissReminder = useCallback(
    (card: ReminderCard) => {
      if (!userPrefs?.holderProfileId) return;
      const reminders = listByType<Reminders>('Reminders');
      const existing = reminders.find(
        reminder =>
          reminder.holderProfileId === userPrefs.holderProfileId &&
          reminder.itemId === card.itemId &&
          reminder.reminderCode === card.reminderCode
      );
      const timestamp = new Date().toISOString();
      if (existing) {
        saveEntity({
          ...existing,
          showReminder: false,
          expiryValue: card.expiryDate,
          updatedAt: timestamp,
          version: (existing.version ?? 1) + 1,
        });
      } else {
        const created = createReminder(userPrefs.holderProfileId, card.reminderCode, {
          showReminder: false,
          expiryValue: card.expiryDate,
        });
        saveEntity({ ...created, itemId: card.itemId });
      }
      setReminderCards(prev => prev.filter(item => item.key !== card.key));
    },
    [userPrefs]
  );

  const handleOpenReminderRenewal = useCallback(
    (card: ReminderCard) => {
      const itemType = reminderItemTypeForCard(card);
      if (!itemType) {
        router.push({
          pathname: card.route as any,
          params: { scroll: card.scrollTarget },
        } as any);
        return;
      }

      const noun = itemType === 'competency' ? 'competency certificate' : 'firearm licence';
      const activeResolution = resolveActiveReminderApplications(itemType, card.itemId);
      const promptTitle =
        activeResolution.kind === 'none'
          ? 'Renew item'
          : 'Renewal in progress';
      const promptMessage =
        activeResolution.kind === 'none'
          ? `Do you want to start a renewal application for this ${noun}?`
          : activeResolution.kind === 'single'
            ? `A renewal application for this ${noun} is already in progress. Do you want to open it?`
            : `More than one renewal application for this ${noun} is already in progress. Do you want to choose one to open?`;
      const confirmLabel =
        activeResolution.kind === 'none'
          ? 'Start renewal'
          : activeResolution.kind === 'single'
            ? 'Open renewal'
            : 'Choose renewal';
      Alert.alert(
        promptTitle,
        promptMessage,
        [
          { text: 'No', style: 'cancel' },
          {
            text: confirmLabel,
            onPress: () => {
              try {
                const result = prepareReminderRenewalDocuments(itemType, card.itemId, '/(tabs)');
                if (result.kind === 'multiple') {
                  const hasReady = result.applications.some((app) => app.status === 'ready');
                  const hasDraft = result.applications.some((app) => app.status === 'draft');
                  const listNav = encodeURIComponent(JSON.stringify({
                    returnTo: '/(tabs)',
                    routeBack: '/(tabs)',
                    origin: '/(tabs)',
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
            },
          },
        ],
      );
    },
    [router]
  );
  return (
    <Screen>
      <TabScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Home</Text>

        {reminderCards.map(card => {
          const tone = statusToneMap[card.overrideColor ?? card.config.color] ?? tones.blue;
          const daysToExpiryValue =
            card.daysUntilExpiry !== null ? String(card.daysUntilExpiry) : null;
          const reminderTextTemplate = card.overrideText ?? card.config.text;
          const reminderText = reminderTextTemplate
            ? reminderTextTemplate.replace('{daysToExpiry}', daysToExpiryValue ?? '')
            : '';
          const submitDays = (() => {
            if (!card.expiryDate) return null;
            const expiryDate = parseIsoDate(card.expiryDate);
            if (!expiryDate) return null;
            const now = new Date();
            const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
            const daysUntilExpiry = Math.floor((expiryDate.getTime() - todayUtc) / MS_PER_DAY);
            return daysUntilExpiry - card.config.submitDaysBeforeExpiry;
          })();
          const reminderText2 = card.overrideText2 !== undefined
            ? card.overrideText2
            : card.config.text2 &&
                submitDays !== null &&
                Number.isFinite(submitDays) &&
                submitDays > 0
              ? card.config.text2.replace('{daysToSubmitApplication}', String(submitDays))
              : null;
          const isExpiredReminder =
            card.reminderCode === 'CompCertExp' || card.reminderCode === 'FirearmExp';
          return (
            <Pressable
              key={card.key}
              onPress={() => handleOpenReminderRenewal(card)}
              style={({ pressed }) => [
                styles.reminderCard,
                {
                  backgroundColor: pressed ? tone.border : tone.surface,
                  borderColor: pressed ? tone.emphasis : tone.border,
                },
              ]}
            >
              <View style={styles.reminderHeader}>
                <Text style={[styles.reminderTitle, { color: tone.onSurface }]}>
                  {card.overrideName ?? card.config.name}
                </Text>
                <IconRoundButton
                  size="sm"
                  buttonType="close"
                  backgroundColor={tone.base}
                  pressedBackgroundColor={tone.emphasis}
                  iconColor={tone.onBase}
                  accessibilityLabel="Dismiss reminder"
                  onPress={() => handleDismissReminder(card)}
                  />
              </View>
              {card.inProgressNote ? (
                <Text style={[styles.reminderProgressNote, { color: tone.onSurface }]}>
                  {card.inProgressNote}
                </Text>
              ) : null}
              <Text style={[styles.reminderDetail, { color: tone.onSurface }]}>{card.detail}</Text>
              {reminderText ? (
                <Text style={[styles.reminderText, { color: tone.onSurface }]}>
                  {reminderText}
                  {!card.overrideText && card.expiryDate
                    ? isExpiredReminder
                      ? ` ${card.expiryDate}.`
                      : ` (on ${card.expiryDate}).`
                    : ''}
                </Text>
              ) : null}
              {reminderText2 ? (
                <Text style={[styles.reminderText, styles.reminderTextEmphasis, { color: tone.onSurface }]}>
                  {reminderText2}
                  {card.expiryDate && !card.config.text ? ` ${card.expiryDate}` : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        <Button
          label="Get started"
          sublabel="Capture the basics to prepare your first application"
          onPress={goToGetStarted}
          tone={checklistComplete ? 'grey' : 'green'}
        />

        <Button
          label="Create application"
          sublabel="Create an application"
          onPress={goToChooser}
          tone="blue"
          disabled={!profileValidated}
        />

        <Button
          label="Draft applications"
          sublabel={draftsCount ? `${draftsCount} in progress` : 'None yet'}
          onPress={() => router.push('/application/existing' as any)}
          tone="teal"
          disabled={draftsCount === 0}
        />

        <Button
          label="Ready for submission"
          sublabel={readyCount ? `${readyCount} ready` : 'None yet'}
          onPress={() => router.push('/application/ready' as any)}
          tone="teal"
          disabled={readyCount === 0}
        />

        <Button
          label="Completed applications"
          sublabel={submittedCount ? `${submittedCount} submitted` : 'None yet'}
          onPress={() => router.push('/application/submitted' as any)}
          tone="green"
          disabled={submittedCount === 0}
        />

        <Button
          label="Archived applications"
          sublabel={archivedCount ? `${archivedCount} archived` : 'None yet'}
          onPress={() => router.push('/application/archive' as any)}
          tone="orange"
          disabled={archivedCount === 0}
        />
      </TabScrollView>
      <WelcomeModal
        visible={welcomeVisible}
        onClose={handleWelcomeClose}
        checklist={checklistStatus}
        mode={welcomeMode}
        applicationIntent={userPrefs?.applicationIntent}
        applicationType={userPrefs?.applicationType}
        welcomeFlow={userPrefs?.welcomeFlow}
        isFirstLoad={userPrefs?.isFirstLoad === true || !userPrefs?.welcomeFlow}
        onWelcomeFlowChange={(flow) => {
          if (!userPrefs || userPrefs.welcomeFlow === flow) return;
          const next = { ...userPrefs, welcomeFlow: flow } as UserPrefs;
          saveUserPrefs(next);
          setUserPrefs(next);
        }}
      />
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    content: { gap: TAB_SPACING },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, marginBottom: TAB_SPACING },
    reminderCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      gap: 8,
    },
    reminderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reminderTitle: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 12 },
    reminderProgressNote: { fontSize: 14, fontWeight: '700' },
    reminderDetail: { fontSize: 13, fontWeight: '600' },
    reminderText: { fontSize: 13, lineHeight: 18 },
    reminderTextEmphasis: { fontWeight: '700' },
  });
