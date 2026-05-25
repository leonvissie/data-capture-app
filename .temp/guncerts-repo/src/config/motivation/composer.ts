import { SENTENCE_BANK } from './sentenceBank';
import { resolveCalibreCatalogRecord } from './factBank';
import { getFactsForContext } from './factBank.selector';
import type { ResolvedEvidence } from './evidenceResolver';
import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionId,
  MotivationSectionType,
  SentenceTemplate,
} from './sentenceBank.types';
import {
  inferDefaultOverlays,
  selectSectionTemplates,
  type TemplateSelectorContext,
} from './templateSelector';
import { deriveMotivationEvidenceKeys } from './signalResolver';
import { resolveTemplateVariables } from './variableResolver';
import { resolveFirearmCapabilityProfileValues } from './firearmCapabilityProfiles';
import { resolveStructuredMotivationValues } from './structuredValueResolver';
import { resolveApplicantSex } from '../../utils/saIdentity';
import { compareAnnexureReferences } from '../../utils/annexureOrder';
import {
  getMembershipDocumentLabel,
  getMembershipDocumentSortRank,
} from '../../utils/membershipDocumentLabels';
import { competencyCategoryListLabel } from '../../utils/categoryLabel';
import { categoryLabel } from '../../utils/categoryLabel';
import { buildAnnexureOverviewLines } from '../../utils/annexureBuilder';
import { getById, listByType } from '../../data/sqlite';
import type {
  Application,
  ActivityEvidence,
  CompetencyCategory,
  CompetencyCertificate,
  Document,
  Firearm,
  Membership,
  MotivationSightingSystem,
  Proficiency,
  Safe,
} from '../../data/types';

export interface ComposeMotivationContext {
  application?: Application | null;
  applicationType: MotivationApplicationType;
  sectionType: MotivationSectionType;
  purposeType: MotivationPurposeType;
  values: Record<string, unknown>;
  evidenceKeys?: string[];
  resolvedEvidence?: ResolvedEvidence;
  sectionOrder?: MotivationSectionId[];
}

export interface ComposedSection {
  sectionId: MotivationSectionId;
  title?: string;
  paragraphs: string[];
  templates: SentenceTemplate[];
}

export interface ComposedMotivation {
  sections: ComposedSection[];
  text: string;
}

interface RenderedSentence {
  text: string;
  template?: SentenceTemplate;
  kind: SentenceTemplate['kind'];
}

type SentenceKind = SentenceTemplate['kind'];

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'under',
  'which',
  'with',
]);

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

const DEFAULT_SECTION_ORDER: MotivationSectionId[] = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15',
  'S16',
];

const SECTION_TITLES: Partial<Record<MotivationSectionId, string>> = {
  S1: 'Title and Summary',
  S2: 'Applicant Identity',
  S3: 'Synopsis of Purpose',
  S4: 'Experience and Background',
  S5: 'Training and Proficiency',
  S6: 'Competency',
  S7: 'Membership and Status',
  S8: 'Existing Firearms',
  S9: 'Need and Justification',
  S10: 'Suitability and Fit',
  S11: 'Activity and Use Detail',
  S12: 'Firearm and Calibre Context',
  S13: 'Safe Storage',
  S14: 'Legal Framing',
  S15: 'Conclusion and Request',
  S16: 'Annexures',
};
const MERGED_FIREARM_USAGE_SECTION_TITLE = 'Firearm context and Usage detail';

const SECTION_ANNEXURE_EVIDENCE_KEYS: Partial<
  Record<MotivationSectionId, string[]>
> = {
  S8: ['existing_licence_copy'],
  S13: ['safe_photos'],
};

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveProvinceValueFromContext(
  context: ComposeMotivationContext,
  composedValues?: Record<string, unknown>
): string {
  const direct = `${context.values?.province ?? ''}`.trim();
  if (direct) return direct;

  const composedProvince = `${composedValues?.province ?? ''}`.trim();
  if (composedProvince) return composedProvince;

  const residenceProvince = `${context.values?.residenceProvince ?? ''}`.trim();
  if (residenceProvince) return residenceProvince;

  const profile = context.values?.motivationProfile as
    | { applicantContext?: { residenceProvince?: string } }
    | undefined;
  return `${profile?.applicantContext?.residenceProvince ?? ''}`.trim();
}

function normaliseWhitespacePreservingLineBreaks(value: string): string {
  const normalizedNewlines = value.replace(/\r\n?/g, '\n');
  const normalizedLines = normalizedNewlines
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());
  return normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function dedupeRenderedSentences(sentences: RenderedSentence[]): RenderedSentence[] {
  const seen = new Set<string>();
  const result: RenderedSentence[] = [];

  for (const sentence of sentences) {
    const key = normaliseWhitespacePreservingLineBreaks(sentence.text).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(sentence);
  }

  return result;
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    const key = normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(paragraph);
  }

  return result;
}

function toRegExpSafe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveFirearmDescription(values: Record<string, unknown>): string {
  const direct =
    typeof values.firearmDescription === 'string'
      ? normaliseWhitespace(values.firearmDescription)
      : '';
  if (direct && !direct.includes('${')) return direct;

  const resolved = normaliseWhitespace(
    resolveTemplateVariables('${firearmDescription}', { values })
  );
  if (resolved && !resolved.includes('${')) return resolved;

  return '';
}

function resolveFirearmShortDescription(values: Record<string, unknown>): string {
  const make = `${values.firearmMake ?? values.make ?? ''}`.trim();
  const model = `${values.firearmModel ?? values.model ?? ''}`.trim();
  const serial = `${values.firearmSerialNumber ?? values.serialNumber ?? ''}`.trim();
  const makeModel = [make, model].filter(Boolean).join(' ').trim();
  if (makeModel && serial) return `${makeModel} (${serial})`;
  if (makeModel) return makeModel;
  if (serial) return serial;
  return 'the firearm applied for';
}

function stripFirearmDescriptionFromParagraph(
  paragraph: string,
  firearmDescription: string
): string {
  let text = normaliseWhitespace(paragraph);
  if (!text || !firearmDescription) return text;

  const escaped = toRegExpSafe(firearmDescription);
  text = text.replace(new RegExp(`selected\\s+on\\s+the\\s+${escaped}`, 'gi'), '');
  text = text.replace(new RegExp(`the\\s+${escaped}`, 'gi'), 'the selected firearm');
  text = text.replace(new RegExp(escaped, 'gi'), 'the selected firearm');
  text = text.replace(/\s+,/g, ',');
  text = text.replace(/,\s*,/g, ',');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/\s+\./g, '.');
  text = normaliseWhitespace(text);
  return text;
}

function groupFirearmDescriptionSubitems(
  sectionId: MotivationSectionId,
  paragraphs: string[],
  values: Record<string, unknown>
): string[] {
  if (sectionId !== 'S10' && sectionId !== 'S11' && sectionId !== 'S12') {
    return paragraphs;
  }

  const firstSubitemIndex = paragraphs.findIndex((paragraph) =>
    paragraph.startsWith(FIREARM_DESCRIPTION_SUBITEM_MARKER)
  );
  if (firstSubitemIndex < 0) return paragraphs;

  const firearmDescription = resolveFirearmDescription(values);
  const heading = firearmDescription
    ? `For the ${firearmDescription}:`
    : 'For the selected firearm:';

  const subItems = paragraphs
    .filter((paragraph) => paragraph.startsWith(FIREARM_DESCRIPTION_SUBITEM_MARKER))
    .map((paragraph) => paragraph.slice(FIREARM_DESCRIPTION_SUBITEM_MARKER.length).trim())
    .map((paragraph) => stripFirearmDescriptionFromParagraph(paragraph, firearmDescription))
    .filter(Boolean);
  if (!subItems.length) {
    return paragraphs.filter(
      (paragraph) => !paragraph.startsWith(FIREARM_DESCRIPTION_SUBITEM_MARKER)
    );
  }

  const grouped = [heading, ...subItems.map((item) => `${FIREARM_DESCRIPTION_SUBITEM_MARKER}${item}`)].join('\n');
  const remaining = paragraphs.filter(
    (paragraph) => !paragraph.startsWith(FIREARM_DESCRIPTION_SUBITEM_MARKER)
  );
  const insertIndex = paragraphs
    .slice(0, firstSubitemIndex)
    .filter((paragraph) => !paragraph.startsWith(FIREARM_DESCRIPTION_SUBITEM_MARKER)).length;

  return [
    ...remaining.slice(0, insertIndex),
    grouped,
    ...remaining.slice(insertIndex),
  ];
}

function getLeadingContentTokens(value: string, limit = 4): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .slice(0, limit);
}

function hasSharedLeadPhrase(left: string, right: string): boolean {
  const leftTokens = getLeadingContentTokens(left);
  const rightTokens = getLeadingContentTokens(right);

  if (leftTokens.length < 3 || rightTokens.length < 3) return false;

  return leftTokens.slice(0, 3).join(' ') === rightTokens.slice(0, 3).join(' ');
}

function getSectionSentenceDuplicationThreshold(
  sectionId: MotivationSectionId,
  kind: SentenceKind
): number | null {
  if (kind === 'evidenceLink' || kind === 'sectionIntro' || kind === 'conclusion') {
    return null;
  }

  if (kind === 'comparison') {
    return 0.68;
  }

  if (kind !== 'supportingClaim') {
    return 0.7;
  }

  switch (sectionId) {
    case 'S4':
      return 0.72;
    case 'S7':
      return 0.38;
    case 'S9':
      return 0.4;
    case 'S11':
      return 0.88;
    case 'S10':
    case 'S12':
    case 'S13':
      return 0.42;
    default:
      return 0.55;
  }
}

function pruneSectionSentenceDuplication(
  sectionId: MotivationSectionId,
  sentences: RenderedSentence[]
): RenderedSentence[] {
  const result: RenderedSentence[] = [];

  for (const sentence of sentences) {
    if (sentence.text.startsWith(FIREARM_DESCRIPTION_SUBITEM_MARKER)) {
      result.push(sentence);
      continue;
    }

    const lower = sentence.text.toLowerCase();
    if (
      sectionId === 'S9' &&
      (
        lower.includes('for a female applicant') ||
        lower.includes('saps police recorded crime statistics') ||
        lower.includes('contact crimes')
      )
    ) {
      result.push(sentence);
      continue;
    }

    const threshold = getSectionSentenceDuplicationThreshold(sectionId, sentence.kind);

    if (threshold == null) {
      result.push(sentence);
      continue;
    }

    const isDuplicate = result.some((previous) => {
      if (previous.kind === 'evidenceLink') return false;

      return (
        similarityScore(previous.text, sentence.text) >= threshold ||
        hasSharedLeadPhrase(previous.text, sentence.text)
      );
    });

    if (!isDuplicate) {
      result.push(sentence);
    }
  }

  return result;
}

function pruneS3SharedOverlap(sentences: RenderedSentence[]): RenderedSentence[] {
  const hasSpecificCore = sentences.some((sentence) => {
    if (sentence.kind !== 'coreClaim') return false;
    const tags = sentence.template?.tags ?? [];
    return !tags.includes('shared');
  });
  const hasSpecificSupporting = sentences.some((sentence) => {
    if (sentence.kind !== 'supportingClaim') return false;
    const tags = sentence.template?.tags ?? [];
    return !tags.includes('shared');
  });

  return sentences.filter((sentence) => {
    const tags = sentence.template?.tags ?? [];
    const isShared = tags.includes('shared');
    if (!isShared) return true;
    if (hasSpecificCore && sentence.kind === 'coreClaim') return false;
    if (hasSpecificSupporting && sentence.kind === 'supportingClaim') return false;
    return true;
  });
}

