import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScrollScreen, AppText, InlineNotice, PageHeader } from '@/foundation/components';
import { getCategoryById, type CategoryRecord } from '@/foundation/services/storage/categoryRepository';

function getWizardCopy(category: CategoryRecord) {
  if (category.categoryType === 'quickCount') {
    return {
      title: 'Count capture',
      detail: 'Count capture flow will be implemented next for this category.',
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

  return (
    <AppScrollScreen>
      <PageHeader
        title="Capture wizard"
        subtitle={category ? category.name : 'Category'}
        leftAction={{ buttonType: 'back', accessibilityLabel: 'Go back', onPress: () => router.back() }}
      />

      {isLoading ? <AppText>Loading capture wizard...</AppText> : null}
      {!isLoading && !category ? <InlineNotice message="Category not found. Return to Capture and try again." /> : null}
      {!isLoading && category && copy ? (
        <>
          <AppText variant="sectionTitle">{copy.title}</AppText>
          <AppText>{copy.detail}</AppText>
        </>
      ) : null}
    </AppScrollScreen>
  );
}
