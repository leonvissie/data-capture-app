import { Document } from '../data/types';
import { persistAsync, touch } from '../data/repo';
import { scanPdf417FromUri } from './provider';

/**
 * Ensures the provided document has barcode metadata persisted. Returns the original
 * Document when nothing changes, otherwise the updated persisted Document.
 */
export async function ensureDocumentBarcode(document: Document): Promise<Document> {
  if (!document) return document;
  const existing = document.barcodeData?.trim();
  if (existing) return document;
  if (!document.uri) return document;
  const result = await scanPdf417FromUri(document.uri);
  if (!result?.data?.trim()) return document;

  const next = touch({
    ...document,
    barcodeType: result.type ?? 'PDF417',
    barcodeData: result.data,
  } as Document);
  await persistAsync(next);
  Object.assign(document, {
    barcodeType: next.barcodeType,
    barcodeData: next.barcodeData,
    updatedAt: next.updatedAt,
    version: next.version,
  });
  return next;
}
