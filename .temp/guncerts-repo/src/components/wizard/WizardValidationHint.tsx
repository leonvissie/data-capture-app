import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { useTones } from '../../theme/tones';

type Props = {
  message: string;
  tone?: 'orange' | 'red' | 'grey';
  style?: TextStyle;
};

export default function WizardValidationHint({
  message,
  tone = 'orange',
  style,
}: Props) {
  const tones = useTones();
  const styles = useMemo(() => createStyles(), []);
  return (
    <Text
      style={[
        styles.text,
        { color: tone === 'red' ? tones.red.base : tone === 'grey' ? tones.grey.base : tones.orange.base },
        style,
      ]}
    >
      {message}
    </Text>
  );
}

const createStyles = () =>
  StyleSheet.create({
    text: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      marginBottom: 0,
    },
  });

