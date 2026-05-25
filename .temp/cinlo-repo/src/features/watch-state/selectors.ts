import type { Movie } from '@/data/types';

import type { WatchStateMap } from '@/features/watch-state/types';
import type { WatchStatusFilter } from '@/features/filters/lib/filtering';

export function getWatchCountFromMap(watchMap: WatchStateMap, movieId: string) {
  return watchMap[movieId] ?? 0;
}

export function isMovieWatched(watchMap: WatchStateMap, movieId: string) {
  return getWatchCountFromMap(watchMap, movieId) > 0;
}

export function filterMoviesByWatchStatus(movies: Movie[], watchMap: WatchStateMap, statusFilters: WatchStatusFilter[]) {
  if (!statusFilters.length) return movies;

  const wantsWatched = statusFilters.includes('watched');
  const wantsNotWatched = statusFilters.includes('not_watched');

  if (wantsWatched && wantsNotWatched) return movies;

  return movies.filter((movie) => {
    const watched = isMovieWatched(watchMap, movie.id);
    if (wantsWatched) return watched;
    if (wantsNotWatched) return !watched;
    return true;
  });
}
