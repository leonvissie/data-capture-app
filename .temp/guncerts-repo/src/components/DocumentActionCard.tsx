import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { useTones } from '../theme/tones';
import { IconRoundButton, type IconRoundButtonType } from './RoundIconButton';

export type DocumentAction = {
  label: string;
  icon: IconRoundButtonType;
  onPress: () => void;
  onLongPress?: () => void;
  color?: string;
  testID?: string;
  hideLabel?: boolean;
};

export type DocumentIssuePill = {
  label: string;
  type: 'missing' | 'warning' | 'expired';
};

type DocumentActionCardProps = {
  title: string;
  subtitle?: string;
  subtitleStyle?: StyleProp<TextStyle>;
  status?: string;
  statusColor?: string;
  onHelp?: () => void;
  helpLabel?: string;
  actions: DocumentAction[];
  style?: StyleProp<ViewStyle>;
  titleNumberOfLines?: number;
  titleRowStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  issuePill?: DocumentIssuePill;
  titleTrailing?: React.ReactNode;
  actionsRowStyle?: StyleProp<ViewStyle>;
};

const DocumentActionCard: React.FC<DocumentActionCardProps> = ({
  title,
  subtitle,
  subtitleStyle,
  status,
  statusColor,
  onHelp,
  helpLabel = 'Help',
  actions,
  style,
  titleNumberOfLines = 1,
  titleRowStyle,
  titleStyle,
  children,
  issuePill,
  titleTrailing,
  actionsRowStyle,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const defaultIconColor = neutral.base;
  const resolvedBorderColor = issuePill
    ? issuePill.type === 'missing'
      ? tones.red.base
      : issuePill.type === 'expired'
        ? tones.red.base
        : tones.orange.base
    : neutral.border;

  return (
    <View style={[styles.card, { borderColor: resolvedBorderColor }, style]}>
      <View style={[styles.cardTop, titleRowStyle]}>
        <Text style={[styles.cardTitle, titleStyle]} numberOfLines={titleNumberOfLines}>
          {title}
        </Text>
        <View style={styles.titleRight}>
          {titleTrailing}
          {onHelp ? (
            <IconRoundButton
              buttonType="help"
              accessibilityLabel={helpLabel}
              onPress={onHelp}
              hitSlop={8}
              size="sm"
              variant="ghost"
              borderColor={tones.grey.base}
            />
          ) : null}
        </View>
      </View>

      {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}

      {issuePill ? (
        <View
          style={[
            styles.issuePill,
            issuePill.type === 'missing'
              ? styles.issuePillMissing
              : issuePill.type === 'expired'
                ? styles.issuePillExpired
                : styles.issuePillWarning,
          ]}
        >
          <Text
            style={[
              styles.issuePillText,
              issuePill.type === 'missing'
                ? styles.issuePillTextMissing
                : issuePill.type === 'expired'
                  ? styles.issuePillTextExpired
                  : styles.issuePillTextWarning,
            ]}
          >
            {issuePill.label}
          </Text>
        </View>
      ) : null}

      {status ? <Text style={[styles.status, statusColor ? { color: statusColor } : null]}>{status}</Text> : null}

      {children ? <View style={styles.extra}>{children}</View> : null}

      {actions.length ? (
        <View style={[styles.actionsRow, actionsRowStyle]}>
          {actions.map((action, idx) => {
            const tint = action.color ?? defaultIconColor;
            return (
              <View key={`${action.label}-${idx}`} style={styles.actionItem}>
                <IconRoundButton
                  buttonType={action.icon}
                  iconSize={20}
                  size="md"
                  onPress={action.onPress}
                  onLongPress={action.onLongPress}
                  accessibilityLabel={action.label}
                  testID={action.testID}
                />
                {!action.hideLabel ? (
                  <Text style={[styles.actionLabel, { color: tint }]} numberOfLines={1}>
                    {action.label}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    card: {
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: neutral.border,
      padding: 16,
      gap: 12,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    titleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { flex: 1, color: neutral.onSurface, fontWeight: '800', fontSize: 18, paddingRight: 8 },
    subtitle: { color: neutral.base, fontSize: 13 },
    issuePill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    issuePillMissing: {
      backgroundColor: tones.red.base,
    },
    issuePillExpired: {
      backgroundColor: tones.red.base,
    },
    issuePillWarning: {
      backgroundColor: tones.orange.base,
    },
    issuePillText: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    issuePillTextMissing: {
      color: tones.red.onBase,
    },
    issuePillTextExpired: {
      color: tones.red.onBase,
    },
    issuePillTextWarning: {
      color: tones.orange.onBase,
    },
    status: { fontSize: 12, fontWeight: '700', color: tones.blue.base },
    extra: { marginTop: 8 },
    actionsRow: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: neutral.border,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      gap: 20,
      flexWrap: 'wrap',
    },
    actionItem: {
      alignItems: 'center',
      gap: 8,
    },
    actionLabel: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
  });

export default DocumentActionCard;
