export type RawLicenceType =
  | string
  | {
      name?: string;
      shortname?: string;
      section?: string;
      status?: string;
      membershipRequired?: boolean | 'required' | 'optional' | 'none';
      includeMembershipIfPresent?: boolean;
      [key: string]: unknown;
    };

export type NormalizedLicenceType = {
  code: string;
  name: string;
  section?: string;
  status?: string;
  raw: RawLicenceType;
};

export const FALLBACK_518A_LICENCE_TYPES: Record<string, RawLicenceType> = {
  '1.1': { name: 'Self-defence', section: 'Section 13' },
  //'1.2': { name: 'Restricted firearm (self-defence)', section: 'Section 14' },
  //'1.3': { name: 'Security officer purposes', section: 'Section 20' },
  '1.4': { name: 'Occasional hunting / sports-shooting', section: 'Section 15' },
  '1.5': { name: 'Dedicated hunting / sports-shooting', section: 'Section 16' },
  //'1.6': { name: 'Private collection', section: 'Section 17' },
  //'1.7': { name: 'Public collection (museums)', section: 'Section 18' },
  //'1.8': { name: 'Business purposes: hunting', section: 'Section 19(1)' },
  //'1.9': { name: 'Business purposes: other', section: 'Section 20' },
};

const toCleanString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const compareCodes = (a: string, b: string) => {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
    return na - nb;
  }
  return a.localeCompare(b);
};

export function normalizeLicenceTypes(
  record?: Record<string, RawLicenceType>
): NormalizedLicenceType[] {
  if (!record) return [];

  return Object.entries(record)
    .map(([code, value]) => {
      if (typeof value === 'string') {
        return {
          code,
          name: toCleanString(value) ?? code,
          raw: value,
        };
      }

      const name = toCleanString(value.name) ?? code;
      const section = toCleanString(value.section);
      const status = toCleanString(value.status);

      return { code, name, section, status, raw: value };
    })
    .sort((a, b) => compareCodes(a.code, b.code));
}

export function normalizeLicenceTypesWithFallback(
  record?: Record<string, RawLicenceType>,
  fallback?: Record<string, RawLicenceType>
): NormalizedLicenceType[] {
  const normalized = normalizeLicenceTypes(record);
  if (normalized.length > 0) return normalized;
  if (!fallback) return [];
  return normalizeLicenceTypes(fallback);
}

export function buildLicenceLabelMap(
  record?: Record<string, RawLicenceType>
): Record<string, string> {
  const map: Record<string, string> = {};
  normalizeLicenceTypes(record).forEach((entry) => {
    map[entry.code] = entry.name;
  });
  return map;
}

const SECTION_MATCH = /\d+(?:\(\d+\))?/g;

function extractSectionTokens(section?: string): string[] {
  if (!section) return [];
  const tokens = new Set<string>();

  const cleaned = section.trim();
  if (!cleaned) return [];

  const matches = cleaned.match(SECTION_MATCH);
  if (matches) {
    matches.forEach((match) => {
      tokens.add(match);
      const digits = match.replace(/[^0-9]/g, '');
      if (digits) tokens.add(digits);
    });
  }

  const digitsOnly = cleaned.replace(/[^0-9]/g, '');
  if (digitsOnly) {
    tokens.add(digitsOnly);
  }

  return Array.from(tokens);
}

export function buildSectionToCodeIndex(
  record?: Record<string, RawLicenceType>
): Record<string, string> {
  const map: Record<string, string> = {};
  normalizeLicenceTypes(record).forEach((entry) => {
    const section = entry.section;
    const clean = toCleanString(section);
    if (clean) {
      const upperClean = clean.toUpperCase();
      if (!map[upperClean]) {
        map[upperClean] = entry.code;
      }
      const stripped = clean.replace(/^SECTION\s*/i, '').trim();
      if (stripped) {
        const upperStripped = stripped.toUpperCase();
        if (!map[upperStripped]) {
          map[upperStripped] = entry.code;
        }
      }
    }

    extractSectionTokens(section).forEach((token) => {
      const upper = token.toUpperCase();
      if (!map[upper]) {
        map[upper] = entry.code;
      }
    });
  });
  return map;
}
