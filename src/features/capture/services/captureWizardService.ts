import { buildOccurredAtIso } from '@/foundation/lib/dateTime';
import { listJournalSections } from '@/foundation/services/storage/journalSectionRepository';
import { createJournalEntry } from '@/foundation/services/storage/journalEntryRepository';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';
import { createQuickCountEntry } from '@/foundation/services/storage/entryRepository';
import { endTimeEntry, getActiveTimeEntry, type ActiveTimeEntry, startTimeEntry } from '@/foundation/services/storage/timeCaptureRepository';
import type { JournalSectionDraft } from '@/features/categories/types/journal';

export type CaptureWizardLoadResult = {
  category: CategoryRecord | null;
  activeTimeEntry: ActiveTimeEntry | null;
  journalSections: JournalSectionDraft[];
};

export async function loadCaptureWizardCategory(categoryId: string): Promise<CaptureWizardLoadResult> {
  if (!categoryId) return { category: null, activeTimeEntry: null, journalSections: [] };

  const category = await getCategoryById(categoryId);
  if (!category) return { category: null, activeTimeEntry: null, journalSections: [] };

  if (category.categoryType === 'journal') {
    const journalSections = await listJournalSections(category.id);
    return { category, activeTimeEntry: null, journalSections };
  }

  if (category.categoryType !== 'timedActivity') {
    return { category, activeTimeEntry: null, journalSections: [] };
  }

  const activeTimeEntry = await getActiveTimeEntry(category.id);
  return { category, activeTimeEntry, journalSections: [] };
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

type SaveJournalCaptureInput = {
  categoryId: string;
  entryDate: string;
  entryTime: string;
  locationId: string | null;
  sections: JournalSectionDraft[];
  valuesBySectionId: Record<string, string | string[]>;
};

export async function saveJournalCapture(input: SaveJournalCaptureInput): Promise<void> {
  const occurredAtResult = buildOccurredAtIso(input.entryDate, input.entryTime);
  if (!occurredAtResult.iso) {
    throw new Error(occurredAtResult.error ?? 'Date and time are invalid.');
  }

  await createJournalEntry({
    categoryId: input.categoryId,
    occurredAt: occurredAtResult.iso,
    locationId: input.locationId,
    sections: input.sections,
    valuesBySectionId: input.valuesBySectionId,
  });
}
