import { CompetencyCategory, Firearm } from '../data/types';

export type ParsedExtraction = {
  fields: Record<string, string>;
  quality: 'low' | 'medium' | 'high';
};

const CATEGORY_KEYWORDS: Record<CompetencyCategory, RegExp[]> = {
  Handgun: [/hand\s*gun/i, /\bhandgun\b/i, /\bshort\s*weapon\b/i],
  Rifle: [/\brifle\b/i, /\blong\s*gun\b/i],
  Shotgun: [/\bshot\s*gun\b/i, /\bshotgun\b/i],
  HandMachineCarbine: [
    /hand\s*machine\s*carbine/i,
    /\bcarbine\b/i,
    /\bHMC\b/i,
    /S\s*[/lL1I]\s*-\s*R\s*I\s*f\s*l\s*E\s*[/\\]\s*C\s*A\s*R\s*B\s*[/\\]\s*P\s*I\s*S\s*T\s*/i,
  ],
};

const COMPETENCY_CATEGORY_ORDER: CompetencyCategory[] = [
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
];

const COMPETENCY_CATEGORY_SYNONYMS: Record<CompetencyCategory, string[]> = {
  Handgun: ['HANDGUN', 'HAND GUN'],
  Rifle: ['RIFLE'],
  Shotgun: ['SHOTGUN', 'SHOT GUN'],
  HandMachineCarbine: [
    'HAND MACHINE CARBINE',
    'HANDMACHINECARBINE',
    'HMC',
    'CARBINE',
    'S/L-RIFLE/CARB/PIST CAL CARB',
    'S L RIFLE CARB PIST CAL CARB',
    'SLRIFLECARBPISTCALCARB',
  ],
};

const FIREARM_TYPE_KEYWORDS: Record<string, string[]> = {
  Handgun: ['handgun', 'hand gun', 'pistol', 'revolver'],
  Rifle: ['rifle', 'rifel'],
  Shotgun: ['shotgun', 'shot gun'],
  HandMachineCarbine: ['hand machine carbine', 'carbine', 'hmc'],
};

const DATE_REGEXES: RegExp[] = [
  /\b(\d{4}\s*[-/]\s*(?:0?[1-9]|1[0-2])\s*[-/]\s*(?:0?[1-9]|[12][0-9]|3[01]))\b/, // yyyy-mm-dd
  /\b((?:0?[1-9]|1[0-2])\s*[-/]\s*(?:0?[1-9]|[12][0-9]|3[01])\s*[-/]\s*\d{4})\b/, // mm-dd-yyyy or mm/dd/yyyy
  /\b((?:0?[1-9]|[12][0-9]|3[01])\s*[-/]\s*(?:0?[1-9]|1[0-2])\s*[-/]\s*\d{4})\b/, // dd-mm-yyyy
  /\b((?:0?[1-9]|[12][0-9]|3[01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i,
];

const NUMBER_SANITIZE = /[^0-9A-Z/-]/g;

const WHITESPACE_RE = /\s+/g;

function toQuality(found: number, total: number): 'low' | 'medium' | 'high' {
  if (found <= 0) return 'low';
  if (found >= total) return 'high';
  const coverage = found / total;
  if (coverage >= 0.75) return 'high';
  if (coverage >= 0.4) return 'medium';
  return 'low';
}

function sanitize(value: string): string {
  return value.replace(WHITESPACE_RE, ' ').trim();
}

function normalizeDateOutput(value: string): string {
  return sanitize(value).replace(/\s*([-/])\s*/g, '$1');
}

function normalizeSectionValue(value: string): string {
  const sanitized = sanitize(value);
  if (!sanitized) return sanitized;
  const upper = sanitized.toUpperCase();
  const withoutPrefix = upper.replace(/^(SECTION|SEC|S)\s*/i, '').trim();
  const match = withoutPrefix.match(/([0-9]+(?:\([0-9]+\))?(?:[A-Z])?)/i);
  if (match && match[1]) {
    return `Section ${match[1].toUpperCase()}`;
  }
  if (upper.startsWith('SECTION ')) {
    return `Section ${upper.slice('SECTION '.length).trim()}`;
  }
  return `Section ${upper}`;
}

function sanitizeNumber(value: string): string {
  return sanitize(value).replace(NUMBER_SANITIZE, '').replace(WHITESPACE_RE, '');
}

function normalizeCompetencyCertCandidate(value: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z]\d{7,9}$/.test(cleaned) ? cleaned : null;
}

function findCompetencyCertNumber(text: string): string | undefined {
  if (!text) return undefined;
  const regex = /[A-Z][\s:;=\/\-_.]*\d[\d\s:;=\/\-_.]{6,8}/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const normalized = normalizeCompetencyCertCandidate(match[0]);
    if (normalized) return normalized;
  }
  return undefined;
}

function buildLooseAlphaRegex(value: string): RegExp | null {
  const alpha = value.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!alpha) return null;
  const pattern = alpha
    .split('')
    .map((char) => `${char}[^A-Za-z]*`)
    .join('');
  return new RegExp(pattern, 'gi');
}

