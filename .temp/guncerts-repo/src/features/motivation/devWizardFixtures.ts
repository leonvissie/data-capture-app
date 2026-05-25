import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionType,
} from '../../config/motivation/sentenceBank.types';
import type {
  CompetencyCategory,
  Firearm,
  FirearmAction,
  MotivationDistanceBand,
  MotivationFirearmAttributeTag,
  MotivationFirearmLimitationTag,
  MotivationHuntingTerrainTag,
  MotivationProfile,
  MotivationRiskExposureTag,
  MotivationSportDisciplineTag,
  MotivationStructuredFrequency,
} from '../../data/types';

export type MotivationWizardFixture = {
  id: string;
  label: string;
  applicationType: MotivationApplicationType;
  sectionType: MotivationSectionType;
  purposeType: MotivationPurposeType;
  targetFirearm: {
    make: string;
    model: string;
    calibre: string;
    firearmType: CompetencyCategory;
    firearmAction: FirearmAction;
    firearmSerialNumber?: string;
  };
  motivationProfile: MotivationProfile;
};

export const APPLICATION_TYPE_LABELS: Record<MotivationApplicationType, string> = {
  renewal: 'Renewal',
  new: 'New application',
};

export const SECTION_TYPE_LABELS: Record<MotivationSectionType, string> = {
  s13: 'Section 13',
  s15: 'Section 15',
  s16: 'Section 16',
};

export const PURPOSE_TYPE_LABELS: Record<MotivationPurposeType, string> = {
  self_defence: 'Self-defence',
  hunting: 'Hunting',
  sport_shooting: 'Sport shooting',
  mixed_hunting_sport: 'Mixed / both',
};

export const FIREARM_TYPE_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand machine carbine',
};

export const FIREARM_ACTION_LABELS: Record<FirearmAction, string> = {
  'Semi-automatic': 'Semi-automatic',
  Automatic: 'Automatic',
  Manual: 'Manual',
  Other: 'Other',
};

export const FREQUENCY_OPTIONS: Array<{
  value: MotivationStructuredFrequency;
  label: string;
}> = [
  { value: 'rare', label: 'Rare' },
  { value: 'occasional', label: 'Occasional' },
  { value: 'regular', label: 'Regular' },
  { value: 'frequent', label: 'Frequent' },
];

export const RISK_EXPOSURE_OPTIONS: Array<{
  value: MotivationRiskExposureTag;
  label: string;
}> = [
  { value: 'travels_after_dark', label: 'Travel after dark' },
  { value: 'frequent_road_travel', label: 'Frequent road travel' },
  { value: 'client_site_visits', label: 'Client/work site visits' },
  { value: 'isolated_areas', label: 'Isolated areas' },
  { value: 'crime_hotspots', label: 'Crime hotspots' },
  { value: 'valuable_equipment', label: 'Valuable equipment' },
  { value: 'family_protection', label: 'Family protection' },
  { value: 'farm_or_rural_access', label: 'Farm or rural access' },
];

export const LIMITATION_TAG_OPTIONS: Array<{
  value: MotivationFirearmLimitationTag;
  label: string;
}> = [
  { value: 'wrong_platform', label: 'Wrong firearm type' },
  { value: 'wrong_calibre', label: 'Wrong calibre' },
  { value: 'not_concealable', label: 'Not practical to carry' },
  { value: 'not_field_practical', label: 'Not practical in the field' },
  { value: 'not_discipline_specific', label: 'Not suited to this discipline' },
  { value: 'insufficient_hunting_fit', label: 'Less suitable for hunting' },
  { value: 'insufficient_training_fit', label: 'Less suitable for training' },
  { value: 'shared_role_conflict', label: 'Already used for another purpose' },
];

export const FIREARM_ATTRIBUTE_OPTIONS: Array<{
  value: MotivationFirearmAttributeTag;
  label: string;
}> = [
  { value: 'reliable', label: 'Reliable' },
  { value: 'accurate', label: 'Accurate' },
  { value: 'portable', label: 'Portable' },
  { value: 'low_ammunition_cost', label: 'Low ammo cost' },
  { value: 'training_friendly', label: 'Training friendly' },
  { value: 'field_practical', label: 'Field practical' },
  { value: 'humane_application', label: 'Humane application' },
];

export const HUNTING_TERRAIN_OPTIONS: Array<{
  value: MotivationHuntingTerrainTag;
  label: string;
}> = [
  { value: 'bushveld', label: 'Bushveld' },
  { value: 'open_field', label: 'Open field' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'mixed_field', label: 'Mixed field' },
];

export const DISTANCE_OPTIONS: Array<{
  value: MotivationDistanceBand;
  label: string;
}> = [
  { value: 'under_50m', label: 'Under 50m' },
  { value: '50_to_150m', label: 'Up to 150m' },
  { value: '150_to_300m', label: 'Up to 300m' },
  { value: '300m_plus', label: '300m+' },
];

export const SPORT_DISCIPLINE_OPTIONS: Array<{
  value: MotivationSportDisciplineTag;
  label: string;
}> = [
  { value: 'general_range_practice', label: 'General range practice' },
  { value: 'club_competition', label: 'Club competition' },
  { value: 'precision_rimfire', label: 'Precision rimfire' },
  { value: 'practical_rifle', label: 'Practical firearm shooting' },
  { value: 'steel_challenge', label: 'Steel challenge' },
];

