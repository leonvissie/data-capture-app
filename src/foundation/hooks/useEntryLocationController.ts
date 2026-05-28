import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createOrReuseLocation,
  listLocations,
  normalizeLocationName,
  type LocationRecord,
  type LocationSort,
} from '@/foundation/services/storage/locationRepository';
import { getOrCreateUserPrefs, updateUserPrefs } from '@/foundation/services/storage/userPrefsRepository';

const INLINE_LIMIT = 5;
export const LOCATION_MAX_LENGTH = 60;

export function getDraftLocationValidationError(draftLocationName: string): string | null {
  const normalized = normalizeLocationName(draftLocationName);
  if (!normalized) return null;
  if (normalized.length > LOCATION_MAX_LENGTH) {
    return `Location must be ${LOCATION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function useEntryLocationController() {
  const [allLocations, setAllLocations] = useState<LocationRecord[]>([]);
  const [sort, setSort] = useState<LocationSort>('recency');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftLocationName, setDraftLocationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const hydratedRef = useRef(false);

  const refresh = useCallback(async (nextSort?: LocationSort) => {
    const activeSort = nextSort ?? sort;
    const requestId = ++requestSequenceRef.current;
    const locations = await listLocations(activeSort);
    if (requestId !== requestSequenceRef.current) return;
    setAllLocations(locations);
  }, [sort]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void (async () => {
      const prefs = await getOrCreateUserPrefs();
      setSort(prefs.locationSortPreference);
      await refresh(prefs.locationSortPreference);
    })();
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
    await refresh(nextSort);
    void updateUserPrefs({ locationSortPreference: nextSort });
  }, [refresh]);

  const addOrReuseLocation = useCallback(async (): Promise<LocationRecord | null> => {
    setError(null);
    const normalized = normalizeLocationName(draftLocationName);
    if (!normalized) return null;
    const draftError = getDraftLocationValidationError(draftLocationName);
    if (draftError) {
      setError(draftError);
      return null;
    }
    const location = await createOrReuseLocation(draftLocationName);
    setDraftLocationName('');
    await refresh();
    return location;
  }, [draftLocationName, refresh]);

  const validateDraftLocationName = useCallback((): string | null => {
    const message = getDraftLocationValidationError(draftLocationName);
    if (message) {
      setError(message);
      return message;
    }
    setError(null);
    return null;
  }, [draftLocationName]);

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
    validateDraftLocationName,
    addOrReuseLocation,
    error,
    refresh,
  };
}

export type EntryLocationController = ReturnType<typeof useEntryLocationController>;
