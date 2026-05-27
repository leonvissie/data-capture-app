import type { ValidationIssue } from '@/foundation/validation/types';

export type CreateCategoryValidationInput = {
  name: string;
};

// Same field can emit warning or blocking depending on threshold.
export function validateCreateCategory(input: CreateCategoryValidationInput): ValidationIssue[] {
  const name = input.name.trim();
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

  return issues;
}
