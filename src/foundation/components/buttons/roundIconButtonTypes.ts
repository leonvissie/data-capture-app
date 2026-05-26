export const ROUND_ICON_BUTTON_TYPES = [
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
] as const;

export type RoundIconButtonType = (typeof ROUND_ICON_BUTTON_TYPES)[number];
