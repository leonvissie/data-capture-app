import { describe, expect, test } from '@jest/globals';

import { composeMotivation } from '../composer';
import { evaluateMotivationAgainstBenchmark } from '../benchmarkRubric';
import { resolveEvidenceFromDocState } from '../evidenceResolver';
import { deriveMotivationEvidenceKeys } from '../signalResolver';
import type { ApplicationDocState, DocumentKind, PolicyDocumentKind } from '../../../data/types';

const SHOULD_PRINT_REVIEW_OUTPUT = process.env.MOTIVATION_REVIEW === '1';

function printCase(
  title: string,
  context: Record<string, unknown>,
  result: ReturnType<typeof composeMotivation>
) {
  if (!SHOULD_PRINT_REVIEW_OUTPUT) return;

  console.log(`\n===== ${title} REVIEW =====\n`);
  const structuredSummary =
    typeof context.structuredInputSummary === 'string'
      ? context.structuredInputSummary
      : '';
  if (structuredSummary) {
    console.log(`Structured Input: ${structuredSummary}\n`);
  }
  console.log('Sections:');
  for (const section of result.sections) {
    console.log(
      `- ${section.sectionId} ${section.title ?? ''} (${section.paragraphs.length} paragraph${
        section.paragraphs.length === 1 ? '' : 's'
      })`
    );
  }
  console.log('');
  console.log(result.text);
}

function expectBenchmarkPass(input: {
  sectionType: 's13' | 's15' | 's16';
  purposeType: 'self_defence' | 'hunting' | 'sport_shooting' | 'mixed_hunting_sport';
  result: ReturnType<typeof composeMotivation>;
}) {
  const benchmark = evaluateMotivationAgainstBenchmark({
    sectionType: input.sectionType,
    purposeType: input.purposeType,
    motivation: input.result,
  });

  expect(benchmark).not.toBeNull();
  expect(benchmark?.missingSections).toEqual([]);
  expect(benchmark?.missingPhrases).toEqual([]);
  expect(benchmark?.presentForbiddenPhrases).toEqual([]);
  expect(benchmark?.paragraphFailures).toEqual([]);
  expect(benchmark?.passed).toBe(true);
}

const REQUIREMENT_CATALOG_518A: Record<
  string,
  ApplicationDocState['requirements'][number]
> = {
  COMPETENCY_CERT: {
    code: 'COMPETENCY_CERT',
    required: true,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'COMPETENCY_CERT', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'C',
    copies: 1,
    min: 1,
    scope: 'perCertificate',
  },
  FIREARM_LICENCE: {
    code: 'FIREARM_LICENCE',
    required: true,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'FIREARM_LICENCE', numberOfSides: 2 }] as PolicyDocumentKind[],
    annexure: 'B',
    copies: 1,
    min: 1,
    scope: 'perFirearm',
  },
  ASSOCIATION_MEMBERSHIP: {
    code: 'ASSOCIATION_MEMBERSHIP',
    required: false,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'ASSOCIATION_MEMBERSHIP', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'G',
    copies: 1,
    min: 1,
  },
  ASSOCIATION_LETTER: {
    code: 'ASSOCIATION_LETTER',
    required: true,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'ASSOCIATION_LETTER', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'G',
    copies: 1,
    min: 1,
  },
  DEDICATED_SPORT_CERT: {
    code: 'DEDICATED_SPORT_CERT',
    required: true,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'DEDICATED_SPORT_CERT', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'G',
    copies: 1,
    min: 1,
  },
  DEDICATED_HUNTER_CERT: {
    code: 'DEDICATED_HUNTER_CERT',
    required: true,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'DEDICATED_HUNTER_CERT', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'G',
    copies: 1,
    min: 1,
  },
  PROFICIENCY_HANDGUN: {
    code: 'PROFICIENCY_HANDGUN',
    required: false,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'PROFICIENCY_HANDGUN', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'J',
    copies: 1,
    min: 1,
  },
  PROFICIENCY_RIFLE: {
    code: 'PROFICIENCY_RIFLE',
    required: false,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'PROFICIENCY_RIFLE', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'J',
    copies: 1,
    min: 1,
  },
  SAFES: {
    code: 'SAFES',
    required: true,
    requireUpload: true,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'SAFE', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'F',
    copies: 1,
    min: 1,
    scope: 'perSafe',
  },
  FIREARM_ENDORSEMENT: {
    code: 'FIREARM_ENDORSEMENT',
    required: false,
    requireUpload: false,
    isSupportingDocument: true,
    isChecklistItem: true,
    documentKinds: [{ kind: 'FIREARM_ENDORSEMENT', numberOfSides: 1 }] as PolicyDocumentKind[],
    annexure: 'H',
    copies: 1,
    min: 1,
    scope: 'perFirearm',
  },
};

