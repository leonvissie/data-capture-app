import { StyleSheet, View } from 'react-native';

import { Button } from '@/foundation/components/buttons/Button';
import { Card } from '@/foundation/components/content/Card';
import { AppText } from '@/foundation/components/layout/AppText';
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
        <Button label="Use template" onPress={onApplyTemplate} variant="soft" tone="blue" size="sm" />
      </View>

      {sections.map((section, index) => (
        <Card key={section.id}>
          <View style={styles.sectionHeader}>
            <AppText variant="bodyStrong">Section {index + 1}</AppText>
            <View style={styles.inlineActions}>
              <Button label="Up" onPress={() => moveSection(index, -1)} variant="outline" tone="grey" size="sm" />
              <Button label="Down" onPress={() => moveSection(index, 1)} variant="outline" tone="grey" size="sm" />
              <Button label="Remove" onPress={() => removeSection(index)} variant="soft" tone="red" size="sm" />
            </View>
          </View>

          <TextField
            value={section.label}
            onChangeText={(value) => updateSection(index, { label: value })}
            placeholder="Section label"
            accessibilityLabel={`Section ${index + 1} label`}
          />
          {section.helpText ? <AppText variant="bodySmall">{section.helpText}</AppText> : null}

          <View style={styles.choiceRow}>
            {sectionTypeOptions.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                onPress={() => updateSection(index, { type: option.value, options: option.value === 'singleSelect' || option.value === 'multiSelect' ? section.options : [] })}
                variant={section.type === option.value ? 'solid' : 'outline'}
                tone="teal"
                size="sm"
              />
            ))}
          </View>

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

          {section.type === 'singleSelect' || section.type === 'multiSelect' ? (
            <TextField
              value={section.options.join(', ')}
              onChangeText={(value) =>
                updateSection(index, {
                  options: value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Options (comma separated)"
              accessibilityLabel={`Section ${index + 1} options`}
            />
          ) : null}
        </Card>
      ))}

      <Button label="Add section" onPress={() => onChange([...sections, makeSection()])} variant="outline" tone="teal" />
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
});
