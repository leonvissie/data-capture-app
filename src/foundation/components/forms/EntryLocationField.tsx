import { ScrollView, StyleSheet, View } from 'react-native';

import type { EntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import type { LocationSort } from '@/foundation/services/storage/locationRepository';
import { spacing } from '@/foundation/theme';

import { Button } from '../buttons/Button';
import { RoundIconButton } from '../buttons/RoundIconButton';
import { AppText } from '../layout/AppText';
import { BottomSheet } from '../overlays/BottomSheet';
import { TextField } from './TextField';

const SORT_LABELS: Record<LocationSort, string> = {
  recency: 'Recency',
  usage: 'Entry count',
  az: 'A-Z',
  za: 'Z-A',
};

type EntryLocationFieldProps = {
  selectedLocationId: string | null;
  onSelectedLocationChange: (next: string | null) => void;
  controller: EntryLocationController;
};

export function EntryLocationField({ selectedLocationId, onSelectedLocationChange, controller }: EntryLocationFieldProps) {
  const selectedLocation = selectedLocationId
    ? controller.allLocations.find((location) => location.id === selectedLocationId) ?? null
    : null;
  const selectedInInline = selectedLocation
    ? controller.inlineLocations.some((location) => location.id === selectedLocation.id)
    : false;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <AppText variant="bodyStrong">Location</AppText>
        <Button label={`Sort: ${SORT_LABELS[controller.sort]}`} onPress={controller.openPicker} size="sm" variant="soft" tone="blue" />
      </View>

      <View style={styles.pillsRow}>
        <Button
          label="None"
          onPress={() => onSelectedLocationChange(null)}
          size="sm"
          variant={selectedLocationId === null ? 'solid' : 'outline'}
          tone="teal"
        />
        {selectedLocation && !selectedInInline ? (
          <Button
            label={selectedLocation.name}
            onPress={() => onSelectedLocationChange(selectedLocationId === selectedLocation.id ? null : selectedLocation.id)}
            size="sm"
            variant={selectedLocationId === selectedLocation.id ? 'solid' : 'outline'}
            tone="teal"
          />
        ) : null}
        {controller.inlineLocations.map((location) => (
          <Button
            key={location.id}
            label={location.name}
            onPress={() => onSelectedLocationChange(selectedLocationId === location.id ? null : location.id)}
            size="sm"
            variant={selectedLocationId === location.id ? 'solid' : 'outline'}
            tone="teal"
          />
        ))}
        {controller.hasMoreThanInlineLimit ? (
          <Button label="+" onPress={controller.openPicker} size="sm" variant="soft" tone="teal" />
        ) : null}
      </View>

      <View style={styles.addRow}>
        <TextField
          value={controller.draftLocationName}
          onChangeText={controller.setDraftLocationName}
          placeholder="Add location (saved when entry is saved)"
          accessibilityLabel="Add location"
          autoCapitalize="words"
        />
      </View>

      {controller.error ? <AppText variant="bodySmall">{controller.error}</AppText> : null}

      <BottomSheet
        visible={controller.isPickerVisible}
        title="Select location"
        onRequestClose={controller.closePicker}
        headerRight={<RoundIconButton buttonType="close" accessibilityLabel="Close location picker" onPress={controller.closePicker} />}
      >
        <View style={styles.modalBody}>
          <AppText variant="bodyStrong">Sort by</AppText>
          <View style={styles.sortRow}>
            <Button label="Recency" onPress={() => void controller.setSortPreference('recency')} size="sm" variant={controller.sort === 'recency' ? 'solid' : 'outline'} tone="blue" />
            <Button label="Entry count" onPress={() => void controller.setSortPreference('usage')} size="sm" variant={controller.sort === 'usage' ? 'solid' : 'outline'} tone="blue" />
            <Button label="A-Z" onPress={() => void controller.setSortPreference('az')} size="sm" variant={controller.sort === 'az' ? 'solid' : 'outline'} tone="blue" />
            <Button label="Z-A" onPress={() => void controller.setSortPreference('za')} size="sm" variant={controller.sort === 'za' ? 'solid' : 'outline'} tone="blue" />
          </View>
          <TextField
            value={controller.searchQuery}
            onChangeText={controller.setSearchQuery}
            placeholder="Search locations"
            accessibilityLabel="Search locations"
          />
          <ScrollView contentContainerStyle={styles.locationList}>
            <Button
              label="None"
              onPress={() => {
                onSelectedLocationChange(null);
                controller.closePicker();
              }}
              size="sm"
              variant={selectedLocationId === null ? 'solid' : 'outline'}
              tone="teal"
            />
            {controller.filteredLocations.map((location) => (
              <Button
                key={location.id}
                label={location.name}
                onPress={() => {
                  onSelectedLocationChange(selectedLocationId === location.id ? null : location.id);
                  controller.closePicker();
                }}
                size="sm"
                variant={selectedLocationId === location.id ? 'solid' : 'outline'}
                tone="teal"
              />
            ))}
          </ScrollView>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  addRow: {
    gap: spacing.sm,
  },
  modalBody: {
    gap: spacing.md,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  locationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
});
