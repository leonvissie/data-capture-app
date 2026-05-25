import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionType,
} from './sentenceBank.types';
import {
  resolveCalibreCatalogRecord,
  resolveHuntingSpeciesGroupsForCalibre,
  resolveSightingUseRationale,
} from './factBank';
import type {
  CompetencyCategory,
  FirearmAction,
  MotivationDistanceBand,
  MotivationExistingFirearmComparison,
  MotivationExistingFirearmComparisonEntry,
  MotivationFirearmFitProfile,
  MotivationHuntingProfile,
  MotivationNeedProfile,
  MotivationProfile,
  MotivationRiskExposureTag,
  MotivationSelfDefenceProfile,
  MotivationSportDisciplineTag,
  MotivationSportProfile,
  MotivationStructuredFrequency,
  ResidenceHomeType,
  ResidenceSecurityMeasure,
} from '../../data/types';

interface ResolveStructuredMotivationValuesInput {
  applicationType: MotivationApplicationType;
  sectionType: MotivationSectionType;
  purposeType: MotivationPurposeType;
  values: Record<string, unknown>;
}

const FREQUENCY_LABELS: Record<MotivationStructuredFrequency, string> = {
  rare: 'on a limited basis',
  occasional: 'from time to time',
  regular: 'on a regular basis',
  frequent: 'frequently throughout the year',
};

const RISK_EXPOSURE_LABELS: Record<MotivationRiskExposureTag, string> = {
  travels_after_dark: 'travel after dark',
  frequent_road_travel: 'frequent road travel',
  client_site_visits: 'travel to client or work sites',
  isolated_areas: 'movement through isolated areas',
  crime_hotspots: 'regular presence in areas affected by elevated crime',
  valuable_equipment: 'carriage of valuable equipment',
  family_protection: 'the need to protect family members',
  farm_or_rural_access: 'access to farm or rural areas',
};

const NEED_REASON_LABELS: Record<string, string> = {
  personal_protection: 'lawful personal protection',
  dedicated_hunting: 'hunting',
  dedicated_sport: 'sport shooting',
  training_continuity: 'continued training and participation',
  ethical_hunting: 'ethical and humane hunting use',
  platform_fit: 'practical platform suitability',
  existing_firearm_gap: 'a gap not met by existing firearms',
};

const EXISTING_FIREARM_LIMITATION_LABELS: Record<string, string> = {
  wrong_platform: 'platform differences',
  wrong_calibre: 'calibre limitations',
  not_concealable: 'carry and concealment limitations',
  not_field_practical: 'field-practical limitations',
  not_discipline_specific: 'discipline-specific limitations',
  insufficient_hunting_fit: 'hunting-fit limitations',
  insufficient_training_fit: 'training-fit limitations',
  shared_role_conflict: 'conflicts with other lawful roles already served by existing firearms',
};

const DISTANCE_BAND_LABELS: Record<MotivationDistanceBand, string> = {
  under_50m: 'short distances up to about 50 metres',
  '50_to_150m': 'distances up to about 150 metres',
  '150_to_300m': 'distances up to about 300 metres',
  '300m_plus': 'longer distances beyond 300 metres where conditions permit',
};

const SPORT_DISCIPLINE_LABELS: Record<MotivationSportDisciplineTag, string> = {
  general_range_practice: 'general range practice',
  club_competition: 'club-level competition',
  precision_rimfire: 'precision rimfire shooting',
  practical_rifle: 'practical firearm shooting',
  steel_challenge: 'steel-target participation',
};

const FIREARM_TYPE_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand machine carbine',
};

const FIREARM_ACTION_LABELS: Partial<Record<FirearmAction, string>> = {
  'Semi-automatic': 'Semi-automatic',
  Automatic: 'Automatic',
  Manual: 'Manual',
  Other: 'Other',
};

