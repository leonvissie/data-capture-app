import { createValidationGate } from '../../src/foundation/validation/createValidationGate';

describe('createValidationGate', () => {
  test('blocks when blocking issues exist', () => {
    const decision = createValidationGate(
      [{ key: 'x', message: 'Required', severity: 'blocking', fieldId: 'name' }],
      { allowContinueOnWarnings: true },
    );
    expect(decision.kind).toBe('blocked');
  });

  test('returns continue_with_warnings for warning-only when policy allows', () => {
    const decision = createValidationGate(
      [{ key: 'x', message: 'Warning', severity: 'warning', fieldId: 'name' }],
      { allowContinueOnWarnings: true },
    );
    expect(decision.kind).toBe('continue_with_warnings');
  });
});
