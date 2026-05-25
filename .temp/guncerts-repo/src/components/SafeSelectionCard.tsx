import React, { useMemo } from 'react';
import { GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DocumentActionCard, { type DocumentIssuePill } from './DocumentActionCard';
import { IconRoundButton, type IconRoundButtonType } from './RoundIconButton';
import { useTones } from '../theme/tones';
import { Safe, Document, Membership, MembershipDocument, Proficiency, ProficiencyDocument } from '../data/types';
import { listByType } from '../data/sqlite';

type ItemVisualState = {
  label: string;
  color: 'red' | 'orange' | 'green' | 'info';
};

type Props = {
  safes?: Safe[];
  items?: Array<Safe | Membership | Proficiency>;
  parentType?: 'Safe' | 'Membership' | 'Proficiency';
  onAdd: () => void;
  onPressItem?: (item: Safe | Membership | Proficiency) => void;
  onPreviewItem?: (item: Safe | Membership | Proficiency) => void;
  onToggleItem?: (itemId: string) => void;
  onToggleSafe?: (itemId: string) => void;
  onToggleMembership?: (itemId: string) => void;
  onToggleProficiency?: (itemId: string) => void;
  selectedIds?: Set<string> | string[];
  unselectedTone?: { background: string; border: string };
  returnTo?: string;
  style?: StyleProp<ViewStyle>;
  onHelp?: () => void;
  cardTitle?: string;
  subtitle?: string;
  cardStatus?: string;
  cardStatusColor?: string;
  issuePill?: DocumentIssuePill;
  actionLabel?: string;
  actionIcon?: IconRoundButtonType;
  formatHeading?: (item: Safe | Membership | Proficiency) => string;
  formatMeta?: (item: Safe | Membership | Proficiency) => string[];
  getItemVisual?: (item: Safe | Membership | Proficiency) => ItemVisualState | null;
  helperText?: string;
  helperTextColor?: string;
};

const formatHeadingSafe = (safe: Safe) => (safe.safeName?.trim() ? safe.safeName.trim() : 'Safe');

const friendlyMembershipKind: Record<MembershipDocument, string> = {
  ASSOCIATION_MEMBERSHIP: 'Membership',
  ASSOCIATION_LETTER: 'Letter',
  DEDICATED_HUNTER_CERT: 'Dedicated hunter',
  DEDICATED_SPORT_CERT: 'Dedicated sport shooter',
  FIREARM_ENDORSEMENT: 'Firearm endorsement',
};

const friendlyProficiencyKind: Record<ProficiencyDocument, string> = {
  PROFICIENCY_HANDGUN: 'Handgun',
  PROFICIENCY_RIFLE: 'Rifle',
  PROFICIENCY_SHOTGUN: 'Shotgun',
  PROFICIENCY_HANDMACHINECARBINE: 'Hand machine carbine',
  STATEMENT_OF_RESULTS_KNOWLEDGE: 'Knowledge of the Firearms Control',
  STATEMENT_OF_RESULTS_HANDLE_USE_1: 'Handle and use results 1',
  STATEMENT_OF_RESULTS_HANDLE_USE_2: 'Handle and use results 2',
  STATEMENT_OF_RESULTS_HANDLE_USE_3: 'Handle and use results 3',
  STATEMENT_OF_RESULTS_HANDLE_USE_4: 'Handle and use results 4',
};

const formatPhotos = (item: Safe | Membership | Proficiency, parentType: 'Safe' | 'Membership' | 'Proficiency') => {
  const docs = listByType<Document>('Document').filter(
    (doc) => doc.parentType === parentType && doc.parentId === (item as any).id
  );
  const labels = docs
    .map((doc) => {
      if (parentType === 'Membership') {
        const friendly = friendlyMembershipKind[doc.kind as MembershipDocument];
        if (friendly) return friendly;
      }
      if (parentType === 'Proficiency') {
        const friendly = friendlyProficiencyKind[doc.kind as ProficiencyDocument];
        if (friendly) return friendly;
      }
      const name = (doc.name ?? '').trim();
      if (name) {
        const safeName = parentType === 'Safe' ? ((item as Safe).safeName ?? '').trim().toLowerCase() : '';
        const lower = name.toLowerCase();
        if (safeName && lower.startsWith(safeName)) {
          const offset = safeName.length;
          return name.slice(offset).replace(/^[\s-]+/, '').trim() || name;
        }
        return name;
      }
      const related = (doc.requirementRelatedLabel ?? '').trim();
      if (related) return related;
      return 'Photo';
    })
    .filter(Boolean);
  const unique = Array.from(new Set(labels));
  if (!unique.length) return 'No photos yet';
  return unique.join(', ');
};

const formatMetaDefault = (item: Safe | Membership | Proficiency, parentType: 'Safe' | 'Membership' | 'Proficiency') => {
  const parts: string[] = [];
  const photos = formatPhotos(item, parentType);
  parts.push(`Photos: ${photos}`);
  if (parentType === 'Safe') {
    const notes = (item as Safe).notes?.trim();
    if (notes) parts.push(notes);
  }
  return parts.length ? parts : ['No details captured'];
};

const renderMembershipMetaLine = (
  line: string,
  styles: ReturnType<typeof createStyles>,
  labelColor?: string,
) => {
  const parts = line.split('\n');
  return parts.map((part, idx) => {
    if (!part) return idx < parts.length - 1 ? '\n' : null;
    const match = /^(Documents|Endorsements):(.*)$/i.exec(part);
    if (!match) {
      return (
        <React.Fragment key={`meta-${idx}`}>
          {part}
          {idx < parts.length - 1 ? '\n' : null}
        </React.Fragment>
      );
    }
    return (
      <React.Fragment key={`meta-${idx}`}>
        <Text style={[styles.metaLabel, labelColor ? { color: labelColor } : null]}>{match[1]}:</Text>
        {match[2]}
        {idx < parts.length - 1 ? '\n' : null}
      </React.Fragment>
    );
  });
};

const SafeSelectionCard: React.FC<Props> = ({
  safes,
  items,
  parentType = 'Safe',
  onAdd,
  onPressItem,
  onPreviewItem,
  onToggleItem,
  onToggleSafe,
  onToggleMembership,
  onToggleProficiency,
  selectedIds,
  unselectedTone,
  returnTo,
  style,
  onHelp,
  cardTitle,
  subtitle,
  cardStatus,
  cardStatusColor,
  issuePill,
  actionLabel,
  actionIcon = 'add',
  formatHeading,
  formatMeta,
  getItemVisual,
  helperText,
  helperTextColor,
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

  const list = (items ?? safes) ?? [];

  const handlePress = (item: Safe | Membership | Proficiency) => {
    const id = String((item as any).id);
    const toggle =
      onToggleItem ??
      (
        parentType === 'Safe'
          ? onToggleSafe
          : parentType === 'Membership'
            ? onToggleMembership
            : parentType === 'Proficiency'
              ? onToggleProficiency
              : undefined
      );
    if (toggle) {
      toggle(id);
      // For selection flows (safes/memberships), stop after toggling
      if (parentType === 'Safe' || parentType === 'Membership' || parentType === 'Proficiency') return;
    }
    if (onPressItem) {
      onPressItem(item);
      return;
    }
    if (parentType === 'Membership' || parentType === 'Proficiency') return;
    const params: Record<string, string> = { safeId: String((item as Safe).id) };
    if (encodedReturnTo) params.returnTo = encodedReturnTo;
    router.push({ pathname: '/safe/wizard', params } as any);
  };

  const handlePreview = (item: Safe | Membership | Proficiency) => {
    if (onPreviewItem) {
      onPreviewItem(item);
      return;
    }
    if (parentType === 'Membership' || parentType === 'Proficiency') return;
    const params: Record<string, string> = { safeId: String((item as Safe).id) };
    if (encodedReturnTo) params.returnTo = encodedReturnTo;
    router.push({ pathname: '/safe/wizard', params } as any);
  };

  const selectedCount = Array.from(selectedSet).length;
  const status = cardStatus
    ? cardStatus
    : selectedCount
      ? `${selectedCount} safe${selectedCount === 1 ? '' : 's'} selected`
      : 'Tap safe card to add it to the application';

  return (
    <DocumentActionCard
      title={cardTitle || 'Firearm storage'}
      subtitle={subtitle}
      status={status}
      statusColor={cardStatusColor || tones.blue.base}
      issuePill={issuePill}
      actions={[{ label: actionLabel || 'Add', icon: actionIcon, onPress: onAdd, color: tones.teal.base }]}
      style={style}
      onHelp={onHelp}
    >
      <View style={styles.groupList}>
        {list.map((item) => {
          const itemVisual = getItemVisual?.(item) ?? null;
          const itemTone =
            itemVisual?.color === 'red'
              ? tones.red
              : itemVisual?.color === 'orange'
                ? tones.orange
                : itemVisual?.color === 'green'
                  ? tones.green
                  : itemVisual?.color === 'info'
                    ? tones.blue
                    : null;
          const heading =
            formatHeading?.(item) ??
            (parentType === 'Membership'
              ? (item as Membership).associationName?.trim() || 'Membership'
              : parentType === 'Proficiency'
                ? (item as Proficiency).trainingProviderName?.trim() || 'Proficiency'
              : formatHeadingSafe(item as Safe));
          const meta =
            formatMeta?.(item) ??
            formatMetaDefault(item, parentType);
          const selected = selectedSet.has(String((item as any).id));
          return (
            <Pressable
              key={(item as any).id}
              onPress={() => handlePress(item)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor:
                    itemTone?.surface ??
                    unselectedTone?.background ??
                    (parentType === 'Membership'
                      ? tones.pink.surface
                      : tones.lightBlue.surface),
                  borderColor:
                    itemTone?.border ??
                    unselectedTone?.border ??
                    (parentType === 'Membership'
                      ? tones.pink.border
                      : tones.lightBlue.border),
                },
                selected ? styles.cardSelected : null,
                pressed ? styles.cardPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
                {itemVisual ? (
                  <View style={[styles.itemPill, { backgroundColor: itemTone?.base }]}>
                    <Text style={styles.itemPillText}>{itemVisual.label}</Text>
                  </View>
                ) : null}
                <View style={styles.cardTop}>
                  <View style={styles.headingWrap}>
                    <Text style={[styles.heading, itemTone ? { color: itemTone.base } : null]}>{heading}</Text>
                    {meta.map((line, idx) =>
                      line ? (
                        <Text
                          key={`${line}-${idx}`}
                          style={[styles.meta, itemTone ? { color: itemTone.base } : null]}
                          numberOfLines={parentType === 'Membership' ? undefined : 2}
                        >
                          {parentType === 'Membership' ? renderMembershipMetaLine(line, styles, itemTone?.base) : line}
                        </Text>
                      ) : null
                    )}
                  </View>
                <Pressable
                  hitSlop={6}
                  onPress={(event) => {
                    event.stopPropagation();
                    const toggle =
                      onToggleItem ??
                      (parentType === 'Safe'
                        ? onToggleSafe
                        : parentType === 'Membership'
                          ? onToggleMembership
                          : parentType === 'Proficiency'
                            ? onToggleProficiency
                          : undefined);
                    if (toggle) toggle(String((item as any).id));
                  }}
                  style={[styles.check, selected ? styles.checkActive : styles.checkIdle]}
                >
                  {selected ? <Ionicons name="checkmark" size={16} color={tones.teal.onBase} /> : null}
                </Pressable>
              </View>
              <View style={styles.cardFooter}>
                <IconRoundButton
                  buttonType="preview"
                  size={34}
                  iconSize={18}
                  accessibilityLabel="Preview details"
                  onPress={(event: GestureResponderEvent) => {
                    event.stopPropagation();
                    handlePreview(item);
                  }}
                  hitSlop={8}
                />
              </View>
            </Pressable>
          );
        })}
        {list.length === 0 ? (
          <Text style={styles.emptyHint}>No items captured yet.</Text>
        ) : null}
      </View>
      {helperText ? (
        <Text style={[styles.helperHint, helperTextColor ? { color: helperTextColor } : null]}>
          {helperText}
        </Text>
      ) : null}
    </DocumentActionCard>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
  groupList: { gap: 12 },
  itemPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  itemPillText: {
    color: tones.red.onBase,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
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
  metaLabel: {
    fontWeight: '800',
    color: neutral.onSurface,
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
  emptyHint: {
    color: neutral.base,
    fontSize: 12,
    fontStyle: 'italic',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  helperHint: {
    color: neutral.base,
    fontSize: 12,
    fontStyle: 'italic',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

export default SafeSelectionCard;
