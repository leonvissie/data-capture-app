

import type {
  MotivationApplicationType,
  MotivationOverlayKey,
  MotivationPurposeType,
  MotivationSectionId,
  MotivationSectionType,
  MotivationSentenceBank,
  SectionSentenceBank,
  SentenceCondition,
  SentenceTemplate,
} from './sentenceBank.types';

export interface TemplateSelectorContext {
  applicationType: MotivationApplicationType;
  sectionType: MotivationSectionType;
  purposeType: MotivationPurposeType;
  values: Record<string, unknown>;
  evidenceKeys?: string[];
  overlays?: MotivationOverlayKey[];
}

export interface SelectedSectionTemplates {
  sectionId: MotivationSectionId;
  templates: SentenceTemplate[];
}

const TEMPLATE_KIND_LIMITS: Record<SentenceTemplate['kind'], number> = {
  sectionIntro: 1,
  coreClaim: 2,
  supportingClaim: 2,
  comparison: 1,
  evidenceLink: 1,
  transition: 1,
  conclusion: 2,
  annexureLeadIn: 1,
};

const TEMPLATE_KIND_ORDER: Record<SentenceTemplate['kind'], number> = {
  sectionIntro: 1,
  coreClaim: 2,
  supportingClaim: 3,
  comparison: 4,
  evidenceLink: 5,
  transition: 6,
  conclusion: 7,
  annexureLeadIn: 8,
};

const TEMPLATE_STRENGTH_ORDER: Record<SentenceTemplate['strength'], number> = {
  standard: 1,
  strong: 2,
  veryStrong: 3,
};

type TemplateSource = 'shared' | 'overlay' | 'specific';

function evaluateCondition(
  condition: SentenceCondition,
  values: Record<string, unknown>
): boolean {
  const actual = values[condition.field];
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) ? expected.includes(actual as string) : false;
    case 'notIn':
      return Array.isArray(expected) ? !expected.includes(actual as string) : true;
    case 'includes':
      return Array.isArray(actual) ? actual.includes(expected) : false;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'notExists':
      return actual === undefined || actual === null;
    case 'truthy':
      return Boolean(actual);
    case 'falsy':
      return !actual;
    default:
      return true;
  }
}

function matchesConditions(
  template: SentenceTemplate,
  values: Record<string, unknown>
): boolean {
  if (!template.conditions?.length) return true;
  return template.conditions.every((condition) =>
    evaluateCondition(condition, values)
  );
}

function matchesEvidence(
  template: SentenceTemplate,
  evidenceKeys: string[]
): boolean {
  if (!template.evidence?.length) return true;

  for (const rule of template.evidence) {
    const present = evidenceKeys.includes(rule.key);
    if (rule.required && !present) return false;
  }

  return true;
}

function matchesSectionType(
  template: SentenceTemplate,
  sectionType: MotivationSectionType
): boolean {
  const tags = template.tags ?? [];
  const sectionTags: MotivationSectionType[] = ['s13', 's15', 's16'];
  const taggedSectionTypes = sectionTags.filter((tag) => tags.includes(tag));

  if (!taggedSectionTypes.length) return true;
  return taggedSectionTypes.includes(sectionType);
}

function matchesApplicationType(
  template: SentenceTemplate,
  applicationType: MotivationApplicationType
): boolean {
  const tags = template.tags ?? [];
  const applicationTags: MotivationApplicationType[] = ['new', 'renewal'];
  const taggedApplicationTypes = applicationTags.filter((tag) =>
    tags.includes(tag)
  );

  if (!taggedApplicationTypes.length) return true;
  return taggedApplicationTypes.includes(applicationType);
}

function matchesPurposeType(
  template: SentenceTemplate,
  purposeType: MotivationPurposeType
): boolean {
  const purposeTagMap: Record<MotivationPurposeType, string[]> = {
    self_defence: ['selfDefence', 'self-defence'],
    hunting: ['hunting'],
    sport_shooting: ['sportShooting', 'sport shooting', 'sport'],
    mixed_hunting_sport: ['mixedHuntingSport', 'mixed', 'hunting', 'sport'],
  };

  const tags = template.tags ?? [];
  const allPurposeTags = Object.values(purposeTagMap).flat();
  const taggedPurposeValues = tags.filter((tag) => allPurposeTags.includes(tag));

  if (!taggedPurposeValues.length) return true;

  return purposeTagMap[purposeType].some((tag) => taggedPurposeValues.includes(tag));
}

