import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AppScrollScreen,
  AppText,
  Button,
  DestructiveButton,
  InlineNotice,
  PageHeader,
  TextField,
  ValidationSummaryCard,
} from '@/foundation/components';
import { categoryTypeUiLabelByType } from '@/foundation/presentation/categoryTypeLabels';
import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import { createCategory, deleteCategoryById, getCategoryById, getCategoryEntryCountById, updateCategory } from '@/foundation/services/storage/categoryRepository';
import { categoryToneByType, spacing } from '@/foundation/theme';
import { createValidationGate } from '@/foundation/validation/createValidationGate';
import { useValidationAnchors } from '@/foundation/validation/useValidationAnchors';
import type { ValidationIssue } from '@/foundation/validation/types';
import { validateCreateCategory } from '@/features/categories/validation/createCategoryValidation';

type CategoryTypeOption = {
  value: 'quickCount' | 'timedActivity' | 'journal';
  label: string;
};

const categoryTypeOptions: CategoryTypeOption[] = [
  { value: 'quickCount', label: categoryTypeUiLabelByType.quickCount },
  { value: 'timedActivity', label: categoryTypeUiLabelByType.timedActivity },
  { value: 'journal', label: categoryTypeUiLabelByType.journal },
];

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function buildCategoryId() {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CreateCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const editingCategoryId = typeof params.categoryId === 'string' ? params.categoryId : '';
  const isEditing = editingCategoryId.length > 0 && editingCategoryId !== 'undefined' && editingCategoryId !== 'null';
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState<CategoryTypeOption['value']>('quickCount');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [allowWarningContinue, setAllowWarningContinue] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const nameInputRef = useRef<TextInput>(null);
  const measurementUnitRef = useRef<TextInput>(null);
  const [measurementUnit, setMeasurementUnit] = useState('');
  const { registerAnchor, focusAnchor } = useValidationAnchors();
  const isValid = useMemo(
    () => validateCreateCategory({ name, categoryType, measurementUnit }).every((issue) => issue.severity !== 'blocking'),
    [name, categoryType, measurementUnit],
  );

  useEffect(() => registerAnchor('categoryName', () => nameInputRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('measurementUnit', () => measurementUnitRef.current?.focus()), [registerAnchor]);
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const [existing, existingEntryCount] = await Promise.all([
        getCategoryById(editingCategoryId),
        getCategoryEntryCountById(editingCategoryId),
      ]);
      if (!cancelled && existing) {
        setName(existing.name);
        setCategoryType(existing.categoryType);
        setMeasurementUnit(existing.measurementUnit);
        setEntryCount(existingEntryCount);
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editingCategoryId, isEditing]);

  const handleCreate = async () => {
    if (isSaving) return;

    const nextIssues = validateCreateCategory({ name, categoryType, measurementUnit });
    setIssues(nextIssues);
    const gate = createValidationGate(nextIssues, { allowContinueOnWarnings: allowWarningContinue });

    if (gate.kind === 'blocked') {
      focusAnchor(gate.firstAnchor ?? gate.firstFieldId);
      return;
    }

    if (gate.kind === 'continue_with_warnings') {
      focusAnchor(gate.firstAnchor ?? gate.firstFieldId);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const id = editingCategoryId || buildCategoryId();
      const payload = {
        id,
        name: name.trim(),
        categoryType,
        measurementUnit: categoryType === 'quickCount' ? measurementUnit.trim() : '',
      };
      if (isEditing) {
        await updateCategory(payload);
      } else {
        await createCategory(payload);
      }
      router.replace('/(tabs)/home');
    } catch {
      setError('Unable to create category. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
  const hasExistingEntries = isEditing && entryCount > 0;
  const isMeasureCategory = categoryType === 'quickCount';

  const handleDelete = async () => {
    if (!isEditing) return;
    const confirmed = await confirmDialog({
      title: 'Delete category?',
      message: 'All data for this category will be permanently lost, including all captured entries.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    await deleteCategoryById(editingCategoryId);
    router.replace('/(tabs)/home');
  };

  return (
    <AppScrollScreen>
      <View style={styles.headerTopSpacing}>
        <PageHeader
          title={isEditing ? 'Edit category' : 'Create category'}
          subtitle={isEditing ? 'Update this capture category.' : 'Set up a new capture category.'}
          rightAction={{ buttonType: 'close', accessibilityLabel: 'Close category wizard', onPress: () => router.back() }}
        />
      </View>

      <View style={styles.content}>
        {isLoading ? <AppText>Loading category...</AppText> : null}
        <View style={styles.section}>
          <AppText variant="bodyStrong">Category type</AppText>
          {hasExistingEntries ? (
            <AppText variant="bodySmall">
              Category type and unit can only be changed before the first entry is saved for this category.
            </AppText>
          ) : null}
          <View style={styles.optionsRow}>
            {categoryTypeOptions.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                onPress={() => setCategoryType(option.value)}
                variant={categoryType === option.value ? 'solid' : 'outline'}
                tone={categoryToneByType[option.value]}
                size="sm"
                disabled={hasExistingEntries}
              />
            ))}
          </View>
        </View>

        <TextField
          ref={nameInputRef}
          value={name}
          onChangeText={(value) => setName(toTitleCase(value))}
          placeholder="Category name"
          accessibilityLabel="Category name"
          autoCapitalize="words"
          returnKeyType="done"
        />

        {isMeasureCategory ? (
          <TextField
            ref={measurementUnitRef}
            value={measurementUnit}
            onChangeText={setMeasurementUnit}
            placeholder="Unit (e.g. mm, inch, mmHg, C, F)"
            accessibilityLabel="Measurement unit"
            autoCapitalize="none"
            editable={!hasExistingEntries}
          />
        ) : null}

        {error ? <InlineNotice message={error} /> : null}
        {blockingIssues.length > 0 ? (
          <ValidationSummaryCard
            title="Fix before creating"
            issues={blockingIssues}
            onPrimaryAction={() => focusAnchor(blockingIssues[0]?.anchor ?? blockingIssues[0]?.fieldId)}
            primaryActionLabel="Review field"
          />
        ) : null}
        {warningIssues.length > 0 ? (
          <ValidationSummaryCard
            title="Warnings to review"
            issues={warningIssues}
            onPrimaryAction={() => {
              setAllowWarningContinue(false);
              focusAnchor(warningIssues[0]?.anchor ?? warningIssues[0]?.fieldId);
            }}
            primaryActionLabel="Review"
            onSecondaryAction={() => {
              setAllowWarningContinue(true);
              void handleCreate();
            }}
            secondaryActionLabel="Continue anyway"
          />
        ) : null}

        <Button
          label={isSaving ? 'Saving...' : isEditing ? 'Save category' : 'Create category'}
          onPress={() => void handleCreate()}
          disabled={!isValid || isSaving || isLoading}
          size="lg"
          variant="solid"
          tone={isEditing ? 'teal' : 'green'}
        />
        {isEditing ? (
          <DestructiveButton
            label="Delete category"
            onPress={() => void handleDelete()}
            tone="danger"
            size="lg"
          />
        ) : null}
      </View>
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  headerTopSpacing: {
    paddingTop: spacing.sm,
  },
  content: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
