import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScrollScreen, AppText, Button, InlineNotice, PageHeader } from '@/foundation/components';
import { useEntryLocationController } from '@/foundation/hooks/useEntryLocationController';
import { useValidationReveal } from '@/foundation/validation/useValidationReveal';
import { JournalCaptureFlow } from '@/features/capture/components/JournalCaptureFlow';
import { MeasureCaptureFlow } from '@/features/capture/components/MeasureCaptureFlow';
import { useEntryDateTimeDefaults } from '@/features/capture/hooks/useEntryDateTimeDefaults';
import { TimeCaptureFlow } from '@/features/capture/components/TimeCaptureFlow';
import { useCaptureValidationState } from '@/features/capture/hooks/useCaptureValidationState';
import { useCaptureWizardController } from '@/features/capture/hooks/useCaptureWizardController';

function getWizardCopy(categoryType: 'quickCount' | 'timedActivity' | 'journal') {
  if (categoryType === 'quickCount') {
    return {
      title: 'Measurement capture',
      detail: 'Capture a single measured value for this category.',
    };
  }
  if (categoryType === 'timedActivity') {
    return {
      title: 'Time capture',
      detail: 'Track start and end times as a single interval.',
    };
  }
  return {
    title: 'Journal capture',
    detail: 'Capture structured journal details for this category.',
  };
}

