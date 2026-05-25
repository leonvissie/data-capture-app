import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, SearchInput } from '@/components';
import type { FilterKey } from '@/features/filters/lib/filtering';
import { useSurfacePalette } from '@/providers';
import { radii, spacing, typography } from '@/theme';

function toDisplayLabel(filterKey: FilterKey, value: string) {
  if (filterKey !== 'normalizedCategory') return value;
  const lower = value.toLowerCase();
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getFilterDisplayName(filterKey: FilterKey) {
  switch (filterKey) {
    case 'award':
      return 'Award body';
    case 'normalizedCategory':
      return 'Award category';
    case 'genre':
      return 'Film genre';
    case 'actor':
      return 'Actor/Actress';
    case 'decade':
      return 'Release decade';
    default:
      return filterKey;
  }
}

export function FacetInlinePicker({
  filterKey,
  values,
  selected,
  query,
  onQueryChange,
  onToggle,
  onClear,
}: {
  filterKey: FilterKey;
  values: string[];
  selected: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const palette = useSurfacePalette();
  const filterDisplayName = getFilterDisplayName(filterKey);
  const isLargeFacet = filterKey === 'actor' || filterKey === 'director' || values.length > 1000;
  const trimmedQuery = query.trim();
  const isGatedLargeFacet = isLargeFacet && trimmedQuery.length < 2 && values.length > 50;

  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase();

    // Prevent rendering thousands of values at once, unless this facet has a small set.
    // Keep selected values visible so users can unselect them.
    if (isGatedLargeFacet) return values.filter((v) => selected.includes(v)).slice(0, 120);

    const source = q ? values.filter((v) => v.toLowerCase().includes(q)) : values;
    return source.slice(0, 120);
  }, [isGatedLargeFacet, selected, trimmedQuery, values]);

  return (
    <View style={[styles.wrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.text }]}>Filter: {filterDisplayName}</Text>
        <Button label="Clear this filter" tone="grey" variant="ghost" onPress={onClear} />
      </View>
      <SearchInput value={query} onChangeText={onQueryChange} placeholder={`Search ${filterDisplayName}...`} />
      <Text style={[styles.meta, { color: palette.textMuted }]}>
        {selected.length} selected . {filtered.length}/{values.length} shown
      </Text>
      {isGatedLargeFacet ? (
        <Text style={[styles.meta, { color: palette.textMuted }]}>
          Type at least 2 characters to search this large list.
        </Text>
      ) : null}
      <ScrollView style={styles.valuesBox} contentContainerStyle={styles.valuesContent}>
        <View style={styles.pillWrap}>
          {filtered.map((item) => (
            <Button
              key={item}
              label={toDisplayLabel(filterKey, item)}
              tone="teal"
              variant="outline"
              selected={selected.includes(item)}
              onPress={() => onToggle(item)}
              style={styles.pill}
            />
          ))}
        </View>
      </ScrollView>
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
    textTransform: 'capitalize',
  },
  meta: {
    ...typography.bodySmall,
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
