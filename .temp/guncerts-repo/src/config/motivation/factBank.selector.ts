import { factBank } from './factBank';
import type {
  CalibreUseContext,
  FactContextType,
  FactRecord,
  FactRegionCode,
  FactSelectorContext,
  SelectedFact,
} from './factBank.types';

const FIREARM_DESCRIPTION_FACT_IDS = new Set([
  'sighting_self_defence_suitability',
  'sighting_hunting_suitability',
  'sport_precision_rimfire_context',
  'sport_general_range_context',
  'sport_club_competition_context',
  'sport_practical_rifle_context',
  'sport_steel_challenge_context',
  'sighting_sport_shooting_suitability',
]);

function isFirearmDescriptionFact(fact: FactRecord): boolean {
  if (FIREARM_DESCRIPTION_FACT_IDS.has(fact.id)) return true;
  return (fact.wording ?? '').includes('${firearmDescription}');
}

function normalizeContextToUseContext(
  contextType: FactSelectorContext['contextType'],
): CalibreUseContext | null {
  switch (contextType) {
    case 'self_defence':
    case 'hunting':
    case 'sport_shooting':
      return contextType;
    case 'mixed_hunting_sport':
      return 'general';
    default:
      return null;
  }
}

function getEquivalentContextTypes(
  contextType: FactSelectorContext['contextType'],
): FactSelectorContext['contextType'][] {
  if (contextType === 'mixed_hunting_sport') {
    return ['mixed_hunting_sport', 'hunting', 'sport_shooting'];
  }
  return [contextType];
}

function normalizeFirearmTypeKey(firearmType?: string): string {
  if (!firearmType) return '';
  const normalized = firearmType
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.includes('handgun')) return 'handgun';
  if (normalized.includes('shotgun')) return 'shotgun';
  if (normalized.includes('rifle')) return 'rifle';
  return normalized;
}

function firearmTypesMatch(
  contextFirearmType?: string,
  factFirearmType?: string
): boolean {
  const normalizedContext = normalizeFirearmTypeKey(contextFirearmType);
  const normalizedFact = normalizeFirearmTypeKey(factFirearmType);
  return Boolean(
    normalizedContext &&
      normalizedFact &&
      normalizedContext === normalizedFact
  );
}

function matchesUsageContextTypes(
  contextType: FactSelectorContext['contextType'],
  usageContextTypes?: FactContextType[]
): boolean {
  if (!usageContextTypes?.length) return true;
  const equivalentContextTypes = getEquivalentContextTypes(contextType);
  return equivalentContextTypes.some((type) => usageContextTypes.includes(type));
}

const REGION_CODE_ALIASES: Record<string, FactRegionCode> = {
  ec: 'ec',
  'eastern cape': 'ec',
  easterncape: 'ec',
  fs: 'fs',
  'free state': 'fs',
  freestate: 'fs',
  gp: 'gp',
  gauteng: 'gp',
  kzn: 'kzn',
  'kwa zulu natal': 'kzn',
  'kwazulu natal': 'kzn',
  'kwa-zulu natal': 'kzn',
  'kwa-zulu-natal': 'kzn',
  lp: 'lp',
  limpopo: 'lp',
  mp: 'mp',
  mpumalanga: 'mp',
  nw: 'nw',
  'north west': 'nw',
  northwest: 'nw',
  nc: 'nc',
  'northern cape': 'nc',
  northerncape: 'nc',
  wc: 'wc',
  'western cape': 'wc',
  westerncape: 'wc',
  za: 'za',
  'south africa': 'za',
  southafrica: 'za',
};

function normalizeRegionCode(regionCode?: string): FactRegionCode | undefined {
  if (!regionCode) return undefined;

  const normalizedKey = regionCode
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  return REGION_CODE_ALIASES[normalizedKey] ?? normalizedKey;
}

function normalizeCalibreKey(calibre?: string): string {
  if (!calibre) return '';

  const compact = calibre
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  if (!compact) return '';

  if (
    compact.includes('9x19') ||
    compact.includes('9mmp') ||
    compact.includes('9mmpar') ||
    compact === '9mm'
  ) {
    return '9mm';
  }

  if (
    compact.includes('22shortlonglr') ||
    compact.includes('22longrifle') ||
    compact.includes('22lr')
  ) {
    return '22lr';
  }

  if (
    compact.includes('762x51') ||
    compact.includes('308win') ||
    compact === '308'
  ) {
    return '308';
  }

  if (
    compact.includes('303british') ||
    compact.includes('303brit')
  ) {
    return '303british';
  }

  if (
    compact.includes('556x45') ||
    compact.includes('556nato') ||
    compact === '556'
  ) {
    return '556x45';
  }

  if (
    compact.includes('222rem') ||
    compact.includes('57x43') ||
    compact.includes('tripledeuce')
  ) {
    return '222rem';
  }

  if (compact.includes('223rem')) {
    return '223rem';
  }

  if (
    compact.includes('223') &&
    !compact.includes('556')
  ) {
    return '223rem';
  }

  if (compact === '410') {
    return '410ga';
  }

  const gaugeMatch = compact.match(/^(\d+)(ga|gauge|bore)$/);
  if (gaugeMatch) {
    return `${gaugeMatch[1]}ga`;
  }

  const winMatch = compact.match(/^(\d+)(win|winchester)$/);
  if (winMatch) {
    return winMatch[1];
  }

  return compact;
}

