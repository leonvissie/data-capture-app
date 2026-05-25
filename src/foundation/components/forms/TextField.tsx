import { TextInput, TextInputProps, StyleSheet } from 'react-native';

import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

export function TextField(props: TextInputProps) {
  const t = useTones().grey;
  return <TextInput {...props} style={[styles.base, { borderColor: t.border, color: t.onSurface, backgroundColor: t.surface }, props.style]} />;
}

const styles = StyleSheet.create({ base: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.lg } });