const HOME_TYPE_LABELS: Record<ResidenceHomeType, string> = {
  House: 'a house',
  'Flat / Apartment': 'a flat or apartment',
  'Townhouse / Duplex': 'a townhouse or duplex',
  'Cluster / Estate unit': 'a cluster or estate unit',
  'Farm / Smallholding dwelling': 'a farm or smallholding dwelling',
  'Room / Shared accommodation': 'a room or shared accommodation',
  Other: 'a residence',
};

const SECURITY_MEASURE_UI_ORDER: ResidenceSecurityMeasure[] = [
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

const SECURITY_MEASURE_SENTENCES: Record<ResidenceSecurityMeasure, string> = {
  None: '',
  'Monitored alarm':
    'A monitored alarm system is installed at the residence to strengthen early warning and response.',
  'Armed response':
    'An armed-response service is available for the residence should an alarm event occur.',
  'Perimeter wall':
    'The property boundary is protected by perimeter walls that help control unauthorized access.',
  'Security fencing':
    'Security fencing is in place around the property to strengthen perimeter control.',
  'Electric fencing':
    'Electric fencing is installed as an additional perimeter deterrent and access-control measure.',
  'Security gates':
    'Security gates are installed at key access points to restrict and control entry.',
  'Burglar bars':
    'Burglar bars are fitted to vulnerable openings to reduce forced-entry risk.',
  'CCTV / cameras':
    'CCTV and camera coverage is used to monitor activity around the residence.',
  'Outdoor beams / sensors':
    'Outdoor beams and sensors are installed to provide early intrusion detection.',
  'Guard dog':
    'A guard dog is maintained as an additional visible and practical deterrent.',
  'Estate / complex access control':
    'Estate or complex access control provides an added layer of monitored entry management.',
  'On-site security / guards':
    'On-site security personnel provide additional access control and visible deterrence.',
};
const S10_PARAGRAPH_MARKER = '__S10_PARAGRAPH__';
const S11_PARAGRAPH_MARKER = '__S11_PARAGRAPH__';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function asYearString(value: unknown): string {
  const digits = asString(value).replace(/[^0-9]/g, '');
  return /^\d{4}$/.test(digits) ? digits : '';
}

function joinWithAnd(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    const resolved = asString(value);
    if (resolved) return resolved;
  }
  return '';
}

function describeYearlyCount(value: number): { quantity: string; isSingular: boolean } {
  if (value <= 1) return { quantity: 'one', isSingular: true };
  if (value === 2) return { quantity: 'two', isSingular: false };
  return { quantity: 'multiple', isSingular: false };
}

function isMeaningfulFirearmValue(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && normalized.toUpperCase() !== 'NONE';
}

function buildRiskContext(
  selfDefenceProfile: MotivationSelfDefenceProfile | undefined,
  applicantContext: MotivationProfile['applicantContext']
): string {
  const tags = Array.from(
    new Set([
      ...(selfDefenceProfile?.exposureTags ?? []),
      ...(applicantContext?.exposureTags ?? []),
    ])
  )
    .map((tag) => RISK_EXPOSURE_LABELS[tag])
    .filter(Boolean);

  const frequencyText = FREQUENCY_LABELS.regular;
  const note = firstNonEmpty(selfDefenceProfile?.note, applicantContext?.backgroundNote);

  const sentences: string[] = [];

  if (tags.length) {
    sentences.push(
      `My daily routine ${frequencyText} involves ${joinWithAnd(tags)}, which creates circumstances in which personal safety risks must be taken seriously.`
    );
  } else {
    sentences.push(
      `My work and travel routine places me in circumstances where personal safety risks must be taken seriously ${frequencyText}.`
    );
  }

  if (note) sentences.push(note);

  return sentences.join(' ');
}

