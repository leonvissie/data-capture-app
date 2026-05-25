export const MEMBERSHIP_DOCUMENT_LABELS: Record<string, string> = {
  ASSOCIATION_LETTER: 'Proof of membership',
  ASSOCIATION_MEMBERSHIP: 'Membership card',
  DEDICATED_HUNTER_CERT: 'Dedicated hunter certificate',
  DEDICATED_SPORT_CERT: 'Dedicated sport certificate',
};

const MEMBERSHIP_DOCUMENT_ORDER: string[] = [
  'ASSOCIATION_LETTER',
  'ASSOCIATION_MEMBERSHIP',
  'DEDICATED_HUNTER_CERT',
  'DEDICATED_SPORT_CERT',
  'FIREARM_ENDORSEMENT',
];

function normalizeMembershipCode(code?: string | null): string {
  return `${code ?? ''}`.trim().toUpperCase();
}

export function getMembershipDocumentLabel(code?: string | null): string | undefined {
  const normalized = normalizeMembershipCode(code);
  if (!normalized) return undefined;
  return MEMBERSHIP_DOCUMENT_LABELS[normalized];
}

export function getMembershipDocumentSortRank(code?: string | null): number {
  const normalized = normalizeMembershipCode(code);
  const index = MEMBERSHIP_DOCUMENT_ORDER.indexOf(normalized);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

