import type { TextInput } from 'react-native';
import { View, type LayoutChangeEvent } from 'react-native';
import type { RefObject } from 'react';

import { AppText, Button, Card, EntryLocationField, InlineNotice, TextField } from '@/foundation/components';
import type { EntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import { spacing } from '@/foundation/theme';
import type { ValidationIssue } from '@/foundation/validation/types';
import type { JournalSectionDraft } from '@/features/categories/types/journal';

import { CaptureDateTimeRow } from './CaptureDateTimeRow';
import { CaptureValidationFeedback } from './CaptureValidationFeedback';

type FieldValidationState = 'default' | 'warning' | 'blocking';

type JournalCaptureFlowProps = {
  sections: JournalSectionDraft[];
  valuesBySectionId: Record<string, string | string[]>;
  onValueChange: (sectionId: string, value: string | string[]) => void;
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

export function JournalCaptureFlow({
  sections,
  valuesBySectionId,
  onValueChange,
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
}: JournalCaptureFlowProps) {
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

      {sections.map((section) => {
        const fieldKey = `journal.${section.id}`;
        const value = valuesBySectionId[section.id];

        return (
          <Card key={section.id}>
            <View style={{ gap: spacing.sm }}>
              <View>
                <AppText variant="bodyStrong">{section.label}</AppText>
              </View>

              {section.type === 'text' ? (
                <TextField
                  validationState={fieldStateById[fieldKey] ?? 'default'}
                  onLayout={onFieldLayout(fieldKey)}
                  value={typeof value === 'string' ? value : ''}
                  onChangeText={(text) => onValueChange(section.id, text)}
                  placeholder={section.label}
                />
              ) : null}

              {section.type === 'number' || section.type === 'scale' ? (
                <TextField
                  validationState={fieldStateById[fieldKey] ?? 'default'}
                  onLayout={onFieldLayout(fieldKey)}
                  value={typeof value === 'string' ? value : ''}
                  onChangeText={(text) => onValueChange(section.id, text.replace(/[^\d.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder={section.type === 'scale' ? 'Enter scale value' : 'Enter number'}
                />
              ) : null}

              {section.type === 'singleSelect' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {section.options.map((option) => (
                    <Button
                      key={`${section.id}:${option}`}
                      label={option}
                      onPress={() => onValueChange(section.id, typeof value === 'string' && value === option ? '' : option)}
                      variant={typeof value === 'string' && value === option ? 'solid' : 'outline'}
                      tone="teal"
                      size="sm"
                    />
                  ))}
                </View>
              ) : null}

              {section.type === 'multiSelect' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {section.options.map((option) => {
                    const selected = Array.isArray(value) && value.includes(option);
                    return (
                      <Button
                        key={`${section.id}:${option}`}
                        label={option}
                        onPress={() => {
                          const current = Array.isArray(value) ? value : [];
                          onValueChange(
                            section.id,
                            selected ? current.filter((item) => item !== option) : [...current, option],
                          );
                        }}
                        variant={selected ? 'solid' : 'outline'}
                        tone="teal"
                        size="sm"
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}

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
        label={isSaving ? 'Saving...' : 'Save journal entry'}
        onPress={onSave}
        disabled={isSaving || isLoading}
        variant="solid"
        tone={isReadyToSubmit ? 'green' : 'grey'}
        size="lg"
      />
    </View>
  );
}