function getFactParagraphs(
  sectionId: MotivationSectionId,
  context: ComposeMotivationContext,
  maxFacts = 1
): Array<{ text: string; usesFirearmDescription: boolean }> {
  const normalizeFactFirearmType = (value: unknown): string | undefined => {
    const normalized = `${value ?? ''}`
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
    if (!normalized) return undefined;
    if (normalized.includes('handgun')) return 'handgun';
    if (normalized.includes('shotgun')) return 'shotgun';
    if (normalized.includes('rifle')) return 'rifle';
    return normalized;
  };

  const normalizeFactSightingSystem = (
    value: unknown
  ): MotivationSightingSystem | undefined => {
    const normalized = `${value ?? ''}`.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'iron_sights' || normalized === 'ironsights' || normalized === 'iron sights') {
      return 'iron_sights';
    }
    if (normalized === 'red_dot' || normalized === 'reddot' || normalized === 'red dot') {
      return 'red_dot';
    }
    if (normalized === 'scope') return 'scope';
    if (normalized === 'mixed') return 'mixed';
    return undefined;
  };

  const inferFactFirearmType = (
    values: Record<string, unknown>
  ): string | undefined => {
    const direct = normalizeFactFirearmType(values.firearmType);
    if (direct) return direct;

    const fromLabel = normalizeFactFirearmType(values.firearmTypeLabel);
    if (fromLabel) return fromLabel;

    const fromDescription = normalizeFactFirearmType(values.firearmDescription);
    if (fromDescription) return fromDescription;

    return undefined;
  };

  const composedValues = getComposedValues(context);
  const province = resolveProvinceValueFromContext(context, composedValues);
  const factSelectorTags = collectFactSelectorTags(composedValues);
  const inferredFirearmType =
    inferFactFirearmType(context.values) ?? inferFactFirearmType(composedValues);

  const facts = getFactsForContext({
    sectionId,
    sectionType: context.sectionType,
    contextType: context.purposeType,
    regionCode: province || undefined,
    applicantSex:
      composedValues.applicantSex === 'female' || composedValues.applicantSex === 'male'
        ? (composedValues.applicantSex as 'female' | 'male')
        : 'unknown',
    calibre: (context.values?.firearmCalibre as string) || (context.values?.calibre as string) || undefined,
    sightingSystem: normalizeFactSightingSystem(
      composedValues.sightingSystem ?? context.values?.sightingSystem
    ),
    firearmType: inferredFirearmType,
    tags: factSelectorTags,
  });

  const mappedFacts = facts
    .map((fact) => {
      const wording = `${fact.wording ?? ''}`;
      return {
        text: normaliseWhitespace(
          resolveTemplateVariables(wording, {
            values: composedValues,
          })
        ),
        usesFirearmDescription:
          FIREARM_DESCRIPTION_FACT_IDS.has(fact.id) ||
          wording.includes('${firearmDescription}'),
      };
    })
    .filter((item) => Boolean(item.text));

  const firearmDescriptionFacts = mappedFacts.filter(
    (item) => item.usesFirearmDescription
  );
  const nonFirearmDescriptionFacts = mappedFacts.filter(
    (item) => !item.usesFirearmDescription
  );
  const cappedNonFirearmDescriptionFacts =
    maxFacts > 0
      ? nonFirearmDescriptionFacts.slice(0, maxFacts)
      : nonFirearmDescriptionFacts;

  return [...firearmDescriptionFacts, ...cappedNonFirearmDescriptionFacts];
}

function collectFactSelectorTags(values: Record<string, unknown>): string[] {
  const profile = values.motivationProfile as
    | {
        needProfile?: { reasonTags?: string[] };
        huntingProfile?: {
          terrainTags?: string[];
          species?: string[];
          distanceBand?: string;
        };
        sportProfile?: { disciplineTags?: string[] };
        firearmFitProfile?: { attributeTags?: string[]; sightingSystem?: string };
      }
    | undefined;

  const tags = new Set<string>();
  const append = (input?: unknown) => {
    if (!Array.isArray(input)) return;
    input.forEach((item) => {
      const value = `${item ?? ''}`.trim();
      if (value) tags.add(value);
    });
  };

  append(profile?.needProfile?.reasonTags);
  append(profile?.huntingProfile?.terrainTags);
  append(profile?.huntingProfile?.species);
  append(profile?.sportProfile?.disciplineTags);
  append(profile?.firearmFitProfile?.attributeTags);

  const distanceBand = `${profile?.huntingProfile?.distanceBand ?? ''}`.trim();
  if (distanceBand) tags.add(distanceBand);
  const sightingSystem = `${profile?.firearmFitProfile?.sightingSystem ?? ''}`.trim();
  if (sightingSystem) tags.add(sightingSystem);

  return Array.from(tags);
}

function getFactSentenceKind(
  sectionId: MotivationSectionId
): SentenceTemplate['kind'] {
  switch (sectionId) {
    case 'S9':
    case 'S10':
    case 'S11':
    case 'S12':
      return 'supportingClaim';
    default:
      return 'supportingClaim';
  }
}

function shouldSuppressOverlappingFactParagraph(
  sectionId: MotivationSectionId,
  context: ComposeMotivationContext,
  values: Record<string, unknown>,
  paragraph: string
): boolean {
  if (sectionId !== 'S10' || context.purposeType !== 'sport_shooting') {
    return false;
  }

  const capabilitySummary =
    typeof values.capabilitySummary === 'string' ? normaliseWhitespace(values.capabilitySummary) : '';
  if (!capabilitySummary) return false;

  const normalizedParagraph = normaliseWhitespace(paragraph).toLowerCase();
  if (
    normalizedParagraph.includes('widely used in sport shooting because') &&
    normalizedParagraph.includes('configuration')
  ) {
    return true;
  }

  return false;
}

function buildSelectorContext(
  context: ComposeMotivationContext
): TemplateSelectorContext {
  const resolvedEvidenceKeys = deriveMotivationEvidenceKeys({
    values: context.values,
    evidenceKeys: [
      ...(context.evidenceKeys ?? []),
      ...((context.resolvedEvidence?.evidenceKeys ?? []).filter(Boolean)),
    ],
  });
  if (
    hasRelevantFirearmEndorsement(context) &&
    !resolvedEvidenceKeys.includes('firearm_endorsement')
  ) {
    resolvedEvidenceKeys.push('firearm_endorsement');
  }

  return {
    applicationType: context.applicationType,
    sectionType: context.sectionType,
    purposeType: context.purposeType,
    values: getComposedValues(context),
    evidenceKeys: resolvedEvidenceKeys,
    overlays: inferDefaultOverlays({
      applicationType: context.applicationType,
      purposeType: context.purposeType,
    }),
  };
}

function getComposedValues(
  context: ComposeMotivationContext
): Record<string, unknown> {
  const structuredValues = resolveStructuredMotivationValues({
    applicationType: context.applicationType,
    sectionType: context.sectionType,
    purposeType: context.purposeType,
    values: context.values,
  });
  const mergedValues = {
    ...context.values,
    ...structuredValues,
  };
  const trainingEvidenceValues = resolveTrainingEvidenceValues(context);
  const associationNameSuppressed =
    Array.isArray(context.application?.membershipIds) &&
    context.application.membershipIds.length === 0;

  return {
    ...mergedValues,
    ...trainingEvidenceValues,
    associationName: associationNameSuppressed ? '' : mergedValues.associationName,
    applicantSex: resolveApplicantSex({
      idType: typeof mergedValues.idType === 'string' ? mergedValues.idType : null,
      idNumber: typeof mergedValues.idNumber === 'string' ? mergedValues.idNumber : null,
      applicantSex:
        typeof mergedValues.applicantSex === 'string'
          ? mergedValues.applicantSex
          : null,
    }),
    hasRelevantFirearmEndorsement: hasRelevantFirearmEndorsement(context),
    ...resolveFirearmCapabilityProfileValues({
      purposeType: context.purposeType,
      sectionType: context.sectionType,
      values: mergedValues,
    }),
  };
}

function isMembershipExplicitlyExcluded(context: ComposeMotivationContext): boolean {
  return (
    Array.isArray(context.application?.membershipIds) &&
    context.application.membershipIds.length === 0
  );
}

function renderTemplate(
  template: SentenceTemplate,
  values: Record<string, unknown>
): string {
  const rendered = normaliseWhitespacePreservingLineBreaks(
    resolveTemplateVariables(template.text, {
      values,
    })
  );
  if (
    template.id === 'shared.s5.endorsement.001' ||
    template.id === 'shared.s5.endorsement.002'
  ) {
    console.log('[motivation][endorsement-template]', {
      templateId: template.id,
      templateText: template.text,
      firearmDescription: `${values.firearmDescription ?? ''}`,
      firearmShortDescription: `${values.firearmShortDescription ?? ''}`,
      rendered,
    });
  }
  return rendered;
}

function getParagraphKindGroups(
  sectionId: MotivationSectionId
): SentenceTemplate['kind'][][] {
  switch (sectionId) {
    case 'S1':
      return [['sectionIntro', 'coreClaim', 'supportingClaim']];
    case 'S2':
      return [['sectionIntro', 'coreClaim', 'supportingClaim', 'conclusion']];
    case 'S3':
      return [
        ['sectionIntro', 'coreClaim', 'supportingClaim'],
        ['transition', 'conclusion'],
      ];
    case 'S4':
    case 'S6':
    case 'S7':
    case 'S13':
    case 'S14':
    case 'S15':
      return [['sectionIntro', 'coreClaim', 'supportingClaim', 'conclusion']];
    case 'S5':
      return [
        ['sectionIntro', 'coreClaim', 'supportingClaim', 'conclusion'],
        ['evidenceLink'],
      ];
    case 'S8':
      return [
        ['sectionIntro', 'comparison'],
        ['coreClaim', 'supportingClaim', 'conclusion'],
      ];
    case 'S9':
    case 'S10':
    case 'S11':
    case 'S12':
      return [
        ['sectionIntro', 'coreClaim'],
        ['supportingClaim', 'evidenceLink', 'conclusion'],
      ];
    case 'S16':
      return [['annexureLeadIn', 'evidenceLink', 'conclusion']];
    default:
      return [['sectionIntro', 'coreClaim', 'supportingClaim', 'conclusion']];
  }
}

function buildParagraphFromSentences(sentences: RenderedSentence[]): string | null {
  const parts = sentences
    .map((sentence) => sentence.text.trim())
    .filter(Boolean);

  if (!parts.length) return null;
  return normaliseWhitespacePreservingLineBreaks(parts.join(' '));
}