function findRequirementCodeForKind(
  requirementCodes: string[],
  kind: DocumentKind
): string {
  for (const requirementCode of requirementCodes) {
    const requirement = REQUIREMENT_CATALOG_518A[requirementCode];
    const requirementKinds = requirement?.documentKinds?.map((entry) => entry.kind) ?? [];
    if (requirementKinds.includes(kind)) return requirementCode;
  }

  return requirementCodes[0] ?? '';
}

function makeDocState(
  requirementCodes: string[],
  uploadedDocumentKinds: DocumentKind[],
): ApplicationDocState {
  return {
    applicationId: 'app-test-1' as ApplicationDocState['applicationId'],
    policy: {
      form: '518a',
      version: 'test',
    },
    requirements: requirementCodes.map((code) => {
      const requirement = REQUIREMENT_CATALOG_518A[code];
      if (!requirement) {
        throw new Error(`Unsupported test requirement code: ${code}`);
      }

      return requirement;
    }),
    documents: uploadedDocumentKinds.map((kind, index) => ({
      requirementCode: findRequirementCodeForKind(requirementCodes, kind),
      documentId: `doc-${index + 1}`,
      kind,
      source: {
        type: 'Application',
      },
    })),
  };
}

function resolveEvidence(
  requirementCodes: string[],
  uploadedDocumentKinds: DocumentKind[],
) {
  return resolveEvidenceFromDocState(
    makeDocState(requirementCodes, uploadedDocumentKinds),
  );
}

function getSectionParagraphs(
  result: ReturnType<typeof composeMotivation>,
  sectionId: string,
) {
  return result.sections.find((section) => section.sectionId === sectionId)?.paragraphs;
}

