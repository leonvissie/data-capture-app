import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, LayoutAnimation, Platform, Pressable, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import Button from '../../src/components/Button';
import ButtonSave from '../../src/components/ButtonSave';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import { useTones } from '../../src/theme/tones';
import { listByType, getById } from '../../src/data/sqlite';
import { SupportingStatement, SupportingStatementSlot, Profile } from '../../src/data/types';
import { createSupportingStatement } from '../../src/data/defaults';
import { saveEntity } from '../../src/data/sqlite';
import { touch } from '../../src/data/repo';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import supportingConfig from '../../src/config/supportingStatement.json';
import { useHelpModal } from '../../src/help';
import HelpModal from '../../src/components/HelpModal';
import {
  getReferenceByStatementAndCategory,
  getReferenceByStatementCategoryAndDetail,
  resolveProfileAddressLine,
  statementNumberFromSlot,
  upsertReference,
} from '../../src/utils/references';

type YesNo = 'yes' | 'no';
type RelationshipCategory = 'spouse' | 'family' | 'friend' | 'colleague' | 'neighbour';
type SlotKey = SupportingStatementSlot;
type KnowledgeOption = { value: string; label: string; phrase?: string };

type SupportingStatementConfig = typeof supportingConfig & {
  slotRelationshipRules?: Partial<Record<SlotKey, RelationshipCategory[]>>;
  firearmScenarioSection?: {
    title?: string;
    description?: string;
    selectionMode?: 'single' | 'multiple';
    knowledgeOptions?: Array<{ value: string; label: string; phrase?: string }>;
    frequencyOptions?: string[];
    frequencyPeriodOptions?: string[];
    scenarios?: Array<{ key: string; label: string; visible?: boolean; template: string }>;
  };
};

type ScenarioSelection = {
  enabled?: boolean;
  knowledge?: string;
  frequency?: string;
  frequencyPeriod?: string;
};

type ScenarioValidationState = {
  knowledge?: boolean;
  frequency?: boolean;
  frequencyPeriod?: boolean;
};

type ValidationState = {
  supporterFullName?: boolean;
  supporterIdNumber?: boolean;
  supporterMobile?: boolean;
  supporterAddress?: boolean;
  relationshipCategory?: boolean;
  relationshipDetail?: boolean;
  relationshipDetailOther?: boolean;
  yearsKnown?: boolean;
  colleagueWorkplace?: boolean;
  colleagueRole?: boolean;
  firearmTogether?: boolean;
  firearmContexts?: boolean;
  firearmContextOther?: boolean;
  place?: boolean;
  date?: boolean;
  dateInvalid?: boolean;
  scenario: Record<string, ScenarioValidationState>;
};

type SectionKey = 'person' | 'relationship' | 'activities' | 'colleague' | 'signature';
const SUPPORTING_STATEMENT_HELP_KEY = 'helpDocSupportingStatement';

const emptyValidationState: ValidationState = {
  scenario: {},
};

const getAllowedRelationshipCategories = (
  config: SupportingStatementConfig,
  slot: SupportingStatementSlot,
): RelationshipCategory[] => {
  const fallbackBySlot: Record<SupportingStatementSlot, RelationshipCategory[]> = {
    spouse_family: ['spouse', 'family'],
    friend_colleague_neighbour: ['friend', 'colleague', 'neighbour'],
    additional_reference: ['family', 'friend', 'colleague', 'neighbour'],
  };
  const configured = config.slotRelationshipRules?.[slot];
  const list = Array.isArray(configured) && configured.length ? configured : fallbackBySlot[slot];
  return list.filter((item): item is RelationshipCategory =>
    ['spouse', 'family', 'friend', 'colleague', 'neighbour'].includes(item)
  );
};

const isWizardDataEmpty = (data: WizardData) => {
  const hasScenarioValues = Object.values(data.scenarioSelections ?? {}).some(
    (entry) => Boolean(entry?.enabled) || Boolean(entry?.knowledge) || Boolean(entry?.frequency) || Boolean(entry?.frequencyPeriod),
  );
  return !(
    data.supporterFullName.trim() ||
    data.supporterIdNumber.trim() ||
    data.supporterMobile.trim() ||
    data.supporterAddress.trim() ||
    data.relationshipDetail.trim() ||
    data.relationshipDetailOther.trim() ||
    data.yearsKnown.trim() ||
    data.colleagueWorkplace.trim() ||
    data.colleagueRole.trim() ||
    data.firearmTogether ||
    data.firearmContexts.length ||
    data.firearmContextOther.trim() ||
    hasScenarioValues ||
    data.comments.trim() ||
    data.place.trim() ||
    data.date.trim()
  );
};

const renderScenarioTemplate = (
  template: string,
  selected: ScenarioSelection | undefined,
  knowledgeOptions: KnowledgeOption[],
  applicantFirstName: string,
  applicantObjectPronoun: string,
  applicantSubjectPronoun: string,
) => {
  const knowledge = knowledgeOptions.find((item) => item.value === selected?.knowledge);
  const knowledgePhrase = knowledge?.phrase ?? knowledge?.label?.toLowerCase() ?? 'am aware that';
  const showGoes = selected?.knowledge === 'aware' ? 'goes ' : '';
  const showOn = selected?.knowledge !== 'aware' ? 'on ' : '';
  const showTo = selected?.knowledge !== 'aware' ? 'to ' : '';
  const takesPartInTo = selected?.knowledge !== 'aware' ? 'to ' : 'takes part in';
  const showAttendsTo = selected?.knowledge !== 'aware' ? 'to ' : 'attends ';
  const showPerformsTo = selected?.knowledge !== 'aware' ? 'to ' : 'performs ';
  const hideFrequencyDetails = selected?.knowledge === 'haveAccompanied';
  const frequency = hideFrequencyDetails ? '' : selected?.frequency || '[frequency]';
  const frequencyPeriod = hideFrequencyDetails ? '' : selected?.frequencyPeriod || '[period]';
  const showAtLeast = hideFrequencyDetails
    ? ''
    : frequency.trim().toLowerCase() === 'multiple times'
      ? ''
      : 'at least ';

  return template
    .replace('{{knowledgePhrase}}', knowledgePhrase)
    .replace('{{showGoes}}', showGoes)
    .replace('{{showOn}}', showOn)
    .replace('{{showTo}}', showTo)
    .replace('{{takesPartInTo}}', takesPartInTo)
    .replace('{{showAttendsTo}}', showAttendsTo)
    .replace('{{showPerformsTo}}', showPerformsTo)
    .replace('{{applicantFirstName}}', applicantFirstName)
    .replace('{{applicantObjectPronoun}}', applicantObjectPronoun)
    .replace('{{applicantSubjectPronoun}}', applicantSubjectPronoun)
    .replace('{{showAtLeast}}', showAtLeast)
    .replace('{{frequency}}', frequency)
    .replace('{{frequencyPeriod}}', frequencyPeriod);
};

