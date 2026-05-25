import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { useTones } from '../theme/tones';
import { maskDateYYYYMMDD } from '../utils/dateInput';

type DateInputProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  errorText?: string;
  error?: boolean;
  editable?: boolean;
  required?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
  autoFocus?: boolean;
};

export default function DateInput({
  label,
  value,
  onChangeText,
  placeholder = 'YYYY-MM-DD',
  helpText,
  errorText,
  error = false,
  editable = true,
  required = false,
  inputRef,
  containerStyle,
  inputStyle,
  testID,
  autoFocus = false,
}: DateInputProps) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);

  const handleChangeText = (next: string) => {
    onChangeText(maskDateYYYYMMDD(next));
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, error ? styles.labelError : null]}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={neutral.base}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        testID={testID}
        autoFocus={autoFocus}
        style={[
          styles.input,
          !editable ? styles.inputDisabled : null,
          error ? styles.inputError : null,
          inputStyle,
        ]}
      />
      {error && errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {!error && helpText ? <Text style={styles.helpText}>{helpText}</Text> : null}
    </View>
  );
}

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>,
) =>
  StyleSheet.create({
    container: {
      gap: 6,
    },
    label: {
      color: neutral.onSurface,
      fontSize: 13,
      fontWeight: '700',
    },
    labelError: {
      color: tones.red.base,
    },
    required: {
      color: tones.red.base,
    },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingHorizontal: 12,
      backgroundColor: tones.neutrals[100],
      color: neutral.onSurface,
      fontSize: 16,
    },
    inputDisabled: {
      opacity: 0.7,
    },
    inputError: {
      borderColor: tones.red.base,
    },
    helpText: {
      color: neutral.base,
      fontSize: 12,
      lineHeight: 17,
    },
    errorText: {
      color: tones.red.base,
      fontSize: 12,
      lineHeight: 17,
    },
  });
