import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  AppScrollScreen,
  AppText,
  Button,
  InlineNotice,
  PageHeader,
  PrimaryButton,
  TextField,
  ValidationSummaryCard,
} from '@/foundation/components';
import { createCategory } from '@/foundation/services/storage/categoryRepository';
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
  { value: 'quickCount', label: 'Count' },
  { value: 'timedActivity', label: 'Time' },
  { value: 'journal', label: 'Journal' },
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
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState<CategoryTypeOption['value']>('quickCount');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [allowWarningContinue, setAllowWarningContinue] = useState(false);
  const nameInputRef = useRef<TextInput>(null);
  const { registerAnchor, focusAnchor } = useValidationAnchors();
  const isValid = useMemo(
    () => validateCreateCategory({ name }).every((issue) => issue.severity !== 'blocking'),
    [name],
  );

  useEffect(() => registerAnchor('categoryName', () => nameInputRef.current?.focus()), [registerAnchor]);

  const handleCreate = async () => {
    if (isSaving) return;

    const nextIssues = validateCreateCategory({ name });
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
      await createCategory({
        id: buildCategoryId(),
        name: name.trim(),
        categoryType,
      });
      router.replace('/(tabs)/home');
    } catch {
      setError('Unable to create category. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');

  return (
    <AppScrollScreen>
      <PageHeader
        title="Create category"
        subtitle="Set up a new capture category."
        leftAction={{ buttonType: 'back', accessibilityLabel: 'Go back', onPress: () => router.back() }}
      />

      <View style={styles.content}>
        <View style={styles.section}>
          <AppText variant="bodyStrong">Category type</AppText>
          <View style={styles.optionsRow}>
            {categoryTypeOptions.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                onPress={() => setCategoryType(option.value)}
                variant={categoryType === option.value ? 'solid' : 'outline'}
                tone={categoryToneByType[option.value]}
                size="sm"
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

        <PrimaryButton label={isSaving ? 'Creating...' : 'Create category'} onPress={() => void handleCreate()} disabled={!isValid || isSaving} />
      </View>
    </AppScrollScreen>
  );
}

const styles = StyleSheet.create({
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
