import { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScrollScreen, AppText, Button, InlineNotice, PageHeader, PrimaryButton, TextField, ValidationSummaryCard } from '@/foundation/components';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';
import { createQuickCountEntry } from '@/foundation/services/storage/entryRepository';
import { useValidationAnchors } from '@/foundation/validation/useValidationAnchors';
import { createValidationGate } from '@/foundation/validation/createValidationGate';
import type { ValidationIssue } from '@/foundation/validation/types';
import { spacing } from '@/foundation/theme';

function getWizardCopy(category: CategoryRecord) {
  if (category.categoryType === 'quickCount') {
    return {
      title: 'Count capture',
      detail: 'Count capture flow will be implemented next for this category.',
    };
  }
  if (category.categoryType === 'timedActivity') {
    return {
      title: 'Time capture',
      detail: 'Time capture flow will be implemented next for this category.',
    };
  }
  return {
    title: 'Journal capture',
    detail: 'Journal capture flow will be implemented next for this category.',
  };
}

export function CaptureWizardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : '';

  const [isLoading, setIsLoading] = useState(true);
  const [category, setCategory] = useState<CategoryRecord | null>(null);
  const [countValue, setCountValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const countRef = useRef<TextInput>(null);
  const { registerAnchor, focusAnchor } = useValidationAnchors();

  useEffect(() => registerAnchor('countValue', () => countRef.current?.focus()), [registerAnchor]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!categoryId) {
        setCategory(null);
        setIsLoading(false);
        return;
      }
      const next = await getCategoryById(categoryId);
      if (!cancelled) {
        setCategory(next);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const copy = useMemo(() => (category ? getWizardCopy(category) : null), [category]);
  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');

  const validateQuickCount = (): ValidationIssue[] => {
    const trimmed = countValue.trim();
    const next: ValidationIssue[] = [];
    if (!trimmed) {
      next.push({
        key: 'count_required',
        severity: 'blocking',
        message: 'Count is required.',
        fieldId: 'countValue',
        anchor: 'countValue',
      });
      return next;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) {
      next.push({
        key: 'count_invalid',
        severity: 'blocking',
        message: 'Count must be greater than zero.',
        fieldId: 'countValue',
        anchor: 'countValue',
      });
      return next;
    }
    if (value > 500) {
      next.push({
        key: 'count_high_warning',
        severity: 'warning',
        message: 'This is a high count value. Confirm this is intended.',
        fieldId: 'countValue',
        anchor: 'countValue',
      });
    }
    return next;
  };

  const saveQuickCount = async (allowWarningContinue: boolean) => {
    if (!category || category.categoryType !== 'quickCount' || isSaving) return;
    const nextIssues = validateQuickCount();
    setIssues(nextIssues);
    const gate = createValidationGate(nextIssues, { allowContinueOnWarnings: allowWarningContinue });
    if (gate.kind !== 'proceed') {
      focusAnchor(gate.firstAnchor ?? gate.firstFieldId);
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await createQuickCountEntry({
        categoryId: category.id,
        value: Number(countValue.trim()),
      });
      router.replace('/(tabs)/home');
    } catch {
      setSaveError('Unable to save count entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppScrollScreen>
      <PageHeader
        title="Capture wizard"
        subtitle={category ? category.name : 'Category'}
        leftAction={{ buttonType: 'back', accessibilityLabel: 'Go back', onPress: () => router.back() }}
      />

      {isLoading ? <AppText>Loading capture wizard...</AppText> : null}
      {!isLoading && !category ? <InlineNotice message="Category not found. Return to Capture and try again." /> : null}
      {!isLoading && category && copy ? (
        <>
          <AppText variant="sectionTitle">{copy.title}</AppText>
          <AppText>{copy.detail}</AppText>
          {category.categoryType === 'quickCount' ? (
            <View style={{ gap: spacing.md }}>
              <TextField
                ref={countRef}
                value={countValue}
                onChangeText={(value) => setCountValue(value.replace(/[^\d]/g, ''))}
                placeholder="Count value"
                accessibilityLabel="Count value"
                keyboardType="number-pad"
              />
              {saveError ? <InlineNotice message={saveError} /> : null}
              {blockingIssues.length > 0 ? (
                <ValidationSummaryCard
                  title="Fix before saving"
                  issues={blockingIssues}
                  onPrimaryAction={() => focusAnchor(blockingIssues[0]?.anchor ?? blockingIssues[0]?.fieldId)}
                  primaryActionLabel="Review field"
                />
              ) : null}
              {warningIssues.length > 0 ? (
                <ValidationSummaryCard
                  title="Warnings to review"
                  issues={warningIssues}
                  onPrimaryAction={() => focusAnchor(warningIssues[0]?.anchor ?? warningIssues[0]?.fieldId)}
                  primaryActionLabel="Review"
                  onSecondaryAction={() => void saveQuickCount(true)}
                  secondaryActionLabel="Continue anyway"
                />
              ) : null}
              <PrimaryButton label={isSaving ? 'Saving...' : 'Save count entry'} onPress={() => void saveQuickCount(false)} disabled={isSaving} />
            </View>
          ) : (
            <Button label="Back to Capture" onPress={() => router.back()} variant="outline" tone="grey" />
          )}
        </>
      ) : null}
    </AppScrollScreen>
  );
}
