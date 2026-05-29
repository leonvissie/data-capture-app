import type { ValidationIssue } from '@/foundation/validation/types';
import type { JournalSectionDraft } from '@/features/categories/types/journal';

export type CreateCategoryValidationInput = {
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
  measurementUnit: string;
  journalSections?: JournalSectionDraft[];
  editingCategoryId?: string;
  existingCategories?: Array<{ id: string; name: string; categoryType: 'quickCount' | 'timedActivity' | 'journal' }>;
  entryCount?: number;
  loadedCategoryType?: 'quickCount' | 'timedActivity' | 'journal';
  loadedMeasurementUnit?: string;
  loadedJournalSections?: JournalSectionDraft[];
};

function normalizeForCompare(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildJournalSchemaSignature(sections: JournalSectionDraft[]): string {
  return JSON.stringify(
    sections.map((section) => ({
      type: section.type,
      options: section.options.map((option) => normalizeForCompare(option)).sort(),
    })),
  );
}

export function validateCreateCategory(input: CreateCategoryValidationInput): ValidationIssue[] {
  const name = input.name.trim();
  const measurementUnit = input.measurementUnit.trim();
  const issues: ValidationIssue[] = [];
  const normalizedName = normalizeForCompare(input.name);

  if (!name) {
    issues.push({
      key: 'category_name_required',
      fieldId: 'categoryName',
      anchor: 'categoryName',
      severity: 'blocking',
      message: 'Category name is required.',
    });
    return issues;
  }

  if (name.length < 2) {
    issues.push({
      key: 'category_name_too_short',
      fieldId: 'categoryName',
      anchor: 'categoryName',
      severity: 'warning',
      message: 'Very short category names may be harder to scan in lists.',
    });
  }

  if (name.length > 40 && name.length <= 80) {
    issues.push({
      key: 'category_name_long_warning',
      fieldId: 'categoryName',
      anchor: 'categoryName',
      severity: 'warning',
      message: 'Long category names may be harder to scan in lists.',
    });
  }

  if (name.length > 80) {
    issues.push({
      key: 'category_name_too_long',
      fieldId: 'categoryName',
      anchor: 'categoryName',
      severity: 'blocking',
      message: 'Category name must be 80 characters or fewer.',
    });
  }

  const duplicate = (input.existingCategories ?? []).find((category) => {
    if (input.editingCategoryId && category.id === input.editingCategoryId) return false;
    return normalizeForCompare(category.name) === normalizedName;
  });
  if (duplicate) {
    issues.push({
      key: duplicate.categoryType === input.categoryType ? 'category_name_duplicate_same_type' : 'category_name_duplicate_cross_type',
      fieldId: 'categoryName',
      anchor: 'categoryName',
      severity: duplicate.categoryType === input.categoryType ? 'blocking' : 'warning',
      message:
        duplicate.categoryType === input.categoryType
          ? 'A category with this name already exists for the same type.'
          : 'A category with this name exists in a different type.',
    });
  }

  const hasExistingEntries = (input.entryCount ?? 0) > 0;
  if (hasExistingEntries && input.loadedCategoryType && input.loadedCategoryType !== input.categoryType) {
    issues.push({
      key: 'category_type_locked_existing_entries',
      fieldId: 'categoryType',
      anchor: 'categoryType',
      severity: 'blocking',
      message: 'Category type cannot be changed after entries exist.',
    });
  }

  if (
    hasExistingEntries &&
    input.categoryType === 'quickCount' &&
    input.loadedCategoryType === 'quickCount' &&
    normalizeForCompare(input.loadedMeasurementUnit ?? '') !== normalizeForCompare(measurementUnit)
  ) {
    issues.push({
      key: 'measurement_unit_locked_existing_entries',
      fieldId: 'measurementUnit',
      anchor: 'measurementUnit',
      severity: 'blocking',
      message: 'Unit cannot be changed after entries exist.',
    });
  }

  if (input.categoryType === 'quickCount' && !measurementUnit) {
    issues.push({
      key: 'measurement_unit_required',
      fieldId: 'measurementUnit',
      anchor: 'measurementUnit',
      severity: 'blocking',
      message: 'Unit is required for Measure categories.',
    });
  }

  if (input.categoryType === 'journal') {
    const sections = input.journalSections ?? [];
    if (sections.length === 0) {
      issues.push({
        key: 'journal_sections_required',
        fieldId: 'journalSections',
        anchor: 'journalSections',
        severity: 'blocking',
        message: 'Add at least one journal section.',
      });
      return issues;
    }

    sections.forEach((section, index) => {
      const label = section.label.trim();
      if (!label) {
        issues.push({
          key: `journal_section_label_required_${index}`,
          fieldId: 'journalSections',
          anchor: 'journalSections',
          severity: 'blocking',
          message: `Section ${index + 1} label is required.`,
        });
      }
      if (label.length < 2) {
        issues.push({
          key: `journal_section_label_short_warning_${index}`,
          fieldId: 'journalSections',
          anchor: 'journalSections',
          severity: 'warning',
          message: `Section ${index + 1} label is very short.`,
        });
      }
      if (label.length > 60) {
        issues.push({
          key: `journal_section_label_too_long_${index}`,
          fieldId: 'journalSections',
          anchor: 'journalSections',
          severity: 'blocking',
          message: `Section ${index + 1} label must be 60 characters or fewer.`,
        });
      }

      if ((section.type === 'singleSelect' || section.type === 'multiSelect') && section.options.some((option) => !option.trim())) {
        issues.push({
          key: `journal_section_options_empty_${index}`,
          fieldId: 'journalSections',
          anchor: 'journalSections',
          severity: 'blocking',
          message: `Section ${index + 1} has an empty option.`,
        });
      }

      if (section.type === 'singleSelect' || section.type === 'multiSelect') {
        const optionKeys = section.options.map((option) => normalizeForCompare(option)).filter(Boolean);
        if (new Set(optionKeys).size !== optionKeys.length) {
          issues.push({
            key: `journal_section_options_duplicate_${index}`,
            fieldId: 'journalSections',
            anchor: 'journalSections',
            severity: 'blocking',
            message: `Section ${index + 1} has duplicate options.`,
          });
        }
        if (section.options.length > 12) {
          issues.push({
            key: `journal_section_options_large_warning_${index}`,
            fieldId: 'journalSections',
            anchor: 'journalSections',
            severity: 'warning',
            message: `Section ${index + 1} has many options. Consider reducing for easier capture.`,
          });
        }
      }

      if ((section.type === 'singleSelect' || section.type === 'multiSelect') && section.options.length < 2) {
        issues.push({
          key: `journal_section_options_required_${index}`,
          fieldId: 'journalSections',
          anchor: 'journalSections',
          severity: 'blocking',
          message: `Section ${index + 1} needs at least 2 options.`,
        });
      }
    });

    const labelKeys = sections.map((section) => normalizeForCompare(section.label)).filter(Boolean);
    if (new Set(labelKeys).size !== labelKeys.length) {
      issues.push({
        key: 'journal_section_labels_duplicate_warning',
        fieldId: 'journalSections',
        anchor: 'journalSections',
        severity: 'warning',
        message: 'Some journal section labels are duplicated.',
      });
    }

    if (sections.length === 1 && sections[0]?.type === 'number') {
      issues.push({
        key: 'journal_single_number_measure_candidate',
        fieldId: 'journalSections',
        anchor: 'journalSections',
        severity: 'warning',
        message: 'Single number section detected. Consider switching this category to Measure.',
      });
    }

    if (
      hasExistingEntries &&
      input.loadedCategoryType === 'journal' &&
      input.loadedJournalSections &&
      buildJournalSchemaSignature(input.loadedJournalSections) !== buildJournalSchemaSignature(sections)
    ) {
      issues.push({
        key: 'journal_schema_locked_existing_entries',
        fieldId: 'journalSections',
        anchor: 'journalSections',
        severity: 'blocking',
        message: 'Journal section structure cannot be changed after entries exist.',
      });
    }
  }

  return issues;
}
