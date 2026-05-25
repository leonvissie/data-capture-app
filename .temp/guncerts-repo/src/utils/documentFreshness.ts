import { type DocumentFreshnessRule } from '../config/appConfig';

export type DocumentFreshnessStatus = 'unknown' | 'fresh' | 'warning' | 'expired';

export type DateFreshness = {
  status: DocumentFreshnessStatus;
  date?: string;
  ageDays: number | null;
  rule: DocumentFreshnessRule;
};

export type DocumentFreshnessEntry = {
  id: string;
  date?: string | null;
  rule: DocumentFreshnessRule;
  label?: string;
};

export type AggregatedDocumentFreshness = {
  status: DocumentFreshnessStatus;
  warningAgeDays: number | null;
  expiryAgeDays: number | null;
  oldestDate?: string;
  oldestAgeDays: number | null;
  expiredIds: string[];
  warningIds: string[];
  affectedLabels: string[];
  rule?: DocumentFreshnessRule;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
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

const getTodayUtc = (now = new Date()) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

export const getDateFreshness = (
  dateValue: string | null | undefined,
  rule: DocumentFreshnessRule,
  now = new Date(),
): DateFreshness => {
  const parsed = parseIsoDate(dateValue);
  if (!parsed) {
    return {
      status: 'unknown',
      date: dateValue ?? undefined,
      ageDays: null,
      rule,
    };
  }
  const ageDays = Math.floor((getTodayUtc(now) - parsed.getTime()) / MS_PER_DAY);
  if (ageDays > rule.expiryAgeDays) {
    return { status: 'expired', date: dateValue ?? undefined, ageDays, rule };
  }
  if (ageDays > rule.warningAgeDays) {
    return { status: 'warning', date: dateValue ?? undefined, ageDays, rule };
  }
  return { status: 'fresh', date: dateValue ?? undefined, ageDays, rule };
};

export const aggregateDocumentFreshness = (
  entries: DocumentFreshnessEntry[],
  now = new Date(),
): AggregatedDocumentFreshness => {
  const evaluated = entries
    .map((entry) => {
      const freshness = getDateFreshness(entry.date, entry.rule, now);
      return {
        ...entry,
        freshness,
      };
    })
    .filter((entry) => entry.freshness.status !== 'unknown');

  if (!evaluated.length) {
    return {
      status: 'unknown',
      warningAgeDays: null,
      expiryAgeDays: null,
      oldestAgeDays: null,
      expiredIds: [],
      warningIds: [],
      affectedLabels: [],
    };
  }

  const oldest = evaluated.reduce((current, entry) =>
    (entry.freshness.ageDays ?? -1) > (current.freshness.ageDays ?? -1) ? entry : current
  );
  const expired = evaluated.filter((entry) => entry.freshness.status === 'expired');
  const warning = evaluated.filter((entry) => entry.freshness.status === 'warning');
  const status: DocumentFreshnessStatus =
    expired.length > 0 ? 'expired' : warning.length > 0 ? 'warning' : 'fresh';
  const activeEntries = status === 'expired' ? expired : status === 'warning' ? warning : [];
  const activeRule = activeEntries[0]?.rule ?? oldest.rule;

  return {
    status,
    warningAgeDays: activeRule.warningAgeDays,
    expiryAgeDays: activeRule.expiryAgeDays,
    oldestDate: oldest.date ?? undefined,
    oldestAgeDays: oldest.freshness.ageDays,
    expiredIds: expired.map((entry) => entry.id),
    warningIds: warning.map((entry) => entry.id),
    affectedLabels: Array.from(new Set(activeEntries.map((entry) => entry.label || entry.rule.label))),
    rule: activeRule,
  };
};