function getValueAsString(
  values: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = values[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }

  return '';
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFirearmTypeLabel(value: string): string {
  const formatted = categoryLabel(value).trim();
  if (formatted) return formatted;
  return titleCase(value);
}

function buildFrontMatter(
  context: ComposeMotivationContext,
  sections: ComposedSection[]
): string | null {
  const summary = sections.find((section) => section.sectionId === 'S1');
  const summaryOpening = `${summary?.paragraphs[0] ?? ''}`.trim();
  if (!summaryOpening) return null;
  const marker = 'This motivation';
  const markerIndex = summaryOpening.toLowerCase().indexOf(marker.toLowerCase());
  const title =
    markerIndex >= 0
      ? summaryOpening.slice(0, markerIndex).trim().replace(/\s+$/, '')
      : summaryOpening;
  const openingParagraph =
    markerIndex >= 0 ? summaryOpening.slice(markerIndex).trim() : '';

  const applicationLabel =
    context.applicationType === 'renewal'
      ? 'Renewal application'
      : 'New application';
  const sectionLabel = context.sectionType.toUpperCase();
  const purposeLabel = titleCase(context.purposeType);
  const applicantName = getValueAsString(
    context.values,
    'applicantFullName',
    'fullName',
    'fullNames'
  );
  const firearmMake = getValueAsString(context.values, 'firearmMake', 'make');
  const firearmModel = getValueAsString(context.values, 'firearmModel', 'model');
  const firearmType = titleCase(
    getValueAsString(context.values, 'firearmActionLabel', 'firearmAction')
  );
  const firearmKind = formatFirearmTypeLabel(
    getValueAsString(context.values, 'firearmTypeLabel', 'firearmType')
  );
  const firearmName = [firearmMake, firearmModel, firearmType, firearmKind]
    .filter(Boolean)
    .join(' ');
  const firearmCalibre = getValueAsString(
    context.values,
    'firearmCalibre',
    'calibre'
  );
  const firearmSerial = getValueAsString(
    context.values,
    'firearmSerialNumber',
    'serialNumber'
  );

  const detailLines = [
    applicantName && `Applicant: ${applicantName}`,
    `Application: ${applicationLabel} under ${sectionLabel}`,
    `Purpose: ${purposeLabel}`,
    firearmName && `Firearm: ${firearmName}`,
    firearmCalibre && `Calibre: ${firearmCalibre}`,
    firearmSerial && `Serial Number: ${firearmSerial}`,
  ].filter(Boolean);

  return [title, openingParagraph, detailLines.join('\n')]
    .filter(Boolean)
    .join('\n\n');
}

const ANNEXURE_LABELS: Partial<Record<string, string>> = {
  competency_certificate: 'Competency certificate',
  proficiency_certificate: 'Proficiency certificate',
  statement_of_results: 'Statement of Results',
  association_membership: 'Association membership / good standing proof',
  dedicated_status: 'Dedicated status certificate',
  firearm_endorsement: 'Firearm endorsement',
  existing_licence_copy: 'Existing licence copy',
  safe_photos: 'Safe installation / storage photos',
  activity_report: 'Activity reports and supporting activity material',
};

function normalizeAnnexureLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitAnnexureRef(value: string): { base: string; suffix: number | null } {
  const normalized = `${value ?? ''}`.trim().toUpperCase();
  const match = /^([A-Z]+)(\d+)?$/.exec(normalized);
  if (!match) return { base: normalized, suffix: null };
  return {
    base: match[1] ?? normalized,
    suffix: match[2] ? Number(match[2]) : null,
  };
}

function normalizeRequirementLabel(label?: string, fallbackKey?: string): string {
  const trimmed = normalizeAnnexureLabel(`${label ?? ''}`);
  if (trimmed) return trimmed;
  if (fallbackKey) return ANNEXURE_LABELS[fallbackKey] ?? titleCase(fallbackKey);
  return 'Supporting document';
}

function getRequirementDisplayLabel(
  requirement: { code: string; label?: string },
  fallbackEvidenceKey?: string
): string {
  const code = normalizeCode(requirement.code);
  const supportingStatementMatch = /^SUPPORTING_STATEMENT_(\d+)$/.exec(code);
  if (supportingStatementMatch?.[1]) {
    return `Character reference ${supportingStatementMatch[1]}`;
  }
  return normalizeRequirementLabel(requirement.label, fallbackEvidenceKey);
}

type AnnexureOverviewItem = { annexure: string; label: string; key?: string };

const MEMBERSHIP_DOC_CODES = new Set([
  'ASSOCIATION_MEMBERSHIP',
  'ASSOCIATION_LETTER',
  'DEDICATED_HUNTER_CERT',
  'DEDICATED_SPORT_CERT',
  'FIREARM_ENDORSEMENT',
]);
const PROFICIENCY_DOC_CODES = new Set([
  'PROFICIENCY_HANDGUN',
  'PROFICIENCY_RIFLE',
  'PROFICIENCY_SHOTGUN',
  'PROFICIENCY_HANDMACHINECARBINE',
]);
const PROFICIENCY_TYPE_LABELS: Record<string, string> = {
  PROFICIENCY_HANDGUN: 'handgun',
  PROFICIENCY_RIFLE: 'rifle',
  PROFICIENCY_SHOTGUN: 'shotgun',
  PROFICIENCY_HANDMACHINECARBINE: 'hand machine carbine',
};
const PROFICIENCY_TYPE_ORDER = [
  'PROFICIENCY_HANDGUN',
  'PROFICIENCY_RIFLE',
  'PROFICIENCY_SHOTGUN',
  'PROFICIENCY_HANDMACHINECARBINE',
];
const COMPETENCY_CATEGORY_ORDER: CompetencyCategory[] = [
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
];

const S9_PROVINCE_CONTEXT_PARAGRAPHS: Record<string, string> = {
  ec: 'The Eastern Cape continues to present violent-crime risk across urban centres and rural areas, where isolated residences and farm properties may face delayed police response times. Reported robberies and attacks in both town and rural settings reinforce the practical need for effective lawful self-defence measures.',
  fs: 'The Free State combines agricultural districts and smaller towns where residents may be far from immediate assistance. Reported farm-related incidents and violent crime in town environments reinforce the practical need for lawful personal protection.',
  gp: 'As South Africa’s most densely populated province, Gauteng continues to experience high levels of violent and aggravated crime, especially in metropolitan areas. Armed robberies, home invasions, and kidnappings highlight immediate risks faced by residents in both urban and suburban settings.',
  kzn: 'KwaZulu-Natal continues to face significant violent-crime pressures, together with periodic instability in certain areas. The combined impact of urban crime exposure, rural vulnerability, and infrastructure disruption supports the need for reliable lawful personal protection.',
  lp: 'Limpopo’s largely rural geography means many residents live in isolated conditions with limited access to rapid emergency response. Reported farm attacks and violent crime in smaller towns support the need for practical self-defence capability when assistance is not immediately available.',
  mp: 'Mpumalanga’s farming regions and smaller towns face recurring challenges of distance, isolation, and slower policing response times. Continued reports of robberies and violent incidents in both rural and peri-urban areas support the need for practical lawful self-defence measures.',
  nw: 'The North West province continues to report violent crime affecting both towns and agricultural areas. The combination of rural isolation and elevated crime risk creates circumstances in which residents may need to rely on lawful means of personal protection.',
  nc: 'Despite lower population density, the Northern Cape’s vast distances and remote communities can result in extended law-enforcement response times. That geographic reality, together with reported violent incidents, supports the need for practical self-defence capability.',
  wc: 'The Western Cape continues to experience significant violent crime in parts of its urban and peri-urban environment. Ongoing gang-related violence, robberies, and assaults highlight sustained risk exposure for residents across the province.',
};

function normalizeCode(value: unknown): string {
  return `${value ?? ''}`.trim().toUpperCase();
}

function isMeaningfulToken(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && normalized.toUpperCase() !== 'NONE';
}

function readMatchedDocuments(ids: string[]): Document[] {
  return ids
    .map((id) => getById<Document>(String(id)))
    .filter((doc): doc is Document => Boolean(doc));
}

function resolveProficiencyTypeLabels(
  proficiency: Proficiency | null,
  proficiencyId: string,
  docs: Document[]
): string[] {
  const kinds = new Set<string>();
  (proficiency?.proficiencyDocumentIds ?? []).forEach((entry) => {
    const kind = `${entry?.kind ?? ''}`.trim().toUpperCase();
    if (kind) kinds.add(kind);
  });
  docs.forEach((doc) => {
    const parentType = `${doc.parentType ?? ''}`.trim().toUpperCase();
    const parentId = `${doc.parentId ?? ''}`.trim();
    const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
    if (proficiencyId && !((parentType === 'PROFICIENCY' && parentId === proficiencyId) || relatedId === proficiencyId)) {
      return;
    }
    const code = `${doc.requirementCode ?? doc.kind ?? ''}`.trim().toUpperCase();
    if (PROFICIENCY_TYPE_LABELS[code]) {
      kinds.add(code);
    }
  });
  return PROFICIENCY_TYPE_ORDER
    .filter((code) => kinds.has(code))
    .map((code) => PROFICIENCY_TYPE_LABELS[code])
    .filter((value, index, array) => array.indexOf(value) === index);
}

function resolveStatementOfResultsLabels(
  proficiency: Proficiency | null,
  proficiencyId: string,
  docs: Document[],
  requirementCode: string
): string[] {
  const kinds = new Set<string>();
  const categories = new Set<CompetencyCategory>();

  (proficiency?.proficiencyDocumentIds ?? []).forEach((entry) => {
    const kind = `${entry?.kind ?? ''}`.trim().toUpperCase();
    if (kind.startsWith('STATEMENT_OF_RESULTS_')) {
      kinds.add(kind);
    }
    (entry?.categories ?? []).forEach((category) => {
      categories.add(category);
    });
  });

  docs.forEach((doc) => {
    const parentType = `${doc.parentType ?? ''}`.trim().toUpperCase();
    const parentId = `${doc.parentId ?? ''}`.trim();
    const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
    if (proficiencyId && !((parentType === 'PROFICIENCY' && parentId === proficiencyId) || relatedId === proficiencyId)) {
      return;
    }
    const code = `${doc.requirementCode ?? doc.kind ?? ''}`.trim().toUpperCase();
    if (code.startsWith('STATEMENT_OF_RESULTS_')) {
      kinds.add(code);
    }
  });

  if (requirementCode.startsWith('STATEMENT_OF_RESULTS_')) {
    kinds.add(requirementCode);
  }

  const labels: string[] = [];
  if (kinds.has('STATEMENT_OF_RESULTS_KNOWLEDGE')) {
    labels.push('knowledge of the act');
  }

  const categoryLabels = COMPETENCY_CATEGORY_ORDER
    .filter((category) => categories.has(category))
    .map((category) => categoryLabel(category).toLowerCase());
  labels.push(...categoryLabels);

  const hasHandleUse = Array.from(kinds).some((kind) => kind.startsWith('STATEMENT_OF_RESULTS_HANDLE_USE_'));
  if (hasHandleUse && !categoryLabels.length) {
    labels.push('handle and use');
  }

  return labels.filter((value, index, array) => array.indexOf(value) === index);
}

function resolveTrainingEvidenceValues(
  context: ComposeMotivationContext
): {
  proficiencyCategories: string;
  statementOfResultsItems: string;
} {
  const application = context.application;
  if (!application) {
    return { proficiencyCategories: '', statementOfResultsItems: '' };
  }

  const selectedProficiencyIds = Array.isArray(application.proficiencyIds)
    ? application.proficiencyIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  if (!selectedProficiencyIds.length) {
    return { proficiencyCategories: '', statementOfResultsItems: '' };
  }

  const matchedDocIds = new Set<string>();
  (context.resolvedEvidence?.requirements ?? [])
    .filter((requirement) => requirement.satisfied)
    .filter((requirement) => {
      const code = normalizeCode(requirement.code);
      return code.startsWith('PROFICIENCY') || code.startsWith('STATEMENT_OF_RESULTS_');
    })
    .forEach((requirement) => {
      (requirement.matchedDocumentIds ?? []).forEach((id) => {
        const normalized = String(id ?? '').trim();
        if (normalized) matchedDocIds.add(normalized);
      });
    });

  const matchedDocs = readMatchedDocuments(Array.from(matchedDocIds));
  const proficiencyCategories = new Set<string>();
  const sorItems = new Set<string>();

  selectedProficiencyIds.forEach((proficiencyId) => {
    const proficiency = getById<Proficiency>(proficiencyId);
    if (!proficiency) return;

    resolveProficiencyTypeLabels(proficiency, proficiencyId, matchedDocs).forEach((label) => {
      const normalized = label.trim().toLowerCase();
      if (normalized) proficiencyCategories.add(normalized);
    });

    resolveStatementOfResultsLabels(
      proficiency,
      proficiencyId,
      matchedDocs,
      'STATEMENT_OF_RESULTS_'
    ).forEach((label) => {
      const normalized = label.trim().toLowerCase();
      if (normalized) sorItems.add(normalized);
    });
  });

  return {
    proficiencyCategories: Array.from(proficiencyCategories).join(', '),
    statementOfResultsItems: Array.from(sorItems).join(', '),
  };
}

function buildFirearmLabel(firearm: Firearm | null, fallback?: string): string {
  const description = normaliseWhitespace(
    resolveTemplateVariables('${firearmDescription}', {
      values: {
        firearmMake: `${firearm?.make ?? ''}`.trim(),
        firearmModel: `${firearm?.model ?? ''}`.trim(),
        firearmCalibre: `${firearm?.calibre ?? ''}`.trim(),
        firearmSerialNumber: `${firearm?.firearmSerialNumber ?? ''}`.trim(),
        firearmType: `${firearm?.firearmType ?? ''}`.trim(),
        firearmAction: `${firearm?.firearmAction ?? ''}`.trim(),
      },
    })
  );

  if (description && description.toLowerCase() !== 'the firearm applied for') {
    return description;
  }
  if (fallback && isMeaningfulToken(fallback)) return fallback.trim();
  return 'Firearm under renewal';
}

function buildFirearmShortLabel(firearm: Firearm | null, fallback?: string): string {
  const make = `${firearm?.make ?? ''}`.trim();
  const model = `${firearm?.model ?? ''}`.trim();
  const serial = `${firearm?.firearmSerialNumber ?? ''}`.trim();
  const makeModel = [make, model].filter((value) => isMeaningfulToken(value)).join(' ').trim();
  if (makeModel && serial) return `${makeModel} (${serial})`;
  if (makeModel) return makeModel;
  if (serial) return serial;
  if (fallback && isMeaningfulToken(fallback)) return fallback.trim();
  return 'Firearm';
}

function getSelectedFirearmId(context: ComposeMotivationContext): string {
  if (!Array.isArray(context.application?.selectedFirearmIds)) return '';
  const selected = context.application.selectedFirearmIds
    .map((id) => `${id ?? ''}`.trim())
    .filter(Boolean);
  return selected[0] ?? '';
}

function isLinkedToSelectedFirearm(doc: Document, selectedFirearmId: string): boolean {
  if (!selectedFirearmId) return false;
  const parentType = `${doc.parentType ?? ''}`.trim().toUpperCase();
  const parentId = `${doc.parentId ?? ''}`.trim();
  const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
  if (relatedId && relatedId === selectedFirearmId) return true;
  return parentType === 'FIREARM' && parentId === selectedFirearmId;
}

function collectRelevantEndorsementAnnexureLabels(
  context: ComposeMotivationContext
): string[] {
  const selectedFirearmId = getSelectedFirearmId(context);
  if (!selectedFirearmId) return [];

  const requirement = (context.resolvedEvidence?.requirements ?? []).find(
    (entry) =>
      normalizeCode(entry.code) === 'FIREARM_ENDORSEMENT' &&
      !!entry.annexure
  );
  if (!requirement) return [];

  const matchedDocumentIds = (requirement.matchedDocumentIds ?? []).filter((id) => {
    const doc = getById<Document>(String(id));
    if (!doc) return false;
    const docCode = normalizeCode(doc.requirementCode ?? doc.kind);
    if (docCode !== 'FIREARM_ENDORSEMENT') return false;
    return isLinkedToSelectedFirearm(doc, selectedFirearmId);
  });
  if (!matchedDocumentIds.length) return [];

  const items = buildEntityLevelAnnexureItemsForRequirement(
    {
      code: requirement.code,
      label: requirement.label,
      annexure: requirement.annexure,
      evidenceKeys: requirement.evidenceKeys,
      matchedDocumentIds,
    },
    'firearm_endorsement'
  );
  const seen = new Set<string>();
  const primaryLabels = items
    .filter((item) => item.annexure && item.label)
    .sort((left, right) => compareAnnexureReferences(left.annexure, right.annexure))
    .filter((item) => {
      const key = `${item.annexure.toUpperCase()}::${item.label.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => `Annexure ${item.annexure}: ${item.label}`);
  return primaryLabels;
}

function hasRelevantFirearmEndorsement(context: ComposeMotivationContext): boolean {
  return collectRelevantEndorsementAnnexureLabels(context).length > 0;
}

function hasSelectedComparisonFirearms(context: ComposeMotivationContext): boolean {
  const profile = (context.values?.motivationProfile ?? null) as
    | {
        existingComparison?: {
          comparisonEntries?: Array<{
            firearmId?: string;
            label?: string;
          }>;
        };
      }
    | null;
  const entries = profile?.existingComparison?.comparisonEntries;
  if (!Array.isArray(entries) || !entries.length) return false;

  return entries.some((entry) => {
    const firearmId = `${entry?.firearmId ?? ''}`.trim();
    const label = `${entry?.label ?? ''}`.trim();
    return Boolean(firearmId || isMeaningfulToken(label));
  });
}

function isS5EndorsementTemplate(template: SentenceTemplate): boolean {
  return template.sectionId === 'S5' && (template.tags ?? []).includes('endorsement');
}

function getSectionTitle(
  sectionId: MotivationSectionId,
  context: ComposeMotivationContext
): string | undefined {
  if (sectionId === 'S5' && hasRelevantFirearmEndorsement(context)) {
    return 'Training, Proficiency and Endorsements';
  }
  return SECTION_TITLES[sectionId];
}

function buildS9NeedSupplementParagraphs(
  context: ComposeMotivationContext
): string[] {
  const values = getComposedValues(context);
  const primaryNeedSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.primaryNeedSummary ?? ''}`
  );
  const needNoteSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.needNoteSummary ?? ''}`
  );

  return [primaryNeedSummary, needNoteSummary].filter(Boolean);
}

function buildS11ActivityNoteParagraphs(
  context: ComposeMotivationContext
): string[] {
  const values = getComposedValues(context);
  const huntingNoteSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.huntingNoteSummary ?? ''}`
  );
  const sportNoteSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.sportNoteSummary ?? ''}`
  );

  return [huntingNoteSummary, sportNoteSummary].filter(Boolean);
}

function ensureS11MixedParticipationParagraph(
  context: ComposeMotivationContext,
  paragraphs: string[]
): string[] {
  if (context.purposeType !== 'mixed_hunting_sport') return paragraphs;
  const values = getComposedValues(context);
  const mixedParticipationSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.participationFrequencySummary ?? ''}`
  );
  if (!mixedParticipationSummary) return paragraphs;
  const hasParagraph = paragraphs.some(
    (paragraph) =>
      normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase() ===
      mixedParticipationSummary.toLowerCase()
  );
  if (hasParagraph) return paragraphs;
  return [...paragraphs, mixedParticipationSummary];
}

