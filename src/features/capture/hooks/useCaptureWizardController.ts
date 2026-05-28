import { useCallback, useEffect, useMemo, useState } from 'react';

import { getDraftLocationValidationError } from '@/foundation/hooks/useEntryLocationController';
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadCaptureWizardCategory(input.categoryId);
      if (cancelled) return;
      setCategory(loaded.category);
      setActiveTimeEntry(loaded.activeTimeEntry);
      setJournalSections(loaded.journalSections);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [input.categoryId]);

  const validateQuickCount = useCallback(
    (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      const locationValidationError =
        mode === 'submit' ? input.validateDraftLocationName() : getDraftLocationValidationError(input.draftLocationName);
      return validateQuickCountCapture({
        countValue: input.countValue,
        entryDate: input.entryDate,
        entryTime: input.entryTime,
        locationValidationError,
      });
    },
    [input],
  );

  const validateTimedActivity = useCallback(
    (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      const locationValidationError =
        mode === 'submit' ? input.validateDraftLocationName() : getDraftLocationValidationError(input.draftLocationName);
      return validateTimedActivityCapture({
        entryDate: input.entryDate,
        entryTime: input.entryTime,
        activeStartIso: activeTimeEntry?.startedAt ?? null,
        locationValidationError,
      });
    },
    [input, activeTimeEntry?.startedAt],
  );

  const validateJournal = useCallback(
    (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
      const locationValidationError =
        mode === 'submit' ? input.validateDraftLocationName() : getDraftLocationValidationError(input.draftLocationName);
      return validateJournalCapture({
        entryDate: input.entryDate,
        entryTime: input.entryTime,
        sections: journalSections,
        valuesBySectionId: input.journalValuesBySectionId,
        locationValidationError,
      });
    },
    [input, journalSections],
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
    if (input.draftLocationName.trim()) {
      const createdOrReused = await input.addOrReuseLocation();
      if (!createdOrReused) throw new Error(input.locationError ?? 'Location is invalid.');
      locationIdForSave = createdOrReused.id;
      input.setSelectedLocationId(createdOrReused.id);
    }
    return locationIdForSave;
  }, [input]);

  const saveQuickCount = useCallback(async () => {
    if (!category || category.categoryType !== 'quickCount' || isSaving) return;
    await submitWithValidation({
      issues: validateQuickCount(),
      setIssues,
      focusAnchor: input.focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const locationId = await prepareLocationForSave();
          await saveQuickCountCapture({
            categoryId: category.id,
            countValue: input.countValue,
            entryDate: input.entryDate,
            entryTime: input.entryTime,
            locationId,
          });
          input.onSaved();
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
  }, [category, isSaving, validateQuickCount, input, requestWarningConfirm, prepareLocationForSave]);

  const saveTimedActivity = useCallback(async () => {
    if (!category || category.categoryType !== 'timedActivity' || isSaving) return;
    await submitWithValidation({
      issues: validateTimedActivity(),
      setIssues,
      focusAnchor: input.focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const locationId = await prepareLocationForSave();
          await saveTimedActivityCapture({
            categoryId: category.id,
            entryDate: input.entryDate,
            entryTime: input.entryTime,
            locationId,
            activeTimeEntry,
          });
          input.onSaved();
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
  }, [category, isSaving, validateTimedActivity, input, requestWarningConfirm, prepareLocationForSave, activeTimeEntry]);

  const saveJournal = useCallback(async () => {
    if (!category || category.categoryType !== 'journal' || isSaving) return;
    await submitWithValidation({
      issues: validateJournal(),
      setIssues,
      focusAnchor: input.focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const locationId = await prepareLocationForSave();
          await saveJournalCapture({
            categoryId: category.id,
            entryDate: input.entryDate,
            entryTime: input.entryTime,
            locationId,
            sections: journalSections,
            valuesBySectionId: input.journalValuesBySectionId,
          });
          input.onSaved();
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
  }, [category, isSaving, validateJournal, input, requestWarningConfirm, prepareLocationForSave, journalSections]);

  const isReadyToSubmit = useMemo(() => {
    if (!category) return false;
    return validateForCategoryType(category.categoryType, 'peek').every((issue) => issue.severity !== 'blocking');
  }, [category, validateForCategoryType]);

  useEffect(() => {
    if (!category || issues.length === 0) return;
    setIssues(validateForCategoryType(category.categoryType, 'peek'));
  }, [issues.length, category, validateForCategoryType]);

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
