import { appConfig } from '../config/appConfig';
import { Membership, MembershipDocument } from '../data/types';
import { aggregateDocumentFreshness, type AggregatedDocumentFreshness } from './documentFreshness';

const membershipDocRuleByKind: Partial<Record<MembershipDocument, keyof typeof appConfig.documentFreshness>> = {
  ASSOCIATION_MEMBERSHIP: 'associationMembership',
  ASSOCIATION_LETTER: 'associationLetter',
  DEDICATED_HUNTER_CERT: 'dedicatedHunter',
  DEDICATED_SPORT_CERT: 'dedicatedSport',
};

export type MembershipDocumentFreshness = AggregatedDocumentFreshness;

export const getMembershipDocumentFreshness = (
  memberships: Membership[],
  now = new Date(),
): MembershipDocumentFreshness => {
  const entries = memberships.flatMap((membership) =>
    (membership.membershipDocumentIds ?? [])
      .map((entry) => {
        const key = membershipDocRuleByKind[entry.kind];
        if (!key) return null;
        const rule = appConfig.documentFreshness[key];
        return {
          id: `${membership.id}:${entry.documentId}:${entry.kind}`,
          date: entry.issueDate,
          rule,
          label: rule.label,
        };
      })
      .filter(Boolean)
  ) as Array<{ id: string; date?: string; rule: (typeof appConfig.documentFreshness)[keyof typeof appConfig.documentFreshness]; label: string }>;

  return aggregateDocumentFreshness(entries, now);
};

export const buildMembershipDocumentFreshnessCopy = (
  freshness: MembershipDocumentFreshness,
) => {
  if (freshness.status === 'expired') {
    return `At least one selected membership document issue date is more than ${freshness.expiryAgeDays} days old. Update your membership documents before finalising this application.`;
  }
  if (freshness.status === 'warning') {
    return `At least one selected membership document issue date is more than ${freshness.warningAgeDays} days old. Some DFOs may require a more recent membership document when you submit your application.`;
  }
  return null;
};