function calibresMatch(contextCalibre?: string, factCalibre?: string): boolean {
  if (!contextCalibre || !factCalibre) return false;

  const normalizedContext = normalizeCalibreKey(contextCalibre);
  const normalizedFact = normalizeCalibreKey(factCalibre);

  return Boolean(normalizedContext && normalizedFact && normalizedContext === normalizedFact);
}

function scoreFact(fact: FactRecord, context: FactSelectorContext): SelectedFact | null {
  const matchedOn: string[] = [];
  let score = 0;

  const equivalentContextTypes = getEquivalentContextTypes(context.contextType);
  const contextMatchedByType =
    fact.contextType === 'shared' ||
    equivalentContextTypes.includes(fact.contextType);
  const contextMatchedByUsage = matchesUsageContextTypes(
    context.contextType,
    fact.usage?.contextTypes
  );

  if (!contextMatchedByType && !contextMatchedByUsage) {
    return null;
  }
  if (fact.contextType === context.contextType) {
    score += 30;
    matchedOn.push('contextType');
  } else if (contextMatchedByUsage) {
    score += 8;
    matchedOn.push('usage.contextTypes');
  }

  const usage = fact.usage;

  if (usage?.sectionIds?.length) {
    if (!context.sectionId || !usage.sectionIds.includes(context.sectionId)) {
      return null;
    }
    score += 20;
    matchedOn.push('sectionId');
  }

  if (usage?.sectionTypes?.length) {
    if (!context.sectionType || !usage.sectionTypes.includes(context.sectionType)) {
      return null;
    }
    score += 20;
    matchedOn.push('sectionType');
  }

  if (usage?.contextTypes?.length) {
    if (!matchesUsageContextTypes(context.contextType, usage.contextTypes)) {
      return null;
    }
    score += 10;
    matchedOn.push('usage.contextTypes');
  }

  if (usage?.applicantSexes?.length) {
    if (!context.applicantSex || !usage.applicantSexes.includes(context.applicantSex)) {
      return null;
    }
    score += 10;
    matchedOn.push('usage.applicantSexes');
  }

  if (usage?.requiresSightingSystem && !context.sightingSystem) {
    return null;
  }

  const requiresStrictFirearmTypeMatch =
    (context.sectionId === 'S10' || context.sectionId === 'S11' || context.sectionId === 'S12') &&
    Boolean(context.firearmType);
  if (
    requiresStrictFirearmTypeMatch &&
    fact.firearmType &&
    !firearmTypesMatch(context.firearmType, fact.firearmType)
  ) {
    return null;
  }

  const normalizedUseContext = normalizeContextToUseContext(context.contextType);
  const equivalentUseContexts: CalibreUseContext[] =
    context.contextType === 'mixed_hunting_sport'
      ? ['hunting', 'sport_shooting', 'general']
      : normalizedUseContext
        ? [normalizedUseContext]
        : [];
  if (fact.useContexts?.length) {
    if (
      equivalentUseContexts.length &&
      !equivalentUseContexts.some((type) => fact.useContexts?.includes(type)) &&
      !fact.useContexts.includes('general')
    ) {
      return null;
    }
    if (
      equivalentUseContexts.length &&
      equivalentUseContexts.some((type) => fact.useContexts?.includes(type))
    ) {
      score += 8;
      matchedOn.push('useContexts');
    }
  }

  const factRegion = fact.jurisdiction.regionCode as FactRegionCode | undefined;
  if (context.applicantRegionCodes?.length) {
    if (factRegion && context.applicantRegionCodes.includes(factRegion)) {
      score += usage?.locationSensitive ? 25 : 10;
      matchedOn.push('applicantRegionCodes');
    } else if (usage?.locationSensitive) {
      return null;
    }
  }

  if (calibresMatch(context.calibre, fact.calibre)) {
    score += 18;
    matchedOn.push('calibre');
  }

  if (firearmTypesMatch(context.firearmType, fact.firearmType)) {
    score += 16;
    matchedOn.push('firearmType');
  }

  if (
    context.calibre &&
    context.firearmType &&
    calibresMatch(context.calibre, fact.calibre) &&
    firearmTypesMatch(context.firearmType, fact.firearmType)
  ) {
    score += 14;
    matchedOn.push('technicalCombination');
  }

  if (fact.sightingSystem) {
    if (!context.sightingSystem || context.sightingSystem !== fact.sightingSystem) {
      return null;
    }
    score += 12;
    matchedOn.push('sightingSystem');
  } else if (usage?.requiresSightingSystem && context.sightingSystem) {
    score += 10;
    matchedOn.push('usage.requiresSightingSystem');
  }

  if (context.tags?.length && fact.tags?.length) {
    const overlappingTags = context.tags.filter((tag) => fact.tags?.includes(tag));
    if (overlappingTags.length) {
      score += overlappingTags.length * 2;
      matchedOn.push('tags');
    }
  }

  score += usage?.priority ?? 0;

  return { fact, score, matchedOn };
}

