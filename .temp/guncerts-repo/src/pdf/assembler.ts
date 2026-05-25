import { PDFDocument } from 'pdf-lib';
import * as FileSystem from 'expo-file-system';
import { base64ToUint8Array } from './base64';
import { resolveDocumentUri } from '../utils/documentPaths';

export type AnnexureInput = {
  label: string;
  fileUri?: string;
  bytes?: Uint8Array | ArrayBuffer;
};

export async function appendAnnexures(base: PDFDocument, annexures: AnnexureInput[]) {
  for (const annexure of annexures) {
    let bytes: Uint8Array | null = null;

    if (annexure.bytes) {
      bytes =
        annexure.bytes instanceof Uint8Array
          ? annexure.bytes
          : new Uint8Array(annexure.bytes);
    } else if (annexure.fileUri) {
      const resolved = resolveDocumentUri(annexure.fileUri) ?? annexure.fileUri;
      const base64 = await FileSystem.readAsStringAsync(resolved, {
        encoding: 'base64',
      });
      bytes = base64ToUint8Array(base64);
    }

    if (!bytes || !bytes.length) {
      continue;
    }

    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await base.copyPages(doc, doc.getPageIndices());
    copied.forEach((page) => {
      base.addPage(page);
    });
  }
}