type WizardData = {
  supporterFullName: string;
  supporterIdNumber: string;
  supporterMobile: string;
  supporterAddress: string;
  relationshipCategory: RelationshipCategory | '';
  relationshipDetail: string;
  relationshipDetailOther: string;
  yearsKnown: string;
  colleagueWorkplace: string;
  colleagueRole: string;
  firearmTogether: YesNo | '';
  firearmContexts: string[];
  firearmContextOther: string;
  scenarioSelections: Record<string, ScenarioSelection>;
  comments: string;
  place: string;
  date: string;
};

const emptyWizardData: WizardData = {
  supporterFullName: '',
  supporterIdNumber: '',
  supporterMobile: '',
  supporterAddress: '',
  relationshipCategory: '',
  relationshipDetail: '',
  relationshipDetailOther: '',
  yearsKnown: '',
  colleagueWorkplace: '',
  colleagueRole: '',
  firearmTogether: '',
  firearmContexts: [],
  firearmContextOther: '',
  scenarioSelections: {},
  comments: '',
  place: '',
  date: '',
};

const yesNoOptions: Array<{ label: string; value: YesNo }> = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
];

const resolveApplicantName = (profile: Profile | null) => {
  const full = [profile?.givenNames, profile?.surname].filter(Boolean).join(' ').trim();
  const first = (profile?.givenNames || '').split(' ').filter(Boolean)[0] || profile?.surname || 'the applicant';
  const possessive = first.endsWith('s') ? `${first}'` : `${first}'s`;
  return {
    full: full || 'the applicant',
    first,
    possessive,
  };
};

const resolveApplicantPronouns = (profile: Profile | null) => {
  const rawId = `${profile?.idNumber ?? ''}`.replace(/\D/g, '');
  if (rawId.length < 10) {
    return { object: 'them', subject: 'they' };
  }
  const genderDigits = Number(rawId.slice(6, 10));
  if (!Number.isFinite(genderDigits)) {
    return { object: 'them', subject: 'they' };
  }
  if (genderDigits >= 0 && genderDigits <= 4999) {
    return { object: 'her', subject: 'she' };
  }
  if (genderDigits >= 5000 && genderDigits <= 9999) {
    return { object: 'him', subject: 'he' };
  }
  return { object: 'them', subject: 'they' };
};

const normalizeSpace = (value: string) => value.replace(/[ \t]{2,}/g, ' ').trim();

const toOrdinal = (day: number) => {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
};

const formatFormalDate = (value: string) => {
  const raw = value.trim();
  if (!raw) return '[Date]';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year: number | null = null;
  let monthIndex: number | null = null;
  let day: number | null = null;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    monthIndex = Number(isoMatch[2]) - 1;
    day = Number(isoMatch[3]);
  } else {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      year = parsed.getUTCFullYear();
      monthIndex = parsed.getUTCMonth();
      day = parsed.getUTCDate();
    }
  }

  if (
    year === null ||
    monthIndex === null ||
    day === null ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return raw;
  }

  const month = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${toOrdinal(day)} day of ${month}, ${year}`;
};

const maskYYYYMMDD = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

const normalizeDebugPreviewText = (value: string) =>
  value
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

const isValidIsoDate = (value: string) => {
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
};

const parseYearsKnown = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
};

const calculatePartnerSinceYearFromYearsKnown = (value: string): string | undefined => {
  const yearsKnown = parseYearsKnown(value);
  if (yearsKnown == null) return undefined;
  const currentYear = new Date().getFullYear();
  const sinceYear = currentYear - yearsKnown;
  if (!Number.isFinite(sinceYear) || sinceYear < 1900 || sinceYear > currentYear) return undefined;
  return String(sinceYear);
};

const calculateYearsKnownFromSinceYear = (sinceYear?: string): string | undefined => {
  const raw = `${sinceYear ?? ''}`.trim();
  if (!/^\d{4}$/.test(raw)) return undefined;
  const year = Number.parseInt(raw, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(year) || year > currentYear) return undefined;
  const yearsKnown = currentYear - year;
  if (!Number.isFinite(yearsKnown) || yearsKnown < 0) return undefined;
  return String(yearsKnown);
};

const resolveRelationshipSentence = (data: WizardData, applicantName: string) => {
  const detail = data.relationshipDetail === 'Other' ? data.relationshipDetailOther : data.relationshipDetail;
  if (data.relationshipCategory === 'spouse') {
    return `I am the applicant's ${detail || 'spouse'}.`;
  }
  if (data.relationshipCategory === 'family') {
    return `I am the applicant's ${detail || 'family member'}.`;
  }
  if (data.relationshipCategory === 'friend') {
    return `I am a ${detail ? detail.toLowerCase() : 'friend'} of the applicant.`;
  }
  if (data.relationshipCategory === 'colleague') {
    return `I am a ${detail ? detail.toLowerCase() : 'colleague'} of the applicant.`;
  }
  if (data.relationshipCategory === 'neighbour') {
    return `I am a ${detail ? detail.toLowerCase() : 'neighbour'} of the applicant.`;
  }
  return `I am a reference for ${applicantName}.`;
};

