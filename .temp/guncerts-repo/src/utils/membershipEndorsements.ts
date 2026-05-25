import { getById, listByType } from '../data/sqlite';
import type { Document, EndorsementCategory, Firearm, Membership, UUID } from '../data/types';
import { formatEndorsementDisplayLabel, formatFirearmTitle } from './firearmDisplay';

export type EndorsementMatch = {
  membershipId: UUID;
  membershipName: string;
  firearmId: UUID;
  firearmLabel: string;
  documentId: UUID;
  documentName: string;
  document?: Document | null;
  membership?: Membership | null;
};

const normalize = (value?: string | null) => `${value ?? ''}`.trim();

const toCode = (value?: string | null) => normalize(value).toUpperCase();

const unique = <T,>(items: T[]) => Array.from(new Set(items));

export function buildMembershipEndorsementLabels(input: {
  membership: Membership;
  documentsById: Map<string, Document>;
  firearmsById?: Map<string, Firearm>;
  allowedFirearmIds?: Set<string>;
}): string[] {
  const entries = input.membership.membershipDocumentIds ?? [];
  const grouped = new Map<string, { firearmTitle: string; categories: EndorsementCategory[] }>();

  entries.forEach((entry) => {
    const kind = toCode(entry?.kind);
    if (kind !== 'FIREARM_ENDORSEMENT') return;
    const docId = normalize(entry?.documentId);
    if (!docId) return;
    const doc = input.documentsById.get(docId);
    if (!doc || doc.deleted) return;

    const firearmId = normalize(entry?.relatedFirearmId || doc.requirementRelatedId);
    if (input.allowedFirearmIds && firearmId && !input.allowedFirearmIds.has(firearmId)) return;

    const firearm = firearmId ? input.firearmsById?.get(firearmId) : undefined;
    const firearmTitle =
      firearm ? formatFirearmTitle(firearm) : normalize(doc.name) || 'Firearm endorsement';
    const key = firearmId || firearmTitle;
    const existing = grouped.get(key) ?? { firearmTitle, categories: [] };
    const category = normalize(entry?.category) as EndorsementCategory;
    if (category) existing.categories.push(category);
    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .map((item) =>
      formatEndorsementDisplayLabel({
        firearmTitle: item.firearmTitle,
        categories: item.categories,
      }),
    )
    .sort((a, b) => a.localeCompare(b));
}

export function findMatchingMembershipEndorsements(input: {
  profileId?: string | null;
  firearmId?: string | null;
}): EndorsementMatch[] {
  const profileId = normalize(input.profileId);
  const firearmId = normalize(input.firearmId);
  if (!profileId || !firearmId) return [];

  const firearm = getById<Firearm>(firearmId);
  const firearmLabel = firearm ? formatFirearmTitle(firearm) : 'Firearm';
  const memberships = listByType<Membership>('Membership').filter(
    (membership) => normalize(membership.holderProfileId) === profileId
  );
  if (!memberships.length) return [];

  const docsById = new Map(
    listByType<Document>('Document').map((doc) => [normalize(doc.id), doc] as const)
  );

  const matches: EndorsementMatch[] = [];
  memberships.forEach((membership) => {
    const membershipName = normalize(membership.associationName) || 'Membership';
    (membership.membershipDocumentIds ?? []).forEach((entry) => {
      const kind = toCode(entry?.kind);
      if (kind !== 'FIREARM_ENDORSEMENT') return;
      const documentId = normalize(entry?.documentId);
      if (!documentId) return;
      const doc = docsById.get(documentId);
      if (!doc) return;
      const relatedFirearmId = normalize(doc.requirementRelatedId);
      if (relatedFirearmId !== firearmId) return;
      matches.push({
        membershipId: membership.id,
        membershipName,
        firearmId: firearmId as UUID,
        firearmLabel,
        documentId: doc.id,
        documentName: normalize(doc.name) || 'Endorsement',
        document: doc,
        membership,
      });
    });
  });

  return matches;
}

export function buildEndorsementSdaLine(matches: EndorsementMatch[], annexureLabel: string): string {
  if (!matches.length) return '';
  const annex = normalize(annexureLabel);
  const names = unique(
    matches
      .map((match) => normalize(match.membershipName))
      .filter(Boolean)
  );
  if (!names.length) return '';
  return `ANNEXURE ${annex}: Endorsement (${names.join(', ')})`;
}

export function buildEndorsementDetailLines(matches: EndorsementMatch[], annexureLabel: string): string[] {
  if (!matches.length) return [];
  const annex = normalize(annexureLabel);
  return matches.map(
    (match) =>
      `ANNEXURE ${annex}: ${match.membershipName} Endorsement: ${match.firearmLabel}`
  );
}
