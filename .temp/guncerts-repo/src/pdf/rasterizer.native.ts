import * as FileSystem from 'expo-file-system/legacy';
import { resolveDocumentUri } from '../utils/documentPaths';

export type RasterizedPage = {
  uri: string;
  width: number;
  height: number;
  dpi?: number;
};

export type RasterizeResult = {
  pages: RasterizedPage[];
  cleanup: () => Promise<void>;
};

type PdfThumbnailModule = {
  generate?: (source: any, page?: number) => Promise<any> | any;
  generateAllPages?: (source: any, quality?: number) => Promise<any[]> | any[];
  getPage?: (source: any, page?: number) => Promise<any> | any;
  getPages?: (source: any) => Promise<any[]> | any[];
  default?: any;
} | ((source: any, page?: number) => Promise<any> | any) | null;

let PdfThumbnail: PdfThumbnailModule = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PdfThumbnail = require('react-native-pdf-thumbnail');
} catch {
  PdfThumbnail = null;
}

const resolvePdfThumbnailModule = () => {
  const mod: any = (PdfThumbnail as any)?.default ?? PdfThumbnail;
  const generate =
    mod?.generate ||
    mod?.getPage ||
    (typeof mod === 'function' ? mod : null);
  const generateAllPages = mod?.generateAllPages || null;
  const getPages = mod?.getPages || null;
  return { generate, generateAllPages, getPages };
};

export const hasNativePdfRasterizer = Boolean(
  resolvePdfThumbnailModule().generate ||
  resolvePdfThumbnailModule().generateAllPages ||
  resolvePdfThumbnailModule().getPages
);

export async function rasterizePdf(source: string, dpi = 300): Promise<RasterizeResult> {
  const requestedDpi = Number.isFinite(dpi) && dpi > 0 ? Math.max(1, Math.round(dpi)) : 300;
  const { generate, generateAllPages, getPages } = resolvePdfThumbnailModule();
  if (!generate && !generateAllPages && !getPages) {
    throw new Error('PDF rasterizer native module is unavailable.');
  }
  const quality = Math.min(100, Math.max(1, Math.round(requestedDpi / 3)));
  const resolvedSource = resolveDocumentUri(source) ?? source;

  let rawPages: any[] = [];
  if (generateAllPages) {
    rawPages = await callGenerateAllPages(generateAllPages, resolvedSource, quality);
  } else if (getPages) {
    rawPages = await callGetPages(getPages, resolvedSource);
  }
  if (!rawPages.length && generate) {
    const single = await callGenerate(generate, resolvedSource, 0, quality);
    rawPages = Array.isArray(single) ? single : (single ? [single] : []);
    const second = await callGenerate(generate, resolvedSource, 1, quality).catch(() => null);
    if (second) {
      const normalized = Array.isArray(second) ? second : [second];
      rawPages = rawPages.concat(normalized);
    }
  }

  const pages: RasterizedPage[] = rawPages
    .map((item) => normalizePage(item, requestedDpi))
    .filter((item): item is RasterizedPage => !!item);

  if (pages.length === 0) {
    throw new Error('Rasterization produced no valid image pages.');
  }

  return {
    pages,
    cleanup: async () => {
      await Promise.allSettled(
        pages.map((page) =>
          FileSystem.deleteAsync(page.uri, {
            idempotent: true,
          })
        )
      );
    },
  };
}

function normalizeUri(uri: string): string {
  if (!uri) return '';
  return resolveDocumentUri(uri) ?? '';
}

async function callGenerate(
  fn: (source: any, page?: number, quality?: number) => Promise<any> | any,
  source: string,
  page: number,
  quality: number
) {
  return await fn(source, page, quality);
}

async function callGenerateAllPages(
  fn: (source: any, quality?: number) => Promise<any[]> | any[],
  source: string,
  quality: number
) {
  return await fn(source, quality);
}

async function callGetPages(fn: (source: any) => Promise<any[]> | any[], source: string) {
  return await fn(source);
}

function normalizePage(item: any, fallbackDpi: number): RasterizedPage | null {
  if (!item) return null;
  const uri = normalizeUri(item.uri || item.path || item.filePath || item.image || '');
  if (!uri) return null;
  const widthValue = Number.isFinite(item.width) ? item.width : (Number.isFinite(item.w) ? item.w : 0);
  const heightValue = Number.isFinite(item.height) ? item.height : (Number.isFinite(item.h) ? item.h : 0);
  const dpiValue = Number.isFinite(item.dpi) ? item.dpi : fallbackDpi;
  return {
    uri,
    width: Math.max(0, Math.round(widthValue || 0)),
    height: Math.max(0, Math.round(heightValue || 0)),
    dpi: Math.max(1, Math.round(dpiValue || fallbackDpi)),
  };
}
