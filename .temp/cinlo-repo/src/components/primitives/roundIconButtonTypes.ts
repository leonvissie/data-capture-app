export const ICON_ROUND_BUTTON_TYPES = [
  'close',
  'settings',
  'back',
  'add',
] as const;

export type IconRoundButtonType = (typeof ICON_ROUND_BUTTON_TYPES)[number];
