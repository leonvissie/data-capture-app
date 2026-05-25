import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTones } from '../../theme/tones';
import { IconRoundButton } from '../RoundIconButton';

type Props = {
  title?: string;
  description?: string;
  headerContent?: React.ReactNode;
  onHelp?: () => void;
  helpLabel?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export default function WizardSection({
  title,
  description,
  headerContent,
  onHelp,
  helpLabel = 'Help',
  children,
  style,
  compact = false,
}: Props) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null, style]}>
      {title ? (
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {onHelp ? (
            <IconRoundButton
              buttonType="help"
              accessibilityLabel={helpLabel}
              onPress={onHelp}
              hitSlop={8}
              size="sm"
              variant="ghost"
              borderColor={neutral.base}
            />
          ) : null}
        </View>
      ) : null}
      {headerContent ? <View style={styles.headerContent}>{headerContent}</View> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    card: {
      backgroundColor: neutral.onBase,
      borderColor: neutral.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 6,
    },
    cardCompact: {
      paddingVertical: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: neutral.onSurface,
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 2,
    },
    description: {
      color: neutral.base,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 2,
    },
    headerContent: {
      gap: 10,
    },
    body: {
      gap: 10,
    },
  });
