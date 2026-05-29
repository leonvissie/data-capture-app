import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { RoundIconButton } from '@/foundation/components/buttons/RoundIconButton';
import { Button } from '@/foundation/components/buttons/Button';
import { AppText } from '@/foundation/components/layout/AppText';
import { useTones } from '@/foundation/hooks/useTones';
import { radii, spacing } from '@/foundation/theme';

type OptionPillInputProps = {
  options: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  accessibilityLabel?: string;
};

function normalizeOptionValue(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function toOptionKey(value: string) {
  return normalizeOptionValue(value).toLowerCase();
}

export function OptionPillInput({
  options,
  onChange,
  placeholder = 'Add option',
  accessibilityLabel = 'Add option',
}: OptionPillInputProps) {
  const tones = useTones();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normalizedDraft = useMemo(() => normalizeOptionValue(draft), [draft]);
  const canAdd = normalizedDraft.length > 0;

  const addOption = () => {
    const nextValue = normalizeOptionValue(draft);
    if (!nextValue) return;

    const key = toOptionKey(nextValue);
    const hasDuplicate = options.some((item) => toOptionKey(item) === key);
    if (hasDuplicate) {
      setError('Option already added.');
      return;
    }

    setError(null);
    onChange([...options, nextValue]);
    setDraft('');
  };

  const removeOption = (value: string) => {
    onChange(options.filter((item) => item !== value));
    if (error) setError(null);
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: tones.grey.surface,
            borderColor: tones.grey.border,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={tones.grey.border}
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={addOption}
          style={[styles.input, { color: tones.grey.onSurface }]}
        />
        <RoundIconButton
          buttonType="add"
          onPress={addOption}
          accessibilityLabel={canAdd ? 'Add option' : 'Enter option text to add'}
          accessibilityHint="Adds this option to the section"
          size="sm"
          tone={canAdd ? 'green' : 'grey'}
          disabled={!canAdd}
        />
      </View>

      {error ? <AppText variant="bodySmall">{error}</AppText> : null}

      {options.length > 0 ? (
        <View style={styles.pillsRow}>
          {options.map((option) => (
            <Button
              key={option}
              label={option}
              onPress={() => removeOption(option)}
              size="sm"
              variant="solid"
              tone="teal"
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  inputWrap: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 50,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