function stripHandMachineCarbinePhrases(text: string): string {
  if (!text) return text;
  let result = text;
  for (const synonym of COMPETENCY_CATEGORY_SYNONYMS.HandMachineCarbine) {
    const regex = buildLooseAlphaRegex(synonym);
    if (!regex) continue;
    result = result.replace(regex, ' ');
  }
  return result;
}

function findFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return sanitize(match[1]);
    }
  }
  return undefined;
}

function extractCompetencyCategoriesFromText(text: string): CompetencyCategory[] {
  if (!text) return [];
  const normalizedUpper = text.replace(/\s+/g, ' ').toUpperCase();
  const anchor = 'COMPETENCY TO POSSESS A';
  let segment = '';
  const anchorIndex = normalizedUpper.indexOf(anchor);
  if (anchorIndex !== -1) {
    segment = normalizedUpper.slice(anchorIndex + anchor.length).trim();
    if (segment.startsWith('FIREARM')) {
      segment = segment.slice('FIREARM'.length).trim();
    }
    if (segment) {
      const stopMatch = segment.match(/(?:IT\s+IS\s+HEREBY|THE\s+FIREARMS|DATE\s+OF\s+ISSUE|CERTIFICATE\s+NUMBER|\.)/);
      if (stopMatch && stopMatch.index !== undefined) {
        segment = segment.slice(0, stopMatch.index);
      }
    }
  }
  if (!segment) {
    const looseMatch = text.match(/COMPETENCY\s+TO\s+POSSESS\s+A[\s:-]*(?:FIREARM)?[\s:-]*(.*)/i);
    if (looseMatch && looseMatch[1]) {
      segment = looseMatch[1].toUpperCase();
    }
  }
  if (!segment) return [];
  let working = segment;
  let handCarbineFound = false;
  for (const synonym of COMPETENCY_CATEGORY_SYNONYMS.HandMachineCarbine) {
    const regex = buildLooseAlphaRegex(synonym);
    if (!regex) continue;
    if (regex.test(working)) {
      handCarbineFound = true;
      working = working.replace(regex, ' ');
    }
    regex.lastIndex = 0;
  }

  const matches = new Set<CompetencyCategory>();
  if (handCarbineFound) {
    matches.add('HandMachineCarbine');
  }

  let sanitized = working.replace(/[^A-Z]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!sanitized) {
    return Array.from(matches);
  }

  const compact = sanitized.replace(/\s+/g, '');

  (Object.keys(COMPETENCY_CATEGORY_SYNONYMS) as CompetencyCategory[]).forEach((category) => {
    if (category === 'HandMachineCarbine' && handCarbineFound) return;
    for (const synonym of COMPETENCY_CATEGORY_SYNONYMS[category]) {
      const regex = buildLooseAlphaRegex(synonym);
      if (!regex) continue;
      if (regex.test(sanitized)) {
        matches.add(category);
        regex.lastIndex = 0;
        break;
      }
      regex.lastIndex = 0;
      const compactSyn = synonym.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (compactSyn && compact.includes(compactSyn)) {
        matches.add(category);
        break;
      }
    }
  });

  return Array.from(matches);
}

function extractCompetencyCertificateNumber(text: string): string | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();
  const marker = /COMPETENCY\s+CERTIFICATE\s+NUMBER/gi;
  const match = marker.exec(upper);
  if (match) {
    const start = match.index + match[0].length;
    const window = text.slice(start, Math.min(text.length, start + 120));
    const withinWindow = findCompetencyCertNumber(window);
    if (withinWindow) return withinWindow;
  }
  return findCompetencyCertNumber(text);
}

function extractCompetencyIssuedDate(text: string): string | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();
  const marker = /DATE\s+OF\s+ISSUE/gi;
  const match = marker.exec(upper);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const remainder = text.slice(start);
  if (!remainder) return undefined;
  const window = remainder.slice(0, 100).replace(/\s+/g, ' ').trim();
  const date =
    findFirst(window, DATE_REGEXES) ??
    findFirst(remainder, DATE_REGEXES);
  if (!date) return undefined;
  return normalizeDateOutput(date);
}

