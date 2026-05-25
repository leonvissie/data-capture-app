import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AppModal, Button, SearchInput } from '@/components';
import { useSurfacePalette } from '@/providers';
import { spacing, typography } from '@/theme';
import type { FilterKey } from '@/features/filters/lib/filtering';

export function FacetPickerModal({
  visible,
  filterKey,
  values,
  selected,
  onToggle,
  onClose,
  onClear,
}: {
  visible: boolean;
  filterKey: FilterKey | null;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const palette = useSurfacePalette();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => v.toLowerCase().includes(q));
  }, [query, values]);

  return (
    <AppModal visible={visible} onClose={onClose} title={filterKey ? `Pick ${filterKey}` : 'Pick filter'}>
      <SearchInput value={query} onChangeText={setQuery} placeholder="Type to filter..." />
      <View style={styles.actions}>
        <Button label="Clear" tone="grey" variant="ghost" onPress={onClear} />
        <Text style={[styles.meta, { color: palette.textMuted }]}>{selected.length} selected</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <Button
            label={item}
            tone="teal"
            variant="outline"
            selected={selected.includes(item)}
            onPress={() => onToggle(item)}
            style={styles.item}
          />
        )}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { ...typography.bodySmallStrong },
  item: { marginBottom: spacing.sm },
});
