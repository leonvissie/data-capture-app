import { validateCreateCategory } from '../../src/features/categories/validation/createCategoryValidation';

describe('validateCreateCategory', () => {
  test('same field can produce warning or blocking by threshold', () => {
    const warning = validateCreateCategory({ name: 'A'.repeat(50) });
    const blocking = validateCreateCategory({ name: 'A'.repeat(81) });

    expect(warning.some((issue) => issue.fieldId === 'categoryName' && issue.severity === 'warning')).toBe(true);
    expect(blocking.some((issue) => issue.fieldId === 'categoryName' && issue.severity === 'blocking')).toBe(true);
  });
});
