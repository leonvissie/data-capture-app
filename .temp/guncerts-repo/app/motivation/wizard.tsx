import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import HelpModal from '../../src/components/HelpModal';
import { SelectSheet } from '../../src/components/EditSheet';
import { persist, touch } from '../../src/data/repo';
import { createMotivation } from '../../src/data/defaults';
import WizardField from '../../src/components/wizard/WizardField';
import WizardOptionButton, { WizardOptionWrap } from '../../src/components/wizard/WizardOptionButton';
import WizardSelectField from '../../src/components/wizard/WizardSelectField';
import WizardSection from '../../src/components/wizard/WizardSection';
import WizardStepProgress from '../../src/components/wizard/WizardStepProgress';
import WizardFooterNav from '../../src/components/wizard/WizardFooterNav';
import WizardValidationHint from '../../src/components/wizard/WizardValidationHint';
import { useWizardSteps } from '../../src/components/wizard/useWizardSteps';
import { useHelpModal } from '../../src/help';
import { formatFirearmTitle } from '../../src/utils/firearmDisplay';
import { resolveApplicantSex } from '../../src/utils/saIdentity';
import { getById, listByType } from '../../src/data/sqlite';
import { appConfig } from '../../src/config/appConfig';
import { resolveCalibreCatalogRecord } from '../../src/config/motivation/factBank';
import { useDevMode } from '../../src/providers/DevModeProvider';
import type {
  Application,
  CompetencyCertificate,
  CompetencyCategory,
  Firearm,
  FirearmAction,
  Membership,
  MotivationDistanceBand,
  MotivationExistingFirearmComparisonEntry,
  MotivationFirearmAttributeTag,
  MotivationFirearmLimitationTag,
  MotivationHuntingTerrainTag,
  MotivationNeedReasonTag,
  MotivationProfile,
  Motivation,
  MotivationRiskExposureTag,
  MotivationSportDisciplineTag,
  Profile,
  ResidenceHomeType,
  ResidenceSecurityMeasure,
  Safe,
} from '../../src/data/types';
import { composeMotivation } from '../../src/config/motivation/composer';
import { resolveEvidenceFromApplication } from '../../src/config/motivation/evidenceResolver';
import { evaluateMotivationAgainstBenchmark } from '../../src/config/motivation/benchmarkRubric';
import {
  buildApplicationMotivationMirrorPatch,
  ensureMotivationForApplication,
  ensureMotivationForHolderAndFirearm,
  updateMotivation,
} from '../../src/utils/motivationStore';
import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionType,
} from '../../src/config/motivation/sentenceBank.types';
import { useTones } from '../../src/theme/tones';
import {
  describeFirearm,
  DISTANCE_OPTIONS,
  FIREARM_ATTRIBUTE_OPTIONS,
  HUNTING_TERRAIN_OPTIONS,
  LIMITATION_TAG_OPTIONS,
  PURPOSE_TYPE_LABELS,
  RISK_EXPOSURE_OPTIONS,
  SPORT_DISCIPLINE_OPTIONS,
  toComparisonLabel,
} from '../../src/features/motivation/devWizardFixtures';

type StepId = 'setup' | 'firearm' | 'comparison' | 'activity' | 'preview';

type DraftTargetFirearm = {
  firearmId?: string;
  make: string;
  model: string;
  calibre: string;
  firearmType: CompetencyCategory;
  firearmAction: FirearmAction;
  firearmSerialNumber: string;
};

type ComparisonDraftEntry = {
  comparisonRole?: MotivationExistingFirearmComparisonEntry['comparisonRole'];
  limitationTags: MotivationFirearmLimitationTag[];
  note: string;
};

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'firearm', label: 'Firearm' },
  { id: 'comparison', label: 'Other firearms' },
  { id: 'activity', label: 'Use & needs' },
  { id: 'preview', label: 'Preview' },
];

const PURPOSE_OPTIONS_BY_SECTION: Record<
  MotivationSectionType,
  MotivationPurposeType[]
> = {
  s13: ['self_defence'],
  s15: ['hunting', 'sport_shooting', 'mixed_hunting_sport'],
  s16: ['hunting', 'sport_shooting', 'mixed_hunting_sport'],
};

const COMPARISON_ROLE_OPTIONS: Array<{
  value: NonNullable<MotivationExistingFirearmComparisonEntry['comparisonRole']>;
  label: string;
}> = [
  { value: 'same_role', label: 'Same role' },
  { value: 'partial_overlap', label: 'Similar role' },
  { value: 'different_role', label: 'Different role' },
];

const SIGHTING_OPTIONS: Array<{
  value: NonNullable<NonNullable<MotivationProfile['firearmFitProfile']>['sightingSystem']>;
  label: string;
}> = [
  { value: 'iron_sights', label: 'Iron sights' },
  { value: 'scope', label: 'Scope' },
  { value: 'red_dot', label: 'Red dot' },
  { value: 'mixed', label: 'Mixed' },
];

const NEED_REASON_OPTIONS: Array<{
  value: MotivationNeedReasonTag;
  label: string;
}> = [
  { value: 'personal_protection', label: 'Personal protection' },
  { value: 'dedicated_hunting', label: 'For hunting' },
  { value: 'dedicated_sport', label: 'For sport shooting' },
  { value: 'training_continuity', label: 'Training continuity' },
  { value: 'ethical_hunting', label: 'Ethical hunting' },
  { value: 'platform_fit', label: 'Platform fit' },
  { value: 'existing_firearm_gap', label: 'Existing firearm gap' },
];

const NEED_REASON_OPTIONS_BY_PURPOSE: Record<MotivationPurposeType, MotivationNeedReasonTag[]> = {
  self_defence: ['personal_protection'],
  hunting: ['dedicated_hunting', 'ethical_hunting', 'platform_fit', 'existing_firearm_gap'],
  sport_shooting: ['dedicated_sport', 'training_continuity', 'platform_fit', 'existing_firearm_gap'],
  mixed_hunting_sport: [
    'dedicated_hunting',
    'dedicated_sport',
    'training_continuity',
    'ethical_hunting',
    'platform_fit',
    'existing_firearm_gap',
  ],
};

const DEFAULT_NEED_REASON_TAGS_BY_PURPOSE: Record<MotivationPurposeType, MotivationNeedReasonTag[]> = {
  self_defence: ['personal_protection'],
  hunting: ['dedicated_hunting'],
  sport_shooting: ['dedicated_sport'],
  mixed_hunting_sport: ['dedicated_hunting', 'dedicated_sport'],
};

const YEARLY_ACTIVITY_COUNT_OPTIONS = [
  { value: 1, label: 'Once' },
  { value: 2, label: 'Twice' },
  { value: 3, label: 'Multiple' },
] as const;

const DEFAULT_TARGET_FIREARM: DraftTargetFirearm = {
  firearmId: undefined,
  make: '',
  model: '',
  calibre: '',
  firearmType: 'Handgun',
  firearmAction: 'Semi-automatic',
  firearmSerialNumber: '',
};

const PROVINCE_OPTIONS = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

const HOME_TYPE_OPTIONS: ResidenceHomeType[] = [
  'House',
  'Flat / Apartment',
  'Townhouse / Duplex',
  'Cluster / Estate unit',
  'Farm / Smallholding dwelling',
  'Room / Shared accommodation',
  'Other',
];

const SECURITY_MEASURE_OPTIONS: ResidenceSecurityMeasure[] = [
  'None',
  'Monitored alarm',
  'Armed response',
  'Perimeter wall',
  'Security fencing',
  'Electric fencing',
  'Security gates',
  'Burglar bars',
  'CCTV / cameras',
  'Outdoor beams / sensors',
  'Guard dog',
  'Estate / complex access control',
  'On-site security / guards',
];

const createEmptyProfile = (): MotivationProfile => ({
  version: 1,
  applicantContext: {},
  needProfile: { reasonTags: [] },
  existingComparison: { comparisonEntries: [] },
  huntingProfile: { terrainTags: [] },
  sportProfile: { disciplineTags: [] },
  selfDefenceProfile: { exposureTags: [] },
  firearmFitProfile: { attributeTags: [] },
  supportProfile: {},
});

function getProfileName(profile: Profile | null): string {
  return [profile?.givenNames, profile?.surname].filter(Boolean).join(' ').trim();
}

function getProfileInitials(profile: Profile | null): string {
  return `${profile?.initials ?? ''}`.trim();
}

function buildInitialWizardState() {
  const profiles = listByType<Profile>('Profile');
  const memberships = listByType<Membership>('Membership');
  const safes = listByType<Safe>('Safe');
  const profile = profiles[0] ?? null;

  return {
    profile,
    memberships,
    safes,
    applicationType: 'renewal' as MotivationApplicationType,
    sectionType: 's16' as MotivationSectionType,
    purposeType: 'sport_shooting' as MotivationPurposeType,
    targetFirearm: { ...DEFAULT_TARGET_FIREARM },
    motivationProfile: {
      ...createEmptyProfile(),
      applicantContext: {
        occupation: `${profile?.occupation ?? ''}`.trim(),
        residenceProvince: profile?.address?.province ?? '',
      },
      supportProfile: {
        selectedSafeIds: safes.map((safe) => String(safe.id)),
      },
    } satisfies MotivationProfile,
  };
}

function cloneProfile(profile: Profile): Profile {
  return {
    ...profile,
    address: profile.address ? { ...profile.address } : undefined,
    addressPostal: profile.addressPostal ? { ...profile.addressPostal } : undefined,
    references: Array.isArray(profile.references) ? [...profile.references] : undefined,
  };
}

function normalizeTargetFirearmFromRecord(firearm: Firearm | null): DraftTargetFirearm {
  if (!firearm) return { ...DEFAULT_TARGET_FIREARM };
  return {
    firearmId: String(firearm.id),
    make: firearm.make ?? '',
    model: firearm.model ?? '',
    calibre: firearm.calibre ?? '',
    firearmType: firearm.firearmType ?? 'Handgun',
    firearmAction: firearm.firearmAction ?? 'Semi-automatic',
    firearmSerialNumber: firearm.firearmSerialNumber ?? '',
  };
}

