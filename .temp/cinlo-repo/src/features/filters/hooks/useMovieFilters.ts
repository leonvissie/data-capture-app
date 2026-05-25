import { useMemo, useState } from 'react';

import {
  applyFilters,
  emptyFilterState,
  getFacetValuesForState,
  type FilterKey,
  type FilterState,
  type StateFilterKey,
  type OutcomeFilter,
  type WatchStatusFilter,
} from '@/features/filters/lib/filtering';
import { filterMoviesByWatchStatus } from '@/features/watch-state';
import { useWatchState } from '@/providers';

export function useMovieFilters() {
  const { watchMap } = useWatchState();
  const [state, setState] = useState<FilterState>(emptyFilterState);

  const baseResults = useMemo(() => applyFilters(state), [state]);
  const results = useMemo(
    () => filterMoviesByWatchStatus(baseResults, watchMap, state.watchStatus),
    [baseResults, state.watchStatus, watchMap],
  );
  const getFacetValues = useMemo(
    () => (key: FilterKey) => getFacetValuesForState(state, key),
    [state],
  );

  const toggleValue = (key: StateFilterKey, value: string) => {
    setState((prev) => {
      const list = prev[key] as string[];
      const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
      return { ...prev, [key]: next } as FilterState;
    });
  };

  const clearKey = (key: StateFilterKey) => setState((prev) => ({ ...prev, [key]: [] }));
  const toggleOutcome = (value: OutcomeFilter) => toggleValue('outcome', value);
  const toggleWatchStatus = (value: WatchStatusFilter) => toggleValue('watchStatus', value);
  const clearAll = () => setState(emptyFilterState);

  const selectedCount = Object.values(state).reduce((sum, arr) => sum + arr.length, 0);

  return {
    state,
    results,
    selectedCount,
    toggleValue,
    toggleOutcome,
    toggleWatchStatus,
    clearKey,
    clearAll,
    getFacetValues,
  };
}
