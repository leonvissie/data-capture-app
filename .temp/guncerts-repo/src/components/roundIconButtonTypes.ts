export const ICON_ROUND_BUTTON_TYPES = [
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

export type IconRoundButtonType = (typeof ICON_ROUND_BUTTON_TYPES)[number];

export const LEGACY_ICON_ROUND_BUTTON_TYPES = [
  'checkmark',
  'chevron-back',
  'copy-outline',
  'create-outline',
  'eye-outline',
  'folder-open-outline',
  'home-outline',
  'images-outline',
  'save-outline',
  'share-outline',
  'trash-outline',
] as const;
