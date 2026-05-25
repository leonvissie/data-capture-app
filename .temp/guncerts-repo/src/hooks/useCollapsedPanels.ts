import { useMemo, useState, useCallback } from 'react';
import { ensureUserPrefs, getUserPrefs, saveUserPrefs } from '../data/repo';
import { listByType } from '../data/sqlite';
import { Profile, UserPrefs } from '../data/types';

type PanelMap = Record<string, boolean>;

export function useCollapsedPanels(screenKey: string, sectionKeys: string[]) {
  const profile = useMemo(() => listByType<Profile>('Profile')[0] ?? null, []);
  const profileId = profile?.id;

  const defaultState = useMemo(
    () => sectionKeys.reduce<PanelMap>((acc, key) => {
      acc[key] = false;
      return acc;
    }, {}),
    [sectionKeys],
  );

  const [collapsed, setCollapsed] = useState<PanelMap>(() => {
    if (!profileId) return defaultState;
    try {
      const prefs = getUserPrefs(profileId);
      const stored =
        prefs?.collapsedPanels?.[screenKey] ??
        (screenKey === 'firearms' ? prefs?.collapsedPanels?.firerarms : undefined);
      if (stored) {
        return { ...defaultState, ...stored };
      }
    } catch (error) {
      console.warn('[collapsedPanels] unable to load state', error);
    }
    return defaultState;
  });

  const persistState = useCallback((next: PanelMap) => {
    if (!profileId) return;
    try {
      const prefs = ensureUserPrefs(profileId);
      const updated: UserPrefs = {
        ...prefs,
        collapsedPanels: {
          ...(prefs.collapsedPanels ?? {}),
          [screenKey]: next,
        },
      };
      saveUserPrefs(updated);
    } catch (error) {
      console.warn('[collapsedPanels] unable to save state', error);
    }
  }, [profileId, screenKey]);

  const setSectionCollapsed = useCallback((key: string, value: boolean) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: value };
      persistState(next);
      return next;
    });
  }, [persistState]);

  const resetState = useCallback(() => {
    setCollapsed(defaultState);
    persistState(defaultState);
  }, [defaultState, persistState]);

  return {
    collapsed,
    setSectionCollapsed,
    resetState,
  };
}
