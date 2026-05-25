import { PDFDocument, StandardFonts, rgb, type PDFFont, degrees } from 'pdf-lib';
import { appConfig } from '../config/appConfig';

// Repeated watermark defaults (easy to tweak)
const REPEATED_WATERMARK_TEXT = 'GUNCERTS: DRAFT (NOT FOR SUBMISSION)';
const REPEATED_WATERMARK_FONT_SIZE = 32;
const REPEATED_WATERMARK_COLOR = rgb(0.5, 0.5, 0.5);
const REPEATED_WATERMARK_OPACITY = 0.2;
// const REPEATED_WATERMARK_OPACITY = 0;
const REPEATED_WATERMARK_BOLD = true;
const REPEATED_WATERMARK_ITALIC = true;
const REPEATED_WATERMARK_UNDERLINE = false;
const REPEATED_WATERMARK_UNDERLINE_THICKNESS = 1;
const REPEATED_WATERMARK_MARGIN_X = 24;
const REPEATED_WATERMARK_MARGIN_Y = 36;
const REPEATED_WATERMARK_GAP = 24;
const REPEATED_WATERMARK_ROW_GAP = 18;

type WatermarkOptions = {
  text: string;
  opacity?: number;
  fontSize?: number;
};

type RepeatedWatermarkOptions = {
  text?: string;
  fontSize?: number;
  opacity?: number;
  color?: ReturnType<typeof rgb>;
};

export async function ensureWatermark(pdf: PDFDocument, opts: WatermarkOptions) {
  if (!appConfig.features.showWatermark) return;
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const opacity = typeof opts.opacity === 'number' ? opts.opacity : 0.08;
  const fontSize = opts.fontSize ?? 48;

  const pages = pdf.getPages();
  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.text, fontSize);
    const textHeight = font.heightAtSize(fontSize);
    page.drawText(opts.text, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: fontSize,
      font,
      rotate: degrees(-45),
      color: rgb(0.5, 0.5, 0.5),
      opacity,
    });
  });
}

export async function ensureRepeatedWatermark(pdf: PDFDocument, opts: RepeatedWatermarkOptions) {
  if (!appConfig.features.showWatermark) return;
  const font = await resolveRepeatedWatermarkFont(pdf);
  const fontSize = typeof opts.fontSize === 'number' ? opts.fontSize : REPEATED_WATERMARK_FONT_SIZE;
  const opacity = typeof opts.opacity === 'number' ? opts.opacity : REPEATED_WATERMARK_OPACITY;
  const color = opts.color ?? REPEATED_WATERMARK_COLOR;
  const text = opts.text ?? REPEATED_WATERMARK_TEXT;

  pdf.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const startX = REPEATED_WATERMARK_MARGIN_X;
    const maxWidth = width - REPEATED_WATERMARK_MARGIN_X * 2;
    const textHeight = font.heightAtSize(fontSize);
    const lineHeight = textHeight + REPEATED_WATERMARK_ROW_GAP;
    let y = height - REPEATED_WATERMARK_MARGIN_Y - textHeight;
    let stream = '';

    while (y > REPEATED_WATERMARK_MARGIN_Y) {
      stream = ensureStreamLength(stream, text, font, fontSize, maxWidth);
      const { line, rest } = takeLineFromStream(stream, font, fontSize, maxWidth);
      stream = rest;
      const safeLine = line.trimStart();
      if (!safeLine) {
        y -= lineHeight;
        continue;
      }
      const textWidth = font.widthOfTextAtSize(safeLine, fontSize);
      page.drawText(safeLine, {
        x: startX,
        y,
        size: fontSize,
        font,
        color,
        opacity,
      });
      if (REPEATED_WATERMARK_UNDERLINE) {
        page.drawLine({
          start: { x: startX, y: y - 2 },
          end: { x: startX + textWidth, y: y - 2 },
          thickness: REPEATED_WATERMARK_UNDERLINE_THICKNESS,
          color,
          opacity,
        });
      }
      y -= lineHeight;
    }
  });
}

async function resolveRepeatedWatermarkFont(pdf: PDFDocument): Promise<PDFFont> {
  if (REPEATED_WATERMARK_BOLD && REPEATED_WATERMARK_ITALIC) {
    return pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  }
  if (REPEATED_WATERMARK_ITALIC) {
    return pdf.embedFont(StandardFonts.HelveticaOblique);
  }
  if (REPEATED_WATERMARK_BOLD) {
    return pdf.embedFont(StandardFonts.HelveticaBold);
  }
  return pdf.embedFont(StandardFonts.Helvetica);
}

function ensureStreamLength(
  current: string,
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string {
  const token = text.trim();
  if (!token) return '';
  let stream = current;
  const spacer = stream ? ' ' : '';
  if (!stream) stream = token;
  let width = font.widthOfTextAtSize(stream, fontSize);
  while (width < maxWidth * 2) {
    stream += `${spacer}${token}`;
    width = font.widthOfTextAtSize(stream, fontSize);
  }
  return stream;
}

function takeLineFromStream(
  stream: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): { line: string; rest: string } {
  const trimmed = stream.replace(/^\s+/, '');
  if (!trimmed) return { line: '', rest: '' };
  let lo = 1;
  let hi = trimmed.length;
  let best = 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = trimmed.slice(0, mid);
    const width = font.widthOfTextAtSize(slice, fontSize);
    if (width <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const line = trimmed.slice(0, best);
  const rest = trimmed.slice(best);
  return { line, rest };
}
