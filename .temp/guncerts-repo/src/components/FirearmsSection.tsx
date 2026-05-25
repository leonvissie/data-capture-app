import React, { useEffect, useMemo } from 'react';
import {
  Animated,
  GestureResponderEvent,
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { useTones } from '../theme/tones';
import { TAB_SPACING } from '../theme/spacing';
import { Firearm } from '../data/types';
import { IconButtonGroup, iconButtonSizeMap } from './IconButton';
import { FloatingIconRoundButton, IconRoundButton } from './RoundIconButton';
import { useDevMode } from '../providers/DevModeProvider';
import { useThemeMode } from '../providers/ThemeModeProvider';
import CollapseToggleChip from './CollapseToggleChip';
import { getDaysUntil, getReminderVisualState } from '../utils/reminderVisuals';
import { getFirearmIdsInTerminalApplications } from '../utils/applicationUsage';
import { compareFirearms } from '../utils/firearmSort';
import { compareFirearmsByReminderPriority } from '../utils/reminderSort';
import { formatFirearmLicenceLine } from '../utils/firearmDisplay';

type FirearmsSectionProps = {
  firearms: Firearm[];
  onAdd: () => void;
  onPressItem: (id: string) => void;
  onEditItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  title?: string;
  showBackground?: boolean;
  collapsible?: boolean;
  open?: boolean;
  render?: boolean;
  rotation?: Animated.Value;
  opacity?: Animated.Value;
  onToggle?: () => void;
  onExpand?: () => void;
  footerAddLabel?: string;
  footerExpandLabel?: string;
  showFooterAction?: boolean;
  disableTopMargin?: boolean;
  showDivider?: boolean;
};

const ACTION_LABELS: Record<Exclude<Firearm['firearmAction'], undefined>, string> = {
  'Semi-automatic': 'Semi-automatic',
  Automatic: 'Automatic',
  Manual: 'Manual',
  Other: 'Other',
};

const defaultTitle = 'Your firearms';
const emptyMessage = 'No firearms captured yet.';

const primarySerial = (f: Firearm) =>
  f.frameSerialNumber || f.receiverSerialNumber || f.barrelSerialNo || '';

const joinDisplayParts = (parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part): part is string => typeof part === 'string' ? part.length > 0 : false)
    .join(' ');

const actionLabelForFirearm = (f: Firearm) => {
  if (f.firearmAction === 'Other') {
    return f.firearmActionOther?.trim() || ACTION_LABELS.Other;
  }
  if (f.firearmAction) {
    return ACTION_LABELS[f.firearmAction] ?? f.firearmAction;
  }
  return undefined;
};

const formatMakeModel = (f: Firearm) => {
  const makeModel = [f.make, f.model].filter(Boolean).join(' ').trim();
  return makeModel || undefined;
};

const FIREARM_ICON_DIMENSION = iconButtonSizeMap.sm;
const FIREARM_ICON_RADIUS = Math.round(FIREARM_ICON_DIMENSION / 3);
const FIREARM_ICON_SIZE = Math.round(FIREARM_ICON_DIMENSION * 0.6);

const FIREARM_TYPE_ICONS_LIGHT: Partial<
  Record<NonNullable<Firearm['firearmType']>, ImageSourcePropType>
> = {
  Handgun: require('../../assets/icons/handgun.png'),
  Rifle: require('../../assets/icons/rifle.png'),
  Shotgun: require('../../assets/icons/shotgun.png'),
  HandMachineCarbine: require('../../assets/icons/smg.png'),
};

const FIREARM_TYPE_ICONS_DARK: Partial<
  Record<NonNullable<Firearm['firearmType']>, ImageSourcePropType>
> = {
  Handgun: require('../../assets/icons/dark-handgun.png'),
  Rifle: require('../../assets/icons/dark-rifle.png'),
  Shotgun: require('../../assets/icons/dark-shotgun.png'),
  HandMachineCarbine: require('../../assets/icons/dark-smg.png'),
};

const shadeForType = (
  tones: ReturnType<typeof useTones>,
  _t?: Firearm['firearmType'],
  showBackground?: boolean
) => ({
  bg: showBackground ? tones.teal.surface : undefined,
  border: tones.teal.border,
});

