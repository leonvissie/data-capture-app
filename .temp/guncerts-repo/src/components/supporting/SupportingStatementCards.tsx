import React, { useMemo } from 'react';
import { Alert, GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import DocumentActionCard from '../DocumentActionCard';
import { IconButtonGroup } from '../IconButton';
import { IconRoundButton } from '../RoundIconButton';
import { useTones } from '../../theme/tones';
import { SupportingStatement, SupportingStatementSlot } from '../../data/types';

export type SupportingStatementCardConfig = {
  slot: SupportingStatementSlot;
  title: string;
};

type Props = {
  cards: SupportingStatementCardConfig[];
  statementsBySlot: Map<SupportingStatementSlot, SupportingStatement>;
  onOpenWizard: (slot: SupportingStatementSlot) => void;
  onOpenNew?: (slot: SupportingStatementSlot) => void;
  onClear: (slot: SupportingStatementSlot) => Promise<void> | void;
};

const getCardStatus = (status?: SupportingStatement['status']) => {
  if (status === 'complete') return { label: 'Complete', colorKey: 'green' as const };
  if (status === 'draft') return { label: 'Wizard in progress', colorKey: 'orange' as const };
  return { label: 'Not started', colorKey: 'neutral' as const };
};

export default function SupportingStatementCards({
  cards,
  statementsBySlot,
  onOpenWizard,
  onOpenNew,
  onClear,
}: Props) {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  return (
    <View style={styles.cardList}>
      {cards.map((config) => {
        const statement = statementsBySlot.get(config.slot);
        const statusInfo = getCardStatus(statement?.status);
        const statusColor =
          statusInfo.colorKey === 'green'
            ? tones.teal.emphasis
            : statusInfo.colorKey === 'orange'
              ? tones.orange.emphasis
              : neutral.base;
        const cardStyle =
          statusInfo.colorKey === 'green'
            ? { backgroundColor: tones.teal.surface, borderColor: tones.teal.border }
            : statusInfo.colorKey === 'orange'
              ? { backgroundColor: tones.orange.surface, borderColor: tones.orange.border }
              : undefined;
        const isNotStarted = statusInfo.label === 'Not started';

        const handleClear = () => {
          Alert.alert(
            'Delete statement?',
            'This will clear the character reference. You will need to re-create it. Are you sure you want to continue?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { void onClear(config.slot); } },
            ],
            { cancelable: true },
          );
        };

        return (
          <Pressable
            key={config.slot}
            onPress={() => onOpenWizard(config.slot)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cardPressable, pressed ? styles.cardPressed : null]}
          >
            <DocumentActionCard title={config.title} actions={[]} style={cardStyle}>
              <View style={styles.actionsRow}>
                <Text style={[styles.statusInline, { color: statusColor }]}>{statusInfo.label}</Text>
                <IconButtonGroup spacing={8} style={styles.actionsIcons}>
                  {isNotStarted ? (
                    <IconRoundButton
                      buttonType="add"
                      variant="ghost"
                      size="sm"
                      borderColor={tones.teal.base}
                      onPress={(event: GestureResponderEvent) => {
                        event.stopPropagation();
                        if (onOpenNew) {
                          onOpenNew(config.slot);
                          return;
                        }
                        onOpenWizard(config.slot);
                      }}
                      accessibilityLabel="Add character reference"
                    />
                  ) : (
                    [
                      <IconRoundButton
                        key="open"
                        buttonType="preview"
                        variant="ghost"
                        size="sm"
                        borderColor={tones.blue.base}
                        onPress={(event: GestureResponderEvent) => {
                          event.stopPropagation();
                          onOpenWizard(config.slot);
                        }}
                        accessibilityLabel="Open character reference wizard"
                      />,
                      <IconRoundButton
                        key="clear"
                        buttonType="delete"
                        variant="ghost"
                        size="sm"
                        borderColor={tones.red.base}
                        onPress={(event: GestureResponderEvent) => {
                          event.stopPropagation();
                          handleClear();
                        }}
                        accessibilityLabel="Clear character reference"
                      />,
                    ]
                  )}
                </IconButtonGroup>
              </View>
            </DocumentActionCard>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    cardList: { gap: 12, marginBottom: 2 },
    cardPressable: { borderRadius: 16 },
    cardPressed: { opacity: 0.94 },
    actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 0 },
    statusInline: { fontSize: 12, fontWeight: '700', flex: 1 },
    actionsIcons: { alignItems: 'center', justifyContent: 'flex-end' },
  });