function isTechnicalSection(context: FactSelectorContext): boolean {
  return context.sectionId === 'S10' || context.sectionId === 'S12';
}

function hasTechnicalAnchor(selected: SelectedFact): boolean {
  const wording = (selected.fact.wording ?? '').toLowerCase();
  if (wording.includes('${firearmcalibre}')) {
    return true;
  }

  const factTags = selected.fact.tags ?? [];
  const hasDisciplineTag = factTags.some((tag) =>
    [
      'general_range_practice',
      'club_competition',
      'precision_rimfire',
      'practical_rifle',
      'steel_challenge',
    ].includes(tag)
  );
  return (
    selected.matchedOn.includes('technicalCombination') ||
    selected.matchedOn.includes('calibre') ||
    selected.matchedOn.includes('firearmType') ||
    selected.matchedOn.includes('sightingSystem') ||
    selected.matchedOn.includes('usage.requiresSightingSystem') ||
    (selected.matchedOn.includes('tags') && hasDisciplineTag)
  );
}

function meetsMinimumConfidence(selected: SelectedFact, context: FactSelectorContext): boolean {
  if (isFirearmDescriptionFact(selected.fact)) {
    return true;
  }

  const minimumScore = context.sectionId === 'S9' ? 55 : 60;

  if (selected.score < minimumScore) {
    return false;
  }

  if (isTechnicalSection(context)) {
    if ((context.calibre || context.firearmType) && !hasTechnicalAnchor(selected)) {
      return false;
    }
  }

  return true;
}