function buildNeedSummary(
  purposeType: MotivationPurposeType,
  needProfile: MotivationNeedProfile | undefined
): string {
  const reasonLabels = (needProfile?.reasonTags ?? [])
    .map((tag) => NEED_REASON_LABELS[tag])
    .filter(Boolean);

  switch (purposeType) {
    case 'self_defence':
      if (reasonLabels.length) {
        return `I require a firearm for lawful personal protection, with due regard to ${joinWithAnd(
          reasonLabels
        )}.`;
      }
      return '';
    case 'hunting':
      if (reasonLabels.length) {
        return `I require the firearm in order to pursue hunting activities with practical suitability for ${joinWithAnd(
          reasonLabels
        )}.`;
      }
      return '';
    case 'sport_shooting':
      if (reasonLabels.length) {
        return `I require the firearm in order to continue participating properly, lawfully, and effectively in sport shooting, with due regard to ${joinWithAnd(
          reasonLabels
        )}.`;
      }
      return '';
    case 'mixed_hunting_sport':
      if (reasonLabels.length) {
        return `I require the firearm in order to participate lawfully and effectively in both hunting and sport shooting, with due regard to ${joinWithAnd(
          reasonLabels
        )}.`;
      }
      return '';
    default:
      return '';
  }
}

function getPurposeSafeUsePhrase(purposeType: MotivationPurposeType): string {
  switch (purposeType) {
    case 'hunting':
      return 'hunting activities';
    case 'sport_shooting':
      return 'sport shooting activities';
    case 'mixed_hunting_sport':
      return 'both hunting and sport shooting activities';
    case 'self_defence':
    default:
      return 'lawful self-defence use';
  }
}

function buildFirearmExperienceSummary(
  purposeType: MotivationPurposeType,
  usedFirearmsSince: string,
  firearmOwnerSince: string
): string {
  const purposePhrase = getPurposeSafeUsePhrase(purposeType);

  if (usedFirearmsSince && firearmOwnerSince) {
    return `My practical firearms exposure dates back to ${usedFirearmsSince}, and I have owned firearms since ${firearmOwnerSince}. This experience has been built on consistent safe-use discipline and responsible conduct aligned with ${purposePhrase}.`;
  }

  if (usedFirearmsSince) {
    return `My practical firearms exposure dates back to ${usedFirearmsSince}. This experience has been built on consistent safe-use discipline and responsible conduct aligned with ${purposePhrase}.`;
  }

  if (firearmOwnerSince) {
    return `I have owned firearms since ${firearmOwnerSince}. This experience has been built on consistent safe-use discipline and responsible conduct aligned with ${purposePhrase}.`;
  }

  return '';
}

function buildExistingComparisonSummary(
  comparison: MotivationExistingFirearmComparison | undefined,
  requiresComparison: boolean
): string {
  if (!requiresComparison) return '';

  const comparisonEntries = comparison?.comparisonEntries ?? [];
  if (comparisonEntries.length) {
    return buildComparisonEntriesParagraphs(comparisonEntries, comparison).join(' ');
  }

  const limitationLabels = (comparison?.limitationTags ?? [])
    .map((tag) => EXISTING_FIREARM_LIMITATION_LABELS[tag])
    .filter(Boolean);
  const note = firstNonEmpty(comparison?.overviewNote, comparison?.note);

  if (!limitationLabels.length) {
    return [
      'The other firearms presently in my possession do not provide the same practical suitability as the firearm for which this renewal motivation is prepared.',
      note,
    ]
      .filter(Boolean)
      .join(' ');
  }

  const summary =
    `My existing firearms do not adequately fulfil the role of the firearm applied for due to ${joinWithAnd(
      limitationLabels
    )}.`;

  return [summary, note].filter(Boolean).join(' ');
}

function buildComparisonEntriesParagraphs(
  entries: MotivationExistingFirearmComparisonEntry[],
  comparison: MotivationExistingFirearmComparison | undefined
): string[] {
  const validEntries = entries.filter(
    (entry) =>
      Boolean(buildExistingFirearmLabel(entry)) ||
      Boolean((entry.limitationTags ?? []).length) ||
      Boolean(asString(entry.note))
  );
  if (!validEntries.length) {
    const fallback = buildLegacyComparisonFallback(comparison);
    return fallback ? [fallback] : [];
  }

  const entrySentences = validEntries
    .map((entry) => buildComparisonEntrySentence(entry))
    .filter(Boolean);
  const overviewNote = asString(comparison?.overviewNote);
  const legacyNote = asString(comparison?.note);

  return [...entrySentences, overviewNote, legacyNote].filter(Boolean);
}

