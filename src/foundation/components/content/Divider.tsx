import { StyleSheet, View } from 'react-native';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { componentMetrics } from '@/foundation/theme';

type DividerSpacing = keyof typeof componentMetrics.divider.spacing;

type DividerProps = {
  spacing?: DividerSpacing;
  spacingTop?: DividerSpacing;
  spacingBottom?: DividerSpacing;
};

export function Divider({ spacing = 'sm', spacingTop, spacingBottom }: DividerProps) {
  const palette = useSurfacePalette();
  const metrics = componentMetrics.divider;
  const resolvedTop = spacingTop ?? spacing;
  const resolvedBottom = spacingBottom ?? spacing;
  return (
    <View
      style={[
        styles.base,
        {
          borderColor: palette.divider,
          borderTopWidth: metrics.thickness,
          marginTop: metrics.spacing[resolvedTop],
          marginBottom: metrics.spacing[resolvedBottom],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
  },
});

export type { DividerProps, DividerSpacing };
