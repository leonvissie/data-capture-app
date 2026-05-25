import { Asset } from 'expo-asset';
import { File as FSFile } from 'expo-file-system/next';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ensureWatermark } from './watermark';

export type FieldMap = {
  version: number;
  meta?: {
    note?: string;
    units?: string;
    pageScale?: number;
    globalOffset?: { x?: number; y?: number };
    moreThan4Firearms?: string;
    motivationText?: string | string[];
    motivationTextLineHeight?: number;
    postalAddressFallbackText?: string;
  };
  fields: Array<FieldDefinition>;
};

export type FieldDefinition = {
  key: string;
  page: number;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  mode?: 'split';
  step?: number;
  maxLen?: number;
  pattern?: string;
  transform?: 'uppercase' | 'lowercase' | 'titlecase';
};

type TemplateOptions = {
  assetModule: any;
  fieldMap: FieldMap;
  data: Record<string, string | number | undefined | null>;
  watermark?: { text: string; opacity?: number; fontSize?: number };
};

function toRgb(color?: string) {
  if (!color) return rgb(0, 0, 0);
  const hex = color.replace('#', '');
  if (hex.length !== 6) return rgb(0, 0, 0);
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function applyPattern(raw: string, pattern?: string) {
  if (!pattern) return raw;
  const value = raw.trim();
  if (!value) return value;
  const digits = value.replace(/\D/g, '');
  switch (pattern) {
    case 'DDMMYYYY': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
        if (year && month && day) return `${day}${month}${year}`;
      }
      if (digits.length === 8) {
        const day = digits.slice(6, 8);
        const month = digits.slice(4, 6);
        const year = digits.slice(0, 4);
        return `${day}${month}${year}`;
      }
      return value;
    }
    case 'YYYY-MM-DD': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      if (digits.length === 8) {
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      }
      return value;
    }
    default:
      return value;
  }
}

function applyTransform(value: string, transform?: FieldDefinition['transform']) {
  if (!transform) return value;
  switch (transform) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'titlecase':
      return value.replace(/\w\S*/g, (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
      );
    default:
      return value;
  }
}

export async function renderTemplatePdf(options: TemplateOptions): Promise<PDFDocument> {
  const asset = Asset.fromModule(options.assetModule);
  if (!asset.localUri) {
    await asset.downloadAsync();
  }
  if (!asset.localUri) {
    throw new Error('Unable to load template PDF asset.');
  }

  const file = new FSFile(asset.localUri!);
  const sourceBytes = await file.bytes();
  if (!sourceBytes) {
    throw new Error('Unable to load PDF template bytes.');
  }
  const templatePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const font = await templatePdf.embedFont(StandardFonts.Helvetica);

  options.fieldMap.fields.forEach((field) => {
    const page = templatePdf.getPage(field.page - 1);
    if (!page) return;
    const value = options.data[field.key];
    if (value === undefined || value === null) return;
    let text = String(value);
    text = applyPattern(text, field.pattern);
    text = applyTransform(text, field.transform);

    const offsetX = (options.fieldMap.meta?.globalOffset?.x ?? 0) + field.x;
    const offsetY = (options.fieldMap.meta?.globalOffset?.y ?? 0) + field.y;
    const fontSize = field.fontSize ?? 10;
    const color = toRgb(field.color);

    if ((field.mode ?? '').toLowerCase() === 'split') {
      const step = field.step ?? 12;
      const maxLen = field.maxLen ?? text.length;
      for (let i = 0; i < Math.min(text.length, maxLen); i += 1) {
        page.drawText(text[i], {
          x: offsetX + i * step,
          y: offsetY,
          font,
          size: fontSize,
          color,
        });
      }
    } else {
      const lineHeight =
        field.key === 'motivationApplicationText' &&
        typeof options.fieldMap.meta?.motivationTextLineHeight === 'number'
          ? options.fieldMap.meta.motivationTextLineHeight
          : undefined;
      page.drawText(text, {
        x: offsetX,
        y: offsetY,
        font,
        size: fontSize,
        color,
        ...(lineHeight ? { lineHeight } : {}),
      });
    }
  });

  if (options.watermark) {
    await ensureWatermark(templatePdf, options.watermark);
  }

  return templatePdf;
}
