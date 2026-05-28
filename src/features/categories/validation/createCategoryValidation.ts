import type { ValidationIssue } from '@/foundation/validation/types';
import type { JournalSectionDraft } from '@/features/categories/types/journal';

export type CreateCategoryValidationInput = {
  name: string;
  categoryType: 'quickCount' | 'timedActivity' | 'journal';
  measurementUnit: string;
  journalSections?: JournalSectionDraft[];
};

// Same field can emit warning or blocking depending on threshold.
export function validateCreateCategory(input: CreateCategoryValidationInput): ValidationIssue[] {
  const name = input.name.trim();
  const measurementUnit = input.measurementUnit.trim();
  const issues: ValidationIssue[] = [];

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
      severity: 'blocking',
      message: 'Category name must be at least 2 characters.',
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

    if (sections.length === 1 && sections[0]?.type === 'number') {
      issues.push({
        key: 'journal_single_number_measure_candidate',
        fieldId: 'journalSections',
        anchor: 'journalSections',
        severity: 'warning',
        message: 'Single number section detected. Consider switching this category to Measure.',
      });
    }
  }

  return issues;
}
