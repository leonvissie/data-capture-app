import React, { useEffect } from 'react';
import {
  Animated,
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useTones } from '../theme/tones';
import { TAB_SPACING } from '../theme/spacing';
import type { ActivityEvidence } from '../data/types';
import CollapseToggleChip from './CollapseToggleChip';

type Props = {
  itemsByType: Map<ActivityEvidence['evidenceType'], ActivityEvidence>;
  onOpenType: (type: ActivityEvidence['evidenceType']) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  title?: string;
  collapsible?: boolean;
  open?: boolean;
  render?: boolean;
  rotation?: Animated.Value;
  opacity?: Animated.Value;
  onToggle?: () => void;
  onExpand?: () => void;
  footerExpandLabel?: string;
  showDivider?: boolean;
};

export default function ActivityEvidenceSection({
  itemsByType,
  onOpenType,
  onLayout,
  title = 'Firearm activity evidence',
  collapsible = true,
  open = true,
  render: _render,
  rotation,
  opacity,
  onToggle,
  onExpand,
  footerExpandLabel = 'Expand evidence',
  showDivider = false,
}: Props) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = React.useMemo(() => createStyles(neutral, tones), [neutral, tones]);
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

  const cards: Array<{ type: ActivityEvidence['evidenceType']; title: string }> = [
    { type: 'HUNTING', title: 'Hunting evidence' },
    { type: 'SPORT_SHOOTING', title: 'Sport shooting evidence' },
  ];

  return (
    <View style={styles.sectionSpacing} onLayout={onLayout}>
      {showDivider ? <View style={styles.sectionDivider} /> : null}
      <View style={styles.headerRow}>
        <Pressable
          onPress={collapsible ? handleToggle : undefined}
          style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.85 }]}
          accessibilityRole={collapsible ? 'button' : undefined}
        >
          <Text style={styles.h2}>{title}</Text>
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
      </View>

      {!collapsible || open ? (
        <Animated.View style={[{ opacity: contentOpacity }, styles.sectionBody]}>
          <View style={styles.cardList}>
            {cards.map((card) => {
              const item = itemsByType.get(card.type) ?? null;
              const photoCount = item?.photos?.length ?? 0;
              const dates = (item?.photos ?? [])
                .map((photo) => String(photo.capturedAt ?? '').trim())
                .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
                .sort();
              const capturedAtSummary =
                dates.length === 0
                  ? '-'
                  : dates.length === 1
                    ? dates[0]
                    : `${dates[0]} to ${dates[dates.length - 1]}`;
              const lastUpdated = item?.updatedAt
                ? new Date(item.updatedAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '-';
              return (
                <Pressable
                  key={card.type}
                  onPress={() => onOpenType(card.type)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.evidenceCard, pressed ? styles.cardPressed : null]}
                >
                  <Text style={styles.evidenceTitle}>{card.title}</Text>
                  <Row label="Photos uploaded" value={`${photoCount}`} styles={styles} />
                  <Row label="Captured at" value={capturedAtSummary} styles={styles} />
                  <Row label="Last updated" value={lastUpdated} styles={styles} />
                  <Text style={styles.cardHint}>Tap to view &amp; edit</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {collapsible && !open ? (
        <Pressable
          onPress={handleExpand}
          style={({ pressed }) => [styles.secAddBtnCollapsed, pressed ? styles.secAddBtnCollapsedPressed : null]}
          accessibilityRole="button"
        >
          <Text style={styles.secAddBtnTxtCollapsed}>{footerExpandLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  styles,
}: {
  label: string;
  value?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.muted]}>{value || '—'}</Text>
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    h2: { fontSize: 18, fontWeight: '800', color: neutral.onSurface, marginBottom: 0 },
    headerToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionToggleChip: {},
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
    sectionSpacing: { marginTop: TAB_SPACING + 8, gap: TAB_SPACING },
    sectionDivider: {
      height: 2,
      backgroundColor: neutral.border,
      marginHorizontal: 2,
      marginBottom: 0,
    },
    sectionBody: { marginBottom: 6 },
    cardList: { gap: 12, marginBottom: 2 },
    evidenceCard: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: tones.teal.border,
      backgroundColor: tones.teal.surface,
      padding: 14,
      gap: 4,
    },
    evidenceTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface, marginBottom: 2 },
    row: { marginTop: 2 },
    rowLabel: { color: neutral.base, fontWeight: '700', marginBottom: 2 },
    rowValue: { color: neutral.onSurface, fontWeight: '600' },
    muted: { color: neutral.border, fontWeight: '500' },
    cardPressed: { opacity: 0.94 },
    cardHint: { marginTop: 6, color: tones.purple.base, fontSize: 12 },
    secAddBtnCollapsed: {
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.base,
      backgroundColor: neutral.base,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secAddBtnCollapsedPressed: {
      backgroundColor: neutral.emphasis,
    },
    secAddBtnTxtCollapsed: { color: neutral.onBase, fontWeight: '800' },
  });
