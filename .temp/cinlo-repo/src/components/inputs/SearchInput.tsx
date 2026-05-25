import React from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSurfacePalette } from '@/providers';
import { radii, spacing, typography } from '@/theme';

export function SearchInput({ value, onChangeText, placeholder = 'Search' }: { value: string; onChangeText: (v: string) => void; placeholder?: string; }) {
  const palette = useSurfacePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Ionicons name="search" size={16} color={palette.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        style={[styles.input, { color: palette.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        accessibilityHint="Enter text to filter results"
        allowFontScaling
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={12}
          style={({ pressed }) => [
            styles.clearButton,
            { backgroundColor: pressed ? palette.tones.grey.emphasis : palette.tones.grey.base },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Clear search text"
          accessibilityHint="Clears the current search query"
        >
          <Ionicons name="close" size={12} color={palette.tones.grey.onBase} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.body.fontSize,
    paddingTop: Platform.OS === 'ios' ? 6 : 4,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
    textAlignVertical: Platform.OS === 'android' ? 'center' : 'auto',
  },
  clearButton: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
