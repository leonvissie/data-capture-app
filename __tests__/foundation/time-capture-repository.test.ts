import { endTimeEntry, getActiveTimeEntry, startTimeEntry } from '../../src/foundation/services/storage/timeCaptureRepository';

const mockRunAsync = jest.fn();
const mockGetFirstAsync = jest.fn();

jest.mock('../../src/foundation/services/storage/database', () => ({
  getDatabase: jest.fn(async () => ({
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
  })),
}));

describe('timeCaptureRepository', () => {
  beforeEach(() => {
    mockRunAsync.mockReset();
    mockGetFirstAsync.mockReset();
  });

  test('maps active time entry when one exists', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({
      entry_id: 'e1',
      category_id: 'c1',
      started_at: '2026-05-28T08:00:00.000Z',
      location_id: 'loc1',
    });

    const active = await getActiveTimeEntry('c1');
    expect(active).toEqual({
      entryId: 'e1',
      categoryId: 'c1',
      startedAt: '2026-05-28T08:00:00.000Z',
      locationId: 'loc1',
    });
  });

  test('writes durationStart action for start entry', async () => {
    await startTimeEntry({
      categoryId: 'c1',
      startedAt: '2026-05-28T08:00:00.000Z',
      locationId: null,
    });

    const joined = mockRunAsync.mock.calls.map((call) => String(call[0])).join('\n');
    expect(joined).toContain('durationStart');
    expect(joined).toContain('INSERT INTO entries');
  });

  test('writes durationEnd action for end entry', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ category_id: 'c1', location_id: null });
    await endTimeEntry({
      entryId: 'e1',
      endedAt: '2026-05-28T09:00:00.000Z',
      locationId: null,
    });

    const joined = mockRunAsync.mock.calls.map((call) => String(call[0])).join('\n');
    expect(joined).toContain('durationEnd');
  });
});
