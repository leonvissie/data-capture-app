import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AppModalScreen,
  AppText,
  Button,
  DestructiveButton,
  InlineNotice,
  JournalSectionBuilder,
  PageHeader,
  TextField,
  StickyHeaderLayout,
  ValidationSummaryCard,
} from '@/foundation/components';
import { categoryTypeUiLabelByType } from '@/foundation/presentation/categoryTypeLabels';
import { categoryToneByType, spacing } from '@/foundation/theme';
import { useValidationAnchors } from '@/foundation/validation/useValidationAnchors';
import { useCreateCategoryController } from '@/features/categories/hooks/useCreateCategoryController';
import { journalTemplateDefaults, type JournalSectionDraft } from '@/features/categories/types/journal';

type CategoryTypeOption = {
  value: 'quickCount' | 'timedActivity' | 'journal';
  label: string;
};

const categoryTypeOptions: CategoryTypeOption[] = [
  { value: 'quickCount', label: categoryTypeUiLabelByType.quickCount },
  { value: 'timedActivity', label: categoryTypeUiLabelByType.timedActivity },
  { value: 'journal', label: categoryTypeUiLabelByType.journal },
];

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function CreateCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const editingCategoryId = typeof params.categoryId === 'string' ? params.categoryId : '';
  const isEditing = editingCategoryId.length > 0 && editingCategoryId !== 'undefined' && editingCategoryId !== 'null';

  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState<CategoryTypeOption['value']>('quickCount');
  const [measurementUnit, setMeasurementUnit] = useState('');
  const [journalSections, setJournalSections] = useState<JournalSectionDraft[]>([]);

  const nameInputRef = useRef<TextInput>(null);
  const measurementUnitRef = useRef<TextInput>(null);
  const { registerAnchor, focusAnchor } = useValidationAnchors();

  const {
    isSaving,
    error,
    isLoading,
    issues,
    entryCount,
    isReadyToSubmit,
    loadedName,
    loadedCategoryType,
    loadedMeasurementUnit,
    loadedJournalSections,
    saveCategory,
    deleteCategory,
  } = useCreateCategoryController({
    editingCategoryId,
    isEditing,
    name,
    categoryType,
    measurementUnit,
    journalSections,
    focusAnchor,
    onSaved: () => router.replace('/(tabs)/home'),
  });

  useEffect(() => registerAnchor('categoryName', () => nameInputRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('measurementUnit', () => measurementUnitRef.current?.focus()), [registerAnchor]);

  useEffect(() => {
    if (!isEditing) return;
    setName(loadedName);
    setCategoryType(loadedCategoryType);
    setMeasurementUnit(loadedMeasurementUnit);
    setJournalSections(loadedJournalSections);
  }, [isEditing, loadedName, loadedCategoryType, loadedMeasurementUnit, loadedJournalSections]);

  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
  const fieldStateById: Record<string, 'default' | 'warning' | 'blocking'> = {};
  for (const issue of issues) {
    if (!issue.fieldId) continue;
    if (issue.severity === 'blocking') {
      fieldStateById[issue.fieldId] = 'blocking';
    } else if (fieldStateById[issue.fieldId] !== 'blocking') {
      fieldStateById[issue.fieldId] = 'warning';
    }
  }
  const hasExistingEntries = isEditing && entryCount > 0;
  const isMeasureCategory = categoryType === 'quickCount';
  const isJournalCategory = categoryType === 'journal';
  const hasSingleNumberJournalWarning = warningIssues.some((issue) => issue.key === 'journal_single_number_measure_candidate');

  return (
    <AppModalScreen>
      <StickyHeaderLayout
        header={
          <View style={styles.headerTopSpacing}>
            <PageHeader
              title={isEditing ? 'Edit category' : 'Create category'}
              subtitle={isEditing ? 'Update this capture category.' : 'Set up a new capture category.'}
              rightAction={{ buttonType: 'close', accessibilityLabel: 'Close category wizard', onPress: () => router.back() }}
            />
          </View>
        }
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
        {isLoading ? <AppText>Loading category...</AppText> : null}
        <View style={styles.section}>
          <AppText variant="bodyStrong">Category type</AppText>
          {hasExistingEntries ? (
            <AppText variant="bodySmall">
              Category type and unit can only be changed before the first entry is saved for this category.
            </AppText>
          ) : null}
          <View style={styles.optionsRow}>
            {categoryTypeOptions.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                onPress={() => setCategoryType(option.value)}
                variant={categoryType === option.value ? 'solid' : 'outline'}
                tone={categoryToneByType[option.value]}
                size="sm"
                disabled={hasExistingEntries}
              />
            ))}
          </View>
        </View>

        <TextField
          ref={nameInputRef}
          validationState={fieldStateById.categoryName ?? 'default'}
          value={name}
          onChangeText={(value) => setName(toTitleCase(value))}
          placeholder="Category name"
          accessibilityLabel="Category name"
          autoCapitalize="words"
          returnKeyType="done"
        />

        {isMeasureCategory ? (
          <TextField
            ref={measurementUnitRef}
            validationState={fieldStateById.measurementUnit ?? 'default'}
            value={measurementUnit}
            onChangeText={setMeasurementUnit}
            placeholder="Unit (e.g. mm, inch, mmHg, C, F)"
            accessibilityLabel="Measurement unit"
            autoCapitalize="none"
            editable={!hasExistingEntries}
          />
        ) : null}

        {isJournalCategory ? (
          <View style={styles.section}>
            <JournalSectionBuilder
              sections={journalSections}
              onChange={setJournalSections}
              onApplyTemplate={() => setJournalSections(journalTemplateDefaults.map((section) => ({ ...section, id: `${section.id}_${Date.now().toString(36)}` })))}
            />
          </View>
        ) : null}

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
              focusAnchor(warningIssues[0]?.anchor ?? warningIssues[0]?.fieldId);
            }}
            primaryActionLabel="Review"
            onSecondaryAction={() => {
              if (hasSingleNumberJournalWarning && journalSections[0]) {
                setCategoryType('quickCount');
                setName(toTitleCase(journalSections[0].label || name));
                setMeasurementUnit('');
                return;
              }
              void saveCategory();
            }}
            secondaryActionLabel={hasSingleNumberJournalWarning ? 'Switch to Measure' : 'Continue anyway'}
          />
        ) : null}

        <Button
          label={isSaving ? 'Saving...' : isEditing ? 'Save category' : 'Create category'}
          onPress={() => void saveCategory()}
          disabled={isSaving || isLoading}
          size="lg"
          variant="solid"
          tone={isReadyToSubmit ? (isEditing ? 'teal' : 'green') : 'grey'}
        />
        {isEditing ? <DestructiveButton label="Delete category" onPress={() => void deleteCategory()} tone="danger" size="lg" /> : null}
          </View>
        </ScrollView>
      </StickyHeaderLayout>
    </AppModalScreen>
  );
}

const styles = StyleSheet.create({
  headerTopSpacing: {
    paddingTop: spacing.sm,
  },
  content: {
    gap: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing['2xl'],
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