describe('motivation composer', () => {
  test('derives activity participation from declared activity without uploaded evidence', () => {
    const result = composeMotivation({
      applicationType: 'renewal',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      evidenceKeys: [
        'competency_certificate',
        'proficiency_certificate',
        'association_membership',
        'dedicated_status',
      ],
      values: {
        applicationType: 'renewal',
        sectionType: 's16',
        purposeType: 'sport_shooting',
        applicantFullName: 'Jordan Example',
        associationName: 'NSA',
        firearmMake: 'CZ',
        firearmModel: '457',
        firearmCalibre: '.22LR',
        firearmSerialNumber: 'CZ457001',
        firearmType: 'rifle',
        firearmAction: 'bolt_action',
        activitySummary:
          'I participate in organised sport shooting activities and continue to train regularly.',
        sportContextSummary:
          'The firearm is used in regular sport shooting participation and training.',
        needSummary:
          'I require the firearm in order to continue my sporting participation.',
        suitabilitySummary:
          'The firearm remains suitable for the discipline and training context in which I use it.',
      },
    });

    expect(
      deriveMotivationEvidenceKeys({
        values: {
          activitySummary:
            'I participate in organised sport shooting activities and continue to train regularly.',
        },
        evidenceKeys: ['competency_certificate'],
      }),
    ).toContain('activity_participation');
    expect(result.text).not.toContain(
      'The need for the firearm arises directly from the applicant’s actual dedicated activities.',
    );
    expect(result.text).toContain(
      'My actual and intended dedicated activities are relevant to the present application and are summarised below.',
    );
    expect(result.text).not.toContain(
      'The applicant’s participation is further supported by the activity material attached to this application.',
    );
  });

  test('includes stronger activity-evidence wording only when activity evidence is present', () => {
    const result = composeMotivation({
      applicationType: 'renewal',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      evidenceKeys: [
        'competency_certificate',
        'proficiency_certificate',
        'association_membership',
        'dedicated_status',
        'activity_report',
      ],
      values: {
        applicationType: 'renewal',
        sectionType: 's16',
        purposeType: 'sport_shooting',
        applicantFullName: 'Jordan Example',
        associationName: 'NSA',
        firearmMake: 'CZ',
        firearmModel: '457',
        firearmCalibre: '.22LR',
        firearmSerialNumber: 'CZ457001',
        firearmType: 'rifle',
        firearmAction: 'bolt_action',
        activitySummary:
          'I participate in organised sport shooting activities and continue to train regularly.',
        sportContextSummary:
          'The firearm is used in regular sport shooting participation and training.',
        needSummary:
          'I require the firearm in order to continue my sporting participation.',
        suitabilitySummary:
          'The firearm remains suitable for the discipline and training context in which I use it.',
      },
    });

    expect(result.text).not.toContain(
      'The applicant’s participation is further supported by the activity material attached at the relevant annexures.',
    );
  });

  test('suppresses participation-specific section 16 wording when no participation signal exists', () => {
    const result = composeMotivation({
      applicationType: 'renewal',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      evidenceKeys: [
        'competency_certificate',
        'proficiency_certificate',
        'association_membership',
        'dedicated_status',
      ],
      values: {
        applicationType: 'renewal',
        sectionType: 's16',
        purposeType: 'sport_shooting',
        applicantFullName: 'Jordan Example',
        associationName: 'NSA',
        firearmMake: 'CZ',
        firearmModel: '457',
        firearmCalibre: '.22LR',
        firearmSerialNumber: 'CZ457001',
        firearmType: 'rifle',
        firearmAction: 'bolt_action',
        needSummary:
          'I require the firearm in order to continue my sporting participation.',
        suitabilitySummary:
          'The firearm remains suitable for the discipline and training context in which I use it.',
      },
    });

    expect(result.text).not.toContain(
      'This application is brought in terms of SECTION 16 for SPORT SHOOTING, and is supported by the applicant’s dedicated status and lawful participation in the relevant activities.',
    );
    expect(result.text).not.toContain(
      'The need for the firearm arises directly from the applicant’s actual dedicated activities.',
    );
    expect(result.text).not.toContain(
      'The applicant’s participation is further supported by the activity material attached to this application.',
    );
  });

  test('derives motivation summaries from structured motivation profile input', () => {
    const values = {
      applicationType: 'renewal',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      applicantFullName: 'Jordan Example',
      associationName: 'NSA',
      firearmMake: 'CZ',
      firearmModel: '457',
      firearmCalibre: '.22LR',
      firearmSerialNumber: 'CZ457001',
      firearmType: 'rifle',
      firearmAction: 'bolt_action',
      motivationProfile: {
        version: 1,
        applicantContext: {
          occupation: 'Consultant',
          residenceProvince: 'GP',
          yearsOfFirearmExperience: 12,
        },
        needProfile: {
          reasonTags: ['dedicated_sport', 'training_continuity', 'platform_fit'],
        },
        existingComparison: {
          comparisonEntries: [
            {
              firearmId: 'cmp-1',
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
      },
      structuredInputSummary:
        'Firearm experience: 12 years | Disciplines: precision rimfire shooting and club-level competition',
    };

    const result = composeMotivation({
      applicationType: 'renewal',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      evidenceKeys: [
        'competency_certificate',
        'proficiency_certificate',
        'association_membership',
        'dedicated_status',
      ],
      values,
    });
    printCase('S16 Structured', values, result);

    expect(result.text).toContain(
      'I participate in precision rimfire shooting and club-level competition approximately 18 training or participation sessions per year.',
    );
    expect(result.text).toContain(
      'I require the firearm in order to continue participating properly, lawfully, and effectively in sport shooting, with due regard to sport shooting, continued training and participation, and practical platform suitability.',
    );
    expect(result.text).toContain(
      'My existing firearms, including Glock 19 handgun in calibre 9mm, do not adequately fulfil the role of the firearm applied for.',
    );
    expect(result.text).toContain(
      'Glock 19 handgun in calibre 9mm, which serves a different primary lawful role, remains limited by discipline-specific limitations and training-fit limitations.',
    );
    expect(result.text).toContain(
      'It remains primarily configured for lawful self-defence rather than rimfire precision training.',
    );
    expect(result.text).toContain(
      'The firearm is suitable for the intended dedicated purpose due to manageable recoil, practical accuracy, economical ammunition use, and regular training suitability.',
    );
    expect(result.text).toContain(
      'The firearm will be used in sport shooting activities focused on precision rimfire shooting and club-level competition.',
    );
  });

  test('composes the section 16 renewal sport shooting case', () => {
    const resolvedEvidence = resolveEvidence(
      [
        'COMPETENCY_CERT',
        'PROFICIENCY_RIFLE',
        'ASSOCIATION_LETTER',
        'DEDICATED_SPORT_CERT',
        'FIREARM_ENDORSEMENT',
        'FIREARM_LICENCE',
        'SAFES',
      ],
      [
        'COMPETENCY_CERT',
        'PROFICIENCY_RIFLE',
        'ASSOCIATION_LETTER',
        'DEDICATED_SPORT_CERT',
        'FIREARM_ENDORSEMENT',
        'FIREARM_LICENCE',
        'SAFE',
      ],
    );
    const result = composeMotivation({
      applicationType: 'renewal',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      evidenceKeys: resolvedEvidence.evidenceKeys,
      resolvedEvidence,
      values: {
        applicationType: 'renewal',
        sectionType: 's16',
        purposeType: 'sport_shooting',
        applicantFullName: 'John Example',
        occupation: 'IT professional',
        associationName: 'SAHGCA',
        firearmMake: 'Smith & Wesson',
        firearmModel: 'M&P15-22 Sport',
        firearmCalibre: '.22LR',
        firearmSerialNumber: 'ABC123456',
        firearmType: 'rifle',
        firearmAction: 'semi_automatic',
        useSummary:
          'The firearm remains in regular lawful use for sport shooting activities and related training.',
        needSummary:
          'I require the firearm in order to continue participating properly, lawfully, and effectively in the sport shooting activities relevant to this application.',
        suitabilitySummary:
          'The firearm is suitable for the intended sport shooting purpose due to its platform, calibre, reliability, and practical fit for the relevant activities.',
        inadequacySummary:
          'The firearms presently available to me do not adequately serve the specific practical requirements of the sport shooting role fulfilled by this firearm.',
        continuedNeedSummary:
          'The firearm remains suitable for the purpose for which it is licensed and continues to be required for that lawful purpose.',
        activitySummary:
          'I participate in organised sport shooting activities and intend to continue such participation regularly.',
        firearmExperienceSummary:
          'I have been involved in lawful firearm use and structured shooting activities for many years, and I have developed practical experience with rifles used for training and dedicated participation.',
        ownershipHistorySummary:
          'The firearm has remained lawfully licensed to me and under my personal control, and I have continued to comply with the obligations attaching to its possession and use.',
        participationFrequencySummary:
          'I train regularly throughout the year and participate in organised shoots and range sessions whenever my work schedule permits.',
        existingFirearmOverlapSummary:
          'Although I already possess other firearms, they do not fulfil the same sport shooting role, platform characteristics, and practice requirements served by this rifle.',
        sportDisciplineSummary:
          'The rifle is used in practice-focused sport shooting activities where controllability, low recoil, and repeated accurate shot placement are relevant to lawful training and participation.',
        sportContextSummary:
          'The firearm will continue to be used for sport shooting activities, training, and participation consistent with my dedicated status.',
        safeDescription:
          'The firearm is stored in a compliant safe securely installed at my residence.',
        residenceSecuritySummary:
          'My residence is protected by perimeter security, security gates, burglar bars, and an alarm system.',
        competencyCategories: ['handgun', 'rifle', 'shotgun'],
        trainingProviderName: 'Accredited Firearms Training Provider',
        requiresComparison: true,
      },
    });
    printCase('S16', {}, result);

    expect(result.sections.map((section) => section.sectionId)).toEqual(
      expect.arrayContaining(['S1', 'S7', 'S13', 'S16']),
    );
    expect(getSectionParagraphs(result, 'S1')).toHaveLength(1);
    expect(getSectionParagraphs(result, 'S3')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S9')).toHaveLength(1);
    expect(getSectionParagraphs(result, 'S10')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S11')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S12')).toHaveLength(2);
    expect(result.text).toContain(
      'I have been involved in lawful firearm use and structured shooting activities for many years, and I have developed practical experience with rifles used for training and dedicated participation.',
    );
    expect(result.text).not.toContain(
      'Although I already possess other firearms, they do not fulfil the same sport shooting role, platform characteristics, and practice requirements served by this rifle.',
    );
    expect(result.text).toContain(
      'A .22LR rifle is commonly well suited to sport shooting and training use because it allows repeated practice, manageable recoil, economical ammunition use, and consistent handling in disciplines built around precision and repetition.',
    );
    expect(result.text).toContain(
      'By way of illustration, this kind of rifle is commonly used for regular range practice, introductory and club-level competition, and shorter-range precision-oriented activities where recoil management and sustained repetition are important.',
    );
    expect(result.text).not.toContain(
      'The selected calibre is widely used for sport shooting and training because it allows regular practice, manageable recoil, and practical consistency in disciplines where precision and repetition are important.',
    );
    expect(result.text).toContain(
      'The firearm is required for sport shooting, and will be used in the manner described in this motivation.',
    );
    expect(result.text).toContain('Annexure B');
    expect(result.text).toContain('Annexure H');
    expect(result.text).toContain(
      'The licence documentation relating to the applicant’s existing firearm appears from Annexure B.',
    );
    expect(result.text).not.toContain(
      'The applicant’s membership and participation in the relevant sport shooting structures support the bona fides of the application.',
    );
    expect(result.text).not.toContain(
      'The need for the firearm arises from the applicant’s intended and/or ongoing participation in sport shooting activities for which the firearm is practically suited.',
    );
    expect(result.text).not.toContain(
      'The firearm is stored in a compliant safe securely installed at my residence.',
    );
    expect(result.text).toContain(
      'Smith & Wesson M&P15-22 Sport Semi Automatic Rifle, calibre .22LR, serial number ABC123456',
    );
    expectBenchmarkPass({
      sectionType: 's16',
      purposeType: 'sport_shooting',
      result,
    });
  });

  test('composes the section 15 new hunting case', () => {
    const resolvedEvidence = resolveEvidence(
      [
        'COMPETENCY_CERT',
        'PROFICIENCY_RIFLE',
        'SAFES',
      ],
      [
        'COMPETENCY_CERT',
        'PROFICIENCY_RIFLE',
        'SAFE',
      ],
    );
    const result = composeMotivation({
      applicationType: 'new',
      sectionType: 's15',
      purposeType: 'hunting',
      evidenceKeys: resolvedEvidence.evidenceKeys,
      resolvedEvidence,
      values: {
        applicationType: 'new',
        sectionType: 's15',
        purposeType: 'hunting',
        applicantFullName: 'Jane Example',
        occupation: 'Business owner',
        associationName: 'Natshoot',
        firearmMake: 'Ruger',
        firearmModel: 'American',
        firearmCalibre: '.308 Win',
        firearmSerialNumber: 'RUG308001',
        firearmType: 'rifle',
        firearmAction: 'bolt_action',
        useSummary:
          'The firearm is required for hunting activities in terrain and conditions for which my existing firearms are not ideally suited.',
        needSummary:
          'I require the firearm in order to pursue hunting activities in a practical, suitable, and responsible manner.',
        suitabilitySummary:
          'The firearm is suitable for the intended hunting purpose due to its calibre, platform, and practical fit for the expected terrain and game profile.',
        inadequacySummary:
          'My current firearms do not adequately serve the practical hunting purpose for which this application is made, particularly in relation to suitability and intended field use.',
        activitySummary:
          'I hunt lawfully on an occasional basis and intend to continue doing so in suitable and responsible circumstances.',
        firearmExperienceSummary:
          'I have accumulated practical hunting and firearm-handling experience over time, including range practice and field use relevant to the purpose for which this rifle is sought.',
        ownershipHistorySummary:
          'My existing firearms have been kept and used lawfully, and I remain familiar with the responsibilities associated with safe possession, transport, and use in the field.',
        participationFrequencySummary:
          'I attend hunting trips and practice sessions on a recurring basis during the year, with regular range time to maintain accuracy and safe firearm handling.',
        existingFirearmOverlapSummary:
          'The firearms presently available to me overlap only partially with the role contemplated here and do not offer the same practical suitability for the hunting conditions and intended field use described in this application.',
        huntingEnvironmentSummary:
          'The rifle is intended for hunting in typical bushveld and mixed-field conditions where practical shot placement, manageable recoil, and appropriate field carry remain important.',
        huntingContextSummary:
          'The firearm will be used for hunting in terrain and conditions where the selected calibre and platform are appropriate to the intended game and field requirements.',
        safeDescription:
          'The firearm will be stored in a compliant safe securely fixed at my residence.',
        residenceSecuritySummary:
          'My residence has perimeter security, locked access points, and an alarm system.',
        competencyCategories: ['rifle', 'shotgun'],
        trainingProviderName: 'Accredited Hunting and Firearms Training Provider',
        requiresComparison: true,
      },
    });
    printCase('S15', {}, result);

    expect(result.sections.map((section) => section.sectionId)).toEqual(
      expect.arrayContaining(['S1', 'S8', 'S11', 'S15']),
    );
    expect(getSectionParagraphs(result, 'S3')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S8')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S9')).toHaveLength(1);
    expect(getSectionParagraphs(result, 'S10')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S12')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S11')).toHaveLength(1);
    expect(result.text).toContain(
      'I have accumulated practical hunting and firearm-handling experience over time, including range practice and field use relevant to the purpose for which this rifle is sought.',
    );
    expect(result.text).not.toContain(
      'The firearms presently available to me overlap only partially with the role contemplated here and do not offer the same practical suitability for the hunting conditions and intended field use described in this application.',
    );
    expect(result.text).toContain(
      'A .308-class rifle is commonly regarded as a practical and versatile hunting choice because it balances effective field performance, manageable recoil, and dependable accuracy across a broad range of hunting situations.',
    );
    expect(result.text).toContain(
      'By way of illustration, this type of calibre and platform is commonly used for medium-sized plains game and general field hunting where reliable shot placement, ordinary hunting distances, and humane effectiveness remain important considerations.',
    );
    expect(result.text).not.toContain(
      'The selected calibre is widely used for hunting due to its versatility, effectiveness, and suitability for a broad range of game and terrain conditions.',
    );
    expect(result.text).toContain(
      'The firearm is required for hunting, and will be used in the manner described in this motivation.',
    );
    expect(result.text).toContain('Annexure J');
    expect(result.text).toContain(
      'Photographic proof of the storage arrangements is attached at Annexure F.',
    );
    expect(result.text).not.toContain(
      'The firearm will be used for hunting in terrain and conditions where the selected calibre and platform are appropriate to the intended game and field requirements.',
    );
    expect(result.text).toContain(
      'Ruger American Bolt Action Rifle, calibre .308 Win, serial number RUG308001',
    );
    expectBenchmarkPass({
      sectionType: 's15',
      purposeType: 'hunting',
      result,
    });
  });

  test('composes the section 13 new self-defence case', () => {
    const resolvedEvidence = resolveEvidence(
      ['COMPETENCY_CERT', 'PROFICIENCY_HANDGUN', 'SAFES'],
      ['COMPETENCY_CERT', 'PROFICIENCY_HANDGUN', 'SAFE'],
    );
    const result = composeMotivation({
      applicationType: 'new',
      sectionType: 's13',
      purposeType: 'self_defence',
      evidenceKeys: resolvedEvidence.evidenceKeys,
      resolvedEvidence,
      values: {
        applicationType: 'new',
        sectionType: 's13',
        purposeType: 'self_defence',
        applicantFullName: 'Alex Example',
        occupation: 'Consultant',
        firearmMake: 'Glock',
        firearmModel: '19',
        firearmCalibre: '9mm',
        firearmSerialNumber: 'GLK190001',
        firearmType: 'handgun',
        firearmAction: 'pistol',
        applicantSex: 'female',
        province: 'GP',
        useSummary:
          'The firearm is required for lawful self-defence in circumstances where personal safety risks are real and ongoing.',
        needSummary:
          'I require a firearm for the purpose of self-defence due to a real and ongoing risk to my personal safety.',
        suitabilitySummary:
          'The firearm is suitable for lawful personal protection due to its size, practicality, and appropriateness for defensive use.',
        selfDefenceContextSummary:
          'My work and travel patterns regularly expose me to environments in which personal safety risks must be taken seriously, and immediate lawful means of protection may be required.',
        crimeStatsSummary:
          'National and provincial crime trends, including violent crime and robbery patterns, reinforce the reasonableness of maintaining lawful means of self-defence.',
        ownershipHistorySummary:
          'I have previously handled and stored firearms lawfully and responsibly, and I remain acutely aware of the responsibilities attached to possession for self-defence purposes.',
        participationFrequencySummary:
          'I maintain regular familiarity with safe handling, secure storage, and lawful readiness so that any use of the firearm remains controlled, responsible, and confined to genuine self-defence.',
        safeDescription:
          'The firearm will be stored in a compliant safe when not under my direct control.',
        residenceSecuritySummary:
          'My residence is protected by perimeter security, security gates, and monitored alarm systems.',
        competencyCategories: ['handgun'],
        trainingProviderName: 'Accredited Firearms Training Provider',
        requiresComparison: false,
      },
    });
    printCase('S13', {}, result);

    expect(result.sections.map((section) => section.sectionId)).toEqual(
      expect.arrayContaining(['S1', 'S3', 'S9', 'S13', 'S15']),
    );
    expect(result.sections.map((section) => section.sectionId)).not.toContain('S7');
    expect(getSectionParagraphs(result, 'S3')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S9')).toHaveLength(3);
    expect(getSectionParagraphs(result, 'S10')).toHaveLength(2);
    expect(getSectionParagraphs(result, 'S11')).toHaveLength(2);
    expect(result.text).toContain('Annexure J');
    expect(result.text).toContain(
      'The supporting documentation relied upon in this application appears from Annexure C, Annexure F, and Annexure J.',
    );
    expect(result.text).toContain(
      '44 540 contact crimes in Gauteng between October and December 2025',
    );
    expect(result.text).toContain(
      'As South Africa’s most densely populated province, Gauteng continues to experience high levels of violent and aggravated crime, especially in metropolitan areas.',
    );
    expect(result.text).toContain('138 ransom-related kidnappings in Gauteng');
    expect(result.text).toContain(
      '14 547 sexual offences nationally between October and December 2025',
    );
    expect(result.text).not.toContain('223 truck hijackings in Gauteng');
    expect(result.text).toContain(
      'I maintain regular familiarity with safe handling, secure storage, and lawful readiness so that any use of the firearm remains controlled, responsible, and confined to genuine self-defence.',
    );
    expect(result.text).toContain(
      'A 9mm-class handgun is widely regarded as a practical choice for lawful self-defence because it offers manageable recoil, controllable follow-up shooting, and practical everyday portability in a defensive platform.',
    );
    expect(result.text).not.toContain(
      'A 9mm handgun configuration is widely accepted as suitable for lawful self-defence because it combines practical portability, manageable recoil, and dependable defensive capability in a platform intended for immediate lawful protection.',
    );
    expect(result.text).not.toContain(
      'The firearm will be possessed and used solely for lawful self-defence and will remain subject to responsible storage, handling, and control at all times.',
    );
    expect(result.text).toContain(
      'The firearm is required for self-defence, and will be used in the manner described in this motivation.',
    );
    expect(result.text).toContain(
      'Glock 19 Pistol Handgun, calibre 9mm, serial number GLK190001',
    );
    expectBenchmarkPass({
      sectionType: 's13',
      purposeType: 'self_defence',
      result,
    });
  });
});
