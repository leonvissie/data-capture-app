import { describe, expect, test } from '@jest/globals';

import {
  deriveSexFromSaId,
  normalizeSaIdNumber,
  resolveApplicantSex,
} from '../saIdentity';

describe('saIdentity', () => {
  test('normalizes SA ID input to 13 digits', () => {
    expect(normalizeSaIdNumber('820615 5678 084')).toBe('8206155678084');
  });

  test('derives female from SA ID sequence below 5000', () => {
    expect(deriveSexFromSaId('8206154678084')).toBe('female');
  });

  test('derives male from SA ID sequence 5000 or above', () => {
    expect(deriveSexFromSaId('8206155678084')).toBe('male');
  });

  test('returns unknown when the SA ID is incomplete', () => {
    expect(deriveSexFromSaId('8206155678')).toBe('unknown');
  });

  test('prefers explicit applicant sex when provided', () => {
    expect(
      resolveApplicantSex({
        idType: 'PASSPORT',
        idNumber: 'A1234567',
        applicantSex: 'female',
      }),
    ).toBe('female');
  });

  test('returns unknown for passport cases without explicit applicant sex', () => {
    expect(
      resolveApplicantSex({
        idType: 'PASSPORT',
        idNumber: 'A1234567',
      }),
    ).toBe('unknown');
  });

  test('derives applicant sex from SA ID when no explicit value is present', () => {
    expect(
      resolveApplicantSex({
        idType: 'ID_CARD',
        idNumber: '8206155678084',
      }),
    ).toBe('male');
  });

  test('prefers SA ID derivation over a stale explicit value for non-passport cases', () => {
    expect(
      resolveApplicantSex({
        idType: 'ID_CARD',
        idNumber: '8206155678084',
        applicantSex: 'female',
      }),
    ).toBe('male');
  });
});