function buildS11HuntingSpeciesParagraph(
  context: ComposeMotivationContext
): string {
  if (
    context.purposeType !== 'hunting' &&
    context.purposeType !== 'mixed_hunting_sport'
  ) {
    return '';
  }

  const values = getComposedValues(context);
  const speciesSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.huntingSpeciesSummary ?? ''}`
  );
  if (!speciesSummary || speciesSummary === 'the intended hunting species') {
    return '';
  }

  const firearmShortName = getValueAsString(values, 'firearmMake', 'make');
  const rawCalibre = getValueAsString(values, 'firearmCalibre', 'calibre');
  const calibreLabel = resolveCalibreCatalogRecord(rawCalibre)?.label || rawCalibre;

  if (calibreLabel && firearmShortName) {
    return `The ${calibreLabel} calibre of the ${firearmShortName} is suitable for hunting use across species such as ${speciesSummary}.`;
  }
  if (calibreLabel) {
    return `The ${calibreLabel} calibre is suitable for hunting use across species such as ${speciesSummary}.`;
  }

  return `The selected calibre is suitable for hunting use across species such as ${speciesSummary}.`;
}

function buildS11ActivityEvidenceParagraphs(
  context: ComposeMotivationContext
): string[] {
  const application = context.application;
  if (!application) return [];
  const selectedIds = (application.activityEvidenceIds ?? [])
    .map((id) => `${id ?? ''}`.trim())
    .filter(Boolean);
  if (!selectedIds.length) return [];

  const selected = selectedIds
    .map((id) => getById<ActivityEvidence>(id))
    .filter((entry): entry is ActivityEvidence => Boolean(entry && !entry.deleted));
  if (!selected.length) return [];

  const lines: string[] = [];
  const huntingPhotos = selected
    .filter((entry) => entry.evidenceType === 'HUNTING')
    .flatMap((entry) => entry.photos ?? []);
  const sportPhotos = selected
    .filter((entry) => entry.evidenceType === 'SPORT_SHOOTING')
    .flatMap((entry) => entry.photos ?? []);
  const hasHunting = huntingPhotos.length > 0;
  const hasSport = sportPhotos.length > 0;
  if (!hasHunting && !hasSport) return [];

  const allPhotos = [...huntingPhotos, ...sportPhotos];
  const allDates = allPhotos
    .map((photo) => `${photo.capturedAt ?? ''}`.trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const dateSpan =
    allDates.length === 0
      ? 'with capture dates recorded in supporting photographs'
      : allDates.length === 1
        ? `captured on ${allDates[0]}`
        : `captured between ${allDates[0]} and ${allDates[allDates.length - 1]}`;

  const scopeLabel = hasHunting && hasSport
    ? 'hunting and sport shooting participation'
    : hasHunting
      ? 'hunting participation'
      : 'sport shooting participation';
  const countLabel = hasHunting && hasSport
    ? `${huntingPhotos.length} hunting photo${huntingPhotos.length === 1 ? '' : 's'} and ${sportPhotos.length} sport shooting photo${sportPhotos.length === 1 ? '' : 's'}`
    : hasHunting
      ? `${huntingPhotos.length} hunting photo${huntingPhotos.length === 1 ? '' : 's'}`
      : `${sportPhotos.length} sport shooting photo${sportPhotos.length === 1 ? '' : 's'}`;

  lines.push(
    `Supporting evidence of ${scopeLabel} is attached. In total, ${countLabel} are included, ${dateSpan}. This material confirms my continued ${scopeLabel}.`,
  );

  const activityRequirement = (context.resolvedEvidence?.requirements ?? []).find(
    (requirement) => normalizeCode(requirement.code) === 'ACTIVITY_EVIDENCE' && !!requirement.annexure,
  );
  const annexureLabel = `${activityRequirement?.annexure ?? ''}`.trim();
  if (annexureLabel) {
    lines.push(`This activity evidence is available at Annexure ${annexureLabel}.`);
  }

  return lines;
}

function insertS11HuntingSpeciesParagraph(
  paragraphs: string[],
  speciesParagraph: string
): string[] {
  if (!speciesParagraph) return paragraphs;

  const normalizedSpeciesParagraph = normaliseWhitespacePreservingLineBreaks(
    speciesParagraph
  ).toLowerCase();
  const hasSpeciesParagraph = paragraphs.some(
    (paragraph) =>
      normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase() ===
      normalizedSpeciesParagraph
  );
  if (hasSpeciesParagraph) return paragraphs;

  const anchorIndex = paragraphs.findIndex((paragraph) =>
    /(^|\s)i hunt lawfully\b/i.test(paragraph)
  );
  if (anchorIndex < 0) {
    return [...paragraphs, speciesParagraph];
  }

  return [
    ...paragraphs.slice(0, anchorIndex + 1),
    speciesParagraph,
    ...paragraphs.slice(anchorIndex + 1),
  ];
}

function buildS5EndorsementParagraphs(
  context: ComposeMotivationContext
): string[] {
  const annexureLabels = collectRelevantEndorsementAnnexureLabels(context);
  if (!annexureLabels.length) return [];

  const composedValues = getComposedValues(context);
  const values = {
    ...composedValues,
    firearmDescription: resolveFirearmShortDescription(composedValues),
    annexureReferenceGrouped:
      formatAnnexureReference(annexureLabels) || 'the relevant annexures',
  };
  const paragraphA = normaliseWhitespace(
    resolveTemplateVariables(
      'In respect of the ${firearmDescription}, the endorsement records that the motivation has technical merit and that the firearm is suitable for the purpose for which the licence is sought.',
      { values }
    )
  );
  const paragraphB = normaliseWhitespace(
    resolveTemplateVariables(
      'The endorsement supporting the ${firearmDescription} is reflected in ${annexureReferenceGrouped}.',
      { values }
    )
  );

  return [paragraphA, paragraphB].filter(Boolean);
}

function getSelectedMembershipIds(context: ComposeMotivationContext): string[] {
  if (!Array.isArray(context.application?.membershipIds)) return [];
  return context.application.membershipIds
    .map((id) => `${id ?? ''}`.trim())
    .filter(Boolean);
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function normalizeProvinceCodeForS9(value: unknown): string {
  const normalized = `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  switch (normalized) {
    case 'ec':
    case 'eastern cape':
      return 'ec';
    case 'fs':
    case 'free state':
      return 'fs';
    case 'gp':
    case 'gauteng':
      return 'gp';
    case 'kzn':
    case 'kwazulu natal':
    case 'kwa zulu natal':
    case 'kwa-zulu natal':
    case 'kwa-zulu-natal':
      return 'kzn';
    case 'lp':
    case 'limpopo':
      return 'lp';
    case 'mp':
    case 'mpumalanga':
      return 'mp';
    case 'nw':
    case 'north west':
      return 'nw';
    case 'nc':
    case 'northern cape':
      return 'nc';
    case 'wc':
    case 'western cape':
      return 'wc';
    default:
      return '';
  }
}

function buildS9ProvinceContextParagraph(
  context: ComposeMotivationContext
): string {
  if (
    context.sectionType !== 's13' ||
    context.purposeType !== 'self_defence'
  ) {
    return '';
  }

  const composedValues = getComposedValues(context);
  const provinceCode = normalizeProvinceCodeForS9(
    resolveProvinceValueFromContext(context, composedValues)
  );
  return S9_PROVINCE_CONTEXT_PARAGRAPHS[provinceCode] ?? '';
}

function insertS9ProvinceContextParagraph(
  paragraphs: string[],
  provinceParagraph: string
): string[] {
  if (!provinceParagraph) return paragraphs;

  const normalizedProvinceParagraph = normaliseWhitespacePreservingLineBreaks(
    provinceParagraph
  ).toLowerCase();
  const hasProvinceParagraph = paragraphs.some(
    (paragraph) =>
      normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase() ===
      normalizedProvinceParagraph
  );
  if (hasProvinceParagraph) return paragraphs;

  const anchorIndex = paragraphs.findIndex((paragraph) =>
    /broader criminal environment within which the applicant lives, works, and travels\./i.test(
      paragraph
    )
  );
  if (anchorIndex < 0) {
    return [...paragraphs, provinceParagraph];
  }

  return [
    ...paragraphs.slice(0, anchorIndex + 1),
    provinceParagraph,
    ...paragraphs.slice(anchorIndex + 1),
  ];
}

