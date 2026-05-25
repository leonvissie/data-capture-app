import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Application, Profile } from '../../data/types';
import { prepareReminderRenewalDocuments } from '../reminderRenewalDocuments';

const mockResolveActiveReminderApplications = jest.fn();
const mockGetFirstProfile = jest.fn();
const mockCreateApplication = jest.fn();
const mockPersist = jest.fn();
const mockSeedDocsFor = jest.fn();
const mockLinkExistingProfileProofs = jest.fn();
const mockBuildDocumentsRoute = jest.fn();

jest.mock('../reminderApplicationResolution', () => ({
  resolveActiveReminderApplications: (...args: any[]) => mockResolveActiveReminderApplications(...args),
}));

jest.mock('../../data/sqlite', () => ({
  getFirstProfile: (...args: any[]) => mockGetFirstProfile(...args),
}));

jest.mock('../../data/defaults', () => ({
  createApplication: (...args: any[]) => mockCreateApplication(...args),
}));

jest.mock('../../data/repo', () => ({
  persist: (...args: any[]) => mockPersist(...args),
}));

jest.mock('../../config/docSeed', () => ({
  seedDocsFor: (...args: any[]) => mockSeedDocsFor(...args),
}));

jest.mock('../profileProofs', () => ({
  linkExistingProfileProofs: (...args: any[]) => mockLinkExistingProfileProofs(...args),
}));

jest.mock('../../navigation/helpers', () => ({
  buildDocumentsRoute: (...args: any[]) => mockBuildDocumentsRoute(...args),
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

const makeProfile = (): Profile =>
  ({
    id: 'profile-1',
    type: 'Profile',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    version: 1,
  } as Profile);

describe('prepareReminderRenewalDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens an existing active renewal when exactly one match exists', () => {
    const application = makeApplication('app-1', '518a', 'draft');
    mockResolveActiveReminderApplications.mockReturnValue({
      kind: 'single',
      form: '518a',
      itemType: 'firearm',
      itemId: 'f-1',
      applications: [application],
    });
    mockBuildDocumentsRoute.mockReturnValue({ pathname: '/application/[id]/documents', params: { id: 'app-1' } });

    const result = prepareReminderRenewalDocuments('firearm', 'f-1', '/(tabs)');

    expect(result.kind).toBe('openedExisting');
    if (result.kind !== 'openedExisting') throw new Error('Expected openedExisting');
    expect(result.application.id).toBe('app-1');
    expect(mockCreateApplication).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  test('creates and seeds a new renewal when no active match exists', () => {
    const profile = makeProfile();
    const createdApp = makeApplication('app-new', '517g', 'draft');
    const docsState = { applicationId: 'app-new', policy: { form: '517g', version: '1' }, requirements: [] } as any;

    mockResolveActiveReminderApplications.mockReturnValue({
      kind: 'none',
      form: '517g',
      itemType: 'competency',
      itemId: 'c-1',
      applications: [],
    });
    mockGetFirstProfile.mockReturnValue(profile);
    mockCreateApplication.mockReturnValue(createdApp);
    mockSeedDocsFor.mockReturnValue(docsState);
    mockLinkExistingProfileProofs.mockReturnValue(docsState);
    mockBuildDocumentsRoute.mockReturnValue({ pathname: '/application/[id]/documents', params: { id: 'app-new' } });

    const result = prepareReminderRenewalDocuments('competency', 'c-1', '/(tabs)');

    expect(result.kind).toBe('created');
    if (result.kind !== 'created') throw new Error('Expected created');
    expect(mockCreateApplication).toHaveBeenCalledWith('517g', expect.objectContaining({
      applicantProfileId: 'profile-1',
      competencyCertificateIds: ['c-1'],
      selectedFirearmIds: [],
    }));
    expect(mockPersist).toHaveBeenCalledWith(expect.objectContaining({ id: 'app-new', docs: docsState }));
  });

  test('returns multiple when more than one active renewal matches', () => {
    mockResolveActiveReminderApplications.mockReturnValue({
      kind: 'multiple',
      form: '518a',
      itemType: 'firearm',
      itemId: 'f-1',
      applications: [
        makeApplication('app-1', '518a', 'draft'),
        makeApplication('app-2', '518a', 'ready'),
      ],
    });

    const result = prepareReminderRenewalDocuments('firearm', 'f-1', '/(tabs)');

    expect(result.kind).toBe('multiple');
    if (result.kind !== 'multiple') throw new Error('Expected multiple');
    expect(result.applications.map((app: Application) => app.id)).toEqual(['app-1', 'app-2']);
    expect(mockCreateApplication).not.toHaveBeenCalled();
  });
});
