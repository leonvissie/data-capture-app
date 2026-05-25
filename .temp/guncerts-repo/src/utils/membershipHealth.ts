import type { Membership } from '../data/types';

export type MembershipHealthIssue = 'ENDORSEMENT_CATEGORY_MISSING';

export type MembershipHealth = {
  status: 'ok' | 'warning';
  issues: MembershipHealthIssue[];
  ctaText: string;
};

export function getMembershipHealth(membership: Membership | null | undefined): MembershipHealth {
  if (!membership) {
    return {
      status: 'ok',
      issues: [],
      ctaText: 'Tap to view & edit',
    };
  }

  const issues: MembershipHealthIssue[] = [];
  const entries = Array.isArray(membership.membershipDocumentIds)
    ? membership.membershipDocumentIds
    : [];

  const hasMissingEndorsementCategory = entries.some((entry) => {
    if (entry?.kind !== 'FIREARM_ENDORSEMENT') return false;
    const hasDoc = typeof entry.documentId === 'string' && entry.documentId.trim().length > 0;
    if (!hasDoc) return false;
    const category = `${entry.category ?? ''}`.trim().toUpperCase();
    return category !== 'SELF_DEFENCE' && category !== 'HUNTING' && category !== 'SPORT_SHOOTING';
  });

  if (hasMissingEndorsementCategory) {
    issues.push('ENDORSEMENT_CATEGORY_MISSING');
  }

  if (!issues.length) {
    return {
      status: 'ok',
      issues: [],
      ctaText: 'Tap to view & edit',
    };
  }

  return {
    status: 'warning',
    issues,
    ctaText: 'Tap to add missing info',
  };
}

