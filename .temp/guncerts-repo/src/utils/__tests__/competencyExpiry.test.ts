import { describe, expect, jest, test } from '@jest/globals';
import type { CompetencyCertificate, Firearm } from '../../data/types';
import {
  deriveCompetencyExpiryUpdates,
  getCompetencyReminderExpiryDate,
  resolveCompetencyExpiryCompCertCalc,
  resolveCompetencyExpiryDate,
  resolveCompetencyExpiryFirearmCalc,
} from '../competencyExpiry';

jest.mock('../../data/sqlite', () => ({
  listByType: jest.fn(() => []),
}));

jest.mock('../../data/repo', () => ({
  persist: jest.fn(),
  touch: <T,>(value: T) => value,
}));

const makeCertificate = (
  id: string,
  categories: CompetencyCertificate['categories'],
  issuedAt?: string,
  expiresAt?: string,
): CompetencyCertificate =>
  ({
    id,
    type: 'CompetencyCertificate',
    holderProfileId: 'profile-1',
    categories,
    issuedAt,
    expiresAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    version: 1,
  } as CompetencyCertificate);

const makeFirearm = (
  id: string,
  firearmType: Firearm['firearmType'],
  section?: string,
  validTo?: string,
): Firearm =>
  ({
    id,
    type: 'Firearm',
    holderProfileId: 'profile-1',
    firearmType,
    section,
    validTo,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    version: 1,
  } as Firearm);

