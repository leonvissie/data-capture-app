import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components';
import { useSurfacePalette } from '@/providers';
import { radii, spacing, typography } from '@/theme';

const DECADE_RANGES: Record<string, [number, number]> = {
  '1970s': [1970, 1979],
  '1980s': [1980, 1989],
  '1990s': [1990, 1999],
  '2000s': [2000, 2009],
  '2010s': [2010, 2019],
  '2020s': [2020, 2029],
};

export function DecadeYearInlinePicker({
  decadeValues,
  selectedDecades,
  yearValues,
  selectedYears,
  onToggleDecade,
  onToggleYear,
  onClear,
}: {
  decadeValues: string[];
  selectedDecades: string[];
  yearValues: string[];
  selectedYears: string[];
  onToggleDecade: (value: string) => void;
  onToggleYear: (value: string) => void;
  onClear: () => void;
}) {
  const palette = useSurfacePalette();

  const visibleYears = useMemo(() => {
    if (!selectedDecades.length) return [];
    const wanted = new Set<number>();
    for (const d of selectedDecades) {
      const range = DECADE_RANGES[d];
      if (!range) continue;
      for (let y = range[0]; y <= range[1]; y += 1) wanted.add(y);
    }
    return yearValues.filter((y) => wanted.has(Number(y)));
  }, [selectedDecades, yearValues]);

  return (
    <View style={[styles.wrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.text }]}>Filter: Year</Text>
        <Button label="Clear this filter" tone="grey" variant="ghost" onPress={onClear} />
      </View>

      <Text style={[styles.sectionTitle, { color: palette.text }]}>Decade</Text>
      <View style={styles.pillWrap}>
        {decadeValues.map((item) => (
          <Button
            key={item}
            label={item}
            tone="teal"
            variant="outline"
            selected={selectedDecades.includes(item)}
            onPress={() => onToggleDecade(item)}
            style={styles.pill}
          />
        ))}
      </View>

      {selectedDecades.length ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Year</Text>
          <ScrollView style={styles.valuesBox} contentContainerStyle={styles.valuesContent}>
            <View style={styles.pillWrap}>
              {visibleYears.map((item) => (
                <Button
                  key={item}
                  label={item}
                  tone="teal"
                  variant="outline"
                  selected={selectedYears.includes(item)}
                  onPress={() => onToggleYear(item)}
                  style={styles.pill}
                />
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
  sectionTitle: {
    ...typography.bodySmallStrong,
    marginTop: spacing.xs,
  },
  valuesBox: {
    maxHeight: 220,
  },
  valuesContent: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
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
