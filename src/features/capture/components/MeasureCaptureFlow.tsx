import type { TextInput } from 'react-native';
import { View, type LayoutChangeEvent } from 'react-native';
import type { RefObject } from 'react';

import { Button, EntryLocationField, InlineNotice, TextField } from '@/foundation/components';
import type { EntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import type { ValidationIssue } from '@/foundation/validation/types';
import { spacing } from '@/foundation/theme';

import { CaptureDateTimeRow } from './CaptureDateTimeRow';
import { CaptureValidationFeedback } from './CaptureValidationFeedback';

type FieldValidationState = 'default' | 'warning' | 'blocking';

type MeasureCaptureFlowProps = {
  measurementUnit: string;
  countValue: string;
  onCountValueChange: (value: string) => void;
  countRef: RefObject<TextInput | null>;
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

export function MeasureCaptureFlow({
  measurementUnit,
  countValue,
  onCountValueChange,
  countRef,
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
}: MeasureCaptureFlowProps) {
  return (
    <View style={{ gap: spacing.md }}>
      <CaptureDateTimeRow
        entryDate={entryDate}
        entryTime={entryTime}
        onEntryDateChange={onEntryDateChange}
        onEntryTimeChange={onEntryTimeChange}
        onDateFocus={onDateFocus}
        onTimeFocus={onTimeFocus}
        dateAccessibilityLabel="Entry date"
        timeAccessibilityLabel="Entry time"
        dateRef={dateRef}
        timeRef={timeRef}
        dateValidationState={fieldStateById.entryDate ?? 'default'}
        timeValidationState={fieldStateById.entryTime ?? 'default'}
        onDateLayout={onFieldLayout('entryDate')}
        onTimeLayout={onFieldLayout('entryTime')}
      />

      <TextField
        ref={countRef}
        validationState={fieldStateById.countValue ?? 'default'}
        onLayout={onFieldLayout('countValue')}
        value={countValue}
        onChangeText={(value) => onCountValueChange(value.replace(/[^\d.]/g, ''))}
        placeholder={measurementUnit ? `Value (${measurementUnit})` : 'Value'}
        accessibilityLabel={measurementUnit ? `Measurement value in ${measurementUnit}` : 'Measurement value'}
        keyboardType="decimal-pad"
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

      {saveError ? <InlineNotice message={saveError} /> : null}

      <CaptureValidationFeedback blockingIssues={blockingIssues} warningIssues={warningIssues} focusAnchor={focusAnchor} />

      <Button
        label={isSaving ? 'Saving...' : 'Save measurement entry'}
        onPress={onSave}
        disabled={isSaving || isLoading}
        variant="solid"
        tone={isReadyToSubmit ? 'green' : 'grey'}
        size="lg"
      />
    </View>
  );
}
