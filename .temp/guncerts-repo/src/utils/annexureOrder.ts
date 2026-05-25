export type ParsedAnnexureReference = {
  raw: string;
  prefix: string;
  index: number;
  valid: boolean;
};

export function parseAnnexureReference(value?: string | null): ParsedAnnexureReference {
  const raw = `${value ?? ''}`.trim().toUpperCase().replace(/^ANNEXURE\s+/, '');
  const match = /^([A-Z]+)(\d+)?$/.exec(raw);
  if (!match) {
    return {
      raw,
      prefix: raw || 'ZZZ',
      index: Number.MAX_SAFE_INTEGER,
      valid: false,
    };
  }
  return {
    raw,
    prefix: match[1],
    index: match[2] ? Number.parseInt(match[2], 10) : 0,
    valid: true,
  };
}

export function compareAnnexureReferences(
  left?: string | null,
  right?: string | null
): number {
  const a = parseAnnexureReference(left);
  const b = parseAnnexureReference(right);

  if (a.valid !== b.valid) return a.valid ? -1 : 1;
  if (a.prefix !== b.prefix) return a.prefix.localeCompare(b.prefix);
  if (a.index !== b.index) return a.index - b.index;
  return a.raw.localeCompare(b.raw);
}

