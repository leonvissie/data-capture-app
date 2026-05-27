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
});