function buildLegacyComparisonFallback(
  comparison: MotivationExistingFirearmComparison | undefined
): string {
  const limitationLabels = (comparison?.limitationTags ?? [])
    .map((tag) => EXISTING_FIREARM_LIMITATION_LABELS[tag])
    .filter(Boolean);
  const note = firstNonEmpty(comparison?.overviewNote, comparison?.note);

  if (!limitationLabels.length) return note;

  const summary =
    `My existing firearms do not adequately fulfil the role of the firearm applied for due to ${joinWithAnd(
      limitationLabels
    )}.`;

  return [summary, note].filter(Boolean).join(' ');
}

function buildComparisonEntrySentence(
  entry: MotivationExistingFirearmComparisonEntry
): string {
  const label = buildExistingFirearmLabel(entry);
  const limitations = (entry.limitationTags ?? [])
    .map((tag) => EXISTING_FIREARM_LIMITATION_LABELS[tag])
    .filter(Boolean);
  const note = asString(entry.note);
  const roleText = getComparisonRoleText(entry.comparisonRole);

  if (!label && !limitations.length) {
    return note;
  }

  const sentenceParts = [
    label ? `My ${label}${roleText}` : '',
    limitations.length ? `remains limited by ${joinWithAnd(limitations)}` : '',
  ].filter(Boolean);

  const baseSentence = sentenceParts.length ? `${sentenceParts.join(' ')}.` : '';
  return [baseSentence, note].filter(Boolean).join(' ');
}

function buildExistingFirearmLabel(
  entry: MotivationExistingFirearmComparisonEntry
): string {
  const make = asString(entry.make);
  const model = asString(entry.model);
  const calibre = asString(entry.calibre);
  const serial = asString(entry.firearmSerialNumber);
  const explicitLabel = asString(entry.label);
  const action = entry.firearmAction ? FIREARM_ACTION_LABELS[entry.firearmAction] ?? '' : '';
  const firearmType = entry.firearmType ? FIREARM_TYPE_LABELS[entry.firearmType] ?? '' : '';
  const mainParts = [make, model].filter(
    (value) => value && isMeaningfulFirearmValue(value)
  );
  const descriptor = [action, firearmType].filter(Boolean).join(' ').trim();
  const prefix = [...mainParts, descriptor].filter(Boolean).join(' ').trim();
  const suffixParts = [
    calibre ? `calibre ${calibre}` : '',
    serial ? `serial number ${serial}` : '',
  ].filter(Boolean);

  if (prefix && suffixParts.length) return `${prefix}, ${suffixParts.join(', ')}`;
  if (prefix) return prefix;
  if (suffixParts.length) return suffixParts.join(', ');
  if (explicitLabel && isMeaningfulFirearmValue(explicitLabel)) return explicitLabel;
  return '';
}

function getComparisonRoleText(
  role: MotivationExistingFirearmComparisonEntry['comparisonRole']
): string {
  switch (role) {
    case 'same_role':
      return ', although already used in a similar lawful role,';
    case 'partial_overlap':
      return ', while capable of limited overlap,';
    case 'different_role':
      return ', serves a different primary lawful role,';
    default:
      return '';
  }
}

