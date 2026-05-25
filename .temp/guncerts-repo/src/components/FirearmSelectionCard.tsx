import React, { useMemo } from 'react';
import { GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import DocumentActionCard, { type DocumentIssuePill } from './DocumentActionCard';
import { IconRoundButton } from './RoundIconButton';
import { useTones } from '../theme/tones';
import { Firearm } from '../data/types';
import { Ionicons } from '@expo/vector-icons';
import { categoryLabel } from '../utils/categoryLabel';
import { getDaysUntil, getReminderVisualState } from '../utils/reminderVisuals';
import { getFirearmIdsInTerminalApplications } from '../utils/applicationUsage';
import { compareFirearms } from '../utils/firearmSort';
import { compareFirearmsByReminderPriority } from '../utils/reminderSort';
import { formatFirearmLicenceLine, formatFirearmTitle } from '../utils/firearmDisplay';

type Props = {
  firearms: Firearm[];
  onAdd: () => void;
  onPressFirearm?: (firearm: Firearm) => void;
  onPreviewFirearm?: (firearm: Firearm) => void;
  onToggleFirearm?: (firearmId: string) => void;
  onPressDisabledFirearm?: (firearmId: string) => void;
  selectedIds?: Set<string> | string[];
  disabledIds?: Set<string> | string[];
  unselectedTone?: { background: string; border: string };
  returnTo?: string;
  style?: StyleProp<ViewStyle>;
  onHelp?: () => void;
  issuePill?: DocumentIssuePill;
};

const formatHeading = (firearm: Firearm) => formatFirearmTitle(firearm);

const formatTypeAction = (firearm: Firearm) => {
  const type = firearm.firearmType ? categoryLabel(firearm.firearmType) : 'Type not set';
  const action =
    firearm.firearmAction === 'Other'
      ? firearm.firearmActionOther || 'Other'
      : firearm.firearmAction;
  return action ? `${type} (${action})` : type;
};

const FirearmSelectionCard: React.FC<Props> = ({
  firearms,
  onAdd,
  onPressFirearm,
  onPreviewFirearm,
  onToggleFirearm,
  onPressDisabledFirearm,
  selectedIds,
  disabledIds,
  unselectedTone,
  returnTo,
  style,
  onHelp,
  issuePill,
}) => {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const encodedReturnTo = useMemo(
    () => (returnTo ? encodeURIComponent(returnTo) : undefined),
    [returnTo]
  );
  const selectedSet = useMemo<Set<string>>(() => {
    if (selectedIds instanceof Set) return selectedIds;
    if (Array.isArray(selectedIds)) return new Set(selectedIds.map(String));
    return new Set<string>();
  }, [selectedIds]);
  const disabledSet = useMemo<Set<string>>(() => {
    if (disabledIds instanceof Set) return disabledIds;
    if (Array.isArray(disabledIds)) return new Set(disabledIds.map(String));
    return new Set<string>();
  }, [disabledIds]);
  const terminalFirearmIds = useMemo(
    () => getFirearmIdsInTerminalApplications('518a'),
    [firearms]
  );

  const handlePress = (firearm: Firearm, disabled: boolean) => {
    if (disabled) {
      onPressDisabledFirearm?.(String(firearm.id));
      return;
    }
    if (onToggleFirearm) {
      onToggleFirearm(String(firearm.id));
      return;
    }
    if (onPressFirearm) {
      onPressFirearm(firearm);
      return;
    }

    const params: Record<string, string> = { id: String(firearm.id) };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }
    router.push({ pathname: '/firearms/manual', params } as any);
  };

  const handlePreview = (firearm: Firearm) => {
    if (onPreviewFirearm) {
      onPreviewFirearm(firearm);
      return;
    }

    const params: Record<string, string> = {
      firearmId: String(firearm.id),
      previewMode: '1',
      hideContinue: '1',
      origin: 'firearm-selection-card',
    };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }
    router.push({ pathname: '/firearms/wizard', params } as any);
  };

  const selectedCount = Array.from(selectedSet).length;
  const status = selectedCount
    ? `${selectedCount} firearm${selectedCount === 1 ? '' : 's'} selected`
    : 'Tap firearm card to add it to the application';
  const sortedFirearms = useMemo(
    () =>
      firearms
        .slice()
        .sort((a, b) =>
          compareFirearmsByReminderPriority(a, b, {
            terminalIds: terminalFirearmIds,
            compareBase: compareFirearms,
          }),
        ),
    [firearms, terminalFirearmIds]
  );
  const disabledTone = {
    background: neutral.surface,
    border: neutral.border,
    text: neutral.base,
  };

  return (
    <DocumentActionCard
      title="Firearms"
      status={status}
      statusColor={tones.blue.base}
      issuePill={issuePill}
      actions={[{ label: 'Add', icon: 'add', onPress: onAdd, color: tones.teal.base }]}
      style={style}
      onHelp={onHelp}
    >
      <View style={styles.groupList}>
        {sortedFirearms.map((firearm) => {
          const heading = formatHeading(firearm);
          const daysUntilExpiry = getDaysUntil(firearm.validTo);
          const validityLabel =
            daysUntilExpiry !== null
              ? daysUntilExpiry <= 0
                ? 'Validity (expired)'
                : `Validity (${daysUntilExpiry} days)`
              : 'Validity';
          const validityValue = [firearm.validFrom, firearm.validTo].filter(Boolean).join(' - ');
          const meta = [
            formatTypeAction(firearm),
            formatFirearmLicenceLine(firearm),
            validityValue ? `${validityLabel}: ${validityValue}` : validityLabel,
          ];
          const selected = selectedSet.has(String(firearm.id));
          const disabled = disabledSet.has(String(firearm.id));
          const reminderVisual = terminalFirearmIds.has(String(firearm.id))
            ? { label: 'Renewal application created', color: 'green' as const, daysUntil: getDaysUntil(firearm.validTo) ?? 0 }
            : getReminderVisualState('firearm', firearm.validTo);
          const reminderTone =
            reminderVisual?.color === 'red'
              ? tones.red
              : reminderVisual?.color === 'orange'
                ? tones.orange
                : reminderVisual?.color === 'green'
                  ? tones.green
                  : reminderVisual?.color === 'info'
                    ? tones.blue
                  : null;
          const toneBase = {
            background: unselectedTone?.background ?? tones.orange.surface,
            border: unselectedTone?.border ?? tones.orange.border,
            text: neutral.onSurface,
          };
          const tone = disabled ? disabledTone : toneBase;
          const textColor = reminderTone && !disabled
            ? reminderTone.base
            : selected && !disabled
              ? neutral.onSurface
              : tone.text;
          const cardBackground = reminderTone && !disabled ? reminderTone.surface : tone.background;
          const cardBorder = reminderTone && !disabled ? reminderTone.border : tone.border;
          const checkStyle = disabled ? styles.checkDisabled : selected ? styles.checkActive : styles.checkIdle;
          return (
            <Pressable
              key={firearm.id}
              onPress={() => handlePress(firearm, disabled)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: cardBackground, borderColor: cardBorder },
                selected && !disabled ? styles.cardSelected : null,
                pressed ? styles.cardPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
            >
              {reminderVisual ? (
                <View
                  style={[
                    styles.expiredPill,
                    { backgroundColor: reminderTone?.base },
                    disabled ? styles.expiredPillDisabled : null,
                  ]}
                >
                  <Text style={[styles.expiredPillText, disabled ? styles.expiredPillTextDisabled : null]}>
                    {reminderVisual.label}
                  </Text>
                </View>
              ) : null}
              <View style={styles.cardTop}>
                <View style={styles.headingWrap}>
                  <Text style={[styles.heading, { color: textColor }]}>{heading}</Text>
                  {meta.map((line, idx) =>
                    line ? (
                      <Text key={`${line}-${idx}`} style={[styles.meta, { color: textColor }]}>
                        {line}
                      </Text>
                    ) : null
                  )}
                </View>
                <View style={[styles.check, checkStyle]}>
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={disabled ? neutral.border : tones.teal.onBase}
                    />
                  ) : null}
                </View>
              </View>

              {disabled ? null : (
                <View style={styles.cardFooter}>
                  <IconRoundButton
                    buttonType="preview"
                    size={34}
                    iconSize={18}
                    accessibilityLabel="Preview firearm details"
                    onPress={(event: GestureResponderEvent) => {
                      event.stopPropagation();
                      handlePreview(firearm);
                    }}
                    hitSlop={8}
                  />
                </View>
              )}

              {/* <View style={styles.pills}>
                <Text style={styles.emptyPills}>No extra info</Text>
              </View> */}
            </Pressable>
          );
        })}
        {firearms.length === 0 ? (
          <Text style={styles.emptyHint}>No firearms captured yet.</Text>
        ) : null}
      </View>
    </DocumentActionCard>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
  groupList: { gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.94,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headingWrap: {
    flex: 1,
    gap: 4,
  },
  heading: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: neutral.onSurface,
  },
  meta: {
    fontSize: 13,
    color: neutral.base,
    fontWeight: '600',
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  checkIdle: {
    borderColor: tones.purple.border,
    backgroundColor: neutral.onBase,
  },
  checkActive: {
    borderColor: tones.teal.base,
    backgroundColor: tones.teal.base,
  },
  checkDisabled: {
    borderColor: neutral.border,
    backgroundColor: neutral.surface,
  },
  cardSelected: {
    borderColor: tones.teal.base,
    backgroundColor: tones.teal.surface,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  emptyPills: {
    fontSize: 13,
    color: neutral.base,
  },
  emptyHint: {
    color: neutral.base,
    fontSize: 12,
    fontStyle: 'italic',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  expiredPill: {
    width: '100%',
    backgroundColor: tones.red.base,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  expiredPillDisabled: {
    backgroundColor: neutral.base,
  },
  expiredPillText: {
    color: tones.red.onBase,
    fontWeight: '700',
    textAlign: 'center',
  },
  expiredPillTextDisabled: {
    color: neutral.surface,
  },
});

export default FirearmSelectionCard;
