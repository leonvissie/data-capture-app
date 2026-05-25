import { ApplicationDocState, Document, Profile } from '../data/types';
import { listByType } from '../data/sqlite';
import { getProofOfAddressFreshness } from './proofOfAddressFreshness';

const PROFILE_ID_KINDS: Document['kind'][] = ['ID_CARD', 'ID_BOOK', 'PASSPORT'];
const PROFILE_ADDRESS_KINDS: Document['kind'][] = ['PROOF_OF_ADDRESS'];

const sortByRecentUpdate = (a: Document, b: Document) => {
  const ta = Date.parse(a.updatedAt || a.createdAt || '');
  const tb = Date.parse(b.updatedAt || b.createdAt || '');
  return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
};

const pickLatestForKinds = (
  docs: Document[],
  profileId: string,
  kinds: Document['kind'][]
) => {
  return docs
    .filter(
      (doc) =>
        doc.parentType === 'Profile' &&
        String(doc.parentId ?? '') === profileId &&
        kinds.includes(doc.kind)
    )
    .slice()
    .sort(sortByRecentUpdate)[0];
};

/**
 * When creating an application, reuse the most recent proof of ID/address
 * already linked to the profile so the user does not need to upload again.
 */
export function linkExistingProfileProofs(
  seeded: ApplicationDocState | undefined,
  profile: Profile | null
): ApplicationDocState | undefined {
  if (!profile || !profile.id || !seeded) return seeded;
  const profileId = String(profile.id);
  const allDocs = listByType<Document>('Document');

  const latestIdDoc = pickLatestForKinds(allDocs, profileId, PROFILE_ID_KINDS);
  const latestAddressDoc = pickLatestForKinds(allDocs, profileId, PROFILE_ADDRESS_KINDS);

  const nextDocuments = [...(seeded.documents ?? [])];
  const requirementByCode = new Map(seeded.requirements.map((req) => [req.code, req] as const));
  const findRequirementCode = (fallbackCode: string, kind: Document['kind']) => {
    if (requirementByCode.has(fallbackCode)) return fallbackCode;
    const match = seeded.requirements.find((req) =>
      (req.documentKinds ?? []).some((entry) => entry.kind === kind)
    );
    return match?.code;
  };

  const addEntry = (doc: Document, fallbackCode: string) => {
    if (!doc?.id) return;
    if (nextDocuments.some((entry) => entry.documentId === doc.id)) return;
    const requirementCode = findRequirementCode(fallbackCode, doc.kind);
    if (!requirementCode) return;
    nextDocuments.push({
      requirementCode,
      kind: doc.kind,
      documentId: doc.id,
      source: { type: 'Profile', id: profileId },
    });
  };

  if (latestIdDoc) {
    addEntry(latestIdDoc, 'ID_DOC');
  }
  if (latestAddressDoc && getProofOfAddressFreshness(profile.proofOfAddressDate).status !== 'expired') {
    addEntry(latestAddressDoc, 'PROOF_OF_ADDRESS');
  }

  return { ...seeded, documents: nextDocuments };
}
