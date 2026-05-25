import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as FileSystem from 'expo-file-system/legacy';
import { Application, CompetencyCategory, CompetencyCertificate, Document, Firearm, Membership, Proficiency, Safe, SupportingStatement } from '../data/types';
import { getById, listByType } from '../data/sqlite';
import { resolveRequirementsForApplication } from '../policy/resolve';
import { withMeta } from '../data/repo';
import { ensurePdfWorkspace, pdfPathFor } from './storage';
import { ensureRepeatedWatermark } from './watermark';
import { buildSupportingAnnexHeadingRows } from './supporting';
import { resolveApplicationCompetencyCertificates, resolveApplicationFirearms, resolveEffectiveMembershipIds, resolveEffectiveProficiencyIds, resolveEffectiveSafeIds } from './context';
import { loadAssetBytes } from './utils';
import { buildLicenceLabelMap } from '../policy/licenceTypes';
import { toRelativeDocumentPath } from '../utils/documentPaths';
import policy517 from '../policy/517.json';
import policy517g from '../policy/517g.json';
import policy518a from '../policy/518a.json';

const ICON_ASSET = require('../../assets/images/icon.png');
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LEFT_MARGIN = 48;
const RIGHT_MARGIN = 48;
const TOP_MARGIN = 64;
const BOTTOM_MARGIN = 56;
const ROW_HEIGHT = 28;
const CHECKBOX_SIZE = 16;
const INDENT_PER_LEVEL = 16;
const CATEGORY_SORT_ORDER: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};
const LEGACY_PROFICIENCY_KIND_TO_CATEGORY: Record<string, CompetencyCategory> = {
  PROFICIENCY_HANDGUN: 'Handgun',
  PROFICIENCY_RIFLE: 'Rifle',
  PROFICIENCY_SHOTGUN: 'Shotgun',
  PROFICIENCY_HANDMACHINECARBINE: 'HandMachineCarbine',
};
const LICENCE_LABELS: Record<Application['form'], Record<string, string>> = {
  '517': {},
  '517g': buildLicenceLabelMap((policy517g as any).licenceTypes),
  '518a': buildLicenceLabelMap((policy518a as any).licenceTypes),
};
const FIREARM_LICENCE_CODES = new Set(['FIREARM_LICENCE']);
const MEMBERSHIP_DOC_CODES = new Set([
  'ASSOCIATION_MEMBERSHIP',
  'ASSOCIATION_LETTER',
  'DEDICATED_HUNTER_CERT',
  'DEDICATED_SPORT_CERT',
  'FIREARM_ENDORSEMENT',
]);
const PROFICIENCY_DOC_CODES = new Set([
  'PROFICIENCY_HANDGUN',
  'PROFICIENCY_RIFLE',
  'PROFICIENCY_SHOTGUN',
  'PROFICIENCY_HANDMACHINECARBINE',
  'STATEMENT_OF_RESULTS_KNOWLEDGE',
  'STATEMENT_OF_RESULTS_HANDLE_USE_1',
  'STATEMENT_OF_RESULTS_HANDLE_USE_2',
  'STATEMENT_OF_RESULTS_HANDLE_USE_3',
  'STATEMENT_OF_RESULTS_HANDLE_USE_4',
]);
const SAFE_PHOTO_LABELS: Record<string, string> = {
  CLOSED: 'Closed',
  OPEN: 'Open',
  BOLTS: 'Bolts',
  SERIAL: 'Serial',
  SABS: 'SABS',
  OTHER: 'Other',
};
const SAFE_PHOTO_CATEGORY_ORDER = ['CLOSED', 'OPEN', 'BOLTS', 'SERIAL', 'SABS'] as const;
const SUPPORTING_STATEMENT_SLOT_ORDER: Record<string, number> = {
  spouse_family: 0,
  friend_colleague_neighbour: 1,
  additional_reference: 2,
};
const SUPPORTING_STATEMENT_CODE_TO_SLOT: Record<string, keyof typeof SUPPORTING_STATEMENT_SLOT_ORDER> = {
  SUPPORTING_STATEMENT_1: 'spouse_family',
  SUPPORTING_STATEMENT_2: 'friend_colleague_neighbour',
  SUPPORTING_STATEMENT_3: 'additional_reference',
};

