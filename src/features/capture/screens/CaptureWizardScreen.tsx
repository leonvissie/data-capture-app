import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScrollScreen, AppText, Button, EntryLocationField, InlineNotice, PageHeader, TextField, ValidationSummaryCard } from '@/foundation/components';
import { applyDateMask, applyTimeMask, buildOccurredAtIso, formatDateForEntryInput, formatIsoForDisplay, formatTimeForEntryInput } from '@/foundation/lib/dateTime';
import { getDraftLocationValidationError, useEntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import { confirmDialog } from '@/foundation/services/dialogs/dialogService';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';
import { createQuickCountEntry } from '@/foundation/services/storage/entryRepository';
import { endTimeEntry, getActiveTimeEntry, type ActiveTimeEntry, startTimeEntry } from '@/foundation/services/storage/timeCaptureRepository';
import { useValidationReveal } from '@/foundation/validation/useValidationReveal';
import { submitWithValidation } from '@/foundation/validation/submitWithValidation';
import type { ValidationIssue } from '@/foundation/validation/types';
import { validateTimeCapture } from '@/features/capture/validation/timeCaptureValidation';
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
      detail: 'Track start and end times as a single interval.',
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
  const [activeTimeEntry, setActiveTimeEntry] = useState<ActiveTimeEntry | null>(null);
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
        if (next?.categoryType === 'timedActivity') {
          const active = await getActiveTimeEntry(next.id);
          if (!cancelled) setActiveTimeEntry(active);
        } else if (!cancelled) {
          setActiveTimeEntry(null);
        }
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
  const isTimeEndMode = Boolean(category?.categoryType === 'timedActivity' && activeTimeEntry);
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

  const validateTimedActivity = (mode: 'peek' | 'submit' = 'submit'): ValidationIssue[] => {
    const next = validateTimeCapture({
      entryDate,
      entryTime,
      activeStartIso: activeTimeEntry?.startedAt ?? null,
    });
    const locationValidationError =
      mode === 'submit'
        ? locationController.validateDraftLocationName()
        : getDraftLocationValidationError(locationController.draftLocationName);
    if (locationValidationError) {
      return [
        {
          key: 'location_invalid',
          severity: 'blocking',
          message: locationValidationError,
          fieldId: 'location',
          anchor: 'location',
        },
      ];
    }
    return next;
  };

  const requestWarningConfirm = async (warningMessages: string[]) =>
    confirmDialog({
      title: 'Review warnings before saving',
      message: 'Please review these warnings before continuing.',
      warningItems: warningMessages,
      confirmText: 'Continue anyway',
      cancelText: 'Review fields',
    });

  const prepareLocationForSave = async (fallbackLocationId: string | null): Promise<string | null> => {
    let locationIdForSave = fallbackLocationId;
    if (locationController.draftLocationName.trim()) {
      const createdOrReused = await locationController.addOrReuseLocation();
      if (!createdOrReused) {
        throw new Error(locationController.error ?? 'Location is invalid.');
      }
      locationIdForSave = createdOrReused.id;
      setSelectedLocationId(createdOrReused.id);
    }
    return locationIdForSave;
  };

  const saveQuickCount = async () => {
    if (!category || category.categoryType !== 'quickCount' || isSaving) return;
    const nextIssues = validateQuickCount();
    await submitWithValidation({
      issues: nextIssues,
      setIssues,
      focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const occurredAtResult = buildOccurredAtIso(entryDate, entryTime);
          if (!occurredAtResult.iso) {
            setSaveError(occurredAtResult.error ?? 'Date and time are invalid.');
            return;
          }
          const locationIdForSave = await prepareLocationForSave(selectedLocationId);
          await createQuickCountEntry({
            categoryId: category.id,
            value: Number(countValue.trim()),
            locationId: locationIdForSave,
            occurredAt: occurredAtResult.iso,
          });
          router.replace('/(tabs)/home');
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
  };

  const saveTimedActivity = async () => {
    if (!category || category.categoryType !== 'timedActivity' || isSaving) return;
    const nextIssues = validateTimedActivity();
    await submitWithValidation({
      issues: nextIssues,
      setIssues,
      focusAnchor,
      requestWarningConfirm,
      onProceed: async () => {
        setSaveError(null);
        setIsSaving(true);
        try {
          const occurredAtResult = buildOccurredAtIso(entryDate, entryTime);
          if (!occurredAtResult.iso) {
            setSaveError(occurredAtResult.error ?? 'Date and time are invalid.');
            return;
          }
          const locationIdForSave = await prepareLocationForSave(selectedLocationId);

          if (activeTimeEntry) {
            await endTimeEntry({
              entryId: activeTimeEntry.entryId,
              endedAt: occurredAtResult.iso,
              locationId: locationIdForSave,
            });
          } else {
            await startTimeEntry({
              categoryId: category.id,
              startedAt: occurredAtResult.iso,
              locationId: locationIdForSave,
            });
          }
          router.replace('/(tabs)/home');
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
  };

  const isReadyToSubmit = useMemo(() => {
    if (category?.categoryType === 'timedActivity') {
      return validateTimedActivity('peek').every((issue) => issue.severity !== 'blocking');
    }
    return validateQuickCount('peek').every((issue) => issue.severity !== 'blocking');
  }, [category?.categoryType, countValue, entryDate, entryTime, locationController.draftLocationName, activeTimeEntry?.startedAt]);

  useEffect(() => {
    if (issues.length === 0) return;
    const nextIssues =
      category?.categoryType === 'timedActivity' ? validateTimedActivity('peek') : validateQuickCount('peek');
    setIssues(nextIssues);
  }, [issues.length, category?.categoryType, countValue, entryDate, entryTime, locationController.draftLocationName, activeTimeEntry?.startedAt]);

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
          ) : category.categoryType === 'timedActivity' ? (
            <View style={styles.form}>
              <InlineNotice
                tone="pink"
                message={
                  isTimeEndMode && activeTimeEntry
                    ? `End time for interval started at ${formatIsoForDisplay(activeTimeEntry.startedAt)}.`
                    : 'Start a new time interval for this category.'
                }
              />
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
                    accessibilityLabel={isTimeEndMode ? 'End date' : 'Start date'}
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
                    accessibilityLabel={isTimeEndMode ? 'End time' : 'Start time'}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
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
                label={isSaving ? 'Saving...' : isTimeEndMode ? 'Save end time' : 'Save start time'}
                onPress={() => void saveTimedActivity()}
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
