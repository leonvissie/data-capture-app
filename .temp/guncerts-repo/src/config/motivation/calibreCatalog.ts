import { factBank } from './factBank';
import type { FactCalibreCatalogRecord } from './factBank.types';
import {
  resolveCalibreCatalogRecordFromList,
  searchCalibreCatalogByAlias,
} from './calibreCatalog.shared';

export function listCalibreCatalogRecords(): FactCalibreCatalogRecord[] {
  return factBank.calibreCatalog ?? [];
}

export function resolveCalibreCatalogRecordShared(
  calibre?: string
): FactCalibreCatalogRecord | undefined {
  return resolveCalibreCatalogRecordFromList(calibre, factBank.calibreCatalog);
}

export function searchCalibreCatalogRecordsByAlias(
  query?: string,
  limit = 20
): FactCalibreCatalogRecord[] {
  return searchCalibreCatalogByAlias(query, factBank.calibreCatalog, limit);
}
