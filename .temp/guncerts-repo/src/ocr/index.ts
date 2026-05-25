import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Directory, Paths } from 'expo-file-system';
import { Document, Extraction, ExtractionType, Profile, UUID } from '../data/types';
import { withMeta, persist, touch } from '../data/repo';
import { getById, listByType } from '../data/sqlite';
import { parseCompetencyText, parseFirearmText, ParsedExtraction } from './parsers';
import type { TextRecognitionResult } from 'expo-mlkit-ocr';
import { scanPdf417FromUri, hasBarcodeSupport } from '../barcode/provider';
import { hasNativePdfRasterizer, rasterizePdf } from '../pdf/rasterizer';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../utils/documentPaths';

type Engine = 'mlkit';

export type PerformExtractionOptions = {
  extractionType?: ExtractionType;
  engine?: Engine;
  force?: boolean;
  skipDocumentUpdate?: boolean;
};

type EnsureUriResult = { uri: string; cleanup?: () => Promise<void> };

const TEMP_PREFIX = 'ocr_tmp_';
const SUPPORTED_ENGINES: Engine[] = ['mlkit'];
const PDF_PATTERN = /\.pdf$/i;

type MlkitModule = {
  recognizeText?: (uri: string) => Promise<TextRecognitionResult>;
} | null;

let mlkitModule: MlkitModule = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const imported = require('expo-mlkit-ocr');
  mlkitModule = imported?.default ?? imported;
} catch {
  mlkitModule = null;
}

const hasMlkit = typeof mlkitModule?.recognizeText === 'function';
const hasBarcodeScanner = hasBarcodeSupport;

function isSupportedPlatform() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function shouldAttemptBarcodeForType(extractionType: ExtractionType): boolean {
  return extractionType === 'FirearmLicence' || extractionType === 'IdentityDocument';
}

function inferExtractionType(document: Document): ExtractionType {
  if (document.parentType === 'CompetencyCertificate' || document.kind === 'COMPETENCY_CERT') {
    return 'CompetencyCertificate';
  }
  if (document.parentType === 'Firearm' || document.kind === 'FIREARM_LICENCE') {
    return 'FirearmLicence';
  }
  if (document.kind === 'ID_CARD' || document.kind === 'ID_BOOK' || document.kind === 'PASSPORT') {
    return 'IdentityDocument';
  }
  if (document.kind === 'PROOF_OF_ADDRESS') {
    return 'ProofOfAddress';
  }
  return 'Unknown';
}

function guessExtension(mime?: string | null, fallbackUri?: string) {
  if (mime?.includes('png')) return '.png';
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return '.jpg';
  if (mime?.includes('heic')) return '.heic';
  if (mime?.includes('webp')) return '.webp';
  if (fallbackUri && PDF_PATTERN.test(fallbackUri)) return '.pdf';
  const parts = fallbackUri?.split('.');
  if (parts && parts.length > 1) {
    const ext = parts.pop();
    if (ext) return `.${ext}`;
  }
  return '.jpg';
}

