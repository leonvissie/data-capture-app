import { resolveButtonDefaults } from '../../src/foundation/components/buttons/Button';
import { resolveRoundIconButtonPreset } from '../../src/foundation/components/buttons/RoundIconButton';
import { palettes } from '../../src/foundation/theme';

describe('foundation button resolvers', () => {
  test('resolveButtonDefaults returns expected mapping for soft variant', () => {
    const tone = palettes.light.tones.orange;
    const resolved = resolveButtonDefaults('soft', tone);
    expect(resolved).toEqual({
      background: tone.surface,
      pressedBackground: tone.base,
      border: tone.border,
      text: tone.base,
    });
  });

  test('resolveButtonDefaults returns expected mapping for solid variant', () => {
    const tone = palettes.light.tones.teal;
    const resolved = resolveButtonDefaults('solid', tone);
    expect(resolved).toEqual({
      background: tone.base,
      pressedBackground: tone.emphasis,
      border: tone.base,
      text: tone.onBase,
    });
  });

  test('round icon preset resolves close action', () => {
    const preset = resolveRoundIconButtonPreset('close');
    expect(preset.iconName).toBe('close');
    expect(preset.tone).toBe('grey');
    expect(preset.backgroundToken).toBe('base');
    expect(preset.pressedBackgroundToken).toBe('emphasis');
    expect(preset.iconToken).toBe('onBase');
  });

  test('round icon preset resolves delete action', () => {
    const preset = resolveRoundIconButtonPreset('delete');
    expect(preset.iconName).toBe('trash-outline');
    expect(preset.tone).toBe('red');
  });
});
