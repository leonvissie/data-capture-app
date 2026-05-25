import { getDatabase } from '@/features/watch-state/data/database';
import type { TourPrefs } from '@/features/tour/types';

const TOUR_COMPLETED_KEY = 'tour_completed';
const TOUR_SAVED_STEP_KEY = 'tour_saved_step';
const TOUR_IS_FIRST_LOAD_KEY = 'tour_is_first_load';

async function getMeta(key: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string) {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function loadTourPrefs(): Promise<TourPrefs> {
  const [firstLoadRaw, completedRaw, savedStepRaw] = await Promise.all([
    getMeta(TOUR_IS_FIRST_LOAD_KEY),
    getMeta(TOUR_COMPLETED_KEY),
    getMeta(TOUR_SAVED_STEP_KEY),
  ]);

  const isFirstLoad = firstLoadRaw == null ? true : firstLoadRaw === '1';
  const hasCompleted = completedRaw === '1';
  const parsedSaved = Number(savedStepRaw ?? '0');
  const savedStepIndex = Number.isFinite(parsedSaved) && parsedSaved >= 0 ? Math.floor(parsedSaved) : 0;

  return { isFirstLoad, hasCompleted, savedStepIndex };
}

export async function setTourIsFirstLoad(isFirstLoad: boolean) {
  await setMeta(TOUR_IS_FIRST_LOAD_KEY, isFirstLoad ? '1' : '0');
}

export async function setTourCompleted(hasCompleted: boolean) {
  await setMeta(TOUR_COMPLETED_KEY, hasCompleted ? '1' : '0');
}

export async function setTourSavedStep(savedStepIndex: number) {
  const safeStep = Number.isFinite(savedStepIndex) && savedStepIndex >= 0 ? Math.floor(savedStepIndex) : 0;
  await setMeta(TOUR_SAVED_STEP_KEY, String(safeStep));
}

export async function resetTourPrefs() {
  await Promise.all([setTourIsFirstLoad(true), setTourCompleted(false), setTourSavedStep(0)]);
}
