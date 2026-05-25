import { appConfig } from '../config/appConfig';
import { Membership } from '../data/types';

export type MembershipSubmissionValidityStatus = 'unknown' | 'ok' | 'warning' | 'expired';

export type MembershipSubmissionValidity = {
  status: MembershipSubmissionValidityStatus;
  warningDays: number;
  nearestExpiryDate?: string;
  nearestDaysUntil: number | null;
  expiredIds: string[];
  warningIds: string[];
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const parseIsoDate = (value?: string | null) => {
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

export const getMembershipSubmissionValidity = (
  memberships: Membership[],
  now = new Date(),
): MembershipSubmissionValidity => {
  const warningDays = appConfig.membership.submissionWarningDays;
  const todayUtc = getTodayUtc(now);
  const candidates = memberships
    .map((membership) => {
      const expiresAt = `${membership.membershipExpiresAt ?? ''}`.trim();
      const parsed = parseIsoDate(expiresAt);
      if (!parsed) return null;
      const daysUntil = Math.floor((parsed.getTime() - todayUtc) / MS_PER_DAY);
      return {
        id: String(membership.id),
        expiresAt,
        daysUntil,
      };
    })
    .filter(Boolean) as { id: string; expiresAt: string; daysUntil: number }[];

  if (!candidates.length) {
    return {
      status: 'unknown',
      warningDays,
      nearestDaysUntil: null,
      expiredIds: [],
      warningIds: [],
    };
  }

  const nearest = candidates.reduce((current, candidate) =>
    candidate.daysUntil < current.daysUntil ? candidate : current
  );
  const expiredIds = candidates.filter((candidate) => candidate.daysUntil < 0).map((candidate) => candidate.id);
  const warningIds = candidates
    .filter((candidate) => candidate.daysUntil >= 0 && candidate.daysUntil <= warningDays)
    .map((candidate) => candidate.id);

  const status: MembershipSubmissionValidityStatus =
    expiredIds.length > 0 ? 'expired' : warningIds.length > 0 ? 'warning' : 'ok';

  return {
    status,
    warningDays,
    nearestExpiryDate: nearest.expiresAt,
    nearestDaysUntil: nearest.daysUntil,
    expiredIds,
    warningIds,
  };
};

export const buildMembershipSubmissionWarningCopy = (
  validity: MembershipSubmissionValidity,
) => {
  if (validity.status === 'expired') {
    return 'At least one selected membership has expired. Update your membership before finalising this application if your application depends on a valid firearm association membership.';
  }
  if (validity.status === 'warning') {
    const daysUntil = Math.max(0, validity.nearestDaysUntil ?? validity.warningDays);
    const dayLabel = daysUntil === 1 ? 'day' : 'days';
    return `At least one selected membership expires in ${daysUntil} ${dayLabel}. Some DFOs may require your membership to remain valid for at least another ${validity.warningDays} days when you submit your application.`;
  }
  return null;
};
