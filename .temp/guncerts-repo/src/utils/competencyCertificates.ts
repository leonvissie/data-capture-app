import type { CompetencyCertificate } from '../data/types';

const parseIsoDateStart = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.getTime();
};

export const compareCompetencyCertificates = (
  a: CompetencyCertificate,
  b: CompetencyCertificate,
) => {
  const issuedA = parseIsoDateStart(a.issuedAt);
  const issuedB = parseIsoDateStart(b.issuedAt);

  if (issuedA !== null || issuedB !== null) {
    if (issuedA === null) return 1;
    if (issuedB === null) return -1;
    if (issuedA !== issuedB) return issuedA - issuedB;
  }

  const numberA = (a.certificateNumber ?? '').trim().toLowerCase();
  const numberB = (b.certificateNumber ?? '').trim().toLowerCase();
  const numberCompare = numberA.localeCompare(numberB);
  if (numberCompare !== 0) return numberCompare;

  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
};

