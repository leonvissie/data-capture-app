import { describe, expect, jest, test } from '@jest/globals';
import type { Application, CompetencyCertificate, Firearm } from '../../data/types';
import {
  resolveActiveReminderApplications,
  resolveTerminalReminderApplications,
} from '../reminderApplicationResolution';

const mockListByType = jest.fn();

jest.mock('../../data/sqlite', () => ({
  listByType: (...args: any[]) => mockListByType(...args),
}));

const makeApplication = (
  id: string,
  form: '517g' | '518a',
  status: Application['status'],
  overrides: Partial<Application> = {}
): Application =>
  ({
    id,
    type: 'Application',
    form,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    version: 1,
    ...overrides,
  } as Application);

const makeFirearm = (id: string, holderProfileId = 'profile-1'): Firearm =>
  ({
    id,
    type: 'Firearm',
    holderProfileId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    version: 1,
  } as Firearm);

const makeCertificate = (id: string, holderProfileId = 'profile-1'): CompetencyCertificate =>
  ({
    id,
    type: 'CompetencyCertificate',
    holderProfileId,
    categories: ['Handgun'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    version: 1,
  } as CompetencyCertificate);

describe('reminder application resolution', () => {
  test('returns a single active firearm renewal when exactly one matching 518a draft/ready exists', () => {
    mockListByType.mockImplementation((...args: any[]) => {
      const [type] = args as [string];
      if (type !== 'Application') return [];
      return [
        makeApplication('a1', '518a', 'draft', { selectedFirearmIds: ['f-1'] }),
        makeApplication('a2', '518a', 'ready', { selectedFirearmIds: ['f-2'] }),
        makeApplication('a3', '517g', 'draft', { competencyCertificateIds: ['c-1'] }),
      ];
    });

    const result = resolveActiveReminderApplications('firearm', 'f-1');

    expect(result.kind).toBe('single');
    expect(result.form).toBe('518a');
    expect(result.applications.map((app) => app.id)).toEqual(['a1']);
  });

  test('returns multiple active competency renewals in newest-first order when more than one 517g matches', () => {
    mockListByType.mockImplementation((...args: any[]) => {
      const [type] = args as [string];
      if (type !== 'Application') return [];
      return [
        makeApplication('older', '517g', 'draft', {
          competencyCertificateIds: ['c-1'],
          updatedAt: '2026-01-10T00:00:00.000Z',
        }),
        makeApplication('newer', '517g', 'ready', {
          competencyCertificateIds: ['c-1'],
          updatedAt: '2026-02-10T00:00:00.000Z',
        }),
        makeApplication('ignored-status', '517g', 'submitted', {
          competencyCertificateIds: ['c-1'],
          updatedAt: '2026-03-10T00:00:00.000Z',
        }),
      ];
    });

    const result = resolveActiveReminderApplications('competency', 'c-1');

    expect(result.kind).toBe('multiple');
    expect(result.form).toBe('517g');
    expect(result.applications.map((app) => app.id)).toEqual(['newer', 'older']);
  });

  test('returns no active match when the right form exists but does not include the requested item', () => {
    mockListByType.mockImplementation((...args: any[]) => {
      const [type] = args as [string];
      if (type !== 'Application') return [];
      return [
        makeApplication('a1', '518a', 'draft', { selectedFirearmIds: ['f-2'] }),
        makeApplication('a2', '518a', 'ready', { selectedFirearmIds: ['f-3'] }),
      ];
    });

    const result = resolveActiveReminderApplications('firearm', 'f-1');

    expect(result.kind).toBe('none');
    expect(result.form).toBe('518a');
    expect(result.applications).toEqual([]);
  });

  test('returns a single terminal firearm renewal when a submitted or archived 518a contains the item', () => {
    mockListByType.mockImplementation((...args: any[]) => {
      const [type] = args as [string];
      if (type !== 'Application') return [];
      return [
        makeApplication('submitted-1', '518a', 'submitted', { selectedFirearmIds: ['f-1'] }),
        makeApplication('draft-1', '518a', 'draft', { selectedFirearmIds: ['f-1'] }),
      ];
    });

    const result = resolveTerminalReminderApplications('firearm', 'f-1');

    expect(result.kind).toBe('single');
    expect(result.applications.map((app) => app.id)).toEqual(['submitted-1']);
  });

  test('uses the same effective-id semantics as terminal highlighting when selections are implicit via a single profile item', () => {
    mockListByType.mockImplementation((...args: any[]) => {
      const [type] = args as [string];
      if (type === 'Application') {
        return [
          makeApplication('terminal-1', '517g', 'archived', {
            applicantProfileId: 'profile-1',
            competencyCertificateIds: [],
          }),
        ];
      }
      if (type === 'CompetencyCertificate') {
        return [makeCertificate('c-implicit', 'profile-1')];
      }
      return [];
    });

    const result = resolveTerminalReminderApplications('competency', 'c-implicit');

    expect(result.kind).toBe('single');
    expect(result.applications.map((app) => app.id)).toEqual(['terminal-1']);
  });

  test('can resolve implicit firearm selection through a single profile firearm on an active 518a', () => {
    mockListByType.mockImplementation((...args: any[]) => {
      const [type] = args as [string];
      if (type === 'Application') {
        return [
          makeApplication('active-1', '518a', 'ready', {
            applicantProfileId: 'profile-1',
            selectedFirearmIds: undefined,
            firearms: undefined,
          }),
        ];
      }
      if (type === 'Firearm') {
        return [makeFirearm('f-implicit', 'profile-1')];
      }
      return [];
    });

    const result = resolveActiveReminderApplications('firearm', 'f-implicit');

    expect(result.kind).toBe('single');
    expect(result.applications.map((app) => app.id)).toEqual(['active-1']);
  });
});
