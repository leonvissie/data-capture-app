import { PDFDocument } from 'pdf-lib';
import * as FileSystem from 'expo-file-system/legacy';
import { Application, Document } from '../data/types';
import { generateOrGetChecklistPdf } from './checklist';
import { generateApplicationPdf } from './applications';
import { generateSupportingDocumentsPdf, type PdfPageProgress } from './supporting';
import { generateMotivationPdf } from './motivation';
import { createPdfProgressTracker } from './progress';
import { base64ToUint8 } from './utils';
import { persist, withMeta } from '../data/repo';
import { warnTempStorageFallback } from '../utils/storageAlerts';
import { resolveDocumentUri, toRelativeDocumentPath } from '../utils/documentPaths';
import { resolveApplicationMotivation } from '../utils/motivationStore';

type PdfSource = {
  path?: string | null;
  uri?: string | null;
  base64?: string | null;
};

const BUNDLE_DIR = 'document-bundles';

const randomName = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).replace(/[^a-zA-Z0-9_-]/g, '');

function normalizeFileUri(path: string) {
  if (path.startsWith('file://')) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return path;
}

async function resolveBundleTarget(applicationId: string, form?: string | null): Promise<string | null> {
  let baseDir = FileSystem.documentDirectory ?? null;
  if (!baseDir) {
    warnTempStorageFallback();
    baseDir = FileSystem.cacheDirectory ?? null;
  }
  if (!baseDir) return null;
  const normalizedBase = baseDir.replace(/\/+$/, '');
  const dir = `${normalizedBase}/${BUNDLE_DIR}`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch (error: any) {
    if (!String(error?.message ?? '').includes('exists')) {
      throw error;
    }
  }
  const formPrefix = String(form ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const name = `${formPrefix ? `${formPrefix}-` : ''}${randomName()}-${applicationId}.pdf`;
  return normalizeFileUri(`${dir}/${name}`);
}

async function loadPdfBytes(source: PdfSource): Promise<Uint8Array> {
  const candidate = source.path || source.uri || '';
  const resolvedCandidate = resolveDocumentUri(candidate) ?? candidate;
  const normalized =
    resolvedCandidate.startsWith('file://') || resolvedCandidate.startsWith('content://')
      ? resolvedCandidate
      : resolvedCandidate ? `file://${resolvedCandidate}` : '';

  if (candidate.startsWith('data:application/pdf;base64,')) {
    const base64 = candidate.slice('data:application/pdf;base64,'.length);
    return base64ToUint8(base64);
  }

  if (!normalized) {
    const b64 = source.base64;
    if (!b64) throw new Error('No PDF source available.');
    const trimmed = b64.startsWith('data:application/pdf;base64,')
      ? b64.slice('data:application/pdf;base64,'.length)
      : b64;
    return base64ToUint8(trimmed);
  }

  const encoding =
    ((FileSystem as any)?.EncodingType?.Base64 as string | undefined) ?? ('base64' as any);
  const base64 = await FileSystem.readAsStringAsync(normalized, { encoding });
  return base64ToUint8(base64);
}

async function appendPdf(target: PDFDocument, source: PdfSource) {
  const bytes = await loadPdfBytes(source);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await target.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => target.addPage(p));
}

export async function generateDocumentBundlePdf(
  application: Application,
  options?: {
    onProgress?: (progress: PdfPageProgress) => void;
  }
) {
  if (!application?.id) {
    throw new Error('Application not found.');
  }

  const progress = createPdfProgressTracker({
    label: 'Finalising application bundle...',
    onProgress: options?.onProgress,
  });

  progress.emit();
  const checklistDoc = await generateOrGetChecklistPdf(application);
  progress.setSegmentTotal('checklist', Number(checklistDoc.pages ?? 0));
  progress.completeSegment('checklist');

  const applicationDoc = await generateApplicationPdf(application);
  if (!applicationDoc?.absolutePath) {
    throw new Error('Unable to prepare application PDF.');
  }
  progress.setSegmentTotal('application', Number(applicationDoc.pageCount ?? 0));
  progress.completeSegment('application');

  const supporting = await generateSupportingDocumentsPdf(application, {
    onProgress: (update) => {
      if (typeof update.total === 'number') {
        progress.setSegmentTotal('supporting', update.total);
      }
      if (typeof update.current === 'number') {
        progress.setSegmentCurrent('supporting', update.current);
      } else {
        progress.emit();
      }
    },
  });
  progress.setSegmentTotal('supporting', Number(supporting.pageCount ?? 0));
  progress.completeSegment('supporting');

  const linkedMotivation = resolveApplicationMotivation(application);
  const includeMotivation = application.motivationSource === 'wizard';
  const applicationForMotivation = includeMotivation
    ? ({
        ...application,
        motivationText: linkedMotivation?.text ?? application.motivationText,
      } as Application)
    : application;
  const motivation = includeMotivation
    ? await generateMotivationPdf(applicationForMotivation)
    : null;
  if (motivation) {
    progress.setSegmentTotal('motivation', Number(motivation.pageCount ?? 0));
    progress.completeSegment('motivation');
  }

  const bundle = await PDFDocument.create();
  await appendPdf(bundle, {
    path: checklistDoc.filePath,
    uri: checklistDoc.uri,
    base64: (checklistDoc as any)?.base64Data,
  });
  await appendPdf(bundle, { path: applicationDoc.absolutePath, uri: applicationDoc.uri });
  if (motivation) {
    await appendPdf(bundle, { path: motivation.path, uri: motivation.uri });
  }
  await appendPdf(bundle, { path: supporting.path, uri: supporting.uri });

  const targetUri = await resolveBundleTarget(application.id, application.form);
  if (!targetUri) {
    throw new Error('Unable to resolve bundle output directory.');
  }
  const base64 = await bundle.saveAsBase64({ dataUri: false });
  const encoding =
    ((FileSystem as any)?.EncodingType?.Base64 as string | undefined) ?? ('base64' as any);
  await FileSystem.writeAsStringAsync(targetUri, base64, { encoding });

  const info = await FileSystem.getInfoAsync(targetUri);
  const fileSize =
    'size' in info && typeof info.size === 'number' ? info.size : Math.round(base64.length * 0.75);

  const storedPath = toRelativeDocumentPath(targetUri) ?? targetUri;
  const document = withMeta<Document>({
    id: (globalThis.crypto?.randomUUID?.() ?? `doc_${Math.random().toString(36).slice(2)}`) as any,
    type: 'Document',
    holderProfileId: (application.applicantProfileId ?? '') as Document['holderProfileId'],
    kind: 'OTHER',
    filePath: storedPath,
    uri: storedPath,
    sha256: '',
    pages: bundle.getPageCount(),
    name: 'Document bundle',
    mime: 'application/pdf',
    size: fileSize,
    applicationId: application.id,
    requirementCode: 'DOCUMENT_BUNDLE',
  } as Document);
  persist(document);

  return {
    uri: targetUri,
    path: targetUri,
    pageCount: bundle.getPageCount(),
  };
}