function findValueAfterKeyword(lines: string[], keyword: RegExp): string | undefined {
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const match = line.match(keyword);
    if (!match) continue;
    if (match[1]) return sanitize(match[1]);
    const remainder = line.slice(match.index ?? 0 + match[0].length).trim();
    if (remainder) return sanitize(remainder);
    const nextLine = lines[idx + 1];
    if (nextLine) return sanitize(nextLine);
  }
  return undefined;
}

const FIREARM_BARCODE_TYPE_MAP: Record<string, Firearm['firearmType']> = {
  HANDGUN: 'Handgun',
  RIFLE: 'Rifle',
  SHOTGUN: 'Shotgun',
  CARBINE: 'HandMachineCarbine',
  HMC: 'HandMachineCarbine',
  'HAND MACHINE CARBINE': 'HandMachineCarbine',
  'HANDMACHINECARBINE': 'HandMachineCarbine',
};

function mapBarcodeFirearmType(value: string): Firearm['firearmType'] | undefined {
  if (!value) return undefined;
  const normalizedWithSpaces = sanitize(value).toUpperCase();
  if (!normalizedWithSpaces) return undefined;
  const direct = FIREARM_BARCODE_TYPE_MAP[normalizedWithSpaces];
  if (direct) return direct;
  const compact = normalizedWithSpaces.replace(WHITESPACE_RE, '');
  return FIREARM_BARCODE_TYPE_MAP[compact] ?? FIREARM_BARCODE_TYPE_MAP[compact.toUpperCase()];
}

function parseFirearmBarcode(raw: string): ParsedExtraction | null {
  if (!raw || raw.indexOf('|') === -1) return null;
  const parts = raw.split('|').map((part) => sanitize(part));
  if (parts.length < 19) return null;

  const get = (index: number) => parts[index - 1] ?? '';
  const fields: Record<string, string> = {};

  const sectionRaw = get(5);
  if (sectionRaw) {
    const normalizedSection = normalizeSectionValue(sectionRaw);
    if (normalizedSection) fields.section = normalizedSection;
  }

  const barCodeIdNumber = get(2);
  if (barCodeIdNumber) fields.barCodeIdNumber = sanitizeNumber(barCodeIdNumber);

  const barcodeInitialSurname = get(4);
  if (barcodeInitialSurname) fields.barcodeInitialSurname = sanitize(barcodeInitialSurname);

  const validFrom = get(6);
  if (validFrom) fields.validFrom = sanitize(validFrom);

  const validTo = get(7);
  if (validTo) fields.validTo = sanitize(validTo);

  const firearmSerial = get(8);
  if (firearmSerial) fields.firearmSerialNumber = sanitizeNumber(firearmSerial);

  const firearmType = mapBarcodeFirearmType(get(9));
  if (firearmType) {
    fields.firearmType = firearmType;
  } else {
    const rawType = get(9);
    if (rawType) fields.firearmType = sanitize(rawType);
  }

  const make = get(10);
  if (make) fields.make = sanitize(make);

  const model = get(11);
  if (model) fields.model = sanitize(model);

  const calibre = get(12);
  if (calibre) fields.calibre = sanitize(calibre);

  const barrelSerial = get(13);
  if (barrelSerial) fields.barrelSerialNo = sanitizeNumber(barrelSerial);

  const barrelMake = get(14);
  if (barrelMake) fields.barrelMake = sanitize(barrelMake);

  const receiverSerial = get(15);
  if (receiverSerial) fields.receiverSerialNumber = sanitizeNumber(receiverSerial);

  const receiverMake = get(16);
  if (receiverMake) fields.receiverMake = sanitize(receiverMake);

  const frameSerial = get(17);
  if (frameSerial) fields.frameSerialNumber = sanitizeNumber(frameSerial);

  const frameMake = get(18);
  if (frameMake) fields.frameMake = sanitize(frameMake);

  const licenseNumber = get(19);
  if (licenseNumber) fields.licenseNumber = sanitizeNumber(licenseNumber);

  const totalPossible = 17;
  const found = Object.values(fields).filter(Boolean).length;

  if (found === 0) return null;

  return {
    fields,
    quality: toQuality(found, totalPossible),
  };
}

