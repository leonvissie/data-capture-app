import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDraftLocationValidationError } from '@/foundation/hooks/useEntryLocationController';
import { buildOccurredAtIso } from '@/foundation/lib/dateTime';
import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import type { ActiveTimeEntry } from '@/foundation/services/storage/timeCaptureRepository';
import { submitWithValidation } from '@/foundation/validation/submitWithValidation';
import type { ValidationIssue } from '@/foundation/validation/types';
import { loadCaptureWizardCategory, saveJournalCapture, saveQuickCountCapture, saveTimedActivityCapture } from '@/features/capture/services/captureWizardService';
import type { JournalSectionDraft } from '@/features/categories/types/journal';
import { validateQuickCountCapture } from '@/features/capture/validation/quickCountCaptureValidation';
import { validateJournalCapture } from '@/features/capture/validation/journalCaptureValidation';
import { validateTimedActivityCapture } from '@/features/capture/validation/timedActivityCaptureValidation';

type CategoryType = 'quickCount' | 'timedActivity' | 'journal';

type UseCaptureWizardControllerInput = {
  categoryId: string;
  countValue: string;
  entryDate: string;
  entryTime: string;
  selectedLocationId: string | null;
  isNoneLocationSelected: boolean;
  draftLocationName: string;
  validateDraftLocationName: () => string | null;
  addOrReuseLocation: () => Promise<{ id: string } | null>;
  locationError: string | null;
  journalValuesBySectionId: Record<string, string | string[]>;
  focusAnchor: (anchor?: string) => void;
  onSaved: () => void;
  setSelectedLocationId: (id: string | null) => void;
};