export function describeFirearm(firearm: {
  make?: string;
  model?: string;
  calibre?: string;
  firearmType?: CompetencyCategory;
}): string {
  const parts = [firearm.make, firearm.model, firearm.firearmType ? FIREARM_TYPE_LABELS[firearm.firearmType] : '']
    .filter(Boolean);
  const calibre = (firearm.calibre ?? '').trim();
  if (parts.length && calibre) return `${parts.join(' ')} in ${calibre}`;
  if (parts.length) return parts.join(' ');
  return calibre || 'Unnamed firearm';
}

export function toComparisonLabel(firearm: Firearm): string {
  return describeFirearm({
    make: firearm.make,
    model: firearm.model,
    calibre: firearm.calibre,
    firearmType: firearm.firearmType,
  });
}

export const DEV_MOTIVATION_WIZARD_FIXTURES: MotivationWizardFixture[] = [
  {
    id: 's13-renewal',
    label: 'Section 13 renewal',
    applicationType: 'renewal',
    sectionType: 's13',
    purposeType: 'self_defence',
    targetFirearm: {
      make: 'Glock',
      model: '19',
      calibre: '9mm',
      firearmType: 'Handgun',
      firearmAction: 'Semi-automatic',
      firearmSerialNumber: 'GLK190001',
    },
    motivationProfile: {
      version: 1,
      applicantContext: {
        occupation: 'Consultant',
        residenceProvince: 'Gauteng',
        yearsOfFirearmExperience: 8,
        travelFrequency: 'regular',
        exposureTags: ['travels_after_dark', 'frequent_road_travel', 'valuable_equipment'],
      },
      needProfile: {
        reasonTags: ['personal_protection'],
        note: 'My work routine requires regular travel and movement in circumstances where lawful personal protection remains necessary.',
      },
      selfDefenceProfile: {
        exposureTags: ['crime_hotspots', 'family_protection'],
        travelFrequency: 'regular',
      },
      existingComparison: {
        comparisonEntries: [
          {
            label: 'CZ 75 handgun in calibre 9mm',
            comparisonRole: 'partial_overlap',
            limitationTags: ['shared_role_conflict', 'not_concealable'],
            note: 'It is less practical for daily carry and routine lawful readiness than the target handgun.',
          },
        ],
      },
      firearmFitProfile: {
        attributeTags: ['reliable', 'portable', 'manageable_recoil'],
        recoilSensitivity: 'moderate',
      },
    },
  },
  {
    id: 's16-hunting-new',
    label: 'Section 16 hunting new application',
    applicationType: 'new',
    sectionType: 's16',
    purposeType: 'hunting',
    targetFirearm: {
      make: 'Winchester',
      model: 'Rimfire Hunter',
      calibre: '.22 LR',
      firearmType: 'Rifle',
      firearmAction: 'Manual',
      firearmSerialNumber: 'ANON22001',
    },
    motivationProfile: {
      version: 1,
      applicantContext: {
        occupation: 'IT business owner',
        residenceProvince: 'Gauteng',
        yearsOfFirearmExperience: 20,
      },
      needProfile: {
        reasonTags: ['dedicated_hunting', 'ethical_hunting', 'platform_fit'],
      },
      existingComparison: {
        comparisonEntries: [
          {
            label: 'Howa .308 bolt-action rifle',
            comparisonRole: 'partial_overlap',
            limitationTags: ['wrong_calibre', 'not_field_practical'],
            note: 'It is better suited to larger game and longer field use than the short-range rimfire role described here.',
          },
        ],
        overviewNote:
          'My existing firearms do not provide the same practical fit for small-game hunting at short distances with this platform.',
      },
      huntingProfile: {
        species: ['guineafowl', 'rock dassie', 'duiker', 'steenbuck'],
        terrainTags: ['bushveld'],
        distanceBand: 'under_50m',
        sightingSystem: 'iron_sights',
        tripFrequency: 'regular',
        tripsPerYear: 3,
        note: 'The rifle is intended for small game and terrestrial game birds in bushveld conditions with open sights.',
      },
      firearmFitProfile: {
        attributeTags: ['manageable_recoil', 'accurate', 'field_practical', 'short_range_suitable', 'humane_application'],
      },
      supportProfile: {
        hasEndorsement: true,
        hasActivityEvidence: true,
      },
    },
  },
  {
    id: 's16-sport-renewal',
    label: 'Section 16 sport renewal',
    applicationType: 'renewal',
    sectionType: 's16',
    purposeType: 'sport_shooting',
    targetFirearm: {
      make: 'CZ',
      model: '457',
      calibre: '.22LR',
      firearmType: 'Rifle',
      firearmAction: 'Manual',
      firearmSerialNumber: 'CZ457001',
    },
    motivationProfile: {
      version: 1,
      applicantContext: {
        occupation: 'Consultant',
        residenceProvince: 'Gauteng',
        yearsOfFirearmExperience: 12,
      },
      needProfile: {
        reasonTags: ['dedicated_sport', 'training_continuity', 'platform_fit'],
      },
      existingComparison: {
        comparisonEntries: [
          {
            label: 'Glock 19 handgun in calibre 9mm',
            comparisonRole: 'different_role',
            limitationTags: ['not_discipline_specific', 'insufficient_training_fit'],
            note: 'It remains primarily configured for lawful self-defence rather than rimfire precision training.',
          },
        ],
      },
      sportProfile: {
        disciplineTags: ['precision_rimfire', 'club_competition'],
        participationFrequency: 'regular',
        sessionsPerYear: 18,
      },
      firearmFitProfile: {
        attributeTags: ['manageable_recoil', 'accurate', 'low_ammunition_cost', 'training_friendly'],
      },
      supportProfile: {
        hasEndorsement: true,
        hasActivityEvidence: true,
      },
    },
  },
];
