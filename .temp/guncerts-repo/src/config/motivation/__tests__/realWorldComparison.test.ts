import { describe, expect, test } from '@jest/globals';

import { composeMotivation } from '../composer';
import { evaluateMotivationAgainstBenchmark } from '../benchmarkRubric';
import { compareMotivationToReference } from '../referenceComparison';
import { resolveEvidenceFromDocState } from '../evidenceResolver';
import type { ApplicationDocState, DocumentKind, PolicyDocumentKind } from '../../../data/types';

const SHOULD_PRINT_REVIEW_OUTPUT = process.env.MOTIVATION_REVIEW === '1';

type RealWorldFixture = {
  id: string;
  label: string;
  applicationType: 'new' | 'renewal';
  sectionType: 's13' | 's15' | 's16';
  purposeType: 'self_defence' | 'hunting' | 'sport_shooting';
  requirementCodes: string[];
  uploadedDocumentKinds: DocumentKind[];
  values: Record<string, unknown>;
  referenceAnchors: string[];
  minimumAnchorCoverage: number;
};

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
    applicationId: 'app-real-world-1' as ApplicationDocState['applicationId'],
    policy: {
      form: '518a',
      version: 'test',
    },
    requirements: requirementCodes.map((code) => REQUIREMENT_CATALOG_518A[code]),
    documents: uploadedDocumentKinds.map((kind, index) => ({
      requirementCode: findRequirementCodeForKind(requirementCodes, kind),
      documentId: `doc-real-${index + 1}`,
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

const FIXTURES: RealWorldFixture[] = [
  {
    id: 'reference_s16_hunting_22lr',
    label: 'Reference-derived section 16 .22LR hunting motivation',
    applicationType: 'new',
    sectionType: 's16',
    purposeType: 'hunting',
    requirementCodes: [
      'COMPETENCY_CERT',
      'PROFICIENCY_RIFLE',
      'ASSOCIATION_LETTER',
      'DEDICATED_HUNTER_CERT',
      'FIREARM_ENDORSEMENT',
      'SAFES',
    ],
    uploadedDocumentKinds: [
      'COMPETENCY_CERT',
      'PROFICIENCY_RIFLE',
      'ASSOCIATION_LETTER',
      'DEDICATED_HUNTER_CERT',
      'FIREARM_ENDORSEMENT',
      'SAFE',
    ],
    values: {
      applicationType: 'new',
      sectionType: 's16',
      purposeType: 'hunting',
      applicantFullName: 'Applicant Alpha',
      occupation: 'IT business owner',
      associationName: 'NHSA',
      firearmMake: 'Winchester',
      firearmModel: 'Rimfire Hunter',
      firearmCalibre: '.22 LR',
      firearmSerialNumber: 'ANON22001',
      firearmType: 'rifle',
      firearmAction: 'bolt_action',
      needSummary:
        'I require this rifle for dedicated hunting of small game and game birds in circumstances where a lighter-recoiling, short-range platform is appropriate.',
      firearmExperienceSummary:
        'I have accumulated practical hunting and firearm-handling experience over time, including field use relevant to the ethical taking of small game.',
      ownershipHistorySummary:
        'I have handled and stored firearms lawfully and responsibly and remain aware of the obligations attached to their safe use.',
      motivationProfile: {
        version: 1,
        applicantContext: {
          occupation: 'IT business owner',
          residenceProvince: 'GP',
          yearsOfFirearmExperience: 20,
        },
        needProfile: {
          reasonTags: ['dedicated_hunting', 'ethical_hunting', 'platform_fit'],
        },
        existingComparison: {
          comparisonEntries: [
            {
              firearmId: 'cmp-hunt-1',
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
      },
      residenceSecuritySummary:
        'My residence is protected by perimeter security, security gates, and an alarm system.',
      competencyCategories: ['rifle'],
      trainingProviderName: 'Accredited Hunting Training Provider',
      requiresComparison: true,
    },
    referenceAnchors: [
      'dedicated hunting',
      'small game',
      'guineafowl',
      'bushveld',
      'open sights',
      '50 metres',
    ],
    minimumAnchorCoverage: 0.5,
  },
  {
    id: 'reference_s13_new_application',
    label: 'Reference-derived section 13 self-defence motivation',
    applicationType: 'new',
    sectionType: 's13',
    purposeType: 'self_defence',
    requirementCodes: ['COMPETENCY_CERT', 'PROFICIENCY_HANDGUN', 'SAFES'],
    uploadedDocumentKinds: ['COMPETENCY_CERT', 'PROFICIENCY_HANDGUN', 'SAFE'],
    values: {
      applicationType: 'new',
      sectionType: 's13',
      purposeType: 'self_defence',
      applicantFullName: 'Applicant Bravo',
      occupation: 'Retired professional',
      firearmMake: 'Vektor',
      firearmModel: 'P1',
      firearmCalibre: '9mm',
      firearmSerialNumber: 'ANON9MM01',
      firearmType: 'handgun',
      firearmAction: 'pistol',
      needSummary:
        'I require a firearm for self-defence because I am advanced in age and cannot rely on physical resistance in the event of a violent attack.',
      selfDefenceContextSummary:
        'I live with my spouse and, given our age and vulnerability, we are particularly concerned about housebreaking, robbery, and hijacking.',
      suitabilitySummary:
        'The handgun is suitable for lawful personal protection as a practical defensive platform for immediate use.',
      participationFrequencySummary:
        'I maintain familiarity with safe handling, lawful readiness, and secure storage so that any use remains controlled and confined to genuine self-defence.',
      residenceSecuritySummary:
        'My residence is protected by perimeter security, gates, and monitored alarms.',
      competencyCategories: ['handgun'],
      trainingProviderName: 'Accredited Firearms Training Provider',
      province: 'GP',
      applicantSex: 'male',
    },
    referenceAnchors: [
      'self-defence',
      'violent attack',
      'housebreaking',
      'robbery',
      'hijacking',
      'advanced in age',
    ],
    minimumAnchorCoverage: 0.5,
  },
  {
    id: 'reference_s16_sport_from_afrikaans',
    label: 'Reference-derived section 16 sport shooting motivation',
    applicationType: 'new',
    sectionType: 's16',
    purposeType: 'sport_shooting',
    requirementCodes: [
      'COMPETENCY_CERT',
      'PROFICIENCY_RIFLE',
      'ASSOCIATION_LETTER',
      'DEDICATED_SPORT_CERT',
      'FIREARM_ENDORSEMENT',
      'SAFES',
    ],
    uploadedDocumentKinds: [
      'COMPETENCY_CERT',
      'PROFICIENCY_RIFLE',
      'ASSOCIATION_LETTER',
      'DEDICATED_SPORT_CERT',
      'FIREARM_ENDORSEMENT',
      'SAFE',
    ],
    values: {
      applicationType: 'new',
      sectionType: 's16',
      purposeType: 'sport_shooting',
      applicantFullName: 'Applicant Charlie',
      occupation: 'Accountant',
      associationName: 'SAJWV',
      firearmMake: 'BSA',
      firearmModel: 'Target',
      firearmCalibre: '.222 Rem',
      firearmSerialNumber: 'ANON22201',
      firearmType: 'rifle',
      firearmAction: 'bolt_action',
      needSummary:
        'I require the rifle for sport shooting and regular range participation in a platform suited to lawful organised shooting activities.',
      activitySummary:
        'I participate in organised sport shooting activities and continue to train regularly as part of my dedicated sporting involvement.',
      firearmExperienceSummary:
        'I have longstanding practical experience with firearms, including junior training exposure and range participation over many years.',
      ownershipHistorySummary:
        'I remain familiar with responsible firearm use and the obligations attached to secure possession and lawful participation.',
      participationFrequencySummary:
        'I train regularly throughout the year and attend organised club activities when my work schedule permits.',
      sportContextSummary:
        'The rifle will be used in lawful club-level sport shooting and regular training participation.',
      suitabilitySummary:
        'The rifle is suitable for the intended sport shooting purpose due to its platform, controllability, and practical fit for organised range use.',
      residenceSecuritySummary:
        'My residence is protected by perimeter security, locked access points, and an alarm system.',
      competencyCategories: ['rifle'],
      trainingProviderName: 'Accredited Firearms Training Provider',
      requiresComparison: true,
      inadequacySummary:
        'The firearms presently available to me do not adequately fulfil the same sport shooting role served by this rifle.',
    },
    referenceAnchors: [
      'dedicated status',
      'sport shooting',
      'club',
      'range',
      'training',
      'member in good standing',
    ],
    minimumAnchorCoverage: 0.66,
  },
];

describe('motivation real-world comparison', () => {
  test.each(FIXTURES)('$id', (fixture) => {
    const resolvedEvidence = resolveEvidence(
      fixture.requirementCodes,
      fixture.uploadedDocumentKinds
    );
    const result = composeMotivation({
      applicationType: fixture.applicationType,
      sectionType: fixture.sectionType,
      purposeType: fixture.purposeType,
      evidenceKeys: resolvedEvidence.evidenceKeys,
      resolvedEvidence,
      values: fixture.values,
    });

    const benchmark = evaluateMotivationAgainstBenchmark({
      sectionType: fixture.sectionType,
      purposeType: fixture.purposeType,
      motivation: result,
    });
    const comparison = compareMotivationToReference({
      referenceId: fixture.id,
      motivation: result,
      anchors: fixture.referenceAnchors,
    });

    if (SHOULD_PRINT_REVIEW_OUTPUT) {
      console.log(`\n===== ${fixture.label} =====\n`);
      console.log(
        `Benchmark: ${benchmark?.passed ? 'pass' : 'fail'} | Anchor coverage: ${comparison.matchedAnchors.length}/${fixture.referenceAnchors.length}`
      );
      console.log(`Matched anchors: ${comparison.matchedAnchors.join(', ') || 'none'}`);
      console.log(`Missing anchors: ${comparison.missingAnchors.join(', ') || 'none'}`);
      console.log('');
      console.log(result.text);
    }

    expect(benchmark).not.toBeNull();
    expect(benchmark?.passed).toBe(true);
    expect(comparison.matchedCoverage).toBeGreaterThanOrEqual(
      fixture.minimumAnchorCoverage
    );
  });
});
