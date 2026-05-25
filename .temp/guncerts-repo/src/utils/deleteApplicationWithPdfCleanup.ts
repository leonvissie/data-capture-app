import { deleteEntity, getById, listByType } from '../data/sqlite';
import { Application, Document } from '../data/types';
import { deleteOwnedDocFile } from './docCrypto';
import { logger } from '@/src/utils/logger';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function deleteApplicationRecordWithRetry(applicationId: string, logTag: string): Promise<boolean> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      deleteEntity(applicationId);
    } catch (error) {
      logger.warn(`${logTag} deleteEntity threw`, { applicationId, attempt, error });
    }
    const exists = getById<Application>(applicationId);
    if (!exists) return true;
    await delay(25 * attempt);
  }
  logger.warn(`${logTag} Application still present after delete retries`, { applicationId });
  return false;
}

export async function deleteApplicationWithPdfCleanup(
  application: Application,
  options?: { logTag?: string }
): Promise<boolean> {
  const logTag = options?.logTag ?? '[application/delete]';
  try {
    const docs = listByType<Document>('Document').filter((doc) => doc.applicationId === application.id);
    const pdfDocs = docs.filter((doc) => {
      const mime = (doc.mime ?? '').toLowerCase();
      const name = (doc.name ?? doc.filePath ?? '').toLowerCase();
      return mime === 'application/pdf' || name.endsWith('.pdf');
    });

    for (const doc of pdfDocs) {
      const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
      for (const path of paths) {
        try {
          await deleteOwnedDocFile(path);
        } catch {
          // Ignore storage delete errors.
        }
      }
      try {
        deleteEntity(doc.id);
      } catch {
        // Ignore doc record delete failures.
      }
    }
  } finally {
    // Always attempt to remove the application record, even if doc cleanup failed.
    return deleteApplicationRecordWithRetry(String(application.id), logTag);
  }
}

