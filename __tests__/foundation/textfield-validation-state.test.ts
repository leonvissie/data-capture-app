import { resolveTextFieldColors } from '../../src/foundation/components/forms/TextField';
import type { Tone } from '../../src/foundation/theme/colors';

const neutral: Tone = {
  base: '#1',
  emphasis: '#2',
  onBase: '#3',
  surface: '#4',
  onSurface: '#5',
  border: '#6',
};

const warning: Tone = {
  base: '#a',
  emphasis: '#b',
  onBase: '#c',
  surface: '#d',
  onSurface: '#e',
  border: '#f',
};

describe('resolveTextFieldColors', () => {
  test('uses neutral colors for default', () => {
    expect(resolveTextFieldColors('default', neutral, warning)).toEqual({
      borderColor: neutral.border,
      textColor: neutral.onSurface,
      backgroundColor: neutral.surface,
    });
  });

  test('uses warning colors for warning and blocking', () => {
    expect(resolveTextFieldColors('warning', neutral, warning)).toEqual({
      borderColor: warning.border,
      textColor: warning.emphasis,
      backgroundColor: warning.surface,
    });
    expect(resolveTextFieldColors('blocking', neutral, warning)).toEqual({
      borderColor: warning.border,
      textColor: warning.emphasis,
      backgroundColor: warning.surface,
    });
  });
});
