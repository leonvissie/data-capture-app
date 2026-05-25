import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTones } from '../../theme/tones';

export type WizardStepTone = 'blue' | 'green' | 'orange' | 'grey';

type StepItem = {
  id: string;
  label: string;
};

type Props<TStep extends StepItem> = {
  steps: TStep[];
  selectedIndex: number;
  onPressStep: (index: number) => void;
  getStepTone: (step: TStep, index: number) => WizardStepTone;
};

export default function WizardStepProgress<TStep extends StepItem>({
  steps,
  selectedIndex,
  onPressStep,
  getStepTone,
}: Props<TStep>) {
  const tones = useTones();
  const styles = useMemo(() => createStyles(), []);

  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        {steps.map((step, index) => {
          const selected = index === selectedIndex;
          const tone = tones[getStepTone(step, index)];
          return (
            <Pressable
              key={step.id}
              onPress={() => onPressStep(index)}
              style={[
                styles.badge,
                {
                  borderColor: tone.base,
                  backgroundColor: selected ? tone.base : tone.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: selected ? tone.onBase : tone.base },
                ]}
              >
                {index + 1}. {step.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    rowWrap: {
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '700',
    },
  });

