import React, { useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useTones } from '../theme/tones';
import { TAB_SPACING } from '../theme/spacing';
import { Document, Safe } from '../data/types';
import { IconButtonGroup } from './IconButton';
import { FloatingIconRoundButton, IconRoundButton } from './RoundIconButton';
import CollapseToggleChip from './CollapseToggleChip';

type FirearmStorageSectionProps = {
  safes: Safe[];
  documents: Document[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
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

const defaultTitle = 'Firearm storage';
const SAFE_PHOTO_CATEGORY_ORDER = ['CLOSED', 'OPEN', 'BOLTS', 'SERIAL', 'SABS'] as const;

export default function FirearmStorageSection({
  safes,
  documents,
  onAdd,
  onEdit,
  onDelete,
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
  footerAddLabel = 'Add firearm storage',
  footerExpandLabel = 'Expand safes',
  showFooterAction = true,
  disableTopMargin = false,
  showDivider = false,
}: FirearmStorageSectionProps) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = React.useMemo(() => createStyles(neutral, tones), [neutral, tones]);

  const safeDocLabels = useCallback(
    (safe: Safe) => {
      const docsById = new Map(
        documents
          .filter((doc) => doc.parentType === 'Safe' && doc.parentId === safe.id)
          .map((doc) => [String(doc.id), doc] as const),
      );
      const labels: string[] = [];
      const seen = new Set<string>();

      const normalizeLabel = (raw?: string, safeName?: string) => {
        const name = (raw ?? '').trim();
        if (!name) return '';
        const safePrefix = (safeName ?? '').trim();
        let label = name;
        if (safePrefix && name.toLowerCase().startsWith(safePrefix.toLowerCase())) {
          label = name.slice(safePrefix.length).replace(/^[\s-]+/, '').trim() || name;
        }
        return label.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      };

      const pushLabel = (doc?: Document) => {
        if (!doc) return;
        const name = (doc.name ?? '').trim();
        if (name) {
          const label = normalizeLabel(name, safe.safeName);
          if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
          }
          return;
        }
        const related = (doc.requirementRelatedLabel ?? '').trim();
        if (related) {
          const label = normalizeLabel(related, safe.safeName);
          if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
          }
          return;
        }
        if (!seen.has('Photo')) {
          seen.add('Photo');
          labels.push('Photo');
        }
      };

      SAFE_PHOTO_CATEGORY_ORDER.forEach((category) => {
        const photo = (safe.safePhotos ?? []).find((entry) => entry.category === category);
        if (!photo) return;
        pushLabel(docsById.get(String(photo.documentId)));
      });

      documents
        .filter((doc) => doc.parentType === 'Safe' && doc.parentId === safe.id)
        .forEach((doc) => {
          if (!docsById.has(String(doc.id))) return;
          pushLabel(doc);
        });

      return labels;
    },
    [documents],
  );

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
          <Text style={styles.h2}>{title} ({safes.length})</Text>
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
            accessibilityLabel="Add safe"
            onPress={onAdd}
            variant="solid"
            size="sm"
            hitSlop={8}
          />
        ) : null}
      </View>

      {!collapsible || open ? (
        <Animated.View style={[{ opacity: contentOpacity }, styles.sectionBody]}>
          {safes.length === 0 ? (
            <Text style={styles.emptyNote}>No firearm storage captured yet.</Text>
          ) : (
            <View style={styles.cardList}>
              {safes.map((safe) => {
                const docLabels = safeDocLabels(safe);
                return (
                  <Pressable
                    key={safe.id}
                    onPress={() => onEdit(safe.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.fCard,
                      styles.safeCard,
                      showBackground && styles.backgroundSafe,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <Row label="Safe name" value={safe.safeName || 'Unnamed safe'} styles={styles} />
                    <Row
                      label="Photos provided"
                      value={docLabels.length ? docLabels.join(', ') : 'None yet'}
                      styles={styles}
                    />
                    <Row
                      label="Notes"
                      value={safe.notes?.trim() || '—'}
                      styles={styles}
                    />
                    <IconButtonGroup spacing={8} style={styles.cardActions}>
                      <FloatingIconRoundButton
                        buttonType="preview"
                        accessibilityLabel="Edit safe"
                        onPress={(event: GestureResponderEvent) => {
                          event.stopPropagation();
                          onEdit(safe.id);
                        }}
                        size="sm"
                        hitSlop={8}
                      />
                      <FloatingIconRoundButton
                        buttonType="delete"
                        accessibilityLabel="Delete safe"
                        onPress={(event: GestureResponderEvent) => {
                          event.stopPropagation();
                          onDelete(safe.id);
                        }}
                        size="sm"
                        hitSlop={8}
                      />
                    </IconButtonGroup>
                    <Text style={styles.cardHint}>Tap to view &amp; edit</Text>
                  </Pressable>
                );
              })}
            </View>
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
  styles,
}: {
  label: string;
  value?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.muted]}>
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
      marginBottom: 0,
      gap: 4,
    },
    safeCard: {
      borderColor: tones.teal.border,
      borderWidth: 2,
    },
    backgroundSafe: { backgroundColor: tones.teal.surface },

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

    cardList: { gap: 12, marginBottom: 2 },
    sectionBody: { marginBottom: 6 },

    cardActions: { marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap', alignSelf: 'flex-end' },
    cardPressed: { opacity: 0.94 },
    cardHint: { marginTop: 6, color: tones.purple.base, fontSize: 12 },
  });
