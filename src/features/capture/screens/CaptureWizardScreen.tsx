import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScrollScreen, AppText, Button, EntryLocationField, InlineNotice, PageHeader, TextField, ValidationSummaryCard } from '@/foundation/components';
import { applyDateMask, applyTimeMask, buildOccurredAtIso, formatDateForEntryInput, formatTimeForEntryInput } from '@/foundation/lib/dateTime';
import { getDraftLocationValidationError, useEntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';
import { createQuickCountEntry } from '@/foundation/services/storage/entryRepository';
import { useValidationReveal } from '@/foundation/validation/useValidationReveal';
import { submitWithValidation } from '@/foundation/validation/submitWithValidation';
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
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(() => formatDateForEntryInput(new Date()));
  const [entryTime, setEntryTime] = useState(() => formatTimeForEntryInput(new Date()));
  const [didClearDateDefault, setDidClearDateDefault] = useState(false);
  const [didClearTimeDefault, setDidClearTimeDefault] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const countRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);
  const { registerAnchor, registerFieldLayout, focusAnchor } = useValidationReveal(scrollRef);
  const locationController = useEntryLocationController();

  useEffect(() => registerAnchor('countValue', () => countRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('entryDate', () => dateRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('entryTime', () => timeRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('location', () => locationRef.current?.focus()), [registerAnchor]);

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
  const fieldStateById = useMemo(() => {
    const map: Record<string, 'default' | 'warning' | 'blocking'> = {};
    for (const issue of issues) {
      if (!issue.fieldId) continue;
      if (issue.severity === 'blocking') {
        map[issue.fieldId] = 'blocking';
      } else if (map[issue.fieldId] !== 'blocking') {
        map[issue.fieldId] = 'warning';
      }
    }
    return map;
  }, [issues]);

  const validateQuickCount = (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
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

    const locationValidationError =
      mode === 'submit'
        ? locationController.validateDraftLocationName()
        : getDraftLocationValidationError(locationController.draftLocationName);
    if (locationValidationError) {
      next.push({
        key: 'location_invalid',
        severity: 'blocking',
        message: locationValidationError,
        fieldId: 'location',
        anchor: 'location',
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
        severity: 'warning',
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

  const saveQuickCount = async () => {
    if (!category || category.categoryType !== 'quickCount' || isSaving) return;
    const nextIssues = validateQuickCount();
    await submitWithValidation({
      issues: nextIssues,
      setIssues,
      focusAnchor,
      requestWarningConfirm: async (warningMessages) =>
        confirmDialog({
          title: 'Review warnings before saving',
          message: 'Please review these warnings before continuing.',
          warningItems: warningMessages,
          confirmText: 'Continue anyway',
          cancelText: 'Review fields',
        }),
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const occurredAtResult = buildOccurredAtIso(entryDate, entryTime);
          if (!occurredAtResult.iso) {
            setSaveError(occurredAtResult.error ?? 'Date and time are invalid.');
            return;
          }
          let locationIdForSave = selectedLocationId;
          if (locationController.draftLocationName.trim()) {
            const createdOrReused = await locationController.addOrReuseLocation();
            if (!createdOrReused) {
              setSaveError(locationController.error ?? 'Location is invalid.');
              return;
            }
            locationIdForSave = createdOrReused.id;
            setSelectedLocationId(createdOrReused.id);
          }
          await createQuickCountEntry({
            categoryId: category.id,
            value: Number(countValue.trim()),
            locationId: locationIdForSave,
            occurredAt: occurredAtResult.iso,
          });
          router.replace('/(tabs)/home');
        } catch {
          setSaveError('Unable to save measurement entry. Please try again.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  const isReadyToSubmit = useMemo(
    () => validateQuickCount('peek').every((issue) => issue.severity !== 'blocking'),
    [countValue, entryDate, entryTime, locationController.draftLocationName],
  );

  useEffect(() => {
    if (issues.length === 0) return;
    const nextIssues = validateQuickCount('peek');
    setIssues(nextIssues);
  }, [issues.length, countValue, entryDate, entryTime, locationController.draftLocationName]);

  return (
    <AppScrollScreen scrollRef={scrollRef}>
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
                    validationState={fieldStateById.entryDate ?? 'default'}
                    onLayout={registerFieldLayout('entryDate')}
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
                    validationState={fieldStateById.entryTime ?? 'default'}
                    onLayout={registerFieldLayout('entryTime')}
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
                validationState={fieldStateById.countValue ?? 'default'}
                onLayout={registerFieldLayout('countValue')}
                value={countValue}
                onChangeText={(value) => setCountValue(value.replace(/[^\d.]/g, ''))}
                placeholder={category.measurementUnit ? `Value (${category.measurementUnit})` : 'Value'}
                accessibilityLabel={category.measurementUnit ? `Measurement value in ${category.measurementUnit}` : 'Measurement value'}
                keyboardType="decimal-pad"
              />
              <EntryLocationField
                selectedLocationId={selectedLocationId}
                onSelectedLocationChange={setSelectedLocationId}
                controller={locationController}
                locationInputRef={locationRef}
                validationState={fieldStateById.location ?? 'default'}
                onLayout={registerFieldLayout('location')}
                showDivider
                dividerSpacing="sm"
                dividerSpacingBottom="md"
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
                />
              ) : null}
              <Button
                label={isSaving ? 'Saving...' : 'Save measurement entry'}
                onPress={() => void saveQuickCount()}
                disabled={isSaving || isLoading}
                variant="solid"
                tone={isReadyToSubmit ? 'green' : 'grey'}
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