async function ensureLocalUri(uri: string, mime?: string | null): Promise<EnsureUriResult> {
  if (uri.startsWith('file://')) {
    return { uri };
  }
  const destDir = new FileSystem.Directory(Paths.cache) ?? new FileSystem.Directory(Paths.document) ?? '';
  const extension = guessExtension(mime, uri);
  const dest = `${destDir}${TEMP_PREFIX}${Date.now()}${extension}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return {
    uri: dest,
    cleanup: () => FileSystem.deleteAsync(dest, { idempotent: true }),
  };
}

async function runMlkit(uri: string): Promise<TextRecognitionResult> {
  if (!mlkitModule) {
    throw new Error('MLKIT_MODULE_UNAVAILABLE');
  }
  if (typeof mlkitModule.recognizeText === 'function') {
    return mlkitModule.recognizeText(uri);
  }
  throw new Error('MLKIT_OCR_UNAVAILABLE');
}

function parseByType(extractionType: ExtractionType, text: string): ParsedExtraction {
  switch (extractionType) {
    case 'CompetencyCertificate':
      return parseCompetencyText(text);
    case 'FirearmLicence':
      return parseFirearmText(text);
    default:
      return { fields: {}, quality: 'low' };
  }
}

function createExtractionEntity(
  document: Document,
  extractionType: ExtractionType,
  parsed: ParsedExtraction,
  engine: Engine,
  rawText: string,
  extra?: Pick<Extraction, 'errorCode' | 'errorMessage'>
): Extraction {
  return withMeta<Extraction>({
    id: (globalThis.crypto?.randomUUID?.() ?? `ext_${Math.random().toString(36).slice(2)}`) as UUID,
    type: 'Extraction',
    documentId: document.id,
    extractionType,
    fields: parsed.fields,
    quality: parsed.quality,
    engine,
    rawText,
    ...extra,
  } as any);
}

function createErrorExtraction(
  document: Document,
  extractionType: ExtractionType,
  engine: Engine,
  errorCode: string,
  errorMessage?: string
): Extraction {
  return createExtractionEntity(
    document,
    extractionType,
    { fields: {}, quality: 'low' },
    engine,
    '',
    { errorCode, errorMessage }
  );
}

async function detectPdf417Barcode(uri: string): Promise<{ type: string; data: string } | null> {
  try {
    return await scanPdf417FromUri(uri);
  } catch (err) {
    logger.warn('[ocr] Failed to scan PDF417 via provider', err);
    return null;
  }
}

export async function performDocumentExtraction(
  document: Document,
  options: PerformExtractionOptions = {}
): Promise<Extraction | null> {
  if (!isSupportedPlatform()) {
    return null;
  }

  const engine: Engine = options.engine ?? 'mlkit';
  if (!SUPPORTED_ENGINES.includes(engine)) {
    throw new Error(`Unsupported OCR engine: ${engine}`);
  }

  const mlkitUnavailable = engine === 'mlkit' && !hasMlkit;
  const extractionType = options.extractionType ?? inferExtractionType(document);

  if (document.ocrExtractionId && !options.force) {
    const existing = getById<Extraction>(String(document.ocrExtractionId));
    if (existing) return existing;
  }

  const resolvedUri = resolveDocumentUri(document.uri ?? document.filePath);
  if (!resolvedUri) {
    const errorExtraction = createErrorExtraction(
      document,
      extractionType,
      engine,
      'DOCUMENT_URI_MISSING',
      'Document is missing a local URI for OCR processing.'
    );
    persist(errorExtraction);
    if (!options.skipDocumentUpdate) {
      const nextDoc = touch({ ...document, ocrExtractionId: errorExtraction.id } as Document);
      persist(nextDoc);
    }
    return errorExtraction;
  }

  const allowBarcode = shouldAttemptBarcodeForType(extractionType);
  if (!allowBarcode && (document.barcodeData || document.barcodeType)) {
    if (!options.skipDocumentUpdate) {
      const nextDoc = touch({
        ...document,
        barcodeType: undefined,
        barcodeData: undefined,
      } as Document);
      persist(nextDoc);
      Object.assign(document, {
        barcodeType: undefined,
        barcodeData: undefined,
        updatedAt: nextDoc.updatedAt,
        version: nextDoc.version,
      });
    } else {
      Object.assign(document, {
        barcodeType: undefined,
        barcodeData: undefined,
      });
    }
  }

  const existingBarcodeData = document.barcodeData?.trim();
  if (existingBarcodeData && allowBarcode) {
    const parsedFromBarcode = parseByType(extractionType, existingBarcodeData);
    const hasParsedFields = Object.values(parsedFromBarcode.fields ?? {}).some(Boolean);
    if (hasParsedFields) {
      maybeUpdateProfileFromFirearmBarcode(existingBarcodeData);
      const normalizedBarcodeType = document.barcodeType ?? 'PDF417';
      const barcodeExtraction = createExtractionEntity(
        document,
        extractionType,
        parsedFromBarcode,
        engine,
        existingBarcodeData
      );
      persist(barcodeExtraction);
      if (!options.skipDocumentUpdate) {
        const nextDoc = touch({
          ...document,
          barcodeType: normalizedBarcodeType,
          barcodeData: existingBarcodeData,
          ocrExtractionId: barcodeExtraction.id,
        } as Document);
        persist(nextDoc);
        Object.assign(document, {
          barcodeType: nextDoc.barcodeType,
          barcodeData: nextDoc.barcodeData,
          ocrExtractionId: nextDoc.ocrExtractionId,
          updatedAt: nextDoc.updatedAt,
          version: nextDoc.version,
        });
      } else {
        Object.assign(document, {
          barcodeType: normalizedBarcodeType,
          barcodeData: existingBarcodeData,
          ocrExtractionId: barcodeExtraction.id,
        });
      }
      return barcodeExtraction;
    }
  }

  const lowerMime = document.mime?.toLowerCase() ?? '';
  const isPdf = lowerMime.includes('pdf') || PDF_PATTERN.test(resolvedUri);

  if (isPdf && !hasNativePdfRasterizer) {
    const errorExtraction = createErrorExtraction(
      document,
      extractionType,
      engine,
      'PDF_RASTERIZER_UNAVAILABLE',
      'PDF documents require a native rasterizer which is unavailable on this device.'
    );
    persist(errorExtraction);
    if (!options.skipDocumentUpdate) {
      const nextDoc = touch({ ...document, ocrExtractionId: errorExtraction.id } as Document);
      persist(nextDoc);
    }
    return errorExtraction;
  }

  let ensured: EnsureUriResult | undefined;
  let rasterized: Awaited<ReturnType<typeof rasterizePdf>> | null = null;
  try {
    ensured = await ensureLocalUri(resolvedUri, document.mime);
  } catch (err: any) {
    const errorExtraction = createErrorExtraction(
      document,
      extractionType,
      engine,
      'FILE_ACCESS_FAILED',
      err?.message ?? 'Unable to access document for OCR.'
    );
    persist(errorExtraction);
    if (!options.skipDocumentUpdate) {
      const nextDoc = touch({ ...document, ocrExtractionId: errorExtraction.id } as Document);
      persist(nextDoc);
    }
    return errorExtraction;
  }

  try {
    if (!ensured) {
      throw new Error('LOCAL_URI_UNAVAILABLE');
    }
    const baseUri = ensured.uri;
    const imageUris: string[] = [];

    if (isPdf) {
      try {
        rasterized = await rasterizePdf(baseUri, 300);
        imageUris.push(...rasterized.pages.map((page) => page.uri));
        if (!imageUris.length) {
          throw new Error('PDF_RASTERIZE_EMPTY');
        }
      } catch (err: any) {
        const errorExtraction = createErrorExtraction(
          document,
          extractionType,
          engine,
          'PDF_RASTERIZE_FAILED',
          err?.message ?? 'Unable to rasterize PDF for OCR.'
        );
        persist(errorExtraction);
        if (!options.skipDocumentUpdate) {
          const nextDoc = touch({ ...document, ocrExtractionId: errorExtraction.id } as Document);
          persist(nextDoc);
        }
        return errorExtraction;
      }
    } else {
      imageUris.push(baseUri);
    }

    const primaryImageUri = imageUris[0];
    if (!primaryImageUri) {
      throw new Error('IMAGE_URI_UNAVAILABLE');
    }

    const canScanBarcode = hasBarcodeScanner && allowBarcode;
    let barcodeResult: { type: string; data: string } | null = null;
    if (canScanBarcode) {
      const barcodeTargets = isPdf ? imageUris : [primaryImageUri];
      for (const target of barcodeTargets) {
        barcodeResult = await detectPdf417Barcode(target);
        if (barcodeResult) break;
      }
      if (barcodeResult) {
        maybeUpdateProfileFromFirearmBarcode(barcodeResult.data);
        const parsedFromBarcode = parseByType(extractionType, barcodeResult.data);
        const barcodeExtraction = createExtractionEntity(
          document,
          extractionType,
          parsedFromBarcode,
          engine,
          barcodeResult.data
        );
        persist(barcodeExtraction);
        if (!options.skipDocumentUpdate) {
          const nextDoc = touch({
            ...document,
            barcodeType: barcodeResult.type,
            barcodeData: barcodeResult.data,
            ocrExtractionId: barcodeExtraction.id,
          } as Document);
          persist(nextDoc);
          Object.assign(document, {
            barcodeType: nextDoc.barcodeType,
            barcodeData: nextDoc.barcodeData,
            ocrExtractionId: nextDoc.ocrExtractionId,
            updatedAt: nextDoc.updatedAt,
            version: nextDoc.version,
          });
        } else {
          Object.assign(document, {
            barcodeType: barcodeResult.type,
            barcodeData: barcodeResult.data,
            ocrExtractionId: barcodeExtraction.id,
          });
        }
        return barcodeExtraction;
      }
    }

    if (mlkitUnavailable) {
      const moduleError = createErrorExtraction(
        document,
        extractionType,
        engine,
        'MLKIT_MODULE_MISSING',
        'OCR requires the expo-mlkit-ocr native module to be installed.'
      );
      persist(moduleError);
      if (!options.skipDocumentUpdate) {
        const nextDoc = touch({ ...document, ocrExtractionId: moduleError.id } as Document);
        persist(nextDoc);
        Object.assign(document, {
          ocrExtractionId: nextDoc.ocrExtractionId,
          updatedAt: nextDoc.updatedAt,
          version: nextDoc.version,
        });
      } else {
        Object.assign(document, {
          ocrExtractionId: moduleError.id,
        });
      }
      return moduleError;
    }

    const result = await runMlkit(primaryImageUri);
    const rawText =
      result?.text ??
      (result?.blocks?.length ? result.blocks.map((block) => block.text).join('\n') : '');
    const parsed = parseByType(extractionType, rawText ?? '');
    const extraction = createExtractionEntity(document, extractionType, parsed, engine, rawText ?? '');
    persist(extraction);
    if (!options.skipDocumentUpdate) {
      const nextDoc = touch({ ...document, ocrExtractionId: extraction.id } as Document);
      persist(nextDoc);
      Object.assign(document, {
        ocrExtractionId: nextDoc.ocrExtractionId,
        updatedAt: nextDoc.updatedAt,
        version: nextDoc.version,
      });
    } else {
      Object.assign(document, {
        ocrExtractionId: extraction.id,
      });
    }
    return extraction;
  } catch (err: any) {
    const errorExtraction = createErrorExtraction(
      document,
      extractionType,
      engine,
      'OCR_PROCESS_FAILED',
      err?.message ?? 'Failed to process OCR.'
    );
    persist(errorExtraction);
    if (!options.skipDocumentUpdate) {
      const nextDoc = touch({ ...document, ocrExtractionId: errorExtraction.id } as Document);
      persist(nextDoc);
      Object.assign(document, {
        ocrExtractionId: nextDoc.ocrExtractionId,
        updatedAt: nextDoc.updatedAt,
        version: nextDoc.version,
      });
    } else {
      Object.assign(document, {
        ocrExtractionId: errorExtraction.id,
      });
    }
    return errorExtraction;
  } finally {
    if (rasterized) {
      rasterized.cleanup().catch(() => {});
      rasterized = null;
    }
    if (ensured?.cleanup) {
      ensured.cleanup().catch(() => {});
    }
  }
}

export function getExtractionForDocument(doc: Document): Extraction | null {
  if (!doc.ocrExtractionId) return null;
  return getById<Extraction>(String(doc.ocrExtractionId));
}

export function needsExtraction(doc: Document): boolean {
  if (!isSupportedPlatform()) return false;
  if (!doc.uri) return false;
  if (doc.barcodeData) return false;
  if (doc.ocrExtractionId) return false;
  if (!hasMlkit && !hasBarcodeScanner) return false;
  return true;
}

export { inferExtractionType };

function maybeUpdateProfileFromFirearmBarcode(barcodeData?: string | null) {
  if (!barcodeData || barcodeData.indexOf('|') === -1) return;
  const parts = barcodeData.split('|');
  if (parts.length < 4) return;
  const profiles = listByType<Profile>('Profile');
  const profile = profiles[0];
  if (!profile) return;

  const normalizedId = parts[1]?.replace(/\s+/g, '')?.trim();
  const nameRaw = parts[3]?.replace(/\s+/g, ' ')?.trim();

  let initials: string | undefined;
  let surname: string | undefined;
  if (nameRaw) {
    const firstSpace = nameRaw.indexOf(' ');
    if (firstSpace === -1) {
      surname = nameRaw;
    } else {
      initials = nameRaw.slice(0, firstSpace).trim();
      surname = nameRaw.slice(firstSpace + 1).trim();
    }
  }

  let changed = false;
  const next: Profile = { ...profile };

  if (normalizedId && !profile.idNumber) {
    next.idNumber = normalizedId;
    changed = true;
  }
  if (initials && !profile.initials) {
    next.initials = initials;
    changed = true;
  }
  if (surname && !profile.surname) {
    next.surname = surname;
    changed = true;
  }

  if (!changed) return;
  persist(touch(next));
}
