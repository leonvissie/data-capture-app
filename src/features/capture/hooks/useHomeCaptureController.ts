import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  listCategories,
  listCategoryEntryCounts,
  type CategoryRecord,
} from '@/foundation/services/storage/categoryRepository';
import {
  getOrCreateUserPrefs,
  subscribeUserPrefs,
  updateUserPrefs,
  type HomeCategoryFilter,
  type HomeCategorySort,
} from '@/foundation/services/storage/userPrefsRepository';
import { categoryTypeUiLabelByType } from '@/foundation/presentation/categoryTypeLabels';

function matchesFilter(category: CategoryRecord, filter: HomeCategoryFilter) {
  if (filter === 'all') return true;
  return category.categoryType === filter;
}

function matchesSearch(category: CategoryRecord, searchQuery: string) {
  if (!searchQuery.trim()) return true;
  return category.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
}

function sortCategories(categories: CategoryRecord[], sort: HomeCategorySort) {
  if (sort === 'name') {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...categories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function useHomeCaptureController() {
  const [isLoading, setIsLoading] = useState(true);
  const [showTutorialCta, setShowTutorialCta] = useState(true);
  const [filter, setFilter] = useState<HomeCategoryFilter>('all');
  const [sort, setSort] = useState<HomeCategorySort>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [entryCountsByCategoryId, setEntryCountsByCategoryId] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [prefs, allCategories, entryCounts] = await Promise.all([getOrCreateUserPrefs(), listCategories(), listCategoryEntryCounts()]);
    setShowTutorialCta(prefs.showHomeTutorialCta);
    setFilter(prefs.homeCategoryFilter);
    setSort(prefs.homeCategorySort);
    setCategories(allCategories);
    setEntryCountsByCategoryId(entryCounts);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeUserPrefs((prefs) => {
      setShowTutorialCta(prefs.showHomeTutorialCta);
      setFilter(prefs.homeCategoryFilter);
      setSort(prefs.homeCategorySort);
    });
    return unsubscribe;
  }, []);

  const setTutorialVisible = useCallback(async (visible: boolean) => {
    const next = await updateUserPrefs({ showHomeTutorialCta: visible });
    setShowTutorialCta(next.showHomeTutorialCta);
  }, []);

  const applyFilter = useCallback(async (next: HomeCategoryFilter) => {
    const prefs = await updateUserPrefs({ homeCategoryFilter: next });
    setFilter(prefs.homeCategoryFilter);
  }, []);

  const applySort = useCallback(async (next: HomeCategorySort) => {
    const prefs = await updateUserPrefs({ homeCategorySort: next });
    setSort(prefs.homeCategorySort);
  }, []);

  const clearFilters = useCallback(async () => {
    const prefs = await updateUserPrefs({ homeCategoryFilter: 'all', homeCategorySort: 'recent' });
    setFilter(prefs.homeCategoryFilter);
    setSort(prefs.homeCategorySort);
    setSearchQuery('');
  }, []);

  const visibleCategories = useMemo(() => {
    const filtered = categories.filter((category) => matchesFilter(category, filter) && matchesSearch(category, searchQuery));
    return sortCategories(filtered, sort).map((category) => ({
      ...category,
      typeLabel: categoryTypeUiLabelByType[category.categoryType],
      entryCount: entryCountsByCategoryId[category.id] ?? 0,
    }));
  }, [categories, entryCountsByCategoryId, filter, searchQuery, sort]);

  return {
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
    openFilter: () => setIsFilterOpen(true),
    closeFilter: () => setIsFilterOpen(false),
    hasAnyCategories: categories.length > 0,
    visibleCategories,
    refresh,
  };
}
