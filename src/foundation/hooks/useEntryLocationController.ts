import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createOrReuseLocation,
  listLocations,
  normalizeLocationName,
  type LocationRecord,
  type LocationSort,
} from '@/foundation/services/storage/locationRepository';
import { getOrCreateUserPrefs, updateUserPrefs } from '@/foundation/services/storage/userPrefsRepository';

const INLINE_LIMIT = 5;
const LOCATION_MAX_LENGTH = 60;

export function useEntryLocationController() {
  const [allLocations, setAllLocations] = useState<LocationRecord[]>([]);
  const [sort, setSort] = useState<LocationSort>('recency');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftLocationName, setDraftLocationName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (nextSort?: LocationSort) => {
    const activeSort = nextSort ?? sort;
    const [prefs, locations] = await Promise.all([getOrCreateUserPrefs(), listLocations(activeSort)]);
    const prefsSort = prefs.locationSortPreference;
    if (!nextSort && prefsSort !== sort) {
      setSort(prefsSort);
      setAllLocations(await listLocations(prefsSort));
      return;
    }
    setAllLocations(locations);
  }, [sort]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasMoreThanInlineLimit = allLocations.length > INLINE_LIMIT;
  const inlineLocations = allLocations.slice(0, INLINE_LIMIT);

  const filteredLocations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allLocations;
    return allLocations.filter((location) => location.name.toLowerCase().includes(query));
  }, [allLocations, searchQuery]);

  const setSortPreference = useCallback(async (nextSort: LocationSort) => {
    setSort(nextSort);
    await updateUserPrefs({ locationSortPreference: nextSort });
    await refresh(nextSort);
  }, [refresh]);

  const addOrReuseLocation = useCallback(async (): Promise<LocationRecord | null> => {
    setError(null);
    const normalized = normalizeLocationName(draftLocationName);
    if (!normalized) return null;
    if (normalized.length > LOCATION_MAX_LENGTH) {
      setError(`Location must be ${LOCATION_MAX_LENGTH} characters or fewer.`);
      return null;
    }
    const location = await createOrReuseLocation(draftLocationName);
    setDraftLocationName('');
    await refresh();
    return location;
  }, [draftLocationName, refresh]);

  return {
    allLocations,
    inlineLocations,
    hasMoreThanInlineLimit,
    sort,
    setSortPreference,
    searchQuery,
    setSearchQuery,
    filteredLocations,
    isPickerVisible,
    openPicker: () => setIsPickerVisible(true),
    closePicker: () => setIsPickerVisible(false),
    draftLocationName,
    setDraftLocationName,
    addOrReuseLocation,
    error,
    refresh,
  };
}

export type EntryLocationController = ReturnType<typeof useEntryLocationController>;
