import type { ApplicantSex } from '../data/types';

export interface ApplicantSexResolverContext {
  idType?: string | null;
  idNumber?: string | null;
  applicantSex?: string | null;
}

export function normalizeSaIdNumber(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\D/g, '').slice(0, 13);
}

export function deriveSexFromSaId(idNumber?: string | null): ApplicantSex {
  const normalized = normalizeSaIdNumber(idNumber);
  if (normalized.length !== 13) return 'unknown';

  const sequenceDigits = normalized.slice(6, 10);
  const sequenceValue = Number.parseInt(sequenceDigits, 10);
  if (Number.isNaN(sequenceValue)) return 'unknown';

  return sequenceValue >= 5000 ? 'male' : 'female';
}

export function resolveApplicantSex(
  context: ApplicantSexResolverContext,
): ApplicantSex {
  const explicitValue = (context.applicantSex ?? '').trim().toLowerCase();
  const explicitSex =
    explicitValue === 'female' || explicitValue === 'male'
      ? explicitValue
      : 'unknown';

  if ((context.idType ?? '').trim().toUpperCase() === 'PASSPORT') {
    return explicitSex;
  }

  const derivedSex = deriveSexFromSaId(context.idNumber);
  if (derivedSex !== 'unknown') {
    return derivedSex;
  }

  return explicitSex;
}
