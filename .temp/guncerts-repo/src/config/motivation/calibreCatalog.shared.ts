import type { FactCalibreCatalogRecord } from './factBank.types';

export function normalizeCalibreCatalogLookupKey(value?: string): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function resolveCalibreCatalogRecordFromList(
  calibre: string | undefined,
  catalogue: FactCalibreCatalogRecord[] | undefined
): FactCalibreCatalogRecord | undefined {
  const normalizedLookup = normalizeCalibreCatalogLookupKey(calibre);
  if (!normalizedLookup || !catalogue?.length) return undefined;

  return catalogue.find((entry) => {
    const candidates = [entry.key, entry.label, ...(entry.aliases ?? [])];
    return candidates.some(
      (candidate) => normalizeCalibreCatalogLookupKey(candidate) === normalizedLookup
    );
  });
}

export function searchCalibreCatalogByAlias(
  query: string | undefined,
  catalogue: FactCalibreCatalogRecord[] | undefined,
  limit = 20
): FactCalibreCatalogRecord[] {
  const normalizedQuery = normalizeCalibreCatalogLookupKey(query);
  if (!normalizedQuery || !catalogue?.length) return [];

  const scored = catalogue
    .map((entry) => {
      const aliases = entry.aliases ?? [];
      let bestScore = Number.MAX_SAFE_INTEGER;

      for (const alias of aliases) {
        const normalizedAlias = normalizeCalibreCatalogLookupKey(alias);
        if (!normalizedAlias) continue;
        if (normalizedAlias === normalizedQuery) {
          bestScore = Math.min(bestScore, 0);
          continue;
        }
        if (normalizedAlias.startsWith(normalizedQuery)) {
          bestScore = Math.min(bestScore, 1);
          continue;
        }
        if (normalizedAlias.includes(normalizedQuery)) {
          bestScore = Math.min(bestScore, 2);
        }
      }

      return { entry, bestScore };
    })
    .filter((row) => row.bestScore !== Number.MAX_SAFE_INTEGER)
    .sort((a, b) => {
      if (a.bestScore !== b.bestScore) return a.bestScore - b.bestScore;
      return a.entry.label.localeCompare(b.entry.label);
    });

  const unique = new Set<string>();
  const results: FactCalibreCatalogRecord[] = [];
  for (const row of scored) {
    if (unique.has(row.entry.key)) continue;
    unique.add(row.entry.key);
    results.push(row.entry);
    if (results.length >= limit) break;
  }

  return results;
}