function buildMembershipDocumentList(
  membership: Membership | null,
  docs: Document[]
): string {
  const kinds = new Set<string>();
  (membership?.membershipDocumentIds ?? []).forEach((entry) => {
    const kind = normalizeCode(entry.kind);
    if (kind) kinds.add(kind);
  });
  docs.forEach((doc) => {
    const kind = normalizeCode(doc.requirementCode ?? doc.kind);
    if (kind) kinds.add(kind);
  });
  const labels = Array.from(kinds)
    .filter((kind) => kind !== 'FIREARM_ENDORSEMENT')
    .sort((left, right) => getMembershipDocumentSortRank(left) - getMembershipDocumentSortRank(right))
    .map((kind) => getMembershipDocumentLabel(kind))
    .filter((label): label is string => Boolean(label))
    .map((label) => label.toLowerCase());
  if (!labels.length) return 'membership supporting documentation';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function buildS7MembershipAnnexureParagraphs(
  context: ComposeMotivationContext
): string[] {
  const resolvedEvidence = context.resolvedEvidence;
  if (!resolvedEvidence) return [];
  if (
    Array.isArray(context.application?.membershipIds) &&
    context.application.membershipIds.length === 0
  ) {
    return [];
  }

  const selectedMembershipIds = new Set(getSelectedMembershipIds(context));
  const membershipRequirements = (resolvedEvidence.requirements ?? []).filter(
    (requirement) =>
      requirement.satisfied &&
      !!requirement.annexure &&
      requirement.evidenceKeys.some(
        (key) => key === 'association_membership' || key === 'dedicated_status'
      )
  );
  if (!membershipRequirements.length) return [];

  const annexuresByMembershipId = new Map<string, Set<string>>();
  membershipRequirements.forEach((requirement) => {
    const items = buildEntityLevelAnnexureItemsForRequirement(
      requirement,
      requirement.evidenceKeys.find((key) => key !== 'activity_participation') ?? undefined
    );
    items.forEach((item) => {
      const key = `${item.key ?? ''}`.trim();
      if (!key.startsWith('membership:')) return;
      const membershipId = key.slice('membership:'.length).trim();
      if (!membershipId) return;
      if (selectedMembershipIds.size && !selectedMembershipIds.has(membershipId)) return;
      const annexures = annexuresByMembershipId.get(membershipId) ?? new Set<string>();
      annexures.add(item.annexure);
      annexuresByMembershipId.set(membershipId, annexures);
    });
  });
  if (!annexuresByMembershipId.size) return [];

  const paragraphs = Array.from(annexuresByMembershipId.entries())
    .sort((left, right) => {
      const leftAnnexure = Array.from(left[1]).sort(compareAnnexureReferences)[0] ?? '';
      const rightAnnexure = Array.from(right[1]).sort(compareAnnexureReferences)[0] ?? '';
      return compareAnnexureReferences(leftAnnexure, rightAnnexure);
    })
    .map(([membershipId, annexureSet]) => {
      const membership = getById<Membership>(membershipId);
      const membershipName = `${membership?.associationName ?? ''}`.trim();
      const docs = membershipRequirements
        .flatMap((requirement) => readMatchedDocuments(requirement.matchedDocumentIds ?? []))
        .filter((doc) => {
          const parentType = normalizeCode(doc.parentType);
          const parentId = `${doc.parentId ?? ''}`.trim();
          const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
          return (
            (parentType === 'MEMBERSHIP' && parentId === membershipId) ||
            relatedId === membershipId
          );
        });
      const docList = sentenceCase(buildMembershipDocumentList(membership ?? null, docs));
      const label = membershipName ? `${membershipName} membership` : 'Membership';
      const rawAnnexures = Array.from(annexureSet);
      const suffixedBases = new Set(
        rawAnnexures
          .map((annexure) => splitAnnexureRef(annexure))
          .filter((parts) => parts.suffix != null)
          .map((parts) => parts.base)
      );
      const normalizedAnnexures = rawAnnexures.filter((annexure) => {
        const parts = splitAnnexureRef(annexure);
        if (parts.suffix != null) return true;
        return !suffixedBases.has(parts.base);
      });

      const annexureLabels = normalizedAnnexures
        .sort(compareAnnexureReferences)
        .map((annexure) => `Annexure ${annexure}`);
      const annexureReference = formatAnnexureReference(annexureLabels);
      return `${annexureReference}: ${label} (Documents: ${docList}).`;
    })
    .filter(Boolean);

  return paragraphs;
}

function collectCharacterReferenceAnnexureLabels(
  context: ComposeMotivationContext
): string[] {
  const resolvedEvidence = getResolvedEvidence(context);
  if (!resolvedEvidence) return [];

  const rawAnnexures = (resolvedEvidence.requirements ?? [])
    .filter(
      (requirement) =>
        !!requirement.annexure &&
        normalizeCode(requirement.code).startsWith('SUPPORTING_STATEMENT_')
    )
    .map((requirement) => `${requirement.annexure ?? ''}`.trim())
    .filter(Boolean);
  if (!rawAnnexures.length) return [];

  const suffixedBases = new Set(
    rawAnnexures
      .map((annexure) => splitAnnexureRef(annexure))
      .filter((parts) => parts.suffix != null)
      .map((parts) => parts.base)
  );
  const normalizedAnnexures = rawAnnexures.filter((annexure) => {
    const parts = splitAnnexureRef(annexure);
    if (parts.suffix != null) return true;
    return !suffixedBases.has(parts.base);
  });

  const uniqueAnnexures = Array.from(new Set(normalizedAnnexures)).sort(compareAnnexureReferences);
  return uniqueAnnexures.map((annexure) => `Annexure ${annexure}: Character references`);
}

function appendS2CharacterReferenceAnnexureContext(
  paragraphs: string[],
  context: ComposeMotivationContext
): string[] {
  const annexureLabels = collectCharacterReferenceAnnexureLabels(context);
  if (!annexureLabels.length) return paragraphs;

  const annexureReference = formatAnnexureReference(annexureLabels);
  if (!annexureReference) return paragraphs;

  return paragraphs.map((paragraph) => {
    const normalized = normaliseWhitespace(paragraph).toLowerCase();
    if (!normalized.includes('character references are included')) return paragraph;
    if (normalized.includes('character references are attached at')) return paragraph;
    return `${paragraph} Character references are attached at ${annexureReference}.`;
  });
}

function buildS7MembershipDeclarationParagraphs(
  context: ComposeMotivationContext
): string[] {
  if (!Array.isArray(context.application?.membershipIds)) return [];
  if (context.application.membershipIds.length > 0) return [];

  const hasAnyMemberships = listByType<Membership>('Membership').length > 0;
  if (!hasAnyMemberships) {
    return [
      'I confirm that I am not currently a member of any firearm association, and this application is therefore submitted without reliance on association membership or dedicated-status documentation.',
    ];
  }

  return [
    'I hold firearm-association memberships, but they are intentionally excluded from this motivation because they are not relevant to the present firearm application.',
  ];
}

function buildCompetencyLabel(certificate: CompetencyCertificate | null, fallback?: string): string {
  const number = `${certificate?.certificateNumber ?? ''}`.trim();
  const categories = competencyCategoryListLabel(certificate?.categories);
  const categorySuffix = categories ? ` (${categories})` : '';
  if (isMeaningfulToken(number)) return `Competency certificate ${number}${categorySuffix}`;
  if (fallback && isMeaningfulToken(fallback)) return `${fallback.trim()}${categorySuffix}`;
  return 'Competency certificate';
}

function buildEntityLevelAnnexureItemsForRequirement(
  requirement: {
    code: string;
    label?: string;
    annexure?: string;
    evidenceKeys: string[];
    matchedDocumentIds: string[];
  },
  fallbackEvidenceKey?: string
): AnnexureOverviewItem[] {
  const annexureBase = `${requirement.annexure ?? ''}`.trim();
  if (!annexureBase) return [];
  const docs = readMatchedDocuments(requirement.matchedDocumentIds ?? []);
  const requirementCode = normalizeCode(requirement.code);
  const evidenceKeySet = new Set(requirement.evidenceKeys ?? []);
  const hasMembershipFamily =
    MEMBERSHIP_DOC_CODES.has(requirementCode) ||
    requirementCode === 'MEMBERSHIP' ||
    evidenceKeySet.has('association_membership') ||
    evidenceKeySet.has('dedicated_status') ||
    evidenceKeySet.has('firearm_endorsement');
  const isEndorsementFamily =
    requirementCode === 'FIREARM_ENDORSEMENT' ||
    evidenceKeySet.has('firearm_endorsement');
  const hasSafeFamily =
    requirementCode.includes('SAFE') || evidenceKeySet.has('safe_photos');
  const hasProficiencyFamily =
    requirementCode.startsWith('PROFICIENCY') || evidenceKeySet.has('proficiency_certificate');
  const hasStatementOfResults =
    requirementCode.startsWith('STATEMENT_OF_RESULTS_');
  const hasFirearmFamily =
    requirementCode === 'FIREARM_LICENCE' || evidenceKeySet.has('existing_licence_copy');
  const hasCompetencyFamily =
    requirementCode === 'COMPETENCY_CERT' || evidenceKeySet.has('competency_certificate');
  const hasCharacterReferenceFamily = requirementCode.startsWith('SUPPORTING_STATEMENT_');

  if (!docs.length) {
    return [
      {
        annexure: annexureBase,
        label:
          hasCharacterReferenceFamily
            ? 'Character references'
            :
          requirementCode === 'FIREARM_LICENCE'
            ? 'Copy of firearm licence card for the firearm under renewal'
            : getRequirementDisplayLabel(requirement, fallbackEvidenceKey),
      },
    ];
  }

  const grouped = new Map<string, { key: string; label: string }>();
  const pushEntity = (key: string, label: string) => {
    const normalizedLabel = normalizeAnnexureLabel(label);
    if (!normalizedLabel) return;
    const dedupeKey = `${annexureBase.toUpperCase()}::${key.toLowerCase()}`;
    if (grouped.has(dedupeKey)) return;
    grouped.set(dedupeKey, { key, label: normalizedLabel });
  };

  docs.forEach((doc) => {
    const parentType = normalizeCode(doc.parentType);
    const parentId = `${doc.parentId ?? ''}`.trim();
    const relatedId = `${doc.requirementRelatedId ?? ''}`.trim();
    const relatedLabel = `${doc.requirementRelatedLabel ?? ''}`.trim();

    if (hasCharacterReferenceFamily) {
      pushEntity('character-references', 'Character references');
      return;
    }

    if (hasSafeFamily) {
      const safeId = parentType === 'SAFE' ? parentId : relatedId;
      const safe = safeId ? getById<Safe>(safeId) : null;
      const safeName = `${safe?.safeName ?? ''}`.trim();
      const label = isMeaningfulToken(safeName)
        ? safeName
        : isMeaningfulToken(relatedLabel)
          ? relatedLabel
          : normalizeRequirementLabel(requirement.label, fallbackEvidenceKey);
      pushEntity(`safe:${safeId || label.toLowerCase()}`, label);
      return;
    }

    if (hasMembershipFamily) {
      const membershipId = parentType === 'MEMBERSHIP' ? parentId : relatedId;
      const membership = membershipId ? getById<Membership>(membershipId) : null;
      const membershipName = `${membership?.associationName ?? ''}`.trim();
      const baseLabel = isMeaningfulToken(membershipName)
        ? membershipName
        : isMeaningfulToken(relatedLabel)
          ? relatedLabel
          : 'Association membership';
      const endorsementFirearm = isEndorsementFamily && relatedId
        ? getById<Firearm>(relatedId)
        : null;
      const endorsementLabel = buildFirearmShortLabel(endorsementFirearm, 'Firearm');
      const label = isEndorsementFamily
        ? `Endorsement (${baseLabel}) - ${endorsementLabel}`
        : `Membership - ${baseLabel}`;
      pushEntity(`membership:${membershipId || label.toLowerCase()}`, label);
      return;
    }

    if (hasStatementOfResults) {
      const proficiencyId = parentType === 'PROFICIENCY' ? parentId : relatedId;
      const proficiency = proficiencyId ? getById<Proficiency>(proficiencyId) : null;
      const provider = `${proficiency?.trainingProviderName ?? ''}`.trim();
      const baseLabel = isMeaningfulToken(provider)
        ? provider
        : isMeaningfulToken(relatedLabel)
          ? relatedLabel
          : 'Training institute';
      const sorLabels = resolveStatementOfResultsLabels(
        proficiency,
        proficiencyId,
        docs,
        requirementCode
      );
      const suffix = sorLabels.length ? ` (${sorLabels.join(', ')})` : '';
      const label = `Statement of Results - ${baseLabel}${suffix}`;
      pushEntity(`sor:${proficiencyId || label.toLowerCase()}`, label);
      return;
    }

    if (hasProficiencyFamily) {
      const proficiencyId = parentType === 'PROFICIENCY' ? parentId : relatedId;
      const proficiency = proficiencyId ? getById<Proficiency>(proficiencyId) : null;
      const provider = `${proficiency?.trainingProviderName ?? ''}`.trim();
      const baseLabel = isMeaningfulToken(provider)
        ? provider
        : isMeaningfulToken(relatedLabel)
          ? relatedLabel
          : 'Proficiency certificate';
      const typeLabels = resolveProficiencyTypeLabels(proficiency, proficiencyId, docs);
      const suffix = typeLabels.length ? ` (${typeLabels.join(', ')})` : '';
      const label = `Proficiency - ${baseLabel}${suffix}`;
      pushEntity(`proficiency:${proficiencyId || label.toLowerCase()}`, label);
      return;
    }

    if (hasCompetencyFamily) {
      const certificateId = parentType === 'COMPETENCYCERTIFICATE' ? parentId : relatedId;
      const certificate = certificateId ? getById<CompetencyCertificate>(certificateId) : null;
      const label = buildCompetencyLabel(certificate, relatedLabel);
      pushEntity(`competency:${certificateId || label.toLowerCase()}`, label);
      return;
    }

    if (hasFirearmFamily) {
      const firearmId = parentType === 'FIREARM' ? parentId : relatedId;
      const firearm = firearmId ? getById<Firearm>(firearmId) : null;
      const label = buildFirearmLabel(firearm, relatedLabel);
      pushEntity(`firearm:${firearmId || label.toLowerCase()}`, label);
      return;
    }

    const fallbackLabel =
      getRequirementDisplayLabel(requirement, fallbackEvidenceKey);
    pushEntity(`generic:${fallbackLabel.toLowerCase()}`, fallbackLabel);
  });

  const ordered = Array.from(grouped.values()).sort((a, b) => {
    const labelCmp = a.label.localeCompare(b.label);
    if (labelCmp !== 0) return labelCmp;
    return a.key.localeCompare(b.key);
  });
  const useSuffix = ordered.length > 1;
  return ordered.map((item, index) => ({
    annexure: useSuffix ? `${annexureBase}${index + 1}` : annexureBase,
    label: item.label,
    key: item.key,
  }));
}

function buildAnnexureOverview(context: ComposeMotivationContext): string | null {
  const configuredEvidenceKeys = deriveMotivationEvidenceKeys({
    values: context.values,
    evidenceKeys: context.evidenceKeys,
  }).filter((key) => key !== 'activity_participation');
  const resolvedEvidenceKeys =
    (context.resolvedEvidence?.evidenceKeys ?? []).filter(
      (key) => key && key !== 'activity_participation'
    );
  let activeEvidenceKeys = resolvedEvidenceKeys.length
    ? resolvedEvidenceKeys
    : configuredEvidenceKeys;
  const selectedActivityEvidenceIds = (context.application?.activityEvidenceIds ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  if (selectedActivityEvidenceIds.length) {
    const hasSelectedActivityPhotos = selectedActivityEvidenceIds.some((id) => {
      const item = getById<ActivityEvidence>(id);
      return Boolean(item && !item.deleted && Array.isArray(item.photos) && item.photos.length > 0);
    });
    if (hasSelectedActivityPhotos && !activeEvidenceKeys.includes('activity_report')) {
      activeEvidenceKeys = [...activeEvidenceKeys, 'activity_report'];
    }
  }
  const overviewLines = context.application
    ? buildAnnexureOverviewLines({
        application: context.application,
        activeEvidenceKeys,
      })
    : [];
  console.log('[motivation-composer][SDA] annexure overview input/output', {
    appId: context.application?.id,
    configuredEvidenceKeys,
    resolvedEvidenceKeys,
    activeEvidenceKeys,
    overviewLines,
  });

  if (!overviewLines.length) {
    if (!activeEvidenceKeys.length) return null;
    return [
      'Supporting Documents Attached:',
      activeEvidenceKeys
        .map((key) => ANNEXURE_LABELS[key] ?? titleCase(key))
        .filter(Boolean)
        .map((item) => `- ${item}`)
        .join('\n'),
    ].join('\n');
  }

  return [
    'Supporting Documents Attached:',
    overviewLines.map((line) => `- ${line}`).join('\n'),
  ].join('\n');
}

function buildClosingBlock(context: ComposeMotivationContext): string {
  const applicantName = getValueAsString(
    context.values,
    'applicantFullName',
    'fullName',
    'fullNames'
  );
  const signedPlace = getValueAsString(
    context.values,
    'signedAt',
    'signaturePlace',
    'city',
    'town'
  );
  const signedDate = getValueAsString(
    context.values,
    'signedOn',
    'signatureDate',
    'date'
  );

  return [
    `Signed at ${signedPlace || '____________________'} on ${signedDate || '____________________'}.`,
    '',
    '______________________________',
    applicantName || 'Applicant',
  ].join('\n');
}

const S13_SECURITY_SUBITEM_MARKER = '__S13_SECURITY_SUBITEM__::';
const FIREARM_DESCRIPTION_SUBITEM_MARKER = '__FIREARM_DESCRIPTION_SUBITEM__::';
const SPORT_PARTICIPATION_FACT_LEAD = 'Participation in organised sport shooting requires';

function renderNumberedSections(sections: ComposedSection[]): string {
  return sections
    .map((section, sectionIndex) => {
      const sectionNumber = sectionIndex + 1;
      const heading = `${sectionNumber}. ${section.title ?? `Section ${sectionNumber}`}`;
      const paragraphs = section.paragraphs.flatMap((paragraph, paragraphIndex) => {
        const paragraphNumber = `${sectionNumber}.${paragraphIndex + 1}`;
        const paragraphPrefix = `${paragraphNumber} `;
        const subItemMarker = paragraph.includes(S13_SECURITY_SUBITEM_MARKER)
          ? S13_SECURITY_SUBITEM_MARKER
          : paragraph.includes(FIREARM_DESCRIPTION_SUBITEM_MARKER)
            ? FIREARM_DESCRIPTION_SUBITEM_MARKER
            : null;
        if (!subItemMarker) {
          return `${paragraphPrefix}${paragraph}`;
        }

        const lines = paragraph
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (!lines.length) return [];

        const baseLine = lines[0];
        const subItems = lines
          .slice(1)
          .filter((line) => line.startsWith(subItemMarker))
          .map((line) => line.slice(subItemMarker.length).trim())
          .filter(Boolean);

        const rendered = [`${paragraphPrefix}${baseLine}`];
        const subItemNumberIndent = ' '.repeat(paragraphPrefix.length);
        subItems.forEach((item, index) => {
          const subItemNumber = `${paragraphNumber}.${index + 1}`;
          const subItemPrefix = `${subItemNumberIndent}${subItemNumber} `;
          const subItemContinuationIndent = ' '.repeat(subItemPrefix.length);
          const itemLines = item
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
          if (!itemLines.length) return;
          rendered.push(`${subItemPrefix}${itemLines[0]}`);
          itemLines.slice(1).forEach((line) => {
            rendered.push(`${subItemContinuationIndent}${line}`);
          });
        });
        return rendered.join('\n');
      });

      return [heading, ...paragraphs].join('\n\n');
    })
    .join('\n\n');
}

function mergeFirearmUsageSections(sections: ComposedSection[]): ComposedSection[] {
  const s11 = sections.find((section) => section.sectionId === 'S11');
  const s12 = sections.find((section) => section.sectionId === 'S12');

  if (!s11 && !s12) {
    return sections;
  }

  const mergedSection: ComposedSection = {
    sectionId: 'S11',
    title: MERGED_FIREARM_USAGE_SECTION_TITLE,
    paragraphs: dedupeParagraphs([...(s11?.paragraphs ?? []), ...(s12?.paragraphs ?? [])]),
    templates: [...(s11?.templates ?? []), ...(s12?.templates ?? [])],
  };

  const merged: ComposedSection[] = [];
  let inserted = false;

  for (const section of sections) {
    if (section.sectionId === 'S11' || section.sectionId === 'S12') {
      if (!inserted) {
        merged.push(mergedSection);
        inserted = true;
      }
      continue;
    }
    merged.push(section);
  }

  if (!inserted) {
    merged.push(mergedSection);
  }

  return merged;
}

function getResolvedEvidence(
  context: ComposeMotivationContext
): ResolvedEvidence | null {
  return context.resolvedEvidence ?? null;
}

function collectAnnexureLabelsForEvidenceKeys(
  resolvedEvidence: ResolvedEvidence | null,
  evidenceKeys: string[]
): string[] {
  if (!resolvedEvidence || !evidenceKeys.length) return [];

  const composedItems: AnnexureOverviewItem[] = [];
  const seen = new Set<string>();
  const resolvedItems = resolvedEvidence.requirements
    .filter((requirement) => requirement.satisfied && requirement.annexure)
    .filter((requirement) =>
      requirement.evidenceKeys.some((key) => evidenceKeys.includes(key))
    )
    .flatMap((requirement) => {
      const fallbackEvidenceKey =
        requirement.evidenceKeys.find((key) => key !== 'activity_participation') ??
        undefined;
      return buildEntityLevelAnnexureItemsForRequirement(requirement, fallbackEvidenceKey);
    })
    .filter((item) => item.annexure && item.label);

  resolvedItems.forEach((item) => {
    const key = `${item.annexure.toUpperCase()}::${item.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    composedItems.push(item);
  });

  const suffixedByBaseAndLabel = new Set<string>();
  composedItems.forEach((item) => {
    const annex = splitAnnexureRef(item.annexure);
    if (annex.suffix != null) {
      suffixedByBaseAndLabel.add(`${annex.base}::${item.label.toLowerCase()}`);
    }
  });
  const filteredItems = composedItems.filter((item) => {
    const annex = splitAnnexureRef(item.annexure);
    if (annex.suffix != null) return true;
    return !suffixedByBaseAndLabel.has(`${annex.base}::${item.label.toLowerCase()}`);
  });

  return filteredItems
    .sort((left, right) => {
      const annexureCmp = compareAnnexureReferences(left.annexure, right.annexure);
      if (annexureCmp !== 0) return annexureCmp;
      return left.label.localeCompare(right.label);
    })
    .map((item) => `Annexure ${item.annexure}: ${item.label}`);
}

function formatAnnexureReference(labels: string[]): string {
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function buildTemplateRenderValues(
  template: SentenceTemplate,
  context: ComposeMotivationContext
): Record<string, unknown> {
  const annexureLabels = isS5EndorsementTemplate(template)
    ? collectRelevantEndorsementAnnexureLabels(context)
    : collectAnnexureLabelsForEvidenceKeys(
        getResolvedEvidence(context),
        getTemplateAnnexureEvidenceKeys(template, context)
      );

  return {
    ...getComposedValues(context),
    annexureReference: annexureLabels[0] ?? 'the relevant annexure',
    annexureReferenceGrouped:
      formatAnnexureReference(annexureLabels) || 'the relevant annexures',
  };
}

function templateNeedsResolvedAnnexure(
  template: SentenceTemplate
): boolean {
  return (
    template.variables?.some(
      (variable) =>
        variable === 'annexureReference' ||
        variable === 'annexureReferenceGrouped'
    ) ?? false
  );
}

function hasResolvedAnnexureForTemplate(
  template: SentenceTemplate,
  context: ComposeMotivationContext
): boolean {
  if (!templateNeedsResolvedAnnexure(template)) return true;
  if (template.sectionId === 'S5') {
    const evidenceKeys = getTemplateAnnexureEvidenceKeys(template, context);
    if (
      evidenceKeys.includes('proficiency_certificate') &&
      Array.isArray(context.application?.proficiencyIds) &&
      context.application.proficiencyIds.length === 0
    ) {
      return false;
    }
  }
  if (template.sectionId === 'S8') {
    const evidenceKeys = getTemplateAnnexureEvidenceKeys(template, context);
    if (
      evidenceKeys.includes('existing_licence_copy') &&
      !hasSelectedComparisonFirearms(context)
    ) {
      return false;
    }
  }
  const annexureLabels = isS5EndorsementTemplate(template)
    ? collectRelevantEndorsementAnnexureLabels(context)
    : collectAnnexureLabelsForEvidenceKeys(
        getResolvedEvidence(context),
        getTemplateAnnexureEvidenceKeys(template, context)
      );

  return annexureLabels.length > 0;
}

function getTemplateAnnexureEvidenceKeys(
  template: SentenceTemplate,
  context: ComposeMotivationContext
): string[] {
  return Array.from(
    new Set([
      ...(template.evidence ?? []).map((rule) => rule.key),
      ...(SECTION_ANNEXURE_EVIDENCE_KEYS[template.sectionId] ?? []),
      ...(template.sectionId === 'S14'
        ? getResolvedEvidence(context)?.evidenceKeys ?? []
        : []),
    ])
  );
}

function tokenizeForSimilarity(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  );
}

function similarityScore(left: string, right: string): number {
  const leftTokens = tokenizeForSimilarity(left);
  const rightTokens = tokenizeForSimilarity(right);

  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function pruneAdjacentSectionDuplication(
  sections: ComposedSection[]
): ComposedSection[] {
  return sections.map((section, index) => {
    if (index === 0) return section;

    const previous = sections[index - 1];
    const previousParagraphs = previous.paragraphs;
    if (!previousParagraphs.length) return section;

    const paragraphs = section.paragraphs.filter((paragraph, paragraphIndex) => {
      const normalizedParagraph = normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase();
      const isParticipationFrequencyParagraph =
        normalizedParagraph.includes('throughout the year') &&
        (
          normalizedParagraph.includes('opportunities') ||
          normalizedParagraph.includes('seasons allow') ||
          normalizedParagraph.includes('range participation')
        );

      if (
        section.sectionId === 'S12' &&
        previous.sectionId === 'S10' &&
        paragraphIndex === 0 &&
        previousParagraphs.some(
          (previousParagraph) => similarityScore(previousParagraph, paragraph) >= 0.42
        )
      ) {
        return false;
      }

      if (
        section.sectionId === 'S9' &&
        previous.sectionId === 'S8' &&
        previousParagraphs.some(
          (previousParagraph) => similarityScore(previousParagraph, paragraph) >= 0.5
        )
      ) {
        return false;
      }

      if (
        section.sectionId === 'S11' &&
        previous.sectionId === 'S10' &&
        paragraphIndex > 0 &&
        !isParticipationFrequencyParagraph &&
        previousParagraphs.some(
          (previousParagraph) => similarityScore(previousParagraph, paragraph) >= 0.4
        )
      ) {
        return false;
      }

      return true;
    });

    return {
      ...section,
      paragraphs: paragraphs.length ? paragraphs : section.paragraphs,
    };
  });
}

function assembleSectionParagraphs(
  sectionId: MotivationSectionId,
  sentences: RenderedSentence[]
): string[] {
  const remaining = [...sentences];
  const paragraphs: string[] = [];

  if (sectionId === 'S5') {
    const intros = sentences.filter((sentence) => sentence.kind === 'sectionIntro');
    const coreClaims = sentences.filter((sentence) => sentence.kind === 'coreClaim');
    const supportingClaims = sentences.filter((sentence) => sentence.kind === 'supportingClaim');
    const evidenceLinks = sentences.filter((sentence) => sentence.kind === 'evidenceLink');
    const otherClaims = sentences.filter(
      (sentence) =>
        sentence.kind !== 'sectionIntro' &&
        sentence.kind !== 'coreClaim' &&
        sentence.kind !== 'supportingClaim' &&
        sentence.kind !== 'evidenceLink'
    );

    const isSorEvidenceLink = (sentence: RenderedSentence) =>
      (sentence.template?.tags ?? []).includes('statement-of-results');
    const isEndorsementEvidenceLink = (sentence: RenderedSentence) =>
      (sentence.template?.tags ?? []).includes('endorsement');

    const proficiencyEvidenceLinks = evidenceLinks.filter(
      (sentence) => !isSorEvidenceLink(sentence) && !isEndorsementEvidenceLink(sentence)
    );
    const sorEvidenceLinks = evidenceLinks.filter((sentence) =>
      isSorEvidenceLink(sentence)
    );
    const trailingEvidenceLinks = evidenceLinks.filter(
      (sentence) => !proficiencyEvidenceLinks.includes(sentence) && !sorEvidenceLinks.includes(sentence)
    );

    const sortByTemplateId = (left: RenderedSentence, right: RenderedSentence) => {
      const leftId = left.template?.id ?? left.text;
      const rightId = right.template?.id ?? right.text;
      return leftId.localeCompare(rightId);
    };

    intros.forEach((sentence) => {
      const paragraph = buildParagraphFromSentences([sentence]);
      if (paragraph) paragraphs.push(paragraph);
    });
    coreClaims.forEach((sentence) => {
      const paragraph = buildParagraphFromSentences([sentence]);
      if (paragraph) paragraphs.push(paragraph);
    });
    [...proficiencyEvidenceLinks].sort(sortByTemplateId).forEach((sentence) => {
      const paragraph = buildParagraphFromSentences([sentence]);
      if (paragraph) paragraphs.push(paragraph);
    });
    supportingClaims.forEach((sentence) => {
      const paragraph = buildParagraphFromSentences([sentence]);
      if (paragraph) paragraphs.push(paragraph);
    });
    [...sorEvidenceLinks].sort(sortByTemplateId).forEach((sentence) => {
      const paragraph = buildParagraphFromSentences([sentence]);
      if (paragraph) paragraphs.push(paragraph);
    });

    const otherParagraph = buildParagraphFromSentences(otherClaims);
    if (otherParagraph) paragraphs.push(otherParagraph);

    [...trailingEvidenceLinks]
      .sort((left, right) => {
        const leftTags = new Set(left.template?.tags ?? []);
        const rightTags = new Set(right.template?.tags ?? []);
        const leftIsEndorsement = leftTags.has('endorsement');
        const rightIsEndorsement = rightTags.has('endorsement');
        if (leftIsEndorsement !== rightIsEndorsement) {
          return leftIsEndorsement ? 1 : -1;
        }
        return sortByTemplateId(left, right);
      })
      .forEach((sentence) => {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      });

    return paragraphs;
  }

  const kindGroups = getParagraphKindGroups(sectionId);

  for (const kinds of kindGroups) {
    const selected: RenderedSentence[] = [];

    for (const kind of kinds) {
      for (let index = 0; index < remaining.length; ) {
        if (remaining[index].kind !== kind) {
          index += 1;
          continue;
        }

        selected.push(remaining[index]);
        remaining.splice(index, 1);
      }
    }

    if (sectionId === 'S3') {
      for (const sentence of selected) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }
      continue;
    }

    if (sectionId === 'S2') {
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const nonSupportingClaims = selected.filter(
        (sentence) => sentence.kind !== 'supportingClaim'
      );

      const nonSupportingParagraph = buildParagraphFromSentences(nonSupportingClaims);
      if (nonSupportingParagraph) paragraphs.push(nonSupportingParagraph);

      for (const sentence of supportingClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }
      continue;
    }

    if (sectionId === 'S4') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const otherNonSupportingClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim' &&
          sentence.kind !== 'supportingClaim'
      );

      for (const sentence of intros) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      for (const sentence of coreClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      const otherNonSupportingParagraph = buildParagraphFromSentences(otherNonSupportingClaims);
      if (otherNonSupportingParagraph) paragraphs.push(otherNonSupportingParagraph);

      for (const sentence of supportingClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }
      continue;
    }

    if (sectionId === 'S9') {
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const nonSupportingClaims = selected.filter(
        (sentence) => sentence.kind !== 'supportingClaim'
      );

      for (const sentence of supportingClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      const nonSupportingParagraph = buildParagraphFromSentences(nonSupportingClaims);
      if (nonSupportingParagraph) paragraphs.push(nonSupportingParagraph);
      continue;
    }

    if (sectionId === 'S13') {
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const otherNonSupportingClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'supportingClaim' &&
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim'
      );

      for (const sentence of supportingClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      for (const sentence of intros) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      for (const sentence of coreClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      const otherNonSupportingParagraph = buildParagraphFromSentences(otherNonSupportingClaims);
      if (otherNonSupportingParagraph) paragraphs.push(otherNonSupportingParagraph);
      continue;
    }

    if (sectionId === 'S14') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const evidenceLinks = selected.filter(
        (sentence) => sentence.kind === 'evidenceLink'
      );
      const conclusions = selected.filter(
        (sentence) => sentence.kind === 'conclusion'
      );
      const otherClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim' &&
          sentence.kind !== 'supportingClaim' &&
          sentence.kind !== 'evidenceLink' &&
          sentence.kind !== 'conclusion'
      );

      [
        ...intros,
        ...coreClaims,
        ...supportingClaims,
        ...evidenceLinks,
        ...conclusions,
      ].forEach((sentence) => {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      });

      const otherParagraph = buildParagraphFromSentences(otherClaims);
      if (otherParagraph) paragraphs.push(otherParagraph);
      continue;
    }

    if (sectionId === 'S8') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const comparisons = selected.filter(
        (sentence) => sentence.kind === 'comparison'
      );
      const otherClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'comparison'
      );

      intros.forEach((sentence) => {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      });

      comparisons.forEach((sentence) => {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      });

      const otherParagraph = buildParagraphFromSentences(otherClaims);
      if (otherParagraph) paragraphs.push(otherParagraph);
      continue;
    }

    if (sectionId === 'S6') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const otherNonSupportingClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim' &&
          sentence.kind !== 'supportingClaim'
      );

      for (const sentence of intros) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      for (const sentence of coreClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      const otherNonSupportingParagraph = buildParagraphFromSentences(otherNonSupportingClaims);
      if (otherNonSupportingParagraph) paragraphs.push(otherNonSupportingParagraph);

      for (const sentence of supportingClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }
      continue;
    }

    if (sectionId === 'S11') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const supportingClaims = selected
        .filter(
        (sentence) => sentence.kind === 'supportingClaim'
        )
        .sort((left, right) => {
          const leftPriority = normaliseWhitespace(left.text).startsWith(SPORT_PARTICIPATION_FACT_LEAD) ? 0 : 1;
          const rightPriority = normaliseWhitespace(right.text).startsWith(SPORT_PARTICIPATION_FACT_LEAD) ? 0 : 1;
          return leftPriority - rightPriority;
        });
      const otherNonSupportingClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim' &&
          sentence.kind !== 'supportingClaim'
      );

      for (const sentence of intros) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      for (const sentence of coreClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      for (const sentence of supportingClaims) {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      }

      const nonSupportingParagraph = buildParagraphFromSentences(otherNonSupportingClaims);
      if (nonSupportingParagraph) paragraphs.push(nonSupportingParagraph);
      continue;
    }

    if (sectionId === 'S10' || sectionId === 'S12') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const evidenceLinks = selected.filter(
        (sentence) => sentence.kind === 'evidenceLink'
      );
      const conclusions = selected.filter(
        (sentence) => sentence.kind === 'conclusion'
      );
      const otherClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim' &&
          sentence.kind !== 'supportingClaim' &&
          sentence.kind !== 'evidenceLink' &&
          sentence.kind !== 'conclusion'
      );

      [
        ...intros,
        ...coreClaims,
        ...supportingClaims,
        ...evidenceLinks,
        ...conclusions,
      ].forEach((sentence) => {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      });

      const otherParagraph = buildParagraphFromSentences(otherClaims);
      if (otherParagraph) paragraphs.push(otherParagraph);
      continue;
    }

    if (sectionId === 'S7') {
      const intros = selected.filter(
        (sentence) => sentence.kind === 'sectionIntro'
      );
      const coreClaims = selected.filter(
        (sentence) => sentence.kind === 'coreClaim'
      );
      const supportingClaims = selected.filter(
        (sentence) => sentence.kind === 'supportingClaim'
      );
      const evidenceLinks = selected.filter(
        (sentence) => sentence.kind === 'evidenceLink'
      );
      const conclusions = selected.filter(
        (sentence) => sentence.kind === 'conclusion'
      );
      const otherClaims = selected.filter(
        (sentence) =>
          sentence.kind !== 'sectionIntro' &&
          sentence.kind !== 'coreClaim' &&
          sentence.kind !== 'supportingClaim' &&
          sentence.kind !== 'evidenceLink' &&
          sentence.kind !== 'conclusion'
      );

      [
        ...intros,
        ...coreClaims,
        ...supportingClaims,
        ...evidenceLinks,
        ...conclusions,
      ].forEach((sentence) => {
        const paragraph = buildParagraphFromSentences([sentence]);
        if (paragraph) paragraphs.push(paragraph);
      });

      const otherParagraph = buildParagraphFromSentences(otherClaims);
      if (otherParagraph) paragraphs.push(otherParagraph);
      continue;
    }

    const paragraph = buildParagraphFromSentences(selected);
    if (paragraph) paragraphs.push(paragraph);
  }

  if (remaining.length) {
    const paragraph = buildParagraphFromSentences(remaining);
    if (paragraph) paragraphs.push(paragraph);
  }

  return paragraphs;
}

function normaliseS8Paragraphs(
  paragraphs: string[],
  values: Record<string, unknown>
): string[] {
  const summary =
    typeof values.inadequacySummary === 'string' ? values.inadequacySummary.trim() : '';
  const rawCustom = Array.isArray(values.inadequacyParagraphs)
    ? values.inadequacyParagraphs
    : [];
  const customParagraphs = rawCustom
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!summary || !customParagraphs.length) return paragraphs;

  return paragraphs.flatMap((paragraph) =>
    paragraph.trim() === summary ? customParagraphs : [paragraph]
  );
}

function normaliseS13Paragraphs(
  paragraphs: string[],
  values: Record<string, unknown>
): string[] {
  const homeTypeSummary =
    typeof values.homeTypeSummary === 'string' ? values.homeTypeSummary.trim() : '';
  const homeSecurityIntro =
    typeof values.homeSecurityIntro === 'string' ? values.homeSecurityIntro.trim() : '';
  const marker =
    typeof values.homeSecurityMeasureSummary === 'string'
      ? values.homeSecurityMeasureSummary.trim()
      : '';
  const rawMeasureParagraphs = Array.isArray(values.homeSecurityMeasureParagraphs)
    ? values.homeSecurityMeasureParagraphs
    : [];
  const measureParagraphs = rawMeasureParagraphs
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  const securityComposite = homeSecurityIntro
    ? [
        homeSecurityIntro,
        ...measureParagraphs.map(
          (sentence) => `${S13_SECURITY_SUBITEM_MARKER}${sentence}`
        ),
      ].join('\n')
    : '';
  const securityBlock = [homeTypeSummary, securityComposite].filter(Boolean);

  if (!securityBlock.length) {
    if (!marker) return paragraphs;
    return paragraphs.filter((paragraph) => paragraph.trim() !== marker);
  }

  const blocked = new Set<string>(
    [marker, homeSecurityIntro, ...measureParagraphs, ...securityBlock].filter(Boolean)
  );
  const base = paragraphs.filter((paragraph) => !blocked.has(paragraph.trim()));
  const proofIdx = base.findIndex((paragraph) =>
    /photographic proof of the storage arrangements is attached/i.test(paragraph)
  );
  const insertAt = proofIdx >= 0 ? proofIdx + 1 : base.length;
  return [
    ...base.slice(0, insertAt),
    ...securityBlock,
    ...base.slice(insertAt),
  ];
}

function normaliseS10Paragraphs(
  paragraphs: string[],
  values: Record<string, unknown>
): string[] {
  const summary =
    typeof values.suitabilitySummary === 'string' ? values.suitabilitySummary.trim() : '';
  const S10_PARAGRAPH_MARKER = '__S10_PARAGRAPH__';
  const suitabilityParagraphs = summary
    .split(S10_PARAGRAPH_MARKER)
    .map((paragraph) => normaliseWhitespace(paragraph))
    .filter(Boolean);

  if (!suitabilityParagraphs.length) return paragraphs;

  const normalizedSummary = normaliseWhitespace(summary.replaceAll(S10_PARAGRAPH_MARKER, ' '));
  const expanded = paragraphs.flatMap((paragraph) => {
    const normalized = normaliseWhitespace(paragraph);
    if (normalized === normalizedSummary) {
      return suitabilityParagraphs;
    }
    if (paragraph.includes(S10_PARAGRAPH_MARKER)) {
      return paragraph
        .split(S10_PARAGRAPH_MARKER)
        .map((part) => normaliseWhitespace(part))
        .filter(Boolean);
    }
    return [paragraph];
  });

  return expanded;
}

function normaliseS11Paragraphs(
  paragraphs: string[],
  values: Record<string, unknown>
): string[] {
  const summary =
    typeof values.activitySummary === 'string' ? values.activitySummary.trim() : '';
  const S11_PARAGRAPH_MARKER = '__S11_PARAGRAPH__';
  const activityParagraphs = summary
    .split(S11_PARAGRAPH_MARKER)
    .map((paragraph) => normaliseWhitespace(paragraph))
    .filter(Boolean);

  if (!activityParagraphs.length) return paragraphs;

  const normalizedSummary = normaliseWhitespace(
    summary.replaceAll(S11_PARAGRAPH_MARKER, ' ')
  );
  return paragraphs.flatMap((paragraph) => {
    const normalized = normaliseWhitespace(paragraph);
    if (normalized === normalizedSummary) {
      return activityParagraphs;
    }
    if (paragraph.includes(S11_PARAGRAPH_MARKER)) {
      return paragraph
        .split(S11_PARAGRAPH_MARKER)
        .map((part) => normaliseWhitespace(part))
        .filter(Boolean);
    }
    return [paragraph];
  });
}

export function composeSection(
  sectionId: MotivationSectionId,
  context: ComposeMotivationContext
): ComposedSection | null {
  const selectorContext = buildSelectorContext(context);
  const templates = selectSectionTemplates(SENTENCE_BANK, sectionId, selectorContext);

  if (!templates.length) return null;

  const renderedTemplates = templates
    .filter((template) => hasResolvedAnnexureForTemplate(template, context))
    .map((template) => ({
      template,
      text: renderTemplate(template, buildTemplateRenderValues(template, context)),
      kind: template.kind,
    }))
    .filter((entry) => Boolean(entry.text));

  let renderedSentences = dedupeRenderedSentences(renderedTemplates);

  if (sectionId === 'S7' && isMembershipExplicitlyExcluded(context)) {
    renderedSentences = renderedSentences.filter(
      (sentence) => sentence.kind === 'sectionIntro'
    );
  }

  if (sectionId === 'S3') {
    renderedSentences = pruneS3SharedOverlap(renderedSentences);
  }

  const maxFacts = resolveMaxFactsForSection(
    sectionId,
    context.purposeType,
    selectorContext.values.applicantSex as 'female' | 'male' | 'unknown'
  );
  if (maxFacts) {
    const factParagraphs = getFactParagraphs(sectionId, context, maxFacts).filter(
      (paragraph) =>
        paragraph.usesFirearmDescription ||
        !shouldSuppressOverlappingFactParagraph(
          sectionId,
          context,
          selectorContext.values,
          paragraph.text
        )
    );
    renderedSentences = dedupeRenderedSentences([
      ...renderedSentences,
      ...factParagraphs.map((factParagraph) => ({
        text: factParagraph.usesFirearmDescription
          ? `${FIREARM_DESCRIPTION_SUBITEM_MARKER}${factParagraph.text}`
          : factParagraph.text,
        kind: getFactSentenceKind(sectionId),
      })),
    ]);
  }

  renderedSentences = pruneSectionSentenceDuplication(sectionId, renderedSentences);

  let paragraphs = assembleSectionParagraphs(sectionId, renderedSentences);
  if (sectionId === 'S8') {
    paragraphs = normaliseS8Paragraphs(paragraphs, selectorContext.values);
  } else if (sectionId === 'S10') {
    paragraphs = normaliseS10Paragraphs(paragraphs, selectorContext.values);
  } else if (sectionId === 'S11') {
    paragraphs = normaliseS11Paragraphs(paragraphs, selectorContext.values);
  } else if (sectionId === 'S13') {
    paragraphs = normaliseS13Paragraphs(paragraphs, selectorContext.values);
  }
  if (sectionId === 'S9') {
    const seenParagraphs = new Set(
      paragraphs.map((paragraph) =>
        normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase()
      )
    );
    const missingNeedSupplementParagraphs = buildS9NeedSupplementParagraphs(context).filter(
      (paragraph) =>
        !seenParagraphs.has(
          normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase()
        )
    );
    paragraphs = [...paragraphs, ...missingNeedSupplementParagraphs];
    paragraphs = insertS9ProvinceContextParagraph(
      paragraphs,
      buildS9ProvinceContextParagraph(context)
    );
  }
  if (sectionId === 'S11') {
    const seenParagraphs = new Set(
      paragraphs.map((paragraph) =>
        normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase()
      )
    );
    const missingActivityNoteParagraphs = buildS11ActivityNoteParagraphs(context).filter(
      (paragraph) =>
        !seenParagraphs.has(
          normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase()
        )
    );
    paragraphs = [...paragraphs, ...missingActivityNoteParagraphs];
    const refreshedSeenParagraphs = new Set(
      paragraphs.map((paragraph) =>
        normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase()
      )
    );
    const activityEvidenceParagraphs = buildS11ActivityEvidenceParagraphs(context).filter(
      (paragraph) =>
        !refreshedSeenParagraphs.has(
          normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase()
        )
    );
    paragraphs = [...paragraphs, ...activityEvidenceParagraphs];
    paragraphs = ensureS11MixedParticipationParagraph(context, paragraphs);
  }
  // Endorsement paragraph templates are rendered through the main sentence pipeline.
  // Do not append fallback endorsement paragraphs here, otherwise duplicate paragraphs can appear.
  if (sectionId === 'S7') {
    const seenParagraphs = new Set(
      paragraphs.map((paragraph) => normaliseWhitespace(paragraph).toLowerCase())
    );
    const membershipDeclarationParagraphs = buildS7MembershipDeclarationParagraphs(context).filter(
      (paragraph) => !seenParagraphs.has(normaliseWhitespace(paragraph).toLowerCase())
    );
    paragraphs = [...paragraphs, ...membershipDeclarationParagraphs];
    const refreshedSeenParagraphs = new Set(
      paragraphs.map((paragraph) => normaliseWhitespace(paragraph).toLowerCase())
    );
    const membershipAnnexureParagraphs = buildS7MembershipAnnexureParagraphs(context).filter(
      (paragraph) => !refreshedSeenParagraphs.has(normaliseWhitespace(paragraph).toLowerCase())
    );
    paragraphs = [...paragraphs, ...membershipAnnexureParagraphs];
  }
  if (sectionId === 'S2') {
    paragraphs = appendS2CharacterReferenceAnnexureContext(paragraphs, context);
  }

  paragraphs = groupFirearmDescriptionSubitems(sectionId, paragraphs, selectorContext.values);
  paragraphs = dedupeParagraphs(paragraphs);

  if (!paragraphs.length) return null;

  return {
    sectionId,
    title: getSectionTitle(sectionId, context),
    paragraphs,
    templates,
  };
}

function resolveMaxFactsForSection(
  sectionId: MotivationSectionId,
  purposeType: MotivationPurposeType,
  applicantSex: 'female' | 'male' | 'unknown'
): number | undefined {
  if (sectionId === 'S9') {
    return applicantSex === 'female' ? 2 : 1;
  }
  if (sectionId === 'S10') {
    return 1;
  }
  if (sectionId === 'S11') {
    if (purposeType === 'sport_shooting' || purposeType === 'mixed_hunting_sport') {
      return 8;
    }
    return 1;
  }
  if (sectionId === 'S12') {
    if (purposeType === 'sport_shooting' || purposeType === 'mixed_hunting_sport') {
      return 6;
    }
    return 2;
  }
  return undefined;
}

function ensureMixedParticipationSectionParagraph(
  context: ComposeMotivationContext,
  sections: ComposedSection[]
): ComposedSection[] {
  if (context.purposeType !== 'mixed_hunting_sport') return sections;

  const values = getComposedValues(context);
  const mixedParticipationSummary = normaliseWhitespacePreservingLineBreaks(
    `${values.participationFrequencySummary ?? ''}`
  );
  if (!mixedParticipationSummary) return sections;

  return sections.map((section) => {
    if (section.sectionId !== 'S11') return section;
    const hasParagraph = section.paragraphs.some(
      (paragraph) =>
        normaliseWhitespacePreservingLineBreaks(paragraph).toLowerCase() ===
        mixedParticipationSummary.toLowerCase()
    );
    if (hasParagraph) return section;
    return {
      ...section,
      paragraphs: [...section.paragraphs, mixedParticipationSummary],
    };
  });
}

export function composeMotivation(
  context: ComposeMotivationContext
): ComposedMotivation {
  const order = context.sectionOrder ?? DEFAULT_SECTION_ORDER;

  const sections = order
    .map((sectionId) => composeSection(sectionId, context))
    .filter((section): section is ComposedSection => Boolean(section));
  const prunedSections = pruneAdjacentSectionDuplication(sections);
  const mergedSections = mergeFirearmUsageSections(prunedSections);
  const finalSections = ensureMixedParticipationSectionParagraph(
    context,
    mergedSections
  );

  const frontMatter = buildFrontMatter(context, finalSections);
  const annexureOverview = buildAnnexureOverview(context);
  const bodySections = finalSections
    .filter((section) => section.sectionId !== 'S1' && section.sectionId !== 'S16')
  const body = renderNumberedSections(bodySections);
  const closingBlock = buildClosingBlock(context);

  const text = [frontMatter, annexureOverview, body, closingBlock]
    .filter(Boolean)
    .join('\n\n');

  return {
    sections: finalSections,
    text,
  };
}

export { DEFAULT_SECTION_ORDER, SECTION_TITLES };