function buildHuntingActivitySummary(profile: MotivationHuntingProfile | undefined): string {
  if (!profile) return '';

  const frequency =
    typeof profile.tripsPerYear === 'number' && profile.tripsPerYear > 0
      ? (() => {
          const count = describeYearlyCount(profile.tripsPerYear);
          const prefix = count.quantity === 'multiple' ? '' : 'approximately ';
          const unit = count.isSingular ? 'hunting trip' : 'hunting trips';
          return `${prefix}${count.quantity} ${unit} per year`;
        })()
      : '';
  const terrain = (profile.terrainTags ?? []).map((tag) => tag.replace(/_/g, ' '));
  const distance = profile.distanceBand ? DISTANCE_BAND_LABELS[profile.distanceBand] : '';
  const sentences: string[] = [];

  if (terrain.length || distance) {
    const clauses = [
      terrain.length ? `terrain such as ${joinWithAnd(terrain)}` : '',
      distance ? `at ${distance}` : '',
    ].filter(Boolean);
    sentences.push(`I hunt lawfully ${frequency || 'as circumstances permit'}, including ${clauses.join(', ')}.`);
  } else if (frequency) {
    sentences.push(`I hunt lawfully ${frequency}.`);
  }

  return sentences.join(' ');
}

function buildSportActivitySummary(profile: MotivationSportProfile | undefined): string {
  if (!profile) return '';

  const disciplines = (profile.disciplineTags ?? [])
    .map((tag) => SPORT_DISCIPLINE_LABELS[tag])
    .filter(Boolean);
  const frequency =
    typeof profile.sessionsPerYear === 'number' && profile.sessionsPerYear > 0
      ? (() => {
          const count = describeYearlyCount(profile.sessionsPerYear);
          const prefix = count.quantity === 'multiple' ? '' : 'approximately ';
          const unit = count.isSingular
            ? 'training or participation session'
            : 'training or participation sessions';
          return `${prefix}${count.quantity} ${unit} per year`;
        })()
      : '';
  const sentences: string[] = [];

  if (disciplines.length && frequency) {
    sentences.push(
      `I participate in ${joinWithAnd(disciplines)} ${frequency}.`
    );
  } else if (disciplines.length) {
    sentences.push(`I participate in ${joinWithAnd(disciplines)}.`);
  } else if (frequency) {
    sentences.push(`I participate in organised sport shooting ${frequency}.`);
  }

  return sentences.join(' ');
}

function normalizeHomeType(value: unknown): ResidenceHomeType | null {
  const raw = asString(value);
  if (!raw) return null;
  const match = (Object.keys(HOME_TYPE_LABELS) as ResidenceHomeType[]).find(
    (option) => option.toLowerCase() === raw.toLowerCase()
  );
  return match ?? null;
}

function normalizeSecurityMeasures(value: unknown): ResidenceSecurityMeasure[] {
  const raw = asStringArray(value);
  if (!raw.length) return [];
  if (raw.some((entry) => entry.trim().toLowerCase() === 'none')) return [];
  const selected = new Set(raw.map((entry) => entry.toLowerCase()));
  return SECURITY_MEASURE_UI_ORDER.filter((option) =>
    selected.has(option.toLowerCase())
  );
}

function buildHomeTypeSummary(homeType: ResidenceHomeType | null): string {
  if (!homeType) return '';
  return `The applicant resides in ${HOME_TYPE_LABELS[homeType]}.`;
}

function buildHomeSecurityIntro(securityMeasures: ResidenceSecurityMeasure[]): string {
  if (!securityMeasures.length) return '';
  return 'In addition to the firearm storage mentioned above, the following additional safety measures are present at the premises:';
}

function buildHomeSecurityMeasureParagraphs(
  securityMeasures: ResidenceSecurityMeasure[]
): string[] {
  return securityMeasures
    .map((measure) => SECURITY_MEASURE_SENTENCES[measure] ?? '')
    .filter(Boolean);
}

