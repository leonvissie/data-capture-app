import React from 'react';
import { ScrollView, StyleSheet, type ScrollViewProps, type ViewStyle, View } from 'react-native';

import { spacing } from '@/theme';

type Props = ScrollViewProps & {
  containerStyle?: ViewStyle;
  horizontalPadding?: number;
};

export default function PageScrollView({
  containerStyle,
  contentContainerStyle,
  style,
  children,
  horizontalPadding = spacing.xl,
  ...rest
}: Props) {
  return (
    <View style={[styles.shell, containerStyle]}>
      <ScrollView
        {...rest}
        showsVerticalScrollIndicator={false}
        style={[styles.scroll, style]}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing['3xl'] },
});
