import { describe, expect, test } from '@jest/globals';
import policy517 from '../517.json';
import policy517g from '../517g.json';
import policy518a from '../518a.json';
import { sharedRequirementDefaultsByCode } from '../shared/commonDocuments';

type PolicyShape = {
  appType?: string;
  requirements?: Array<{ code?: string }>;
};

const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase();

describe('policy shared-requirement discipline', () => {
  test('form JSON requirements do not duplicate shared common document codes', () => {
    const sharedCodes = new Set(
      Object.keys(sharedRequirementDefaultsByCode).map((code) => normalizeCode(code))
    );

    const policies: PolicyShape[] = [policy517 as PolicyShape, policy517g as PolicyShape, policy518a as PolicyShape];
    const duplicates: Array<{ form: string; code: string }> = [];

    policies.forEach((policy) => {
      const form = String(policy.appType ?? 'unknown');
      (policy.requirements ?? []).forEach((req) => {
        const code = normalizeCode(req?.code);
        if (code && sharedCodes.has(code)) {
          duplicates.push({ form, code });
        }
      });
    });

    expect(duplicates).toEqual([]);
  });
});

