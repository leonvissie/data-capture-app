import { resolveActionCardColors } from '../../src/foundation/components/content/ActionCard';

describe('ActionCard resolver', () => {
  const tone = {
    base: '#111111',
    emphasis: '#222222',
    onBase: '#ffffff',
    surface: '#eeeeee',
    onSurface: '#333333',
    border: '#cccccc',
  };
  const palette = {
    background: '#f8f8f8',
    card: '#ffffff',
    cardMuted: '#f0f0f0',
    text: '#121212',
    textMuted: '#555555',
    border: '#d0d0d0',
    divider: '#e5e5e5',
  };

  test('solid uses base/emphasis', () => {
    const c = resolveActionCardColors(
      'solid',
      tone as unknown as Parameters<typeof resolveActionCardColors>[1],
      palette as unknown as Parameters<typeof resolveActionCardColors>[2],
    );
    expect(c.backgroundColor).toBe(tone.base);
    expect(c.pressedBackgroundColor).toBe(tone.emphasis);
  });

  test('soft uses surface/border', () => {
    const c = resolveActionCardColors(
      'soft',
      tone as unknown as Parameters<typeof resolveActionCardColors>[1],
      palette as unknown as Parameters<typeof resolveActionCardColors>[2],
    );
    expect(c.backgroundColor).toBe(tone.surface);
    expect(c.borderColor).toBe(tone.border);
  });
});
