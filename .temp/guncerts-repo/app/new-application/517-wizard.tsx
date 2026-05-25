import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import WizardSection from '../../src/components/wizard/WizardSection';
import WizardStepProgress from '../../src/components/wizard/WizardStepProgress';
import WizardFooterNav from '../../src/components/wizard/WizardFooterNav';
import WizardField from '../../src/components/wizard/WizardField';
import WizardOptionButton, { WizardOptionWrap } from '../../src/components/wizard/WizardOptionButton';
import WizardValidationHint from '../../src/components/wizard/WizardValidationHint';
import { useWizardSteps } from '../../src/components/wizard/useWizardSteps';
import { FORM517_LIMITS } from '../../src/config/form517Limits';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { persist, touch } from '../../src/data/repo';
import type {
  Application,
  CompetencyType,
  Profile,
  Proficiency,
  ReferenceInfo,
  TrainingType,
  YesNo,
} from '../../src/data/types';
import { validateForm517Readiness } from '../../src/utils/form517Validation';
import { useTones } from '../../src/theme/tones';
import { backOrReplace } from '../../src/utils/navigation';
import { buildDocumentsRoute, resolveDocumentsNav } from '../../src/navigation/helpers';
import { resolveProficiencyCategories } from '../../src/utils/proficiencyModel';

type StepId = 'd4' | 'e' | 'g' | 'h-confirm' | 'h-details' | 'review';

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'd4', label: 'Competencies' },
  { id: 'e', label: 'Profile' },
  { id: 'g', label: 'Training' },
  { id: 'h-confirm', label: 'Confirmations' },
  { id: 'h-details', label: 'Circumstances' },
  { id: 'review', label: 'Status' },
];

const COMPETENCY_OPTIONS: CompetencyType[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const COMPETENCY_LABELS: Record<CompetencyType, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};
const TRAINING_OPTIONS: TrainingType[] = ['Pistol', 'Revolver', 'Rifle', 'Shotgun', 'Other'];

const YES_NO_OPTIONS: YesNo[] = ['yes', 'no'];
type RiskNoItem = { step: StepId; label: string };

const normalizeId = (value?: string | null) => (value ?? '').replace(/\D/g, '').slice(0, 13);
const toTitleCaseWords = (value: string) =>
  value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
const getCharCount = (value?: string | null) => (value ?? '').trim().length;
const buildLimitedLabel = (label: string, value: string | undefined, limit: number) =>
  `${label} (${getCharCount(value)}/${limit} chars)`;
const isOverFieldLimit = (value: string | undefined, limit: number) => getCharCount(value) > limit;
const formatIsoToDdMmmYyyy = (value?: string | null): string => {
  const raw = `${value ?? ''}`.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  const [_, y, m, d] = match;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const deriveAgeFromProfile = (profile?: Profile | null): number | null => {
  const id = normalizeId(profile?.idNumber);
  if (id.length !== 13) return null;
  const yy = Number.parseInt(id.slice(0, 2), 10);
  const mm = Number.parseInt(id.slice(2, 4), 10);
  const dd = Number.parseInt(id.slice(4, 6), 10);
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  const now = new Date();
  const currentYY = now.getFullYear() % 100;
  const year = yy <= currentYY ? 2000 + yy : 1900 + yy;
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < mm || (now.getMonth() + 1 === mm && now.getDate() < dd)) age -= 1;
  return age;
};

const upsertSpouseReference = (references: ReferenceInfo[] | undefined, patch: Partial<ReferenceInfo>) => {
  const list = Array.isArray(references) ? [...references] : [];
  const index = list.findIndex((entry) => {
    const category = `${entry.relationshipCategory ?? ''}`.toLowerCase();
    const detail = `${entry.relationshipDetail ?? entry.type ?? ''}`.toLowerCase();
    return category === 'spouse' || category === 'partner' || detail.includes('spouse') || detail.includes('partner');
  });
  if (index >= 0) {
    list[index] = { ...list[index], ...patch };
    return list;
  }
  list.push({
    relationshipCategory: 'spouse',
    relationshipDetail: 'Spouse/Partner',
    ...patch,
  });
  return list;
};

const sanitizeApplicationSpouseLink = (application: Application, maritalStatus?: Profile['maritalStatus']) => {
  if (maritalStatus === 'married') return application;
  if (!application.form517) return application;
  const next = { ...application, form517: { ...application.form517 } } as any;
  // Defensive cleanup: ensure no spouse-specific values are stored on the application entity.
  if (next.form517.sectionE23) delete next.form517.sectionE23;
  if (next.form517.spousePartner) delete next.form517.spousePartner;
  if (next.form517.spouseReferenceId) delete next.form517.spouseReferenceId;
  return next as Application;
};