const buildStatementText = (
  data: WizardData,
  profile: Profile | null,
  config: typeof supportingConfig,
  status?: SupportingStatement['status'],
) => {
  const applicant = resolveApplicantName(profile);
  const applicantPronouns = resolveApplicantPronouns(profile);
  const relationshipSentence = resolveRelationshipSentence(data, applicant.full);
  const comments = data.comments.trim();
  const firearmContexts = data.firearmContexts.includes('Other')
    ? [...data.firearmContexts.filter((c) => c !== 'Other'), data.firearmContextOther].filter(Boolean)
    : data.firearmContexts;
  const firearmContextText = firearmContexts.length ? firearmContexts.join(', ') : 'shooting activities';
  const firearmTogetherSentence =
    data.firearmTogether === 'yes'
      ? `We have spent time handling firearms together during ${firearmContextText}.`
      : 'I have not personally handled firearms with the applicant.';

  const maybeColleagueWorkplace =
    data.relationshipCategory === 'colleague'
      ? config.template.colleague.workplace
          .replace('{{colleagueWorkplace}}', data.colleagueWorkplace || 'our workplace')
          .replace('{{applicantFirstName}}', applicant.first)
          .replace('{{colleagueRole}}', data.colleagueRole || 'a colleague')
      : '';
  const maybeColleagueFirearm =
    data.relationshipCategory === 'colleague'
      ? config.template.colleague.firearmTogether.replace('{{firearmTogetherSentence}}', firearmTogetherSentence)
      : '';
  const supporterName = data.supporterFullName || '[Full names & surname]';
  const formalDate = formatFormalDate(data.date || '');
  const closingBlock = config.template.closing
    .replace('{{place}}', data.place || '[Place]')
    .replace('{{date}}', formalDate)
    .replace('{{supporterFullName}}', supporterName);
  const datedLine = closingBlock.split(/\r?\n/)[0] || '';
  const signatureLine = '__________________________';
  const closingWithSpacing = `${datedLine}\n\n\n${signatureLine}\n${supporterName}`;
  const scenarioSection = (config as SupportingStatementConfig).firearmScenarioSection;
  const knowledgeOptions = Array.isArray(scenarioSection?.knowledgeOptions)
    ? scenarioSection!.knowledgeOptions!
    : [];
  const scenarios = Array.isArray(scenarioSection?.scenarios) ? scenarioSection!.scenarios! : [];
  const visibleScenarios = scenarios.filter((scenario) => scenario.visible !== false);
  const enabledScenarios = visibleScenarios.filter((scenario) => data.scenarioSelections?.[scenario.key]?.enabled);
  const scenarioLines = enabledScenarios
    .map((scenario, index) => {
      const selected = data.scenarioSelections?.[scenario.key];
      if (!selected?.enabled) return null;
      const scenarioText = renderScenarioTemplate(
        scenario.template,
        selected,
        knowledgeOptions,
        applicant.first,
        applicantPronouns.object,
        applicantPronouns.subject,
      );
      return `3.${index + 1}. ${scenarioText}`;
    })
    .filter(Boolean) as string[];

  const heading =
    status === 'draft'
      ? 'CHARACTER REFERENCE (INCOMPLETE)'
      : 'CHARACTER REFERENCE';

  const lines = [
    heading,
    '',
    config.template.intro
      .replace('{{supporterFullName}}', data.supporterFullName || '[Full names & surname]')
      .replace('{{supporterIdNumber}}', data.supporterIdNumber || '[ID number]')
      .replace('{{supporterAddress}}', data.supporterAddress || '[Address]'),
    config.template.aware.replace('{{applicantFullName}}', applicant.full),
    config.template.relationship.replace('{{relationshipSentence}}', relationshipSentence),
    config.template.yearsKnown
      .replace('{{applicantFirstName}}', applicant.first)
      .replace('{{yearsKnown}}', data.yearsKnown || '0'),
    ...scenarioLines,
    config.template.emotionalStable
      .replace('{{applicantFirstName}}', applicant.first)
      .replace('{{applicantPossessive}}', applicant.possessive),
    config.template.inclinedViolent
      .replace('{{applicantFirstName}}', applicant.first),
    config.template.aggressive
      .replace('{{applicantFirstName}}', applicant.first)
      .replace('{{applicantPossessive}}', applicant.possessive),
    config.template.substances
      .replace('{{applicantFirstName}}', applicant.first),
    config.template.responsible
      .replace('{{applicantFirstName}}', applicant.first),
    ...(comments ? [config.template.comments.replace('{{additionalComments}}', comments)] : []),
    maybeColleagueWorkplace,
    maybeColleagueFirearm,
    '',
    closingWithSpacing,
  ]
    .filter((line) => line !== '')
    .map((line) => normalizeSpace(line));

  return lines.join('\n\n');
};

