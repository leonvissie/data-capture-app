import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTones } from '../../theme/tones';

type Props = {
  label: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  helpText?: string;
};

export default function WizardSelectField({
  label,
  value,
  placeholder = 'Select',
  onPress,
  helpText,
}: Props) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const displayValue = value?.trim() ? value.trim() : placeholder;

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={styles.inputButton}>
        <Text style={[styles.value, !value?.trim() ? styles.placeholder : null]}>{displayValue}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      {helpText ? <Text style={styles.helpText}>{helpText}</Text> : null}
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    fieldBlock: {
      marginBottom: 10,
    },
    label: {
      color: neutral.base,
      fontWeight: '600',
      marginBottom: 6,
    },
    inputButton: {
      backgroundColor: neutral.onBase,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    value: {
      color: neutral.onSurface,
      flex: 1,
      marginRight: 10,
    },
    placeholder: {
      color: neutral.base,
      fontWeight: '400',
    },
    chevron: {
      color: neutral.base,
      fontSize: 20,
    },
    helpText: {
      color: neutral.base,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
  });
