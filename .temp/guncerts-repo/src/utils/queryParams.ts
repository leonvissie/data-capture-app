export function parseArrayParam(value?: string | string[]): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  arr.forEach((item) => {
    const raw = String(item ?? '').trim();
    if (!raw) return;

    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            if (entry === null || entry === undefined) return;
            const str = String(entry).trim();
            if (str) out.push(str);
          });
          return;
        }
      } catch {
        // Ignore malformed JSON and fall back to basic parsing.
      }
    }

    if (raw.includes(',')) {
      raw.split(',').forEach((part) => {
        const str = part.trim();
        if (str) out.push(str);
      });
      return;
    }

    out.push(raw);
  });
  return out;
}
