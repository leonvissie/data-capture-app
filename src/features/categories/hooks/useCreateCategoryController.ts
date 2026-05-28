import { useCallback, useEffect, useMemo, useState } from 'react';

import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import { createCategory, deleteCategoryById, getCategoryById, getCategoryEntryCountById, updateCategory } from '@/foundation/services/storage/categoryRepository';
import { listJournalSections, saveJournalSections } from '@/foundation/services/storage/journalSectionRepository';
import { createValidationGate } from '@/foundation/validation/createValidationGate';
import type { ValidationIssue } from '@/foundation/validation/types';
import type { JournalSectionDraft } from '@/features/categories/types/journal';
import { validateCreateCategory } from '@/features/categories/validation/createCategoryValidation';

type CategoryType = 'quickCount' | 'timedActivity' | 'journal';

type UseCreateCategoryControllerInput = {
  editingCategoryId: string;
  isEditing: boolean;
  name: string;
  categoryType: CategoryType;
  measurementUnit: string;
  journalSections: JournalSectionDraft[];
  focusAnchor: (anchor?: string) => void;
  onSaved: () => void;
};

function buildCategoryId() {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCreateCategoryController(input: UseCreateCategoryControllerInput) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [allowWarningContinue, setAllowWarningContinue] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [loadedName, setLoadedName] = useState('');
  const [loadedCategoryType, setLoadedCategoryType] = useState<CategoryType>('quickCount');
  const [loadedMeasurementUnit, setLoadedMeasurementUnit] = useState('');
  const [loadedJournalSections, setLoadedJournalSections] = useState<JournalSectionDraft[]>([]);

  useEffect(() => {
    if (!input.isEditing) return;
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const [existing, existingEntryCount] = await Promise.all([
        getCategoryById(input.editingCategoryId),
        getCategoryEntryCountById(input.editingCategoryId),
      ]);
      if (!cancelled && existing) {
        setLoadedName(existing.name);
        setLoadedCategoryType(existing.categoryType);
        setLoadedMeasurementUnit(existing.measurementUnit);
        setEntryCount(existingEntryCount);
        if (existing.categoryType === 'journal') {
          const journalSections = await listJournalSections(input.editingCategoryId);
          if (!cancelled) setLoadedJournalSections(journalSections);
        }
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [input.editingCategoryId, input.isEditing]);

  const isValid = useMemo(
    () =>
      validateCreateCategory({
        name: input.name,
        categoryType: input.categoryType,
        measurementUnit: input.measurementUnit,
        journalSections: input.journalSections,
      }).every((issue) => issue.severity !== 'blocking'),
    [input.name, input.categoryType, input.measurementUnit, input.journalSections],
  );

  const saveCategory = useCallback(async () => {
    if (isSaving) return;

    const nextIssues = validateCreateCategory({
      name: input.name,
      categoryType: input.categoryType,
      measurementUnit: input.measurementUnit,
      journalSections: input.journalSections,
    });
    setIssues(nextIssues);
    const gate = createValidationGate(nextIssues, { allowContinueOnWarnings: allowWarningContinue });

    if (gate.kind === 'blocked' || gate.kind === 'continue_with_warnings') {
      input.focusAnchor(gate.firstAnchor ?? gate.firstFieldId);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const id = input.editingCategoryId || buildCategoryId();
      const payload = {
        id,
        name: input.name.trim(),
        categoryType: input.categoryType,
        measurementUnit: input.categoryType === 'quickCount' ? input.measurementUnit.trim() : '',
      };
      if (input.isEditing) {
        await updateCategory(payload);
      } else {
        await createCategory(payload);
      }
      if (input.categoryType === 'journal') {
        await saveJournalSections(id, input.journalSections);
      }
      input.onSaved();
    } catch {
      setError(input.isEditing ? 'Unable to save category. Please try again.' : 'Unable to create category. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, input, allowWarningContinue]);

  const deleteCategory = useCallback(async () => {
    if (!input.isEditing) return;
    const confirmed = await confirmDialog({
      title: 'Delete category?',
      message: 'All data for this category will be permanently lost, including all captured entries.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    await deleteCategoryById(input.editingCategoryId);
    input.onSaved();
  }, [input]);

  return {
    isSaving,
    error,
    isLoading,
    issues,
    allowWarningContinue,
    setAllowWarningContinue,
    entryCount,
    isValid,
    loadedName,
    loadedCategoryType,
    loadedMeasurementUnit,
    loadedJournalSections,
    saveCategory,
    deleteCategory,
  };
}
