import policy517g from '../policy/517g.json';
import { RawLicenceType } from '../policy/licenceTypes';

export type CertTypeOption = {
  code: string;
  label: string;
  status?: string;
};

const FALLBACK_COMPETENCY_CERT_TYPES: CertTypeOption[] = [
  { code: '1.1', label: 'Possess a Firearm', status: 'active' },
  { code: '1.2', label: 'Trade in Firearms', status: 'active' },
  { code: '1.3', label: 'Manufacture Firearms', status: 'active' },
  { code: '1.4', label: 'Conduct Business as a Gunsmith', status: 'active' },
  { code: '1.5', label: 'Possess a firearm as a private collector', status: 'active' },
];

type PolicyJson = { licenceTypes?: Record<string, RawLicenceType> };

const POLICY_LICENCE_TYPES = (policy517g as PolicyJson).licenceTypes;

const NORMALIZED_LICENCE_TYPES = Object.entries(POLICY_LICENCE_TYPES ?? {})
  .map(([code, value]) => {
    if (typeof value === 'string') {
      return {
        code,
        label: value,
        status: undefined,
      };
    }
    const shortName = typeof value.shortName === 'string' ? value.shortName : value.shortname;
    return {
      code,
      label: typeof shortName === 'string' ? shortName : undefined,
      status: typeof value.status === 'string' ? value.status : undefined,
    };
  })
  .filter((entry) => entry.label);

export const competencyCertTypes: CertTypeOption[] = NORMALIZED_LICENCE_TYPES.length
  ? (NORMALIZED_LICENCE_TYPES as CertTypeOption[])
  : FALLBACK_COMPETENCY_CERT_TYPES;

export const competencyCertTypeMap: Record<string, string> = competencyCertTypes.reduce(
  (acc, option) => {
    acc[option.code] = option.label;
    return acc;
  },
  {} as Record<string, string>
);
