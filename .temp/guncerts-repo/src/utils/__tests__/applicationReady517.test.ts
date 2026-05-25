import { describe, expect, jest, test } from '@jest/globals';
import type { Application, Profile, Proficiency } from '../../data/types';
import { computeDocumentReadiness } from '../applicationReady';

const mockGetById: any = jest.fn((..._args: any[]) => undefined);
const mockListByType: any = jest.fn((..._args: any[]) => []);

jest.mock('../../data/sqlite', () => ({
  getById: (...args: any[]) => mockGetById(args[0]),
  listByType: (...args: any[]) => mockListByType(args[0]),
}));

jest.mock('../../pdf/context', () => ({
  resolveApplicationFirearms: () => [],
  resolveEffectiveMembershipIds: () => [],
}));

const baseMeta = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  schemaVersion: 4,
};

function makeProfile(): Profile {
  return {
    id: 'profile-1',
    type: 'Profile',
    givenNames: 'Test',
    surname: 'User',
    initials: 'TU',
    idType: 'ID_CARD',
    idNumber: '9001015000080',
    references: [{ relationshipCategory: 'spouse', fullNames: 'Spouse Person', idNumber: '9001015000081' }],
    maritalStatus: 'married',
    employment: {
      tradeOrProfession: 'Engineer',
      selfEmployedDetail: '',
      employerName: 'Company',
      employerAddress: {
        line1: 'Line 1',
        postCode: '0001',
      } as any,
    },
    ...baseMeta,
  } as Profile;
}

function makeApplication(docKinds: string[] = []): Application {
  return {
    id: 'app-1',
    type: 'Application',
    form: '517',
    status: 'draft',
    applicantProfileId: 'profile-1',
    declarations: ['INTERPRETER', 'MINOR', 'LITERATE', 'LIABILITY'],
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
    docs: {
      applicationId: 'app-1',
      policy: {
        form: '517',
        version: 'test',
      },
      requirements: [],
      documents: docKinds.map((kind, index) => ({
        requirementCode: kind,
        kind: kind as any,
        documentId: `doc-${index + 1}`,
        source: { type: 'Application' },
      })),
    },
    form517: {
      sectionD: { possessFirearmCompetencies: ['Handgun'] },
      sectionG: {
        passedActTest: true,
        passedPracticalTraining: true,
        trainingFirearmTypes: ['Pistol'],
      },
      sectionH: {
        h1TrainingCertificateConfirmed: true,
        h2TrainingInstitutionName: 'Trainer Name',
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
  } as Application;
}

function makeProficiency(overrides: Partial<Proficiency> = {}): Proficiency {
  return {
    id: 'prof-1',
    type: 'Proficiency',
    trainingProviderName: 'Provider',
    holderProfileId: 'profile-1',
    proficiencyDocumentIds: [],
    ...baseMeta,
    ...overrides,
  } as Proficiency;
}

describe('computeDocumentReadiness for 517', () => {
  test('does not include removed aggregate training/result cards in readiness message', () => {
    mockGetById.mockReturnValue(makeProfile());
    const result = computeDocumentReadiness({
      application: makeApplication(),
      acknowledgementItems: [],
      shouldBypassValidation: false,
    });

    expect(result.ready).toBe(false);
    const message = result.message ?? '';
    expect(message).not.toContain('Training certificates');
    expect(message).not.toContain('PFTC/SASSETA results');
  });

  test('is not ready when proficiency entry is not selected', () => {
    mockGetById.mockImplementation((id: string) => {
      if (id === 'profile-1') return makeProfile();
      if (id === 'prof-1') {
        return makeProficiency({
          proficiencyDocumentIds: [
            { kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE', documentId: 'doc-k' },
            { kind: 'PROFICIENCY_HANDGUN', documentId: 'doc-p' },
            { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1', documentId: 'doc-h1', categories: ['Handgun'] },
          ],
        });
      }
      return undefined;
    });
    const result = computeDocumentReadiness({
      application: makeApplication([
        'ID_CARD',
        'PROOF_OF_ADDRESS',
      ]),
      acknowledgementItems: [],
      shouldBypassValidation: false,
    });

    expect(result.ready).toBe(false);
    expect(result.message ?? '').toContain('Select at least one proficiency entry');
  });

  test('clears category-linked proficiency blockers when required docs are present', () => {
    mockGetById.mockImplementation((id: string) => {
      if (id === 'profile-1') return makeProfile();
      if (id === 'prof-1') {
        return makeProficiency({
          proficiencyDocumentIds: [
            { kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE', documentId: 'doc-k' },
            { kind: 'PROFICIENCY_HANDGUN', documentId: 'doc-p' },
            { kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1', documentId: 'doc-h1', categories: ['Handgun'] },
          ],
        });
      }
      return undefined;
    });
    const app = makeApplication([
      'ID_CARD',
      'PROOF_OF_ADDRESS',
    ]);
    app.proficiencyIds = ['prof-1'];
    const result = computeDocumentReadiness({
      application: app,
      acknowledgementItems: [],
      shouldBypassValidation: true,
    });

    const message = result.message ?? '';
    expect(message).not.toContain('Select at least one proficiency entry');
    expect(message).not.toContain('Statement of results: Knowledge of the Firearms Control');
    expect(message).not.toContain('Proficiency required for Handgun');
    expect(message).not.toContain('Handle and use results required for Handgun');
  });
});