export default function SupportingStatementWizard() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const { open: openHelp, props: helpModalProps } = useHelpModal();
  const params = useLocalSearchParams<{ statementId?: string; slot?: string; nav?: string; new?: string }>();
  const navCtx = useMemo(() => {
    if (!params?.nav) return null;
    try {
      return decodeNav(JSON.parse(params.nav as string));
    } catch {
      return decodeNav(null);
    }
  }, [params?.nav]);

  const profile = useMemo(() => listByType<Profile>('Profile')[0] ?? null, []);
  const readLatestProfile = useCallback(
    () => (profile?.id ? getById<Profile>(String(profile.id)) ?? profile : profile),
    [profile]
  );
  const [statementId, setStatementId] = useState<string | null>(params.statementId ? String(params.statementId) : null);
  const config = supportingConfig as SupportingStatementConfig;

  const statement = useMemo(() => {
    if (statementId) {
      return getById<SupportingStatement>(statementId) ?? null;
    }
    const slotParam = params.slot as SupportingStatementSlot | undefined;
    if (!profile?.id || !slotParam) return null;
    const list = listByType<SupportingStatement>('SupportingStatement');
    return list.find((item) => item.holderProfileId === profile.id && item.slot === slotParam) ?? null;
  }, [statementId, profile?.id, params.slot]);

  const activeSlot = useMemo<SupportingStatementSlot>(() => {
    const slotParam = params.slot as SupportingStatementSlot | undefined;
    if (
      slotParam === 'spouse_family' ||
      slotParam === 'friend_colleague_neighbour' ||
      slotParam === 'additional_reference'
    ) return slotParam;
    if (
      statement?.slot === 'spouse_family' ||
      statement?.slot === 'friend_colleague_neighbour' ||
      statement?.slot === 'additional_reference'
    ) {
      return statement.slot;
    }
    return 'spouse_family';
  }, [params.slot, statement?.slot]);

  const isNewFlow = String(params.new ?? '') === '1';

  const initialData = useMemo(() => {
    const stored = statement?.wizardData ?? {};
    const merged = { ...emptyWizardData, ...stored } as WizardData;
    const allowedForSlot = getAllowedRelationshipCategories(config, activeSlot);
    if (!merged.relationshipCategory || !allowedForSlot.includes(merged.relationshipCategory)) {
      merged.relationshipCategory = '';
      merged.relationshipDetail = '';
      merged.relationshipDetailOther = '';
    }
    if (!merged.date) {
      const today = new Date();
      merged.date = today.toISOString().slice(0, 10);
    }
    if (isNewFlow) return merged;
    return merged;
  }, [statement?.wizardData, config, activeSlot, isNewFlow]);

  const [form, setForm] = useState<WizardData>(initialData);
  const [supporterAddressHeight, setSupporterAddressHeight] = useState(56);
  const [dateBlurred, setDateBlurred] = useState(false);
  const [validation, setValidation] = useState<ValidationState>(emptyValidationState);
  const [showValidation, setShowValidation] = useState(false);
  const scrollRef = useRef<ScrollViewType | null>(null);
  const sectionYRef = useRef<Record<SectionKey, number>>({
    person: 0,
    relationship: 0,
    activities: 0,
    colleague: 0,
    signature: 0,
  });
  const scenarioYRef = useRef<Record<string, number>>({});
  const initialSnapshot = useMemo(() => JSON.stringify(initialData), [initialData]);
  const hasUnsavedChanges = useMemo(() => JSON.stringify(form) !== initialSnapshot, [form, initialSnapshot]);
  const persistedStatus = statement?.status ?? 'empty';
  const resetDisabled = persistedStatus === 'empty';

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const setField = useCallback(
    <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const relationshipOptions = config.relationshipOptions;
  const scenarioConfig = config.firearmScenarioSection;
  const visibleScenarios = useMemo(
    () => (scenarioConfig?.scenarios ?? []).filter((scenario) => scenario.visible !== false),
    [scenarioConfig?.scenarios],
  );
  const knowledgeOptions = scenarioConfig?.knowledgeOptions ?? [];
  const frequencyOptions = scenarioConfig?.frequencyOptions ?? [];
  const frequencyPeriodOptions = scenarioConfig?.frequencyPeriodOptions ?? [];
  const allowedRelationshipCategories = useMemo<RelationshipCategory[]>(
    () => getAllowedRelationshipCategories(config, activeSlot),
    [config, activeSlot],
  );

  const selectedRelOptions =
    form.relationshipCategory ? (relationshipOptions[form.relationshipCategory] ?? []) : [];
  const firearmOptions = supportingConfig.firearmContextOptions;

  const statementText = useMemo(
    () =>
      buildStatementText(
        form,
        profile,
        config,
        persistedStatus === 'draft' ? 'draft' : 'complete'
      ),
    [config, form, persistedStatus, profile],
  );
  const applicantNameForScenarioPreview = useMemo(() => resolveApplicantName(profile), [profile]);
  const applicantPronounsForScenarioPreview = useMemo(() => resolveApplicantPronouns(profile), [profile]);

  const ensureStatement = useCallback(() => {
    if (!profile?.id) return null;
    if (statement) return statement;
    const created = createSupportingStatement(profile.id, { slot: activeSlot });
    saveEntity(created);
    setStatementId(String(created.id));
    return created;
  }, [activeSlot, profile?.id, statement]);

  useEffect(() => {
    if (!profile?.id) return;
    const target = statement ?? ensureStatement();
    if (!target) return;
    if (target.status !== undefined && target.status !== null) return;
    const updated: SupportingStatement = touch({
      ...target,
      status: 'empty',
    });
    saveEntity(updated);
    if (!statementId) setStatementId(String(updated.id));
  }, [ensureStatement, profile?.id, statement, statementId]);

  const handleClose = useCallback(() => {
    backOrReplaceWithContext(router, navCtx ?? undefined, '/(tabs)/profile');
  }, [router, navCtx]);

  const toggleContext = (value: string) => {
    const next = form.firearmContexts.includes(value)
      ? form.firearmContexts.filter((item) => item !== value)
      : [...form.firearmContexts, value];
    setField('firearmContexts', next);
  };
  const toggleScenario = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setForm((prev) => {
      const current = prev.scenarioSelections?.[key] ?? {};
      const nextEnabled = !current.enabled;
      return {
        ...prev,
        scenarioSelections: {
          ...(prev.scenarioSelections ?? {}),
          [key]: {
            ...current,
            enabled: nextEnabled,
          },
        },
      };
    });
  }, []);

  const setScenarioField = useCallback(
    (key: string, field: keyof ScenarioSelection, value: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setForm((prev) => {
        const current = prev.scenarioSelections?.[key] ?? {};
        return {
          ...prev,
          scenarioSelections: {
            ...(prev.scenarioSelections ?? {}),
            [key]: {
              ...current,
              enabled: true,
              [field]: value,
            },
          },
        };
      });
    },
    [],
  );

  const scrollToY = useCallback((y: number) => {
    const target = Number.isFinite(y) ? Math.max(0, y - 16) : 0;
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, []);

  const validateForm = useCallback((data: WizardData) => {
    const next: ValidationState = { scenario: {} };
    let firstErrorY: number | null = null;

    const markFirstSection = (section: SectionKey) => {
      if (firstErrorY !== null) return;
      firstErrorY = sectionYRef.current[section] ?? 0;
    };
    const markFirstScenario = (scenarioKey: string) => {
      if (firstErrorY !== null) return;
      firstErrorY = scenarioYRef.current[scenarioKey] ?? sectionYRef.current.activities ?? 0;
    };

    if (!data.supporterFullName.trim()) {
      next.supporterFullName = true;
      markFirstSection('person');
    }
    if (!data.supporterIdNumber.trim()) {
      next.supporterIdNumber = true;
      markFirstSection('person');
    }
    if (!data.supporterMobile.trim()) {
      next.supporterMobile = true;
      markFirstSection('person');
    }
    if (!data.supporterAddress.trim()) {
      next.supporterAddress = true;
      markFirstSection('person');
    }
    if (!data.relationshipCategory) {
      next.relationshipCategory = true;
      markFirstSection('relationship');
    }
    if (!data.relationshipDetail.trim()) {
      next.relationshipDetail = true;
      markFirstSection('relationship');
    }
    if (data.relationshipDetail === 'Other' && !data.relationshipDetailOther.trim()) {
      next.relationshipDetailOther = true;
      markFirstSection('relationship');
    }
    if (!data.yearsKnown.trim()) {
      next.yearsKnown = true;
      markFirstSection('relationship');
    }

    visibleScenarios.forEach((scenario) => {
      const selected = data.scenarioSelections?.[scenario.key];
      if (!selected?.enabled) return;
      const hideFrequencyInputs = !selected.knowledge || selected.knowledge === 'haveAccompanied';
      const scenarioMissing: ScenarioValidationState = {
        knowledge: !selected.knowledge,
        frequency: !hideFrequencyInputs && !selected.frequency,
        frequencyPeriod: !hideFrequencyInputs && !selected.frequencyPeriod,
      };
      if (scenarioMissing.knowledge || scenarioMissing.frequency || scenarioMissing.frequencyPeriod) {
        next.scenario[scenario.key] = scenarioMissing;
        markFirstScenario(scenario.key);
      }
    });

    if (data.relationshipCategory === 'colleague') {
      if (!data.colleagueWorkplace.trim()) {
        next.colleagueWorkplace = true;
        markFirstSection('colleague');
      }
      if (!data.colleagueRole.trim()) {
        next.colleagueRole = true;
        markFirstSection('colleague');
      }
      if (!data.firearmTogether) {
        next.firearmTogether = true;
        markFirstSection('colleague');
      }
      if (data.firearmTogether === 'yes' && data.firearmContexts.length === 0) {
        next.firearmContexts = true;
        markFirstSection('colleague');
      }
      if (data.firearmTogether === 'yes' && data.firearmContexts.includes('Other') && !data.firearmContextOther.trim()) {
        next.firearmContextOther = true;
        markFirstSection('colleague');
      }
    }

    if (!data.place.trim()) {
      next.place = true;
      markFirstSection('signature');
    }
    if (!data.date.trim()) {
      next.date = true;
      markFirstSection('signature');
    } else if (!isValidIsoDate(data.date)) {
      next.dateInvalid = true;
      markFirstSection('signature');
    }

    const hasErrors = Boolean(
      next.supporterFullName ||
      next.supporterIdNumber ||
      next.supporterMobile ||
      next.supporterAddress ||
      next.relationshipCategory ||
      next.relationshipDetail ||
      next.relationshipDetailOther ||
      next.yearsKnown ||
      Object.keys(next.scenario).length > 0 ||
      next.colleagueWorkplace ||
      next.colleagueRole ||
      next.firearmTogether ||
      next.firearmContexts ||
      next.firearmContextOther ||
      next.place ||
      next.date ||
      next.dateInvalid,
    );

    return { hasErrors, state: next, firstErrorY: firstErrorY ?? 0 };
  }, [visibleScenarios]);

  useEffect(() => {
    if (!showValidation) return;
    setValidation(validateForm(form).state);
  }, [form, showValidation, validateForm]);

  const handleSave = useCallback(() => {
    if (!profile?.id) {
      Alert.alert('Profile needed', 'Please add your profile details first.');
      return;
    }
    const sanitizedScenarioSelections = Object.fromEntries(
      Object.entries(form.scenarioSelections ?? {}).map(([key, selected]) => {
        if (selected?.enabled) return [key, selected];
        return [key, { enabled: false }];
      }),
    ) as WizardData['scenarioSelections'];
    const formForSave: WizardData = {
      ...form,
      scenarioSelections: sanitizedScenarioSelections,
    };

    const validationResult = validateForm(formForSave);
    const target = ensureStatement();
    if (!target) return;

    const persistStatement = (status: SupportingStatement['status']) => {
      const latestProfile = readLatestProfile();
      if (latestProfile?.id) {
        const refType =
          (formForSave.relationshipDetail === 'Other'
            ? formForSave.relationshipDetailOther
            : formForSave.relationshipDetail
          ).trim();
        const isSpouse = formForSave.relationshipCategory === 'spouse';
        const nextReference = {
          statementNumber: statementNumberFromSlot(activeSlot),
          relationshipCategory: formForSave.relationshipCategory || undefined,
          relationshipDetail: refType || undefined,
          type: refType || undefined,
          fullNames: formForSave.supporterFullName.trim() || undefined,
          idNumber: formForSave.supporterIdNumber.trim() || undefined,
          mobile: formForSave.supporterMobile.trim() || undefined,
          address: isSpouse
            ? resolveProfileAddressLine(latestProfile)
            : (formForSave.supporterAddress.trim() || undefined),
          since: calculatePartnerSinceYearFromYearsKnown(formForSave.yearsKnown),
        };
        const updatedProfile: Profile = touch({
          ...latestProfile,
          maritalStatus: isSpouse ? 'married' : latestProfile.maritalStatus,
          references: upsertReference(latestProfile.references ?? [], nextReference),
        });
        saveEntity(updatedProfile);
      }
      const updated: SupportingStatement = touch({
        ...target,
        status,
        mode: 'wizard',
        wizardData: formForSave,
        generatedText: buildStatementText(formForSave, profile, config, status),
      });
      saveEntity(updated);
    };

    if (validationResult.hasErrors) {
      setShowValidation(false);
      const message = validationResult.state.dateInvalid
        ? 'Please enter a valid date in YYYY-MM-DD format.'
        : 'Please complete all required fields before saving.';
      Alert.alert(
        'Required fields missing',
        message,
        [
          {
            text: 'Review',
            onPress: () => {
              setValidation(validationResult.state);
              setShowValidation(true);
              scrollToY(validationResult.firstErrorY);
            },
          },
          {
            text: 'Continue',
            onPress: () => {
              persistStatement('draft');
              setShowValidation(false);
              backOrReplaceWithContext(router, navCtx ?? undefined, '/(tabs)/profile');
            },
          },
        ],
      );
      return;
    }
    setValidation(validationResult.state);
    persistStatement('complete');
    setShowValidation(false);
    backOrReplaceWithContext(router, navCtx ?? undefined, '/(tabs)/profile');
  }, [profile?.id, validateForm, form, ensureStatement, profile, config, router, navCtx, scrollToY, readLatestProfile]);

  const handleAttemptClose = useCallback(() => {
    if (isWizardDataEmpty(form)) {
      handleClose();
      return;
    }
    if (!hasUnsavedChanges) {
      handleClose();
      return;
    }
    Alert.alert(
      'Unsaved changes',
      'Do you want to save your changes before leaving?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: handleClose },
        { text: 'Save', onPress: handleSave },
      ],
      { cancelable: true },
    );
  }, [form, hasUnsavedChanges, handleClose, handleSave]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset statement?',
      'This will clear all form values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          style: 'destructive',
          onPress: () => {
            const clearedForm: WizardData = { ...emptyWizardData };
            setForm(clearedForm);
            setSupporterAddressHeight(56);
            setValidation(emptyValidationState);
            setShowValidation(false);
            setDateBlurred(false);
            if (profile?.id) {
              const target = ensureStatement();
              if (target) {
                const updated: SupportingStatement = touch({
                  ...target,
                  status: 'empty',
                  mode: 'wizard',
                  wizardData: clearedForm,
                  generatedText: '',
                });
                saveEntity(updated);
              }
            }
            scrollToY(0);
          },
        },
      ],
      { cancelable: true },
    );
  }, [ensureStatement, profile?.id, scrollToY]);

  const handleOpenHelp = useCallback(() => {
    const trimmedKey = SUPPORTING_STATEMENT_HELP_KEY.trim();
    if (trimmedKey) {
      openHelp(trimmedKey);
      return;
    }
    Alert.alert(
      'Character reference',
      'Use the wizard to generate a character reference and review the preview before saving.'
    );
  }, [openHelp]);

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Character reference"
          onClose={handleAttemptClose}
          onSave={handleSave}
          saveDisabled={!hasUnsavedChanges}
          style={styles.header}
          extraActions={
            <IconRoundButton
              buttonType="help"
              accessibilityLabel="Character reference help"
              onPress={handleOpenHelp}
              hitSlop={8}
              size="sm"
              variant="ghost"
              borderColor={tones.grey.base}
            />
          }
        />

        <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>

          <View onLayout={(event) => { sectionYRef.current.relationship = event.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Relationship to person</Text>
          </View>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Relationship type</Text>
            <View style={styles.pillsWrap}>
              {allowedRelationshipCategories.map((value) => {
                const selected = form.relationshipCategory === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() =>
                      setForm((prev) => {
                        const next = {
                          ...prev,
                          relationshipCategory: value,
                          relationshipDetail: '',
                          relationshipDetailOther: '',
                        };
                        const latestProfile = readLatestProfile();
                        const statementNumber = statementNumberFromSlot(activeSlot);
                        const spouseRef =
                          value === 'spouse'
                            ? getReferenceByStatementAndCategory(latestProfile, statementNumber, 'spouse')
                            : undefined;

                        if (spouseRef) {
                          const spouseDetail = (spouseRef.relationshipDetail || spouseRef.type || '').trim();
                          next.relationshipDetail = spouseDetail;
                          const spouseMatch = getReferenceByStatementCategoryAndDetail(
                            latestProfile,
                            statementNumber,
                            'spouse',
                            spouseDetail,
                          );
                          next.supporterFullName = spouseMatch?.fullNames?.trim() ?? '';
                          next.supporterIdNumber = spouseMatch?.idNumber?.trim() ?? '';
                          next.supporterMobile = spouseMatch?.mobile?.trim() ?? '';
                          next.supporterAddress = resolveProfileAddressLine(latestProfile) ?? spouseMatch?.address?.trim() ?? '';
                          next.yearsKnown = calculateYearsKnownFromSinceYear(spouseMatch?.since?.trim()) ?? '';
                        } else {
                          next.supporterFullName = '';
                          next.supporterIdNumber = '';
                          next.supporterMobile = '';
                          next.supporterAddress =
                            value === 'spouse' ? (resolveProfileAddressLine(latestProfile) ?? '') : '';
                          next.yearsKnown = '';
                        }
                        return next;
                      })
                    }
                    accessibilityRole="button"
                    style={[
                      styles.pill,
                      selected && styles.pillSelected,
                      showValidation && validation.relationshipCategory && styles.pillError,
                    ]}
                  >
                    <Text style={[
                      styles.pillTxt,
                      selected && styles.pillTxtSelected,
                      showValidation && validation.relationshipCategory && styles.pillTxtError,
                    ]}>
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Relationship detail</Text>
            <View style={styles.pillsWrap}>
              {selectedRelOptions.map((value) => {
                const selected = form.relationshipDetail === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() =>
                      setForm((prev) => {
                        const next = { ...prev, relationshipDetail: value };
                        const latestProfile = readLatestProfile();
                        const ref = getReferenceByStatementCategoryAndDetail(
                          latestProfile,
                          statementNumberFromSlot(activeSlot),
                          prev.relationshipCategory,
                          value
                        );
                        const refFullNames = ref?.fullNames?.trim() ?? '';
                        const refIdNumber = ref?.idNumber?.trim() ?? '';
                        const refAddress = ref?.address?.trim() ?? '';
                        if (ref) {
                          next.supporterFullName = refFullNames;
                          next.supporterIdNumber = refIdNumber;
                          next.supporterMobile = ref?.mobile?.trim() ?? '';
                          next.supporterAddress =
                            prev.relationshipCategory === 'spouse'
                              ? resolveProfileAddressLine(latestProfile) ?? refAddress
                              : refAddress;
                          next.yearsKnown =
                            calculateYearsKnownFromSinceYear(ref?.since?.trim()) ?? '';
                        } else {
                          next.supporterFullName = '';
                          next.supporterIdNumber = '';
                          next.supporterMobile = '';
                          next.supporterAddress =
                            prev.relationshipCategory === 'spouse'
                              ? (resolveProfileAddressLine(latestProfile) ?? '')
                              : '';
                          next.yearsKnown = '';
                        }
                        if (value !== 'Other') next.relationshipDetailOther = '';
                        return next;
                      })
                    }
                    accessibilityRole="button"
                    style={[
                      styles.pill,
                      selected && styles.pillSelected,
                      showValidation && validation.relationshipDetail && styles.pillError,
                    ]}
                  >
                    <Text style={[
                      styles.pillTxt,
                      selected && styles.pillTxtSelected,
                      showValidation && validation.relationshipDetail && styles.pillTxtError,
                    ]}>
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          <View onLayout={(event) => { sectionYRef.current.person = event.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Person's details</Text>
          </View>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Full names & surname</Text>
            <TextInput
              value={form.supporterFullName}
              onChangeText={(value) => setField('supporterFullName', value)}
              placeholder="e.g. Jane Smith"
              placeholderTextColor={neutral.border}
              style={[styles.input, showValidation && validation.supporterFullName && styles.inputError]}
              autoCapitalize="words"
            />
            <Text style={styles.inputLabel}>ID number</Text>
            <TextInput
              value={form.supporterIdNumber}
              onChangeText={(value) => setField('supporterIdNumber', value)}
              placeholder="e.g. 8001010000000 or P1234567"
              placeholderTextColor={neutral.border}
              style={[styles.input, showValidation && validation.supporterIdNumber && styles.inputError]}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={24}
            />
            <Text style={styles.inputLabel}>Cellphone number</Text>
            <TextInput
              value={form.supporterMobile}
              onChangeText={(value) => setField('supporterMobile', value)}
              placeholder="e.g. 0821234567"
              placeholderTextColor={neutral.border}
              style={[styles.input, showValidation && validation.supporterMobile && styles.inputError]}
              keyboardType="phone-pad"
              autoCorrect={false}
              maxLength={20}
            />
            <Text style={styles.inputLabel}>Home address</Text>
            <TextInput
              value={form.supporterAddress}
              onChangeText={(value) => setField('supporterAddress', value)}
              placeholder="Street, suburb, city, postcode"
              placeholderTextColor={neutral.border}
              style={[
                styles.input,
                styles.growingInput,
                { height: Math.max(56, supporterAddressHeight) },
                showValidation && validation.supporterAddress && styles.inputError,
              ]}
              autoCapitalize="words"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
              onContentSizeChange={(event) => {
                const nextHeight = Math.ceil(event.nativeEvent.contentSize.height);
                setSupporterAddressHeight(Math.max(56, nextHeight));
              }}
            />
          </View>
            <Text style={styles.inputLabel}>Years known</Text>
            <TextInput
              value={form.yearsKnown}
              onChangeText={(value) => setField('yearsKnown', value)}
              placeholder="e.g. 12"
              placeholderTextColor={neutral.border}
              style={[styles.input, showValidation && validation.yearsKnown && styles.inputError]}
              keyboardType="number-pad"
            />
          </View>

          {visibleScenarios.length ? (
            <>
              <View onLayout={(event) => { sectionYRef.current.activities = event.nativeEvent.layout.y; }}>
                <Text style={styles.sectionTitle}>{scenarioConfig?.title || 'Firearm activities'}</Text>
              </View>
              {scenarioConfig?.description ? (
                <Text style={styles.sectionDescription}>{scenarioConfig.description}</Text>
              ) : null}
              <View style={styles.scenarioCardList}>
                {visibleScenarios.map((scenario) => {
                  const selected = form.scenarioSelections?.[scenario.key] ?? {};
                  const showCardDetail = selected.enabled === true;
                  const hideFrequencyInputs = !selected.knowledge || selected.knowledge === 'haveAccompanied';
                  const scenarioValidation = validation.scenario[scenario.key] ?? {};
                  const scenarioComplete =
                    showCardDetail &&
                    Boolean(selected.knowledge) &&
                    (hideFrequencyInputs || (Boolean(selected.frequency) && Boolean(selected.frequencyPeriod)));
                  const iconBackground = showCardDetail
                    ? scenarioComplete
                      ? tones.green.base
                      : tones.orange.base
                    : neutral.base;
                  const iconPressedBackground = showCardDetail
                    ? scenarioComplete
                      ? tones.green.emphasis
                      : tones.orange.emphasis
                    : neutral.emphasis;
                  const iconBorder = showCardDetail
                    ? scenarioComplete
                      ? tones.green.base
                      : tones.orange.base
                    : neutral.border;
                  return (
                    <View
                      key={scenario.key}
                      style={styles.scenarioCard}
                      onLayout={(event) => { scenarioYRef.current[scenario.key] = event.nativeEvent.layout.y; }}
                    >
                      <View style={styles.scenarioCardHeader}>
                        <Text style={styles.scenarioCardTitle}>{scenario.label}</Text>
                        <IconRoundButton
                          buttonType={showCardDetail ? 'confirm' : 'add'}
                          accessibilityLabel={showCardDetail ? `Hide ${scenario.label} details` : `Show ${scenario.label} details`}
                          onPress={() => toggleScenario(scenario.key)}
                          borderColor={iconBorder}
                          size="sm"
                        />
                      </View>
                      {showCardDetail ? (
                        <View style={styles.scenarioBody}>

                          <View style={styles.debugScenarioCard}>
                            <Text style={styles.debugScenarioTitle}>Preview statement wording</Text>
                            <Text style={styles.debugScenarioText}>
                              {normalizeDebugPreviewText(
                                renderScenarioTemplate(
                                  scenario.template,
                                  selected,
                                  knowledgeOptions,
                                  applicantNameForScenarioPreview.first,
                                  applicantPronounsForScenarioPreview.object,
                                  applicantPronounsForScenarioPreview.subject,
                                ),
                              )}
                            </Text>
                          </View>

                          <Text style={styles.inputLabel}>They acknowledge that they:</Text>
                          <View style={styles.pillsWrap}>
                            {knowledgeOptions.map((option) => {
                              const isActive = selected.knowledge === option.value;
                              return (
                                <Pressable
                                  key={`${scenario.key}-knowledge-${option.value}`}
                                  onPress={() => setScenarioField(scenario.key, 'knowledge', option.value)}
                                  accessibilityRole="button"
                                  style={[
                                    styles.pill,
                                    isActive && styles.pillSelected,
                                    showValidation && scenarioValidation.knowledge && styles.pillError,
                                  ]}
                                >
                                  <Text style={[
                                    styles.pillTxt,
                                    isActive && styles.pillTxtSelected,
                                    showValidation && scenarioValidation.knowledge && styles.pillTxtError,
                                  ]}>{option.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          {!hideFrequencyInputs ? (
                            <>
                              <Text style={styles.inputLabel}>Frequency</Text>
                              <View style={styles.pillsWrap}>
                                {frequencyOptions.map((option) => {
                                  const isActive = selected.frequency === option;
                                  return (
                                    <Pressable
                                      key={`${scenario.key}-frequency-${option}`}
                                      onPress={() => setScenarioField(scenario.key, 'frequency', option)}
                                      accessibilityRole="button"
                                      style={[
                                        styles.pill,
                                        isActive && styles.pillSelected,
                                        showValidation && scenarioValidation.frequency && styles.pillError,
                                      ]}
                                    >
                                      <Text style={[
                                        styles.pillTxt,
                                        isActive && styles.pillTxtSelected,
                                        showValidation && scenarioValidation.frequency && styles.pillTxtError,
                                      ]}>{option}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              <Text style={styles.inputLabel}>Frequency period</Text>
                              <View style={styles.pillsWrap}>
                                {frequencyPeriodOptions.map((option) => {
                                  const isActive = selected.frequencyPeriod === option;
                                  return (
                                    <Pressable
                                      key={`${scenario.key}-period-${option}`}
                                      onPress={() => setScenarioField(scenario.key, 'frequencyPeriod', option)}
                                      accessibilityRole="button"
                                      style={[
                                        styles.pill,
                                        isActive && styles.pillSelected,
                                        showValidation && scenarioValidation.frequencyPeriod && styles.pillError,
                                      ]}
                                    >
                                      <Text style={[
                                        styles.pillTxt,
                                        isActive && styles.pillTxtSelected,
                                        showValidation && scenarioValidation.frequencyPeriod && styles.pillTxtError,
                                      ]}>{option}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </>
                          ) : (
                            null //<Text style={styles.frequencyHint}>Frequency details not required for this option.</Text>
                          )}

                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {form.relationshipCategory === 'colleague' ? (
            <>
              <View onLayout={(event) => { sectionYRef.current.colleague = event.nativeEvent.layout.y; }}>
                <Text style={styles.sectionTitle}>Colleague details</Text>
              </View>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Workplace</Text>
                <TextInput
                  value={form.colleagueWorkplace}
                  onChangeText={(value) => setField('colleagueWorkplace', value)}
                  placeholder="Company or organisation"
                  placeholderTextColor={neutral.border}
                  style={[styles.input, showValidation && validation.colleagueWorkplace && styles.inputError]}
                />
                <Text style={styles.inputLabel}>Applicant role</Text>
                <TextInput
                  value={form.colleagueRole}
                  onChangeText={(value) => setField('colleagueRole', value)}
                  placeholder="e.g. Operations manager"
                  placeholderTextColor={neutral.border}
                  style={[styles.input, showValidation && validation.colleagueRole && styles.inputError]}
                />

                <Text style={styles.inputLabel}>Have you handled firearms together?</Text>
                <View style={styles.pillsWrap}>
                  {yesNoOptions.map((option) => {
                    const selected = form.firearmTogether === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setField('firearmTogether', option.value)}
                        accessibilityRole="button"
                        style={[
                          styles.pill,
                          selected && styles.pillSelected,
                          showValidation && validation.firearmTogether && styles.pillError,
                        ]}
                      >
                        <Text style={[
                          styles.pillTxt,
                          selected && styles.pillTxtSelected,
                          showValidation && validation.firearmTogether && styles.pillTxtError,
                        ]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {form.firearmTogether === 'yes' ? (
                  <>
                    <Text style={styles.inputLabel}>Where did you handle firearms together?</Text>
                    <View style={styles.pillsWrap}>
                      {firearmOptions.map((option) => {
                        const selected = form.firearmContexts.includes(option);
                        return (
                          <Pressable
                            key={option}
                            onPress={() => toggleContext(option)}
                            accessibilityRole="button"
                            style={[
                              styles.pill,
                              selected && styles.pillSelected,
                              showValidation && validation.firearmContexts && styles.pillError,
                            ]}
                          >
                            <Text style={[
                              styles.pillTxt,
                              selected && styles.pillTxtSelected,
                              showValidation && validation.firearmContexts && styles.pillTxtError,
                            ]}>
                              {option}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {form.firearmContexts.includes('Other') ? (
                      <>
                        <Text style={styles.inputLabel}>Other context</Text>
                        <TextInput
                          value={form.firearmContextOther}
                          onChangeText={(value) => setField('firearmContextOther', value)}
                          placeholder="Describe where you handled firearms together"
                          placeholderTextColor={neutral.border}
                          style={[styles.input, showValidation && validation.firearmContextOther && styles.inputError]}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Additional comments</Text>
          <View style={styles.inputBlock}>
            <TextInput
              value={form.comments}
              onChangeText={(value) => setField('comments', value)}
              placeholder="Any other comments to consider"
              placeholderTextColor={neutral.border}
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View onLayout={(event) => { sectionYRef.current.signature = event.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Signature details</Text>
          </View>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Place</Text>
            <TextInput
              value={form.place}
              onChangeText={(value) => setField('place', value)}
              placeholder="e.g. Pretoria"
              placeholderTextColor={neutral.border}
              style={[styles.input, showValidation && validation.place && styles.inputError]}
            />
            <Text style={styles.inputLabel}>Date</Text>
            <TextInput
              value={form.date}
              onChangeText={(value) => setField('date', maskYYYYMMDD(value))}
              onBlur={() => setDateBlurred(true)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={neutral.border}
              style={[
                styles.input,
                ((showValidation && (validation.date || validation.dateInvalid)) ||
                  (dateBlurred && form.date.trim().length > 0 && !isValidIsoDate(form.date))) &&
                  styles.inputError,
              ]}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>

          <Text style={styles.sectionTitle}>Statement preview</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewText}>{statementText}</Text>
          </View>

          <Button
            label="Reset statement"
            onPress={handleReset}
            tone="red"
            variant="solid"
            style={styles.resetButton}
            align="center"
            centerText
            centerContent
            disabled={resetDisabled}
          />
          <ButtonSave label="Save statement" onPress={handleSave} />
        </PageScrollView>
      </View>
      <HelpModal {...helpModalProps} />
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { marginBottom: 12, paddingHorizontal: 20 },
    content: {
      paddingBottom: 32,
      gap: 18,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: tones.purple.base,
      marginTop: 6,
    },
    sectionDescription: {
      color: neutral.base,
      fontSize: 13,
      lineHeight: 18,
      marginTop: -8,
    },
    inputBlock: {
      gap: 10,
    },
    scenarioCardList: {
      gap: 10,
    },
    scenarioCard: {
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      borderRadius: 14,
      padding: 12,
      gap: 10,
    },
    scenarioCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    scenarioCardTitle: {
      flex: 1,
      color: neutral.onSurface,
      fontWeight: '700',
      fontSize: 15,
    },
    scenarioBody: {
      gap: 8,
    },
    inputLabel: {
      color: neutral.base,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: neutral.onBase,
      color: neutral.onSurface,
    },
    textArea: {
      minHeight: 96,
    },
    growingInput: {
      minHeight: 56,
      paddingTop: 10,
      paddingBottom: 10,
    },
    pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
    },
    pillSelected: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    pillError: {
      borderColor: tones.orange.base,
      backgroundColor: tones.orange.surface,
    },
    pillTxt: { fontSize: 13, color: neutral.onSurface },
    pillTxtSelected: { color: tones.teal.onSurface, fontWeight: '700' },
    pillTxtError: { color: tones.orange.onSurface, fontWeight: '700' },
    previewCard: {
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
      borderRadius: 12,
      padding: 12,
    },
    previewText: {
      color: neutral.onSurface,
      lineHeight: 18,
      fontSize: 13,
    },
    debugScenarioCard: {
      borderWidth: 1,
      borderColor: tones.blue.border,
      backgroundColor: tones.blue.surface,
      borderRadius: 10,
      padding: 10,
      gap: 6,
      marginTop: 4,
    },
    debugScenarioTitle: {
      color: tones.blue.onSurface,
      fontSize: 12,
      fontWeight: '700',
    },
    debugScenarioText: {
      color: tones.blue.onSurface,
      fontSize: 12,
      lineHeight: 16,
    },
    frequencyHint: {
      color: neutral.base,
      fontSize: 12,
      fontStyle: 'italic',
      marginTop: -2,
    },
    inputError: {
      borderColor: tones.orange.base,
      backgroundColor: tones.orange.surface,
    },
    resetButton: { marginTop: 2 },
    backButton: { marginTop: 6 },
    helpIconWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helpIcon: {
      color: tones.grey.onBase,
      fontSize: 18,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