function buildSuitabilitySummary(
  purposeType: MotivationPurposeType,
  sectionType: MotivationSectionType,
  firearmMake: string,
  firearmModel: string,
  firearmFitProfile: MotivationFirearmFitProfile | undefined,
): string {
  const firearmLabel = [firearmMake.trim(), firearmModel.trim()]
    .filter(isMeaningfulFirearmValue)
    .join(' ')
    .trim();
  const firearmDescription = firearmLabel || 'selected firearm';
  const baseParagraphs = [
    `In assessing the suitability of the ${firearmDescription}, practical control of the firearm, predictable handling under normal use, and safe, repeatable shot placement were considered alongside the intended lawful activity.`,
    'This firearm is motivated as fit for the intended lawful role on the basis of practical handling, controllability, and consistent safe operation in the applicant’s expected use conditions.',
  ];

  const purposeLabel =
    purposeType === 'self_defence'
      ? 'self-defence'
      : purposeType === 'hunting'
        ? 'hunting'
        : purposeType === 'sport_shooting'
          ? 'sport shooting'
          : 'hunting and sport shooting';
  const sectionLabel = sectionType.toUpperCase();
  const selectedAttributes = Array.from(new Set(firearmFitProfile?.attributeTags ?? []));
  const pillParagraphs = selectedAttributes
    .map((tag) => {
      switch (tag) {
        case 'reliable':
          return `Reliability remains central to this ${sectionLabel} motivation, as the ${firearmDescription} must function consistently for ${purposeLabel} in the manner described in this application.`;
        case 'accurate':
          return `Practical accuracy of the ${firearmDescription} is material to ${purposeLabel}, as responsible and lawful use depends on repeatable shot placement in expected real-world conditions.`;
        case 'portable':
          return purposeType === 'self_defence'
            ? `For lawful self-defence, practical portability of the ${firearmDescription} supports routine lawful readiness and responsible carry in daily life.`
            : `For ${purposeLabel}, practical portability of the ${firearmDescription} supports safe handling, transport, and deployment across normal use conditions.`;
        case 'low_ammunition_cost':
          return `Economical ammunition use supports sustained lawful training with the ${firearmDescription}, helping maintain competence and safe handling standards relevant to ${purposeLabel}.`;
        case 'training_friendly':
          return `The ${firearmDescription} remains training-friendly in this ${sectionLabel} context, supporting regular repetition and continued safe proficiency for ${purposeLabel}.`;
        case 'field_practical':
          return `Field practicality of the ${firearmDescription} supports ${purposeLabel}, including operation under ordinary environmental and handling conditions expected for this application.`;
        case 'humane_application':
          return purposeType === 'hunting' || purposeType === 'mixed_hunting_sport'
            ? `In hunting use, the ${firearmDescription} is considered for humane application, with emphasis on appropriate shot placement, ethical outcomes, and responsible lawful use within its practical limits.`
            : `The ${firearmDescription} is assessed for responsible lawful application, with emphasis on controlled use, safe outcomes, and operation within practical limits.`;
        default:
          return '';
      }
    })
    .filter(Boolean);

  const fitNote = asString(firearmFitProfile?.note);
  const noteParagraph = fitNote
    ? `${fitNote}`
    : '';

  return [...baseParagraphs, ...pillParagraphs, noteParagraph]
    .filter(Boolean)
    .join(` ${S10_PARAGRAPH_MARKER} `);
}

