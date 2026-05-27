import { LOCATION_MAX_LENGTH } from '../../src/foundation/hooks/useEntryLocationController';

describe('location constraints', () => {
  test('max length remains 60 for shared location contract', () => {
    expect(LOCATION_MAX_LENGTH).toBe(60);
  });
});

