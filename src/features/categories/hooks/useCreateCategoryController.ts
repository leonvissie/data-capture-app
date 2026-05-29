import { useCallback, useEffect, useMemo, useState } from 'react';

import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import { createCategory, deleteCategoryById, getCategoryById, getCategoryEntryCountById, listCategories, updateCategory } from '@/foundation/services/storage/categoryRepository';
import { listJournalSections, saveJournalSections } from '@/foundation/services/storage/journalSectionRepository';
import { submitWithValidation } from '@/foundation/validation/submitWithValidation';
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
  const [existingCategories, setExistingCategories] = useState<Array<{ id: string; name: string; categoryType: CategoryType }>>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [loadedName, setLoadedName] = useState('');
  const [loadedCategoryType, setLoadedCategoryType] = useState<CategoryType>('quickCount');
  const [loadedMeasurementUnit, setLoadedMeasurementUnit] = useState('');
  const [loadedJournalSections, setLoadedJournalSections] = useState<JournalSectionDraft[]>([]);

  const buildValidationIssues = useCallback(
    () =>
      validateCreateCategory({
        name: input.name,
        categoryType: input.categoryType,
        measurementUnit: input.measurementUnit,
        journalSections: input.journalSections,
        editingCategoryId: input.editingCategoryId,
        existingCategories,
        entryCount,
        loadedCategoryType,
        loadedMeasurementUnit,
        loadedJournalSections,
      }),
    [
      input.name,
      input.categoryType,
      input.measurementUnit,
      input.journalSections,
      input.editingCategoryId,
      existingCategories,
      entryCount,
      loadedCategoryType,
      loadedMeasurementUnit,
      loadedJournalSections,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const categories = await listCategories();
      if (cancelled) return;
      setExistingCategories(categories.map((category) => ({ id: category.id, name: category.name, categoryType: category.categoryType })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const isReadyToSubmit = useMemo(() => buildValidationIssues().every((issue) => issue.severity !== 'blocking'), [buildValidationIssues]);

  const requestWarningConfirm = useCallback(async (warningMessages: string[]) => {
    return confirmDialog({
      title: 'Review warnings before saving',
      message: 'Please review these warnings before continuing.',
      warningItems: warningMessages,
      confirmText: 'Continue anyway',
      cancelText: 'Review fields',
    });
  }, []);

  const saveCategory = useCallback(async () => {
    if (isSaving) return;

    await submitWithValidation({
      issues: buildValidationIssues(),
      setIssues,
      focusAnchor: input.focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
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
        } catch (error) {
          if (error instanceof Error && error.message) {
            setError(error.message);
            return;
          }
          setError(input.isEditing ? 'Unable to save category. Please try again.' : 'Unable to create category. Please try again.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  }, [isSaving, input, buildValidationIssues, requestWarningConfirm]);

  useEffect(() => {
    if (issues.length === 0) return;
    const next = buildValidationIssues();
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
  }, [issues, buildValidationIssues]);

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
    entryCount,
    isReadyToSubmit,
    loadedName,
    loadedCategoryType,
    loadedMeasurementUnit,
    loadedJournalSections,
    saveCategory,
    deleteCategory,
  };
}
