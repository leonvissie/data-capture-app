import {
  CompetencyCertificate,
  Firearm,
  CompetencyCategory,
  CompetencyExpiryReminderPreference,
} from '../data/types';
import { listByType } from '../data/sqlite';
import { persist, touch } from '../data/repo';

const SECTION_MATCH = /(?:^|\D)(13|15|16)(?:\D|$)/;

type SectionLevel = 13 | 15 | 16;

const parseSectionLevel = (value?: string | null): SectionLevel | null => {
  if (!value) return null;
  const match = SECTION_MATCH.exec(String(value));
  if (!match) return null;
  const level = Number.parseInt(match[1], 10) as SectionLevel;
  return level === 13 || level === 15 || level === 16 ? level : null;
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
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
  return date;
};

const formatIsoDate = (value: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
};

const addYearsIso = (issuedAt: string, years: number): string | null => {
  const base = parseIsoDate(issuedAt);
  if (!base) return null;
  const next = new Date(Date.UTC(base.getUTCFullYear() + years, base.getUTCMonth(), base.getUTCDate()));
  return formatIsoDate(next);
};

const toCategorySet = (categories?: CompetencyCategory[] | null) => {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  return new Set(categories);
};

export const resolveCompetencyExpiryCompCertCalc = (opts: {
  certificate: CompetencyCertificate;
  firearms: Firearm[];
}): string | null => {
  const issuedAt = opts.certificate.issuedAt?.trim();
  if (!issuedAt) return null;

  const categorySet = toCategorySet(opts.certificate.categories);
  if (!categorySet) return null;

  if (!opts.firearms.length) {
    return addYearsIso(issuedAt, 5);
  }

  let hasMatch = false;
  let hasHighSection = false;
  let hasSection13 = false;
  for (const firearm of opts.firearms) {
    const firearmType = firearm.firearmType;
    if (!firearmType || !categorySet.has(firearmType)) continue;
    const section = parseSectionLevel(firearm.section);
    if (!section) continue;
    hasMatch = true;
    if (section === 15 || section === 16) {
      hasHighSection = true;
      break;
    }
    if (section === 13) {
      hasSection13 = true;
    }
  }

  if (!hasMatch) return addYearsIso(issuedAt, 5);
  const years = hasHighSection ? 10 : hasSection13 ? 5 : null;
  if (!years) return addYearsIso(issuedAt, 5);
  return addYearsIso(issuedAt, years);
};

export const resolveCompetencyExpiryFirearmCalc = (opts: {
  certificate: CompetencyCertificate;
  firearms: Firearm[];
}): string | null => {
  const categorySet = toCategorySet(opts.certificate.categories);
  if (!categorySet) return null;

  let soonestMatch: Date | null = null;
  for (const firearm of opts.firearms) {
    const firearmType = firearm.firearmType;
    if (!firearmType || !categorySet.has(firearmType)) continue;
    const validTo = parseIsoDate(firearm.validTo);
    if (!validTo) continue;
    if (!soonestMatch || validTo.getTime() < soonestMatch.getTime()) {
      soonestMatch = validTo;
    }
  }

  if (!soonestMatch) return null;
  return formatIsoDate(soonestMatch);
};

const pickSoonestIsoDate = (values: Array<string | null | undefined>): string | undefined => {
  let chosen: Date | null = null;
  values.forEach((value) => {
    const parsed = parseIsoDate(value ?? undefined);
    if (!parsed) return;
    if (!chosen || parsed.getTime() < chosen.getTime()) {
      chosen = parsed;
    }
  });
  return chosen ? formatIsoDate(chosen) : undefined;
};

export const getCompetencyReminderExpiryDate = (
  certificate: CompetencyCertificate,
  preference: CompetencyExpiryReminderPreference = 'unknown',
): string | undefined => {
  if (preference === 'compIssueDate') {
    return certificate.expiresAtCompCertCalc?.trim() || certificate.expiresAt?.trim() || undefined;
  }
  if (preference === 'firearmExpiry') {
    return (
      certificate.expiresAtFirearmCalc?.trim() ||
      certificate.expiresAtCompCertCalc?.trim() ||
      certificate.expiresAt?.trim() ||
      undefined
    );
  }
  return pickSoonestIsoDate([
    certificate.expiresAtCompCertCalc,
    certificate.expiresAtFirearmCalc,
    certificate.expiresAt,
  ]);
};

export const resolveCompetencyExpiryDate = (opts: {
  certificate: CompetencyCertificate;
  firearms: Firearm[];
}): string | null => {
  return resolveCompetencyExpiryCompCertCalc(opts);
};

export const deriveCompetencyExpiryUpdates = (opts: {
  certificates: CompetencyCertificate[];
  firearms: Firearm[];
}): Array<{
  certificate: CompetencyCertificate;
  expiresAt?: string;
  expiresAtCompCertCalc?: string;
  expiresAtFirearmCalc?: string;
}> => {
  const updates: Array<{
    certificate: CompetencyCertificate;
    expiresAt?: string;
    expiresAtCompCertCalc?: string;
    expiresAtFirearmCalc?: string;
  }> = [];

  for (const certificate of opts.certificates) {
    const compCalc = resolveCompetencyExpiryCompCertCalc({
      certificate,
      firearms: opts.firearms,
    })?.trim() || undefined;
    const firearmCalc = resolveCompetencyExpiryFirearmCalc({
      certificate,
      firearms: opts.firearms,
    })?.trim() || undefined;

    const currentExpiresAt = certificate.expiresAt?.trim() || '';
    const currentComp = certificate.expiresAtCompCertCalc?.trim() || '';
    const currentFirearm = certificate.expiresAtFirearmCalc?.trim() || '';

    const nextExpiresAt = compCalc ?? '';
    const nextComp = compCalc ?? '';
    const nextFirearm = firearmCalc ?? '';

    if (
      currentExpiresAt === nextExpiresAt &&
      currentComp === nextComp &&
      currentFirearm === nextFirearm
    ) {
      continue;
    }

    updates.push({
      certificate,
      expiresAt: compCalc,
      expiresAtCompCertCalc: compCalc,
      expiresAtFirearmCalc: firearmCalc,
    });
  }

  return updates;
};

export const recalculateAndPersistCompetencyExpiries = (opts?: {
  certificates?: CompetencyCertificate[];
  firearms?: Firearm[];
}): {
  updatedCount: number;
  updatedById: Map<string, CompetencyCertificate>;
} => {
  const firearms = opts?.firearms ?? listByType<Firearm>('Firearm');
  const certificates = opts?.certificates ?? listByType<CompetencyCertificate>('CompetencyCertificate');
  const updates = deriveCompetencyExpiryUpdates({ certificates, firearms });
  const updatedById = new Map<string, CompetencyCertificate>();
  updates.forEach(({ certificate, expiresAt, expiresAtCompCertCalc, expiresAtFirearmCalc }) => {
    const next = touch({
      ...certificate,
      expiresAt,
      expiresAtCompCertCalc,
      expiresAtFirearmCalc,
    } as CompetencyCertificate);
    persist(next);
    if (next.id) updatedById.set(String(next.id), next);
  });
  return {
    updatedCount: updates.length,
    updatedById,
  };
};
