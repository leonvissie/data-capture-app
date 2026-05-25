import { Application, Profile, Firearm } from '../../data/types';

export function digitsOnly(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\D/g, '')
    : '';
}

export function splitDialAndNumber(phone: unknown) {
  const digits = digitsOnly(phone);
  if (!digits) return { dial: '', number: '' };
  return {
    dial: digits.slice(0, 3),
    number: digits.slice(3),
  };
}

export function formatCellPhone(phone: unknown): string {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeWhitespace(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  if (typeof value === 'number') return true;
  return String(value).trim().length > 0;
}

export function hasAnyMeaningfulData(data: Record<string, any>): boolean {
  return Object.values(data).some(hasMeaningfulValue);
}

function findSplitPoint(text: string, limit: number) {
  if (!text) return 0;
  if (text.length <= limit) return text.length;
  const cut = text.lastIndexOf(' ', limit);
  if (cut === -1) return limit;
  return cut;
}

export function splitAddressLines(
  singleLine: unknown,
  opts: { line1Split?: number; maxLength?: number } = {}
): { line1: string; line2: string } {
  const maxLength = opts.maxLength && opts.maxLength > 0 ? opts.maxLength : undefined;
  const limit = opts.line1Split && opts.line1Split > 0 ? opts.line1Split : 68;
  let normalized = normalizeWhitespace(singleLine);
  if (!normalized) {
    return { line1: '', line2: '' };
  }

  if (maxLength && normalized.length > maxLength) {
    const cut = findSplitPoint(normalized, maxLength);
    normalized = normalized.slice(0, cut).trim();
  }

  if (normalized.length <= limit) {
    return { line1: normalized, line2: '' };
  }

  const splitAt = findSplitPoint(normalized, limit);
  const line1 = normalized.slice(0, splitAt).trim();
  const line2 = normalized.slice(splitAt).trim();
  return { line1, line2 };
}

export function applyAddressWithPostalFallback(
  data: Record<string, any>,
  profile: Profile | null | undefined,
  addressCfg: { line1Split?: number; maxLength?: number } = {},
  postalAddressFallbackText?: string
) {
  const resSource = profile?.address?.singleLine ?? data.resAddress;
  if (resSource) {
    const { line1, line2 } = splitAddressLines(resSource, addressCfg);
    data.resAddress = line1;
    data.resAddress2 = line2;
  }

  const postSource = profile?.addressPostal?.singleLine ?? data.postAddress;
  if (postSource) {
    const { line1, line2 } = splitAddressLines(postSource, addressCfg);
    data.postAddress = line1;
    data.postAddress2 = line2;
  }

  if (!hasMeaningfulValue(data.postPostal) && profile?.addressPostal?.postCode) {
    data.postPostal = profile.addressPostal.postCode;
  }

  const hasPostalAddress =
    hasMeaningfulValue(data.postAddress) ||
    hasMeaningfulValue(data.postAddress2) ||
    hasMeaningfulValue(profile?.addressPostal?.singleLine);
  if (!hasPostalAddress) {
    const fallback = normalizeWhitespace(postalAddressFallbackText);
    if (!fallback) return;
    const { line1, line2 } = splitAddressLines(fallback, addressCfg);
    data.postAddress = line1;
    data.postAddress2 = line2;
  }
}

export function collectStoredFormData(application: Application): Record<string, any> {
  const collected: Record<string, any> = {};
  const visited = new Set<any>();

  const mergeRecord = (record: any) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    if (visited.has(record)) return;
    visited.add(record);

    if (record?.data && typeof record.data === 'object') {
      mergeRecord(record.data);
    }

    Object.entries(record).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') return;
      if (!(key in collected)) {
        collected[key] = value;
      }
    });
  };

  const candidates = new Set<string>([
    'formData',
    'formValues',
    'formState',
    'form',
    'pdfData',
    'pdfValues',
    'pdfFieldValues',
    'wizardState',
    'wizardData',
    'applicationData',
    `form${application.form}`,
    `form${String(application.form).toUpperCase()}`,
    `${application.form}Form`,
    `${application.form}Data`,
    `formData${application.form}`,
    `formData${String(application.form).toUpperCase()}`,
  ]);

  candidates.forEach((prop) => {
    const value = (application as any)[prop];
    mergeRecord(value);
    if (value && typeof value === 'object') {
      const keyed = (value as any)[application.form];
      if (keyed) mergeRecord(keyed);
    }
  });

  const nested = (application as any).formData?.[application.form];
  if (nested) mergeRecord(nested);

  return collected;
}

