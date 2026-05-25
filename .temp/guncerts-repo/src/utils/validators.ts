import { normalizeSaIdNumber } from './saIdentity';

export function validateName(v: string): string | null {
  if (!v || v.length < 2) return 'Please enter at least 2 characters.';
  if (!/^[A-Za-z' -]+$/.test(v)) return "Only letters, spaces, hyphens and apostrophes are allowed. e.g. “Jane Mary”";
  return null;
}

export function validateEmail(v: string): string | null {
  if (!v) return 'Email cannot be empty. Please provide a valid email e.g. jane@example.com';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(v) ? null : 'Please enter a valid email e.g. jane@example.com';
}

export function validatePhone(v: string): string | null {
  if (!v) return 'Phone cannot be empty. Please enter a valid phone number e.g. +27821234567 or 0821234567';
  // allow spaces, dashes, parentheses in input by stripping them for validation
  const s = v.trim().replace(/[()\s-]/g, '');
  // Accept SA numbers as +27XXXXXXXXX (9 digits after +27) or local 0XXXXXXXXX (10 digits incl. leading 0)
  if (/^\+27\d{9}$/.test(s) || /^0\d{9}$/.test(s)) {
    return null;
  }
  return 'Invalid phone number. Please use one of the following formats e.g. +27821234567 or 0821234567';
}

export function validateSAId(v: string): string | null {
  const normalized = normalizeSaIdNumber(v);
  if (normalized.length !== 13) {
    return 'SA ID must be exactly 13 digits. e.g. 8001015009087';
  }

  // if (!/^\d{13}$/.test(v)) return 'SA ID must be exactly 13 digits. e.g. 8001015009087';
  // Luhn check
  let sum = 0, alt = false;
  for (let i = normalized.length - 1; i >= 0; i--) {
    let n = parseInt(normalized[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return (sum % 10 === 0) ? null : 'Invalid SA ID checksum. Please check your ID number';
}

export function validateAddressSingleLine(v: string): string | null {
  if (!v || v.trim().length < 5) return 'Please enter a valid address line, e.g. 123 Main Rd, Suburb';
  return null;
}

export function validatePostCode(v: string): string | null {
  if (!v) return 'Postcode cannot be empty. e.g. 8001';
  if (!/^\d{4}$/.test(v.trim())) return 'Invalid SA postcode. Use 4 digits, e.g. 8001';
  return null;
}