export default function FirearmsSection({
  firearms,
  onAdd,
  onPressItem,
  onEditItem,
  onDeleteItem,
  onLayout,
  title = defaultTitle,
  showBackground = true,
  collapsible = true,
  open = true,
  render: _render,
  rotation,
  opacity,
  onToggle,
  onExpand,
  footerAddLabel = 'Add firearm',
  footerExpandLabel = 'Expand firearms',
  showFooterAction = true,
  disableTopMargin = false,
  showDivider = false,
}: FirearmsSectionProps) {
  const tones = useTones();
  const { effectiveMode } = useThemeMode();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const firearmTypeIcons = effectiveMode === 'dark' ? FIREARM_TYPE_ICONS_DARK : FIREARM_TYPE_ICONS_LIGHT;
  const terminalFirearmIds = useMemo(() => getFirearmIdsInTerminalApplications('518a'), [firearms]);
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

  const sections = useMemo(() => {
    const grouped: { type?: Firearm['firearmType']; items: Firearm[] }[] = [];
    for (const firearm of sortedFirearms) {
      const last = grouped[grouped.length - 1];
      if (!last || last.type !== firearm.firearmType) {
        grouped.push({ type: firearm.firearmType, items: [firearm] });
      } else {
        last.items.push(firearm);
      }
    }
    return grouped;
  }, [sortedFirearms]);

  const contentOpacity = collapsible ? (opacity ?? (open ? 1 : 0)) : 1;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const handleToggle = () => {
    if (!collapsible) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle?.();
  };

  const handleExpand = () => {
    if (!collapsible) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (onExpand) {
      onExpand();
      return;
    }
    onToggle?.();
  };

  return (
    <View
      style={[styles.sectionSpacing, disableTopMargin && styles.sectionSpacingNoTop]}
      onLayout={onLayout}
    >
      {showDivider ? <View style={styles.sectionDivider} /> : null}

      <View style={styles.headerRow}>
        <Pressable
          onPress={collapsible ? handleToggle : undefined}
          style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
          accessibilityRole={collapsible ? 'button' : undefined}
        >
          <Text style={styles.h2}>{title} ({firearms.length})</Text>
          {collapsible ? (
            <CollapseToggleChip
              expanded={open}
              onPress={handleToggle}
              showLabel={false}
              tone="purple"
              backgroundColor="transparent"
              borderColor={neutral.onSurface}
              textColor={neutral.onSurface}
              iconColor={neutral.onSurface}
              style={styles.sectionToggleChip}
            />
          ) : null}
        </Pressable>
        {(open || !collapsible) ? (
          <IconRoundButton
            buttonType="add"
            accessibilityLabel="Add firearm"
            onPress={onAdd}
            variant="solid"
            size="sm"
            hitSlop={8}
          />
        ) : null}
      </View>


      {!collapsible || open ? (
        <Animated.View style={[{ opacity: contentOpacity }, styles.sectionBody]}>
      <Text style={styles.helperText}>
        If you receive a new/replacement licence card it is better to add it as a new licence. You can delete the old one or keep it for your records.
      </Text>
          {sortedFirearms.length === 0 ? (
            <Text style={styles.emptyNote}>{emptyMessage}</Text>
          ) : (
            sections.map((sec, idx) => {
              const isLastGroup = idx === sections.length - 1;
              const { bg, border } = shadeForType(tones, sec.type, showBackground);
              return (
                <View
                  key={(sec.type ?? 'unknown') + '_' + idx}
                  style={[styles.cardGroup, isLastGroup && styles.cardGroupLast]}
                >
                  {sec.items.map((firearm) => {
                    const makeAndModel = formatMakeModel(firearm);
                    const serialSuffix = firearm.firearmSerialNumber
                      ? `(${firearm.firearmSerialNumber})`
                      : null;
                    const makeSerialValue = joinDisplayParts([makeAndModel, serialSuffix]);
                    const actionLabel = actionLabelForFirearm(firearm);
                    const typeValue = joinDisplayParts([
                      firearm.firearmType,
                      actionLabel ? `(${actionLabel})` : null,
                    ]);
                    const licenseSectionValue = formatFirearmLicenceLine(firearm);
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
                    const daysUntilExpiry = getDaysUntil(firearm.validTo);
                    const validityLabel =
                      daysUntilExpiry !== null
                        ? daysUntilExpiry <= 0
                          ? 'Validity (expired)'
                          : `Validity (${daysUntilExpiry} days)`
                        : 'Validity';
                    const cardBg = reminderTone ? reminderTone.surface : showBackground ? bg : undefined;
                    const cardBorder = reminderTone ? reminderTone.border : border;
                    const textColor = reminderTone?.base;
                    const firearmIcon = firearm.firearmType
                      ? firearmTypeIcons[firearm.firearmType]
                      : undefined;
                    return (
                      <Pressable
                        key={firearm.id}
                        onPress={() => onPressItem(firearm.id)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.fCard,
                          { backgroundColor: cardBg, borderColor: cardBorder },
                          pressed && { opacity: 0.94 },
                        ]}
                      >
                        {reminderVisual ? (
                          <View style={[styles.expiredPill, { backgroundColor: reminderTone?.base }]}>
                            <Text style={styles.expiredPillText}>{reminderVisual.label}</Text>
                          </View>
                        ) : null}
                        <View style={styles.cardIconRow}>
                          <View
                            style={
                              reminderTone
                                ? [
                                    styles.firearmTypeIcon,
                                    {
                                      backgroundColor: reminderTone.base,
                                      borderColor: reminderTone.base,
                                    },
                                  ]
                                : styles.firearmTypeIcon
                            }
                          >
                            {firearmIcon ? (
                              <Image
                                source={firearmIcon}
                                resizeMode="contain"
                                style={styles.firearmTypeIconImage}
                              />
                            ) : null}
                          </View>
                        </View>
                        <Row
                          label="Make & model (Serial number)"
                          value={makeSerialValue || undefined}
                          labelColor={textColor}
                          valueColor={textColor}
                          styles={styles}
                        />
                        <Row
                          label="Type (Action)"
                          value={typeValue || undefined}
                          labelColor={textColor}
                          valueColor={textColor}
                          styles={styles}
                        />
                        <Row
                          label="Licence number (Section)"
                          value={licenseSectionValue || undefined}
                          labelColor={textColor}
                          valueColor={textColor}
                          styles={styles}
                        />
                        <Row
                          label={validityLabel}
                          value={[firearm.validFrom, firearm.validTo].filter(Boolean).join(' - ')}
                          labelColor={textColor}
                          valueColor={textColor}
                          styles={styles}
                        />

                        <IconButtonGroup spacing={8} style={styles.cardActions}>
                          <FloatingIconRoundButton
                            buttonType="preview"
                            accessibilityLabel="Edit firearm licence"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              onEditItem(firearm.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                          <FloatingIconRoundButton
                            buttonType="delete"
                            accessibilityLabel="Delete firearm"
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              onDeleteItem(firearm.id);
                            }}
                            size="sm"
                            hitSlop={8}
                          />
                        </IconButtonGroup>
                        <Text style={[styles.cardHint, textColor ? { color: textColor } : null]}>Tap to view & edit</Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          )}
        </Animated.View>
      ) : null}

      {showFooterAction ? (
        <Pressable
          onPress={open || !collapsible ? onAdd : handleExpand}
          style={({ pressed }) => [
            styles.secAddBtn,
            !(open || !collapsible) && styles.secAddBtnCollapsed,
            pressed && (open || !collapsible ? styles.secAddBtnPressed : styles.secAddBtnCollapsedPressed),
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.secAddBtnTxt, !(open || !collapsible) && styles.secAddBtnTxtCollapsed]}>
            {open || !collapsible ? footerAddLabel : footerExpandLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  labelColor,
  valueColor,
  styles,
}: {
  label: string;
  value?: string;
  labelColor?: string;
  valueColor?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.muted, valueColor ? { color: valueColor } : null]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
  row: { marginTop: 2 },
  rowLabel: { color: neutral.base, fontWeight: '700', marginBottom: 2 },
  rowValue: { color: neutral.onSurface, fontWeight: '600' },
  muted: { color: neutral.border, fontWeight: '500' },

    h2: { fontSize: 18, fontWeight: '800', color: neutral.onSurface, marginBottom: 0 },
    headerToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionToggleChip: {},
    emptyNote: { color: neutral.base, marginBottom: 6 },
    helperText: { color: neutral.base, fontSize: 14, lineHeight: 20, marginBottom: 8 },

    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
    sectionSpacing: { marginTop: TAB_SPACING + 8, gap: TAB_SPACING },
    sectionSpacingNoTop: { marginTop: 0 },
    sectionDivider: {
      height: 2,
      backgroundColor: neutral.border,
      marginHorizontal: 2,
      marginBottom: 0,
    },

    fCard: {
      position: 'relative',
      borderRadius: 14,
      borderWidth: 2,
      padding: 14,
      paddingBottom: 16,
      gap: 4,
    },
    cardIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    firearmTypeIcon: {
      minWidth: FIREARM_ICON_DIMENSION,
      width: '100%',
      height: FIREARM_ICON_DIMENSION,
      borderRadius: FIREARM_ICON_RADIUS,
      backgroundColor: tones.teal.base,
      alignItems: 'center',
      justifyContent: 'center',
    },
    firearmTypeIconRed: {
      backgroundColor: tones.red.base,
      minWidth: FIREARM_ICON_DIMENSION,
      width: '100%',
      height: FIREARM_ICON_DIMENSION,
      borderRadius: FIREARM_ICON_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
    },
    firearmTypeIconImage: {
      height: FIREARM_ICON_SIZE,
    },
    cardGroup: { gap: 12, marginBottom: 12 },
    cardGroupLast: { marginBottom: 2 },

    secAddBtn: {
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.base,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secAddBtnPressed: {
    backgroundColor: tones.teal.emphasis,
  },
  secAddBtnTxt: { color: tones.teal.onBase, fontWeight: '800' },
  secAddBtnCollapsed: {
    borderColor: neutral.base,
    backgroundColor: neutral.base,
  },
  secAddBtnCollapsedPressed: {
    backgroundColor: neutral.emphasis,
  },
  secAddBtnTxtCollapsed: { color: neutral.onBase },

  sectionBody: { marginBottom: 6 },

  cardActions: { marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap', alignSelf: 'flex-end' },
  cardHint: { marginTop: 6, color: tones.purple.base, fontSize: 12 },
  cardHintExpired: { color: tones.red.base },
  expiredPill: {
    width: '100%',
    backgroundColor: tones.red.base,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  expiredPillText: {
    color: tones.red.onBase,
    fontWeight: '700',
    textAlign: 'center',
  },
});
