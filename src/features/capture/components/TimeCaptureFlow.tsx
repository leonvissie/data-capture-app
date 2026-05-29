import type { TextInput } from 'react-native';
import { View, type LayoutChangeEvent } from 'react-native';
import type { RefObject } from 'react';

import { Button, EntryLocationField, InlineNotice } from '@/foundation/components';
import type { EntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import { formatIsoForDisplay } from '@/foundation/lib/dateTime';
import type { ActiveTimeEntry } from '@/foundation/services/storage/timeCaptureRepository';
import { spacing } from '@/foundation/theme';
import type { ValidationIssue } from '@/foundation/validation/types';

import { CaptureDateTimeRow } from './CaptureDateTimeRow';
import { CaptureValidationFeedback } from './CaptureValidationFeedback';
import { DurationTimerDisplay } from './DurationTimerDisplay';

type FieldValidationState = 'default' | 'warning' | 'blocking';

type TimeCaptureFlowProps = {
  activeTimeEntry: ActiveTimeEntry | null;
  entryDate: string;
  entryTime: string;
  onEntryDateChange: (value: string) => void;
  onEntryTimeChange: (value: string) => void;
  onDateFocus: () => void;
  onTimeFocus: () => void;
  dateRef: RefObject<TextInput | null>;
  timeRef: RefObject<TextInput | null>;
  selectedLocationId: string | null;
  isNoneLocationSelected: boolean;
  onNoneLocationSelectedChange: (value: boolean) => void;
  onSelectedLocationChange: (value: string | null) => void;
  locationController: EntryLocationController;
  locationRef: RefObject<TextInput | null>;
  saveError: string | null;
  blockingIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
  focusAnchor: (anchor?: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isLoading: boolean;
  isReadyToSubmit: boolean;
  fieldStateById: Record<string, FieldValidationState>;
  onFieldLayout: (anchor: string) => (event: LayoutChangeEvent) => void;
};

export function TimeCaptureFlow({
  activeTimeEntry,
  entryDate,
  entryTime,
  onEntryDateChange,
  onEntryTimeChange,
  onDateFocus,
  onTimeFocus,
  dateRef,
  timeRef,
  selectedLocationId,
  isNoneLocationSelected,
  onNoneLocationSelectedChange,
  onSelectedLocationChange,
  locationController,
  locationRef,
  saveError,
  blockingIssues,
  warningIssues,
  focusAnchor,
  onSave,
  isSaving,
  isLoading,
  isReadyToSubmit,
  fieldStateById,
  onFieldLayout,
}: TimeCaptureFlowProps) {
  const isTimeEndMode = Boolean(activeTimeEntry);

  return (
    <View style={{ gap: spacing.md }}>
      <InlineNotice
        tone="pink"
        message={
          isTimeEndMode && activeTimeEntry
            ? `End time for interval started at ${formatIsoForDisplay(activeTimeEntry.startedAt)}.`
            : 'Start a new time interval for this category.'
        }
      />

      <CaptureDateTimeRow
        entryDate={entryDate}
        entryTime={entryTime}
        onEntryDateChange={onEntryDateChange}
        onEntryTimeChange={onEntryTimeChange}
        onDateFocus={onDateFocus}
        onTimeFocus={onTimeFocus}
        dateAccessibilityLabel={isTimeEndMode ? 'End date' : 'Start date'}
        timeAccessibilityLabel={isTimeEndMode ? 'End time' : 'Start time'}
        dateRef={dateRef}
        timeRef={timeRef}
        dateValidationState={fieldStateById.entryDate ?? 'default'}
        timeValidationState={fieldStateById.entryTime ?? 'default'}
        onDateLayout={onFieldLayout('entryDate')}
        onTimeLayout={onFieldLayout('entryTime')}
      />

      <EntryLocationField
        selectedLocationId={selectedLocationId}
        isNoneSelected={isNoneLocationSelected}
        onNoneSelectedChange={onNoneLocationSelectedChange}
        onSelectedLocationChange={onSelectedLocationChange}
        controller={locationController}
        locationInputRef={locationRef}
        validationState={fieldStateById.location ?? 'default'}
        onLayout={onFieldLayout('location')}
        showDivider
        dividerSpacing="none"
        dividerSpacingBottom="md"
      />

      {isTimeEndMode && activeTimeEntry ? (
        <DurationTimerDisplay startedAtIso={activeTimeEntry.startedAt} />
      ) : null}

      {saveError ? <InlineNotice message={saveError} /> : null}

      <CaptureValidationFeedback blockingIssues={blockingIssues} warningIssues={warningIssues} focusAnchor={focusAnchor} />

      <Button
        label={isSaving ? 'Saving...' : isTimeEndMode ? 'Save end time' : 'Save start time'}
        onPress={onSave}
        disabled={isSaving || isLoading}
        variant="solid"
        tone={isReadyToSubmit ? 'green' : 'grey'}
        size="lg"
      />
    </View>
  );
}
