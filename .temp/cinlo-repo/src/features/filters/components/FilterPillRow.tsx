import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components';
import { TourTarget } from '@/features/tour';
import { spacing } from '@/theme';

export type FilterPillKey = 'general' | 'normalizedCategory' | 'genre' | 'actor' | 'director' | 'decade';

const FILTERS: Array<{ key: FilterPillKey; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'normalizedCategory', label: 'Category' },
  { key: 'genre', label: 'Genre' },
  { key: 'actor', label: 'Actor' },
  { key: 'director', label: 'Director' },
  { key: 'decade', label: 'Year' },
];

export function FilterPillRow({
  activeKey,
  counts,
  onPress,
  showClearAll,
  onPressClearAll,
  onHorizontalScrolled,
  onHorizontalScrollAvailabilityChange,
  scrollEnabled = true,
  scrollToStartSignal = 0,
}: {
  activeKey: FilterPillKey | null;
  counts: Record<FilterPillKey, number>;
  onPress: (key: FilterPillKey) => void;
  showClearAll: boolean;
  onPressClearAll: () => void;
  onHorizontalScrolled?: () => void;
  onHorizontalScrollAvailabilityChange?: (canScroll: boolean) => void;
  scrollEnabled?: boolean;
  scrollToStartSignal?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  const pendingScrollToStartRef = useRef(false);

  const emitScrollAvailability = useCallback(() => {
    const viewportWidth = viewportWidthRef.current;
    const contentWidth = contentWidthRef.current;
    if (viewportWidth <= 0 || contentWidth <= 0) return;
    onHorizontalScrollAvailabilityChange?.(contentWidth > viewportWidth + 1);
  }, [onHorizontalScrollAvailabilityChange]);

  const forceScrollToStart = useCallback(() => {
    const ref = scrollRef.current;
    if (!ref) return false;
    ref.scrollTo({ x: 0, animated: false });
    return true;
  }, []);

  React.useEffect(() => {
    pendingScrollToStartRef.current = true;
    const didScrollNow = forceScrollToStart();
    if (didScrollNow) pendingScrollToStartRef.current = false;

    const id = setTimeout(() => {
      if (!pendingScrollToStartRef.current) return;
      const didScroll = forceScrollToStart();
      if (didScroll) pendingScrollToStartRef.current = false;
    }, 0);
    return () => clearTimeout(id);
  }, [forceScrollToStart, scrollToStartSignal]);

  return (
    <TourTarget targetId="filter-pill-row" measureVersion={scrollToStartSignal}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={scrollEnabled}
        showsHorizontalScrollIndicator={false}
        accessibilityRole="adjustable"
        accessibilityLabel="Filter pills"
        accessibilityHint="Swipe left or right to view more filters"
        contentContainerStyle={styles.row}
        onLayout={(event) => {
          viewportWidthRef.current = event.nativeEvent.layout.width;
          emitScrollAvailability();
          if (pendingScrollToStartRef.current) {
            const didScroll = forceScrollToStart();
            if (didScroll) pendingScrollToStartRef.current = false;
          }
        }}
        onContentSizeChange={(contentWidth) => {
          contentWidthRef.current = contentWidth;
          emitScrollAvailability();
          if (pendingScrollToStartRef.current) {
            const didScroll = forceScrollToStart();
            if (didScroll) pendingScrollToStartRef.current = false;
          }
        }}
        onScroll={(event) => {
          if (event.nativeEvent.contentOffset.x > 0) {
            onHorizontalScrolled?.();
          }
        }}
        scrollEventThrottle={16}
      >
        {showClearAll ? (
          <View style={styles.pillContainer}>
            <Button label="Reset" tone="red" variant="outline" onPress={onPressClearAll} style={styles.pillButton} />
          </View>
        ) : null}
        {FILTERS.map((f) => (
          <View key={f.key} style={styles.pillContainer}>
            {f.key === 'general' ? (
              <TourTarget targetId="filter-pill-general" measureVersion={scrollToStartSignal}>
                <Button
                  label={counts[f.key] ? `${f.label} (${counts[f.key]})` : f.label}
                  tone={counts[f.key] > 0 ? 'teal' : 'orange'}
                  selected={activeKey === f.key}
                  onPress={() => onPress(f.key)}
                  style={styles.pillButton}
                />
              </TourTarget>
            ) : (
              <Button
                label={counts[f.key] ? `${f.label} (${counts[f.key]})` : f.label}
                tone={counts[f.key] > 0 ? 'teal' : 'orange'}
                selected={activeKey === f.key}
                onPress={() => onPress(f.key)}
                style={styles.pillButton}
              />
            )}
          </View>
        ))}
        {showClearAll ? (
          <View style={styles.pillContainer}>
            <Button label="Reset" tone="red" variant="outline" onPress={onPressClearAll} style={styles.pillButton} />
          </View>
        ) : null}
      </ScrollView>
    </TourTarget>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingBottom: spacing.md },
  pillContainer: { flexShrink: 0 },
  pillButton: { flexShrink: 0 },
});
