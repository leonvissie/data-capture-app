import React, { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import DocumentActionCard, { type DocumentIssuePill } from './DocumentActionCard';
import { useTones } from '../theme/tones';
import { IconButtonGroup } from './IconButton';
import { FloatingIconRoundButton, IconRoundButton } from './RoundIconButton';

export type ProofMiniCard = {
  key: string;
  label: string;
  status?: string;
  onPress?: () => void;
  onAdd?: () => void;
  onPreview?: () => void;
  onDelete?: () => void;
  addDisabled?: boolean;
  previewDisabled?: boolean;
  deleteDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

type ProofCardProps = {
  title: string;
  status: string;
  statusColor?: string;
  issuePill?: DocumentIssuePill;
  onHelp?: () => void;
  items: ProofMiniCard[];
  helperText?: string;
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
};

const ProofMiniCardRow: React.FC<{ item: ProofMiniCard; cardStyle?: StyleProp<ViewStyle> }> = ({ item, cardStyle }) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const addDisabled = item.addDisabled || !item.onAdd;
  const previewDisabled = item.previewDisabled ?? !item.onPreview;
  const deleteDisabled = item.deleteDisabled ?? !item.onDelete;

  const showAdd = !addDisabled && !!item.onAdd;
  const showPreview = !showAdd && !previewDisabled && !!item.onPreview;
  const showDelete = !showAdd && !deleteDisabled && !!item.onDelete;
  const content = (
    <>
      <View style={styles.targetHeader}>
        <Text style={styles.targetTitle} numberOfLines={2}>{item.label}</Text>
      </View>
      <IconButtonGroup spacing={8} style={styles.cardActions}>
        {showAdd ? (
          <IconRoundButton
            buttonType="add"
            accessibilityLabel={`Add ${item.label}`}
            onPress={item.onAdd}
            size="sm"
            hitSlop={8}
          />
        ) : null}
        {showPreview ? (
          <FloatingIconRoundButton
            buttonType="preview"
            accessibilityLabel={`Preview ${item.label}`}
            onPress={item.onPreview}
            size="sm"
            hitSlop={8}
          />
        ) : null}
        {showDelete ? (
          <FloatingIconRoundButton
            buttonType="delete"
            accessibilityLabel={`Delete ${item.label}`}
            onPress={item.onDelete}
            size="sm"
            hitSlop={8}
          />
        ) : null}
      </IconButtonGroup>
    </>
  );

  if (item.onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.targetCard,
          cardStyle,
          item.style,
          pressed ? styles.targetCardPressed : null,
        ]}
        onPress={item.onPress}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.targetCard, cardStyle, item.style]}>{content}</View>;
};

const ProofCard: React.FC<ProofCardProps> = ({
  title,
  status,
  statusColor,
  issuePill,
  onHelp,
  items,
  helperText,
  style,
  itemStyle,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  return (
    <DocumentActionCard
      title={title}
      titleNumberOfLines={2}
      onHelp={onHelp}
      issuePill={issuePill}
      status={status}
      statusColor={statusColor}
      actions={[]}
      style={style}
    >
      <View style={styles.groupList}>
        {items.map((item) => (
          <ProofMiniCardRow key={item.key} item={item} cardStyle={itemStyle} />
        ))}
        {items.length === 0 && helperText ? (
          <Text style={styles.helperHint}>{helperText}</Text>
        ) : null}
      </View>
      {items.length > 0 && helperText ? (
        <Text style={styles.helperHint}>{helperText}</Text>
      ) : null}
    </DocumentActionCard>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    groupList: { gap: 12 },
    targetCard: {
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 8,
      backgroundColor: neutral.onBase,
      borderColor: neutral.border,
    },
    targetCardPressed: { opacity: 0.92 },
    targetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    targetTitle: { fontSize: 15, fontWeight: '700', color: neutral.onSurface, flex: 1 },
    targetStatus: { fontSize: 12, fontWeight: '600', color: neutral.base },
    cardActions: { marginTop: 4, alignSelf: 'flex-end' },
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
  });

export default ProofCard;