function dedupeById(facts: FactRecord[]): FactRecord[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

function dedupeByText(facts: FactRecord[]): FactRecord[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = (fact.wording ?? fact.summary).trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applySelfDefenceS9Preference(
  facts: FactRecord[],
  context: FactSelectorContext,
): FactRecord[] {
  if (context.sectionType !== 's13' || context.sectionId !== 'S9') {
    return facts;
  }

  const provinceFacts = facts.filter(
    (fact) => fact.contextType === 'self_defence' && fact.jurisdiction.type === 'province',
  );
  const nationalFacts = facts.filter(
    (fact) => fact.contextType === 'self_defence' && fact.jurisdiction.type === 'national',
  );
  const otherFacts = facts.filter(
    (fact) => fact.jurisdiction.type !== 'province' && fact.jurisdiction.type !== 'national',
  );

  if (context.applicantRegionCodes?.length && provinceFacts.length > 0) {
    return [...provinceFacts, ...otherFacts];
  }

  return [...nationalFacts, ...otherFacts];
}

function prioritiseSectionScopedFacts(
  facts: FactRecord[],
  context: FactSelectorContext,
): FactRecord[] {
  if (!context.sectionId && !context.sectionType) {
    return facts;
  }

  const stronglyScoped = facts.filter((fact) => {
    const usage = fact.usage;
    return Boolean(
      (context.sectionId && usage?.sectionIds?.includes(context.sectionId)) ||
        (context.sectionType && usage?.sectionTypes?.includes(context.sectionType)),
    );
  });

  const looselyScoped = facts.filter((fact) => !stronglyScoped.includes(fact));
  return [...stronglyScoped, ...looselyScoped];
}

function prioritiseTechnicalFitFacts(
  facts: FactRecord[],
  context: FactSelectorContext,
): FactRecord[] {
  if (!context.sectionId) {
    return facts;
  }

  if (context.sectionId === 'S10') {
    const firearmTypeMatched = facts.filter(
      (fact) => firearmTypesMatch(context.firearmType, fact.firearmType),
    );
    const calibreOnlyMatched = facts.filter(
      (fact) =>
        calibresMatch(context.calibre, fact.calibre) &&
        !firearmTypesMatch(context.firearmType, fact.firearmType),
    );
    const remaining = facts.filter(
      (fact) => !firearmTypeMatched.includes(fact) && !calibreOnlyMatched.includes(fact),
    );
    return [...firearmTypeMatched, ...calibreOnlyMatched, ...remaining];
  }

  if (context.sectionId === 'S12') {
    const calibreMatched = facts.filter(
      (fact) => calibresMatch(context.calibre, fact.calibre),
    );
    const firearmTypeOnlyMatched = facts.filter(
      (fact) =>
        firearmTypesMatch(context.firearmType, fact.firearmType) &&
        !calibresMatch(context.calibre, fact.calibre),
    );
    const remaining = facts.filter(
      (fact) => !calibreMatched.includes(fact) && !firearmTypeOnlyMatched.includes(fact),
    );
    return [...calibreMatched, ...firearmTypeOnlyMatched, ...remaining];
  }

  return facts;
}

function applyPerSectionFactLimit(
  facts: FactRecord[],
  context: FactSelectorContext,
): FactRecord[] {
  const applyLimitKeepingFirearmDescriptionFacts = (
    input: FactRecord[],
    limit: number
  ): FactRecord[] => {
    let nonFirearmDescriptionCount = 0;
    return input.filter((fact) => {
      if (isFirearmDescriptionFact(fact)) {
        return true;
      }
      if (nonFirearmDescriptionCount >= limit) {
        return false;
      }
      nonFirearmDescriptionCount += 1;
      return true;
    });
  };

  if (!context.sectionId) {
    return facts;
  }

  if (context.sectionId === 'S9') {
    return applyLimitKeepingFirearmDescriptionFacts(
      facts,
      context.applicantSex === 'female' ? 2 : 1
    );
  }

  if (context.sectionId === 'S10') {
    return applyLimitKeepingFirearmDescriptionFacts(facts, 1);
  }
  if (context.sectionId === 'S11') {
    if (
      context.contextType === 'sport_shooting' ||
      context.contextType === 'mixed_hunting_sport'
    ) {
      return applyLimitKeepingFirearmDescriptionFacts(
        facts,
        context.sightingSystem ? 8 : 7
      );
    }
    return applyLimitKeepingFirearmDescriptionFacts(facts, 1);
  }
  if (context.sectionId === 'S12') {
    if (
      context.contextType === 'sport_shooting' ||
      context.contextType === 'mixed_hunting_sport'
    ) {
      return applyLimitKeepingFirearmDescriptionFacts(
        facts,
        context.sightingSystem ? 6 : 5
      );
    }
    return applyLimitKeepingFirearmDescriptionFacts(
      facts,
      context.sightingSystem ? 2 : 1
    );
  }

  return facts;
}

export function getFactsForContext(context: {
  sectionId?: string;
  sectionType?: string;
  contextType: FactSelectorContext['contextType'];
  regionCode?: FactRegionCode;
  applicantSex?: FactSelectorContext['applicantSex'];
  calibre?: string;
  sightingSystem?: FactSelectorContext['sightingSystem'];
  firearmType?: string;
  tags?: string[];
}): FactRecord[] {
  const normalizedRegionCode = normalizeRegionCode(context.regionCode);

  const selectorContext: FactSelectorContext = {
    contextType: context.contextType,
    sectionId: context.sectionId,
    sectionType: context.sectionType,
    applicantRegionCodes: normalizedRegionCode ? [normalizedRegionCode] : undefined,
    applicantSex: context.applicantSex,
    calibre: context.calibre,
    sightingSystem: context.sightingSystem,
    firearmType: context.firearmType,
    tags: context.tags,
  };

  const rankedFacts = factBank.facts
    .map((fact) => scoreFact(fact, selectorContext))
    .filter((selected): selected is SelectedFact => Boolean(selected))
    .filter((selected) => meetsMinimumConfidence(selected, selectorContext))
    .sort((a, b) => b.score - a.score)
    .map((selected) => selected.fact);

  const prioritisedFacts = prioritiseSectionScopedFacts(rankedFacts, selectorContext);
  const technicalFitFacts = prioritiseTechnicalFitFacts(prioritisedFacts, selectorContext);
  const sectionPreferredFacts = applySelfDefenceS9Preference(technicalFitFacts, selectorContext);
  const uniqueFacts = dedupeByText(dedupeById(sectionPreferredFacts));

  return applyPerSectionFactLimit(uniqueFacts, selectorContext);
}
