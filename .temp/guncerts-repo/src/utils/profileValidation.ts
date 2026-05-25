import { Profile } from '../data/types';

export type MissingKey =
  | 'givenNames'
  | 'surname'
  | 'initials'
  | 'idType'
  | 'isForeignNational'
  | 'idNumber'
  | 'email'
  | 'mobile'
  | 'address.singleLine'
  | 'address.postCode'
  | 'addressPostal.singleLine'
  | 'addressPostal.postCode';

const LABELS: Record<MissingKey, string> = {
  givenNames: 'Full Names',
  surname: 'Surname',
  initials: 'Initials',
  idType: 'ID Type',
  isForeignNational: 'Foreign national status',
  idNumber: 'ID/Passport number',
  email: 'Email',
  mobile: 'Cellphone',
  'address.singleLine': 'Residential address',
  'address.postCode': 'Residential postcode',
  'addressPostal.singleLine': 'Postal address',
  'addressPostal.postCode': 'Postal postcode',
};

type ProfileLike = Pick<
  Profile,
  | 'givenNames'
  | 'surname'
  | 'initials'
  | 'idType'
  | 'isForeignNational'
  | 'idNumber'
  | 'email'
  | 'mobile'
  | 'hasPostalAddress'
> & {
  address?: Profile['address'];
  addressPostal?: Profile['addressPostal'];
};

const hasValue = (value?: string | null) => typeof value === 'string' && value.trim().length > 0;

export const getMissingProfileFields = (profile: ProfileLike | null | undefined): MissingKey[] => {
  if (!profile) return ['email', 'mobile'];

  const missing: MissingKey[] = [];
  if (!hasValue(profile.email)) missing.push('email');
  if (!hasValue(profile.mobile)) missing.push('mobile');
  return missing;
};

export const getMissingProfileFieldLabels = (profile: ProfileLike | null | undefined): string[] =>
  getMissingProfileFields(profile).map((key) => LABELS[key]);
