import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextStyle, View } from 'react-native';
import { useTones } from '../../theme/tones';

type Props = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  editable?: boolean;
  helpText?: string;
  mask?: 'date';
  hasError?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  labelColor?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  inputStyle?: StyleProp<TextStyle>;
};

export default function WizardField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  editable = true,
  helpText,
  mask,
  hasError = false,
  inputRef,
  labelColor,
  autoCapitalize = 'none',
  inputStyle,
}: Props) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  const maskYYYYMMDD = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };

  const handleChangeText = (next: string) => {
    if (mask === 'date') {
      onChangeText(maskYYYYMMDD(next));
      return;
    }
    onChangeText(next);
  };

  return (
    <View style={styles.fieldBlock}>
      {label ? (
        <Text style={[styles.label, { color: labelColor ?? neutral.base }, hasError ? { color: tones.orange.base } : null]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={neutral.base}
        multiline={multiline}
        keyboardType={mask === 'date' ? 'numeric' : keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        style={[
          styles.input,
          multiline ? styles.textArea : null,
          !editable ? styles.inputDisabled : null,
          hasError
            ? {
                borderColor: tones.orange.border,
                backgroundColor: tones.orange.surface,
                color: tones.orange.onSurface,
              }
            : null,
          inputStyle,
        ]}
      />
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
    input: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: neutral.onBase,
      color: neutral.onSurface,
      fontSize: 16,
      minHeight: 44,
    },
    textArea: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    inputDisabled: {
      opacity: 0.7,
    },
    helpText: {
      color: neutral.base,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
  });
