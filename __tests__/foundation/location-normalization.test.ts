import { normalizeLocationName } from '../../src/foundation/services/storage/locationRepository';

describe('location normalization', () => {
  test('trims, collapses spaces, and lowercases', () => {
    expect(normalizeLocationName('  New   York  ')).toBe('new york');
  });

  test('returns empty for whitespace-only values', () => {
    expect(normalizeLocationName('   ')).toBe('');
  });
});

