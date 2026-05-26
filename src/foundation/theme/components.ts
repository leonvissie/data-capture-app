import { spacing } from '@/foundation/theme/spacing';

export const componentMetrics = {
  button: {
    minHeight: 52,
    size: {
      sm: 32,
      md: 40,
      lg: 48,
    },
    horizontalPadding: spacing.lg,
    verticalPadding: spacing.md,
  },
  chip: {
    minHeight: 30,
    horizontalPadding: spacing.md,
    verticalPadding: spacing.sm,
  },
  modal: {
    contentPaddingHorizontal: spacing['2xl'],
    contentPaddingVertical: spacing.lg,
  },
  passcodePad: {
    keySize: 68,
    dotSize: 14,
    dotBorderWidth: 2,
    dotGap: spacing.md,
    gridGap: 18,
    rowGap: spacing.xl,
    keyContentMinHeight: 38,
    dotRadius: 7,
    keyPressedOpacity: 0.8,
    keyDisabledOpacity: 0.5,
    sectionGap: spacing.lg,
    dotsMarginTop: spacing.md,
  },
  authPinScreen: {
    copyGap: spacing.md,
    footerPaddingVertical: spacing.md,
    footerActionsTopPadding: spacing.lg,
    footerActionsMaxWidth: 240,
  },
} as const;
