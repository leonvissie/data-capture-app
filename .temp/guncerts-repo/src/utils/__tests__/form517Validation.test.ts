import { describe, expect, test } from '@jest/globals';
import type { Application, Profile } from '../../data/types';
import { validateForm517Readiness } from '../form517Validation';

const baseMeta = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  schemaVersion: 4,
};

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    type: 'Profile',
    givenNames: 'Test',
    surname: 'User',
    initials: 'TU',
    idNumber: '9001015000080',
    references: [{ relationshipCategory: 'spouse', fullNames: 'Spouse Person', idNumber: '9001015000081' }],
    employment: {
      tradeOrProfession: 'Engineer',
      selfEmployedDetail: '',
      employerName: 'Company',
      employerAddress: {
        singleLine: '',
        postCode: '0001',
        line1: 'Line 1',
        line2: '',
        suburb: 'Suburb',
        city: 'City',
        province: '',
        homeType: undefined,
        securityMeasures: [],
      },
    },
    maritalStatus: 'married',
    ...baseMeta,
    ...overrides,
  } as Profile;
}

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    type: 'Application',
    form: '517',
    status: 'draft',
    declarations: [],
    firearms: [],
    safeIds: [],
    selectedFirearmIds: [],
    membershipIds: [],
    proficiencyIds: [],
    supportingStatementIds: [],
    competencyCertificateIds: [],
    renewalCategories: [],
    renewalSelections: [],
    requireMembership: false,
    form517: {
      sectionD: {
        possessFirearmCompetencies: ['Handgun'],
      },
      sectionG: {
        passedActTest: true,
        passedPracticalTraining: true,
        trainingFirearmTypes: ['Pistol'],
        competencyContext: 'new',
      },
      sectionH: {
        h1TrainingCertificateConfirmed: true,
        h2TrainingInstitutionName: 'Trainer',
        h3TrainingCertificateSerial: 'ABC123',
        h4TrainingCertificateDateIssued: '2026-01-01',
        h5ConvictionsConfirmed: false,
        h6PendingCasesConfirmed: false,
        h7LostStolenConfirmed: false,
        h8NegligenceCaseConfirmed: false,
        h9DeclaredUnfitConfirmed: false,
        h10ConfiscationConfirmed: false,
        h11ProtectionOrderAnswer: 'no',
        h12DeniedLicenceAnswer: 'no',
        h13SuicideDepressionSubstanceAnswer: 'no',
        h14DiagnosedTreatedAnswer: 'no',
        h15DivorceSeparationViolenceAnswer: 'no',
        h16ForcedJobLossAnswer: 'no',
      },
    },
    ...baseMeta,
    ...overrides,
  } as Application;
}

describe('validateForm517Readiness', () => {
  test('returns ready when 517 required sections are complete', () => {
    const result = validateForm517Readiness(makeApplication(), makeProfile());
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test('returns missing items when data is incomplete', () => {
    const application = makeApplication({
      form517: {
        sectionD: { possessFirearmCompetencies: [] },
        sectionG: { trainingFirearmTypes: [] },
        sectionH: { h1TrainingCertificateConfirmed: false } as any,
      },
    });
    const profile = makeProfile({ references: [], employment: undefined, maritalStatus: undefined });
    const result = validateForm517Readiness(application, profile);
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('D.4 competencies');
    expect(result.missing).toContain('H.5 convictions confirmation');
  });
});