export function CaptureWizardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : '';

  const [countValue, setCountValue] = useState('');
  const [journalValuesBySectionId, setJournalValuesBySectionId] = useState<Record<string, string | string[]>>({});
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [isNoneLocationSelected, setIsNoneLocationSelected] = useState(false);
  const { entryDate, setEntryDate, entryTime, setEntryTime, clearDateOnFocus, clearTimeOnFocus } =
    useEntryDateTimeDefaults();

  const scrollRef = useRef<ScrollView>(null);
  const countRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);

  const { registerAnchor, registerFieldLayout, focusAnchor } = useValidationReveal(scrollRef);
  const locationController = useEntryLocationController();

  const {
    isLoading,
    category,
    activeTimeEntry,
    journalSections,
    issues,
    isSaving,
    saveError,
    isReadyToSubmit,
    setSaveError,
    saveQuickCount,
    saveTimedActivity,
    saveJournal,
  } = useCaptureWizardController({
    categoryId,
    countValue,
    entryDate,
    entryTime,
    selectedLocationId,
    isNoneLocationSelected,
    journalValuesBySectionId,
    draftLocationName: locationController.draftLocationName,
    validateDraftLocationName: locationController.validateDraftLocationName,
    addOrReuseLocation: locationController.addOrReuseLocation,
    locationError: locationController.error,
    focusAnchor,
    onSaved: () => router.replace('/(tabs)/home'),
    setSelectedLocationId,
  });

  const { blockingIssues, warningIssues, fieldStateById } = useCaptureValidationState(issues);

  useEffect(() => registerAnchor('countValue', () => countRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('entryDate', () => dateRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('entryTime', () => timeRef.current?.focus()), [registerAnchor]);
  useEffect(() => registerAnchor('location', () => locationRef.current?.focus()), [registerAnchor]);
  useEffect(() => {
    if (!journalSections.length) return;
    setJournalValuesBySectionId((current) => {
      const next: Record<string, string | string[]> = {};
      for (const section of journalSections) {
        next[section.id] = current[section.id] ?? (section.type === 'multiSelect' ? [] : '');
      }
      return next;
    });
  }, [journalSections]);

  const copy = useMemo(() => (category ? getWizardCopy(category.categoryType) : null), [category]);
  const headerTitle = useMemo(() => {
    if (!category) return 'Capture';
    if (category.categoryType === 'quickCount' && category.measurementUnit.trim()) {
      return `${category.name} (${category.measurementUnit.trim()})`;
    }
    return category.name;
  }, [category]);

  return (
    <AppScrollScreen scrollRef={scrollRef}>
      <PageHeader title={headerTitle} leftAction={{ buttonType: 'back', accessibilityLabel: 'Go back', onPress: () => router.back() }} />

      {isLoading ? <AppText>Loading capture wizard...</AppText> : null}
      {!isLoading && !category ? <InlineNotice message="Category not found. Return to Capture and try again." /> : null}
      {!isLoading && category && copy ? (
        <>
          <AppText variant="sectionTitle">{copy.title}</AppText>
          <AppText>{copy.detail}</AppText>
          {category.categoryType === 'quickCount' ? (
            <MeasureCaptureFlow
              measurementUnit={category.measurementUnit}
              countValue={countValue}
              onCountValueChange={(value) => {
                setCountValue(value);
                if (saveError) setSaveError(null);
              }}
              countRef={countRef}
              entryDate={entryDate}
              entryTime={entryTime}
              onEntryDateChange={(value) => {
                setEntryDate(value);
                if (saveError) setSaveError(null);
              }}
              onEntryTimeChange={(value) => {
                setEntryTime(value);
                if (saveError) setSaveError(null);
              }}
              onDateFocus={() => {
                clearDateOnFocus();
              }}
              onTimeFocus={() => {
                clearTimeOnFocus();
              }}
              dateRef={dateRef}
              timeRef={timeRef}
              selectedLocationId={selectedLocationId}
              isNoneLocationSelected={isNoneLocationSelected}
              onNoneLocationSelectedChange={setIsNoneLocationSelected}
              onSelectedLocationChange={(value) => {
                if (value !== null) setIsNoneLocationSelected(false);
                setSelectedLocationId(value);
              }}
              locationController={locationController}
              locationRef={locationRef}
              saveError={saveError}
              blockingIssues={blockingIssues}
              warningIssues={warningIssues}
              focusAnchor={focusAnchor}
              onSave={() => void saveQuickCount()}
              isSaving={isSaving}
              isLoading={isLoading}
              isReadyToSubmit={isReadyToSubmit}
              fieldStateById={fieldStateById}
              onFieldLayout={registerFieldLayout}
            />
          ) : category.categoryType === 'timedActivity' ? (
            <TimeCaptureFlow
              activeTimeEntry={activeTimeEntry}
              entryDate={entryDate}
              entryTime={entryTime}
              onEntryDateChange={(value) => {
                setEntryDate(value);
                if (saveError) setSaveError(null);
              }}
              onEntryTimeChange={(value) => {
                setEntryTime(value);
                if (saveError) setSaveError(null);
              }}
              onDateFocus={() => {
                clearDateOnFocus();
              }}
              onTimeFocus={() => {
                clearTimeOnFocus();
              }}
              dateRef={dateRef}
              timeRef={timeRef}
              selectedLocationId={selectedLocationId}
              isNoneLocationSelected={isNoneLocationSelected}
              onNoneLocationSelectedChange={setIsNoneLocationSelected}
              onSelectedLocationChange={(value) => {
                if (value !== null) setIsNoneLocationSelected(false);
                setSelectedLocationId(value);
              }}
              locationController={locationController}
              locationRef={locationRef}
              saveError={saveError}
              blockingIssues={blockingIssues}
              warningIssues={warningIssues}
              focusAnchor={focusAnchor}
              onSave={() => void saveTimedActivity()}
              isSaving={isSaving}
              isLoading={isLoading}
              isReadyToSubmit={isReadyToSubmit}
              fieldStateById={fieldStateById}
              onFieldLayout={registerFieldLayout}
            />
          ) : category.categoryType === 'journal' ? (
            <JournalCaptureFlow
              sections={journalSections}
              valuesBySectionId={journalValuesBySectionId}
              onValueChange={(sectionId, value) => {
                setJournalValuesBySectionId((current) => ({ ...current, [sectionId]: value }));
                if (saveError) setSaveError(null);
              }}
              entryDate={entryDate}
              entryTime={entryTime}
              onEntryDateChange={(value) => {
                setEntryDate(value);
                if (saveError) setSaveError(null);
              }}
              onEntryTimeChange={(value) => {
                setEntryTime(value);
                if (saveError) setSaveError(null);
              }}
              onDateFocus={() => {
                clearDateOnFocus();
              }}
              onTimeFocus={() => {
                clearTimeOnFocus();
              }}
              dateRef={dateRef}
              timeRef={timeRef}
              selectedLocationId={selectedLocationId}
              isNoneLocationSelected={isNoneLocationSelected}
              onNoneLocationSelectedChange={setIsNoneLocationSelected}
              onSelectedLocationChange={(value) => {
                if (value !== null) setIsNoneLocationSelected(false);
                setSelectedLocationId(value);
              }}
              locationController={locationController}
              locationRef={locationRef}
              saveError={saveError}
              blockingIssues={blockingIssues}
              warningIssues={warningIssues}
              focusAnchor={focusAnchor}
              onSave={() => void saveJournal()}
              isSaving={isSaving}
              isLoading={isLoading}
              isReadyToSubmit={isReadyToSubmit}
              fieldStateById={fieldStateById}
              onFieldLayout={registerFieldLayout}
            />
          ) : (
            <Button label="Back to Capture" onPress={() => router.back()} variant="outline" tone="grey" />
          )}
        </>
      ) : null}
    </AppScrollScreen>
  );
}