export function parseCompetencyText(text: string): ParsedExtraction {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fields: Record<string, string> = {};

  const targetedCategories = extractCompetencyCategoriesFromText(text);

  let fallbackSource = text;
  if (targetedCategories.includes('HandMachineCarbine')) {
    fallbackSource = stripHandMachineCarbinePhrases(fallbackSource);
  }

  const fallbackCategories = (Object.keys(CATEGORY_KEYWORDS) as CompetencyCategory[]).filter((category) =>
    CATEGORY_KEYWORDS[category].some((regex) => regex.test(fallbackSource))
  );
  const categorySet = new Set<CompetencyCategory>([...targetedCategories, ...fallbackCategories]);
  const orderedCategories = COMPETENCY_CATEGORY_ORDER.filter((category) => categorySet.has(category));
  if (orderedCategories.length) {
    fields.categories = orderedCategories.join(',');
  }

  let certificateNumber = extractCompetencyCertificateNumber(text);
  if (!certificateNumber) {
    const fallbackNumber =
      findFirst(text, [
        /certificate\s*(?:number|no\.?|nr\.?)\s*[:\-]?\s*([A-Z0-9/\- ]{3,})/i,
        /\bcomp\s*cert\s*(?:number|no\.?)\s*[:\-]?\s*([A-Z0-9/\- ]{3,})/i,
      ]) ??
      findValueAfterKeyword(lines, /(certificate\s*(?:number|no\.?|nr\.?))(?:[:\-]|\b)?\s*(.*)$/i);
    if (fallbackNumber) {
      const normalized =
        findCompetencyCertNumber(fallbackNumber) ??
        normalizeCompetencyCertCandidate(fallbackNumber);
      if (normalized) {
        certificateNumber = normalized;
      }
    }
  }
  if (certificateNumber) {
    fields.certificateNumber = certificateNumber;
  }

  let issuedAt = extractCompetencyIssuedDate(text);
  if (!issuedAt) {
    const fallbackIssued =
      findFirst(text, [
        /issued\s*(?:on|date)?\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
        /date\s*of\s*issue\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
      ]) ?? findValueAfterKeyword(lines, /(issued\s*(?:on|date)?|date\s*of\s*issue)(?:[:\-]|\b)?\s*(.*)$/i);
    if (fallbackIssued) {
      const dateMatch = findFirst(fallbackIssued, DATE_REGEXES);
      if (dateMatch) {
        issuedAt = normalizeDateOutput(dateMatch);
      }
    }
  }
  if (issuedAt) {
    fields.issuedAt = issuedAt;
  }

  const expiry =
    findFirst(text, [
      /expires?\s*(?:on|date|at)?\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
      /expiry\s*(?:date)?\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
      /valid\s*until\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
    ]) ?? findValueAfterKeyword(lines, /(expiry|expires|valid\s*until)(?:[:\-]|\b)?\s*(.*)$/i);

  if (expiry) {
    const dateMatch = findFirst(expiry, DATE_REGEXES);
    if (dateMatch) {
      fields.expiresAt = normalizeDateOutput(dateMatch);
    }
  }

  const provider =
    findFirst(text, [
      /training\s*(?:provider|centre|center)\s*[:\-]?\s*([A-Za-z0-9 &'.,\-]{3,})/i,
      /provider\s*[:\-]?\s*([A-Za-z0-9 &'.,\-]{3,})/i,
    ]) ??
    findValueAfterKeyword(lines, /(training\s*(?:provider|centre|center)|provider)(?:[:\-]|\b)?\s*(.*)$/i);

  if (provider) {
    fields.trainingProvider = sanitize(provider);
  }

  const basePossible = 4;
  const totalPossible = basePossible + (fields.categories ? 1 : 0);
  const found = Object.values(fields).filter(Boolean).length;

  return {
    fields,
    quality: toQuality(found, totalPossible),
  };
}

export function parseFirearmText(text: string): ParsedExtraction {
  const barcodeParsed = parseFirearmBarcode(text);
  if (barcodeParsed) {
    return barcodeParsed;
  }

  const lower = text.toLowerCase();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fields: Record<string, string> = {};

  const firearmType = Object.entries(FIREARM_TYPE_KEYWORDS).find(([, keywords]) =>
    keywords.some((keyword) => lower.includes(keyword))
  );
  if (firearmType) {
    fields.firearmType = firearmType[0];
  }

  const make =
    findFirst(text, [
      /\bmake\s*[:\-]?\s*([A-Za-z0-9 &'.,\-]{2,})/i,
      /\bmanufacturer\s*[:\-]?\s*([A-Za-z0-9 &'.,\-]{2,})/i,
    ]) ?? findValueAfterKeyword(lines, /(make|manufacturer)(?:[:\-]|\b)?\s*(.*)$/i);
  if (make) {
    fields.make = sanitize(make);
  }

  const model =
    findFirst(text, [
      /\bmodel\s*[:\-]?\s*([A-Za-z0-9 &'.,\-]{2,})/i,
      /\btype\s*[:\-]?\s*([A-Za-z0-9 &'.,\-]{2,})/i,
    ]) ?? findValueAfterKeyword(lines, /(model|type)(?:[:\-]|\b)?\s*(.*)$/i);
  if (model) {
    fields.model = sanitize(model);
  }

  const serial =
    findFirst(text, [
      /serial\s*(?:number|no\.?|nr\.?)\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
      /\bfirearm\s*no\.?\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
    ]) ?? findValueAfterKeyword(lines, /(serial\s*(?:number|no\.?|nr\.?)|firearm\s*no\.?)(?:[:\-]|\b)?\s*(.*)$/i);
  if (serial) {
    fields.firearmSerialNumber = sanitizeNumber(serial);
  }

  const calibre =
    findFirst(text, [
      /\bcalibre\s*[:\-]?\s*([0-9A-Za-z .\/-]{2,})/i,
      /\bcaliber\s*[:\-]?\s*([0-9A-Za-z .\/-]{2,})/i,
    ]) ?? findValueAfterKeyword(lines, /(calibre|caliber)(?:[:\-]|\b)?\s*(.*)$/i);
  if (calibre) {
    fields.calibre = sanitize(calibre);
  }

  const licenceNumber =
    findFirst(text, [
      /\blicen[cs]e\s*(?:number|no\.?|nr\.?)\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
      /\bpermit\s*(?:number|no\.?)\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
    ]) ??
    findValueAfterKeyword(lines, /(licen[cs]e|permit)\s*(?:number|no\.?|nr\.?)(?:[:\-]|\b)?\s*(.*)$/i);
  if (licenceNumber) {
    fields.licenseNumber = sanitizeNumber(licenceNumber);
  }

  const section =
    findFirst(text, [/\bsection\s*([0-9A-Za-z]{1,3})\b/i]) ??
    findValueAfterKeyword(lines, /(section)(?:[:\-]|\b)?\s*(.*)$/i);
  if (section) {
    fields.section = normalizeSectionValue(section);
  }

  const validFrom =
    findFirst(text, [
      /valid\s*from\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
      /effective\s*from\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
    ]) ?? findValueAfterKeyword(lines, /(valid\s*from|effective\s*from)(?:[:\-]|\b)?\s*(.*)$/i);
  if (validFrom) {
    const dateMatch = findFirst(validFrom, DATE_REGEXES);
    if (dateMatch) {
      fields.validFrom = normalizeDateOutput(dateMatch);
    }
  }

  const validTo =
    findFirst(text, [
      /valid\s*(?:to|until)\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
      /expires?\s*(?:on|at|date)?\s*[:\-]?\s*([0-9A-Za-z\/\- ]{4,})/i,
    ]) ?? findValueAfterKeyword(lines, /(valid\s*(?:to|until)|expires?)(?:[:\-]|\b)?\s*(.*)$/i);
  if (validTo) {
    const dateMatch = findFirst(validTo, DATE_REGEXES);
    if (dateMatch) {
      fields.validTo = normalizeDateOutput(dateMatch);
    }
  }

  const barrelSerial =
    findFirst(text, [
      /barrel\s*(?:serial\s*(?:number|no\.?|nr\.?)|number)\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
    ]) ?? findValueAfterKeyword(lines, /(barrel\s*(?:serial\s*(?:number|no\.?|nr\.?)|number))(?:[:\-]|\b)?\s*(.*)$/i);
  if (barrelSerial) {
    fields.barrelSerialNo = sanitizeNumber(barrelSerial);
  }

  const receiverSerial =
    findFirst(text, [
      /receiver\s*(?:serial\s*(?:number|no\.?|nr\.?)|number)\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
    ]) ??
    findValueAfterKeyword(lines, /(receiver\s*(?:serial\s*(?:number|no\.?|nr\.?)|number))(?:[:\-]|\b)?\s*(.*)$/i);
  if (receiverSerial) {
    fields.receiverSerialNumber = sanitizeNumber(receiverSerial);
  }

  const frameSerial =
    findFirst(text, [
      /frame\s*(?:serial\s*(?:number|no\.?|nr\.?)|number)\s*[:\-]?\s*([A-Z0-9\/\- ]{3,})/i,
    ]) ?? findValueAfterKeyword(lines, /(frame\s*(?:serial\s*(?:number|no\.?|nr\.?)|number))(?:[:\-]|\b)?\s*(.*)$/i);
  if (frameSerial) {
    fields.frameSerialNumber = sanitizeNumber(frameSerial);
  }

  const totalPossible = 9;
  const found = Object.values(fields).filter(Boolean).length;

  return {
    fields,
    quality: toQuality(found, totalPossible),
  };
}
