import { describe, expect, jest, test } from '@jest/globals';
import { appConfig } from '../../config/appConfig';
import { aggregateDocumentFreshness, getDateFreshness } from '../documentFreshness';

describe('document freshness', () => {
  test('returns warning when date age is above warning threshold', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    const result = getDateFreshness('2026-01-01', appConfig.documentFreshness.proofOfAddress);
    expect(result.status).toBe('warning');
    expect(result.ageDays).toBe(71);
    jest.useRealTimers();
  });

  test('returns expired when date age is above expiry threshold', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    const result = getDateFreshness('2025-12-01', appConfig.documentFreshness.proofOfAddress);
    expect(result.status).toBe('expired');
    jest.useRealTimers();
  });

  test('aggregate freshness picks the most severe state', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    const result = aggregateDocumentFreshness([
      { id: 'a', date: '2026-03-01', rule: appConfig.documentFreshness.associationMembership },
      { id: 'b', date: '2026-01-01', rule: appConfig.documentFreshness.associationLetter },
    ]);
    expect(result.status).toBe('warning');
    expect(result.warningIds).toEqual(['b']);
    jest.useRealTimers();
  });
});
