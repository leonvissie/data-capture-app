import { createCompetencyCertificate, createFirearm } from '../data/defaults';
import type { ApplicationMatrixScenario, MatrixDocumentInput } from './applicationMatrix';

const BASE_DATE = '2026-03-12T00:00:00.000Z';
const PROFILE_ID = 'matrix-profile';

const isoDateFromOffset = (days: number) => {
  const date = new Date(BASE_DATE);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const firearm = (
  id: string,
  section: string,
  firearmType: 'Handgun' | 'Rifle' | 'Shotgun',
  validToOffsetDays: number,
) =>
  createFirearm(PROFILE_ID, {
    id,
    section,
    firearmType,
    validTo: isoDateFromOffset(validToOffsetDays),
    isCurrent: true,
  });

const competency = (
  id: string,
  categories: Array<'Handgun' | 'Rifle' | 'Shotgun'>,
  issuedOffsetDays: number,
  licenceTypes?: string[],
) =>
  createCompetencyCertificate(PROFILE_ID, categories, {
    id,
    issuedAt: isoDateFromOffset(issuedOffsetDays),
    expiresAt: isoDateFromOffset(365),
    licenceTypes,
    isCurrent: true,
  });

const membership = (
  id: string,
  membershipExpiryOffsetDays: number,
  associationLetterIssueOffsetDays: number,
  includeDedicated = true,
) => ({
  id,
  type: 'Membership' as const,
  associationName: 'NSA',
  holderProfileId: PROFILE_ID,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  schemaVersion: 1,
  version: 1,
  enrolledAt: isoDateFromOffset(-365),
  membershipExpiresAt: isoDateFromOffset(membershipExpiryOffsetDays),
  membershipDocumentIds: [
    {
      kind: 'ASSOCIATION_LETTER' as const,
      documentId: `${id}-letter`,
      issueDate: isoDateFromOffset(associationLetterIssueOffsetDays),
    },
    ...(includeDedicated
      ? [
          {
            kind: 'DEDICATED_SPORT_CERT' as const,
            documentId: `${id}-dedicated`,
            issueDate: isoDateFromOffset(-10),
          },
        ]
      : []),
  ],
});

const docs517g = (): MatrixDocumentInput[] => [
  { kind: 'COMPETENCY_CERT' },
  { kind: 'ID_BOOK' },
  { kind: 'PROOF_OF_ADDRESS' },
  { kind: 'PHOTO' },
];

const docs518a = (): MatrixDocumentInput[] => [
  { kind: 'COMPETENCY_CERT' },
  { kind: 'FIREARM_LICENCE' },
  { kind: 'SAFE' },
  { kind: 'ID_BOOK' },
  { kind: 'PROOF_OF_ADDRESS' },
  { kind: 'PHOTO' },
];

export const SAMPLE_APPLICATION_MATRIX_SCENARIOS: ApplicationMatrixScenario[] = [
  {
    id: 'profile-01',
    label: '518a optional membership warnings',
    form: '518a',
    now: BASE_DATE,
    licenceType: '1.4',
    proofOfAddressDate: isoDateFromOffset(-71),
    documents: docs518a(),
    declarations: [
      'CONVICTED',
      'FIT_TO_POSSESS',
      'CARRY_SAFELY',
      'MOUNTED_SAFE',
      'INTERPRETER',
      'NOMINEE',
      'LITERATE',
      'LIABILITY',
    ],
    userToSubmitMotivation: true,
    selectedFirearms: [firearm('f-01', '15', 'Handgun', 30)],
    selectedCertificates: [competency('c-01', ['Handgun'], -100, ['1.1'])],
    selectedMemberships: [membership('m-01', 20, -71)],
  },
  {
    id: 'profile-02',
    label: '518a section 16 missing membership',
    form: '518a',
    now: BASE_DATE,
    licenceType: '1.5',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs518a(),
    declarations: [
      'CONVICTED',
      'FIT_TO_POSSESS',
      'CARRY_SAFELY',
      'MOUNTED_SAFE',
      'INTERPRETER',
      'NOMINEE',
      'LITERATE',
      'LIABILITY',
    ],
    userToSubmitMotivation: true,
    selectedFirearms: [firearm('f-02', '16', 'Rifle', 120)],
    selectedCertificates: [competency('c-02', ['Rifle'], -200, ['1.5'])],
  },
  {
    id: 'profile-03',
    label: '518a expired membership',
    form: '518a',
    now: BASE_DATE,
    licenceType: '1.5',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs518a(),
    declarations: [
      'CONVICTED',
      'FIT_TO_POSSESS',
      'CARRY_SAFELY',
      'MOUNTED_SAFE',
      'INTERPRETER',
      'NOMINEE',
      'LITERATE',
      'LIABILITY',
    ],
    userToSubmitMotivation: true,
    selectedFirearms: [firearm('f-03', '16', 'Rifle', 120)],
    selectedCertificates: [competency('c-03', ['Rifle'], -200, ['1.5'])],
    selectedMemberships: [membership('m-03', -1, -10)],
  },
  {
    id: 'profile-04',
    label: '518a expired membership document',
    form: '518a',
    now: BASE_DATE,
    licenceType: '1.5',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs518a(),
    declarations: [
      'CONVICTED',
      'FIT_TO_POSSESS',
      'CARRY_SAFELY',
      'MOUNTED_SAFE',
      'INTERPRETER',
      'NOMINEE',
      'LITERATE',
      'LIABILITY',
    ],
    userToSubmitMotivation: true,
    selectedFirearms: [firearm('f-04', '16', 'Shotgun', 120)],
    selectedCertificates: [competency('c-04', ['Shotgun'], -200, ['1.5'])],
    selectedMemberships: [membership('m-04', 200, -91)],
  },
  {
    id: 'profile-05',
    label: '518a section count limit',
    form: '518a',
    now: BASE_DATE,
    licenceType: '1.4',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs518a(),
    declarations: [
      'CONVICTED',
      'FIT_TO_POSSESS',
      'CARRY_SAFELY',
      'MOUNTED_SAFE',
      'INTERPRETER',
      'NOMINEE',
      'LITERATE',
      'LIABILITY',
    ],
    userToSubmitMotivation: true,
    selectedFirearms: [
      firearm('f-05a', '13', 'Handgun', 60),
      firearm('f-05b', '13', 'Handgun', 90),
    ],
    selectedCertificates: [competency('c-05', ['Handgun'], -200, ['1.1'])],
  },
  {
    id: 'profile-06',
    label: '517g clean baseline',
    form: '517g',
    now: BASE_DATE,
    licenceType: '1.1',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs517g(),
    declarations: ['INTERPRETER', 'NOMINEE', 'LITERATE', 'LIABILITY'],
    selectedCertificates: [competency('c-06', ['Handgun'], -200, ['1.1'])],
  },
  {
    id: 'profile-07',
    label: '517g missing declarations',
    form: '517g',
    now: BASE_DATE,
    licenceType: '1.1',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs517g(),
    declarations: ['INTERPRETER', 'NOMINEE'],
    selectedCertificates: [competency('c-07', ['Handgun'], -200, ['1.1'])],
  },
  {
    id: 'profile-08',
    label: '517g duplicate and expired competency warnings',
    form: '517g',
    now: BASE_DATE,
    licenceType: '1.1',
    proofOfAddressDate: isoDateFromOffset(-20),
    documents: docs517g(),
    declarations: ['INTERPRETER', 'NOMINEE', 'LITERATE', 'LIABILITY'],
    selectedCertificates: [competency('c-08', ['Handgun'], -200, ['1.1'])],
    hasSubmittedCompetency: true,
    hasExpiredCompetency: true,
  },
];