function normalizeSafePhotoLabel(doc: Document): string | null {
  const code = String(doc.requirementCode ?? '').toUpperCase();
  if (SAFE_PHOTO_LABELS[code]) {
    return SAFE_PHOTO_LABELS[code];
  }

  const raw = String(doc.requirementRelatedLabel ?? doc.name ?? '').trim();
  if (!raw) return null;

  const stripped = raw.replace(/^safe\s*photo\s*[-:]\s*/i, '').trim();
  if (!stripped) return null;
  return stripped
    .replace(/\s*\([^)]*\)/g, '')
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function splitChecklistLabelLines(
  text: string,
  maxWidth: number,
  font: any,
  size: number,
): string[] {
  const segments = text.split('\n');
  const lines: string[] = [];

  segments.forEach((segment) => {
    const words = segment.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(next, size);
      if (width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
  });

  return lines.length ? lines : [''];
}

async function buildChecklistPdf(application: Application) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const iconBytes = await loadAssetBytes(ICON_ASSET);
  const iconImage = await pdf.embedPng(iconBytes);
  const iconSize = 32;
  const iconDims = iconImage.scale(iconSize / iconImage.width);
  const heading = 'Document Checklist';
  const form = (application.form || (application as any).type || '').toLowerCase();
  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let cursorY = A4_HEIGHT;
  let headerDrawn = false;
  let pageIndex = 0;

  const firearms = resolveApplicationFirearms(application);
  const competencyCertificates = resolveApplicationCompetencyCertificates(application);

  const subtitle = resolveChecklistSubtitle(form, application, competencyCertificates, firearms);

  const ensureSpace = (rows = 1) => {
    if (cursorY - ROW_HEIGHT * rows < BOTTOM_MARGIN) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      startPage();
    }
  };

  const ensureTextSpace = (lines: number, lineHeight: number) => {
    if (cursorY - lineHeight * lines < BOTTOM_MARGIN) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      startPage();
    }
  };

  const wrapText = (text: string, maxWidth: number, size: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(next, size);
      if (width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };

  const drawWrappedText = (
    text: string,
    size: number,
    isBold = false,
    indent = 0,
    underline = false,
    fontOverride?: typeof font
  ) => {
    const maxWidth = A4_WIDTH - LEFT_MARGIN - RIGHT_MARGIN - indent;
    const lines = wrapText(text, maxWidth, size);
    const lineHeight = size + 4;
    ensureTextSpace(lines.length, lineHeight);
    const drawFont = fontOverride ?? (isBold ? fontBold : font);
    lines.forEach((line) => {
      const textWidth = drawFont.widthOfTextAtSize(line, size);
      const textY = cursorY - size;
      page.drawText(line, {
        x: LEFT_MARGIN + indent,
        y: textY,
        font: drawFont,
        size,
        color: rgb(0.1, 0.1, 0.1),
      });
      if (underline) {
        page.drawLine({
          start: { x: LEFT_MARGIN + indent, y: textY - 2 },
          end: { x: LEFT_MARGIN + indent + textWidth, y: textY - 2 },
          thickness: 0.8,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      cursorY -= lineHeight;
    });
  };

  const addVerticalSpace = (space: number) => {
    cursorY -= space;
    if (cursorY < BOTTOM_MARGIN) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      startPage();
    }
  };

  const startPage = () => {
    cursorY = A4_HEIGHT - TOP_MARGIN;
    const pageHeading = pageIndex > 0 ? `${heading} (continued)` : heading;
    page.drawText(pageHeading, {
      x: LEFT_MARGIN,
      y: cursorY,
      font: fontBold,
      size: 20,
      color: rgb(0.1, 0.1, 0.1),
    });
    const urlText = '© www.guncerts.co.za';
    const urlSize = 10;
    const urlWidth = fontBold.widthOfTextAtSize(urlText, urlSize);
    const rowHeight = fontBold.heightAtSize(20);
    const urlY = cursorY + (rowHeight - fontBold.heightAtSize(urlSize)) / 2;
    const iconX = A4_WIDTH - RIGHT_MARGIN - iconDims.width;
    const urlX = iconX - 8 - urlWidth;
    page.drawText(urlText, {
      x: urlX,
      y: urlY,
      font: fontBold,
      size: urlSize,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawImage(iconImage, {
      x: iconX,
      y: cursorY + (rowHeight - iconDims.height - 2) / 2,
      width: iconDims.width,
      height: iconDims.height,
    });
    cursorY -= 36;
    drawWrappedText(subtitle, 14, true);
    addVerticalSpace(12);
    headerDrawn = false;
    pageIndex += 1;
  };

  const addPageFooters = () => {
    const pages = pdf.getPages();
    const totalPages = pages.length;
    const fontSize = 9;
    const footerY = 24;
    pages.forEach((currentPage, index) => {
      const text = `Page ${index + 1} of ${totalPages}`;
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      currentPage.drawText(text, {
        x: A4_WIDTH - RIGHT_MARGIN - textWidth,
        y: footerY,
        font,
        size: fontSize,
        color: rgb(0.35, 0.35, 0.35),
      });
    });
  };

  startPage();
  const columnWidths = [A4_WIDTH - LEFT_MARGIN - RIGHT_MARGIN - 80, 80];

  const drawBulletedText = (
    text: string,
    size: number,
    isBold = false,
    indent = 0,
    underline = false,
    fontOverride?: typeof font
  ) => {
    const bullet = '- ';
    const bulletWidth = font.widthOfTextAtSize(bullet, size);
    const maxWidth = A4_WIDTH - LEFT_MARGIN - RIGHT_MARGIN - indent - bulletWidth;
    const lines = wrapText(text, maxWidth, size);
    const lineHeight = size + 4;
    ensureTextSpace(lines.length, lineHeight);
    const drawFont = fontOverride ?? (isBold ? fontBold : font);
    lines.forEach((line, idx) => {
      const textY = cursorY - size;
      if (idx === 0) {
        page.drawText(bullet, {
          x: LEFT_MARGIN + indent,
          y: textY,
          font,
          size,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      page.drawText(line, {
        x: LEFT_MARGIN + indent + bulletWidth,
        y: textY,
        font: drawFont,
        size,
        color: rgb(0.1, 0.1, 0.1),
      });
      if (underline) {
        const textWidth = drawFont.widthOfTextAtSize(line, size);
        page.drawLine({
          start: { x: LEFT_MARGIN + indent + bulletWidth, y: textY - 2 },
          end: { x: LEFT_MARGIN + indent + bulletWidth + textWidth, y: textY - 2 },
          thickness: 0.8,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      cursorY -= lineHeight;
    });
  };

  const drawHeaderRow = () => {
    page.drawRectangle({
      x: LEFT_MARGIN,
      y: cursorY - ROW_HEIGHT + 4,
      width: columnWidths[0] + columnWidths[1],
      height: ROW_HEIGHT,
      color: rgb(0.95, 0.97, 0.99),
      borderColor: rgb(0.75, 0.78, 0.82),
      borderWidth: 0.5,
    });
    page.drawText('Documents', {
      x: LEFT_MARGIN + 12,
      y: cursorY - ROW_HEIGHT / 2,
      font: fontBold,
      size: 12,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('', {
      x: LEFT_MARGIN + columnWidths[0] + 12,
      y: cursorY - ROW_HEIGHT / 2,
      font: fontBold,
      size: 12,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= ROW_HEIGHT;
    headerDrawn = true;
  };

  const ensureHeader = () => {
    if (!headerDrawn) {
      drawHeaderRow();
    }
  };

  const drawRow = (
    label: string,
    indentLevel = 0,
    options?: { hideRowBox?: boolean; checked?: boolean; showCheckbox?: boolean }
  ) => {
    const indent = Math.max(0, indentLevel) * INDENT_PER_LEVEL;
    const displayLabel = options?.checked ? label.replace(/^REQUIRED:\s*/i, '') : label;
    const fontSize = 10;
    const lineHeight = fontSize + 4;
    const textMaxWidth = columnWidths[0] - 0 + indent;
    const labelLines = splitChecklistLabelLines(displayLabel, textMaxWidth, font, fontSize);
    const rowHeight = Math.max(ROW_HEIGHT, labelLines.length * lineHeight + 16);

    ensureSpace(Math.ceil(rowHeight / ROW_HEIGHT));
    ensureHeader();
    const rowTop = cursorY - rowHeight + 4;
    page.drawRectangle({
      x: LEFT_MARGIN,
      y: rowTop,
      width: columnWidths[0] + columnWidths[1],
      height: rowHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });
    let textY = cursorY - fontSize - 4;
    labelLines.forEach((line) => {
      page.drawText(line, {
        x: LEFT_MARGIN + 12 + indent,
        y: textY,
        font,
        size: fontSize,
        color: rgb(0.1, 0.1, 0.1),
      });
      textY -= lineHeight;
    });
    if (options?.showCheckbox !== false) {
      const rowRight = LEFT_MARGIN + columnWidths[0] + columnWidths[1];
      const boxX = rowRight - 12 - CHECKBOX_SIZE;
      const boxY = rowTop + rowHeight / 2 - CHECKBOX_SIZE / 2;
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: CHECKBOX_SIZE,
        height: CHECKBOX_SIZE,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
      });
      if (options?.checked) {
        const tickColor = rgb(0.1, 0.45, 0.1);
        const pad = 4;
        page.drawLine({
          start: { x: boxX + pad, y: boxY + CHECKBOX_SIZE / 2 },
          end: { x: boxX + CHECKBOX_SIZE / 2 - 1, y: boxY + pad },
          thickness: 2,
          color: tickColor,
        });
        page.drawLine({
          start: { x: boxX + CHECKBOX_SIZE / 2 - 1, y: boxY + pad },
          end: { x: boxX + CHECKBOX_SIZE - pad, y: boxY + CHECKBOX_SIZE - pad },
          thickness: 2,
          color: tickColor,
        });
      }
    }
    cursorY -= rowHeight;
  };

  drawHeaderRow();

  if (form === '518a') {
    drawRow('ANNEXURE A: Completed SAPS Annexure A form', 0, {
      hideRowBox: false,
      showCheckbox: true,
      checked: true,
    });
  }

  const resolvedMotivationSource = (() => {
    const source = `${(application as any).motivationSource ?? ''}`.trim().toLowerCase();
    if (source === 'standard' || source === 'own' || source === 'wizard') {
      return source as 'standard' | 'own' | 'wizard';
    }
    if (application.userToSubmitMotivation === false) return 'standard';
    if (application.userToSubmitMotivation === true) return 'own';
    return 'standard';
  })();
  const supportingStatementSlots = resolveSupportingStatementChecklistSlots(application);
  const annexRows = buildSupportingAnnexHeadingRows(application);
  const hasMotivationRow = annexRows.some(
    (row) => String(row.requirementCode ?? '').toUpperCase() === 'MOTIVATION'
  );
  if (!hasMotivationRow && resolvedMotivationSource !== 'standard') {
    const motivationReq = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: application.form,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        type: application.form,
      } as any,
      firearms: resolveApplicationFirearms(application).map((f) => ({
        id: String(f.id),
        make: f.make,
        model: f.model,
        firearmType: f.firearmType,
        section: (f as any).section,
        licenseType: (f as any).licenseType ?? (f as any).licenceType,
        licenceType: (f as any).licenceType ?? (f as any).licenseType,
        licenseTypes: (f as any).licenseTypes ?? (f as any).licenceTypes,
        licenceTypes: (f as any).licenceTypes ?? (f as any).licenseTypes,
      })),
    }).requirements.find((req: any) => String(req?.code ?? '').toUpperCase() === 'MOTIVATION');
    if (motivationReq) {
      const annex = String((motivationReq as any)?.annexure ?? '').trim();
      const baseLabel = String(
        (motivationReq as any)?.checklistLabel ?? (motivationReq as any)?.label ?? 'Motivation'
      ).trim();
      const heading = annex ? `ANNEXURE ${annex}: ${baseLabel}` : baseLabel;
      annexRows.push({
        heading,
        checked: resolvedMotivationSource === 'wizard',
        requirementCode: 'MOTIVATION',
      });
    }
  }
  annexRows.sort((a, b) => {
    const getAnnexure = (heading: string) => {
      const match = /^\s*ANNEXURE\s+([A-Z]+[0-9]*)\s*:/i.exec(String(heading ?? ''));
      return (match?.[1] ?? '').toUpperCase();
    };
    const aa = getAnnexure(a.heading);
    const bb = getAnnexure(b.heading);
    if (aa && bb) return aa.localeCompare(bb, undefined, { numeric: true });
    if (aa && !bb) return -1;
    if (!aa && bb) return 1;
    return String(a.heading ?? '').localeCompare(String(b.heading ?? ''));
  });
  annexRows.forEach((row) => {
    const codeUpper = String(row.requirementCode ?? '').toUpperCase();
    if (codeUpper === 'MOTIVATION' && resolvedMotivationSource === 'standard') {
      return;
    }
    const isSupportingStatement = codeUpper.startsWith('SUPPORTING_STATEMENT');
    const checked = (() => {
      if (codeUpper === 'MOTIVATION') {
        return resolvedMotivationSource === 'wizard';
      }
      if (isSupportingStatement) {
        return isSupportingStatementRequirementChecked(codeUpper, supportingStatementSlots);
      }
      return Boolean(row.checked);
    })();
    drawRow(row.heading, 0, {
      hideRowBox: false,
      showCheckbox: true,
      checked,
    });
  });

  const instructions = resolvePolicyInstructions(form);
  if (instructions) {
    const instructionStyles = {
      paragraphFontSize: typeof instructions.paragraphFontSize === 'number' ? instructions.paragraphFontSize : 10,
      titleFontSize: typeof instructions.titleFontSize === 'number' ? instructions.titleFontSize : 12,
      titleBold: instructions.titleBold !== false,
      titleUnderline: instructions.titleUnderline === true,
      subTitleFontSize: typeof instructions.subTitleFontSize === 'number' ? instructions.subTitleFontSize : 11,
      subTitleBold: instructions.subTitleBold !== false,
      subTitleUnderline: instructions.subTitleUnderline === true,
    };
    addVerticalSpace(16);
    const notesTitle = String(instructions.notesTitle ?? '').trim();
    if (notesTitle) {
      drawWrappedText(
        notesTitle,
        instructionStyles.titleFontSize,
        instructionStyles.titleBold,
        0,
        instructionStyles.titleUnderline
      );
      addVerticalSpace(6);
    }

    const notes = Array.isArray(instructions.notes) ? (instructions.notes as InstructionNote[]) : [];
    notes.forEach((note: InstructionNote) => {
      const title = String(note?.title ?? '').trim();
      if (title) {
        drawWrappedText(
          title,
          instructionStyles.subTitleFontSize,
          instructionStyles.subTitleBold,
          0,
          instructionStyles.subTitleUnderline
        );
        addVerticalSpace(2);
      }
      const textItems = Array.isArray(note?.text) ? (note.text as Array<string | null | undefined>) : [];
      textItems.forEach((entry: string | null | undefined) => {
        const text = String(entry ?? '').trim();
        if (!text) return;
        drawBulletedText(text, instructionStyles.paragraphFontSize, false);
        addVerticalSpace(4);
      });
      addVerticalSpace(6);
    });

    const formInstructionTitle = String(instructions.formInstructionTitle ?? '').trim();
    if (formInstructionTitle) {
      addVerticalSpace(6);
      drawWrappedText(
        formInstructionTitle,
        instructionStyles.titleFontSize,
        instructionStyles.titleBold,
        0,
        instructionStyles.titleUnderline
      );
      addVerticalSpace(6);
    }

    const formInstructions = Array.isArray(instructions.formInstructions)
      ? (instructions.formInstructions as InstructionFormItem[])
      : [];
    formInstructions.forEach((inst: InstructionFormItem) => {
      const title = String(inst?.title ?? '').trim();
      if (title) {
        drawWrappedText(
          title,
          instructionStyles.subTitleFontSize,
          instructionStyles.subTitleBold,
          0,
          instructionStyles.subTitleUnderline
        );
        addVerticalSpace(2);
      }
      const formSection = String(inst?.formSection ?? '').trim();
      const formPage = String(inst?.formPage ?? '').trim();
      const sectionBold = inst?.formSectionPageTextBold === true;
      const sectionUnderline = inst?.formSectionPageTextUnderline === true;
      const sectionItalic = inst?.formSectionPageTextItalics === true;
      const sectionFont =
        sectionBold && sectionItalic
          ? fontBoldItalic
          : sectionItalic
            ? fontItalic
            : sectionBold
              ? fontBold
              : font;
      const line =
        formSection && formPage
          ? `${formSection} (${formPage})`
          : formSection
            ? formSection
            : formPage;
      if (line) {
        drawWrappedText(
          line,
          instructionStyles.paragraphFontSize,
          sectionBold,
          0,
          sectionUnderline,
          sectionFont
        );
        addVerticalSpace(4);
      }
      const textItems = Array.isArray(inst?.text) ? (inst.text as Array<string | null | undefined>) : [];
      textItems.forEach((entry: string | null | undefined) => {
        const text = String(entry ?? '').trim();
        if (!text) return;
        drawBulletedText(text, instructionStyles.paragraphFontSize, false);
        addVerticalSpace(4);
      });
      addVerticalSpace(8);
    });
  }

  if (application.paymentReceived !== true) {
    await ensureRepeatedWatermark(pdf, {});
  }

  addPageFooters();

  return pdf;
}

function resolvePolicyInstructions(form: string) {
  if (form === '517') return (policy517 as any).instructions ?? null;
  if (form === '517g') return (policy517g as any).instructions ?? null;
  if (form === '518a') return (policy518a as any).instructions ?? null;
  return null;
}

type InstructionNote = {
  title?: string;
  text?: Array<string | null | undefined>;
};

type InstructionFormItem = {
  title?: string;
  formSection?: string;
  formPage?: string;
  formSectionPageTextBold?: boolean;
  formSectionPageTextUnderline?: boolean;
  formSectionPageTextItalics?: boolean;
  text?: Array<string | null | undefined>;
};

function formatLicenceLabel(form: Application['form'], code?: string) {
  if (!code) return undefined;
  const labels = LICENCE_LABELS[form];
  const trimmed = String(code).trim();
  return trimmed ? labels[trimmed] ?? trimmed : undefined;
}

function formatCompetencyCategories(categories?: CompetencyCategory[]) {
  if (!Array.isArray(categories) || !categories.length) return '';
  const deduped = Array.from(new Set(categories.filter(Boolean)));
  deduped.sort((a, b) => {
    const ia = CATEGORY_SORT_ORDER.indexOf(a as CompetencyCategory);
    const ib = CATEGORY_SORT_ORDER.indexOf(b as CompetencyCategory);
    if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return String(a).localeCompare(String(b));
  });
  return deduped.map((cat) => CATEGORY_LABELS[cat as CompetencyCategory] ?? String(cat)).join(', ');
}

function formatCompetencyCertificateLine(
  cert: CompetencyCertificate,
  form: Application['form']
): string {
  const certNumber = (cert.certificateNumber ?? '').trim();
  const licenceTypes = Array.isArray(cert.licenceTypes) ? cert.licenceTypes : [];
  const licencePart = licenceTypes
    .map((code) => formatLicenceLabel(form, code))
    .filter(Boolean)
    .join(', ');
  const categoryPart = formatCompetencyCategories(cert.categories);

  const parts: string[] = [];
  const base = certNumber ? `Competency certificate: ${certNumber}` : 'Competency certificate';
  const categories = categoryPart ? `(${categoryPart})` : '';
  parts.push([base, categories].filter(Boolean).join(' '));
  // if (licencePart) {
  //   parts.push(`Licences: ${licencePart}`);
  // }
  return parts.filter(Boolean).join(' — ');
}

function formatFirearmLicenceLine(firearm: Firearm): string {
  const cleanSection = normalizeSection(
    firearm.section ??
      (firearm as any).licenceSection ??
      (firearm as any).licenseSection ??
      ''
  );
  const cleanLicence = extractFirearmLicenceNumber(firearm);
  const make = (firearm.make ?? '').trim();
  const model = (firearm.model ?? '').trim();
  const serial =
    (firearm.firearmSerialNumber ??
      (firearm as any).serialNumber ??
      (firearm as any).firearmSerialNo ??
      (firearm as any).frameSerialNumber ??
      (firearm as any).receiverSerialNumber ??
      '') || '';
  const cleanSerial = String(serial).trim();

  const detail = [make, model].filter(Boolean).join(' ').trim();
  const serialPart = cleanSerial ? `(${cleanSerial})` : '';
  const sectionSuffix = cleanSection ? ` (Section ${cleanSection})` : '';
  const licenceSuffix = cleanLicence ? ` [${cleanLicence}]` : '';
  const finalDetail = [detail, serialPart].filter(Boolean).join(' ').trim();
  return finalDetail
    ? `Firearm licence: ${finalDetail}`
    // ? `Firearm licence: ${finalDetail}${sectionSuffix}${licenceSuffix}`
    : ``;
}

function extractFirearmLicenceNumber(firearm: Firearm): string {
  const licenceNumber =
    (firearm.licenseNumber ??
      (firearm as any).licenceNumber ??
      (firearm as any).licenseNo ??
      (firearm as any).licenceNo ??
      '') || '';
  return String(licenceNumber).trim();
}

type MembershipDocEntry = {
  doc: Document;
  membershipName: string;
};

function collectMembershipDocuments(application: Application, membershipDocOrder: Record<string, number>): MembershipDocEntry[] {
  const ids = resolveEffectiveMembershipIds(application);
  const selectedFirearmIds = new Set<string>(
    resolveApplicationFirearms(application)
      .map((firearm) => (firearm?.id ? String(firearm.id) : ''))
      .filter(Boolean)
  );
  const seen = new Set<string>();
  const docs: MembershipDocEntry[] = [];

  ids.forEach((membershipId) => {
    const membership = getById<Membership>(String(membershipId));
    if (!membership || (membership as any).deleted) return;
    const membershipName = String(membership.associationName ?? '').trim();
    const entries = Array.isArray(membership.membershipDocumentIds) ? membership.membershipDocumentIds : [];
    entries.forEach((entry) => {
      const docId = entry?.documentId;
      if (!docId) return;
      const doc = getById<Document>(String(docId));
      if (!doc || doc.deleted) return;
      const codeUpper = String(doc.requirementCode ?? doc.kind ?? '').toUpperCase();
      if (codeUpper === 'FIREARM_ENDORSEMENT') {
        const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
        if (!relatedId || !selectedFirearmIds.has(relatedId)) {
          return;
        }
      }
      const key = String(doc.id);
      if (seen.has(key)) return;
      seen.add(key);
      docs.push({ doc, membershipName });
    });
  });

  docs.sort((a, b) => {
    const aKey = String((a.doc.requirementCode ?? a.doc.kind ?? '')).toUpperCase();
    const bKey = String((b.doc.requirementCode ?? b.doc.kind ?? '')).toUpperCase();
    const aOrder = membershipDocOrder[aKey] ?? Number.MAX_SAFE_INTEGER;
    const bOrder = membershipDocOrder[bKey] ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return aKey.localeCompare(bKey);
  });

  return docs;
}

function resolveMembershipDocLabel(entry: MembershipDocEntry): string {
  const code = String(entry.doc.requirementCode ?? entry.doc.kind ?? '').toUpperCase();
  return resolveMembershipDocLabelFrom(code, resolveMembershipDocLabels('518a'), entry.membershipName, entry.doc.name);
}

function resolveMembershipDocLabelFrom(
  code: string,
  membershipDocLabels: Record<string, string>,
  membershipName?: string,
  fallbackDocName?: string
): string {
  if (code === 'FIREARM_ENDORSEMENT') {
    const association = membershipName || 'Membership';
    const firearm = fallbackDocName || 'Firearm';
    return `${association} Endorsement: ${firearm}`.trim();
  }
  const label = membershipDocLabels[code];
  const name = membershipName || 'Membership';
  const fallback = fallbackDocName || 'Membership document';
  const tail = (label || fallback).trim().replace(/\s+/g, ' ');
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixedPattern = new RegExp(`^${escapedName}\\s*[:\\-–—]\\s*`, 'i');
  const strippedTail = tail.replace(prefixedPattern, '').trim();
  return `${name} (${strippedTail || fallback})`.trim();
}

function resolveMembershipDocLabels(form: string): Record<string, string> {
  const policy = form === '517g' ? (policy517g as any) : form === '518a' ? (policy518a as any) : null;
  return policy?.requirements?.reduce((acc: Record<string, string>, entry: any) => {
    const code = String(entry?.code ?? '').toUpperCase();
    if (MEMBERSHIP_DOC_CODES.has(code)) {
      acc[code] = String(entry?.label ?? '').trim();
    }
    return acc;
  }, {}) ?? {};
}

function resolveMembershipDocOrderFromRequirements(requirements: any[]): Record<string, number> {
  return (requirements ?? []).reduce((acc: Record<string, number>, entry: any, index: number) => {
    const code = String(entry?.code ?? '').toUpperCase();
    if (MEMBERSHIP_DOC_CODES.has(code)) {
      const order = typeof entry?.displayOrder === 'number' ? entry.displayOrder : index;
      acc[code] = order;
    }
    return acc;
  }, {});
}

type ProficiencyDocEntry = {
  doc: Document;
  trainingProviderName: string;
};

function collectProficiencyDocuments(application: Application, proficiencyDocOrder: Record<string, number>): ProficiencyDocEntry[] {
  const ids = resolveEffectiveProficiencyIds(application);
  const seen = new Set<string>();
  const docs: ProficiencyDocEntry[] = [];

  ids.forEach((proficiencyId) => {
    const proficiency = getById<Proficiency>(String(proficiencyId));
    if (!proficiency || (proficiency as any).deleted) return;
    const trainingProviderName = String(proficiency.trainingProviderName ?? '').trim();
    const entries = Array.isArray(proficiency.proficiencyDocumentIds) ? proficiency.proficiencyDocumentIds : [];
    entries.forEach((entry) => {
      const docId = entry?.documentId;
      if (!docId) return;
      const doc = getById<Document>(String(docId));
      if (!doc || doc.deleted) return;
      const codeUpper = String(doc.requirementCode ?? doc.kind ?? '').toUpperCase();
      if (!PROFICIENCY_DOC_CODES.has(codeUpper)) return;
      const key = String(doc.id);
      if (seen.has(key)) return;
      seen.add(key);
      docs.push({ doc, trainingProviderName });
    });
  });

  docs.sort((a, b) => {
    const aKey = String((a.doc.requirementCode ?? a.doc.kind ?? '')).toUpperCase();
    const bKey = String((b.doc.requirementCode ?? b.doc.kind ?? '')).toUpperCase();
    const aOrder = proficiencyDocOrder[aKey] ?? Number.MAX_SAFE_INTEGER;
    const bOrder = proficiencyDocOrder[bKey] ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return aKey.localeCompare(bKey);
  });

  return docs;
}

function resolveProficiencyDocLabelFrom(
  code: string,
  proficiencyDocLabels: Record<string, string>,
  trainingProviderName?: string,
  fallbackDocName?: string
): string {
  const label = proficiencyDocLabels[code];
  const provider = trainingProviderName || 'Proficiency';
  const fallback = fallbackDocName || 'Document';
  const tail = label || fallback;
  return `Proficiency: ${provider} - ${tail}`.trim();
}

function resolveProficiencyDocLabels(form: string): Record<string, string> {
  const policy = form === '517g' ? (policy517g as any) : form === '518a' ? (policy518a as any) : null;
  return policy?.requirements?.reduce((acc: Record<string, string>, entry: any) => {
    const code = String(entry?.code ?? '').toUpperCase();
    if (PROFICIENCY_DOC_CODES.has(code)) {
      acc[code] = String(entry?.label ?? '').trim();
    }
    return acc;
  }, {}) ?? {};
}

function resolveProficiencyDocOrder(form: string): Record<string, number> {
  const policy = form === '517g' ? (policy517g as any) : form === '518a' ? (policy518a as any) : null;
  return policy?.requirements?.reduce((acc: Record<string, number>, entry: any, index: number) => {
    const code = String(entry?.code ?? '').toUpperCase();
    if (PROFICIENCY_DOC_CODES.has(code)) {
      const order = typeof entry?.displayOrder === 'number' ? entry.displayOrder : index;
      acc[code] = order;
    }
    return acc;
  }, {}) ?? {};
}

function normalizeSection(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^section\s*/i, '').trim();
  return withoutPrefix || trimmed;
}

function buildDocLookup(application: Application, requirements?: Array<any>) {
  const map = new Map<string, Document[]>();
  const entries = application.docs?.documents ?? [];
  const seen = new Set<string>();
  const kindToRequirementCode: Record<string, string> = {};
  (requirements ?? []).forEach((req) => {
    const code = String(req?.code ?? '').toUpperCase();
    if (!code) return;
    const kinds = Array.isArray(req?.documentKinds) ? req.documentKinds : [];
    kinds.forEach((entry: any) => {
      const kind = String(entry?.kind ?? '').toUpperCase();
      if (!kind) return;
      if (!kindToRequirementCode[kind]) {
        kindToRequirementCode[kind] = code;
      }
    });
  });
  const fallbackKindMap: Record<string, string> = {
    FIREARM_LICENCE: 'FIREARM_LICENCE',
    FIREARM_LICENSE: 'FIREARM_LICENCE',
    COMPETENCY_CERT: 'COMPETENCY_CERT',
    SAFE: 'SAFES',
    PROOF_OF_ADDRESS: 'PROOF_ADDRESS',
    ID_CARD: 'ID_DOC',
    ID_BOOK: 'ID_DOC',
    PASSPORT: 'ID_DOC',
  };

  entries.forEach((entry) => {
    const docId = entry?.documentId;
    if (!docId) return;
    if (seen.has(String(docId))) return;
    const doc = getById<Document>(String(docId));
    if (!doc || doc.deleted) return;
    seen.add(String(docId));

    const kindUpper = String(doc.kind ?? entry?.kind ?? '').toUpperCase();
    const reqCodeUpper = String(doc.requirementCode ?? '').toUpperCase();
    const mappedCode =
      kindToRequirementCode[kindUpper] ??
      kindToRequirementCode[String(entry?.kind ?? '').toUpperCase()] ??
      fallbackKindMap[kindUpper] ??
      fallbackKindMap[String(entry?.kind ?? '').toUpperCase()] ??
      (reqCodeUpper.includes('SAFE') ? 'SAFES' : undefined);
    const code = String(mappedCode ?? kindUpper).toUpperCase();
    if (!code) return;

    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(doc);
  });

  return map;
}

function buildApplicationDocumentIdSet(application: Application): Set<string> {
  const set = new Set<string>();
  const entries = application.docs?.documents ?? [];
  entries.forEach((entry) => {
    const id = entry?.documentId;
    if (id) set.add(String(id));
  });
  return set;
}

function resolveSupportingStatementChecklistSlots(
  application: Application
): Set<keyof typeof SUPPORTING_STATEMENT_SLOT_ORDER> {
  const linkedIds = new Set<string>(
    Array.isArray(application.supportingStatementIds)
      ? application.supportingStatementIds.filter(Boolean).map((id) => String(id))
      : []
  );
  const profileId = application.applicantProfileId ? String(application.applicantProfileId) : '';
  const slots = new Set<keyof typeof SUPPORTING_STATEMENT_SLOT_ORDER>();
  const statements = listByType<SupportingStatement>('SupportingStatement')
    .filter((statement) => {
      const status = `${statement.status ?? 'empty'}`.toLowerCase();
      if (status !== 'complete') return false;
      const byApplicationId =
        statement.applicationId && String(statement.applicationId) === String(application.id);
      const byLinkedId = statement.id ? linkedIds.has(String(statement.id)) : false;
      const byProfileId = profileId && String(statement.holderProfileId ?? '') === profileId;
      return Boolean(byApplicationId || byLinkedId || byProfileId);
    })
    .sort((a, b) => {
      const orderA = SUPPORTING_STATEMENT_SLOT_ORDER[a.slot ?? ''] ?? Number.MAX_SAFE_INTEGER;
      const orderB = SUPPORTING_STATEMENT_SLOT_ORDER[b.slot ?? ''] ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });

  statements.forEach((statement) => {
    const slot = statement.slot;
    if (!slot) return;
    if (!(slot in SUPPORTING_STATEMENT_SLOT_ORDER)) return;
    slots.add(slot);
  });

  return slots;
}

function isSupportingStatementRequirementChecked(
  code: string | undefined,
  slots: Set<keyof typeof SUPPORTING_STATEMENT_SLOT_ORDER>
): boolean {
  const upper = String(code ?? '').toUpperCase();
  const strictSlot = SUPPORTING_STATEMENT_CODE_TO_SLOT[upper];
  if (strictSlot) {
    return slots.has(strictSlot);
  }
  if (upper === 'SUPPORTING_STATEMENT') {
    return slots.size > 0;
  }
  return false;
}

function buildSafeSummaries(application: Application, docByRequirement?: Map<string, Document[]>) {
  const lookup = docByRequirement ?? new Map<string, Document[]>();
  const docs = lookup.get('SAFES') ?? [];
  const safeIds = new Set<string>(resolveEffectiveSafeIds(application));
  docs.forEach((doc) => {
    const pid = doc.parentId ? String(doc.parentId) : undefined;
    const rid = doc.requirementRelatedId ? String(doc.requirementRelatedId) : undefined;
    if (pid) safeIds.add(pid);
    if (rid) safeIds.add(rid);
  });

  const summaries: Array<{ label: string; hasDocs: boolean }> = [];
  const photoLabelsBySafe: Map<string, string[]> = new Map();
  docs.forEach((doc) => {
    const sid = doc.parentId ? String(doc.parentId) : doc.requirementRelatedId ? String(doc.requirementRelatedId) : undefined;
    if (!sid) return;
    const labels = photoLabelsBySafe.get(sid) ?? [];
    const label = normalizeSafePhotoLabel(doc);
    if (label && !labels.includes(label)) {
      labels.push(label);
    }
    photoLabelsBySafe.set(sid, labels);
  });

  const safeEntities: Map<string, Safe> = new Map();
  safeIds.forEach((sid) => {
    const safe = getById<Safe>(sid);
    if (safe) safeEntities.set(sid, safe);
  });

  if (safeIds.size === 0 && docs.length) {
    safeIds.add('unknown');
  }

  safeIds.forEach((sid) => {
    const safe = safeEntities.get(sid);
    const name = (safe?.safeName || '').trim() || 'Safe';
    const docsById = new Map(
      docs
        .filter((doc) => {
          const parentId = doc.parentId ? String(doc.parentId) : '';
          const relatedId = doc.requirementRelatedId ? String(doc.requirementRelatedId) : '';
          return parentId === sid || relatedId === sid;
        })
        .map((doc) => [String(doc.id), doc] as const),
    );
    const orderedLabels: string[] = [];
    const seen = new Set<string>();

    SAFE_PHOTO_CATEGORY_ORDER.forEach((category) => {
      const photo = safe?.safePhotos?.find((entry) => String(entry.category).toUpperCase() === category);
      if (!photo) return;
      const doc = docsById.get(String(photo.documentId));
      const label = doc ? normalizeSafePhotoLabel(doc) : SAFE_PHOTO_LABELS[category];
      if (label && !seen.has(label)) {
        seen.add(label);
        orderedLabels.push(label);
      }
    });

    (photoLabelsBySafe.get(sid) ?? []).forEach((label) => {
      if (!seen.has(label)) {
        seen.add(label);
        orderedLabels.push(label);
      }
    });

    const photosPart = `Photos: ${orderedLabels.join(', ')}`;
    summaries.push({
      label: `Firearm storage: ${name} (${photosPart})`,
      hasDocs: orderedLabels.length > 0 || docs.length > 0,
    });
  });

  return summaries;
}

function isRequirementSatisfied(docByRequirement: Map<string, Document[]>, code?: string) {
  if (!code) return false;
  const docs = docByRequirement.get(String(code).toUpperCase());
  return Boolean(docs && docs.length);
}

function isDocLinked(docByRequirement: Map<string, Document[]>, code: string | undefined, relatedId?: string | null) {
  if (!code) return false;
  const docs = docByRequirement.get(String(code).toUpperCase());
  if (!docs || !docs.length) return false;
  if (!relatedId) return true;
  const matched = docs.some((d) => {
    if (d.parentId && String(d.parentId) === String(relatedId)) return true;
    if (d.requirementRelatedId && String(d.requirementRelatedId) === String(relatedId)) return true;
    return false;
  });
  return matched || docs.length > 0;
}

function hasFirearmDocs(docByRequirement: Map<string, Document[]>, code: string | undefined, firearmId?: string) {
  if (!code || !firearmId) return false;
  const docs = docByRequirement.get(String(code).toUpperCase());
  if (!docs || !docs.length) return false;
  const matching = docs.filter((d) => {
    if (d.parentId && String(d.parentId) === String(firearmId)) return true;
    if (d.requirementRelatedId && String(d.requirementRelatedId) === String(firearmId)) return true;
    return false;
  });
  if (!matching.length) return docs.length > 0; // fallback: any doc counts as captured
  const sides = new Set<string>();
  matching.forEach((d) => {
    if (d.identityDocumentSide) {
      sides.add(String(d.identityDocumentSide).toLowerCase());
    }
  });
  if (sides.has('front') && sides.has('back')) return true;
  return matching.length >= 1;
}

export async function generateOrGetChecklistPdf(application: Application): Promise<Document> {
  const pdfDoc = await buildChecklistPdf(application);
  const base64 = await pdfDoc.saveAsBase64({ dataUri: false });
  let document: Document;
  const pathInfo = await pdfPathFor(application.id, 'checklist');

  if (pathInfo) {
    await ensurePdfWorkspace();
    await FileSystem.writeAsStringAsync(pathInfo.absolute, base64, {
      encoding: 'base64',
    });
    const info = await FileSystem.getInfoAsync(pathInfo.absolute);
    const fileSize =
      'size' in info && typeof info.size === 'number' ? info.size : Math.round(base64.length * 0.75);
    const storedPath = toRelativeDocumentPath(pathInfo.absolute) ?? pathInfo.absolute;
    document = withMeta<Document>({
      id: (globalThis.crypto?.randomUUID?.() ?? `doc_${Math.random().toString(36).slice(2)}`) as any,
      type: 'Document',
      holderProfileId: (application.applicantProfileId ?? '') as Document['holderProfileId'],
      kind: 'OTHER',
      filePath: storedPath,
      uri: storedPath,
      sha256: '',
      pages: pdfDoc.getPageCount(),
      name: `${application.form.toUpperCase()} Checklist`,
      mime: 'application/pdf',
      size: fileSize,
      applicationId: application.id,
      requirementCode: 'CHECKLIST',
    } as Document);
  } else {
    const dataUri = `data:application/pdf;base64,${base64}`;
    document = withMeta<Document>({
      id: (globalThis.crypto?.randomUUID?.() ?? `doc_${Math.random().toString(36).slice(2)}`) as any,
      type: 'Document',
      holderProfileId: (application.applicantProfileId ?? '') as Document['holderProfileId'],
      kind: 'OTHER',
      filePath: '',
      uri: dataUri,
      sha256: '',
      pages: pdfDoc.getPageCount(),
      name: `${application.form.toUpperCase()} Checklist`,
      mime: 'application/pdf',
      size: Math.round(base64.length * 0.75),
      applicationId: application.id,
      requirementCode: 'CHECKLIST',
      base64Data: base64,
    } as Document);
  }
  return document;
}

function resolveChecklistSubtitle(
  form: string,
  application: Application,
  competencyCertificates: CompetencyCertificate[],
  firearms: Firearm[]
): string {
  if (form === '517g') {
    const numbers = competencyCertificates
      .map((c) => (c.certificateNumber ?? '').trim())
      .filter(Boolean);
    const base = numbers.length === 1 ? 'Renewal of Competency Certificate' : 'Renewal of Competency Certificates';
    return numbers.length ? `${base}: ${numbers.join(', ')}` : base;
  }
  if (form === '518a') {
    const numbers = firearms
      .map((f) => extractFirearmLicenceNumber(f))
      .filter(Boolean);
    const base = numbers.length === 1 ? 'Renewal of Firearm Licence' : 'Renewal of Firearm Licences';
    return numbers.length ? `${base}: ${numbers.join(', ')}` : base;
  }

  return `Application ID: ${application.id}`;
}

function withChecklistAnnexure(baseLabel: string, req: any): string {
  const annexure = String((req as any)?.annexure ?? '').trim();
  if (!annexure) return baseLabel;
  if (/^annexure\s+/i.test(baseLabel)) return baseLabel;
  return `ANNEXURE ${annexure}: ${baseLabel}`;
}

function buildChecklistRowLabel(req: any): string {
  const baseLabel = String((req as any)?.checklistLabel || req?.label || '').trim();
  return withChecklistAnnexure(baseLabel, req);
}

function buildIdRequirementLabel(req: any, docs: Document[]): string {
  const kinds = new Set(docs.map((doc) => String(doc.kind ?? '').toUpperCase()));
  const base =
    kinds.has('PASSPORT')
      ? 'Two copies of your passport'
      : kinds.has('ID_BOOK')
        ? 'Two copies of your old South African ID book'
        : 'Two copies of your South African ID card (front and back)';
  return withChecklistAnnexure(base, req);
}
