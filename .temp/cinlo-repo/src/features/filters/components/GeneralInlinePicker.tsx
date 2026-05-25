import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components';
import type { OutcomeFilter, WatchStatusFilter } from '@/features/filters/lib/filtering';
import { TourTarget } from '@/features/tour';
import { useSurfacePalette } from '@/providers';
import { radii, spacing, typography } from '@/theme';

function formatOutcomeLabel(value: OutcomeFilter) {
  return value === 'winner' ? 'Winner' : 'Nominee';
}

function formatWatchLabel(value: WatchStatusFilter) {
  return value === 'watched' ? 'Yes' : 'No';
}

export function GeneralInlinePicker({
  awardValues,
  selectedAwards,
  outcomeValues,
  selectedOutcomes,
  watchValues,
  selectedWatchStatuses,
  onToggleAward,
  onToggleOutcome,
  onToggleWatchStatus,
  onClear,
}: {
  awardValues: string[];
  selectedAwards: string[];
  outcomeValues: OutcomeFilter[];
  selectedOutcomes: OutcomeFilter[];
  watchValues: WatchStatusFilter[];
  selectedWatchStatuses: WatchStatusFilter[];
  onToggleAward: (value: string) => void;
  onToggleOutcome: (value: OutcomeFilter) => void;
  onToggleWatchStatus: (value: WatchStatusFilter) => void;
  onClear: () => void;
}) {
  const palette = useSurfacePalette();

  return (
    <View style={styles.outer}>
      <TourTarget targetId="general-filter-panel">
        <View style={[styles.wrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: palette.text }]}>Filter: General</Text>
          <TourTarget targetId="general-clear-filter-button">
            <Button label="Clear this filter" tone="grey" variant="ghost" onPress={onClear} />
          </TourTarget>
        </View>

          <ScrollView style={styles.valuesBox} contentContainerStyle={styles.valuesContent}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Award body</Text>
              <View style={styles.pillWrap}>
                {awardValues.map((item) => (
                  <Button
                    key={item}
                    label={item}
                    tone="teal"
                    variant="outline"
                    selected={selectedAwards.includes(item)}
                    onPress={() => onToggleAward(item)}
                    style={styles.pill}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Result</Text>
              <View style={styles.pillWrap}>
                {outcomeValues.map((item) => (
                  <Button
                    key={item}
                    label={formatOutcomeLabel(item)}
                    tone="teal"
                    variant="outline"
                    selected={selectedOutcomes.includes(item)}
                    onPress={() => onToggleOutcome(item)}
                    style={styles.pill}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Watched</Text>
              <View style={styles.pillWrap}>
                {watchValues.map((item) => (
                  <Button
                    key={item}
                    label={formatWatchLabel(item)}
                    tone="teal"
                    variant="outline"
                    selected={selectedWatchStatuses.includes(item)}
                    onPress={() => onToggleWatchStatus(item)}
                    style={styles.pill}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: spacing.md,
  },
  wrap: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.cardTitle,
  },
  valuesBox: {
    maxHeight: 280,
  },
  valuesContent: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.bodySmallStrong,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    alignSelf: 'flex-start',
  },
});
