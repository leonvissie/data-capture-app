import { Profile, ReferenceInfo, ReferenceRelationshipCategory } from '../data/types';

export const normalizeReferenceCategory = (value?: string | null): ReferenceRelationshipCategory | undefined => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'spouse' || raw === 'family' || raw === 'friend' || raw === 'colleague' || raw === 'neighbour') {
    return raw;
  }
  return undefined;
};

export const normalizeReferenceDetail = (value?: string | null) => String(value ?? '').trim();

export const isSpouseCategory = (value?: string | null) =>
  normalizeReferenceCategory(value) === 'spouse';

const normalizeKey = (category?: string | null, detail?: string | null) => {
  const c = normalizeReferenceCategory(category) ?? '';
  const d = normalizeReferenceDetail(detail).toLowerCase();
  return `${c}::${d}`;
};

export const resolveProfileAddressLine = (profile?: Profile | null): string | undefined => {
  const singleLine = profile?.address?.singleLine?.trim() ?? '';
  const line1 = profile?.address?.line1?.trim() ?? '';
  const line2 = profile?.address?.line2?.trim() ?? '';
  const suburb = profile?.address?.suburb?.trim() ?? '';
  const city = profile?.address?.city?.trim() ?? '';
  const postCode = profile?.address?.postCode?.trim() ?? '';
  const line = singleLine || [line1, line2, suburb, city].filter(Boolean).join(', ');
  const value = [line, postCode].filter(Boolean).join(', ');
  return value || undefined;
};

export const getReferences = (profile?: Profile | null): ReferenceInfo[] =>
  Array.isArray(profile?.references) ? [...(profile?.references ?? [])] : [];

export const statementNumberFromSlot = (slot?: string | null): 1 | 2 | 3 | undefined => {
  if (slot === 'spouse_family') return 1;
  if (slot === 'friend_colleague_neighbour') return 2;
  if (slot === 'additional_reference') return 3;
  return undefined;
};

export const getReferenceByStatementNumber = (
  profile: Profile | null | undefined,
  statementNumber?: number | null
): ReferenceInfo | undefined => {
  if (statementNumber !== 1 && statementNumber !== 2 && statementNumber !== 3) return undefined;
  return getReferences(profile).find((ref) => ref.statementNumber === statementNumber);
};

export const getReferenceByStatementAndCategory = (
  profile: Profile | null | undefined,
  statementNumber?: number | null,
  category?: string | null
): ReferenceInfo | undefined => {
  if (statementNumber !== 1 && statementNumber !== 2 && statementNumber !== 3) return undefined;
  const normalizedCategory = normalizeReferenceCategory(category);
  if (!normalizedCategory) return undefined;
  return getReferences(profile).find(
    (ref) =>
      ref.statementNumber === statementNumber &&
      normalizeReferenceCategory(ref.relationshipCategory) === normalizedCategory
  );
};

export const getReferenceByStatementCategoryAndDetail = (
  profile: Profile | null | undefined,
  statementNumber?: number | null,
  category?: string | null,
  detail?: string | null
): ReferenceInfo | undefined => {
  if (statementNumber !== 1 && statementNumber !== 2 && statementNumber !== 3) return undefined;
  const key = normalizeKey(category, detail);
  if (!key || key === '::') return undefined;
  return getReferences(profile).find(
    (ref) =>
      ref.statementNumber === statementNumber &&
      normalizeKey(ref.relationshipCategory, ref.relationshipDetail || ref.type) === key
  );
};

export const getSpouseReference = (profile?: Profile | null): ReferenceInfo | undefined =>
  getReferences(profile).find((ref) => isSpouseCategory(ref.relationshipCategory));

export const getFirstReferenceByCategory = (
  profile: Profile | null | undefined,
  category?: string | null
): ReferenceInfo | undefined => {
  const normalized = normalizeReferenceCategory(category);
  if (!normalized) return undefined;
  return getReferences(profile).find(
    (ref) => normalizeReferenceCategory(ref.relationshipCategory) === normalized
  );
};

export const getReferenceByCategoryAndDetail = (
  profile: Profile | null | undefined,
  category?: string | null,
  detail?: string | null
): ReferenceInfo | undefined => {
  const key = normalizeKey(category, detail);
  if (!key || key === '::') return undefined;
  return getReferences(profile).find(
    (ref) => normalizeKey(ref.relationshipCategory, ref.relationshipDetail || ref.type) === key
  );
};

export const upsertReference = (
  references: ReferenceInfo[],
  incoming: ReferenceInfo
): ReferenceInfo[] => {
  const category = normalizeReferenceCategory(incoming.relationshipCategory);
  const detail = normalizeReferenceDetail(incoming.relationshipDetail || incoming.type);
  const normalizedIncoming: ReferenceInfo = {
    ...incoming,
    relationshipCategory: category,
    relationshipDetail: detail || undefined,
    type: detail || undefined,
  };

  const statementNumber =
    normalizedIncoming.statementNumber === 1 ||
    normalizedIncoming.statementNumber === 2 ||
    normalizedIncoming.statementNumber === 3
      ? normalizedIncoming.statementNumber
      : undefined;

  if (statementNumber) {
    const idxByStatementAndCategoryAndDetail = references.findIndex(
      (ref) =>
        ref.statementNumber === statementNumber &&
        normalizeKey(ref.relationshipCategory, ref.relationshipDetail || ref.type) ===
          normalizeKey(normalizedIncoming.relationshipCategory, normalizedIncoming.relationshipDetail || normalizedIncoming.type)
    );
    if (idxByStatementAndCategoryAndDetail >= 0) {
      const next = [...references];
      next[idxByStatementAndCategoryAndDetail] = {
        ...next[idxByStatementAndCategoryAndDetail],
        ...normalizedIncoming,
      };
      return next;
    }
    return [...references, normalizedIncoming];
  }

  if (isSpouseCategory(category)) {
    const withoutSpouse = references.filter((ref) => !isSpouseCategory(ref.relationshipCategory));
    return [...withoutSpouse, normalizedIncoming];
  }

  const key = normalizeKey(category, detail);
  const idx = references.findIndex((ref) =>
    normalizeKey(ref.relationshipCategory, ref.relationshipDetail || ref.type) === key
  );
  if (idx < 0) return [...references, normalizedIncoming];
  const next = [...references];
  next[idx] = { ...next[idx], ...normalizedIncoming };
  return next;
};