export function deriveInitials(profile?: Profile | null) {
  if (!profile) return '';
  const source = profile.initials || profile.givenNames || profile.surname;
  if (!source) return '';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function applyProfileDefaults(data: Record<string, any>, profile: Profile | null | undefined) {
  if (!profile) return;
  data.surname = data.surname ?? profile.surname;
  data.fullNames = data.fullNames ?? profile.givenNames;
  data.initials = data.initials ?? profile.initials ?? deriveInitials(profile);

  const idType = (profile.idType ?? '').toUpperCase();
  if (!data.idType && idType) {
    data.idType =
      idType === 'ID_CARD' || idType === 'ID_BOOK'
        ? 'sa_id'
        : idType === 'PASSPORT'
        ? 'passport'
        : idType.toLowerCase();
  }
  if (!data.saId && (idType === 'ID_CARD' || idType === 'ID_BOOK') && profile.idNumber) {
    data.saId = profile.idNumber;
  }
  if (!data.passportNo && idType === 'PASSPORT' && profile.idNumber) {
    data.passportNo = profile.idNumber;
  }

  data.email = data.email ?? profile.email ?? '';
  data.homePhone = data.homePhone ?? profile.homePhone ?? '';
  data.workPhone = data.workPhone ?? profile.workPhone ?? '';
  data.cellPhone = hasMeaningfulValue(data.cellPhone)
    ? formatCellPhone(data.cellPhone)
    : formatCellPhone(profile.mobile ?? '');
  data.fax = data.fax ?? '';

  const address = profile.address;
  if (address) {
    if (!hasMeaningfulValue(data.resAddress) && address.singleLine) {
      data.resAddress = address.singleLine;
    }
    // if (!hasMeaningfulValue(data.postAddress) && formatted) {
    //   data.postAddress = formatted;
    // }
    if (!hasMeaningfulValue(data.resPostal) && address.postCode) {
      data.resPostal = address.postCode;
    }
    // if (!hasMeaningfulValue(data.postPostal) && address.postCode) {
    //   data.postPostal = address.postCode;
    // }
  }
}

export function applyFirearmDefaults(data: Record<string, any>, firearms: Firearm[]) {
  if (!Array.isArray(firearms) || !firearms.length) return;
  const primary = firearms[0];
  if (!primary) return;

  if (!hasMeaningfulValue(data.origNumber)) {
    const licenceNumber =
      primary.licenseNumber ??
      (primary as any).licenceNumber ??
      primary.firearmSerialNumber ??
      null;
    if (licenceNumber) {
      data.origNumber = licenceNumber;
    }
  }

  if (!hasMeaningfulValue(data.origIssued) && primary.validFrom) {
    data.origIssued = primary.validFrom;
  }

  if (!hasMeaningfulValue(data.origExpiry) && primary.validTo) {
    data.origExpiry = primary.validTo;
  }
}

type DeriveOptions = {
  yesToken?: string;
  noToken?: string;
};

export function deriveCommonFields(
  data: Record<string, any>,
  options: DeriveOptions = {}
): Record<string, string> {
  const yesToken = (options.yesToken ?? 'YES').toUpperCase();
  const noToken = (options.noToken ?? 'NO').toUpperCase();

  const derived: Record<string, string> = {};

  const saIdDigits = digitsOnly(data.saId);
  if (saIdDigits.length === 13) {
    derived.saId1 = saIdDigits.slice(0, 6);
    derived.saId2 = saIdDigits.slice(6, 10);
    derived.saId3 = saIdDigits.slice(10, 12);
    derived.saId4 = saIdDigits.slice(12, 13);
  } else {
    derived.saId1 = '';
    derived.saId2 = '';
    derived.saId3 = '';
    derived.saId4 = '';
  }

  const home = splitDialAndNumber(data.homePhone);
  const work = splitDialAndNumber(data.workPhone);
  const fax = splitDialAndNumber(data.fax);
  derived.homeDial = home.dial;
  derived.homeNumber = home.number;
  derived.workDial = work.dial;
  derived.workNumber = work.number;
  derived.faxDial = fax.dial;
  derived.faxNumber = fax.number;

  const idType = String(data.idType || '').toLowerCase();
  derived.idTypeSAID = idType === 'sa_id' ? 'X' : '';
  derived.idTypePassport = idType === 'passport' ? 'X' : '';
  derived.idTypePR = idType === 'pr' || idType === 'permanent_resident' ? 'X' : '';

  const fullNames = normalizeWhitespace(data.fullNames);
  const surname = normalizeWhitespace(data.surname);
  derived.fullNameSurname = [fullNames, surname].filter(Boolean).join(' ').trim();

  const markYes = (value: unknown) => String(value || '').toUpperCase() === yesToken;
  const markNo = (value: unknown) => String(value || '').toUpperCase() === noToken;

  derived.q37yes = markYes(data.q37) ? 'X' : '';
  derived.q37no = markNo(data.q37) ? 'X' : '';
  derived.q38yes = markYes(data.q38) ? 'X' : '';
  derived.q38no = markNo(data.q38) ? 'X' : '';
  derived.q39yes = markYes(data.q39) ? 'X' : '';
  derived.q39no = markNo(data.q39) ? 'X' : '';

  const q37Lines = wrapReason(data.q37Reason, [68, 100, 100, 100]);
  [derived.q37r1, derived.q37r2, derived.q37r3, derived.q37r4] = q37Lines;

  const q38Lines = wrapReason(data.q38Reason, [68, 100, 100]);
  [derived.q38r1, derived.q38r2, derived.q38r3] = q38Lines;

  const q39Lines = wrapReason(data.q39Reason, [68, 100, 100, 100]);
  [derived.q39r1, derived.q39r2, derived.q39r3, derived.q39r4] = q39Lines;

  return derived;
}

function wrapReason(text: unknown, limits: number[]): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return limits.map(() => '');
  let remaining = normalized;
  const lines: string[] = [];

  const takeChunk = (limit: number) => {
    if (!remaining) {
      lines.push('');
      return;
    }
    if (remaining.length <= limit) {
      lines.push(remaining);
      remaining = '';
      return;
    }
    let cut = remaining.lastIndexOf(' ', limit);
    if (cut === -1) {
      cut = limit;
    }
    const part = remaining.slice(0, cut).trim();
    lines.push(part);
    remaining = remaining.slice(cut).trim();
  };

  limits.forEach((limit, index) => {
    takeChunk(limit);
    if (index === limits.length - 1 && remaining) {
      const last = lines[lines.length - 1] ?? '';
      if (last.length >= 5) {
        lines[lines.length - 1] = `${last.slice(0, last.length - 5)}[...]`;
      } else {
        lines[lines.length - 1] = '[...]';
      }
    }
  });

  return lines.slice(0, limits.length);
}