export default function New517WizardScreen() {
  const router = useRouter();
  const tones = useTones();
  const scrollRef = useRef<ScrollViewType | null>(null);
  const params = useLocalSearchParams<{ id?: string; returnTo?: string; flow?: string; source?: string }>();
  const applicationId = `${params.id ?? ''}`.trim();
  const returnTo = `${params.returnTo ?? '/new-application'}`;
  const isNewFlow = `${params.flow ?? ''}`.toLowerCase() === 'new';
  const source = `${params.source ?? ''}`.toLowerCase();
  const openedFromDocuments = source === 'documents';

  const [application, setApplication] = useState<Application | null>(() =>
    applicationId ? getById<Application>(applicationId) : null
  );
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (application?.applicantProfileId) return getById<Profile>(String(application.applicantProfileId));
    return listByType<Profile>('Profile')[0] ?? null;
  });
  const allProficiencies = useMemo(
    () =>
      profile?.id
        ? listByType<Proficiency>('Proficiency').filter((entry) => entry.holderProfileId === profile.id)
        : [],
    [profile?.id]
  );
  const proficiencies = useMemo(() => {
    const selectedIds = new Set((application?.proficiencyIds ?? []).map((id) => String(id)));
    if (!selectedIds.size) return [];
    return allProficiencies.filter((entry) => selectedIds.has(String(entry.id)));
  }, [allProficiencies, application?.proficiencyIds]);
  const form = application?.form517;

  const age = useMemo(() => deriveAgeFromProfile(profile), [profile]);
  const isPassportId = profile?.idType === 'PASSPORT';
  const showH17ForUnknownPassportAge = isPassportId && age == null;
  const { visibleSteps, currentStep, stepIndex, isFirstStep, isLastStep, goToStep } = useWizardSteps({ steps: STEPS });

  useEffect(() => {
    if (!application) return;
    const existing = application.form517?.sectionD?.possessFirearmCompetencies ?? [];
    if (existing.length > 0) return;

    const kinds = new Set<string>();
    const categories = new Set<CompetencyType>();
    proficiencies.forEach((entry) => {
      (entry.proficiencyDocumentIds ?? []).forEach((item) => {
        if (item?.kind) kinds.add(String(item.kind));
      });
      resolveProficiencyCategories(entry).forEach((category) => categories.add(category));
    });
    // Backward-compatible fallback if legacy profile payload contains proficiencyDocumentIds directly.
    (((profile as any)?.proficiencyDocumentIds ?? []) as Array<{ kind?: string }>).forEach((item) => {
      if (item?.kind) kinds.add(String(item.kind));
    });

    const mapped: CompetencyType[] = [];
    if (categories.has('Handgun')) mapped.push('Handgun');
    if (categories.has('Rifle')) mapped.push('Rifle');
    if (categories.has('Shotgun')) mapped.push('Shotgun');
    if (categories.has('HandMachineCarbine')) mapped.push('HandMachineCarbine');
    if (!mapped.length) return;

    saveApplicationForm((current) => ({
      ...current,
      form517: {
        ...current.form517,
        sectionD: {
          ...current.form517?.sectionD,
          possessFirearmCompetencies: mapped,
        },
      },
    }));
  }, [application, profile, proficiencies]);

  useEffect(() => {
    if (!application) return;
    const sectionG = application.form517?.sectionG;
    const hasExistingGValues =
      typeof sectionG?.passedActTest === 'boolean' ||
      typeof sectionG?.passedPracticalTraining === 'boolean' ||
      Boolean(sectionG?.trainingFirearmTypes?.length) ||
      Boolean(sectionG?.trainingFirearmOther?.trim());
    if (hasExistingGValues) return;

    const kinds = new Set<string>();
    const categories = new Set<CompetencyType>();
    proficiencies.forEach((entry) => {
      (entry.proficiencyDocumentIds ?? []).forEach((item) => {
        if (item?.kind) kinds.add(String(item.kind));
      });
      resolveProficiencyCategories(entry).forEach((category) => categories.add(category));
    });
    // Backward-compatible fallback if legacy profile payload contains proficiencyDocumentIds directly.
    (((profile as any)?.proficiencyDocumentIds ?? []) as Array<{ kind?: string }>).forEach((item) => {
      if (item?.kind) kinds.add(String(item.kind));
    });

    const hasStatementOfResults = Array.from(kinds).some((kind) => kind.startsWith('STATEMENT_OF_RESULTS'));
    const hasProficiency =
      Array.from(kinds).some((kind) => kind.startsWith('PROFICIENCY_')) ||
      categories.size > 0;

    const mappedTypes = new Set<TrainingType>();
    let otherText: string | undefined;
    if (categories.has('Handgun')) {
      mappedTypes.add('Pistol');
      mappedTypes.add('Revolver');
    }
    if (categories.has('Rifle')) mappedTypes.add('Rifle');
    if (categories.has('Shotgun')) mappedTypes.add('Shotgun');
    if (categories.has('HandMachineCarbine')) {
      mappedTypes.add('Other');
      otherText = 'Hand Machine Carbine';
    }

    const trainingFirearmTypes = Array.from(mappedTypes);
    if (!hasStatementOfResults && !hasProficiency && !trainingFirearmTypes.length) return;

    saveApplicationForm((current) => ({
      ...current,
      form517: {
        ...current.form517,
        sectionG: {
          ...current.form517?.sectionG,
          passedActTest: hasStatementOfResults ? true : undefined,
          passedPracticalTraining: hasProficiency ? true : undefined,
          trainingFirearmTypes,
          trainingFirearmOther: mappedTypes.has('Other') ? otherText : undefined,
        },
      },
    }));
  }, [application, profile, proficiencies]);

  useEffect(() => {
    if (!application) return;
    if (!proficiencies.length) return;
    const sectionH = application.form517?.sectionH;
    const hasExistingH1Data =
      typeof sectionH?.h1TrainingCertificateConfirmed === 'boolean' ||
      Boolean(sectionH?.h2TrainingInstitutionName?.trim()) ||
      Boolean(sectionH?.h3TrainingCertificateSerial?.trim()) ||
      Boolean(sectionH?.h4TrainingCertificateDateIssued?.trim());
    if (hasExistingH1Data) return;

    const institutionNames = new Set<string>();
    const serials = new Set<string>();
    const issuedDates = new Set<string>();

    proficiencies.forEach((entry) => {
      const provider = `${entry.trainingProviderName ?? ''}`.trim();
      if (provider) institutionNames.add(provider);
      (entry.proficiencyDocumentIds ?? []).forEach((doc) => {
        const serial = `${doc.serialNumber ?? ''}`.trim();
        if (serial) serials.add(serial);
        const issuedAt = `${doc.issuedAt ?? ''}`.trim();
        if (issuedAt) issuedDates.add(formatIsoToDdMmmYyyy(issuedAt));
      });
    });

    const h2 = Array.from(institutionNames).join(', ');
    const h3 = Array.from(serials).join(', ');
    const h4 = Array.from(issuedDates).join(', ');

    saveApplicationForm((current) => ({
      ...current,
      form517: {
        ...current.form517,
        sectionH: {
          ...current.form517?.sectionH,
          h1TrainingCertificateConfirmed: true,
          h2TrainingInstitutionName: h2 || undefined,
          h3TrainingCertificateSerial: h3 || undefined,
          h4TrainingCertificateDateIssued: h4 || undefined,
        },
      },
    }));
  }, [application, proficiencies]);

  useEffect(() => {
    if (!application) return;
    // When age can be derived from SA ID, preselect H.17 automatically.
    if (age == null) return;
    if (typeof form?.sectionH?.h17Confirmed21OrOlder === 'boolean') return;
    saveApplicationForm((current) => ({
      ...current,
      form517: {
        ...current.form517,
        sectionH: {
          ...current.form517?.sectionH,
          h17Confirmed21OrOlder: age >= 21,
        },
      },
    }));
  }, [age, application, form?.sectionH?.h17Confirmed21OrOlder]);

  const saveApplicationForm = (updater: (current: Application) => Application) => {
    if (!application) return;
    const updated = updater(application);
    const cleaned = sanitizeApplicationSpouseLink(updated, profile?.maritalStatus);
    const next = touch(cleaned);
    persist(next);
    setApplication(next);
  };

  const saveProfile = (updater: (current: Profile) => Profile) => {
    if (!profile) return;
    const next = touch(updater(profile));
    persist(next);
    setProfile(next);
  };

  const setStep = (nextIndex: number) => {
    goToStep(nextIndex);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const getStepValidity = (step: StepId): boolean => {
    switch (step) {
      case 'd4':
        return Boolean(form?.sectionD?.possessFirearmCompetencies?.length);
      case 'e': {
        const hasEmployment =
          Boolean(profile?.employment?.tradeOrProfession?.trim()) &&
          Boolean(profile?.employment?.employerName?.trim()) &&
          Boolean(profile?.employment?.employerAddress?.line1?.trim()) &&
          Boolean(profile?.employment?.employerAddress?.postCode?.trim());
        const hasMarital = Boolean(profile?.maritalStatus);
        const hasMaritalOther =
          profile?.maritalStatus !== 'other' || Boolean(profile?.maritalStatusOther?.trim());
        const hasSpouseRef = Boolean(
          profile?.references?.some((entry) => {
            const category = `${entry.relationshipCategory ?? ''}`.toLowerCase();
            const detail = `${entry.relationshipDetail ?? entry.type ?? ''}`.toLowerCase();
            return category === 'spouse' || category === 'partner' || detail.includes('spouse') || detail.includes('partner');
          })
        );
        const spouseRequirementSatisfied = profile?.maritalStatus !== 'married' || hasSpouseRef;
        return hasEmployment && hasMarital && hasMaritalOther && spouseRequirementSatisfied;
      }
      case 'g':
        return (
          typeof form?.sectionG?.passedActTest === 'boolean' &&
          typeof form?.sectionG?.passedPracticalTraining === 'boolean' &&
          Boolean(form?.sectionG?.trainingFirearmTypes?.length) &&
          (form?.sectionG?.trainingFirearmTypes?.includes('Other')
            ? Boolean(form?.sectionG?.trainingFirearmOther?.trim())
            : true)
        );
      case 'h-confirm':
        return (
          typeof form?.sectionH?.h1TrainingCertificateConfirmed === 'boolean' &&
          (form?.sectionH?.h1TrainingCertificateConfirmed === true
            ? Boolean(form?.sectionH?.h2TrainingInstitutionName?.trim()) &&
              Boolean(form?.sectionH?.h3TrainingCertificateSerial?.trim()) &&
              Boolean(form?.sectionH?.h4TrainingCertificateDateIssued?.trim())
            : true) &&
          typeof form?.sectionH?.h5ConvictionsConfirmed === 'boolean' &&
          typeof form?.sectionH?.h6PendingCasesConfirmed === 'boolean' &&
          typeof form?.sectionH?.h7LostStolenConfirmed === 'boolean' &&
          typeof form?.sectionH?.h8NegligenceCaseConfirmed === 'boolean' &&
          typeof form?.sectionH?.h9DeclaredUnfitConfirmed === 'boolean' &&
          typeof form?.sectionH?.h10ConfiscationConfirmed === 'boolean'
        );
      case 'h-details': {
        const checks: Array<{ answer?: YesNo }> = [
          { answer: form?.sectionH?.h11ProtectionOrderAnswer },
          { answer: form?.sectionH?.h12DeniedLicenceAnswer },
          { answer: form?.sectionH?.h13SuicideDepressionSubstanceAnswer },
          { answer: form?.sectionH?.h14DiagnosedTreatedAnswer },
          { answer: form?.sectionH?.h15DivorceSeparationViolenceAnswer },
          { answer: form?.sectionH?.h16ForcedJobLossAnswer },
        ];
        const h11toh16Valid = checks.every((item) => item.answer === 'yes' || item.answer === 'no');
        const h17Answered = typeof form?.sectionH?.h17Confirmed21OrOlder === 'boolean';
        return h11toh16Valid && h17Answered;
      }
      case 'review': {
        const result = validateForm517Readiness(application as Application, profile);
        return result.ready;
      }
      default:
        return false;
    }
  };

  const canMoveForward = currentStep ? getStepValidity(currentStep.id) : false;
  const reviewResult = application ? validateForm517Readiness(application, profile) : { ready: false, missing: ['Application not found'] };
  const riskNoItems = useMemo<RiskNoItem[]>(() => {
    const sectionG = form?.sectionG;
    const sectionH = form?.sectionH;
    const items: RiskNoItem[] = [];
    if (sectionG?.passedActTest === false) items.push({ step: 'g', label: 'G.1 Passed Act test = No' });
    if (sectionG?.passedPracticalTraining === false) items.push({ step: 'g', label: 'G.2 Passed practical training = No' });
    if (sectionH?.h1TrainingCertificateConfirmed === false) {
      items.push({ step: 'h-confirm', label: 'H.1 Training certificate confirmed = No' });
    }
    if (sectionH?.h5ConvictionsConfirmed === true) items.push({ step: 'h-confirm', label: 'H.5 Convictions = Yes' });
    if (sectionH?.h6PendingCasesConfirmed === true) items.push({ step: 'h-confirm', label: 'H.6 Pending cases = Yes' });
    if (sectionH?.h7LostStolenConfirmed === true) items.push({ step: 'h-confirm', label: 'H.7 Lost/stolen firearms = Yes' });
    if (sectionH?.h8NegligenceCaseConfirmed === true) items.push({ step: 'h-confirm', label: 'H.8 Negligence case = Yes' });
    if (sectionH?.h9DeclaredUnfitConfirmed === true) items.push({ step: 'h-confirm', label: 'H.9 Declared unfit = Yes' });
    if (sectionH?.h10ConfiscationConfirmed === true) items.push({ step: 'h-confirm', label: 'H.10 Firearm confiscation = Yes' });
    if (sectionH?.h11ProtectionOrderAnswer === 'yes') {
      items.push({ step: 'h-details', label: 'H.11 Protection order / police visit = Yes' });
    }
    if (sectionH?.h12DeniedLicenceAnswer === 'yes') {
      items.push({ step: 'h-details', label: 'H.12 Denied licence/permit = Yes' });
    }
    if (sectionH?.h13SuicideDepressionSubstanceAnswer === 'yes') {
      items.push({ step: 'h-details', label: 'H.13 Suicide/depression/substance concerns = Yes' });
    }
    if (sectionH?.h14DiagnosedTreatedAnswer === 'yes') {
      items.push({ step: 'h-details', label: 'H.14 Diagnosed/treated concerns = Yes' });
    }
    if (sectionH?.h15DivorceSeparationViolenceAnswer === 'yes') {
      items.push({ step: 'h-details', label: 'H.15 Divorce/separation with allegations = Yes' });
    }
    if (sectionH?.h16ForcedJobLossAnswer === 'yes') {
      items.push({ step: 'h-details', label: 'H.16 Forced job loss = Yes' });
    }
    if (sectionH?.h17Confirmed21OrOlder === false) {
      items.push({ step: 'h-details', label: "H.17 Aged 21 or older = No" });
    }
    return items;
  }, [form?.sectionG, form?.sectionH]);
  const hasRiskNoForStep = useCallback(
    (stepId: StepId) => riskNoItems.some((item) => item.step === stepId),
    [riskNoItems]
  );
  const hasAnyRiskNo = riskNoItems.length > 0;

  const stepIndexById = useMemo(
    () => new Map(visibleSteps.map((step, index) => [step.id, index] as const)),
    [visibleSteps]
  );

  const resolveStepIdForIssue = (issue: string): StepId => {
    const text = issue.toUpperCase();
    if (text.startsWith('D.')) return 'd4';
    if (text.startsWith('E.')) return 'e';
    if (text.startsWith('G.')) return 'g';
    if (text.startsWith('H.11') || text.startsWith('H.12') || text.startsWith('H.13') || text.startsWith('H.14') || text.startsWith('H.15') || text.startsWith('H.16')) return 'h-details';
    if (text.startsWith('H.17')) return 'h-details';
    if (text.startsWith('H.')) return 'h-confirm';
    return 'review';
  };

  const promptToUpdateMissing = () => {
    if (reviewResult.ready) return;
    const firstIssue = reviewResult.missing[0];
    const stepId = resolveStepIdForIssue(firstIssue ?? '');
    const targetIndex = stepIndexById.get(stepId) ?? 0;
    Alert.alert(
      'Information missing',
      'Some required information is missing. Do you want to update it now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => setStep(targetIndex),
        },
      ]
    );
  };

  const handleClose = () => {
    if (!application) {
      backOrReplace(router, returnTo as any);
      return;
    }
    if (!isNewFlow || openedFromDocuments) {
      backOrReplace(router, returnTo as any);
      return;
    }
    Alert.alert(
      'Save application?',
      'Do you want to keep this new application draft?',
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            deleteEntity(application.id);
            backOrReplace(router, returnTo as any);
          },
        },
        {
          text: 'Save',
          onPress: () => {
            const next = touch<Application>({ ...application, userConfirmedAccuracy: true });
            persist(next);
            setApplication(next);
            backOrReplace(router, returnTo as any);
          },
        },
      ]
    );
  };

  if (!application || !profile || !currentStep) {
    return (
      <Screen>
        <View style={styles.container}>
          <PageHeader title="SAPS 517 wizard" onClose={handleClose} style={styles.header} />
          <View style={styles.content}><Text style={{ color: tones.red.base }}>Unable to load application/profile.</Text></View>
        </View>
      </Screen>
    );
  }

  const d4Selected = new Set(form?.sectionD?.possessFirearmCompetencies ?? []);
  const gTraining = new Set(form?.sectionG?.trainingFirearmTypes ?? []);
  const spouse = profile.references?.find((entry) => {
    const category = `${entry.relationshipCategory ?? ''}`.toLowerCase();
    const detail = `${entry.relationshipDetail ?? entry.type ?? ''}`.toLowerCase();
    return category === 'spouse' || category === 'partner' || detail.includes('spouse') || detail.includes('partner');
  });

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader title="SAPS 517 wizard" onClose={handleClose} style={styles.header} />
        <View style={styles.progressWrap}>
          <WizardStepProgress
            steps={visibleSteps}
            selectedIndex={stepIndex}
            onPressStep={(index) => setStep(index)}
            getStepTone={(step) => {
              if (step.id === 'review') {
                if (!reviewResult.ready) return 'grey';
                return hasAnyRiskNo ? 'orange' : 'blue';
              }
              if (hasRiskNoForStep(step.id)) return 'orange';
              return getStepValidity(step.id) ? 'green' : 'orange';
            }}
          />
        </View>
        <PageScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          {currentStep.id === 'd4' ? (
            <WizardSection title="SAPS-517 Section D.4" description="Select all competency categories being applied for.">
              <WizardOptionWrap>
                {COMPETENCY_OPTIONS.map((option) => (
                  <WizardOptionButton
                    key={option}
                    label={COMPETENCY_LABELS[option]}
                    selected={d4Selected.has(option)}
                    onPress={() => {
                      const next = new Set(d4Selected);
                      if (next.has(option)) next.delete(option);
                      else next.add(option);
                      saveApplicationForm((current) => ({
                        ...current,
                        form517: {
                          ...current.form517,
                          sectionD: {
                            ...current.form517?.sectionD,
                            possessFirearmCompetencies: Array.from(next),
                          },
                        },
                      }));
                    }}
                  />
                ))}
              </WizardOptionWrap>
              {!getStepValidity('d4') ? <WizardValidationHint message="Select at least one competency." /> : null}
            </WizardSection>
          ) : null}

          {currentStep.id === 'e' ? (
            <>
              <WizardSection title="SAPS-517 Section E.14-18">
                <WizardField
                  label="Trade or profession"
                  value={profile.employment?.tradeOrProfession ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: { ...current.employment, tradeOrProfession: value, employerAddress: current.employment?.employerAddress ?? current.address ?? {} },
                    }))
                  }
                />
                <WizardField
                  label="Self-employed details (if applicable)"
                  value={profile.employment?.selfEmployedDetail ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: { ...current.employment, selfEmployedDetail: value, employerAddress: current.employment?.employerAddress ?? current.address ?? {} },
                    }))
                  }
                />
                <WizardField
                  label="Employer/company"
                  value={profile.employment?.employerName ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: { ...current.employment, employerName: value, employerAddress: current.employment?.employerAddress ?? current.address ?? {} },
                    }))
                  }
                />
                <WizardField
                  label="Business address line 1"
                  value={profile.employment?.employerAddress?.line1 ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: {
                        ...current.employment,
                        employerAddress: { ...current.employment?.employerAddress, line1: value },
                      },
                    }))
                  }
                />
                <WizardField
                  label="Business address line 2"
                  value={profile.employment?.employerAddress?.line2 ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: {
                        ...current.employment,
                        employerAddress: { ...current.employment?.employerAddress, line2: value },
                      },
                    }))
                  }
                />
                <WizardField
                  label="Business city"
                  value={profile.employment?.employerAddress?.city ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: {
                        ...current.employment,
                        employerAddress: { ...current.employment?.employerAddress, city: value },
                      },
                    }))
                  }
                />
                <WizardField
                  label="Business postal code"
                  value={profile.employment?.employerAddress?.postCode ?? ''}
                  onChangeText={(value) =>
                    saveProfile((current) => ({
                      ...current,
                      employment: {
                        ...current.employment,
                        employerAddress: { ...current.employment?.employerAddress, postCode: value },
                      },
                    }))
                  }
                  keyboardType="numeric"
                />
              </WizardSection>
              <WizardSection title="SAPS-517 Section E.22">
                <WizardOptionWrap>
                  {(['single', 'married', 'divorced', 'widow', 'widower', 'other'] as const).map((status) => (
                    <WizardOptionButton
                      key={status}
                      label={status}
                      selected={profile.maritalStatus === status}
                      onPress={() => saveProfile((current) => ({ ...current, maritalStatus: status }))}
                    />
                  ))}
                </WizardOptionWrap>
                {profile.maritalStatus === 'other' ? (
                  <WizardField
                    label="Specify marital status"
                    value={profile.maritalStatusOther ?? ''}
                    onChangeText={(value) => saveProfile((current) => ({ ...current, maritalStatusOther: value }))}
                  />
                ) : null}
              </WizardSection>
              {profile.maritalStatus === 'married' ? (
                <WizardSection title="SAPS-517 Section E.23">
                  <WizardField
                    label="Spouse/partner full names"
                    value={spouse?.fullNames ?? ''}
                    onChangeText={(value) =>
                      saveProfile((current) => ({
                        ...current,
                        references: upsertSpouseReference(current.references, { fullNames: value }),
                      }))
                    }
                  />
                  <WizardField
                    label="Spouse/partner ID number"
                    value={spouse?.idNumber ?? ''}
                    onChangeText={(value) =>
                      saveProfile((current) => ({
                        ...current,
                        references: upsertSpouseReference(current.references, { idNumber: value }),
                      }))
                    }
                  />
                  <WizardField
                    label="Spouse/partner cellphone"
                    value={spouse?.mobile ?? ''}
                    onChangeText={(value) =>
                      saveProfile((current) => ({
                        ...current,
                        references: upsertSpouseReference(current.references, { mobile: value }),
                      }))
                    }
                    keyboardType="phone-pad"
                  />
                </WizardSection>
              ) : null}
              {!getStepValidity('e') ? <WizardValidationHint message="Complete required employment, marital, and spouse/partner fields." /> : null}
            </>
          ) : null}

          {currentStep.id === 'g' ? (
            <WizardSection title="SAPS-517 Section G.1-G.3">
              <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>G.1 Passed Act test?</Text>
              <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                Have you successfully completed the prescribed test on this Act?
              </Text>
              <WizardOptionWrap>
                {[true, false].map((value) => (
                  <WizardOptionButton
                    key={`g1-${String(value)}`}
                    label={value ? 'Yes' : 'No'}
                    selectedTone={value ? 'teal' : 'orange'}
                    selected={form?.sectionG?.passedActTest === value}
                    onPress={() =>
                      saveApplicationForm((current) => ({
                        ...current,
                        form517: {
                          ...current.form517,
                          sectionG: { ...current.form517?.sectionG, passedActTest: value },
                        },
                      }))
                    }
                  />
                ))}
              </WizardOptionWrap>

              <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>G.2 Passed practical training?</Text>
              <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                Have you successfully completed the prescribed training and practical tests on the safe and efficient handling of a firearm?
              </Text>
              <WizardOptionWrap>
                {[true, false].map((value) => (
                  <WizardOptionButton
                    key={`g2-${String(value)}`}
                    label={value ? 'Yes' : 'No'}
                    selectedTone={value ? 'teal' : 'orange'}
                    selected={form?.sectionG?.passedPracticalTraining === value}
                    onPress={() =>
                      saveApplicationForm((current) => ({
                        ...current,
                        form517: {
                          ...current.form517,
                          sectionG: { ...current.form517?.sectionG, passedPracticalTraining: value },
                        },
                      }))
                    }
                  />
                ))}
              </WizardOptionWrap>

              <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>G.3 Training firearm types</Text>
              <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                For which firearm(s) did you receive the prescribed training?
              </Text>
              <WizardOptionWrap>
                {TRAINING_OPTIONS.map((option) => (
                  <WizardOptionButton
                    key={option}
                    label={option}
                    selected={gTraining.has(option)}
                    onPress={() => {
                      const next = new Set(gTraining);
                      if (next.has(option)) next.delete(option);
                      else next.add(option);
                      saveApplicationForm((current) => ({
                        ...current,
                        form517: {
                          ...current.form517,
                          sectionG: { ...current.form517?.sectionG, trainingFirearmTypes: Array.from(next) },
                        },
                      }));
                    }}
                  />
                ))}
              </WizardOptionWrap>
              {gTraining.has('Other') ? (
                <WizardField
                  label="Other training type"
                  value={form?.sectionG?.trainingFirearmOther ?? ''}
                  onChangeText={(value) =>
                    saveApplicationForm((current) => ({
                      ...current,
                      form517: {
                        ...current.form517,
                        sectionG: { ...current.form517?.sectionG, trainingFirearmOther: value },
                      },
                    }))
                  }
                />
              ) : null}

              {!getStepValidity('g') ? <WizardValidationHint message="Complete all G fields before continuing." /> : null}
            </WizardSection>
          ) : null}

          {currentStep.id === 'h-confirm' ? (
            <WizardSection title="SAPS-517 Section H.1-H.10" description="Select Yes/No for each question.">
              <View style={styles.block}>
                <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>H.1 Training certificate confirmed</Text>
                <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                  Do you have a training certificate issued by an accredited training institution?
                </Text>
                <WizardOptionWrap>
                  {[true, false].map((value) => (
                    <WizardOptionButton
                      key={`h1TrainingCertificateConfirmed-${String(value)}`}
                      label={value ? 'Yes' : 'No'}
                      selectedTone={value ? 'teal' : 'orange'}
                      selected={form?.sectionH?.h1TrainingCertificateConfirmed === value}
                      onPress={() =>
                        saveApplicationForm((current) => ({
                          ...current,
                          form517: {
                            ...current.form517,
                            sectionH: { ...current.form517?.sectionH, h1TrainingCertificateConfirmed: value },
                          },
                        }))
                      }
                    />
                  ))}
                </WizardOptionWrap>
              </View>
              {form?.sectionH?.h1TrainingCertificateConfirmed === true ? (
                <>
                  <View style={styles.block}>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>H.2 Training institution name</Text>
                    <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                      Name of accredited training institution.
                    </Text>
                    <WizardField
                      label={buildLimitedLabel(
                        'Training institution name',
                        form?.sectionH?.h2TrainingInstitutionName,
                        FORM517_LIMITS.h2TrainingInstitutionName
                      )}
                      value={form?.sectionH?.h2TrainingInstitutionName ?? ''}
                      hasError={isOverFieldLimit(form?.sectionH?.h2TrainingInstitutionName, FORM517_LIMITS.h2TrainingInstitutionName)}
                      helpText={
                        isOverFieldLimit(form?.sectionH?.h2TrainingInstitutionName, FORM517_LIMITS.h2TrainingInstitutionName)
                          ? 'May overflow on SAPS form.'
                          : undefined
                      }
                      onChangeText={(value) =>
                        saveApplicationForm((current) => ({
                          ...current,
                          form517: {
                            ...current.form517,
                            sectionH: {
                              ...current.form517?.sectionH,
                              h2TrainingInstitutionName: toTitleCaseWords(value),
                            },
                          },
                        }))
                      }
                    />
                  </View>
                  <View style={styles.block}>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>H.3 Training certificate number</Text>
                    <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                      Number on training certificate issued.
                    </Text>
                    <WizardField
                      label={buildLimitedLabel(
                        'Training certificate number',
                        form?.sectionH?.h3TrainingCertificateSerial,
                        FORM517_LIMITS.h3TrainingCertificateSerial
                      )}
                      value={form?.sectionH?.h3TrainingCertificateSerial ?? ''}
                      hasError={isOverFieldLimit(form?.sectionH?.h3TrainingCertificateSerial, FORM517_LIMITS.h3TrainingCertificateSerial)}
                      helpText={
                        isOverFieldLimit(form?.sectionH?.h3TrainingCertificateSerial, FORM517_LIMITS.h3TrainingCertificateSerial)
                          ? 'May overflow on SAPS form.'
                          : undefined
                      }
                      onChangeText={(value) =>
                        saveApplicationForm((current) => ({
                          ...current,
                          form517: {
                            ...current.form517,
                            sectionH: {
                              ...current.form517?.sectionH,
                              h3TrainingCertificateSerial: value.toUpperCase(),
                            },
                          },
                        }))
                      }
                    />
                  </View>
                  <View style={styles.block}>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>H.4 Date issued</Text>
                    <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                      Add the dates that your certificates and results were issued e.g.: "1 Jan 2025, 12 Mar 2005".
                    </Text>
                    <WizardField
                      label={buildLimitedLabel(
                        'Date issued',
                        form?.sectionH?.h4TrainingCertificateDateIssued,
                        FORM517_LIMITS.h4TrainingCertificateDateIssued
                      )}
                      value={form?.sectionH?.h4TrainingCertificateDateIssued ?? ''}
                      hasError={isOverFieldLimit(form?.sectionH?.h4TrainingCertificateDateIssued, FORM517_LIMITS.h4TrainingCertificateDateIssued)}
                      helpText={
                        isOverFieldLimit(form?.sectionH?.h4TrainingCertificateDateIssued, FORM517_LIMITS.h4TrainingCertificateDateIssued)
                          ? 'May overflow on SAPS form.'
                          : undefined
                      }
                      onChangeText={(value) =>
                        saveApplicationForm((current) => ({
                          ...current,
                          form517: {
                            ...current.form517,
                            sectionH: { ...current.form517?.sectionH, h4TrainingCertificateDateIssued: value },
                          },
                        }))
                      }
                    />
                  </View>
                </>
              ) : null}
              {[
                {
                  key: 'h5ConvictionsConfirmed',
                  detailsKey: 'h5CaseDetails',
                  limitKey: 'h5CaseDetails',
                  label: 'H.5 Convictions',
                  prompt:
                    'Have you ever been convicted of an offence committed inside or outside the borders of the RSA?',
                  fields: [
                    { key: 'policeStation', label: 'Police station' },
                    { key: 'caseNumber', label: 'CAS/Case number' },
                    { key: 'chargeOrOffence', label: 'Charge' },
                    { key: 'outcome', label: 'Outcome' },
                  ] as const,
                },
                {
                  key: 'h6PendingCasesConfirmed',
                  detailsKey: 'h6CaseDetails',
                  limitKey: 'h6CaseDetails',
                  label: 'H.6 Pending cases',
                  prompt: 'Are there any cases pending against you?',
                  fields: [
                    { key: 'policeStation', label: 'Police station' },
                    { key: 'caseNumber', label: 'CAS/Case number' },
                    { key: 'chargeOrOffence', label: 'Offence' },
                  ] as const,
                },
                {
                  key: 'h7LostStolenConfirmed',
                  detailsKey: 'h7CaseDetails',
                  limitKey: 'h7CaseDetails',
                  label: 'H.7 Lost/stolen firearms',
                  prompt: 'Have any of your firearm(s) ever been lost/stolen?',
                  fields: [
                    { key: 'policeStation', label: 'Police station' },
                    { key: 'caseNumber', label: 'CAS/Case number' },
                    { key: 'circumstances', label: 'Circumstances', multiline: true },
                    { key: 'firearmDetails', label: 'Details of firearm', multiline: true },
                  ] as const,
                },
                {
                  key: 'h8NegligenceCaseConfirmed',
                  detailsKey: 'h8CaseDetails',
                  limitKey: 'h8CaseDetails',
                  label: 'H.8 Negligence case',
                  prompt:
                    'Was a case of negligence opened and investigated regarding the stolen/lost firearm?',
                  fields: [
                    { key: 'policeStation', label: 'Police station' },
                    { key: 'caseNumber', label: 'CAS/Case number' },
                    { key: 'chargeOrOffence', label: 'Charge' },
                    { key: 'outcome', label: 'Outcome' },
                  ] as const,
                },
                {
                  key: 'h9DeclaredUnfitConfirmed',
                  detailsKey: 'h9CaseDetails',
                  limitKey: 'h9CaseDetails',
                  label: 'H.9 Declared unfit',
                  prompt: 'Have you ever been declared unfit to possess a firearm?',
                  fields: [
                    { key: 'policeStation', label: 'Police station' },
                    { key: 'caseNumber', label: 'CAS/Case number' },
                    { key: 'chargeOrOffence', label: 'Charge' },
                    { key: 'dateFrom', label: 'Date from', mask: 'date' as const, placeholder: 'YYYY-MM-DD' },
                    { key: 'period', label: 'Period' },
                  ] as const,
                },
                {
                  key: 'h10ConfiscationConfirmed',
                  detailsKey: 'h10CaseDetails',
                  limitKey: 'h10CaseDetails',
                  label: 'H.10 Firearm confiscation',
                  prompt: 'Has a firearm in your possession been confiscated?',
                  fields: [
                    { key: 'policeStation', label: 'Police station' },
                    { key: 'caseNumber', label: 'CAS/Case number' },
                    { key: 'circumstances', label: 'Circumstances', multiline: true },
                    { key: 'outcome', label: 'Outcome' },
                  ] as const,
                },
              ].map((item) => (
                <View key={item.key} style={styles.block}>
                  <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>{item.label}</Text>
                  <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>{item.prompt}</Text>
                  <WizardOptionWrap>
                    {[true, false].map((value) => (
                      <WizardOptionButton
                        key={`${item.key}-${String(value)}`}
                        label={value ? 'Yes' : 'No'}
                        selectedTone={value ? 'orange' : 'teal'}
                        selected={(form?.sectionH as any)?.[item.key] === value}
                        onPress={() =>
                          saveApplicationForm((current) => ({
                            ...current,
                            form517: {
                              ...current.form517,
                              sectionH: { ...current.form517?.sectionH, [item.key]: value },
                            },
                          }))
                      }
                    />
                  ))}
                  </WizardOptionWrap>
                </View>
              ))}
              {!getStepValidity('h-confirm') ? <WizardValidationHint message="Complete H.1-H.10 answers and required training fields." /> : null}
            </WizardSection>
          ) : null}

          {currentStep.id === 'h-details' ? (
            <WizardSection title="SAPS-517 Section H.11-H.16">
              {[
                [
                  'h11ProtectionOrderAnswer',
                  'H.11 Protection order / police visit',
                  'In the past five years have you been served with a protection order, or visited by a police official concerning allegations of violence or other conflict in your home or elsewhere?',
                ],
                [
                  'h12DeniedLicenceAnswer',
                  'H.12 Denied licence/permit',
                  'In the past five years have you been denied a licence, permit or authorization regarding a firearm?',
                ],
                [
                  'h13SuicideDepressionSubstanceAnswer',
                  'H.13 Suicide/depression/substance concerns',
                  'In the past five years did you threaten or attempt suicide, suffer from major depression or emotional problems, or engage in intoxicating or narcotic substance abuse?',
                ],
                [
                  'h14DiagnosedTreatedAnswer',
                  'H.14 Diagnosed/treated concerns',
                  'In the past five years have you been diagnosed or treated by a medical practitioner for depression, drug, intoxicating or narcotic substance abuse, behavioural problems or emotional problems?',
                ],
                [
                  'h15DivorceSeparationViolenceAnswer',
                  'H.15 Divorce/separation with allegations',
                  'In the past two years did you experience a divorce or separation from an intimate partner with whom you resided and where there were written allegations of violence?',
                ],
                [
                  'h16ForcedJobLossAnswer',
                  'H.16 Forced job loss',
                  'In the past two years have you experienced any forced job loss?',
                ],
              ].map(([answerKey, label, prompt]) => {
                const answer = (form?.sectionH as any)?.[answerKey] as YesNo | undefined;
                return (
                  <View key={answerKey} style={styles.block}>
                    <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>{label}</Text>
                    <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>{prompt}</Text>
                    <WizardOptionWrap>
                      {YES_NO_OPTIONS.map((option) => (
                        <WizardOptionButton
                          key={`${answerKey}-${option}`}
                          label={option.toUpperCase()}
                          selectedTone={option === 'yes' ? 'orange' : 'teal'}
                          selected={answer === option}
                          onPress={() =>
                            saveApplicationForm((current) => ({
                              ...current,
                              form517: {
                                ...current.form517,
                                sectionH: { ...current.form517?.sectionH, [answerKey]: option },
                              },
                            }))
                          }
                        />
                      ))}
                    </WizardOptionWrap>
                  </View>
                );
              })}
              {!showH17ForUnknownPassportAge ? (
                <Text style={[styles.helper, { color: tones.grey.base }]}>
                  {showH17ForUnknownPassportAge
                    ? 'Note: Age cannot be derived from passport details. H.17 is shown but optional.'
                    : 'Note: Applicant is 21 or older. H.17 is not required.'}
                </Text>
              ) : null}
              <View style={styles.block}>
                <Text style={[styles.groupLabel, { color: tones.grey.onSurface }]}>H.17 Aged 21 or older</Text>
                <Text style={[styles.helper, styles.promptTight, { color: tones.grey.base }]}>
                  I confirm that I am 21 or older.
                </Text>
                <WizardOptionWrap>
                  {[true, false].map((value) => (
                    <WizardOptionButton
                      key={`h17-confirm-${String(value)}`}
                      label={value ? 'Yes' : 'No'}
                      selectedTone={value ? 'teal' : 'orange'}
                      selected={form?.sectionH?.h17Confirmed21OrOlder === value}
                      onPress={() =>
                        saveApplicationForm((current) => ({
                          ...current,
                          form517: {
                            ...current.form517,
                            sectionH: {
                              ...current.form517?.sectionH,
                              h17Confirmed21OrOlder: value,
                            },
                          },
                        }))
                      }
                    />
                  ))}
                </WizardOptionWrap>
              </View>
              {!getStepValidity('h-details') ? <WizardValidationHint message="Complete all H.11-H.16 answers and select a Yes/No option for H.17." /> : null}
            </WizardSection>
          ) : null}

          {currentStep.id === 'review' ? (
            <Pressable
              onPress={() => {
                if (!reviewResult.ready) promptToUpdateMissing();
              }}
            >
              <WizardSection title="SAPS-517 application status">
                <Text
                  style={[
                    styles.reviewStatus,
                    { color: !reviewResult.ready || hasAnyRiskNo ? tones.orange.base : tones.green.base },
                  ]}
                >
                  {!reviewResult.ready
                    ? 'Not ready to proceed:'
                    : hasAnyRiskNo
                      ? 'Information provided with risk answers:'
                      : 'Required information provided'}
                </Text>
                {!reviewResult.ready ? (
                  <View style={styles.block}>
                    {reviewResult.missing.map((item) => (
                      <Text key={item} style={[styles.helper, { color: tones.orange.base }]}>- {item}</Text>
                    ))}
                  </View>
                ) : null}
                {hasAnyRiskNo ? (
                  <View style={styles.block}>
                    <Text style={[styles.helper, { color: tones.orange.base }]}>
                      Based on the answers below, this application cannot be finalised in GunCerts at this stage.
                      Please seek professional advice before continuing with submission:
                    </Text>
                    {riskNoItems.map((item) => (
                      <Text key={`risk-${item.label}`} style={[styles.helper, { color: tones.orange.base }]}>
                        - {item.label}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </WizardSection>
            </Pressable>
          ) : null}

          <WizardFooterNav
            nextLabel={isLastStep ? 'Continue' : 'Next'}
            nextTone={isLastStep ? (reviewResult.ready ? 'green' : 'orange') : 'teal'}
            onPrevious={() => setStep(Math.max(0, stepIndex - 1))}
            onNext={() => {
              if (!isLastStep && !canMoveForward) return;
              if (isLastStep) {
                if (!reviewResult.ready) {
                  promptToUpdateMissing();
                  return;
                }
                const nextDraft = touch({ ...application, status: 'draft' as const });
                persist(nextDraft);
                setApplication(nextDraft);
                if (openedFromDocuments) {
                  backOrReplace(router, returnTo as any);
                  return;
                }
                const nav = resolveDocumentsNav('newApplication', { id: nextDraft.id }, {
                  origin: returnTo || '/new-application',
                  saveDecisionResolved: false,
                });
                const { pathname, params } = buildDocumentsRoute({
                  id: nextDraft.id,
                  mode: 'edit',
                  nav,
                });
                router.replace({ pathname, params } as any);
                return;
              }
              setStep(Math.min(visibleSteps.length - 1, stepIndex + 1));
            }}
            disablePrevious={isFirstStep}
            disableNext={!isLastStep && !canMoveForward}
            hidePrevious={isFirstStep}
          />
        </PageScrollView>
      </View>
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
  progressWrap: {
    paddingHorizontal: 20,
  },
  content: {
    paddingBottom: 32,
    gap: 16,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 2,
  },
  block: {
    gap: 8,
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
  },
  promptTight: {
    marginTop: -8,
  },
  counter: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
  },
  reviewStatus: {
    fontSize: 16,
    fontWeight: '700',
  },
  caseDetailCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  h17Divider: {
    borderTopWidth: 1,
    marginVertical: 6,
  },
});
