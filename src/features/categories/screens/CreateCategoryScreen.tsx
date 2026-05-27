import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  AppScrollScreen,
  AppText,
  Button,
  InlineNotice,
  PageHeader,
  PrimaryButton,
  TextField,
} from '@/foundation/components';
import { createCategory } from '@/foundation/services/storage/categoryRepository';
import { spacing } from '@/foundation/theme';

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

  const isValid = useMemo(() => name.trim().length >= 2, [name]);

  const onSave = async () => {
    if (!isValid || isSaving) return;
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
                tone="teal"
                size="sm"
              />
            ))}
          </View>
        </View>

        <TextField
          value={name}
          onChangeText={(value) => setName(toTitleCase(value))}
          placeholder="Category name"
          accessibilityLabel="Category name"
          autoCapitalize="words"
          returnKeyType="done"
        />

        {error ? <InlineNotice message={error} /> : null}

        <PrimaryButton label={isSaving ? 'Creating...' : 'Create category'} onPress={() => void onSave()} disabled={!isValid || isSaving} />
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
