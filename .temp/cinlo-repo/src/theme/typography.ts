import type { TextStyle } from 'react-native';

export const typography = {
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 18,
  },
  bodySmallStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  bodyLarge: {
    fontSize: 15,
    lineHeight: 22,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  buttonSublabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  iconButtonLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  chipLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  keypadLabel: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '600',
  },
  keypadSubLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
} as const satisfies Record<string, TextStyle>;
