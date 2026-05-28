import { createValidationGate } from '../../src/foundation/validation/createValidationGate';

describe('createValidationGate', () => {
  test('blocks when blocking issues exist', () => {
    const decision = createValidationGate(
      [{ key: 'x', message: 'Required', severity: 'blocking', fieldId: 'name' }],
      { allowContinueOnWarnings: true },
    );
    expect(decision.kind).toBe('blocked');
  });

  test('returns continue_with_warnings for warning-only when continuation is not allowed', () => {
    const decision = createValidationGate(
      [{ key: 'x', message: 'Warning', severity: 'warning', fieldId: 'name' }],
      { allowContinueOnWarnings: false },
    );
    expect(decision.kind).toBe('continue_with_warnings');
  });

  test('returns proceed for warning-only when continuation is allowed', () => {
    const decision = createValidationGate(
      [{ key: 'x', message: 'Warning', severity: 'warning', fieldId: 'name' }],
      { allowContinueOnWarnings: true },
    );
    expect(decision.kind).toBe('proceed');
  });
});
