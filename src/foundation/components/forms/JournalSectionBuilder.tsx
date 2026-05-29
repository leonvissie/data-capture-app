import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/foundation/components/buttons/Button';
import { RoundIconButton } from '@/foundation/components/buttons/RoundIconButton';
import { Card } from '@/foundation/components/content/Card';
import { Divider } from '@/foundation/components/content/Divider';
import { AppText } from '@/foundation/components/layout/AppText';
import { OptionPillInput } from '@/foundation/components/forms/OptionPillInput';
import { TextField } from '@/foundation/components/forms/TextField';
import { spacing } from '@/foundation/theme';
import type { JournalSectionDraft, JournalSectionType } from '@/features/categories/types/journal';

type JournalSectionBuilderProps = {
  sections: JournalSectionDraft[];
  onChange: (sections: JournalSectionDraft[]) => void;
  onApplyTemplate: () => void;
};

const sectionTypeOptions: Array<{ value: JournalSectionType; label: string }> = [
  { value: 'singleSelect', label: 'Single select' },
  { value: 'multiSelect', label: 'Multi select' },
  { value: 'scale', label: 'Scale' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
];

const sectionExampleByType: Record<JournalSectionType, string> = {
  scale: 'e.g. "How am I feeling?" (a scale of 1 to 10)',
  multiSelect: 'e.g "Meds taken" (multiple options that can be selected)',
  singleSelect: 'e.g. "Meds before or after food?" (only one option can be selected)',
  number: 'e.g. "Number of meds taken" (numeric value)',
  text: 'e.g. "Additional notes" (free text field to capture extra info)',
};

function makeSection(): JournalSectionDraft {
  return {
    id: `jsec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    type: 'text',
    requiredSeverity: 'blocking',
    options: [],
  };
}

export function JournalSectionBuilder({ sections, onChange, onApplyTemplate }: JournalSectionBuilderProps) {
  const [pendingTypeBySectionId, setPendingTypeBySectionId] = useState<Record<string, boolean>>({});
  const showTemplateAction = false;

  useEffect(() => {
    setPendingTypeBySectionId((current) => {
      const next: Record<string, boolean> = {};
      for (const section of sections) {
        next[section.id] = current[section.id] ?? false;
      }
      return next;
    });
  }, [sections]);

  const updateSection = (index: number, next: Partial<JournalSectionDraft>) => {
    const updated = sections.map((item, i) => (i === index ? { ...item, ...next } : item));
    onChange(updated);
  };

  const removeSection = (index: number) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const updated = [...sections];
    const [item] = updated.splice(index, 1);
    updated.splice(nextIndex, 0, item);
    onChange(updated);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <AppText variant="bodyStrong">Journal sections</AppText>
        {showTemplateAction ? <Button label="Use template" onPress={onApplyTemplate} variant="soft" tone="blue" size="sm" /> : null}
      </View>

      {sections.map((section, index) => (
        <Card key={section.id}>
          <View style={styles.sectionHeader}>
            <AppText variant="bodyStrong">Section {index + 1}</AppText>
            <View style={styles.inlineActions}>
              {sections.length > 1 ? (
                <>
                  {index > 0 ? (
                    <RoundIconButton
                      buttonType="remove"
                      onPress={() => moveSection(index, -1)}
                      accessibilityLabel={`Move section ${index + 1} up`}
                      size="sm"
                      tone="grey"
                    />
                  ) : null}
                  {index < sections.length - 1 ? (
                    <RoundIconButton
                      buttonType="add"
                      onPress={() => moveSection(index, 1)}
                      accessibilityLabel={`Move section ${index + 1} down`}
                      size="sm"
                      tone="grey"
                    />
                  ) : null}
                </>
              ) : null}
              <RoundIconButton
                buttonType="delete"
                onPress={() => removeSection(index)}
                accessibilityLabel={`Remove section ${index + 1}`}
                size="sm"
                tone="red"
              />
            </View>
          </View>
          <Divider spacingTop="none" spacingBottom="sm" />

          <View style={styles.choiceRow}>
            {sectionTypeOptions.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                onPress={() => {
                  setPendingTypeBySectionId((current) => ({ ...current, [section.id]: false }));
                  updateSection(index, {
                    type: option.value,
                    options: option.value === 'singleSelect' || option.value === 'multiSelect' ? section.options : [],
                  });
                }}
                variant={section.type === option.value ? 'solid' : 'outline'}
                tone="teal"
                size="sm"
              />
            ))}
          </View>

          {!pendingTypeBySectionId[section.id] ? (
            <View style={styles.sectionBody}>
              <Divider spacingTop="sm" spacingBottom="sm" />
              <TextField
                value={section.label}
                onChangeText={(value) => updateSection(index, { label: value })}
                placeholder="Section name"
                accessibilityLabel={`Section ${index + 1} name`}
              />
              <AppText variant="bodySmall">{section.helpText || sectionExampleByType[section.type]}</AppText>

              {section.type === 'singleSelect' || section.type === 'multiSelect' ? (
                <>
                  <Divider spacingTop="sm" spacingBottom="sm" />
                  <OptionPillInput
                    options={section.options}
                    onChange={(nextOptions) => updateSection(index, { options: nextOptions })}
                    placeholder="Add option"
                    accessibilityLabel={`Section ${index + 1} option input`}
                  />
                  <Divider spacingTop="sm" spacingBottom="sm" />
                </>
              ) : null}

              <View style={styles.choiceRow}>
                <Button
                  label="Required"
                  onPress={() => updateSection(index, { requiredSeverity: 'blocking' })}
                  variant={section.requiredSeverity === 'blocking' ? 'solid' : 'outline'}
                  tone="orange"
                  size="sm"
                />
                <Button
                  label="Optional"
                  onPress={() => updateSection(index, { requiredSeverity: 'warning' })}
                  variant={section.requiredSeverity === 'warning' ? 'solid' : 'outline'}
                  tone="orange"
                  size="sm"
                />
              </View>
            </View>
          ) : (
            <AppText variant="bodySmall">Select a section type to continue.</AppText>
          )}
        </Card>
      ))}

      <Button
        label="Add section"
        onPress={() => {
          const nextSection = makeSection();
          setPendingTypeBySectionId((current) => ({ ...current, [nextSection.id]: true }));
          onChange([...sections, nextSection]);
        }}
        variant="outline"
        tone="teal"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionBody: {
    gap: spacing.sm,
  },
});
