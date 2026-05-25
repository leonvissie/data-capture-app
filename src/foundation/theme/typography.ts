import { TextStyle } from 'react-native';

export const typography = {
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
} as const satisfies Record<string, TextStyle>;
