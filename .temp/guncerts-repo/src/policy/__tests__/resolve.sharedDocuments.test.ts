import { describe, expect, test } from '@jest/globals';
import { resolveRequirementsForApplication } from '../resolve';

const resolveByForm = (form: '517' | '517g' | '518a') =>
  resolveRequirementsForApplication({
    application: {
      id: `app-${form}`,
      form,
    },
    firearms: [],
  });

describe('resolveRequirementsForApplication shared documents', () => {
  test('injects shared common documents for all forms', () => {
    const forms: Array<'517' | '517g' | '518a'> = ['517', '517g', '518a'];
    forms.forEach((form) => {
      const resolved = resolveByForm(form);
      const codes = new Set(resolved.requirements.map((req) => String(req.code ?? '').toUpperCase()));
      expect(codes.has('ID_DOC')).toBe(true);
      expect(codes.has('PROOF_ADDRESS')).toBe(true);
      expect(codes.has('PASSPORT_PHOTOS')).toBe(true);
    });
  });

  test('uses 517 display order so membership/proficiency appear before passport photos', () => {
    const resolved = resolveByForm('517');
    const indexByCode = new Map<string, number>();
    resolved.requirements.forEach((req, index) => {
      indexByCode.set(String(req.code ?? '').toUpperCase(), index);
    });

    const membershipIndex = indexByCode.get('MEMBERSHIP');
    const proficiencyIndex = indexByCode.get('PROFICIENCY');
    const passportPhotosIndex = indexByCode.get('PASSPORT_PHOTOS');

    expect(membershipIndex).toBeDefined();
    expect(proficiencyIndex).toBeDefined();
    expect(passportPhotosIndex).toBeDefined();
    expect((membershipIndex as number) < (passportPhotosIndex as number)).toBe(true);
    expect((proficiencyIndex as number) < (passportPhotosIndex as number)).toBe(true);
  });

  test('517 aggregate results card is not required', () => {
    const resolved = resolveByForm('517');
    const byCode = new Map(
      resolved.requirements.map((req) => [String(req.code ?? '').toUpperCase(), req] as const)
    );

    expect((byCode.get('STATEMENT_OF_RESULTS') as any)?.requiredForApplication).toBe(false);
    expect(byCode.get('STATEMENT_OF_RESULTS')?.required).toBe(false);

    expect((byCode.get('PASSPORT_PHOTOS') as any)?.requiredForApplication).toBe(false);
    expect(byCode.get('PASSPORT_PHOTOS')?.required).toBe(false);
  });
});
