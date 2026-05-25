import type { ComposedMotivation } from './composer';
import type {
  MotivationPurposeType,
  MotivationSectionId,
  MotivationSectionType,
} from './sentenceBank.types';

export interface MotivationBenchmarkRubric {
  id: string;
  label: string;
  referenceStyle: string;
  requiredSections: MotivationSectionId[];
  requiredPhrases: string[];
  forbiddenPhrases: string[];
  minimumSectionParagraphs?: Partial<Record<MotivationSectionId, number>>;
}

export interface MotivationBenchmarkResult {
  passed: boolean;
  rubric: MotivationBenchmarkRubric;
  missingSections: MotivationSectionId[];
  missingPhrases: string[];
  presentForbiddenPhrases: string[];
  paragraphFailures: Array<{
    sectionId: MotivationSectionId;
    expected: number;
    actual: number;
  }>;
}

const RUBRICS: Record<string, MotivationBenchmarkRubric> = {
  s13_self_defence: {
    id: 's13_self_defence',
    label: 'Section 13 self-defence motivation benchmark',
    referenceStyle:
      'Reference examples foreground lawful self-defence need, personal-risk context, suitability, safe storage, and a formal conclusion.',
    requiredSections: ['S1', 'S3', 'S9', 'S10', 'S11', 'S13', 'S15'],
    requiredPhrases: [
      'self-defence',
      'personal safety',
      'lawful personal protection',
      'stored in a compliant safe',
    ],
    forbiddenPhrases: [
      'dedicated status',
      'organised sport shooting activities',
    ],
    minimumSectionParagraphs: {
      S3: 2,
      S9: 2,
      S10: 2,
      S11: 2,
    },
  },
  s15_hunting: {
    id: 's15_hunting',
    label: 'Section 15 hunting motivation benchmark',
    referenceStyle:
      'Reference examples foreground hunting purpose, firearm background, comparison against existing firearms, hunting use detail, suitability, and safe storage.',
    requiredSections: ['S1', 'S3', 'S4', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S15'],
    requiredPhrases: [
      'hunting',
      'lawful purpose',
      'current firearms',
      'practical hunting purpose',
      'stored in a compliant safe',
    ],
    forbiddenPhrases: [
      'self-defence',
      'dedicated status relevant to this application',
    ],
    minimumSectionParagraphs: {
      S3: 2,
      S8: 2,
      S9: 1,
      S10: 2,
      S12: 2,
    },
  },
  s16_sport_shooting: {
    id: 's16_sport_shooting',
    label: 'Section 16 sport shooting motivation benchmark',
    referenceStyle:
      'Reference examples foreground dedicated status, background and lawful participation, comparison to existing firearms, dedicated need, technical suitability, and annexure-backed support.',
    requiredSections: ['S1', 'S3', 'S4', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S15'],
    requiredPhrases: [
      'sport shooting',
      'member in good standing',
      'dedicated status',
      'current firearms',
      'stored in a compliant safe',
    ],
    forbiddenPhrases: [
      'personal safety risks must be taken seriously',
      'lawful self-defence',
    ],
    minimumSectionParagraphs: {
      S3: 2,
      S8: 2,
      S9: 1,
      S10: 2,
      S11: 2,
      S12: 2,
    },
  },
  s16_hunting: {
    id: 's16_hunting',
    label: 'Section 16 hunting motivation benchmark',
    referenceStyle:
      'Reference examples foreground dedicated status, hunting background, specific hunting use, technical suitability, and annexure-backed support.',
    requiredSections: ['S1', 'S3', 'S4', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S15'],
    requiredPhrases: [
      'dedicated',
      'hunting',
      'member in good standing',
      'current firearms',
      'stored in a compliant safe',
    ],
    forbiddenPhrases: [
      'lawful self-defence',
      'personal safety risks must be taken seriously',
    ],
    minimumSectionParagraphs: {
      S3: 2,
      S8: 2,
      S9: 1,
      S10: 2,
      S11: 2,
      S12: 2,
    },
  },
};

export function getMotivationBenchmarkRubric(input: {
  sectionType: MotivationSectionType;
  purposeType: MotivationPurposeType;
}): MotivationBenchmarkRubric | null {
  const key = `${input.sectionType}_${input.purposeType}`;
  return RUBRICS[key] ?? null;
}

export function evaluateMotivationAgainstBenchmark(input: {
  sectionType: MotivationSectionType;
  purposeType: MotivationPurposeType;
  motivation: ComposedMotivation;
  requiresComparison?: boolean;
}): MotivationBenchmarkResult | null {
  const rubric = getMotivationBenchmarkRubric(input);
  if (!rubric) return null;

  const requiredSections = input.requiresComparison === false
    ? rubric.requiredSections.filter((sectionId) => sectionId !== 'S8')
    : rubric.requiredSections;
  const minimumSectionParagraphs = input.requiresComparison === false
    ? Object.fromEntries(
        Object.entries(rubric.minimumSectionParagraphs ?? {}).filter(
          ([sectionId]) => sectionId !== 'S8'
        )
      )
    : rubric.minimumSectionParagraphs;

  const sectionIds = input.motivation.sections.map((section) => section.sectionId);
  const lowerText = input.motivation.text.toLowerCase();

  const missingSections = requiredSections.filter(
    (sectionId) => !sectionIds.includes(sectionId)
  );

  const missingPhrases = rubric.requiredPhrases.filter(
    (phrase) => !lowerText.includes(phrase.toLowerCase())
  );

  const presentForbiddenPhrases = rubric.forbiddenPhrases.filter((phrase) =>
    lowerText.includes(phrase.toLowerCase())
  );

  const paragraphFailures = Object.entries(minimumSectionParagraphs ?? {})
    .map(([sectionId, expected]) => {
      const actual =
        input.motivation.sections.find((section) => section.sectionId === sectionId)
          ?.paragraphs.length ?? 0;
      return {
        sectionId: sectionId as MotivationSectionId,
        expected: expected as number,
        actual,
      };
    })
    .filter((entry) => entry.actual < entry.expected);

  return {
    passed:
      missingSections.length === 0 &&
      missingPhrases.length === 0 &&
      presentForbiddenPhrases.length === 0 &&
      paragraphFailures.length === 0,
    rubric,
    missingSections,
    missingPhrases,
    presentForbiddenPhrases,
    paragraphFailures,
  };
}
