import { View, type LayoutChangeEvent, type TextInput } from 'react-native';
import type { RefObject } from 'react';

import { TextField } from '@/foundation/components';
import { applyDateMask, applyTimeMask } from '@/foundation/lib/dateTime';
import { spacing } from '@/foundation/theme';

type FieldValidationState = 'default' | 'warning' | 'blocking';

type CaptureDateTimeRowProps = {
  entryDate: string;
  entryTime: string;
  onEntryDateChange: (value: string) => void;
  onEntryTimeChange: (value: string) => void;
  onDateFocus: () => void;
  onTimeFocus: () => void;
  dateAccessibilityLabel: string;
  timeAccessibilityLabel: string;
  dateRef: RefObject<TextInput | null>;
  timeRef: RefObject<TextInput | null>;
  dateValidationState?: FieldValidationState;
  timeValidationState?: FieldValidationState;
  onDateLayout?: (event: LayoutChangeEvent) => void;
  onTimeLayout?: (event: LayoutChangeEvent) => void;
};

export function CaptureDateTimeRow({
  entryDate,
  entryTime,
  onEntryDateChange,
  onEntryTimeChange,
  onDateFocus,
  onTimeFocus,
  dateAccessibilityLabel,
  timeAccessibilityLabel,
  dateRef,
  timeRef,
  dateValidationState = 'default',
  timeValidationState = 'default',
  onDateLayout,
  onTimeLayout,
}: CaptureDateTimeRowProps) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <TextField
          ref={dateRef}
          validationState={dateValidationState}
          onLayout={onDateLayout}
          value={entryDate}
          onFocus={onDateFocus}
          onChangeText={(value) => onEntryDateChange(applyDateMask(value))}
          placeholder="dd/mm/yyyy"
          accessibilityLabel={dateAccessibilityLabel}
          keyboardType="number-pad"
        />
      </View>
      <View style={{ flex: 1 }}>
        <TextField
          ref={timeRef}
          validationState={timeValidationState}
          onLayout={onTimeLayout}
          value={entryTime}
          onFocus={onTimeFocus}
          onChangeText={(value) => onEntryTimeChange(applyTimeMask(value))}
          placeholder="HH:mm"
          accessibilityLabel={timeAccessibilityLabel}
          keyboardType="number-pad"
        />
      </View>
    </View>
  );
}
