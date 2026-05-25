import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleProp, StyleSheet, Text, UIManager, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DocumentActionCard, { type DocumentIssuePill } from './DocumentActionCard';
import { useTones } from '../theme/tones';
import CollapseToggleChip from './CollapseToggleChip';

export type ConfirmationItem = {
  key: string;
  heading: string;
  text?: string;
  selected: boolean;
  onToggle: () => void;
  helpKey?: string;
};

type Props = {
  items: ConfirmationItem[];
  status?: string;
  style?: StyleProp<ViewStyle>;
  onHelp?: () => void;
  issuePill?: DocumentIssuePill;
  collapseOnLoadWhenComplete?: boolean;
};

const ConfirmationCard: React.FC<Props> = ({
  items,
  status,
  style,
  onHelp,
  issuePill,
  collapseOnLoadWhenComplete = false,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const [expanded, setExpanded] = useState(true);
  const allConfirmed = useMemo(() => items.length > 0 && items.every((item) => item.selected), [items]);
  const initialCollapseEvaluatedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!allConfirmed && !expanded) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(true);
    }
  }, [allConfirmed, expanded]);

  useEffect(() => {
    if (!collapseOnLoadWhenComplete) return;
    if (initialCollapseEvaluatedRef.current) return;
    if (!items.length) return;
    initialCollapseEvaluatedRef.current = true;
    if (allConfirmed && expanded) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(false);
    }
  }, [allConfirmed, collapseOnLoadWhenComplete, expanded, items.length]);

  const toggleExpanded = useCallback(() => {
    if (!expanded && !allConfirmed) return;
    if (expanded && !allConfirmed) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, [allConfirmed, expanded]);

  const displayStatus = useMemo(() => {
    if (status) return status;
    const selected = items.filter((item) => item.selected).length;
    if (selected === items.length && items.length > 0) {
      return `All ${items.length} required confirmations selected`;
    }
    if (selected) return `${selected} confirmation${selected === 1 ? '' : 's'} selected`;
    return 'Tap a card to confirm';
  }, [items, status]);

  return (
    <DocumentActionCard
      title="Declarations"
      status={displayStatus}
      statusColor={tones.blue.base}
      actions={[]}
      style={style}
      onHelp={onHelp}
      issuePill={issuePill}
      titleTrailing={
        <CollapseToggleChip
          expanded={expanded}
          onPress={toggleExpanded}
          disabled={expanded && !allConfirmed}
          tone="grey"
        />
      }
    >
      {expanded ? (
        <View style={styles.groupList}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onToggle}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: neutral.onBase, borderColor: neutral.border },
                item.selected ? styles.cardSelected : null,
                pressed ? styles.cardPressed : null,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.selected }}
            >
              <View style={styles.cardTop}>
                <View style={styles.headingWrap}>
                  <Text style={styles.heading}>{item.heading}</Text>
                  {item.text ? <Text style={styles.meta}>{item.text}</Text> : null}
                </View>
              </View>
              <View style={styles.checkRow}>
                <View style={[styles.check, item.selected ? styles.checkActive : styles.checkIdle]}>
                  {item.selected ? <Ionicons name="checkmark" size={16} color={tones.teal.onBase} /> : null}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </DocumentActionCard>
  );
};

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>
) =>
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
      lineHeight: 18,
    },
    checkRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
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
    cardSelected: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
  });

export default ConfirmationCard;
