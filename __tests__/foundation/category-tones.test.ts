import { categoryToneByType } from '../../src/foundation/theme/categoryTones';

describe('categoryToneByType', () => {
  test('maps category types to stable tones', () => {
    expect(categoryToneByType.quickCount).toBe('lightBlue');
    expect(categoryToneByType.timedActivity).toBe('pink');
    expect(categoryToneByType.journal).toBe('purple');
  });
});
