import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import * as FileSystem from 'expo-file-system/legacy';
import type {
  Application,
  CompetencyCategory,
  CompetencyCertificate,
  Firearm,
  Membership,
  Profile,
} from '../data/types';
import { ensurePdfWorkspace, pdfPathFor } from './storage';
import { ensureRepeatedWatermark } from './watermark';
import { loadAssetBytes } from './utils';
import { resolveApplicationMotivation } from '../utils/motivationStore';
import { getById, listByType } from '../data/sqlite';
import { composeMotivation } from '../config/motivation/composer';
import { resolveEvidenceFromApplication } from '../config/motivation/evidenceResolver';
import type {
  MotivationApplicationType,
  MotivationPurposeType,
  MotivationSectionType,
} from '../config/motivation/sentenceBank.types';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const HEADING_SIZE = 16;
const HEADING_UNDERLINE_GAP = 6;
const FOOTER_MARGIN = 36;
const FOOTER_ICON_SIZE = 14;
const FOOTER_TEXT_SIZE = 9;
const BODY_SIZE = 12;
const LINE_HEIGHT = 16;
const ICON_ASSET = require('../../assets/images/icon.png');
const MOTIVATION_PURPOSE_OPTIONS = new Set<MotivationPurposeType>([
  'self_defence',
  'hunting',
  'sport_shooting',
  'mixed_hunting_sport',
]);

export type MotivationPdfResult = {
  uri: string;
  path: string;
  pageCount: number;
};

type DrawContext = {
  pdf: PDFDocument;
  pages: PDFPage[];
  regularFont: PDFFont;
  boldFont: PDFFont;
  headingHeight: number;
};

function inferSectionTypeFromFirearmSection(value?: string | null): MotivationSectionType | null {
  const normalized = `${value ?? ''}`.toLowerCase();
  if (normalized.includes('13')) return 's13';
  if (normalized.includes('15')) return 's15';
  if (normalized.includes('16')) return 's16';
  return null;
}

function buildEvidenceKeys(
  applicationType: MotivationApplicationType,
  sectionType: MotivationSectionType
): string[] {
  const keys = ['competency_certificate', 'proficiency_certificate', 'safe_photos'];
  if (applicationType === 'renewal') keys.push('existing_licence_copy');
  if (sectionType === 's16') {
    keys.push('association_membership', 'dedicated_status', 'firearm_endorsement');
  }
  return Array.from(new Set(keys));
}