function getTemplateSource(template: SentenceTemplate): TemplateSource {
  const tags = template.tags ?? [];
  if (tags.includes('overlay')) return 'overlay';
  if (tags.includes('shared')) return 'shared';
  return 'specific';
}

function getTemplateSourceRank(template: SentenceTemplate): number {
  switch (getTemplateSource(template)) {
    case 'specific':
      return 3;
    case 'overlay':
      return 2;
    case 'shared':
    default:
      return 1;
  }
}

function sortTemplates(templates: SentenceTemplate[]): SentenceTemplate[] {
  return [...templates].sort((a, b) => {
    const kindDelta =
      TEMPLATE_KIND_ORDER[a.kind] - TEMPLATE_KIND_ORDER[b.kind];
    if (kindDelta !== 0) return kindDelta;

    const sourceDelta = getTemplateSourceRank(b) - getTemplateSourceRank(a);
    if (sourceDelta !== 0) return sourceDelta;

    const strengthDelta =
      TEMPLATE_STRENGTH_ORDER[b.strength] - TEMPLATE_STRENGTH_ORDER[a.strength];
    if (strengthDelta !== 0) return strengthDelta;

    return a.id.localeCompare(b.id);
  });
}

function applyKindLimits(templates: SentenceTemplate[]): SentenceTemplate[] {
  const sorted = sortTemplates(templates);
  const selected: SentenceTemplate[] = [];
  const counts: Partial<Record<SentenceTemplate['kind'], number>> = {};

  for (const template of sorted) {
    const current = counts[template.kind] ?? 0;
    const max =
      template.sectionId === 'S5' && template.kind === 'evidenceLink'
        ? 3
        : template.sectionId === 'S2' && template.kind === 'supportingClaim'
          ? 5
        : template.sectionId === 'S9' && template.kind === 'supportingClaim'
          ? 5
        : TEMPLATE_KIND_LIMITS[template.kind];
    if (current >= max) continue;

    selected.push(template);
    counts[template.kind] = current + 1;
  }

  return selected;
}

function selectTemplatesFromSection(
  section: SectionSentenceBank,
  context: TemplateSelectorContext
): SentenceTemplate[] {
  const evidenceKeys = context.evidenceKeys ?? [];

  return section.templates.filter(
    (template) =>
      matchesConditions(template, context.values) &&
      matchesEvidence(template, evidenceKeys) &&
      matchesSectionType(template, context.sectionType) &&
      matchesApplicationType(template, context.applicationType) &&
      matchesPurposeType(template, context.purposeType)
  );
}

export function selectSectionTemplates(
  bank: MotivationSentenceBank,
  sectionId: MotivationSectionId,
  context: TemplateSelectorContext
): SentenceTemplate[] {
  const section = bank.sections.find((entry) => entry.sectionId === sectionId);
  if (!section) return [];

  const selected = selectTemplatesFromSection(section, context);

  const overlayTemplates = (bank.overlays ?? [])
    .filter((overlay) => (context.overlays ?? []).includes(overlay.overlay))
    .flatMap((overlay) => overlay.templates)
    .filter(
      (template) =>
        template.sectionId === sectionId &&
        matchesConditions(template, context.values) &&
        matchesEvidence(template, context.evidenceKeys ?? []) &&
        matchesSectionType(template, context.sectionType) &&
        matchesApplicationType(template, context.applicationType) &&
        matchesPurposeType(template, context.purposeType)
    );

  return applyKindLimits([...selected, ...overlayTemplates]);
}

export function selectAllTemplates(
  bank: MotivationSentenceBank,
  context: TemplateSelectorContext
): SelectedSectionTemplates[] {
  return bank.sections
    .map((section) => ({
      sectionId: section.sectionId,
      templates: sortTemplates(
        selectSectionTemplates(bank, section.sectionId, context)
      ),
    }))
    .filter((entry) => entry.templates.length > 0);
}

export function inferDefaultOverlays(
  context: Pick<
    TemplateSelectorContext,
    'applicationType' | 'purposeType'
  >
): MotivationOverlayKey[] {
  const overlays: MotivationOverlayKey[] = ['base'];

  if (context.applicationType === 'renewal') {
    overlays.push('renewal');
  }

  switch (context.purposeType) {
    case 'self_defence':
      overlays.push('selfDefence');
      break;
    case 'hunting':
      overlays.push('hunting');
      break;
    case 'sport_shooting':
      overlays.push('sportShooting');
      break;
    case 'mixed_hunting_sport':
      overlays.push('mixedHuntingSport');
      break;
  }

  return overlays;
}
