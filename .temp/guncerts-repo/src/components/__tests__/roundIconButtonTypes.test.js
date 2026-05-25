const {
  ICON_ROUND_BUTTON_TYPES,
  LEGACY_ICON_ROUND_BUTTON_TYPES,
} = require('../roundIconButtonTypes');

describe('round icon button semantic types', () => {
  it('matches the normalized semantic list', () => {
    expect(ICON_ROUND_BUTTON_TYPES).toEqual([
      'add',
      'archive',
      'back',
      'camera',
      'chatbubble-ellipses',
      'close',
      'confirm',
      'copy',
      'delete',
      'edit',
      'ellipse-outline',
      'help',
      'home',
      'library',
      'preview',
      'rotate',
      'save',
      'share',
      'stop',
      'upload',
    ]);
  });

  it('contains no duplicates', () => {
    expect(new Set(ICON_ROUND_BUTTON_TYPES).size).toBe(ICON_ROUND_BUTTON_TYPES.length);
  });

  it('does not include removed legacy aliases', () => {
    const current = new Set(ICON_ROUND_BUTTON_TYPES);
    LEGACY_ICON_ROUND_BUTTON_TYPES.forEach((alias) => {
      expect(current.has(alias)).toBe(false);
    });
  });
});
