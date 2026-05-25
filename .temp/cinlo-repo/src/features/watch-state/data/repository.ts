import type { MovieUserState, Profile, WatchStateMap } from '@/features/watch-state/types';
import { getDatabase, getOrCreateActiveProfileId, initializeWatchStateDatabase } from '@/features/watch-state/data/database';

function getNowIso() {
  return new Date().toISOString();
}

function toProfile(row: {
  id: string;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  auth_provider: string | null;
  auth_subject: string | null;
}): Profile {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayName: row.display_name,
    authProvider: row.auth_provider,
    authSubject: row.auth_subject,
  };
}

function toMovieUserState(row: {
  profile_id: string;
  movie_id: string;
  watch_count: number;
  updated_at: string;
}): MovieUserState {
  return {
    profileId: row.profile_id,
    movieId: row.movie_id,
    watchCount: row.watch_count,
    updatedAt: row.updated_at,
  };
}

export async function initializeWatchStateStore() {
  await initializeWatchStateDatabase();
}

export async function getActiveProfile() {
  const db = await getDatabase();
  const profileId = await getOrCreateActiveProfileId();
  const row = await db.getFirstAsync<{
    id: string;
    created_at: string;
    updated_at: string;
    display_name: string | null;
    auth_provider: string | null;
    auth_subject: string | null;
  }>('SELECT id, created_at, updated_at, display_name, auth_provider, auth_subject FROM profiles WHERE id = ?', [profileId]);

  return row ? toProfile(row) : null;
}

export async function getWatchCount(movieId: string) {
  const db = await getDatabase();
  const profileId = await getOrCreateActiveProfileId();
  const row = await db.getFirstAsync<{ watch_count: number }>(
    'SELECT watch_count FROM movie_user_state WHERE profile_id = ? AND movie_id = ?',
    [profileId, movieId],
  );
  return row?.watch_count ?? 0;
}

export async function getWatchStateForMovie(movieId: string) {
  const db = await getDatabase();
  const profileId = await getOrCreateActiveProfileId();
  const row = await db.getFirstAsync<{
    profile_id: string;
    movie_id: string;
    watch_count: number;
    updated_at: string;
  }>('SELECT profile_id, movie_id, watch_count, updated_at FROM movie_user_state WHERE profile_id = ? AND movie_id = ?', [
    profileId,
    movieId,
  ]);
  return row ? toMovieUserState(row) : null;
}

export async function getWatchStateForMovies(movieIds: string[]): Promise<WatchStateMap> {
  if (!movieIds.length) return {};

  const db = await getDatabase();
  const profileId = await getOrCreateActiveProfileId();
  const placeholders = movieIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ movie_id: string; watch_count: number }>(
    `SELECT movie_id, watch_count FROM movie_user_state
     WHERE profile_id = ? AND movie_id IN (${placeholders})`,
    [profileId, ...movieIds],
  );

  const map: WatchStateMap = {};
  for (const row of rows) {
    map[row.movie_id] = row.watch_count;
  }
  return map;
}

export async function setWatchCount(movieId: string, nextWatchCount: number) {
  const db = await getDatabase();
  const profileId = await getOrCreateActiveProfileId();
  const now = getNowIso();
  const watchCount = Math.max(0, Math.floor(nextWatchCount));

  if (watchCount === 0) {
    await db.runAsync('DELETE FROM movie_user_state WHERE profile_id = ? AND movie_id = ?', [profileId, movieId]);
    return 0;
  }

  await db.runAsync(
    `INSERT INTO movie_user_state (profile_id, movie_id, watch_count, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(profile_id, movie_id)
     DO UPDATE SET watch_count = excluded.watch_count, updated_at = excluded.updated_at`,
    [profileId, movieId, watchCount, now],
  );
  return watchCount;
}

export async function incrementWatchCount(movieId: string, incrementBy = 1) {
  const current = await getWatchCount(movieId);
  const next = current + incrementBy;
  return setWatchCount(movieId, next);
}

export async function clearWatchStateForMovie(movieId: string) {
  return setWatchCount(movieId, 0);
}

export async function clearAllWatchState() {
  const db = await getDatabase();
  const profileId = await getOrCreateActiveProfileId();
  await db.runAsync('DELETE FROM movie_user_state WHERE profile_id = ?', [profileId]);
}
