import { buildOccurredAtIso } from '@/foundation/lib/dateTime';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';
import { createQuickCountEntry } from '@/foundation/services/storage/entryRepository';
import { endTimeEntry, getActiveTimeEntry, type ActiveTimeEntry, startTimeEntry } from '@/foundation/services/storage/timeCaptureRepository';

export type CaptureWizardLoadResult = {
  category: CategoryRecord | null;
  activeTimeEntry: ActiveTimeEntry | null;
};

export async function loadCaptureWizardCategory(categoryId: string): Promise<CaptureWizardLoadResult> {
  if (!categoryId) return { category: null, activeTimeEntry: null };

  const category = await getCategoryById(categoryId);
  if (!category) return { category: null, activeTimeEntry: null };

  if (category.categoryType !== 'timedActivity') {
    return { category, activeTimeEntry: null };
  }

  const activeTimeEntry = await getActiveTimeEntry(category.id);
  return { category, activeTimeEntry };
}

type SaveQuickCountCaptureInput = {
  categoryId: string;
  countValue: string;
  entryDate: string;
  entryTime: string;
  locationId: string | null;
};

export async function saveQuickCountCapture(input: SaveQuickCountCaptureInput): Promise<void> {
  const occurredAtResult = buildOccurredAtIso(input.entryDate, input.entryTime);
  if (!occurredAtResult.iso) {
    throw new Error(occurredAtResult.error ?? 'Date and time are invalid.');
  }

  await createQuickCountEntry({
    categoryId: input.categoryId,
    value: Number(input.countValue.trim()),
    locationId: input.locationId,
    occurredAt: occurredAtResult.iso,
  });
}

type SaveTimedActivityCaptureInput = {
  categoryId: string;
  entryDate: string;
  entryTime: string;
  locationId: string | null;
  activeTimeEntry: ActiveTimeEntry | null;
};

export async function saveTimedActivityCapture(input: SaveTimedActivityCaptureInput): Promise<void> {
  const occurredAtResult = buildOccurredAtIso(input.entryDate, input.entryTime);
  if (!occurredAtResult.iso) {
    throw new Error(occurredAtResult.error ?? 'Date and time are invalid.');
  }

  if (input.activeTimeEntry) {
    await endTimeEntry({ entryId: input.activeTimeEntry.entryId, endedAt: occurredAtResult.iso, locationId: input.locationId });
    return;
  }

  await startTimeEntry({ categoryId: input.categoryId, startedAt: occurredAtResult.iso, locationId: input.locationId });
}
