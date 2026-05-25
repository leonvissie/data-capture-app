import React from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = ScrollViewProps & {
  containerStyle?: ViewStyle;
  horizontalPadding?: number;
};

const PageScrollView = React.forwardRef<ScrollView, Props>(function PageScrollView(
  {
    containerStyle,
    contentContainerStyle,
    style,
    children,
    horizontalPadding = 20,
    ...rest
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const basePaddingBottom = 24;
  const flatContentStyle = StyleSheet.flatten(contentContainerStyle) ?? {};
  const userPaddingBottom = typeof flatContentStyle.paddingBottom === 'number' ? flatContentStyle.paddingBottom : 0;
  const resolvedPaddingBottom = Math.max(basePaddingBottom + insets.bottom, userPaddingBottom);
  return (
    <View style={[styles.shell, containerStyle]}>
      <ScrollView
        {...rest}
        ref={ref}
        showsVerticalScrollIndicator={false}
        style={[styles.scroll, style]}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding },
          contentContainerStyle,
          { paddingBottom: resolvedPaddingBottom },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
});

export default PageScrollView;

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
});
