import React from 'react';
import { FlatList, FlatListProps, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props<T> = FlatListProps<T> & {
  containerStyle?: ViewStyle;
  horizontalPadding?: number;
};

type PageFlatListComponent = <T>(
  props: Props<T> & React.RefAttributes<FlatList<T>>
) => React.ReactElement | null;

const PageFlatList = React.forwardRef(<T,>(
  {
    containerStyle,
    contentContainerStyle,
    style,
    horizontalPadding = 20,
    ...rest
  }: Props<T>,
  ref: React.Ref<FlatList<T>>
) => {
  const insets = useSafeAreaInsets();
  const basePaddingBottom = 12;
  const flatContentStyle = StyleSheet.flatten(contentContainerStyle) ?? {};
  const userPaddingBottom = typeof flatContentStyle.paddingBottom === 'number' ? flatContentStyle.paddingBottom : 0;
  const resolvedPaddingBottom = Math.max(basePaddingBottom + insets.bottom, userPaddingBottom);
  return (
    <View style={[styles.shell, containerStyle]}>
      <FlatList
        ref={ref}
        {...rest}
        showsVerticalScrollIndicator={false}
        style={[styles.list, style]}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding },
          contentContainerStyle,
          { paddingBottom: resolvedPaddingBottom },
        ]}
      />
    </View>
  );
}) as PageFlatListComponent;

export default PageFlatList;

const styles = StyleSheet.create({
  shell: { flex: 1 },
  list: { flex: 1 },
  content: { paddingBottom: 24 },
});
