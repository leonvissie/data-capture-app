import { validateCreateCategory } from '../../src/features/categories/validation/createCategoryValidation';

describe('validateCreateCategory', () => {
  test('same field can produce warning or blocking by threshold', () => {
    const warning = validateCreateCategory({ name: 'A'.repeat(50), categoryType: 'journal', measurementUnit: '' });
    const blocking = validateCreateCategory({ name: 'A'.repeat(81), categoryType: 'journal', measurementUnit: '' });

    expect(warning.some((issue) => issue.fieldId === 'categoryName' && issue.severity === 'warning')).toBe(true);
    expect(blocking.some((issue) => issue.fieldId === 'categoryName' && issue.severity === 'blocking')).toBe(true);
  });

  test('measure categories require a unit', () => {
    const issues = validateCreateCategory({ name: 'Rain', categoryType: 'quickCount', measurementUnit: '' });
    expect(issues.some((issue) => issue.fieldId === 'measurementUnit' && issue.severity === 'blocking')).toBe(true);
  });

  test('duplicate category name in same type is blocking', () => {
    const issues = validateCreateCategory({
      name: 'Commute',
      categoryType: 'timedActivity',
      measurementUnit: '',
      existingCategories: [{ id: 'cat_1', name: ' commute ', categoryType: 'timedActivity' }],
    });
    expect(issues.some((issue) => issue.key === 'category_name_duplicate_same_type' && issue.severity === 'blocking')).toBe(true);
  });

  test('duplicate category name in different type is warning', () => {
    const issues = validateCreateCategory({
      name: 'Commute',
      categoryType: 'journal',
      measurementUnit: '',
      existingCategories: [{ id: 'cat_1', name: 'COMMUTE', categoryType: 'timedActivity' }],
    });
    expect(issues.some((issue) => issue.key === 'category_name_duplicate_cross_type' && issue.severity === 'warning')).toBe(true);
  });

  test('journal section one-character label is warning, not blocking', () => {
    const issues = validateCreateCategory({
      name: 'Health',
      categoryType: 'journal',
      measurementUnit: '',
      journalSections: [{ id: 'j1', label: 'A', type: 'text', requiredSeverity: 'blocking', options: [] }],
    });
    expect(issues.some((issue) => issue.key.includes('journal_section_label_short_warning') && issue.severity === 'warning')).toBe(true);
    expect(issues.some((issue) => issue.key.includes('journal_section_label_required') && issue.severity === 'blocking')).toBe(false);
  });
});