function recomposedWizardMotivationText(application: Application): string | null {
  if (application.motivationSource !== 'wizard' || !application.motivationProfile) return null;

  const selectedFirearmIds = Array.isArray(application.selectedFirearmIds)
    ? application.selectedFirearmIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const firearms = listByType<Firearm>('Firearm');
  const targetFirearm =
    (selectedFirearmIds.length
      ? firearms.find((item) => String(item.id) === selectedFirearmIds[0])
      : undefined) ??
    firearms.find((item) => String(item.id) === String(application.motivationFirearmId ?? '')) ??
    null;
  if (!targetFirearm) return null;

  const sectionType = inferSectionTypeFromFirearmSection(targetFirearm.section);
  if (!sectionType) return null;

  let purposeType: MotivationPurposeType;
  if (sectionType === 's13') {
    purposeType = 'self_defence';
  } else if (targetFirearm.purpose && MOTIVATION_PURPOSE_OPTIONS.has(targetFirearm.purpose)) {
    purposeType = targetFirearm.purpose;
  } else {
    const hasHunting = Boolean(
      application.motivationProfile.huntingProfile?.species?.length ||
      application.motivationProfile.huntingProfile?.terrainTags?.length ||
      application.motivationProfile.huntingProfile?.distanceBand
    );
    const hasSport = Boolean(
      application.motivationProfile.sportProfile?.disciplineTags?.length ||
      application.motivationProfile.sportProfile?.participationFrequency
    );
    if (hasHunting && hasSport) purposeType = 'mixed_hunting_sport';
    else if (hasHunting) purposeType = 'hunting';
    else purposeType = 'sport_shooting';
  }

  const profileId = String(application.applicantProfileId ?? '').trim();
  const applicantProfile = profileId ? getById<Profile>(profileId) ?? null : null;
  const selectedMembershipIds = new Set(
    (application.membershipIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)
  );
  const associationName = listByType<Membership>('Membership')
    .filter((membership) => selectedMembershipIds.has(String(membership.id)))
    .map((membership) => `${membership.associationName ?? ''}`.trim())
    .filter(Boolean)
    .join(', ');
  const comparisonCount = firearms.filter(
    (item) => String(item.id) !== String(targetFirearm.id)
  ).length;
  const selectedSafeIds = (application.safeIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
  const selectedCertificateIds = (application.competencyCertificateIds ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const competencyCategories = (() => {
    const seen = new Set<string>();
    const categories: CompetencyCategory[] = [];
    selectedCertificateIds.forEach((certificateId) => {
      const certificate = getById<CompetencyCertificate>(certificateId);
      (certificate?.categories ?? []).forEach((category) => {
        const key = String(category);
        if (seen.has(key)) return;
        seen.add(key);
        categories.push(category);
      });
    });
    return categories;
  })();

  const values = {
    applicationType: 'renewal' as MotivationApplicationType,
    sectionType,
    purposeType,
    applicantFullName: [applicantProfile?.givenNames, applicantProfile?.surname].filter(Boolean).join(' ').trim(),
    applicantInitials: `${applicantProfile?.initials ?? ''}`.trim(),
    applicantSex: applicantProfile?.sexAtBirth,
    associationName,
    requiresComparison: comparisonCount > 0,
    comparisonFirearmCount: comparisonCount,
    firearmMake: targetFirearm.make,
    firearmModel: targetFirearm.model,
    firearmCalibre: targetFirearm.calibre,
    firearmSerialNumber: targetFirearm.firearmSerialNumber,
    firearmType: targetFirearm.firearmType,
    firearmAction: targetFirearm.firearmAction,
    competencyCategories: competencyCategories.length
      ? competencyCategories
      : [targetFirearm.firearmType],
    homeType: applicantProfile?.address?.homeType,
    securityMeasures: applicantProfile?.address?.securityMeasures ?? [],
    usedFirearmsSince: applicantProfile?.usedFirearmsSince,
    firearmOwnerSince: applicantProfile?.firearmOwnerSince,
    motivationProfile: {
      ...application.motivationProfile,
      supportProfile: {
        ...(application.motivationProfile.supportProfile ?? {}),
        selectedSafeIds,
      },
    },
  };

  const composed = composeMotivation({
    application,
    applicationType: 'renewal',
    sectionType,
    purposeType,
    evidenceKeys: buildEvidenceKeys('renewal', sectionType),
    resolvedEvidence: resolveEvidenceFromApplication(application),
    values,
  });
  const nextText = `${composed.text ?? ''}`.trim();
  return nextText || null;
}

function wrapParagraph(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines;
}

function wrapHeadingText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  return wrapParagraph(font, text, size, maxWidth);
}

function drawHeading(page: PDFPage, boldFont: PDFFont, heading: string): number {
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const lines = wrapHeadingText(boldFont, heading, HEADING_SIZE, maxWidth);
  const lineHeight = HEADING_SIZE + 4;
  const startY = A4_HEIGHT - PAGE_MARGIN - HEADING_SIZE;
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: PAGE_MARGIN,
      y: startY - index * lineHeight,
      size: HEADING_SIZE,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
  });
  const lastLine = lines[lines.length - 1] ?? '';
  const lastLineY = startY - (lines.length - 1) * lineHeight;
  const width = boldFont.widthOfTextAtSize(lastLine, HEADING_SIZE);
  page.drawLine({
    start: { x: PAGE_MARGIN, y: lastLineY - HEADING_UNDERLINE_GAP },
    end: { x: PAGE_MARGIN + width, y: lastLineY - HEADING_UNDERLINE_GAP },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });
  return HEADING_SIZE + (lines.length - 1) * lineHeight;
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  iconImage: PDFImage,
  iconDims: { width: number; height: number },
) {
  const text = '© www.guncerts.co.za';
  const textWidth = font.widthOfTextAtSize(text, FOOTER_TEXT_SIZE);
  const iconX = A4_WIDTH - FOOTER_MARGIN - iconDims.width;
  const textX = iconX - 6 - textWidth;
  const y = FOOTER_MARGIN;
  const textY = y + (iconDims.height - font.heightAtSize(FOOTER_TEXT_SIZE) + 2) / 2;
  page.drawText(text, {
    x: textX,
    y: textY,
    size: FOOTER_TEXT_SIZE,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawImage(iconImage, {
    x: iconX,
    y,
    width: iconDims.width,
    height: iconDims.height,
  });
}

function drawPageNumber(
  page: PDFPage,
  font: PDFFont,
  current: number,
  total: number
) {
  const text = `Page ${current} of ${total}`;
  page.drawText(text, {
    x: PAGE_MARGIN,
    y: FOOTER_MARGIN + 2,
    size: FOOTER_TEXT_SIZE,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
}

function createPage(ctx: DrawContext): PDFPage {
  const page = ctx.pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const pageNumber = ctx.pages.length + 1;
  const heading =
    pageNumber === 1
      ? 'Motivation letter'
      : 'Motivation letter (continued)';
  drawHeading(page, ctx.boldFont, heading);
  ctx.pages.push(page);
  return page;
}

function isSectionHeading(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function isSubNumberedParagraph(line: string): boolean {
  return /^\d+(?:\.\d+)+\s+/.test(line);
}

function isMotivationTitleLine(line: string): boolean {
  return /^MOTIVATION:\s*/i.test(line);
}

function parseBoldPrefixLine(line: string): { prefix: string; remainder: string } | null {
  const normalized = line.trim();
  if (!normalized) return null;

  const markdownPrefixMatch = /^\*\*(.+?)\*\*\s*(.*)$/.exec(normalized);
  const plainPrefixMatch = /^([^:]+:?)(?:\s+|$)(.*)$/.exec(normalized);
  const rawPrefix = (markdownPrefixMatch?.[1] ?? plainPrefixMatch?.[1] ?? '').trim();
  const remainder = (markdownPrefixMatch?.[2] ?? plainPrefixMatch?.[2] ?? '').trim();
  if (!rawPrefix) return null;

  const canonicalPrefixMap: Record<string, string> = {
    'applicant:': 'Applicant:',
    'application:': 'Application:',
    'purpose:': 'Purpose:',
    'firearm:': 'Firearm:',
    'calibre:': 'Calibre:',
    'serial number:': 'Serial Number:',
    'supporting documents attached:': 'Supporting Documents Attached:',
  };
  const normalizedPrefixKey = (rawPrefix.endsWith(':') ? rawPrefix : `${rawPrefix}:`).toLowerCase();
  const prefix = canonicalPrefixMap[normalizedPrefixKey];
  if (!prefix) return null;

  return { prefix, remainder };
}

function parseInlineBoldFirearmLine(
  line: string
): { prefix: string; firearm: string; suffix: string } | null {
  const match =
    /^This motivation relates to the application concerning (.+), for the lawful purpose set out below\.$/i.exec(
      line.trim(),
    );
  if (!match) return null;
  const firearm = `${match[1] ?? ''}`.trim();
  if (!firearm) return null;
  return {
    prefix: 'This motivation relates to the application concerning ',
    firearm,
    suffix: ', for the lawful purpose set out below.',
  };
}

export async function generateMotivationPdf(application: Application): Promise<MotivationPdfResult> {
  if (!application?.id) {
    throw new Error('Application not found.');
  }
  const linkedMotivation = resolveApplicationMotivation(application);
  const recomposedWizardText = recomposedWizardMotivationText(application);
  const preferredMotivationText =
    application.motivationSource === 'wizard'
      ? (recomposedWizardText ?? application.motivationText ?? linkedMotivation?.text ?? '')
      : (linkedMotivation?.text ?? application.motivationText ?? '');
  const motivationText = `${preferredMotivationText}`
    .replace(/\r\n/g, '\n')
    .replace(/\bSUPPORTING STATEMENTS\b/gi, 'CHARACTER REFERENCES')
    .replace(/\bSUPPORTING STATEMENT\b/gi, 'CHARACTER REFERENCE')
    .trim();
  if (!motivationText) {
    throw new Error('No motivation text was found for this application.');
  }

  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const iconBytes = await loadAssetBytes(ICON_ASSET);
  const iconImage = await pdf.embedPng(iconBytes);
  const iconDims = iconImage.scale(FOOTER_ICON_SIZE / iconImage.width);

  const ctx: DrawContext = {
    pdf,
    pages: [],
    regularFont,
    boldFont,
    headingHeight: HEADING_SIZE,
  };
  let page = createPage(ctx);
  let cursorY = A4_HEIGHT - PAGE_MARGIN - ctx.headingHeight - 36;
  const minY = PAGE_MARGIN + 20;
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const subNumberColumnWidth =
    Math.max(
      regularFont.widthOfTextAtSize('99.99.99', BODY_SIZE),
      regularFont.widthOfTextAtSize('99.99', BODY_SIZE),
      regularFont.widthOfTextAtSize('9.9', BODY_SIZE)
    ) + 10;
  const subBodyMaxWidth = maxWidth - subNumberColumnWidth;

  const ensureLineSpace = () => {
    if (cursorY >= minY) return;
    page = createPage(ctx);
    cursorY = A4_HEIGHT - PAGE_MARGIN - ctx.headingHeight - 36;
  };

  const drawPlainLine = (text: string, font: PDFFont) => {
    const lines = wrapParagraph(font, text, BODY_SIZE, maxWidth);
    lines.forEach((line) => {
      ensureLineSpace();
      page.drawText(line, {
        x: PAGE_MARGIN,
        y: cursorY,
        size: BODY_SIZE,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= LINE_HEIGHT;
    });
  };
  const drawPlainLineAt = (text: string, font: PDFFont, x: number) => {
    const availableWidth = Math.max(0, A4_WIDTH - PAGE_MARGIN - x);
    const lines = wrapParagraph(font, text, BODY_SIZE, availableWidth);
    lines.forEach((line) => {
      ensureLineSpace();
      page.drawText(line, {
        x,
        y: cursorY,
        size: BODY_SIZE,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= LINE_HEIGHT;
    });
  };
  const drawLineWithBoldPrefix = (line: string) => {
    const parsed = parseBoldPrefixLine(line);
    if (!parsed) {
      drawPlainLine(line, regularFont);
      return;
    }

    const prefixText = parsed.prefix;
    const suffixText = parsed.remainder;
    const prefixWidth = boldFont.widthOfTextAtSize(prefixText, BODY_SIZE);
    const fullText = suffixText ? `${prefixText} ${suffixText}` : prefixText;
    const wrapped = wrapParagraph(regularFont, fullText, BODY_SIZE, maxWidth);
    const firstLinePrefix = `${prefixText}${suffixText ? ' ' : ''}`;

    wrapped.forEach((segment, index) => {
      ensureLineSpace();
      if (index === 0) {
        page.drawText(prefixText, {
          x: PAGE_MARGIN,
          y: cursorY,
          size: BODY_SIZE,
          font: boldFont,
          color: rgb(0.15, 0.15, 0.15),
        });
        const segmentTail = segment.startsWith(firstLinePrefix)
          ? segment.slice(firstLinePrefix.length)
          : (suffixText || segment);
        if (segmentTail) {
          page.drawText(segmentTail, {
            x: PAGE_MARGIN + prefixWidth + (suffixText ? regularFont.widthOfTextAtSize(' ', BODY_SIZE) : 0),
            y: cursorY,
            size: BODY_SIZE,
            font: regularFont,
            color: rgb(0.15, 0.15, 0.15),
          });
        }
      } else {
        page.drawText(segment, {
          x: PAGE_MARGIN,
          y: cursorY,
          size: BODY_SIZE,
          font: regularFont,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
      cursorY -= LINE_HEIGHT;
    });
  };
  const drawLineWithInlineBoldFirearm = (line: string) => {
    const parsed = parseInlineBoldFirearmLine(line);
    if (!parsed) {
      drawPlainLine(line, regularFont);
      return;
    }
    const segments = [
      { text: parsed.prefix, font: regularFont },
      { text: parsed.firearm, font: boldFont },
      { text: parsed.suffix, font: regularFont },
    ] as const;
    const tokens = segments.flatMap((segment) =>
      segment.text
        .split(/(\s+)/)
        .filter((part) => part.length > 0)
        .map((part) => ({ text: part, font: segment.font })),
    );
    let x = PAGE_MARGIN;
    tokens.forEach((token) => {
      const tokenWidth = token.font.widthOfTextAtSize(token.text, BODY_SIZE);
      if (x + tokenWidth > PAGE_MARGIN + maxWidth && x > PAGE_MARGIN) {
        cursorY -= LINE_HEIGHT;
        ensureLineSpace();
        x = PAGE_MARGIN;
      }
      page.drawText(token.text, {
        x,
        y: cursorY,
        size: BODY_SIZE,
        font: token.font,
        color: rgb(0.15, 0.15, 0.15),
      });
      x += tokenWidth;
    });
    cursorY -= LINE_HEIGHT;
  };
  const drawMotivationTitleLine = (text: string) => {
    const size = BODY_SIZE + 2;
    const lineHeight = LINE_HEIGHT + 2;
    const lines = wrapParagraph(boldFont, text, size, maxWidth);
    lines.forEach((line) => {
      ensureLineSpace();
      page.drawText(line, {
        x: PAGE_MARGIN,
        y: cursorY,
        size,
        font: boldFont,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= lineHeight;
    });
  };

  const renderedHeightForLine = (line: string): number => {
    if (isMotivationTitleLine(line)) {
      const size = BODY_SIZE + 2;
      const lineHeight = LINE_HEIGHT + 2;
      return wrapParagraph(boldFont, line, size, maxWidth).length * lineHeight;
    }
    if (isSubNumberedParagraph(line)) {
      const match = /^(\d+(?:\.\d+)+)\s+(.*)$/.exec(line);
      const text = match?.[2] ?? line;
      return wrapParagraph(regularFont, text, BODY_SIZE, subBodyMaxWidth).length * LINE_HEIGHT;
    }
    const font = isSectionHeading(line) ? boldFont : regularFont;
    return wrapParagraph(font, line, BODY_SIZE, maxWidth).length * LINE_HEIGHT;
  };

  const drawSubNumbered = (line: string): number | null => {
    const match = /^(\d+(?:\.\d+)+)\s+(.*)$/.exec(line);
    if (!match) {
      drawPlainLine(line, regularFont);
      return null;
    }
    const marker = match[1];
    const text = match[2];
    const segmentCount = marker.split('.').length;
    const nestedLevel = Math.max(0, segmentCount - 2);
    const markerX = PAGE_MARGIN + nestedLevel * subNumberColumnWidth;
    const bodyX = markerX + subNumberColumnWidth;
    const bodyMaxWidth = A4_WIDTH - PAGE_MARGIN - bodyX;
    const wrapped = wrapParagraph(regularFont, text, BODY_SIZE, bodyMaxWidth);
    wrapped.forEach((segment, index) => {
      ensureLineSpace();
      if (index === 0) {
        page.drawText(marker, {
          x: markerX,
          y: cursorY,
          size: BODY_SIZE,
          font: regularFont,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
      page.drawText(segment, {
        x: bodyX,
        y: cursorY,
        size: BODY_SIZE,
        font: regularFont,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= LINE_HEIGHT;
    });
    return bodyX;
  };

  const rawLines = motivationText.split('\n');
  let continuationIndentX: number | null = null;
  let blankLineStreak = 0;
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index].trim();
    if (!line) {
      blankLineStreak += 1;
      cursorY -= LINE_HEIGHT;
      ensureLineSpace();
      if (blankLineStreak >= 2) {
        continuationIndentX = null;
      }
      continue;
    }
    blankLineStreak = 0;
    if (isMotivationTitleLine(line)) {
      drawMotivationTitleLine(line);
      continuationIndentX = null;
      continue;
    }
    if (isSubNumberedParagraph(line)) {
      continuationIndentX = drawSubNumbered(line);
      continue;
    }
    if (isSectionHeading(line)) {
      let nextNonEmptyIndex = index + 1;
      while (
        nextNonEmptyIndex < rawLines.length &&
        !rawLines[nextNonEmptyIndex].trim()
      ) {
        nextNonEmptyIndex += 1;
      }
      if (nextNonEmptyIndex < rawLines.length) {
        const nextLine = rawLines[nextNonEmptyIndex].trim();
        const blankLinesBetween = nextNonEmptyIndex - index - 1;
        const requiredHeight =
          renderedHeightForLine(line) +
          blankLinesBetween * LINE_HEIGHT +
          renderedHeightForLine(nextLine);
        if (cursorY - requiredHeight < minY) {
          page = createPage(ctx);
          cursorY = A4_HEIGHT - PAGE_MARGIN - ctx.headingHeight - 36;
        }
      }
      drawPlainLine(line, boldFont);
      continuationIndentX = null;
      continue;
    }
    if (parseBoldPrefixLine(line)) {
      drawLineWithBoldPrefix(line);
      continuationIndentX = null;
      continue;
    }
    if (parseInlineBoldFirearmLine(line)) {
      drawLineWithInlineBoldFirearm(line);
      continuationIndentX = null;
      continue;
    }
    if (continuationIndentX != null) {
      drawPlainLineAt(line, regularFont, continuationIndentX);
      continue;
    }
    drawPlainLine(line, regularFont);
  }

  const allPages = pdf.getPages();
  const totalPages = allPages.length;
  allPages.forEach((p, index) => {
    drawFooter(p, regularFont, iconImage, iconDims);
    drawPageNumber(p, regularFont, index + 1, totalPages);
  });

  if (application.status !== 'submitted' && application.status !== 'archived') {
    await ensureRepeatedWatermark(pdf, {});
  }

  const base64 = await pdf.saveAsBase64({ dataUri: false });
  const target = await pdfPathFor(application.id, 'motivation-letter');
  if (!target) {
    throw new Error('Unable to resolve PDF output directory.');
  }
  await ensurePdfWorkspace();
  const encoding =
    ((FileSystem as any)?.EncodingType?.Base64 as string | undefined) ?? ('base64' as any);
  await FileSystem.writeAsStringAsync(target.absolute, base64, {
    encoding,
  });

  return {
    uri: target.uri,
    path: target.absolute,
    pageCount: pdf.getPageCount(),
  };
}