export function useCaptureWizardController(input: UseCaptureWizardControllerInput) {
  const {
    categoryId,
    countValue,
    entryDate,
    entryTime,
    selectedLocationId,
    isNoneLocationSelected,
    draftLocationName,
    validateDraftLocationName,
    addOrReuseLocation,
    locationError,
    journalValuesBySectionId,
    focusAnchor,
    onSaved,
    setSelectedLocationId,
  } = input;

  const [isLoading, setIsLoading] = useState(true);
  const [category, setCategory] = useState<{
    id: string;
    name: string;
    categoryType: CategoryType;
    measurementUnit: string;
  } | null>(null);
  const [activeTimeEntry, setActiveTimeEntry] = useState<ActiveTimeEntry | null>(null);
  const [journalSections, setJournalSections] = useState<JournalSectionDraft[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const getLocationValidationError = useCallback(
    (mode: 'peek' | 'submit'): string | null => {
      const hasSelectedLocation = Boolean(selectedLocationId) || isNoneLocationSelected;
      const hasDraftLocation = draftLocationName.trim().length > 0;
      if (!hasSelectedLocation && !hasDraftLocation) {
        return 'Location is required. Select a location or add a new one.';
      }
      return mode === 'submit' ? validateDraftLocationName() : getDraftLocationValidationError(draftLocationName);
    },
    [selectedLocationId, isNoneLocationSelected, draftLocationName, validateDraftLocationName],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadCaptureWizardCategory(categoryId);
      if (cancelled) return;
      setCategory(loaded.category);
      setActiveTimeEntry(loaded.activeTimeEntry);
      setJournalSections(loaded.journalSections);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const validateQuickCount = useCallback(
    (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      const locationValidationError = getLocationValidationError(mode);
      return validateQuickCountCapture({
        countValue,
        entryDate,
        entryTime,
        locationValidationError,
      });
    },
    [countValue, entryDate, entryTime, getLocationValidationError],
  );

  const validateTimedActivity = useCallback(
    (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      const locationValidationError = getLocationValidationError(mode);
      return validateTimedActivityCapture({
        entryDate,
        entryTime,
        activeStartIso: activeTimeEntry?.startedAt ?? null,
        locationValidationError,
      });
    },
    [entryDate, entryTime, getLocationValidationError, activeTimeEntry?.startedAt],
  );

  const validateJournal = useCallback(
    (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      const locationValidationError = getLocationValidationError(mode);
      return validateJournalCapture({
        entryDate,
        entryTime,
        sections: journalSections,
        valuesBySectionId: journalValuesBySectionId,
        locationValidationError,
      });
    },
    [entryDate, entryTime, getLocationValidationError, journalSections, journalValuesBySectionId],
  );

  const validateForCategoryType = useCallback(
    (type: CategoryType, mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      if (type === 'quickCount') return validateQuickCount(mode);
      if (type === 'timedActivity') return validateTimedActivity(mode);
      return validateJournal(mode);
    },
    [validateQuickCount, validateTimedActivity, validateJournal],
  );

  const requestWarningConfirm = useCallback(async (warningMessages: string[]) => {
    return confirmDialog({
      title: 'Review warnings before saving',
      message: 'Please review these warnings before continuing.',
      warningItems: warningMessages,
      confirmText: 'Continue anyway',
      cancelText: 'Review fields',
    });
  }, []);

  const prepareLocationForSave = useCallback(async () => {
    let locationIdForSave = input.selectedLocationId;
    if (draftLocationName.trim()) {
      const createdOrReused = await addOrReuseLocation();
      if (!createdOrReused) throw new Error(locationError ?? 'Location is invalid.');
      locationIdForSave = createdOrReused.id;
      setSelectedLocationId(createdOrReused.id);
    }
    return locationIdForSave;
  }, [selectedLocationId, draftLocationName, addOrReuseLocation, locationError, setSelectedLocationId]);

  const saveQuickCount = useCallback(async () => {
    if (!category || category.categoryType !== 'quickCount' || isSaving) return;
    await submitWithValidation({
      issues: validateQuickCount(),
      setIssues,
      focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const locationId = await prepareLocationForSave();
          await saveQuickCountCapture({
            categoryId: category.id,
            countValue,
            entryDate,
            entryTime,
            locationId,
          });
          onSaved();
        } catch (error) {
          if (error instanceof Error && error.message) {
            setSaveError(error.message);
            return;
          }
          setSaveError('Unable to save measurement entry. Please try again.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  }, [category, isSaving, validateQuickCount, focusAnchor, requestWarningConfirm, prepareLocationForSave, countValue, entryDate, entryTime, onSaved]);

  const saveTimedActivity = useCallback(async () => {
    if (!category || category.categoryType !== 'timedActivity' || isSaving) return;
    await submitWithValidation({
      issues: validateTimedActivity(),
      setIssues,
      focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const locationId = await prepareLocationForSave();
          const occurredAt = buildOccurredAtIso(entryDate, entryTime);
          if (!occurredAt.iso) {
            setSaveError(occurredAt.error ?? 'Date and time are invalid.');
            return;
          }

          await saveTimedActivityCapture({
            categoryId: category.id,
            entryDate,
            entryTime,
            locationId,
            activeTimeEntry,
          });
          onSaved();
        } catch (error) {
          if (error instanceof Error && error.message) {
            setSaveError(error.message);
            return;
          }
          setSaveError('Unable to save time entry. Please try again.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  }, [category, isSaving, validateTimedActivity, focusAnchor, requestWarningConfirm, prepareLocationForSave, activeTimeEntry, entryDate, entryTime, onSaved]);

  const saveJournal = useCallback(async () => {
    if (!category || category.categoryType !== 'journal' || isSaving) return;
    await submitWithValidation({
      issues: validateJournal(),
      setIssues,
      focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const locationId = await prepareLocationForSave();
          await saveJournalCapture({
            categoryId: category.id,
            entryDate,
            entryTime,
            locationId,
            sections: journalSections,
            valuesBySectionId: journalValuesBySectionId,
          });
          onSaved();
        } catch (error) {
          if (error instanceof Error && error.message) {
            setSaveError(error.message);
            return;
          }
          setSaveError('Unable to save journal entry. Please try again.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  }, [category, isSaving, validateJournal, focusAnchor, requestWarningConfirm, prepareLocationForSave, journalSections, journalValuesBySectionId, entryDate, entryTime, onSaved]);

  const isReadyToSubmit = useMemo(() => {
    if (!category) return false;
    return validateForCategoryType(category.categoryType, 'peek').every((issue) => issue.severity !== 'blocking');
  }, [category, validateForCategoryType]);

  useEffect(() => {
    if (!category || issues.length === 0) return;
    const next = validateForCategoryType(category.categoryType, 'peek');
    const same =
      next.length === issues.length &&
      next.every((issue, index) => {
        const current = issues[index];
        return (
          current?.key === issue.key &&
          current?.severity === issue.severity &&
          current?.message === issue.message &&
          current?.fieldId === issue.fieldId &&
          current?.anchor === issue.anchor
        );
      });
    if (!same) {
      setIssues(next);
    }
  }, [issues, category, validateForCategoryType]);

  return {
    isLoading,
    category,
    activeTimeEntry,
    journalSections,
    issues,
    isSaving,
    saveError,
    isReadyToSubmit,
    setSaveError,
    saveQuickCount,
    saveTimedActivity,
    saveJournal,
  };
}
