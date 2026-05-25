import policy517g from '../policy/517g.json';
import policy518a from '../policy/518a.json';
import policy517 from '../policy/517.json';
import type { Application } from '../data/types';

type AddressPolicy = { addressLength?: { maxLength?: number | null } } | undefined;

const DEFAULT_MAX_LENGTH = 140;

const addressPolicies: Record<string, AddressPolicy> = {
  '517g': policy517g as any,
  '518a': policy518a as any,
  '517': policy517 as any,
};

const knownLimits = Object.values(addressPolicies)
  .map((p) => Number(p?.addressLength?.maxLength))
  .filter((n) => Number.isFinite(n) && n > 0) as number[];

const minKnownLimit = knownLimits.length ? Math.min(...knownLimits) : DEFAULT_MAX_LENGTH;

export const ADDRESS_TOO_LONG_MESSAGE =
  'The address is too long and might not fit on the application. Please shorten it.';

export function getAddressLengthLimit(form?: Application['form'] | string | null): number {
  if (form && addressPolicies[form]) {
    const limit = Number(addressPolicies[form]?.addressLength?.maxLength);
    if (Number.isFinite(limit) && limit > 0) {
      return limit;
    }
  }
  return minKnownLimit;
}

export function isAddressTooLong(value?: string | null, form?: Application['form'] | string | null): boolean {
  const limit = getAddressLengthLimit(form);
  const length = value?.trim().length ?? 0;
  return length > limit;
}

export function addressTooLongAlertMessage(limit: number, currentLength?: number) {
  const currentText = typeof currentLength === 'number' && Number.isFinite(currentLength)
    ? `Current ${currentLength}; `
    : '';
  return `${ADDRESS_TOO_LONG_MESSAGE} (${currentText}Max ${limit} characters).\n\nSuggestions:\n• Ensure the postcode is excluded\n• Remove extra detail (e.g. if you have the suburb, you don't need the city)\n• Abbreviate where it stays clear`;
}
