import { Application } from '../data/types';
import { persist, touch } from '../data/repo';
import { generateDocumentBundlePdf } from '../pdf/bundle';
import { PdfPageProgress } from '../pdf/supporting';
import { toRelativeDocumentPath } from './documentPaths';

export const finaliseApplication = async (
  application: Application,
  options?: {
    onProgress?: (progress: PdfPageProgress) => void;
  }
): Promise<Application> => {
  const baseUpdate = touch({
    ...application,
    status: 'submitted',
    paymentReceived: true,
  } as Application);

  const bundle = await generateDocumentBundlePdf(baseUpdate, options);
  const storedPath = toRelativeDocumentPath(bundle.path) ?? bundle.path;
  const updated = touch({
    ...baseUpdate,
    documentBundlePath: storedPath,
    documentBundlePageCount: bundle.pageCount,
    pdfPath: storedPath,
  } as Application);

  persist(updated);
  return updated;
};
