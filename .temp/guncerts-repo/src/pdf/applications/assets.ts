import type { FieldMap } from '../templates';

const PDF_ASSETS: Record<string, number> = {
  'assets/pdf/517.pdf': require('../../../assets/pdf/517.pdf'),
  'assets/pdf/517g.pdf': require('../../../assets/pdf/517g.pdf'),
  'assets/pdf/518a.pdf': require('../../../assets/pdf/518a.pdf'),
  'assets/pdf/518aAnnexA.pdf': require('../../../assets/pdf/518aAnnexA.pdf'),
};

const FIELD_MAP_ASSETS: Record<string, FieldMap> = {
  'assets/fieldmap/517.json': require('../../../assets/fieldmap/517.json'),
  'assets/fieldmap/517g.json': require('../../../assets/fieldmap/517g.json'),
  'assets/fieldmap/518a.json': require('../../../assets/fieldmap/518a.json'),
  'assets/fieldmap/518aAnnexA.json': require('../../../assets/fieldmap/518aAnnexA.json'),
};

function normalizePolicyAssetPath(path?: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/').trim();
  if (!normalized) return null;
  const idx = normalized.indexOf('assets/');
  if (idx >= 0) {
    return normalized.slice(idx);
  }
  const trimmed = normalized.replace(/^(\.\.\/)+/, '');
  if (trimmed.startsWith('assets/')) {
    return trimmed;
  }
  return `assets/${trimmed.replace(/^\.?\//, '')}`;
}

export function resolvePdfAssetModule(path?: string | null): number | null {
  const key = normalizePolicyAssetPath(path);
  if (!key) return null;
  return PDF_ASSETS[key] ?? null;
}

export function resolveFieldMapAsset(path?: string | null): FieldMap | null {
  const key = normalizePolicyAssetPath(path);
  if (!key) return null;
  const map = FIELD_MAP_ASSETS[key];
  if (!map) {
    return null;
  }
  return map;
}
