import { Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import {
  ActionCard,
  AppScrollScreen,
  AppText,
  BottomSheet,
  Button,
  DestructiveButton,
  PageHeader,
  RoundIconButton,
  TextField,
} from '@/foundation/components';
import { spacing } from '@/foundation/theme';
import { useHomeCaptureController } from '@/features/capture/hooks/useHomeCaptureController';
import {
  resolveCaptureAddCategoryCardVariant,
  resolveCaptureCategoryCardTone,
  resolveCaptureCategoryCardVariant,
} from '@/features/capture/presentation';

export function TodayScreen() {
  const router = useRouter();
  const {
    isLoading,
    showTutorialCta,
    setTutorialVisible,
    filter,
    applyFilter,
    sort,
    applySort,
    clearFilters,
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    openFilter,
    closeFilter,
    hasAnyCategories,
    visibleCategories,
    refresh,
  } = useHomeCaptureController();

  const addCategoryLabel = hasAnyCategories ? 'Add category' : 'Create first category';

  const hideTutorial = () => {
    Alert.alert(
      'Hide tutorial button?',
      'You can still access tutorials from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Hide', style: 'destructive', onPress: () => void setTutorialVisible(false) },
      ],
    );
  };

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <AppScrollScreen>
      <PageHeader
        title="Capture"
        subtitle="Create and capture your categories."
        rightAction={{ buttonType: 'filter', accessibilityLabel: 'Open category filters', onPress: openFilter }}
      />

      {showTutorialCta ? (
        <ActionCard
          title="Tutorials"
          subtitle="Learn count, time, and journal capture flows."
          tone="grey"
          variant="solid"
          onPress={() => router.push('/tutorials/capture')}
          accessibilityLabel="Open capture tutorials"
          actions={[
            {
              id: 'hide-tutorial',
              label: 'Hide',
              onPress: hideTutorial,
              tone: 'grey',
              variant: 'soft',
              size: 'sm',
            },
          ]}
        />
      ) : null}

      {isLoading ? <AppText>Loading categories...</AppText> : null}
      {/* {!isLoading && !hasAnyCategories ? <AppText>No categories yet. Create your first category to begin capturing.</AppText> : null} */}
      {!isLoading && hasAnyCategories && visibleCategories.length === 0 ? (
        <View style={styles.emptyFiltered}>
          <AppText>No categories match current filters.</AppText>
          <Button label="Clear filters" onPress={() => void clearFilters()} variant="outline" tone="grey" size="sm" />
        </View>
      ) : null}
      {visibleCategories.map((category) => (
        <ActionCard
          key={category.id}
          title={category.name}
          subtitle={`${category.typeLabel} · Open capture wizard`}
          tone={resolveCaptureCategoryCardTone(category.categoryType)}
          variant={resolveCaptureCategoryCardVariant(hasAnyCategories)}
          onPress={() => router.push(`/capture/${category.id}`)}
        />
      ))}
      <ActionCard
        title={addCategoryLabel}
        subtitle="Create and configure a capture category."
        tone="green"
        variant={resolveCaptureAddCategoryCardVariant(hasAnyCategories)}
        onPress={() => router.push('/categories/create')}
      />

      <BottomSheet
        visible={isFilterOpen}
        title="Filter categories"
        onRequestClose={closeFilter}
        headerRight={<RoundIconButton buttonType="close" accessibilityLabel="Close filters" onPress={closeFilter} />}
      >
        <View style={styles.filterBody}>
          <TextField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search categories"
            accessibilityLabel="Search categories"
          />

          <AppText variant="bodyStrong">Filter by type</AppText>
          <View style={styles.row}>
            <Button label="All" onPress={() => void applyFilter('all')} variant={filter === 'all' ? 'solid' : 'outline'} tone="teal" size="sm" />
            <Button label="Count" onPress={() => void applyFilter('quickCount')} variant={filter === 'quickCount' ? 'solid' : 'outline'} tone="teal" size="sm" />
            <Button label="Time" onPress={() => void applyFilter('timedActivity')} variant={filter === 'timedActivity' ? 'solid' : 'outline'} tone="teal" size="sm" />
            <Button label="Journal" onPress={() => void applyFilter('journal')} variant={filter === 'journal' ? 'solid' : 'outline'} tone="teal" size="sm" />
          </View>

          <AppText variant="bodyStrong">Sort by</AppText>
          <View style={styles.row}>
            <Button label="Most recent" onPress={() => void applySort('recent')} variant={sort === 'recent' ? 'solid' : 'outline'} tone="blue" size="sm" />
            <Button label="Name" onPress={() => void applySort('name')} variant={sort === 'name' ? 'solid' : 'outline'} tone="blue" size="sm" />
          </View>

          <DestructiveButton label="Clear filters" onPress={() => void clearFilters()} size="sm" tone="warning" />
        </View>
      </BottomSheet>
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  emptyFiltered: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  filterBody: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
