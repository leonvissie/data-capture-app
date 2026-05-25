import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTones } from '../../theme/tones';

export function WizardOptionWrap({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

type Props = {
  label: string;
  sublabel?: string;
  tertiaryLabel?: string;
  reserveTertiarySpace?: boolean;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
  fullWidth?: boolean;
  align?: 'center' | 'left';
  selectedTone?: 'teal' | 'orange' | 'green' | 'blue' | 'grey' | 'purple' | 'red';
};

export default function WizardOptionButton({
  label,
  sublabel,
  tertiaryLabel,
  reserveTertiarySpace = false,
  selected,
  onPress,
  compact = false,
  fullWidth = false,
  align = 'center',
  selectedTone = 'teal',
}: Props) {
  const tones = useTones();
  const neutral = tones.grey;
  const stylesLocal = useMemo(() => createStyles(neutral, tones, selectedTone), [neutral, selectedTone, tones]);

  return (
    <Pressable
      onPress={onPress}
      style={[
        stylesLocal.optionButton,
        compact ? stylesLocal.optionButtonCompact : null,
        fullWidth ? stylesLocal.optionButtonFullWidth : null,
        align === 'left' ? stylesLocal.optionButtonLeft : null,
        selected ? stylesLocal.optionButtonSelected : null,
      ]}
    >
      <Text
        style={[
          stylesLocal.optionButtonText,
          align === 'left' ? stylesLocal.optionButtonTextLeft : null,
          selected ? stylesLocal.optionButtonTextSelected : null,
        ]}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text
          style={[
            stylesLocal.optionButtonSubtext,
            align === 'left' ? stylesLocal.optionButtonSubtextLeft : null,
            selected ? stylesLocal.optionButtonSubtextSelected : null,
          ]}
        >
          {sublabel}
        </Text>
      ) : null}
      {tertiaryLabel || reserveTertiarySpace ? (
        <Text
          style={[
            stylesLocal.optionButtonSubtext,
            align === 'left' ? stylesLocal.optionButtonSubtextLeft : null,
            selected ? stylesLocal.optionButtonSubtextSelected : null,
            !tertiaryLabel && reserveTertiarySpace ? stylesLocal.optionButtonSubtextPlaceholder : null,
          ]}
        >
          {tertiaryLabel ?? '\u00A0'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>,
  selectedTone: 'teal' | 'orange' | 'green' | 'blue' | 'grey' | 'purple' | 'red'
) =>
  StyleSheet.create({
    optionButton: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
    },
    optionButtonFullWidth: {
      width: '100%',
    },
    optionButtonLeft: {
      alignItems: 'flex-start',
    },
    optionButtonCompact: {
      minHeight: 40,
      paddingVertical: 8,
    },
    optionButtonSelected: {
      borderColor: tones[selectedTone].base,
      backgroundColor: tones[selectedTone].surface,
    },
    optionButtonText: {
      color: neutral.onSurface,
      fontWeight: '600',
      textAlign: 'center',
    },
    optionButtonTextLeft: {
      textAlign: 'left',
      width: '100%',
    },
    optionButtonTextSelected: {
      color: tones[selectedTone].base,
    },
    optionButtonSubtext: {
      color: neutral.base,
      fontSize: 12,
      textAlign: 'center',
    },
    optionButtonSubtextLeft: {
      textAlign: 'left',
      width: '100%',
    },
    optionButtonSubtextSelected: {
      color: tones[selectedTone].base,
    },
    optionButtonSubtextPlaceholder: {
      opacity: 0,
    },
  });
