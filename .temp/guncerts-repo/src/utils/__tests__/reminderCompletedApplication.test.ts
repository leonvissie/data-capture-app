import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Application } from '../../data/types';
import {
  buildReminderCompletedListRoute,
  prepareReminderCompletedApplication,
} from '../reminderCompletedApplication';

const mockResolveTerminalReminderApplications = jest.fn();

jest.mock('../reminderApplicationResolution', () => ({
  resolveTerminalReminderApplications: (...args: any[]) => mockResolveTerminalReminderApplications(...args),
}));

const makeApplication = (
  id: string,
  form: '517g' | '518a',
  status: Application['status'],
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
  } as Application);

describe('prepareReminderCompletedApplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns a direct ready-actions route for a single submitted match', () => {
    const application = makeApplication('app-1', '517g', 'submitted');
    mockResolveTerminalReminderApplications.mockReturnValue({
      kind: 'single',
      form: '517g',
      itemType: 'competency',
      itemId: 'cert-1',
      applications: [application],
    });

    const result = prepareReminderCompletedApplication('competency', 'cert-1', '/(tabs)/profile?scroll=competency');

    expect(result.kind).toBe('single');
    if (result.kind !== 'single') throw new Error('Expected single');
    expect(result.application.id).toBe('app-1');
    expect(result.route.pathname).toBe('/application/[id]/ready-actions');
    expect(result.route.params.id).toBe('app-1');
    expect(result.route.params.listPath).toBeUndefined();
    expect(result.route.params.hideHome).toBe('1');
  });

  test('returns multiple when more than one terminal match exists', () => {
    mockResolveTerminalReminderApplications.mockReturnValue({
      kind: 'multiple',
      form: '518a',
      itemType: 'firearm',
      itemId: 'f-1',
      applications: [
        makeApplication('submitted-1', '518a', 'submitted'),
        makeApplication('archived-1', '518a', 'archived'),
      ],
    });

    const result = prepareReminderCompletedApplication('firearm', 'f-1', '/(tabs)/firearms?scroll=firearms');

    expect(result.kind).toBe('multiple');
    if (result.kind !== 'multiple') throw new Error('Expected multiple');
    expect(result.applications).toHaveLength(2);
  });

  test('returns none when no completed application exists', () => {
    mockResolveTerminalReminderApplications.mockReturnValue({
      kind: 'none',
      form: '517g',
      itemType: 'competency',
      itemId: 'cert-1',
      applications: [],
    });

    const result = prepareReminderCompletedApplication('competency', 'cert-1', '/(tabs)');

    expect(result.kind).toBe('none');
    if (result.kind !== 'none') throw new Error('Expected none');
    expect(result.form).toBe('517g');
  });

  test('buildReminderCompletedListRoute creates an origin-aware list route', () => {
    const route = buildReminderCompletedListRoute('archived', '/(tabs)/firearms?scroll=firearms');
    expect(route.pathname).toBe('/application/archive');
    expect(route.params.hideHome).toBe('1');
    expect(typeof route.params.nav).toBe('string');
  });
});
