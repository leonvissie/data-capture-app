import React from 'react';
import { Pressable, PressableProps, StyleSheet, Text } from 'react-native';

type CardPalette = {
  label: string;
  background: string;
  border: string;
  pressedBackground?: string;
  pressedBorder?: string;
};

export type ApplicationCardStatus = 'active' | 'comingSoon' | string;

export type ApplicationCardProps = {
  label: string;
  subLabel: string;
  form?: string;
  status: ApplicationCardStatus;
  cardColors: CardPalette;
  disabledCardColors: CardPalette;
  onPress?: PressableProps['onPress'];
};

const ApplicationCard: React.FC<ApplicationCardProps> = ({
  label,
  subLabel,
  form,
  status,
  cardColors,
  disabledCardColors,
  onPress,
}) => {
  const isComingSoon = status === 'comingSoon';
  const isDisabled = status !== 'active' && !isComingSoon;
  const palette = isDisabled || isComingSoon ? disabledCardColors : cardColors;
  const displayLabel = form ? `${label} (${form})` : label;
  const showComingSoon = status === 'comingSoon';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor:
            pressed && !isDisabled ? palette.pressedBackground ?? palette.background : palette.background,
          borderColor:
            pressed && !isDisabled ? palette.pressedBorder ?? palette.border : palette.border,
          opacity: isDisabled ? 0.6 : 1,
        },
      ]}
    >
      {showComingSoon ? (
        <Text style={[styles.comingSoon, { color: cardColors.background }]}>Coming Soon</Text>
      ) : null}
      <Text style={[styles.label, { color: palette.label }]}>{displayLabel}</Text>
      {subLabel ? (
        <Text style={[styles.subLabel, { color: palette.label }]}>{subLabel}</Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    flexDirection: 'column',
    gap: 4,
  },
  comingSoon: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 1,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 1,
  },
});

export default ApplicationCard;
