import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScrollScreen, AppText, Button, InlineNotice, PageHeader, TextField, ValidationSummaryCard } from '@/foundation/components';
import { applyDateMask, applyTimeMask, buildOccurredAtIso, formatDateForEntryInput, formatTimeForEntryInput } from '@/foundation/lib/dateTime';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';
import { createQuickCountEntry } from '@/foundation/services/storage/entryRepository';
import { useValidationAnchors } from '@/foundation/validation/useValidationAnchors';
import { createValidationGate } from '@/foundation/validation/createValidationGate';
import type { ValidationIssue } from '@/foundation/validation/types';
import { spacing } from '@/foundation/theme';

function getWizardCopy(category: CategoryRecord) {
  if (category.categoryType === 'quickCount') {
    return {
      title: 'Measurement capture',
      detail: 'Single-value measurement capture flow will be implemented next for this category.',
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
  const [entryDate, setEntryDate] = useState(() => formatDateForEntryInput(new Date()));
  const [entryTime, setEntryTime] = useState(() => formatTimeForEntryInput(new Date()));
  const [didClearDateDefault, setDidClearDateDefault] = useState(false);
  const [didClearTimeDefault, setDidClearTimeDefault] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const countRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);
  const { registerAnchor, focusAnchor } = useValidationAnchors();

  useEffect(() => registerAnchor('countValue', () => countRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('entryDate', () => dateRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('entryTime', () => timeRef.current?.focus()), [registerAnchor]);

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
  const headerTitle = useMemo(() => {
    if (!category) return 'Capture';
    if (category.categoryType === 'quickCount' && category.measurementUnit.trim()) {
      return `${category.name} (${category.measurementUnit.trim()})`;
    }
    return category.name;
  }, [category]);
  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');

  const validateQuickCount = (): ValidationIssue[] => {
    const trimmed = countValue.trim();
    const next: ValidationIssue[] = [];
    const occurredAtResult = buildOccurredAtIso(entryDate, entryTime);

    if (!entryDate.trim()) {
      next.push({
        key: 'entry_date_required',
        severity: 'blocking',
        message: 'Date is required.',
        fieldId: 'entryDate',
        anchor: 'entryDate',
      });
      return next;
    }

    if (!entryTime.trim()) {
      next.push({
        key: 'entry_time_required',
        severity: 'blocking',
        message: 'Time is required.',
        fieldId: 'entryTime',
        anchor: 'entryTime',
      });
      return next;
    }

    if (occurredAtResult.error) {
      next.push({
        key: 'entry_datetime_invalid',
        severity: 'blocking',
        message: occurredAtResult.error,
        fieldId: 'entryDate',
        anchor: 'entryDate',
      });
      return next;
    }

    if (!trimmed) {
      next.push({
        key: 'count_required',
        severity: 'blocking',
        message: 'Value is required.',
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
        message: 'Value must be greater than zero.',
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
      const occurredAtResult = buildOccurredAtIso(entryDate, entryTime);
      if (!occurredAtResult.iso) {
        setSaveError(occurredAtResult.error ?? 'Date and time are invalid.');
        return;
      }
      await createQuickCountEntry({
        categoryId: category.id,
        value: Number(countValue.trim()),
        occurredAt: occurredAtResult.iso,
      });
      router.replace('/(tabs)/home');
    } catch {
      setSaveError('Unable to save measurement entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppScrollScreen>
      <PageHeader
        title={headerTitle}
        leftAction={{ buttonType: 'back', accessibilityLabel: 'Go back', onPress: () => router.back() }}
      />

      {isLoading ? <AppText>Loading capture wizard...</AppText> : null}
      {!isLoading && !category ? <InlineNotice message="Category not found. Return to Capture and try again." /> : null}
      {!isLoading && category && copy ? (
        <>
          <AppText variant="sectionTitle">{copy.title}</AppText>
          <AppText>{copy.detail}</AppText>
          {category.categoryType === 'quickCount' ? (
            <View style={styles.form}>
              <View style={styles.dateTimeRow}>
                <View style={styles.halfField}>
                  <TextField
                    ref={dateRef}
                    value={entryDate}
                    onFocus={() => {
                      if (!didClearDateDefault) {
                        setEntryDate('');
                        setDidClearDateDefault(true);
                      }
                    }}
                    onChangeText={(value) => setEntryDate(applyDateMask(value))}
                    placeholder="dd/mm/yyyy"
                    accessibilityLabel="Entry date"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.halfField}>
                  <TextField
                    ref={timeRef}
                    value={entryTime}
                    onFocus={() => {
                      if (!didClearTimeDefault) {
                        setEntryTime('');
                        setDidClearTimeDefault(true);
                      }
                    }}
                    onChangeText={(value) => setEntryTime(applyTimeMask(value))}
                    placeholder="HH:mm"
                    accessibilityLabel="Entry time"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <TextField
                ref={countRef}
                value={countValue}
                onChangeText={(value) => setCountValue(value.replace(/[^\d.]/g, ''))}
                placeholder={category.measurementUnit ? `Value (${category.measurementUnit})` : 'Value'}
                accessibilityLabel={category.measurementUnit ? `Measurement value in ${category.measurementUnit}` : 'Measurement value'}
                keyboardType="decimal-pad"
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
              <Button
                label={isSaving ? 'Saving...' : 'Save measurement entry'}
                onPress={() => void saveQuickCount(false)}
                disabled={isSaving}
                variant="solid"
                tone="green"
                size="lg"
              />
            </View>
          ) : (
            <Button label="Back to Capture" onPress={() => router.back()} variant="outline" tone="grey" />
          )}
        </>
      ) : null}
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
  },
});