function buildEvidenceKeys(
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

function getAvailablePurposeOptions(sectionType: MotivationSectionType): MotivationPurposeType[] {
  return PURPOSE_OPTIONS_BY_SECTION[sectionType];
}

function getMembershipDrivenPurposeOptions(
  sectionType: MotivationSectionType,
  memberships: Membership[]
): MotivationPurposeType[] {
  const defaultOptions = getAvailablePurposeOptions(sectionType);
  if (sectionType !== 's16' || !memberships.length) return defaultOptions;

  const hasDedicatedHunting = memberships.some((membership) =>
    (membership.membershipDocumentIds ?? []).some((document) => document.kind === 'DEDICATED_HUNTER_CERT')
  );
  const hasDedicatedSport = memberships.some((membership) =>
    (membership.membershipDocumentIds ?? []).some((document) => document.kind === 'DEDICATED_SPORT_CERT')
  );

  if (hasDedicatedHunting && hasDedicatedSport) {
    return defaultOptions;
  }
  if (hasDedicatedHunting) {
    return defaultOptions.filter((option) => option === 'hunting');
  }
  if (hasDedicatedSport) {
    return defaultOptions.filter((option) => option === 'sport_shooting');
  }
  return defaultOptions;
}

function inferSectionTypeFromFirearmSection(value?: string | null): MotivationSectionType | null {
  const normalized = `${value ?? ''}`.toLowerCase();
  if (normalized.includes('13')) return 's13';
  if (normalized.includes('15')) return 's15';
  if (normalized.includes('16')) return 's16';
  return null;
}

function formatFirearmWizardSubtitle(firearm: Firearm): string {
  const action = `${firearm.firearmAction ?? ''}`.trim();
  const calibre = `${firearm.calibre ?? ''}`.trim();
  if (action && calibre) return `${action} (${calibre})`;
  if (action) return action;
  if (calibre) return `Calibre ${calibre}`;
  return '';
}

function formatFirearmWizardTertiary(firearm: Firearm): string {
  const section = `${firearm.section ?? ''}`.trim();
  return section ? section : 'Section not recorded';
}

function getApplicationSetupHelpKey(sectionType: MotivationSectionType): string {
  switch (sectionType) {
    case 's13':
      return 'helpMotivationSetupApplicationS13';
    case 's15':
      return 'helpMotivationSetupApplicationS15';
    case 's16':
      return 'helpMotivationSetupApplicationS16';
  }
}

function getExistingFirearmsHelpKey(sectionType: MotivationSectionType): string {
  switch (sectionType) {
    case 's13':
      return 'helpMotivationExistingFirearmsS13';
    case 's15':
      return 'helpMotivationExistingFirearmsS15';
    case 's16':
      return 'helpMotivationExistingFirearmsS16';
  }
}

function getNeedsHelpKey(purposeType: MotivationPurposeType): string {
  switch (purposeType) {
    case 'self_defence':
      return 'helpMotivationNeedsSelfDefence';
    case 'hunting':
      return 'helpMotivationNeedsHunting';
    case 'sport_shooting':
      return 'helpMotivationNeedsSport';
    case 'mixed_hunting_sport':
      return 'helpMotivationNeedsMixed';
  }
}

function getHuntingActivityHelpKey(sectionType: MotivationSectionType): string {
  return sectionType === 's16'
    ? 'helpMotivationHuntingActivityS16'
    : 'helpMotivationHuntingActivityS15';
}

function getSportActivityHelpKey(sectionType: MotivationSectionType): string {
  return sectionType === 's16'
    ? 'helpMotivationSportActivityS16'
    : 'helpMotivationSportActivityS15';
}

function getFirearmFitHelpKey(sectionType: MotivationSectionType): string {
  return sectionType === 's13' ? 'helpMotivationFirearmFitS13' : 'helpMotivationFirearmFit';
}

function getYearlyActivityCountSelection(value?: number): number | undefined {
  if (!value || value <= 0) return undefined;
  if (value === 1) return 1;
  if (value === 2) return 2;
  return 3;
}

function clampNumber(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function normalizeYearInput(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, 4);
}

function normalizeStoredYear(value: unknown): string {
  const normalized = normalizeYearInput(`${value ?? ''}`.trim());
  return normalized.length === 4 ? normalized : '';
}

function parseIdListParam(raw?: string | string[] | null): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = `${value ?? ''}`.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export default function MotivationWizardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    applicationId?: string | string[];
    firearmId?: string | string[];
    returnTo?: string | string[];
    selectedMembershipIds?: string | string[];
    selectedSafeIds?: string | string[];
  }>();
  const tones = useTones();
  const { devModeEnabled } = useDevMode();
  const { open: openHelp, props: helpModalProps } = useHelpModal();
  const scrollRef = useRef<ScrollViewType | null>(null);
  const initial = useMemo(() => buildInitialWizardState(), []);
  const firearms = useMemo(() => listByType<Firearm>('Firearm'), []);
  const sortedFirearms = useMemo(
    () =>
      firearms
        .slice()
        .sort((a, b) => {
          const sectionA = String(a.section ?? '').trim().toLowerCase();
          const sectionB = String(b.section ?? '').trim().toLowerCase();
          if (sectionA !== sectionB) return sectionA.localeCompare(sectionB);
          const typeA = String(a.firearmType ?? '').trim().toLowerCase();
          const typeB = String(b.firearmType ?? '').trim().toLowerCase();
          if (typeA !== typeB) return typeA.localeCompare(typeB);
          const makeA = String(a.make ?? '').trim().toLowerCase();
          const makeB = String(b.make ?? '').trim().toLowerCase();
          if (makeA !== makeB) return makeA.localeCompare(makeB);
          const modelA = String(a.model ?? '').trim().toLowerCase();
          const modelB = String(b.model ?? '').trim().toLowerCase();
          if (modelA !== modelB) return modelA.localeCompare(modelB);
          const serialA = String(a.firearmSerialNumber ?? '').trim().toLowerCase();
          const serialB = String(b.firearmSerialNumber ?? '').trim().toLowerCase();
          return serialA.localeCompare(serialB);
        }),
    [firearms]
  );
  const routeFirearmId = useMemo(() => {
    const raw = Array.isArray(params.firearmId) ? params.firearmId[0] : params.firearmId;
    const value = `${raw ?? ''}`.trim();
    return value || null;
  }, [params.firearmId]);
  const routeApplicationId = useMemo(() => {
    const raw = Array.isArray(params.applicationId) ? params.applicationId[0] : params.applicationId;
    const value = `${raw ?? ''}`.trim();
    return value || null;
  }, [params.applicationId]);
  const returnToPath = useMemo(() => {
    const raw = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
    const value = `${raw ?? ''}`.trim();
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }, [params.returnTo]);
  const routeSelectedMembershipIds = useMemo(
    () => parseIdListParam(params.selectedMembershipIds),
    [params.selectedMembershipIds]
  );
  const hasRouteSelectedMembershipIds = useMemo(() => {
    const raw = Array.isArray(params.selectedMembershipIds)
      ? params.selectedMembershipIds[0]
      : params.selectedMembershipIds;
    return raw !== undefined;
  }, [params.selectedMembershipIds]);
  const routeSelectedSafeIds = useMemo(
    () => parseIdListParam(params.selectedSafeIds),
    [params.selectedSafeIds]
  );
  const applicationMembershipSelection = useMemo(() => {
    if (!routeApplicationId) return { hasSelection: false, ids: [] as string[] };
    const application = getById<Application>(routeApplicationId);
    if (!application || !Array.isArray(application.membershipIds)) {
      return { hasSelection: false, ids: [] as string[] };
    }
    return {
      hasSelection: true,
      ids: application.membershipIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    };
  }, [routeApplicationId]);
  const showPreviewBenchmark = appConfig.features.showDevTools === true;
  const showPreviewStructuredProfile = showPreviewBenchmark && devModeEnabled;
  const setupFirearms = useMemo(() => {
    if (!routeFirearmId) return sortedFirearms;
    return sortedFirearms.filter((firearm) => String(firearm.id) === routeFirearmId);
  }, [routeFirearmId, sortedFirearms]);
  const [motivationTypeUi, setMotivationTypeUi] = useState<'new' | 'renewal'>('renewal');
  const [applicationType] = useState<MotivationApplicationType>(initial.applicationType);
  const [sectionType, setSectionType] = useState<MotivationSectionType>(initial.sectionType);
  const [purposeType, setPurposeType] = useState<MotivationPurposeType>(initial.purposeType);
  const [targetFirearm, setTargetFirearm] = useState<DraftTargetFirearm>(initial.targetFirearm);
  const [motivationProfile, setMotivationProfile] = useState<MotivationProfile>(initial.motivationProfile);
  const [selectedComparisonIds, setSelectedComparisonIds] = useState<string[]>([]);
  const [comparisonNoneRelevant, setComparisonNoneRelevant] = useState(false);
  const [comparisonDrafts, setComparisonDrafts] = useState<Record<string, ComparisonDraftEntry>>({});
  const [provinceSheetVisible, setProvinceSheetVisible] = useState(false);
  const [homeTypeSheetVisible, setHomeTypeSheetVisible] = useState(false);
  const hydratedFromApplicationRef = useRef(false);
  const [homeType, setHomeType] = useState<ResidenceHomeType | undefined>(
    initial.profile?.address?.homeType
  );
  const [securityMeasures, setSecurityMeasures] = useState<ResidenceSecurityMeasure[]>(
    initial.profile?.address?.securityMeasures ?? []
  );
  const [selectedMembershipIds, setSelectedMembershipIds] = useState<string[]>(
    () =>
      hasRouteSelectedMembershipIds
        ? routeSelectedMembershipIds
        : applicationMembershipSelection.hasSelection
          ? applicationMembershipSelection.ids
        : initial.memberships.map((membership) => String(membership.id))
  );
  const [selectedSafeIds, setSelectedSafeIds] = useState<string[]>(
    () =>
      routeSelectedSafeIds.length
        ? routeSelectedSafeIds
        : initial.motivationProfile.supportProfile?.selectedSafeIds ?? []
  );
  const [usedFirearmsSince, setUsedFirearmsSince] = useState<string>(() =>
    normalizeStoredYear(initial.profile?.usedFirearmsSince)
  );
  const [firearmOwnerSince, setFirearmOwnerSince] = useState<string>(() =>
    normalizeStoredYear(initial.profile?.firearmOwnerSince)
  );
  const selectedMemberships = useMemo(
    () =>
      initial.memberships.filter((membership) =>
        selectedMembershipIds.includes(String(membership.id))
      ),
    [initial.memberships, selectedMembershipIds]
  );
  const sortedMemberships = useMemo(
    () =>
      initial.memberships
        .slice()
        .sort((a, b) =>
          String(a.associationName ?? '')
            .trim()
            .localeCompare(String(b.associationName ?? '').trim(), undefined, {
              sensitivity: 'base',
            })
        ),
    [initial.memberships]
  );
  const associationName = useMemo(
    () =>
      selectedMemberships
        .map((membership) => `${membership.associationName ?? ''}`.trim())
        .filter(Boolean)
        .join(', '),
    [selectedMemberships]
  );
  const sortedSafes = useMemo(
    () =>
      initial.safes
        .slice()
        .sort((a, b) =>
          String(a.safeName ?? a.make ?? '')
            .trim()
            .localeCompare(String(b.safeName ?? b.make ?? '').trim(), undefined, {
              sensitivity: 'base',
            })
        ),
    [initial.safes]
  );
  const membershipSelectionMismatch =
    sortedMemberships.length > 0 &&
    selectedMembershipIds.length !== sortedMemberships.length;
  const safeSelectionMismatch =
    sortedSafes.length > 0 && selectedSafeIds.length !== sortedSafes.length;

  const availablePurposeOptions = useMemo(
    () => getMembershipDrivenPurposeOptions(sectionType, selectedMemberships),
    [sectionType, selectedMemberships]
  );
  const allowedNeedReasonTags = useMemo(
    () =>
      (NEED_REASON_OPTIONS_BY_PURPOSE[purposeType] ?? []).filter(
        (tag) => !(applicationType === 'renewal' && tag === 'existing_firearm_gap')
      ),
    [applicationType, purposeType]
  );
  const defaultNeedReasonTags = useMemo(
    () => DEFAULT_NEED_REASON_TAGS_BY_PURPOSE[purposeType] ?? [],
    [purposeType]
  );
  const availableFirearmAttributeOptions = useMemo(
    () =>
      sectionType === 's13'
        ? FIREARM_ATTRIBUTE_OPTIONS.filter(
            (option) => option.value !== 'humane_application'
          )
        : FIREARM_ATTRIBUTE_OPTIONS,
    [sectionType]
  );
  useEffect(() => {
    if (!routeFirearmId) return;
    if (targetFirearm.firearmId === routeFirearmId) return;
    const lockedFirearm = sortedFirearms.find((firearm) => String(firearm.id) === routeFirearmId);
    if (!lockedFirearm) return;
    setTargetFirearm(normalizeTargetFirearmFromRecord(lockedFirearm));
    const inferredSectionType = inferSectionTypeFromFirearmSection(lockedFirearm.section);
    if (inferredSectionType) {
      setSectionType(inferredSectionType);
    }
    if (lockedFirearm.purpose && inferredSectionType !== 's13') {
      setPurposeType(lockedFirearm.purpose);
    }
  }, [routeFirearmId, sortedFirearms, targetFirearm.firearmId]);

  useEffect(() => {
    if (!sortedMemberships.length) {
      setSelectedMembershipIds([]);
      return;
    }
    setSelectedMembershipIds((current) => {
      const allowed = new Set(sortedMemberships.map((membership) => String(membership.id)));
      const filtered = current.filter((id) => allowed.has(id));
      if (filtered.length) return filtered;
      if (hasRouteSelectedMembershipIds || applicationMembershipSelection.hasSelection) {
        return [];
      }
      return sortedMemberships.map((membership) => String(membership.id));
    });
  }, [
    applicationMembershipSelection.hasSelection,
    hasRouteSelectedMembershipIds,
    sectionType,
    sortedMemberships,
  ]);

  useEffect(() => {
    if (!sortedSafes.length) {
      setSelectedSafeIds([]);
      return;
    }
    setSelectedSafeIds((current) => {
      const allowed = new Set(sortedSafes.map((safe) => String(safe.id)));
      const filtered = current.filter((id) => allowed.has(id));
      if (filtered.length) return filtered;
      return sortedSafes.map((safe) => String(safe.id));
    });
  }, [sortedSafes]);

  useEffect(() => {
    if (!availablePurposeOptions.includes(purposeType)) {
      setPurposeType(availablePurposeOptions[0]);
    }
  }, [availablePurposeOptions, purposeType]);

  useEffect(() => {
    setMotivationProfile((current) => {
      const existing = current.needProfile?.reasonTags ?? [];
      const allowed = new Set(allowedNeedReasonTags);
      const filtered = existing.filter((tag) => allowed.has(tag));
      const nextReasonTags = filtered.length ? filtered : defaultNeedReasonTags;
      return {
        ...current,
        needProfile: {
          ...current.needProfile,
          reasonTags: nextReasonTags,
        },
      };
    });
  }, [allowedNeedReasonTags, defaultNeedReasonTags]);

  useEffect(() => {
    setMotivationProfile((current) => {
      const fitSighting = current.firearmFitProfile?.sightingSystem;
      const legacySighting = current.huntingProfile?.sightingSystem;
      if (fitSighting || !legacySighting) return current;
      return {
        ...current,
        firearmFitProfile: {
          ...current.firearmFitProfile,
          sightingSystem: legacySighting,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (sectionType !== 's13') return;
    setMotivationProfile((current) => {
      const tags = current.firearmFitProfile?.attributeTags ?? [];
      if (!tags.includes('humane_application')) return current;
      return {
        ...current,
        firearmFitProfile: {
          ...current.firearmFitProfile,
          attributeTags: tags.filter((tag) => tag !== 'humane_application'),
        },
      };
    });
  }, [sectionType]);

  useEffect(() => {
    setMotivationProfile((current) => ({
      ...current,
      supportProfile: {
        ...current.supportProfile,
        selectedSafeIds,
      },
    }));
  }, [selectedSafeIds]);

  useEffect(() => {
    if (!initial.profile) return;
    if (usedFirearmsSince && usedFirearmsSince.length !== 4) return;
    if (firearmOwnerSince && firearmOwnerSince.length !== 4) return;
    if (firearmOwnerSince && !usedFirearmsSince) return;
    const currentUsed = normalizeStoredYear(initial.profile.usedFirearmsSince);
    const currentOwner = normalizeStoredYear(initial.profile.firearmOwnerSince);
    if (currentUsed === usedFirearmsSince && currentOwner === firearmOwnerSince) return;
    const nextProfile: Profile = touch({
      ...cloneProfile(initial.profile),
      usedFirearmsSince: usedFirearmsSince || undefined,
      firearmOwnerSince: firearmOwnerSince || undefined,
    });
    persist(nextProfile);
    initial.profile.usedFirearmsSince = nextProfile.usedFirearmsSince;
    initial.profile.firearmOwnerSince = nextProfile.firearmOwnerSince;
  }, [firearmOwnerSince, initial.profile, usedFirearmsSince]);

  const comparisonFirearms = useMemo(() => {
    const targetId = targetFirearm.firearmId;
    return sortedFirearms.filter((firearm) => {
      if (!targetId) return true;
      return String(firearm.id) !== targetId;
    });
  }, [sortedFirearms, targetFirearm.firearmId]);
  const hasOtherFirearms = firearms.length > 1;

  useEffect(() => {
    if (!routeApplicationId) return;
    if (hydratedFromApplicationRef.current) return;
    const application = getById<Application>(routeApplicationId);
    const resolvedMotivation = (() => {
      if (!application) return null;
      const holderProfileId = String(application.applicantProfileId ?? initial.profile?.id ?? '').trim();
      const scopedFirearmId =
        routeFirearmId ||
        `${targetFirearm.firearmId ?? ''}`.trim() ||
        `${application.motivationFirearmId ?? ''}`.trim() ||
        (Array.isArray(application.selectedFirearmIds) ? String(application.selectedFirearmIds[0] ?? '').trim() : '');
      if (holderProfileId && scopedFirearmId) {
        return ensureMotivationForHolderAndFirearm(holderProfileId, scopedFirearmId);
      }
      return ensureMotivationForApplication(application);
    })();
    if (!application?.motivationProfile && !resolvedMotivation?.profile) {
      hydratedFromApplicationRef.current = true;
      return;
    }
    const savedProfile =
      resolvedMotivation?.profile ??
      application?.motivationProfile ??
      createEmptyProfile();
    setMotivationProfile(savedProfile);
    const savedEntries = savedProfile.existingComparison?.comparisonEntries ?? [];
    const ids = savedEntries
      .map((entry) => String(entry.firearmId ?? '').trim())
      .filter(Boolean);
    setSelectedComparisonIds(Array.from(new Set(ids)));
    const drafts: Record<string, ComparisonDraftEntry> = {};
    savedEntries.forEach((entry) => {
      const firearmId = String(entry.firearmId ?? '').trim();
      if (!firearmId) return;
      drafts[firearmId] = {
        comparisonRole: entry.comparisonRole,
        limitationTags: entry.limitationTags ?? [],
        note: `${entry.note ?? ''}`,
      };
    });
    setComparisonDrafts(drafts);
    const shouldMarkNoneRelevant =
      (resolvedMotivation?.wizardStatus ?? application?.motivationWizardStatus) === 'complete' &&
      hasOtherFirearms &&
      savedEntries.length === 0;
    setComparisonNoneRelevant(shouldMarkNoneRelevant);
    hydratedFromApplicationRef.current = true;
  }, [hasOtherFirearms, initial.profile?.id, routeApplicationId, routeFirearmId, targetFirearm.firearmId]);
  const {
    visibleSteps,
    currentStep: currentStepResolved,
    stepIndex,
    isFirstStep,
    isLastStep,
    goToStep,
  } = useWizardSteps({
    steps: STEPS,
    isStepVisible: (step) => (step.id === 'comparison' ? hasOtherFirearms : true),
  });
  const currentStep = currentStepResolved ?? visibleSteps[0] ?? null;
  const visibleStepCount = visibleSteps.length;
  const currentStepPosition = stepIndex + 1;

  const selectedTargetFirearmRecord = useMemo(
    () =>
      targetFirearm.firearmId
        ? firearms.find((firearm) => String(firearm.id) === targetFirearm.firearmId) ?? null
        : null,
    [firearms, targetFirearm.firearmId]
  );

  useEffect(() => {
    if (!comparisonFirearms.length) {
      setSelectedComparisonIds([]);
      setComparisonNoneRelevant(false);
      return;
    }
    setSelectedComparisonIds((current) => {
      return current.filter((id) =>
        comparisonFirearms.some((firearm) => String(firearm.id) === id)
      );
    });
  }, [comparisonFirearms]);

  useEffect(() => {
    const rawComparisonEntries: Array<MotivationExistingFirearmComparisonEntry | null> = selectedComparisonIds
      .map((firearmId) => {
        const firearm = comparisonFirearms.find((item) => String(item.id) === firearmId);
        if (!firearm) return null;
        const draft = comparisonDrafts[firearmId];
        return {
          firearmId,
          label: toComparisonLabel(firearm),
          make: firearm.make,
          model: firearm.model,
          calibre: firearm.calibre,
          firearmSerialNumber: firearm.firearmSerialNumber,
          firearmType: firearm.firearmType,
          firearmAction: firearm.firearmAction,
          comparisonRole: draft?.comparisonRole,
          limitationTags: draft?.limitationTags ?? [],
          note: draft?.note || '',
        } satisfies MotivationExistingFirearmComparisonEntry;
      });
    const comparisonEntries = rawComparisonEntries.filter(
      (entry): entry is MotivationExistingFirearmComparisonEntry => entry !== null
    );

    setMotivationProfile((current) => ({
      ...current,
      existingComparison: {
        ...current.existingComparison,
        comparisonEntries,
      },
    }));
  }, [comparisonDrafts, comparisonFirearms, selectedComparisonIds]);

  const generatedValues = useMemo(() => {
    const applicationCompetencyCategories = (() => {
      if (!routeApplicationId) return [] as CompetencyCategory[];
      const application = getById<Application>(routeApplicationId);
      const ids = Array.isArray(application?.competencyCertificateIds)
        ? application.competencyCertificateIds
        : [];
      const seen = new Set<string>();
      const categories: CompetencyCategory[] = [];
      ids.forEach((id) => {
        const cert = getById<CompetencyCertificate>(String(id));
        (cert?.categories ?? []).forEach((category) => {
          const key = String(category);
          if (seen.has(key)) return;
          seen.add(key);
          categories.push(category);
        });
      });
      return categories;
    })();
    const applicantFullName = getProfileName(initial.profile);
    const applicantInitials = getProfileInitials(initial.profile);
    return {
      applicationType,
      sectionType,
      purposeType,
      applicantFullName,
      applicantInitials,
      applicantSex: initial.profile?.sexAtBirth,
      associationName,
      requiresComparison: hasOtherFirearms,
      comparisonFirearmCount: comparisonFirearms.length,
      firearmMake: targetFirearm.make,
      firearmModel: targetFirearm.model,
      firearmCalibre: targetFirearm.calibre,
      firearmSerialNumber: targetFirearm.firearmSerialNumber,
      firearmType: targetFirearm.firearmType,
      firearmAction: targetFirearm.firearmAction,
      competencyCategories: applicationCompetencyCategories.length
        ? applicationCompetencyCategories
        : [targetFirearm.firearmType],
      homeType,
      securityMeasures,
      usedFirearmsSince,
      firearmOwnerSince,
      motivationProfile,
    };
  }, [
    applicationType,
    associationName,
    comparisonFirearms.length,
    hasOtherFirearms,
    homeType,
    firearmOwnerSince,
    initial.profile,
    motivationProfile,
    purposeType,
    routeApplicationId,
    securityMeasures,
    sectionType,
    targetFirearm,
    usedFirearmsSince,
  ]);

  const composed = useMemo(
    () => {
      const application = routeApplicationId ? getById<Application>(routeApplicationId) : null;
      const targetFirearmId = `${targetFirearm.firearmId ?? ''}`.trim();
      const scopedApplication =
        application && targetFirearmId
          ? ({
              ...application,
              selectedFirearmIds: [targetFirearmId],
              firearms: Array.isArray(application.firearms)
                ? application.firearms.filter(
                    (firearm: any) => String(firearm?.id ?? '').trim() === targetFirearmId
                  )
                : application.firearms,
            } as Application)
          : application;
      return composeMotivation({
        application: scopedApplication,
        applicationType,
        sectionType,
        purposeType,
        evidenceKeys: buildEvidenceKeys(applicationType, sectionType),
        resolvedEvidence: scopedApplication
          ? resolveEvidenceFromApplication(scopedApplication)
          : undefined,
        values: generatedValues,
      });
    },
    [
      applicationType,
      generatedValues,
      purposeType,
      routeApplicationId,
      sectionType,
      targetFirearm.firearmId,
    ]
  );

  const benchmark = useMemo(
    () =>
      evaluateMotivationAgainstBenchmark({
        sectionType,
        purposeType,
        motivation: composed,
        requiresComparison: hasOtherFirearms,
      }),
    [composed, hasOtherFirearms, purposeType, sectionType]
  );
  const comparisonEntriesForPersist = useMemo(() => {
    const rawComparisonEntries: Array<MotivationExistingFirearmComparisonEntry | null> = selectedComparisonIds
      .map((firearmId) => {
        const firearm = comparisonFirearms.find((item) => String(item.id) === firearmId);
        if (!firearm) return null;
        const draft = comparisonDrafts[firearmId];
        return {
          firearmId,
          label: toComparisonLabel(firearm),
          make: firearm.make,
          model: firearm.model,
          calibre: firearm.calibre,
          firearmSerialNumber: firearm.firearmSerialNumber,
          firearmType: firearm.firearmType,
          firearmAction: firearm.firearmAction,
          comparisonRole: draft?.comparisonRole,
          limitationTags: draft?.limitationTags ?? [],
          note: draft?.note || '',
        } satisfies MotivationExistingFirearmComparisonEntry;
      });
    return rawComparisonEntries.filter(
      (entry): entry is MotivationExistingFirearmComparisonEntry => entry !== null
    );
  }, [comparisonDrafts, comparisonFirearms, selectedComparisonIds]);
  const motivationProfileForPersist = useMemo(
    () => ({
      ...motivationProfile,
      existingComparison: {
        ...motivationProfile.existingComparison,
        comparisonEntries: comparisonEntriesForPersist,
      },
    }),
    [comparisonEntriesForPersist, motivationProfile],
  );
  const computedApplicantSex = useMemo(
    () =>
      resolveApplicantSex({
        idType: initial.profile?.idType,
        idNumber: initial.profile?.idNumber,
        applicantSex: initial.profile?.sexAtBirth,
      }),
    [initial.profile?.idNumber, initial.profile?.idType, initial.profile?.sexAtBirth]
  );
  const includesS9 = useMemo(
    () => composed.sections.some((section) => section.sectionId === 'S9'),
    [composed.sections]
  );

  if (!currentStep) {
    return (
      <Screen>
        <View style={styles.container}>
          <PageHeader title="Motivation wizard" onClose={() => router.back()} style={styles.header} />
        </View>
      </Screen>
    );
  }

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const setStepWithScrollReset = (nextIndex: number) => {
    goToStep(nextIndex);
    requestAnimationFrame(() => {
      scrollToTop();
    });
  };

  const setApplicantContextField = <K extends keyof NonNullable<MotivationProfile['applicantContext']>>(
    key: K,
    value: NonNullable<MotivationProfile['applicantContext']>[K]
  ) => {
    setMotivationProfile((current) => ({
      ...current,
      applicantContext: {
        ...current.applicantContext,
        [key]: value,
      },
    }));
  };

  const setNeedProfileField = <K extends keyof NonNullable<MotivationProfile['needProfile']>>(
    key: K,
    value: NonNullable<MotivationProfile['needProfile']>[K]
  ) => {
    setMotivationProfile((current) => ({
      ...current,
      needProfile: {
        ...current.needProfile,
        [key]: value,
      },
    }));
  };

  const setHuntingField = <K extends keyof NonNullable<MotivationProfile['huntingProfile']>>(
    key: K,
    value: NonNullable<MotivationProfile['huntingProfile']>[K]
  ) => {
    setMotivationProfile((current) => ({
      ...current,
      huntingProfile: {
        ...current.huntingProfile,
        [key]: value,
      },
    }));
  };

  const setSportField = <K extends keyof NonNullable<MotivationProfile['sportProfile']>>(
    key: K,
    value: NonNullable<MotivationProfile['sportProfile']>[K]
  ) => {
    setMotivationProfile((current) => ({
      ...current,
      sportProfile: {
        ...current.sportProfile,
        [key]: value,
      },
    }));
  };

  const setSelfDefenceField = <K extends keyof NonNullable<MotivationProfile['selfDefenceProfile']>>(
    key: K,
    value: NonNullable<MotivationProfile['selfDefenceProfile']>[K]
  ) => {
    setMotivationProfile((current) => ({
      ...current,
      selfDefenceProfile: {
        ...current.selfDefenceProfile,
        [key]: value,
      },
    }));
  };

  const setFitField = <K extends keyof NonNullable<MotivationProfile['firearmFitProfile']>>(
    key: K,
    value: NonNullable<MotivationProfile['firearmFitProfile']>[K]
  ) => {
    setMotivationProfile((current) => ({
      ...current,
      firearmFitProfile: {
        ...current.firearmFitProfile,
        [key]: value,
      },
    }));
  };

  const toggleArrayValue = <T extends string>(
    values: T[] | undefined,
    next: T
  ): T[] => {
    const current = values ?? [];
    return current.includes(next)
      ? current.filter((item) => item !== next)
      : [...current, next];
  };

  const toggleNeedReasonTag = (tag: MotivationNeedReasonTag) => {
    if (!allowedNeedReasonTags.includes(tag)) return;
    setMotivationProfile((current) => {
      const selected = current.needProfile?.reasonTags ?? [];
      const next = selected.includes(tag)
        ? selected.filter((item) => item !== tag)
        : [...selected, tag];
      const deduped = next.filter((item, index, array) => array.indexOf(item) === index);
      return {
        ...current,
        needProfile: {
          ...current.needProfile,
          reasonTags: deduped.length ? deduped : defaultNeedReasonTags,
        },
      };
    });
  };

  const handleTargetFirearmSelect = (firearmId: string) => {
    const firearm = firearms.find((item) => String(item.id) === firearmId) ?? null;
    setTargetFirearm(normalizeTargetFirearmFromRecord(firearm));
    const inferredSectionType = inferSectionTypeFromFirearmSection(firearm?.section);
    if (inferredSectionType) {
      setSectionType(inferredSectionType);
    }
    if (firearm?.purpose && inferredSectionType !== 's13') {
      setPurposeType(firearm.purpose);
    }
  };

  const persistProfileAddressPatch = (
    patch: Partial<NonNullable<Profile['address']>>
  ) => {
    if (!initial.profile) return;
    const nextProfile: Profile = touch({
      ...cloneProfile(initial.profile),
      address: {
        ...(initial.profile.address ?? {}),
        ...patch,
      },
    });
    persist(nextProfile);
    initial.profile.address = nextProfile.address;
  };

  const persistProfileOccupation = (occupation: string) => {
    if (!initial.profile) return;
    const nextOccupation = occupation.trim();
    const currentOccupation = `${initial.profile.occupation ?? ''}`.trim();
    if (currentOccupation === nextOccupation) return;
    const nextProfile: Profile = touch({
      ...cloneProfile(initial.profile),
      occupation: nextOccupation,
    });
    persist(nextProfile);
    initial.profile.occupation = nextProfile.occupation;
  };

  const persistFirearmPurpose = (
    firearmId: string | undefined,
    purpose: Firearm['purpose']
  ) => {
    if (!firearmId) return;
    const firearm = firearms.find((item) => String(item.id) === firearmId);
    if (!firearm) return;
    const nextFirearm: Firearm = touch({
      ...firearm,
      purpose,
    });
    persist(nextFirearm);
  };
  const persistApplicationMembershipSelection = (membershipIds: string[]) => {
    if (!routeApplicationId) return;
    const application = getById<Application>(routeApplicationId);
    if (!application) return;
    const nextApplication: Application = touch({
      ...application,
      membershipIds: Array.from(new Set(membershipIds)),
    });
    persist(nextApplication);
  };

  const comparisonSelectionSummary = comparisonNoneRelevant
    ? `Marked as not relevant across ${comparisonFirearms.length} other firearm${comparisonFirearms.length === 1 ? '' : 's'}`
    : selectedComparisonIds.length
      ? `${selectedComparisonIds.length} firearm${selectedComparisonIds.length === 1 ? '' : 's'} selected for comparison`
      : 'No existing firearms selected yet';

  const firearmFitValidation = {
    hasAttributes: (motivationProfile.firearmFitProfile?.attributeTags ?? []).length > 0,
    hasSighting: Boolean(
      motivationProfile.firearmFitProfile?.sightingSystem ??
        motivationProfile.huntingProfile?.sightingSystem
    ),
  };

  const comparisonValidationById = useMemo(
    () =>
      Object.fromEntries(
        selectedComparisonIds.map((firearmId) => {
          const draft = comparisonDrafts[firearmId];
          return [
            firearmId,
            {
              hasRole: Boolean(draft?.comparisonRole),
              hasLimitations: Boolean((draft?.limitationTags ?? []).length),
            },
          ];
        })
      ) as Record<string, { hasRole: boolean; hasLimitations: boolean }>,
    [comparisonDrafts, selectedComparisonIds]
  );

  const matchedCalibreCatalogRecord = resolveCalibreCatalogRecord(targetFirearm.calibre);
  const usesCalibreDerivedHuntingDistance = Boolean(matchedCalibreCatalogRecord);

  const huntingValidation = {
    hasTerrain: Boolean((motivationProfile.huntingProfile?.terrainTags ?? []).length),
    hasDistance:
      Boolean(motivationProfile.huntingProfile?.distanceBand) ||
      usesCalibreDerivedHuntingDistance,
  };

  const sportValidation = {
    hasDiscipline: Boolean((motivationProfile.sportProfile?.disciplineTags ?? []).length),
  };
  const selfDefenceValidation = {
    hasExposure: Boolean((motivationProfile.selfDefenceProfile?.exposureTags ?? []).length),
  };
  const comparisonHasSelection = selectedComparisonIds.length > 0;
  const comparisonChoiceMade = comparisonHasSelection || comparisonNoneRelevant;
  const hasComparisonDetailValidation = selectedComparisonIds.every((firearmId) => {
    const validation = comparisonValidationById[firearmId];
    return validation?.hasRole && validation?.hasLimitations;
  });
  const hasHuntingValidation =
    huntingValidation.hasTerrain && huntingValidation.hasDistance;
  const hasSportValidation =
    sportValidation.hasDiscipline;
  const hasValidUsedFirearmsSince =
    !usedFirearmsSince || normalizeStoredYear(usedFirearmsSince).length === 4;
  const hasValidFirearmOwnerSince =
    !firearmOwnerSince || normalizeStoredYear(firearmOwnerSince).length === 4;
  const hasExperienceYearValidation =
    hasValidUsedFirearmsSince &&
    hasValidFirearmOwnerSince &&
    !(firearmOwnerSince && !usedFirearmsSince);
  const hasActivityValidation =
    !(purposeType === 'self_defence' && !selfDefenceValidation.hasExposure) &&
    !(
      (purposeType === 'hunting' || purposeType === 'mixed_hunting_sport') &&
      !hasHuntingValidation
    ) &&
    !(
      (purposeType === 'sport_shooting' || purposeType === 'mixed_hunting_sport') &&
      !hasSportValidation
    ) &&
    hasExperienceYearValidation;
  const isWizardComplete =
    firearmFitValidation.hasAttributes &&
    firearmFitValidation.hasSighting &&
    (!hasOtherFirearms || (comparisonChoiceMade && hasComparisonDetailValidation)) &&
    hasActivityValidation;

  const setupValidation = {
    hasFirearm: Boolean(targetFirearm.firearmId),
    hasHomeType: Boolean(homeType),
    hasHomeSecurity: securityMeasures.length > 0,
  };
  const isSetupStepValid =
    setupValidation.hasFirearm &&
    setupValidation.hasHomeType &&
    setupValidation.hasHomeSecurity;
  const isFirearmStepValid =
    firearmFitValidation.hasAttributes && firearmFitValidation.hasSighting;
  const isComparisonStepValid = !hasOtherFirearms
    ? true
    : comparisonChoiceMade && hasComparisonDetailValidation;
  const isActivityStepValid = hasActivityValidation;

  const getStepValidity = (stepId: StepId): boolean => {
    switch (stepId) {
      case 'setup':
        return isSetupStepValid;
      case 'firearm':
        return isFirearmStepValid;
      case 'comparison':
        return isComparisonStepValid;
      case 'activity':
        return isActivityStepValid;
      case 'preview':
      default:
        return false;
    }
  };

  const isPreviewReady = visibleSteps
    .filter((step) => step.id !== 'preview')
    .every((step) => getStepValidity(step.id));

  const isCurrentStepValid = useMemo(() => {
    switch (currentStep?.id) {
      case 'setup':
        return isSetupStepValid;
      case 'firearm':
        return firearmFitValidation.hasAttributes && firearmFitValidation.hasSighting;
      case 'comparison':
        if (!comparisonChoiceMade) return false;
        return hasComparisonDetailValidation;
      case 'activity':
        return hasActivityValidation;
      default:
        return true;
    }
  }, [
    isSetupStepValid,
    hasActivityValidation,
    hasComparisonDetailValidation,
    hasHuntingValidation,
    hasOtherFirearms,
    hasSportValidation,
    huntingValidation.hasDistance,
    huntingValidation.hasTerrain,
    comparisonValidationById,
    comparisonHasSelection,
    comparisonChoiceMade,
    comparisonNoneRelevant,
    currentStep?.id,
    firearmFitValidation.hasAttributes,
    firearmFitValidation.hasSighting,
    purposeType,
    selectedComparisonIds,
    sportValidation.hasDiscipline,
  ]);

  const handleStepChange = (nextIndex: number) => {
    if (nextIndex > stepIndex && !isCurrentStepValid) return;
    setStepWithScrollReset(nextIndex);
  };
  const closeWizard = () => {
    if (routeApplicationId) {
      const application = getById<Application>(routeApplicationId);
      if (application) {
        const holderProfileId = String(application.applicantProfileId ?? initial.profile?.id ?? '').trim();
        const scopedFirearmId =
          routeFirearmId ||
          `${targetFirearm.firearmId ?? ''}`.trim() ||
          `${application.motivationFirearmId ?? ''}`.trim() ||
          (Array.isArray(application.selectedFirearmIds) ? String(application.selectedFirearmIds[0] ?? '').trim() : '');
        const resolvedMotivation =
          ensureMotivationForHolderAndFirearm(holderProfileId, scopedFirearmId) ??
          ensureMotivationForApplication(application);
        let nextMotivation: Motivation | null = resolvedMotivation;
        if (!nextMotivation && holderProfileId && scopedFirearmId) {
          nextMotivation = createMotivation(holderProfileId as any, scopedFirearmId as any);
        }
        if (nextMotivation) {
          nextMotivation = updateMotivation(nextMotivation, {
            source: 'wizard',
            wizardStatus: isWizardComplete ? 'complete' : 'draft',
            profile: motivationProfileForPersist,
            text: composed.text,
          });
          persist(nextMotivation);
        }
        const nextApplication: Application = touch({
          ...application,
          ...buildApplicationMotivationMirrorPatch(application, nextMotivation),
          motivationSource: 'wizard',
        });
        persist(nextApplication);
      }
    }
    if (returnToPath) {
      router.replace(returnToPath as any);
      return;
    }
    router.back();
  };

  // Persist draft continuously while editing so motivation changes are not lost if the wizard is closed unexpectedly.
  useEffect(() => {
    if (!routeApplicationId) return;
    const application = getById<Application>(routeApplicationId);
    if (!application) return;
    const holderProfileId = String(application.applicantProfileId ?? initial.profile?.id ?? '').trim();
    const scopedFirearmId =
      routeFirearmId ||
      `${targetFirearm.firearmId ?? ''}`.trim() ||
      `${application.motivationFirearmId ?? ''}`.trim() ||
      (Array.isArray(application.selectedFirearmIds) ? String(application.selectedFirearmIds[0] ?? '').trim() : '');
    if (!holderProfileId || !scopedFirearmId) return;

    const motivation =
      ensureMotivationForHolderAndFirearm(holderProfileId, scopedFirearmId) ??
      ensureMotivationForApplication(application);
    if (!motivation) return;

    const nextMotivation = updateMotivation(motivation, {
      source: 'wizard',
      wizardStatus: isWizardComplete ? 'complete' : 'draft',
      profile: motivationProfileForPersist,
      text: composed.text,
    });
    persist(nextMotivation);

    const nextApplication: Application = touch({
      ...application,
      ...buildApplicationMotivationMirrorPatch(application, nextMotivation),
      motivationSource: 'wizard',
      motivationFirearmId: scopedFirearmId,
    });
    persist(nextApplication);
  }, [
    composed.text,
    initial.profile?.id,
    isWizardComplete,
    motivationProfileForPersist,
    routeApplicationId,
    routeFirearmId,
    targetFirearm.firearmId,
  ]);

  const toggleComparisonFirearmSelection = (firearmId: string) => {
    setComparisonNoneRelevant(false);
    setSelectedComparisonIds((current) =>
      current.includes(firearmId)
        ? current.filter((id) => id !== firearmId)
        : [...current, firearmId]
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Motivation wizard"
          onClose={closeWizard}
          style={styles.header}
        />
        <View style={styles.stepRowWrap}>
          <WizardStepProgress
            steps={visibleSteps}
            selectedIndex={stepIndex}
            onPressStep={handleStepChange}
            getStepTone={(step) => {
              if (step.id === 'preview') return isPreviewReady ? 'blue' : 'grey';
              return getStepValidity(step.id as StepId) ? 'green' : 'orange';
            }}
          />
        </View>
        <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          {currentStep.id === 'setup' ? (
            <>
              <WizardSection
                title="Firearm"
                description="This is the firearm being renewed:"
                onHelp={() => openHelp('helpMotivationSetupFirearm')}
                helpLabel="Help for firearm selection"
              >
                {setupFirearms.length ? (
                  <WizardOptionWrap>
                    {setupFirearms.map((firearm) => {
                      const id = String(firearm.id);
                      return (
                        <WizardOptionButton
                          key={id}
                          label={formatFirearmTitle(firearm, 'Unnamed firearm')}
                          sublabel={formatFirearmWizardSubtitle(firearm)}
                          tertiaryLabel={formatFirearmWizardTertiary(firearm)}
                          selected={targetFirearm.firearmId === id}
                          onPress={() => {
                            if (routeFirearmId) return;
                            handleTargetFirearmSelect(id);
                          }}
                          fullWidth
                          align="left"
                        />
                      );
                    })}
                  </WizardOptionWrap>
                ) : (
                  <Text style={[styles.helperText, { color: tones.grey.base }]}>
                    No existing firearms found in local data yet.
                  </Text>
                )}
              </WizardSection>

              {targetFirearm.firearmId ? (
                <WizardSection title="Application setup" 
                description="Provide the basic details about the application and applicant. This will determine the structure of the motivation and the evidence required."
                onHelp={() => openHelp(getApplicationSetupHelpKey(sectionType))}
                helpLabel="Help for application setup"
              >
                  <WizardField
                    label="Applicant name (from Profile)"
                    value={getProfileName(initial.profile)}
                    onChangeText={() => {}}
                    placeholder="Pulled from profile"
                    editable={false}
                  />
                  <WizardField
                    label="Occupation"
                    value={`${motivationProfile.applicantContext?.occupation ?? ''}`}
                    onChangeText={(value) => {
                      setApplicantContextField('occupation', value);
                      persistProfileOccupation(value);
                    }}
                    placeholder="Optional"
                  />
                  {sectionType === 's13' ? (
                    <WizardSelectField
                      label="Province"
                      value={`${motivationProfile.applicantContext?.residenceProvince ?? ''}`}
                      onPress={() => setProvinceSheetVisible(true)}
                      placeholder="Select province"
                    />
                  ) : null}
                  <WizardSelectField
                    label="Home type"
                    value={homeType ?? ''}
                    onPress={() => setHomeTypeSheetVisible(true)}
                    placeholder="Select home type"
                  />
                  {!setupValidation.hasHomeType ? (
                    <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                      Select a home type.
                    </Text>
                  ) : null}
                  <View style={styles.membershipBlock}>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>
                      Home security
                    </Text>
                    <WizardOptionWrap>
                      {SECURITY_MEASURE_OPTIONS.map((option) => {
                        const selected = securityMeasures.includes(option);
                        return (
                          <WizardOptionButton
                            key={option}
                            label={option}
                            selected={selected}
                            onPress={() => {
                              const NONE_OPTION: ResidenceSecurityMeasure = 'None';
                              setSecurityMeasures((current) => {
                                const isSelected = current.includes(option);
                                let next: ResidenceSecurityMeasure[];

                                if (option === NONE_OPTION) {
                                  next = isSelected ? [] : [NONE_OPTION];
                                } else {
                                  const withoutNone = current.filter(
                                    (item) => item !== NONE_OPTION
                                  );
                                  if (isSelected) {
                                    next = withoutNone.filter((item) => item !== option);
                                  } else {
                                    next = [...withoutNone, option];
                                  }
                                }

                                persistProfileAddressPatch({ securityMeasures: next });
                                return next;
                              });
                            }}
                          />
                        );
                      })}
                    </WizardOptionWrap>
                    {!setupValidation.hasHomeSecurity ? (
                    <WizardValidationHint
                      message="Select at least one home-security pill (or None)."
                      style={styles.warningText}
                    />
                    ) : null}
                  </View>
                  <View style={styles.membershipBlock}>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>
                      Association / club
                    </Text>
                    {initial.memberships.length ? (
                      <WizardOptionWrap>
                        {sortedMemberships.map((membership) => {
                          const membershipId = String(membership.id);
                          const selected = selectedMembershipIds.includes(membershipId);
                          const membershipLabel =
                            `${membership.associationName ?? ''}`.trim() || 'Membership';
                          const disableToggleOff =
                            sectionType === 's16' &&
                            (initial.memberships.length === 1 || selectedMembershipIds.length === 1);

                          return (
                            <WizardOptionButton
                              key={membershipId}
                              label={membershipLabel}
                              selected={selected}
                              onPress={() => {
                                setSelectedMembershipIds((current) => {
                                  const isSelected = current.includes(membershipId);
                                  if (isSelected) {
                                    if (disableToggleOff) return current;
                                    const next = current.filter((id) => id !== membershipId);
                                    persistApplicationMembershipSelection(next);
                                    return next;
                                  }
                                  const next = [...current, membershipId];
                                  persistApplicationMembershipSelection(next);
                                  return next;
                                });
                              }}
                            />
                          );
                        })}
                      </WizardOptionWrap>
                    ) : (
                      <Text style={[styles.helperText, { color: tones.grey.base }]}>
                        No memberships found in local data yet.
                      </Text>
                    )}
                    {membershipSelectionMismatch ? (
                      <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                        Note: Including all memberships may strengthen your motivation.
                      </Text>
                    ) : null}
                  </View>
                  {applicationType !== 'renewal' ? (
                    <View style={styles.membershipBlock}>
                      <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>
                        Safes
                      </Text>
                      {sortedSafes.length ? (
                        <WizardOptionWrap>
                          {sortedSafes.map((safe, index) => {
                            const safeId = String(safe.id);
                            const selected = selectedSafeIds.includes(safeId);
                            const disableToggleOff =
                              sortedSafes.length === 1 || selectedSafeIds.length === 1;
                            const safeLabel =
                              `${safe.safeName ?? safe.make ?? ''}`.trim() || `Safe ${index + 1}`;

                            return (
                              <WizardOptionButton
                                key={safeId}
                                label={safeLabel}
                                selected={selected}
                                onPress={() => {
                                  setSelectedSafeIds((current) => {
                                    const isSelected = current.includes(safeId);
                                    if (isSelected && disableToggleOff) return current;
                                    return isSelected
                                      ? current.filter((id) => id !== safeId)
                                      : [...current, safeId];
                                  });
                                }}
                              />
                            );
                          })}
                        </WizardOptionWrap>
                      ) : (
                        <Text style={[styles.helperText, { color: tones.grey.base }]}>
                          No safes found in local data yet.
                        </Text>
                      )}
                      {safeSelectionMismatch ? (
                        <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                          Warning: Safe selection differs from the full list for this profile.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </WizardSection>
              ) : null}
            </>
          ) : null}

          {currentStep.id === 'firearm' ? (
            <>
              <WizardSection
                title="Firearm"
                onHelp={() => openHelp(getFirearmFitHelpKey(sectionType))}
                helpLabel="Help for firearm fit"
                headerContent={
                  targetFirearm.firearmId ? (
                    <WizardOptionWrap>
                      <WizardOptionButton
                        label={formatFirearmTitle(targetFirearm, 'Unnamed firearm')}
                        sublabel={
                          selectedTargetFirearmRecord
                            ? formatFirearmWizardSubtitle(selectedTargetFirearmRecord)
                            : 'Section not recorded'
                        }
                        tertiaryLabel={
                          selectedTargetFirearmRecord
                            ? formatFirearmWizardTertiary(selectedTargetFirearmRecord)
                            : ''
                        }
                        selected
                        onPress={() => {}}
                        fullWidth
                        align="left"
                      />
                    </WizardOptionWrap>
                  ) : null
                }
              >
                {sectionType !== 's13' ? (
                  <>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Firearm purpose</Text>
                    <WizardOptionWrap>
                      {availablePurposeOptions.map((value) => (
                        <WizardOptionButton
                          key={value}
                          label={PURPOSE_TYPE_LABELS[value]}
                          selected={purposeType === value}
                          onPress={() => {
                            setPurposeType(value);
                            persistFirearmPurpose(targetFirearm.firearmId, value as Firearm['purpose']);
                          }}
                        />
                      ))}
                    </WizardOptionWrap>
                  </>
                ) : null}
                <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>
                  Firearm fit
                </Text>
                <Text style={[styles.helperText, { color: tones.grey.base }]}>
                  {sectionType === 's13'
                    ? 'Select the items that best describe why this firearm is practical and controllable for lawful self-defence.'
                    : 'Select the items that best describe the fit of the firearm and its intended use.'}
                </Text>
                <WizardOptionWrap>
                  {availableFirearmAttributeOptions.map((option) => (
                    <WizardOptionButton
                      key={option.value}
                      label={option.label}
                      selected={(motivationProfile.firearmFitProfile?.attributeTags ?? []).includes(option.value)}
                      onPress={() =>
                        setFitField(
                          'attributeTags',
                          toggleArrayValue(
                            motivationProfile.firearmFitProfile?.attributeTags as MotivationFirearmAttributeTag[] | undefined,
                            option.value
                          )
                        )
                      }
                    />
                  ))}
                </WizardOptionWrap>
                {!firearmFitValidation.hasAttributes ? (
                    <WizardValidationHint
                      message="Select at least one firearm-fit pill before continuing."
                      style={styles.warningText}
                    />
                ) : null}

                <>
                  <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Sighting system</Text>
                  <WizardOptionWrap>
                    {SIGHTING_OPTIONS.map((option) => (
                      <WizardOptionButton
                        key={option.value}
                        label={option.label}
                        selected={
                          (motivationProfile.firearmFitProfile?.sightingSystem ??
                            motivationProfile.huntingProfile?.sightingSystem) === option.value
                        }
                        onPress={() => setFitField('sightingSystem', option.value)}
                      />
                    ))}
                  </WizardOptionWrap>
                  {!firearmFitValidation.hasSighting ? (
                    <WizardValidationHint
                      message="Select one sighting-system pill."
                      style={styles.warningText}
                    />
                  ) : null}
                </>

                <WizardField
                  label="Fit note"
                  value={`${motivationProfile.firearmFitProfile?.note ?? ''}`}
                  onChangeText={(value) => setFitField('note', value)}
                  placeholder="Optional"
                  multiline
                />
              </WizardSection>
            </>
          ) : null}

          {currentStep.id === 'comparison' ? (
            <>
              <WizardSection
                title="Existing firearms"
                description="Use this step to compare any other firearms that are genuinely relevant, or confirm that none of them are suitable for the same purpose."
                onHelp={() => openHelp(getExistingFirearmsHelpKey(sectionType))}
                helpLabel="Help for existing firearms"
              >
                <Text style={[styles.helperText, { color: tones.grey.base }]}>{comparisonSelectionSummary}</Text>
                {!comparisonChoiceMade ? (
                  <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                    Select at least one existing firearm, or choose “No other firearms are relevant”.
                  </Text>
                ) : null}
                {comparisonFirearms.length ? (
                  <View style={[styles.comparisonItem, styles.firstComparisonItem]}>
                    <WizardOptionButton
                      label="No other firearms are relevant"
                      sublabel={`I have ${comparisonFirearms.length} other firearm${comparisonFirearms.length === 1 ? '' : 's'}, but none of them are suitable for the same purpose.`}
                      reserveTertiarySpace
                      selected={comparisonNoneRelevant}
                      onPress={() => {
                        setComparisonNoneRelevant((current) => {
                          const next = !current;
                          if (next) {
                            setSelectedComparisonIds([]);
                          }
                          return next;
                        });
                      }}
                      fullWidth
                      align="left"
                    />
                  </View>
                ) : null}
                {comparisonFirearms.length ? (
                  comparisonFirearms.map((firearm, index) => {
                    const firearmId = String(firearm.id);
                    const selected = selectedComparisonIds.includes(firearmId);
                    const isLastFirearmCard = index === comparisonFirearms.length - 1;
                    const draft = comparisonDrafts[firearmId] ?? {
                      limitationTags: [],
                      note: '',
                    };
                    return (
                      <View key={firearmId} style={styles.comparisonItem}>
                        <View>
                          <WizardOptionButton
                            label={formatFirearmTitle(firearm, 'Unnamed firearm')}
                            sublabel={formatFirearmWizardSubtitle(firearm)}
                            tertiaryLabel={formatFirearmWizardTertiary(firearm)}
                            selected={selected}
                            onPress={() => toggleComparisonFirearmSelection(firearmId)}
                            fullWidth
                            align="left"
                          />
                        </View>
                        <Pressable
                          onPress={() => toggleComparisonFirearmSelection(firearmId)}
                        >
                        </Pressable>

                        {selected ? (
                          <>
                            <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>
                              How similar is this firearm to the application firearm?
                            </Text>
                            <WizardOptionWrap>
                              {COMPARISON_ROLE_OPTIONS.map((option) => (
                                <WizardOptionButton
                                  key={option.value}
                                  label={option.label}
                                  selected={draft.comparisonRole === option.value}
                                  onPress={() =>
                                    setComparisonDrafts((current) => ({
                                      ...current,
                                      [firearmId]: {
                                        ...draft,
                                        comparisonRole: option.value,
                                      },
                                    }))
                                  }
                                />
                              ))}
                            </WizardOptionWrap>
                            {!comparisonValidationById[firearmId]?.hasRole ? (
                              <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                                Select one role-similarity pill for this firearm.
                              </Text>
                            ) : null}

                            <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Why it falls short</Text>
                            <WizardOptionWrap>
                              {LIMITATION_TAG_OPTIONS.map((option) => (
                                <WizardOptionButton
                                  key={option.value}
                                  label={option.label}
                                  selected={draft.limitationTags.includes(option.value)}
                                  onPress={() =>
                                    setComparisonDrafts((current) => ({
                                      ...current,
                                      [firearmId]: {
                                        ...draft,
                                        limitationTags: toggleArrayValue(draft.limitationTags, option.value),
                                      },
                                    }))
                                  }
                                />
                              ))}
                            </WizardOptionWrap>
                            {!comparisonValidationById[firearmId]?.hasLimitations ? (
                              <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                                Select at least one limitation pill for this firearm.
                              </Text>
                            ) : null}

                            <WizardField
                              label="Comparison note"
                              value={draft.note}
                              onChangeText={(value) =>
                                setComparisonDrafts((current) => ({
                                  ...current,
                                  [firearmId]: {
                                    ...draft,
                                    note: value,
                                  },
                                }))
                              }
                              placeholder="Optional"
                              multiline
                            />
                          </>
                        ) : null}
                        {selected && !isLastFirearmCard ? (
                          <View style={[styles.comparisonDivider, { borderColor: tones.grey.border }]} />
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <Text style={[styles.helperText, { color: tones.grey.base }]}>
                    No existing firearms found in local data yet.
                  </Text>
                )}

                <WizardField
                  label="Overall comparison note"
                  value={`${motivationProfile.existingComparison?.overviewNote ?? ''}`}
                  onChangeText={(value) =>
                    setMotivationProfile((current) => ({
                      ...current,
                      existingComparison: {
                        ...current.existingComparison,
                        overviewNote: value,
                      },
                    }))
                  }
                  placeholder="Optional summary that applies across the portfolio"
                  multiline
                />
              </WizardSection>
            </>
          ) : null}

          {currentStep.id === 'activity' ? (
            <>
              <WizardSection title="Needs" 
              description="Capture the core reasons why you require this firearm. You can provide optional summary and note if you want to."
              onHelp={() => openHelp(getNeedsHelpKey(purposeType))}
              helpLabel="Help for needs"
              >
                {sectionType !== 's13' ? (
                  <>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Reason tags</Text>
                    <WizardOptionWrap>
                      {NEED_REASON_OPTIONS.filter((option) => allowedNeedReasonTags.includes(option.value)).map((option) => (
                        <WizardOptionButton
                          key={option.value}
                          label={option.label}
                          selected={(motivationProfile.needProfile?.reasonTags ?? []).includes(option.value)}
                          onPress={() => toggleNeedReasonTag(option.value)}
                        />
                      ))}
                    </WizardOptionWrap>
                  </>
                ) : null}
                <WizardField
                  label="Used firearms since"
                  value={usedFirearmsSince}
                  onChangeText={(value) => setUsedFirearmsSince(normalizeYearInput(value))}
                  placeholder="YYYY"
                  keyboardType="numeric"
                />
                {usedFirearmsSince && usedFirearmsSince.length < 4 ? (
                  <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                    Enter a 4-digit year (YYYY).
                  </Text>
                ) : null}
                <WizardField
                  label="Firearm owner since"
                  value={firearmOwnerSince}
                  onChangeText={(value) =>
                    setFirearmOwnerSince(normalizeYearInput(value))
                  }
                  placeholder="YYYY"
                  keyboardType="numeric"
                />
                {firearmOwnerSince && firearmOwnerSince.length < 4 ? (
                  <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                    Enter a 4-digit year (YYYY).
                  </Text>
                ) : null}
                {firearmOwnerSince && !usedFirearmsSince ? (
                  <Text style={[styles.helperText, styles.warningText, { color: tones.red.base }]}>
                    Used firearms since is required when Firearm owner since is provided.
                  </Text>
                ) : null}
                <WizardField
                  label="Primary need summary"
                  value={`${motivationProfile.needProfile?.primaryNeed ?? ''}`}
                  onChangeText={(value) => setNeedProfileField('primaryNeed', value)}
                  placeholder="Optional"
                  multiline
                />
                <WizardField
                  label="Need note"
                  value={`${motivationProfile.needProfile?.note ?? ''}`}
                  onChangeText={(value) => setNeedProfileField('note', value)}
                  placeholder="Optional"
                  multiline
                />
              </WizardSection>

              {purposeType === 'self_defence' ? (
                <WizardSection title="Self-defence context" 
                description="Select all the applicable risk factors that are relevant to you."
                onHelp={() => openHelp('helpMotivationSelfDefenceContext')}
                helpLabel="Help for self-defence context"
                >
                  <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Risk exposure</Text>
                  <WizardOptionWrap>
                    {RISK_EXPOSURE_OPTIONS.map((option) => (
                      <WizardOptionButton
                        key={option.value}
                        label={option.label}
                        selected={(motivationProfile.selfDefenceProfile?.exposureTags ?? []).includes(option.value)}
                        onPress={() =>
                          setSelfDefenceField(
                            'exposureTags',
                            toggleArrayValue(
                              motivationProfile.selfDefenceProfile?.exposureTags as MotivationRiskExposureTag[] | undefined,
                              option.value
                            )
                          )
                        }
                      />
                    ))}
                  </WizardOptionWrap>
                  {!selfDefenceValidation.hasExposure ? (
                    <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                      Select at least one risk-exposure pill, but more is better.
                    </Text>
                  ) : null}

                  <WizardField
                    label="Context note"
                    value={`${motivationProfile.selfDefenceProfile?.note ?? ''}`}
                    onChangeText={(value) => setSelfDefenceField('note', value)}
                    placeholder="Optional"
                    multiline
                  />
                </WizardSection>
              ) : null}

              {purposeType === 'hunting' || purposeType === 'mixed_hunting_sport' ? (
                <WizardSection title="Hunting activity" 
                description={
                  usesCalibreDerivedHuntingDistance
                    ? 'Select the relevant terrain details.'
                    : 'Select the relevant terrain and distance details.'
                }
                onHelp={() => openHelp(getHuntingActivityHelpKey(sectionType))}
                helpLabel="Help for hunting activity"
                >
                  <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Terrain</Text>
                  <WizardOptionWrap>
                    {HUNTING_TERRAIN_OPTIONS.map((option) => (
                      <WizardOptionButton
                        key={option.value}
                        label={option.label}
                        selected={(motivationProfile.huntingProfile?.terrainTags ?? []).includes(option.value)}
                        onPress={() =>
                          setHuntingField(
                            'terrainTags',
                            toggleArrayValue(
                              motivationProfile.huntingProfile?.terrainTags as MotivationHuntingTerrainTag[] | undefined,
                              option.value
                            )
                          )
                        }
                      />
                    ))}
                  </WizardOptionWrap>
                  {!huntingValidation.hasTerrain ? (
                    <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                      Select at least one terrain pill.
                    </Text>
                  ) : null}

                  {!usesCalibreDerivedHuntingDistance ? (
                    <>
                      <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Distance</Text>
                      <WizardOptionWrap>
                        {DISTANCE_OPTIONS.map((option) => (
                          <WizardOptionButton
                            key={option.value}
                            label={option.label}
                            selected={motivationProfile.huntingProfile?.distanceBand === option.value}
                            onPress={() => setHuntingField('distanceBand', option.value as MotivationDistanceBand)}
                          />
                        ))}
                      </WizardOptionWrap>
                      {!huntingValidation.hasDistance ? (
                        <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                          Select one distance pill.
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  <WizardField
                    label="Hunting note"
                    value={`${motivationProfile.huntingProfile?.note ?? ''}`}
                    onChangeText={(value) => setHuntingField('note', value)}
                    placeholder="Optional"
                    multiline
                  />
                </WizardSection>
              ) : null}

              {purposeType === 'sport_shooting' || purposeType === 'mixed_hunting_sport' ? (
                <WizardSection title="Sport activity" 
                description="Capture disciplines without forcing long text."
                onHelp={() => openHelp(getSportActivityHelpKey(sectionType))}
                helpLabel="Help for sport activity"
                >
                  <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>Disciplines</Text>
                  <WizardOptionWrap>
                    {SPORT_DISCIPLINE_OPTIONS.map((option) => (
                      <WizardOptionButton
                        key={option.value}
                        label={option.label}
                        selected={(motivationProfile.sportProfile?.disciplineTags ?? []).includes(option.value)}
                        onPress={() =>
                          setSportField(
                            'disciplineTags',
                            toggleArrayValue(
                              motivationProfile.sportProfile?.disciplineTags as MotivationSportDisciplineTag[] | undefined,
                              option.value
                            )
                          )
                        }
                      />
                    ))}
                  </WizardOptionWrap>
                  {!sportValidation.hasDiscipline ? (
                    <Text style={[styles.helperText, styles.warningText, { color: tones.orange.base }]}>
                      Select at least one discipline pill.
                    </Text>
                  ) : null}

                  <WizardField
                    label="Sport note"
                    value={`${motivationProfile.sportProfile?.note ?? ''}`}
                    onChangeText={(value) => setSportField('note', value)}
                    placeholder="Optional"
                    multiline
                  />
                </WizardSection>
              ) : null}
            </>
          ) : null}

          {currentStep.id === 'preview' ? (
            <>
              <WizardSection title="Preview summary" 
              description="This is the generated numbered motivation output from the current structured profile."
              onHelp={() => openHelp('helpMotivationPreviewSummary')}
              helpLabel="Help for preview summary"
              >
                <Text style={[styles.previewMeta, { color: tones.grey.base }]}>
                  Renewal · {sectionType.toUpperCase()} · {PURPOSE_TYPE_LABELS[purposeType]}
                </Text>
                <Text style={[styles.previewText, { color: tones.grey.onSurface }]} selectable>
                  {composed.text}
                </Text>
              </WizardSection>

              {showPreviewBenchmark ? (
                <WizardSection title="Benchmark" 
                description="Only available in dev mode to see whether the generated output broadly matches the benchmark expectations."
                onHelp={() => openHelp('helpMotivationBenchmark')}
                helpLabel="Help for benchmark"
                >
                  {benchmark ? (
                    <>
                      <Text
                        style={[
                          styles.benchmarkStatus,
                          { color: benchmark.passed ? tones.green.base : tones.orange.base },
                        ]}
                      >
                        {benchmark.passed ? 'Benchmark passed' : 'Benchmark has gaps'}
                      </Text>
                      {benchmark.missingSections.length ? (
                        <Text style={[styles.helperText, { color: tones.grey.base }]}>
                          Missing sections: {benchmark.missingSections.join(', ')}
                        </Text>
                      ) : null}
                      {benchmark.missingPhrases.length ? (
                        <Text style={[styles.helperText, { color: tones.grey.base }]}>
                          Missing phrases: {benchmark.missingPhrases.join(', ')}
                        </Text>
                      ) : null}
                      {benchmark.paragraphFailures.length ? (
                        <Text style={[styles.helperText, { color: tones.grey.base }]}>
                          Paragraph depth: {benchmark.paragraphFailures.map((item) => `${item.sectionId} ${item.actual}/${item.expected}`).join(' · ')}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={[styles.helperText, { color: tones.grey.base }]}>
                      No benchmark rubric is defined for this section and purpose combination yet.
                    </Text>
                  )}
                </WizardSection>
              ) : null}

              {showPreviewStructuredProfile ? (
                <WizardSection title="Structured profile" 
                description="Debug view for the underlying structured model the UI is building."
                onHelp={() => openHelp('helpMotivationStructuredProfile')}
                helpLabel="Help for structured profile"
                >
                  <Text style={[styles.debugText, { color: tones.grey.onSurface }]} selectable>
                    {JSON.stringify(
                      {
                        applicationType,
                        sectionType,
                        purposeType,
                        computedApplicantSex,
                        includesS9,
                        targetFirearm,
                        motivationProfile,
                      },
                      null,
                      2
                    )}
                  </Text>
                </WizardSection>
              ) : null}
            </>
          ) : null}

          <WizardFooterNav
            nextLabel={currentStepPosition === visibleStepCount ? 'Done' : 'Next'}
            onPrevious={() => setStepWithScrollReset(Math.max(0, stepIndex - 1))}
            onNext={() =>
              currentStepPosition === visibleStepCount
                ? closeWizard()
                : handleStepChange(Math.min(visibleStepCount - 1, stepIndex + 1))
            }
            disablePrevious={isFirstStep}
            disableNext={!isLastStep && !isCurrentStepValid}
          />
        </PageScrollView>
      </View>
      <SelectSheet
        visible={provinceSheetVisible}
        title="Province"
        options={PROVINCE_OPTIONS.map((province) => ({ value: province, label: province }))}
        selected={
          (motivationProfile.applicantContext?.residenceProvince as (typeof PROVINCE_OPTIONS)[number] | undefined)
        }
        onCancel={() => setProvinceSheetVisible(false)}
        onPick={(province) => {
          setApplicantContextField('residenceProvince', province);
          persistProfileAddressPatch({ province });
          setProvinceSheetVisible(false);
        }}
      />
      <SelectSheet
        visible={homeTypeSheetVisible}
        title="Home type"
        options={HOME_TYPE_OPTIONS.map((value) => ({ value, label: value }))}
        selected={homeType}
        onCancel={() => setHomeTypeSheetVisible(false)}
        onPick={(value) => {
          setHomeType(value);
          persistProfileAddressPatch({ homeType: value });
          setHomeTypeSheetVisible(false);
        }}
      />
      <HelpModal {...helpModalProps} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  stepRowWrap: {
    paddingHorizontal: 20,
  },
  content: {
    paddingBottom: 32,
    gap: 18,
  },
  membershipBlock: {
    gap: 8,
  },
  sectionNoBg: {
    backgroundColor: 'transparent',
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 0,
    marginBottom: 0,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 0,
    marginBottom: 0,
  },
  warningText: {
    marginTop: 4,
  },
  comparisonItem: {
    gap: 10,
  },
  comparisonDivider: {
    width: '100%',
    borderBottomWidth: 1,
    marginTop: 2,
    marginBottom: 6,
  },
  firstComparisonItem: {
    marginBottom: 10,
  },
  includeHint: {
    marginTop: 0,
  },
  previewMeta: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewText: {
    fontSize: 14,
    lineHeight: 22,
  },
  benchmarkStatus: {
    fontSize: 15,
    fontWeight: '800',
  },
  debugText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
