import type {
  MotivationPurposeType,
  MotivationSectionType,
} from './sentenceBank.types';

export interface FirearmCapabilityProfileValues {
  capabilitySummary?: string;
  illustrativeUseSummary?: string;
  capabilityLimitationSummary?: string;
}

type FirearmCapabilityProfile = {
  id: string;
  purposeType: MotivationPurposeType;
  sectionTypes?: MotivationSectionType[];
  calibres?: string[];
  firearmTypes?: string[];
  values: FirearmCapabilityProfileValues;
};

function normalizeValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

const FIREARM_CAPABILITY_PROFILES: FirearmCapabilityProfile[] = [
  {
    id: 'self_defence_9mm_handgun',
    purposeType: 'self_defence',
    sectionTypes: ['s13'],
    calibres: ['9mm', '9mmp', '9x19'],
    firearmTypes: ['handgun', 'pistol'],
    values: {
      capabilitySummary:
        'A 9mm-class handgun is widely regarded as a practical choice for lawful self-defence because it offers manageable recoil, controllable follow-up shooting, and practical everyday portability in a defensive platform.',
      illustrativeUseSummary:
        'In lawful self-defence contexts, this type of handgun is commonly relied upon for immediate personal protection, including circumstances requiring discreet carry, controlled defensive fire, and responsible day-to-day readiness.',
      capabilityLimitationSummary:
        'Its suitability still depends on lawful use, safe handling, and the applicant’s ability to maintain consistent control and accuracy under pressure.',
    },
  },
  {
    id: 'hunting_308_rifle',
    purposeType: 'hunting',
    sectionTypes: ['s15'],
    calibres: ['.308', '.308 win', '.308 winchester'],
    firearmTypes: ['rifle'],
    values: {
      capabilitySummary:
        'A .308-class rifle is commonly regarded as a practical and versatile hunting choice because it balances effective field performance, manageable recoil, and dependable accuracy across a broad range of hunting situations.',
      illustrativeUseSummary:
        'By way of illustration, this type of calibre and platform is commonly used for medium-sized plains game and general field hunting where reliable shot placement, ordinary hunting distances, and humane effectiveness remain important considerations.',
      capabilityLimitationSummary:
        'Its use must nevertheless remain matched to the intended species, terrain, range, and shot-placement conditions, rather than being treated as universally suitable in all hunting circumstances.',
    },
  },
  {
    id: 'sport_22lr_rifle',
    purposeType: 'sport_shooting',
    sectionTypes: ['s16'],
    calibres: ['.22lr', '.22 lr', '22lr'],
    firearmTypes: ['rifle'],
    values: {
      capabilitySummary:
        'A .22LR rifle is commonly well suited to sport shooting and training use because it allows repeated practice, manageable recoil, economical ammunition use, and consistent handling in disciplines built around precision and repetition.',
      illustrativeUseSummary:
        'By way of illustration, this kind of rifle is commonly used for regular range practice, introductory and club-level competition, and shorter-range precision-oriented activities where recoil management and sustained repetition are important.',
      capabilityLimitationSummary:
        'Its value lies principally in training, repetition, and lighter-recoiling sport use, rather than in roles requiring substantially greater power or long-range external-ballistic performance.',
    },
  },
];

export function resolveFirearmCapabilityProfileValues(input: {
  purposeType: MotivationPurposeType;
  sectionType: MotivationSectionType;
  values: Record<string, unknown>;
}): FirearmCapabilityProfileValues {
  const calibre = normalizeValue(input.values.firearmCalibre ?? input.values.calibre);
  const firearmType = normalizeValue(input.values.firearmType);

  const profile = FIREARM_CAPABILITY_PROFILES.find((candidate) => {
    if (candidate.purposeType !== input.purposeType) return false;
    if (
      candidate.sectionTypes?.length &&
      !candidate.sectionTypes.includes(input.sectionType)
    ) {
      return false;
    }
    if (candidate.calibres?.length && !candidate.calibres.includes(calibre)) {
      return false;
    }
    if (candidate.firearmTypes?.length && !candidate.firearmTypes.includes(firearmType)) {
      return false;
    }
    return true;
  });

  return profile?.values ?? {};
}