function buildParticipationSummary(
  purposeType: MotivationPurposeType,
  huntingProfile: MotivationHuntingProfile | undefined,
  sportProfile: MotivationSportProfile | undefined,
  selfDefenceProfile: MotivationSelfDefenceProfile | undefined
): string {
  if (purposeType === 'self_defence') {
    const note = asString(selfDefenceProfile?.note);
    const readinessSentence =
      `I maintain familiarity with safe handling, secure storage, and lawful readiness ${FREQUENCY_LABELS.regular}.`;
    if (!note) return readinessSentence;
    return [
      readinessSentence,
      note,
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (purposeType === 'hunting') {
    return 'My hunting participation is sustained throughout the year as opportunities and seasons allow, with regular preparation and range work to ensure responsible, effective use.';
  }

  if (purposeType === 'sport_shooting') {
    return 'I endeavour to participate in organised sport-shooting activities throughout the year as time and opportunities allow, together with regular training and range participation to maintain safe handling and consistent performance.';
  }

  if (purposeType === 'mixed_hunting_sport') {
    return 'My involvement in hunting and sport shooting is ongoing throughout the year as time, opportunities, and seasons allow, with consistent training and range participation to support responsible and effective firearm use.';
  }

  return '';
}

function buildHuntingContext(
  profile: MotivationHuntingProfile | undefined,
  sightingSystemValue?: string
): string {
  if (!profile) return '';

  const distance = profile.distanceBand ? DISTANCE_BAND_LABELS[profile.distanceBand] : '';
  const sightingSystem = sightingSystemValue ? sightingSystemValue.replace(/_/g, ' ') : '';
  const terrain = (profile.terrainTags ?? []).map((tag) => tag.replace(/_/g, ' '));

  const clauses = [
    terrain.length ? `terrain including ${joinWithAnd(terrain)}` : '',
    distance ? `at ${distance}` : '',
    sightingSystem ? `using ${sightingSystem}` : '',
  ].filter(Boolean);

  if (!clauses.length) return '';
  return `The firearm will be used for hunting in ${clauses.join(', ')} where the platform and calibre remain appropriate to the intended field conditions.`;
}

function buildHuntingSpeciesSummary(
  profile: MotivationHuntingProfile | undefined,
  firearmCalibre?: string
): string {
  const calibreSpeciesExamples = Array.from(
    new Set(
      resolveHuntingSpeciesGroupsForCalibre(firearmCalibre).flatMap(
        (group) => group.speciesExamples ?? []
      )
    )
  ).filter(Boolean);
  if (calibreSpeciesExamples.length) {
    const cappedExamples = calibreSpeciesExamples.slice(0, 6);
    return joinWithAnd(cappedExamples);
  }

  const species = (profile?.species ?? []).map((entry) => asString(entry)).filter(Boolean);
  if (species.length) return joinWithAnd(species);
  return 'the intended hunting species';
}

function buildHuntingDistanceSummary(
  profile: MotivationHuntingProfile | undefined,
  firearmCalibre?: string
): string {
  const calibreRecord = resolveCalibreCatalogRecord(firearmCalibre);
  if (calibreRecord?.distanceBand) {
    return DISTANCE_BAND_LABELS[calibreRecord.distanceBand];
  }

  const distanceBand = profile?.distanceBand;
  if (!distanceBand) return 'the expected field distances';
  return DISTANCE_BAND_LABELS[distanceBand];
}

function buildSportContext(profile: MotivationSportProfile | undefined): string {
  if (!profile) return '';
  const disciplines = (profile.disciplineTags ?? [])
    .map((tag) => SPORT_DISCIPLINE_LABELS[tag])
    .filter(Boolean);
  if (!disciplines.length) return '';
  return `The firearm will be used in sport shooting activities focused on ${joinWithAnd(
    disciplines
  )}.`;
}

function getMotivationProfile(values: Record<string, unknown>): MotivationProfile | null {
  const record = asRecord(values.motivationProfile);
  if (!record) return null;
  return record as MotivationProfile;
}

export function resolveStructuredMotivationValues(
  input: ResolveStructuredMotivationValuesInput
): Record<string, unknown> {
  const profile = getMotivationProfile(input.values);
  if (!profile) return {};

  const applicantContext = profile.applicantContext;
  const needProfile = profile.needProfile;
  const huntingProfile = profile.huntingProfile;
  const sportProfile = profile.sportProfile;
  const selfDefenceProfile = profile.selfDefenceProfile;
  const firearmFitProfile = profile.firearmFitProfile;
  const existingComparison = profile.existingComparison;
  const firearmCalibre = firstNonEmpty(input.values.firearmCalibre, input.values.calibre);
  const homeType = normalizeHomeType(input.values.homeType);
  const securityMeasures = normalizeSecurityMeasures(input.values.securityMeasures);
  const homeSecurityMeasureParagraphs =
    buildHomeSecurityMeasureParagraphs(securityMeasures);
  const usedFirearmsSince = asYearString(input.values.usedFirearmsSince);
  const firearmOwnerSince = asYearString(input.values.firearmOwnerSince);
  const requiresComparison = asBoolean(input.values.requiresComparison);
  const inadequacyParagraphs = buildComparisonEntriesParagraphs(
    existingComparison?.comparisonEntries ?? [],
    existingComparison
  );
  const inadequacySummary = buildExistingComparisonSummary(existingComparison, requiresComparison);

  const activitySummary =
    input.purposeType === 'sport_shooting'
        ? buildSportActivitySummary(sportProfile)
        : input.purposeType === 'mixed_hunting_sport'
          ? buildSportActivitySummary(sportProfile)
          : '';

  const resolvedSightingSystem = asString(
    firearmFitProfile?.sightingSystem ?? huntingProfile?.sightingSystem
  );
  const { sightingSystemLabel, sightingUseRationale } = resolveSightingUseRationale({
    system: resolvedSightingSystem,
    purposeType: input.purposeType,
  });

  return {
    occupation: applicantContext?.occupation,
    province: applicantContext?.residenceProvince,
    firearmExperienceSummary: buildFirearmExperienceSummary(
      input.purposeType,
      usedFirearmsSince,
      firearmOwnerSince
    ),
    needSummary: buildNeedSummary(input.purposeType, needProfile),
    primaryNeedSummary: asString(needProfile?.primaryNeed),
    needNoteSummary: asString(needProfile?.note),
    selfDefenceContextSummary: buildRiskContext(selfDefenceProfile, applicantContext),
    suitabilitySummary: buildSuitabilitySummary(
      input.purposeType,
      input.sectionType,
      asString(input.values.firearmMake),
      asString(input.values.firearmModel),
      firearmFitProfile,
    ),
    homeTypeSummary: buildHomeTypeSummary(homeType),
    homeSecurityIntro: buildHomeSecurityIntro(securityMeasures),
    homeSecurityMeasureSummary: homeSecurityMeasureParagraphs.length
      ? '__HOME_SECURITY_MEASURE_PARAGRAPHS__'
      : '',
    homeSecurityMeasureParagraphs,
    activitySummary,
    huntingNoteSummary: asString(huntingProfile?.note),
    sportNoteSummary: asString(sportProfile?.note),
    participationFrequencySummary: buildParticipationSummary(
      input.purposeType,
      huntingProfile,
      sportProfile,
      selfDefenceProfile
    ),
    requiresComparison,
    inadequacySummary,
    inadequacyParagraphs,
    existingFirearmOverlapSummary: inadequacySummary,
    huntingContextSummary: buildHuntingContext(huntingProfile, resolvedSightingSystem),
    huntingSpeciesSummary: buildHuntingSpeciesSummary(huntingProfile, firearmCalibre),
    huntingDistanceSummary: buildHuntingDistanceSummary(huntingProfile, firearmCalibre),
    huntingEnvironmentSummary: '',
    sportContextSummary: buildSportContext(sportProfile),
    sportDisciplineSummary: buildSportContext(sportProfile),
    sightingSystem: resolvedSightingSystem,
    sightingSystemLabel,
    sightingUseRationale,
    structuredInputSummary: [
      applicantContext?.yearsOfFirearmExperience
        ? `Firearm experience: ${applicantContext.yearsOfFirearmExperience} year${
            applicantContext.yearsOfFirearmExperience === 1 ? '' : 's'
          }`
        : '',
      asStringArray(sportProfile?.disciplineTags).length
        ? `Disciplines: ${joinWithAnd(
            asStringArray(sportProfile?.disciplineTags).map(
              (tag) => SPORT_DISCIPLINE_LABELS[tag as MotivationSportDisciplineTag] ?? tag
            )
          )}`
        : '',
    ]
      .filter(Boolean)
      .join(' | '),
  };
}
