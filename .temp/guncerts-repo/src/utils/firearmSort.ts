import type { Firearm } from '../data/types';

const FIREARM_TYPE_ORDER: Array<NonNullable<Firearm['firearmType']> | 'Other' | 'Combination'> = [
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
  'Combination',
  'Other',
];

const typeRank = new Map(FIREARM_TYPE_ORDER.map((type, index) => [type, index]));

const normalize = (value?: string | null) => (value ?? '').trim();

const serialOf = (firearm: Firearm) =>
  normalize(
    firearm.firearmSerialNumber ||
      firearm.receiverSerialNumber ||
      firearm.frameSerialNumber ||
      firearm.barrelSerialNo ||
      ''
  );

const sectionSortKey = (section?: string | null) => {
  const value = normalize(section).toUpperCase().replace(/^SECTION\s*/, '');
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) {
    return { rank: 0, numeric, raw: value };
  }
  return { rank: value ? 1 : 2, numeric: Number.MAX_SAFE_INTEGER, raw: value };
};

const firearmTypeSortKey = (type?: Firearm['firearmType'] | null) => {
  const value = normalize(type);
  const rank = typeRank.get(value as any);
  if (typeof rank === 'number') return { rank, raw: value };
  return { rank: Number.MAX_SAFE_INTEGER, raw: value.toUpperCase() };
};

export const compareFirearms = (a: Firearm, b: Firearm) => {
  const sectionA = sectionSortKey(a.section);
  const sectionB = sectionSortKey(b.section);
  if (sectionA.rank !== sectionB.rank) return sectionA.rank - sectionB.rank;
  if (sectionA.numeric !== sectionB.numeric) return sectionA.numeric - sectionB.numeric;
  if (sectionA.raw !== sectionB.raw) {
    const cmp = sectionA.raw.localeCompare(sectionB.raw);
    if (cmp !== 0) return cmp;
  }

  const typeA = firearmTypeSortKey(a.firearmType);
  const typeB = firearmTypeSortKey(b.firearmType);
  if (typeA.rank !== typeB.rank) return typeA.rank - typeB.rank;
  if (typeA.raw !== typeB.raw) {
    const cmp = typeA.raw.localeCompare(typeB.raw);
    if (cmp !== 0) return cmp;
  }

  const makeA = normalize(a.make).toUpperCase();
  const makeB = normalize(b.make).toUpperCase();
  if (makeA || makeB) {
    const cmp = makeA.localeCompare(makeB);
    if (cmp !== 0) return cmp;
  }

  const modelA = normalize(a.model).toUpperCase();
  const modelB = normalize(b.model).toUpperCase();
  if (modelA || modelB) {
    const cmp = modelA.localeCompare(modelB);
    if (cmp !== 0) return cmp;
  }

  const serialA = serialOf(a).toUpperCase();
  const serialB = serialOf(b).toUpperCase();
  if (serialA || serialB) {
    const cmp = serialA.localeCompare(serialB);
    if (cmp !== 0) return cmp;
  }

  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
};

