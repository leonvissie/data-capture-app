import { nowIso } from '@/foundation/lib/dateTime';

import { getOrCreateDefaultProfile } from './profileRepository';
import { getDatabase } from './database';

export type ThemeModePref = 'system' | 'light' | 'dark';
export type HomeCategoryFilter = 'all' | 'quickCount' | 'timedActivity' | 'journal';
export type HomeCategorySort = 'recent' | 'name';
export type LocationSortPref = 'recency' | 'usage' | 'az' | 'za';

export type UserPrefs = {
  profileId: string;
  hasCompletedOnboarding: boolean;
  hasCompletedTour: boolean;
  tourVersion: number;
  preferredThemeMode: ThemeModePref;
  autoLockMinutes: number;
  biometricEnabled: boolean;
  showHomeTutorialCta: boolean;
  homeCategoryFilter: HomeCategoryFilter;
  homeCategorySort: HomeCategorySort;
  locationSortPreference: LocationSortPref;
  createdAt: string;
  updatedAt: string;
};

const CURRENT_TOUR_VERSION = 1;
type UserPrefsListener = (prefs: UserPrefs) => void;
const userPrefsListeners = new Set<UserPrefsListener>();

function notifyUserPrefsListeners(prefs: UserPrefs) {
  for (const listener of userPrefsListeners) {
    listener(prefs);
  }
}

function toUserPrefs(row: {
  profile_id: string;
  has_completed_onboarding: number;
  has_completed_tour: number;
  tour_version: number;
  preferred_theme_mode: string;
  auto_lock_minutes: number;
  biometric_enabled: number;
  show_home_tutorial_cta: number;
  home_category_filter: string;
  home_category_sort: string;
  location_sort_preference: string;
  created_at: string;
  updated_at: string;
}): UserPrefs {
  const mode = row.preferred_theme_mode;
  const preferredThemeMode: ThemeModePref = mode === 'light' || mode === 'dark' ? mode : 'system';
  const filter = row.home_category_filter;
  const sort = row.home_category_sort;
  const homeCategoryFilter: HomeCategoryFilter =
    filter === 'quickCount' || filter === 'timedActivity' || filter === 'journal' ? filter : 'all';
  const homeCategorySort: HomeCategorySort = sort === 'name' ? 'name' : 'recent';
  const locationSort = row.location_sort_preference;
  const locationSortPreference: LocationSortPref =
    locationSort === 'usage' || locationSort === 'az' || locationSort === 'za' ? locationSort : 'recency';

  return {
    profileId: row.profile_id,
    hasCompletedOnboarding: row.has_completed_onboarding === 1,
    hasCompletedTour: row.has_completed_tour === 1,
    tourVersion: row.tour_version,
    preferredThemeMode,
    autoLockMinutes: row.auto_lock_minutes,
    biometricEnabled: row.biometric_enabled === 1,
    showHomeTutorialCta: row.show_home_tutorial_cta === 1,
    homeCategoryFilter,
    homeCategorySort,
    locationSortPreference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getByProfileId(profileId: string): Promise<UserPrefs | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    profile_id: string;
    has_completed_onboarding: number;
    has_completed_tour: number;
    tour_version: number;
    preferred_theme_mode: string;
    auto_lock_minutes: number;
    biometric_enabled: number;
    show_home_tutorial_cta: number;
    home_category_filter: string;
    home_category_sort: string;
    location_sort_preference: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT profile_id, has_completed_onboarding, has_completed_tour, tour_version,
            preferred_theme_mode, auto_lock_minutes, biometric_enabled, show_home_tutorial_cta,
            home_category_filter, home_category_sort, location_sort_preference, created_at, updated_at
     FROM user_prefs
     WHERE profile_id = ?`,
    [profileId],
  );

  return row ? toUserPrefs(row) : null;
}

export async function getOrCreateUserPrefs(): Promise<UserPrefs> {
  const profile = await getOrCreateDefaultProfile();
  const existing = await getByProfileId(profile.id);
  if (existing) return existing;

  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO user_prefs (
      profile_id, has_completed_onboarding, has_completed_tour, tour_version,
      preferred_theme_mode, auto_lock_minutes, biometric_enabled, show_home_tutorial_cta,
      home_category_filter, home_category_sort, location_sort_preference, created_at, updated_at
    ) VALUES (?, 0, 0, ?, 'system', 1, 0, 1, 'all', 'recent', 'recency', ?, ?)`,
    [profile.id, CURRENT_TOUR_VERSION, now, now],
  );

  const created = await getByProfileId(profile.id);
  if (!created) {
    throw new Error('Failed to create user preferences.');
  }
  notifyUserPrefsListeners(created);
  return created;
}

export async function updateUserPrefs(
  next: Partial<
    Pick<
      UserPrefs,
      | 'hasCompletedOnboarding'
      | 'hasCompletedTour'
      | 'tourVersion'
      | 'preferredThemeMode'
      | 'autoLockMinutes'
      | 'biometricEnabled'
      | 'showHomeTutorialCta'
      | 'homeCategoryFilter'
      | 'homeCategorySort'
      | 'locationSortPreference'
    >
  >,
): Promise<UserPrefs> {
  const current = await getOrCreateUserPrefs();
  const merged: UserPrefs = {
    ...current,
    ...next,
    updatedAt: nowIso(),
  };

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_prefs
     SET has_completed_onboarding = ?,
         has_completed_tour = ?,
         tour_version = ?,
         preferred_theme_mode = ?,
         auto_lock_minutes = ?,
         biometric_enabled = ?,
         show_home_tutorial_cta = ?,
         home_category_filter = ?,
         home_category_sort = ?,
         location_sort_preference = ?,
         updated_at = ?
     WHERE profile_id = ?`,
    [
      merged.hasCompletedOnboarding ? 1 : 0,
      merged.hasCompletedTour ? 1 : 0,
      merged.tourVersion,
      merged.preferredThemeMode,
      merged.autoLockMinutes,
      merged.biometricEnabled ? 1 : 0,
      merged.showHomeTutorialCta ? 1 : 0,
      merged.homeCategoryFilter,
      merged.homeCategorySort,
      merged.locationSortPreference,
      merged.updatedAt,
      merged.profileId,
    ],
  );

  notifyUserPrefsListeners(merged);
  return merged;
}

export function subscribeUserPrefs(listener: UserPrefsListener): () => void {
  userPrefsListeners.add(listener);
  return () => {
    userPrefsListeners.delete(listener);
  };
}

export const userPrefsConstants = {
  CURRENT_TOUR_VERSION,
};