const CERTS = {
  CC1: makeCertificate('CC1', ['Handgun'], '2024-01-15'),
  CC2: makeCertificate('CC2', ['Rifle'], '2024-02-20'),
  CC3: makeCertificate('CC3', ['Shotgun'], '2024-03-10'),
  CC4: makeCertificate('CC4', ['Handgun', 'Rifle'], '2024-04-01'),
  CC5: makeCertificate('CC5', ['Handgun', 'Shotgun'], '2024-05-05'),
  CC6: makeCertificate('CC6', ['Rifle', 'Shotgun'], '2024-06-06'),
  CC7: makeCertificate('CC7', ['Handgun', 'Rifle', 'Shotgun'], '2024-07-07'),
  CC8: makeCertificate('CC8', ['HandMachineCarbine'], '2024-08-08'),
  CC9: makeCertificate('CC9', ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'], '2024-09-09'),
};

const FIREARMS = {
  F1: makeFirearm('F1', 'Handgun', '13', '2029-01-15'),
  F2: makeFirearm('F2', 'Handgun', '15', '2034-01-15'),
  F3: makeFirearm('F3', 'Handgun', '16', '2035-01-15'),
  F4: makeFirearm('F4', 'Rifle', '16', '2029-02-20'),
  F5: makeFirearm('F5', 'Rifle', '15', '2034-02-20'),
  F6: makeFirearm('F6', 'Shotgun', '13', '2029-03-10'),
  F7: makeFirearm('F7', 'Shotgun', '16', '2035-03-10'),
  F8: makeFirearm('F8', 'HandMachineCarbine', '16', '2029-08-08'),
  F9: makeFirearm('F9', 'Handgun', '13'),
  F10: makeFirearm('F10', 'Rifle', '15'),
  F11: makeFirearm('F11', 'Handgun', '', '2030-01-01'),
};

type ResolveCase = {
  name: string;
  certificate: CompetencyCertificate;
  firearms: Firearm[];
  expected: string | null;
};

describe('resolveCompetencyExpiryCompCertCalc', () => {
  const cases: ResolveCase[] = [
    { name: '[2029-01-15] CC1 (H, 2024-01-15) + no firearms', certificate: CERTS.CC1, firearms: [], expected: '2029-01-15' },
    { name: '[2034-01-15] CC1 (H, 2024-01-15) + F2 (S15, H, 2034-01-15)', certificate: CERTS.CC1, firearms: [FIREARMS.F2], expected: '2034-01-15' },
    { name: '[2034-04-01] CC4 (H/R, 2024-04-01) + F5 (S15, R, 2034-02-20)', certificate: CERTS.CC4, firearms: [FIREARMS.F5], expected: '2034-04-01' },
    { name: '[2029-04-01] CC4 (H/R, 2024-04-01) + unrelated shotgun only', certificate: CERTS.CC4, firearms: [FIREARMS.F6], expected: '2029-04-01' },
    { name: '[2034-08-08] CC8 (HMC, 2024-08-08) + F8 (S16, HMC, 2029-08-08)', certificate: CERTS.CC8, firearms: [FIREARMS.F8], expected: '2034-08-08' },
    { name: '[2029-01-15] CC1 (H, 2024-01-15) + F11 (no section, H, 2030-01-01)', certificate: CERTS.CC1, firearms: [FIREARMS.F11], expected: '2029-01-15' },
    { name: '[null] missing issuedAt', certificate: makeCertificate('CC-MISSING', ['Handgun']), firearms: [], expected: null },
    { name: '[null] empty categories', certificate: makeCertificate('CC-EMPTY', [], '2024-01-15'), firearms: [FIREARMS.F1], expected: null },
  ];

  test.each(cases)('$name', ({ certificate, firearms, expected }) => {
    expect(resolveCompetencyExpiryCompCertCalc({ certificate, firearms })).toBe(expected);
  });
});

describe('resolveCompetencyExpiryFirearmCalc (soonest matching firearm validTo)', () => {
  const cases: ResolveCase[] = [
    { name: '[2029-01-15] CC1 (H, 2024-01-15) + F1 (S13, H, 2029-01-15)', certificate: CERTS.CC1, firearms: [FIREARMS.F1], expected: '2029-01-15' },
    { name: '[2029-01-15] CC1 (H, 2024-01-15) + F1/F2/F3 (soonest wins)', certificate: CERTS.CC1, firearms: [FIREARMS.F1, FIREARMS.F2, FIREARMS.F3], expected: '2029-01-15' },
    { name: '[2029-01-15] CC4 (H/R, 2024-04-01) + F1/F5 (soonest across matching categories)', certificate: CERTS.CC4, firearms: [FIREARMS.F1, FIREARMS.F5], expected: '2029-01-15' },
    { name: '[2029-01-15] CC7 (H/R/S, 2024-07-07) + F1/F5/F7 (soonest across matching categories)', certificate: CERTS.CC7, firearms: [FIREARMS.F1, FIREARMS.F5, FIREARMS.F7], expected: '2029-01-15' },
    { name: '[2029-08-08] CC8 (HMC, 2024-08-08) + F8 (S16, HMC, 2029-08-08)', certificate: CERTS.CC8, firearms: [FIREARMS.F8], expected: '2029-08-08' },
    { name: '[null] CC1 (H, 2024-01-15) + no firearms', certificate: CERTS.CC1, firearms: [], expected: null },
    { name: '[null] CC1 (H, 2024-01-15) + matching no validTo', certificate: CERTS.CC1, firearms: [FIREARMS.F9], expected: null },
    { name: '[null] empty categories', certificate: makeCertificate('CC-EMPTY-F', [], '2024-01-15'), firearms: [FIREARMS.F1], expected: null },
  ];

  test.each(cases)('$name', ({ certificate, firearms, expected }) => {
    expect(resolveCompetencyExpiryFirearmCalc({ certificate, firearms })).toBe(expected);
  });
});

describe('resolveCompetencyExpiryDate compatibility wrapper', () => {
  test('returns comp-cert calculation', () => {
    expect(resolveCompetencyExpiryDate({ certificate: CERTS.CC4, firearms: [FIREARMS.F5] })).toBe('2034-04-01');
  });
});

describe('deriveCompetencyExpiryUpdates integration scenarios', () => {
  test('CC1, CC2 with F1, F5 include comp+firearm dates', () => {
    const updates = deriveCompetencyExpiryUpdates({
      certificates: [
        makeCertificate('CC1-A', CERTS.CC1.categories, CERTS.CC1.issuedAt),
        makeCertificate('CC2-A', CERTS.CC2.categories, CERTS.CC2.issuedAt),
      ],
      firearms: [FIREARMS.F1, FIREARMS.F5],
    });

    expect(updates).toEqual([
      expect.objectContaining({
        certificate: expect.objectContaining({ id: 'CC1-A' }),
        expiresAt: '2029-01-15',
        expiresAtCompCertCalc: '2029-01-15',
        expiresAtFirearmCalc: '2029-01-15',
      }),
      expect.objectContaining({
        certificate: expect.objectContaining({ id: 'CC2-A' }),
        expiresAt: '2034-02-20',
        expiresAtCompCertCalc: '2034-02-20',
        expiresAtFirearmCalc: '2034-02-20',
      }),
    ]);
  });

  test('no matching firearm expiry sets firearm calc undefined', () => {
    const updates = deriveCompetencyExpiryUpdates({
      certificates: [
        makeCertificate('CC1-B', CERTS.CC1.categories, CERTS.CC1.issuedAt),
      ],
      firearms: [],
    });

    expect(updates).toEqual([
      expect.objectContaining({
        certificate: expect.objectContaining({ id: 'CC1-B' }),
        expiresAt: '2029-01-15',
        expiresAtCompCertCalc: '2029-01-15',
        expiresAtFirearmCalc: undefined,
      }),
    ]);
  });

  test('derive updates respects unchanged rows', () => {
    const alreadyUpToDate = makeCertificate('CC-UP', ['Handgun'], '2024-01-15', '2029-01-15');
    alreadyUpToDate.expiresAtCompCertCalc = '2029-01-15';
    alreadyUpToDate.expiresAtFirearmCalc = '2029-01-15';

    const updates = deriveCompetencyExpiryUpdates({
      certificates: [alreadyUpToDate],
      firearms: [FIREARMS.F1],
    });

    expect(updates).toEqual([]);
  });
});

describe('getCompetencyReminderExpiryDate', () => {
  test('returns soonest of dual dates', () => {
    expect(
      getCompetencyReminderExpiryDate({
        ...CERTS.CC4,
        expiresAt: '2034-04-01',
        expiresAtCompCertCalc: '2034-04-01',
        expiresAtFirearmCalc: '2029-01-15',
      } as CompetencyCertificate),
    ).toBe('2029-01-15');

    expect(
      getCompetencyReminderExpiryDate({
        ...CERTS.CC4,
        expiresAt: '2034-04-01',
        expiresAtCompCertCalc: '2034-04-01',
        expiresAtFirearmCalc: undefined,
      } as CompetencyCertificate),
    ).toBe('2034-04-01');
  });

  test('falls back to comp issue-date expiry when firearm method is selected but no firearm expiry exists', () => {
    expect(
      getCompetencyReminderExpiryDate(
        {
          ...CERTS.CC4,
          expiresAt: '2034-04-01',
          expiresAtCompCertCalc: '2029-04-01',
          expiresAtFirearmCalc: undefined,
        } as CompetencyCertificate,
        'firearmExpiry',
      ),
    ).toBe('2029-04-01');
  });
});
