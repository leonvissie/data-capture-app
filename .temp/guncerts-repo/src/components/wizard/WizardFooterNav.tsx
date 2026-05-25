import React from 'react';
import { StyleSheet, View } from 'react-native';
import Button from '../Button';

type Props = {
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  disablePrevious?: boolean;
  disableNext?: boolean;
  hidePrevious?: boolean;
  nextTone?: 'teal' | 'green' | 'orange';
};

export default function WizardFooterNav({
  nextLabel,
  onPrevious,
  onNext,
  disablePrevious = false,
  disableNext = false,
  hidePrevious = false,
  nextTone = 'teal',
}: Props) {
  return (
    <View style={styles.actions}>
      {hidePrevious ? (
        <View style={styles.button} />
      ) : (
        <Button
          label="Previous"
          tone="teal"
          onPress={onPrevious}
          disabled={disablePrevious}
          style={styles.button}
          centerText
          centerContent
        />
      )}
      <Button
        label={nextLabel}
        tone={nextTone}
        onPress={onNext}
        disabled={disableNext}
        style={styles.button}
        centerText
        centerContent
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  button: {
    flex: 1,
  },
});
