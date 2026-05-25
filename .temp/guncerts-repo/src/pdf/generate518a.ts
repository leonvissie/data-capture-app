import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile, Paths } from 'expo-file-system/next';
import { PDFDocument } from 'pdf-lib';
import { Document } from '../data/types';
import { withMeta } from '../data/repo';
import { saveEntity } from '../data/sqlite';
import { encryptCopyIntoDocs } from '../utils/docCrypto';
import { loadAssetBytes, loadJson } from './utils';
import { make518aPdf } from './make518a';
import { toRelativeDocumentPath } from '../utils/documentPaths';

// Adjust the require() paths to match your asset locations
const TEMPLATE_518A = require('../../assets/pdf/518a.pdf');
const FIELDMAP_518A = require('../../assets/fieldmaps/518a.json');

export async function generate518aForApplication(args: {
  application: any; // include id, licenceType, etc.
  profile: any;
  firearms: any[];  // if your fieldmap references them
}): Promise<Document> {
  // 1) Load assets
  const [templateBytes, fieldmap] = await Promise.all([
    loadAssetBytes(TEMPLATE_518A),
    loadJson<Record<string, string>>(FIELDMAP_518A),
  ]);

  // 2) Shape your data object to match your fieldmap’s paths
  const data = {
    application: args.application,
    profile: args.profile,
    firearms: args.firearms,
  };

  // 3) Generate PDF bytes
  const pdfBytes = await make518aPdf({ templateBytes, fieldmap, data });
  const pageCount = (await PDFDocument.load(pdfBytes)).getPageCount();

  // 4) Write temp file into cache
  let tmpDir: string | null | undefined;
  try {
    tmpDir = Paths.cache?.uri ?? Paths.document?.uri;
  } catch {
    tmpDir = undefined;
  }
  if (!tmpDir) {
    const ExpoFS: any = FileSystem;
    tmpDir = ExpoFS.cacheDirectory ?? ExpoFS.documentDirectory ?? null;
  }
  if (!tmpDir) {
    throw new Error('No writable directory available for generating 518a PDF');
  }
  const tmp = `${tmpDir}SAPS-518a_${args.application.id}.pdf`;
  const tmpFile = new FSFile(tmp);
  tmpFile.create({ intermediates: true, overwrite: true });
  tmpFile.write(pdfBytes);

  // 5) Encrypt+move into docs dir (owned file)
  const { destUri } = await encryptCopyIntoDocs(
    'Application',
    args.application.id,
    tmp,
    `SAPS-518a_${args.application.id}.pdf`,
    'application/pdf'
  );

  // 6) Create and persist a Document row linked to the application
  const docId = (globalThis.crypto?.randomUUID?.() ?? `doc_${Math.random().toString(36).slice(2)}`) as any;
  const storedPath = toRelativeDocumentPath(destUri) ?? destUri;
  const doc = withMeta<Document>({
    id: docId,
    type: 'Document',
    holderProfileId: (args.profile?.id ?? args.application?.applicantProfileId ?? '') as Document['holderProfileId'],
    kind: 'OTHER',
    filePath: storedPath,
    uri: storedPath,
    sha256: '',
    pages: pageCount,
    name: `SAPS-518a_${args.application.id}.pdf`,
    mime: 'application/pdf',
    size: pdfBytes.length,
    isEncrypted: true,
    encVersion: 'v1',
    applicationId: args.application.id,
    requirementCode: 'FORM_518A',
  } as Document);

  saveEntity(doc);
  return doc;
}
