import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  clearAllWatchState,
  clearWatchStateForMovie,
  getActiveProfile,
  getWatchCount,
  getWatchStateForMovies,
  incrementWatchCount,
  initializeWatchStateStore,
  setWatchCount,
} from '@/features/watch-state';
import type { Profile, WatchStateMap } from '@/features/watch-state';

type WatchStateContextValue = {
  isReady: boolean;
  profile: Profile | null;
  watchMap: WatchStateMap;
  getWatchCountForMovie: (movieId: string) => number;
  isWatched: (movieId: string) => boolean;
  hydrateForMovieIds: (movieIds: string[]) => Promise<void>;
  setWatchCountForMovie: (movieId: string, nextWatchCount: number) => Promise<number>;
  incrementWatchCountForMovie: (movieId: string, incrementBy?: number) => Promise<number>;
  clearWatchStateForMovie: (movieId: string) => Promise<void>;
  clearAllWatchState: () => Promise<void>;
};

const WatchStateContext = createContext<WatchStateContextValue | null>(null);

export function WatchStateProvider({ children }: React.PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [watchMap, setWatchMap] = useState<WatchStateMap>({});

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await initializeWatchStateStore();
        const activeProfile = await getActiveProfile();
        if (!cancelled) {
          setProfile(activeProfile);
          setIsReady(true);
        }
      } catch {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const getWatchCountForMovie = useCallback(
    (movieId: string) => {
      return watchMap[movieId] ?? 0;
    },
    [watchMap],
  );

  const isWatched = useCallback(
    (movieId: string) => {
      return (watchMap[movieId] ?? 0) > 0;
    },
    [watchMap],
  );

  const hydrateForMovieIds = useCallback(async (movieIds: string[]) => {
    if (!movieIds.length) return;
    const rows = await getWatchStateForMovies(movieIds);
    setWatchMap((prev) => ({ ...prev, ...rows }));
  }, []);

  const setWatchCountForMovie = useCallback(async (movieId: string, nextWatchCount: number) => {
    const stored = await setWatchCount(movieId, nextWatchCount);
    setWatchMap((prev) => {
      const next = { ...prev };
      if (stored > 0) next[movieId] = stored;
      else delete next[movieId];
      return next;
    });
    return stored;
  }, []);

  const incrementWatchCountForMovie = useCallback(async (movieId: string, incrementBy = 1) => {
    const stored = await incrementWatchCount(movieId, incrementBy);
    setWatchMap((prev) => ({ ...prev, [movieId]: stored }));
    return stored;
  }, []);

  const clearWatchStateForMovieAction = useCallback(async (movieId: string) => {
    await clearWatchStateForMovie(movieId);
    setWatchMap((prev) => {
      const next = { ...prev };
      delete next[movieId];
      return next;
    });
  }, []);

  const clearAllWatchStateAction = useCallback(async () => {
    await clearAllWatchState();
    setWatchMap({});
  }, []);

  const value = useMemo<WatchStateContextValue>(
    () => ({
      isReady,
      profile,
      watchMap,
      getWatchCountForMovie,
      isWatched,
      hydrateForMovieIds,
      setWatchCountForMovie,
      incrementWatchCountForMovie,
      clearWatchStateForMovie: clearWatchStateForMovieAction,
      clearAllWatchState: clearAllWatchStateAction,
    }),
    [
      clearAllWatchStateAction,
      clearWatchStateForMovieAction,
      getWatchCountForMovie,
      hydrateForMovieIds,
      incrementWatchCountForMovie,
      isReady,
      isWatched,
      profile,
      setWatchCountForMovie,
      watchMap,
    ],
  );

  return <WatchStateContext.Provider value={value}>{children}</WatchStateContext.Provider>;
}

export function useWatchState() {
  const ctx = useContext(WatchStateContext);
  if (!ctx) {
    return {
      isReady: false,
      profile: null,
      watchMap: {},
      getWatchCountForMovie: () => 0,
      isWatched: () => false,
      hydrateForMovieIds: async () => {},
      setWatchCountForMovie: async (_movieId: string, nextWatchCount: number) => Math.max(0, Math.floor(nextWatchCount)),
      incrementWatchCountForMovie: async () => 0,
      clearWatchStateForMovie: async () => {},
      clearAllWatchState: async () => {},
    } as WatchStateContextValue;
  }
  return ctx;
}

export async function getPersistedWatchCount(movieId: string) {
  return getWatchCount(movieId);
}
