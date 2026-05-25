import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView, TextInput } from 'react-native';
import Screen from '../../src/components/Screen';
import { useTones } from '../../src/theme/tones';
import { Profile, ReferenceInfo } from '../../src/data/types';
import { listByType } from '../../src/data/sqlite';
import { persist, touch, withMeta } from '../../src/data/repo';
import { AddressSheet, EditTextSheet, IdDetailsSheet, NameSheet, SelectSheet } from '../../src/components/EditSheet';
import ButtonSave from '../../src/components/ButtonSave';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import {
  validateEmail,
  validateName,
  validatePhone,
  validateSAId,
  validateAddressSingleLine,
  validatePostCode,
} from '../../src/utils/validators';
import { addressTooLongAlertMessage, getAddressLengthLimit, isAddressTooLong } from '../../src/utils/addressLength';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import { backOrReplace, normalizeReturnTo } from '../../src/utils/navigation';
import { useDevMode } from '../../src/providers/DevModeProvider';
import { getMissingProfileFields, type MissingKey } from '../../src/utils/profileValidation';
import { appConfig } from '../../src/config/appConfig';
import { showValidationAlert } from '../../src/utils/validationAlert';
import { getSpouseReference, upsertReference } from '../../src/utils/references';


const EDITABLE_FIELDS = [
  'givenNames',
  'initials',
  'surname',
  'idType',
  'idNumber',
  'email',
  'mobile',
  'homePhone',
  'workPhone',
  'address.singleLine',
  'address.postCode',
  'addressPostal.singleLine',
  'addressPostal.postCode',
] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

const FIELD_LABELS: Record<EditableField, string> = {
  givenNames: 'Full Names',
  initials: 'Initials',
  surname: 'Surname',
  idType: 'ID Type',
  idNumber: 'ID Number',
  email: 'Email',
  mobile: 'Cellphone',
  homePhone: 'Home phone',
  workPhone: 'Work phone',
  'address.singleLine': 'Single-line address',
  'address.postCode': 'Postcode',
  'addressPostal.singleLine': 'Postal address',
  'addressPostal.postCode': 'Postal postcode',
};
const HAS_POSTAL_LABEL = 'Has postal address';
const CONTACT_FIELDS = ['email', 'mobile', 'homePhone', 'workPhone'] as const;
type ContactField = typeof CONTACT_FIELDS[number];
const EMPLOYMENT_FIELDS = [
  'tradeOrProfession',
  'selfEmployedDetail',
  'employerName',
  'businessAddressLine1',
  'businessAddressLine2',
  'businessAddressCity',
  'businessAddressPostCode',
] as const;
type EmploymentField = typeof EMPLOYMENT_FIELDS[number];
type SpouseField = 'fullNames' | 'idNumber' | 'mobile';

const normalizeValue = (value?: string | null) => value ?? '';
const normalizeAddressValue = (value?: string | null) => (value ?? '').trim();
const formatTitleCaseWithHyphen = (value: string) =>
  value
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
const formatSaIdDisplay = (digits: string) =>
  `${digits.slice(0, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 12)} ${digits.slice(12, 13)}`;
const normalizePartner = (ref?: ReferenceInfo | null) => ({
  fullNames: ref?.fullNames ?? '',
  idNumber: ref?.idNumber ?? '',
  mobile: ref?.mobile ?? '',
  type: ref?.type ?? '',
  since: ref?.since ?? '',
  address: ref?.address ?? '',
});

const normalizeEmployment = (profile?: Profile | null) => ({
  tradeOrProfession: profile?.employment?.tradeOrProfession ?? '',
  selfEmployedDetail: profile?.employment?.selfEmployedDetail ?? '',
  employerName: profile?.employment?.employerName ?? '',
  employerAddressLine1: profile?.employment?.employerAddress?.line1 ?? '',
  employerAddressLine2: profile?.employment?.employerAddress?.line2 ?? '',
  employerAddressSuburb: profile?.employment?.employerAddress?.suburb ?? '',
  employerAddressCity: profile?.employment?.employerAddress?.city ?? '',
  employerAddressPostCode: profile?.employment?.employerAddress?.postCode ?? '',
});

const addressSignature = (address?: Profile['address']) => {
  if (!address) return '';
  return [
    normalizeAddressValue(address.line1),
    normalizeAddressValue(address.line2),
    normalizeAddressValue(address.suburb),
    normalizeAddressValue(address.city),
    normalizeAddressValue(address.postCode),
    normalizeAddressValue(address.singleLine),
  ].join('|');
};

const cloneProfile = (profile: Profile | null): Profile => {
  if (profile) {
    return {
      ...profile,
      address: profile.address ? { ...profile.address } : undefined,
      addressPostal: profile.addressPostal ? { ...profile.addressPostal } : undefined,
      references: Array.isArray(profile.references) ? [...profile.references] : undefined,
    };
  }
  return withMeta<Profile>({
    id: globalThis.crypto?.randomUUID?.() ?? `prof_${Math.random().toString(36).slice(2)}`,
    type: 'Profile',
  } as Profile);
};

const sanitizeInitials = (value?: string | null) => {
  if (!value) return undefined;
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters ? letters.toUpperCase() : undefined;
};

const deriveInitialsFromNames = (names?: string) => {
  if (!names) return undefined;
  const parts = names
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part[0] ?? '');
  if (!parts.length) return undefined;
  return sanitizeInitials(parts.join(''));
};

const readField = (profile: Profile | null, field: EditableField): string | undefined => {
  if (!profile) return undefined;
  switch (field) {
    case 'givenNames':
      return profile.givenNames ?? undefined;
    case 'surname':
      return profile.surname ?? undefined;
    case 'initials':
      return profile.initials ?? undefined;
    case 'idNumber':
      return profile.idNumber ?? undefined;
    case 'email':
      return profile.email ?? undefined;
    case 'mobile':
      return profile.mobile ?? undefined;
    case 'homePhone':
      return profile.homePhone ?? undefined;
    case 'workPhone':
      return profile.workPhone ?? undefined;
    case 'address.singleLine':
      return profile.address?.singleLine ?? undefined;
    case 'address.postCode':
      return profile.address?.postCode ?? undefined;
    case 'addressPostal.singleLine':
      return profile.addressPostal?.singleLine ?? undefined;
    case 'addressPostal.postCode':
      return profile.addressPostal?.postCode ?? undefined;
    case 'idType':
      return profile.idType ?? undefined;
    default:
      return undefined;
  }
};

const applyField = (profile: Profile, field: EditableField, value: string | undefined): Profile => {
  const next: Profile = {
    ...profile,
    address: profile.address ? { ...profile.address } : undefined,
    addressPostal: profile.addressPostal ? { ...profile.addressPostal } : undefined,
  };

  if (field.startsWith('address.')) {
    const [, addrKey] = field.split('.');
    const nextAddress = { ...(next.address ?? {}) } as Record<string, string | undefined>;
    if (value === undefined) {
      delete nextAddress[addrKey];
    } else {
      nextAddress[addrKey] = value;
    }
    const hasAddressValues = Object.values(nextAddress).some(v => v !== undefined && v !== '');
    next.address = hasAddressValues ? (nextAddress as typeof next.address) : undefined;
    return next;
  }

  if (field.startsWith('addressPostal.')) {
    const [, addrKey] = field.split('.');
    const nextAddress = { ...(next.addressPostal ?? {}) } as Record<string, string | undefined>;
    if (value === undefined) {
      delete nextAddress[addrKey];
    } else {
      nextAddress[addrKey] = value;
    }
    const hasAddressValues = Object.values(nextAddress).some(v => v !== undefined && v !== '');
    next.addressPostal = hasAddressValues ? (nextAddress as typeof next.addressPostal) : undefined;
    return next;
  }

  switch (field) {
    case 'givenNames':
      next.givenNames = value;
      break;
    case 'initials':
      next.initials = value;
      break;
    case 'surname':
      next.surname = value;
      break;
    case 'idNumber':
      next.idNumber = value;
      break;
    case 'email':
      next.email = value;
      break;
    case 'mobile':
      next.mobile = value;
      break;
    case 'homePhone':
      next.homePhone = value;
      break;
    case 'workPhone':
      next.workPhone = value;
      break;
    case 'idType':
      next.idType = value as Profile['idType'];
      break;
    default:
      break;
  }
  return next;
};

const ContactInputCell = ({
  label,
  value,
  onChangeText,
  onBlur,
  inputRef,
  required,
  error,
  keyboardType,
  autoCapitalize,
  styles,
  neutral,
}: {
  label: string;
  value?: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  inputRef: (ref: TextInput | null) => void;
  required?: boolean;
  error?: boolean;
  keyboardType: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  autoCapitalize: 'none' | 'words' | 'characters';
  styles: ReturnType<typeof createStyles>;
  neutral: ReturnType<typeof useTones>['grey'];
}) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={[styles.label, required && styles.requiredLabel]}>{required ? `${label} *` : label}</Text>
    <View style={[styles.cell, error && styles.cellError]}>
      <TextInput
        ref={inputRef}
        style={[styles.inlineInput, error && styles.errorText]}
        value={value ?? ''}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder="Tap to add"
        placeholderTextColor={neutral.border}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={label === 'Email' ? 'emailAddress' : 'telephoneNumber'}
      />
    </View>
  </View>
);

export default function ProfileEditScreen() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const params = useLocalSearchParams<{ section?: string | string[]; returnTo?: string | string[]; intro?: string | string[]; focusField?: string | string[] }>();
  const returnPath = useMemo(
    () => normalizeReturnTo(params.returnTo, '/(tabs)/profile' as any),
    [params.returnTo]
  );
  const focusField = useMemo(() => {
    const raw = params.focusField;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? `${value}` : null;
  }, [params.focusField]);
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);
  const initialSection = useMemo(() => {
    const raw = params.section;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? `${value}` : null;
  }, [params.section]);
  const { devModeEnabled } = useDevMode();
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionPositions = useRef<Record<string, number>>({});
  const pendingSection = useRef<string | null>(initialSection);
  const goProfile = useCallback(
    () => {
      if (introFlag) {
        router.replace({ pathname: returnPath, params: { intro: introFlag } } as any);
        return;
      }
      backOrReplace(router, returnPath);
    },
    [introFlag, returnPath, router],
  );

  const initialFromStore = useMemo(() => listByType<Profile>('Profile')[0] ?? null, []);
  const initialHasPostal = initialFromStore?.hasPostalAddress ?? !!initialFromStore?.addressPostal;
  const [initialProfile, setInitialProfile] = useState<Profile | null>(initialFromStore);
  const [draft, setDraft] = useState<Profile>(cloneProfile(initialFromStore));
  const [hasPostalAddress, setHasPostalAddress] = useState<boolean>(initialHasPostal);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const initialMissingAllRequiredRef = useRef<boolean | null>(null);
  const shouldValidate = appConfig.features.enableValidation && !devModeEnabled;
  const missingQueueRef = useRef<MissingKey[]>([]);
  const missingFlowActiveRef = useRef(false);
  const draftRef = useRef<Profile>(draft);
  const continueMissingFlowRef = useRef<() => void>(() => {});
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const focusHandledRef = useRef(false);
  const contactInputRefs = useRef<Record<ContactField, TextInput | null>>({
    email: null,
    mobile: null,
    homePhone: null,
    workPhone: null,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [employmentErrors, setEmploymentErrors] = useState<Partial<Record<EmploymentField, string>>>({});
  const [spouseErrors, setSpouseErrors] = useState<Partial<Record<SpouseField, string>>>({});

  type AddressSheetKey = 'address' | 'addressPostal';
  type SheetState =
    | { type: 'text'; key: Exclude<EditableField, 'idType'>; title: string }
    | { type: 'select'; key: 'idType'; title: string }
    | { type: 'idDetails'; title: string }
    | { type: 'address'; key: AddressSheetKey; title: string }
    | { type: 'names'; title: string };
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [editingInitial, setEditingInitial] = useState<string | undefined>(undefined);
  const scrollToSection = useCallback(
    (key: string, animated: boolean) => {
      const y = sectionPositions.current[key];
      if (y === undefined) {
        pendingSection.current = key;
        return;
      }
      scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated });
      pendingSection.current = null;
    },
    [],
  );

  useEffect(() => {
    if (initialSection) {
      scrollToSection(initialSection, true);
    }
  }, [initialSection, scrollToSection]);

  const openText = useCallback(
    (key: Exclude<EditableField, 'idType'>, title: string, initial?: string) => {
      setEditingInitial(initial ?? readField(draft, key) ?? '');
      setSheet({ key, title, type: 'text' });
    },
    [draft],
  );

  const openAddress = useCallback(
    (key: AddressSheetKey, title: string) => {
      setSheet({ key, title, type: 'address' });
    },
    [],
  );
  const barcodeLocked = !!draft.idBarcodeExtracted;
  const alertBarcodeLocked = useCallback(() => {
    Alert.alert(
      'Profile locked',
      'Your name and ID number were captured from your ID barcode. Update your ID photos to change them.',
    );
  }, []);
  const openNames = useCallback(() => {
    if (barcodeLocked) {
      alertBarcodeLocked();
      return;
    }
    setSheet({ title: 'Full names', type: 'names' });
  }, [alertBarcodeLocked, barcodeLocked]);

  const validateContactField = useCallback((key: ContactField, rawValue?: string | null) => {
    const trimmed = rawValue?.trim() ?? '';
    if (!trimmed) return null;
    return key === 'email' ? validateEmail(trimmed) : validatePhone(trimmed);
  }, []);

  const setContactField = useCallback((key: ContactField, value: string) => {
    setDraft(prev => applyField(prev, key, value || undefined));
    setFieldErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleContactBlur = useCallback((key: ContactField) => {
    const error = validateContactField(key, readField(draftRef.current, key));
    setFieldErrors(prev => {
      if (!error) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === error) return prev;
      return { ...prev, [key]: error };
    });
  }, [validateContactField]);

  const focusContactField = useCallback((key: ContactField) => {
    const sectionKey = key === 'mobile' ? 'cellphone' : key;
    scrollToSection(sectionKey, true);
    setTimeout(() => contactInputRefs.current[key]?.focus(), 150);
  }, [scrollToSection]);

  const validateAllContactFields = useCallback(() => {
    const nextErrors: Partial<Record<ContactField, string>> = {};
    CONTACT_FIELDS.forEach((key) => {
      const error = validateContactField(key, readField(draftRef.current, key));
      if (error) nextErrors[key] = error;
    });
    setFieldErrors(nextErrors);
    return nextErrors;
  }, [validateContactField]);

  const setEmploymentField = useCallback((key: EmploymentField, value: string) => {
    setDraft((prev) => {
      const employment = { ...(prev.employment ?? {}), employerAddress: { ...(prev.employment?.employerAddress ?? {}) } };
      if (key === 'tradeOrProfession') employment.tradeOrProfession = value || undefined;
      if (key === 'selfEmployedDetail') employment.selfEmployedDetail = value || undefined;
      if (key === 'employerName') employment.employerName = value || undefined;
      if (key === 'businessAddressLine1') employment.employerAddress.line1 = value || undefined;
      if (key === 'businessAddressLine2') employment.employerAddress.line2 = value || undefined;
      if (key === 'businessAddressCity') employment.employerAddress.city = value || undefined;
      if (key === 'businessAddressPostCode') employment.employerAddress.postCode = value || undefined;
      return { ...prev, employment };
    });
    setEmploymentErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleEmploymentBlur = useCallback((key: EmploymentField) => {
    let error: string | null = null;
    const employment = draftRef.current.employment;
    const value = (
      key === 'tradeOrProfession'
        ? employment?.tradeOrProfession
        : key === 'selfEmployedDetail'
          ? employment?.selfEmployedDetail
          : key === 'employerName'
            ? employment?.employerName
            : key === 'businessAddressLine1'
              ? employment?.employerAddress?.line1
              : key === 'businessAddressLine2'
                ? employment?.employerAddress?.line2
                : key === 'businessAddressCity'
                  ? employment?.employerAddress?.city
                  : employment?.employerAddress?.postCode
    )?.trim() ?? '';
    if (!value) error = null;
    else if (key === 'businessAddressPostCode') error = validatePostCode(value);
    setEmploymentErrors((prev) => {
      if (!error) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: error };
    });
  }, []);

  const setSpouseField = useCallback((key: SpouseField, value: string) => {
    const spouseFullNames = key === 'fullNames' ? formatTitleCaseWithHyphen(value) : undefined;
    const trimmed = value.trim();
    setDraft((prev) => {
      const current = getSpouseReference(prev);
      const nextRef: ReferenceInfo = {
        relationshipCategory: 'spouse',
        relationshipDetail: current?.relationshipDetail,
        type: current?.type,
        fullNames: key === 'fullNames' ? (spouseFullNames || undefined) : current?.fullNames,
        idNumber: key === 'idNumber' ? (trimmed || undefined) : current?.idNumber,
        mobile: key === 'mobile' ? (trimmed || undefined) : current?.mobile,
      };
      const hasValue = !!(nextRef.fullNames?.trim() || nextRef.idNumber?.trim() || nextRef.mobile?.trim());
      if (!hasValue) {
        return {
          ...prev,
          maritalStatus: undefined,
          references: (prev.references ?? []).filter((ref) => ref.relationshipCategory !== 'spouse'),
        };
      }
      return {
        ...prev,
        maritalStatus: 'married',
        references: upsertReference(prev.references ?? [], nextRef),
      };
    });
    setSpouseErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSpouseBlur = useCallback((key: SpouseField) => {
    const spouse = getSpouseReference(draftRef.current);
    const value = (key === 'fullNames' ? spouse?.fullNames : key === 'idNumber' ? spouse?.idNumber : spouse?.mobile)?.trim() ?? '';
    let error: string | null = null;
    if (value) {
      if (key === 'fullNames') error = validateName(value);
      if (key === 'idNumber') {
        const compact = value.replace(/\s+/g, '');
        const isSaId = /^\d{13}$/.test(compact);
        const isPassport = /^[A-Za-z0-9]{1,11}$/.test(compact);
        if (!isSaId && !isPassport) {
          error = 'Enter a valid SA ID (13 digits) or passport number (letters/numbers, max 11).';
        } else {
          const normalized = isSaId ? formatSaIdDisplay(compact) : compact.toUpperCase();
          if (normalized !== spouse?.idNumber) {
            setDraft((prev) => ({
              ...prev,
              maritalStatus: 'married',
              references: upsertReference(prev.references ?? [], {
                ...(getSpouseReference(prev) ?? {}),
                relationshipCategory: 'spouse',
                idNumber: normalized,
              }),
            }));
          }
        }
      }
      if (key === 'mobile') error = validatePhone(value);
    }
    setSpouseErrors((prev) => {
      if (!error) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: error };
    });
  }, []);

  const clearEmploymentDraft = useCallback(() => {
    setDraft((prev) => ({ ...prev, employment: undefined }));
    setEmploymentErrors({});
  }, []);

  const clearSpouseDraft = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      maritalStatus: undefined,
      references: (prev.references ?? []).filter((ref) => ref.relationshipCategory !== 'spouse'),
    }));
    setSpouseErrors({});
  }, []);

  const confirmClearEmploymentDraft = useCallback(() => {
    Alert.alert(
      'Remove employment details?',
      'Are you sure you want to delete the employment details in this form?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: clearEmploymentDraft },
      ],
    );
  }, [clearEmploymentDraft]);

  const confirmClearSpouseDraft = useCallback(() => {
    Alert.alert(
      'Remove spouse details?',
      'Are you sure you want to remove the spouse or partner details in this form?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: clearSpouseDraft },
      ],
    );
  }, [clearSpouseDraft]);

  const validatePartner = useCallback((partner?: ReferenceInfo) => {
    const fullNames = partner?.fullNames?.trim() ?? '';
    const idNumber = partner?.idNumber?.trim() ?? '';
    const hasAnyValue = !!(fullNames || idNumber);
    if (!hasAnyValue) return null;
    const fullNamesError = fullNames ? validateName(fullNames) : null;
    if (fullNamesError) return fullNamesError;
    return null;
  }, []);

  useEffect(() => {
    if (focusHandledRef.current || !focusField) return;
    focusHandledRef.current = true;
    if ((CONTACT_FIELDS as readonly string[]).includes(focusField)) {
      focusContactField(focusField as ContactField);
      return;
    }
    const sectionKey = focusField.startsWith('addressPostal') ? 'postalAddress' : 'residentialAddress';
    const label = FIELD_LABELS[focusField as EditableField] ?? 'Address';
    scrollToSection(sectionKey, true);
    setTimeout(() => {
      if (focusField.startsWith('addressPostal')) {
        openAddress('addressPostal', 'Postal address');
        return;
      }
      if (focusField.startsWith('address.')) {
        openAddress('address', 'Residential address');
        return;
      }
      openText(focusField as Exclude<EditableField, 'idType'>, label, readField(draft, focusField as EditableField) ?? '');
    }, 150);
  }, [draft, focusContactField, focusField, openAddress, openText, scrollToSection]);

  const handleSectionLayout = useCallback(
    (key: string) => (event: any) => {
      sectionPositions.current[key] = event.nativeEvent.layout.y;
      if (pendingSection.current === key) {
        scrollToSection(key, false);
      }
    },
    [scrollToSection],
  );

  const openIdType = useCallback(() => setSheet({ key: 'idType', title: 'Choose ID Type', type: 'select' }), []);
  const openIdDetails = useCallback(() => {
    if (barcodeLocked) {
      alertBarcodeLocked();
      return;
    }
    setSheet({ title: 'ID Details', type: 'idDetails' });
  }, [alertBarcodeLocked, barcodeLocked]);
  const setIsForeignNational = useCallback((value: boolean) => {
    setDraft(prev => ({ ...prev, isForeignNational: value }));
    if (missingFlowActiveRef.current) {
      setTimeout(() => continueMissingFlowRef.current?.(), 0);
    }
  }, []);

  const saveField = useCallback(
    (key: Exclude<EditableField, 'idType'>, value: string) => {
      const trimmed = value.trim();
      let err: string | null = null;
      if (trimmed.length) {
        if (key === 'givenNames' || key === 'surname') err = validateName(trimmed);
        if (key === 'email') err = validateEmail(trimmed);
        if (key === 'mobile' || key === 'homePhone' || key === 'workPhone') err = validatePhone(trimmed);
        if (key === 'idNumber') {
          const idType = draft.idType ?? initialProfile?.idType;
          if (idType === 'ID_CARD' || idType === 'ID_BOOK') err = validateSAId(trimmed);
          if (idType === 'PASSPORT') {
            if (!/^[A-Za-z0-9]{5,20}$/.test(trimmed)) err = 'Passport number should be 5–20 letters/digits, e.g. A1234567';
          }
        }
        if (key === 'address.singleLine' || key === 'addressPostal.singleLine') err = validateAddressSingleLine(trimmed);
        if (key === 'address.postCode' || key === 'addressPostal.postCode') err = validatePostCode(trimmed);
      }

      if (err) {
        Alert.alert('Invalid input', err);
        return;
      }

      const commitSave = () => {
        let nextValue = trimmed.length ? trimmed : undefined;
        if (key === 'initials') {
          nextValue = sanitizeInitials(nextValue);
        }

        setDraft(prev => {
          let updated = applyField(prev, key, nextValue);
          if (key === 'givenNames') {
            updated.initials = deriveInitialsFromNames(nextValue);
          } else if (key === 'initials') {
            updated.initials = nextValue;
          }
          if (!hasPostalAddress) {
            updated.addressPostal = undefined;
            updated.hasPostalAddress = false;
          } else {
            updated.hasPostalAddress = true;
          }
          return updated;
        });
        setSheet(null);
        if (missingFlowActiveRef.current) {
          setTimeout(() => continueMissingFlowRef.current?.(), 0);
        }
      };

      const isAddressField = key === 'address.singleLine' || key === 'addressPostal.singleLine';
      if (isAddressField && isAddressTooLong(trimmed)) {
        const limit = getAddressLengthLimit();
        Alert.alert(
          'Address too long',
          addressTooLongAlertMessage(limit),
          [
            { text: 'Edit', style: 'cancel' },
            { text: 'Continue', onPress: commitSave },
          ],
        );
        return;
      }

      commitSave();
    },
    [draft, hasPostalAddress, initialProfile],
  );

  const saveIdType = useCallback(
    (value: 'ID_CARD' | 'ID_BOOK' | 'PASSPORT') => {
      const previousIdType = draft.idType;
      const previousIdNumber = draft.idNumber;
      const switchingBetweenPassportAndOther =
        (previousIdType === 'PASSPORT' && value !== 'PASSPORT') ||
        (previousIdType !== 'PASSPORT' && value === 'PASSPORT');

      setDraft(prev => {
        const next = applyField(prev, 'idType', value) as Profile;
        if (switchingBetweenPassportAndOther) {
          next.idNumber = undefined;
        }
        return next;
      });

      setSheet(null);

      const idNumberTitle = value === 'PASSPORT' ? 'Passport Number' : 'ID Number';

      if (switchingBetweenPassportAndOther && previousIdNumber) {
        Alert.alert(
          'ID number cleared',
          'Your ID Number was cleared because the ID Type changed. Please enter it again for the new type.',
          [
            {
              text: 'OK',
              onPress: () => {
                setEditingInitial('');
                setSheet({
                  key: 'idNumber',
                  title: idNumberTitle,
                  type: 'text',
                });
              },
            },
          ],
        );
      } else if (!previousIdNumber || previousIdType !== value) {
        openText('idNumber', idNumberTitle, previousIdNumber ?? '');
      }
      if (missingFlowActiveRef.current) {
        setTimeout(() => continueMissingFlowRef.current?.(), 0);
      }
    },
    [draft, openText],
  );

  const saveIdDetails = useCallback(
    (nextIdType: 'ID_CARD' | 'ID_BOOK' | 'PASSPORT', nextIdNumber: string) => {
      const trimmed = nextIdNumber.trim();
      let err: string | null = null;
      if (trimmed.length) {
        if (nextIdType === 'ID_CARD' || nextIdType === 'ID_BOOK') err = validateSAId(trimmed);
        if (nextIdType === 'PASSPORT') {
          if (!/^[A-Za-z0-9]{5,20}$/.test(trimmed)) err = 'Passport number should be 5–20 letters/digits, e.g. A1234567';
        }
      }

      if (err) {
        Alert.alert('Invalid input', err);
        return;
      }

      const previousIdType = draft.idType;
      const previousIdNumber = draft.idNumber?.trim() ?? '';
      const switchingBetweenPassportAndOther =
        (previousIdType === 'PASSPORT' && nextIdType !== 'PASSPORT') ||
        (previousIdType !== 'PASSPORT' && nextIdType === 'PASSPORT');

      if (switchingBetweenPassportAndOther && trimmed && trimmed === previousIdNumber) {
        Alert.alert('Update ID number', 'Please enter your ID number for the selected ID type.');
        return;
      }

      setDraft(prev => {
        const next = applyField(prev, 'idType', nextIdType) as Profile;
        next.idNumber = trimmed.length ? trimmed : undefined;
        return next;
      });
      setSheet(null);
      if (missingFlowActiveRef.current) {
        setTimeout(() => continueMissingFlowRef.current?.(), 0);
      }
    },
    [draft],
  );

  const buildSingleLineAddress = useCallback((parts: {
    line1: string;
    line2: string;
    suburb: string;
    city: string;
  }) => {
    const items = [parts.line1, parts.line2, parts.suburb, parts.city]
      .map(value => value.trim())
      .filter(Boolean);
    return items.join(', ');
  }, []);

  const saveAddress = useCallback(
    (key: AddressSheetKey, value: {
      line1: string;
      line2: string;
      suburb: string;
      city: string;
      postCode: string;
    }) => {
      const line1 = value.line1.trim();
      const line2 = value.line2.trim();
      const suburb = value.suburb.trim();
      const city = value.city.trim();
      const postCode = value.postCode.trim();

      if (!line1) {
        Alert.alert('Invalid input', 'Line 1 is required.');
        return;
      }
      if (!suburb && !city) {
        Alert.alert('Invalid input', 'Please provide a suburb or city.');
        return;
      }

      const postCodeErr = validatePostCode(postCode);
      if (postCodeErr) {
        Alert.alert('Invalid input', postCodeErr);
        return;
      }

      const singleLine = buildSingleLineAddress({ line1, line2, suburb, city });
      const addressErr = validateAddressSingleLine(singleLine);
      if (addressErr) {
        Alert.alert('Invalid input', addressErr);
        return;
      }

      const commitSave = () => {
        const normalize = (v: string) => (v ? v : undefined);
        setDraft(prev => {
          const next = { ...prev };
          const updated = {
            ...(key === 'address' ? next.address : next.addressPostal),
            line1: normalize(line1),
            line2: normalize(line2),
            suburb: normalize(suburb),
            city: normalize(city),
            postCode: normalize(postCode),
            singleLine: normalize(singleLine),
          };
          if (key === 'address') {
            next.address = updated;
          } else {
            next.addressPostal = updated;
          }
          if (!hasPostalAddress) {
            next.addressPostal = undefined;
            next.hasPostalAddress = false;
          } else {
            next.hasPostalAddress = true;
          }
          return next;
        });
        setSheet(null);
        if (missingFlowActiveRef.current) {
          setTimeout(() => continueMissingFlowRef.current?.(), 0);
        }
      };

      if (isAddressTooLong(singleLine)) {
        const limit = getAddressLengthLimit();
        Alert.alert(
          'Address too long',
          addressTooLongAlertMessage(limit),
          [
            { text: 'Edit', style: 'cancel' },
            { text: 'Continue', onPress: commitSave },
          ],
        );
        return;
      }

      commitSave();
    },
    [buildSingleLineAddress, hasPostalAddress],
  );

  const missingFields = useMemo(() => {
    if (!shouldValidate) return new Set<string>();
    const missing = getMissingProfileFields({ ...draft, hasPostalAddress });
    const next = new Set<string>();
    if (missing.includes('email')) next.add('email');
    if (missing.includes('mobile')) next.add('mobile');
    if (initialMissingAllRequiredRef.current === null) {
      initialMissingAllRequiredRef.current = missing.length > 0;
    }
    if (initialMissingAllRequiredRef.current && !showAllMissing) {
      return new Set<string>();
    }
    return next;
  }, [draft, hasPostalAddress, shouldValidate, showAllMissing]);

  const computeMissingQueue = useCallback((): MissingKey[] => {
    if (!shouldValidate) return [];
    const missing = getMissingProfileFields({ ...draftRef.current, hasPostalAddress });
    const queue: MissingKey[] = [];
    if (missing.includes('email')) queue.push('email');
    if (missing.includes('mobile')) queue.push('mobile');
    return queue;
  }, [hasPostalAddress, shouldValidate]);

  const changedFields = useMemo(() => {
    return EDITABLE_FIELDS.filter(field => {
      const current = normalizeValue(readField(draft, field));
      const initial = normalizeValue(readField(initialProfile, field));
      return current !== initial;
    });
  }, [draft, initialProfile]);

  const hasPostalAddressChanged = hasPostalAddress !== (initialProfile?.hasPostalAddress ?? false);
  const draftSpouseRef = useMemo(() => getSpouseReference(draft), [draft]);
  const initialSpouseRef = useMemo(() => getSpouseReference(initialProfile), [initialProfile]);

  const partnerChanged = useMemo(() => {
    const current = normalizePartner(draftSpouseRef);
    const initial = normalizePartner(initialSpouseRef);
    return (
      current.fullNames !== initial.fullNames ||
      current.idNumber !== initial.idNumber ||
      current.mobile !== initial.mobile ||
      current.type !== initial.type ||
      current.since !== initial.since ||
      current.address !== initial.address
    );
  }, [draftSpouseRef, initialSpouseRef]);

  const hasEmploymentData = useMemo(() => {
    const employment = normalizeEmployment(draft);
    return Object.values(employment).some((value) => `${value ?? ''}`.trim().length > 0);
  }, [draft]);

  const hasSpouseData = useMemo(() => {
    const spouse = normalizePartner(draftSpouseRef);
    return Object.values(spouse).some((value) => `${value ?? ''}`.trim().length > 0);
  }, [draftSpouseRef]);

  const employmentChanged = useMemo(() => {
    const current = normalizeEmployment(draft);
    const initial = normalizeEmployment(initialProfile);
    return (
      current.tradeOrProfession !== initial.tradeOrProfession ||
      current.selfEmployedDetail !== initial.selfEmployedDetail ||
      current.employerName !== initial.employerName ||
      current.employerAddressLine1 !== initial.employerAddressLine1 ||
      current.employerAddressLine2 !== initial.employerAddressLine2 ||
      current.employerAddressSuburb !== initial.employerAddressSuburb ||
      current.employerAddressCity !== initial.employerAddressCity ||
      current.employerAddressPostCode !== initial.employerAddressPostCode
    );
  }, [draft, initialProfile]);

  const changedFieldLabels = useMemo(
    () => [
      ...changedFields.map(field => FIELD_LABELS[field]),
      ...(hasPostalAddressChanged ? [HAS_POSTAL_LABEL] : []),
      ...(employmentChanged ? ['Employment details'] : []),
      ...(partnerChanged ? ['Spouse / partner details'] : []),
    ],
    [changedFields, employmentChanged, hasPostalAddressChanged, partnerChanged],
  );
  const hasUnsavedChanges =
    changedFields.length > 0 || hasPostalAddressChanged || employmentChanged || partnerChanged;

  const openMissingField = useCallback(
    (queue?: MissingKey[]) => {
      const currentQueue = (queue ?? computeMissingQueue()).filter(
        key => key === 'email' || key === 'mobile'
      );
      missingQueueRef.current = currentQueue;
      if (!currentQueue.length) {
        missingFlowActiveRef.current = false;
        return;
      }
      const nextKey = currentQueue[0];
    switch (nextKey) {
      case 'email':
        focusContactField('email');
        return;
      case 'mobile':
        focusContactField('mobile');
        return;
      default:
        return;
    }
    },
    [computeMissingQueue, focusContactField],
  );

  const persistDraft = useCallback(() => {
    const base: Profile = {
      ...draft,
      address: draft.address ? { ...draft.address } : undefined,
      addressPostal: hasPostalAddress ? (draft.addressPostal ? { ...draft.addressPostal } : undefined) : undefined,
      references: Array.isArray(draft.references) ? [...draft.references] : undefined,
      hasPostalAddress,
    };
    const normalized = hasPostalAddress
      ? base
      : { ...base, addressPostal: undefined };
    const residentialAddressChanged =
      addressSignature(normalized.address) !== addressSignature(initialProfile?.address);
    const withAddressReset = residentialAddressChanged
      ? {
          ...normalized,
          address: normalized.address
            ? {
                ...normalized.address,
                province: '',
                homeType: undefined,
                securityMeasures: [],
              }
            : undefined,
        }
      : normalized;
    const next = touch(withAddressReset);
    persist(next);
    setInitialProfile(next);
    setDraft(cloneProfile(next));
    setHasPostalAddress(next.hasPostalAddress ?? false);
    setSheet(null);
    return next;
  }, [draft, hasPostalAddress]);

  const continueMissingFlow = useCallback(() => {
    if (!missingFlowActiveRef.current) return;
    const [, ...rest] = missingQueueRef.current;
    missingQueueRef.current = rest;
    if (rest.length === 0) {
      missingFlowActiveRef.current = false;
      setTimeout(() => {
        persistDraft();
        goProfile();
      }, 0);
      return;
    }
    openMissingField(rest);
  }, [goProfile, openMissingField, persistDraft]);

  const handleSave = useCallback(() => {
    setShowAllMissing(true);
    const contactErrors = validateAllContactFields();
    const firstInvalidContact = CONTACT_FIELDS.find((key) => !!contactErrors[key]);
    if (firstInvalidContact) {
      showValidationAlert({
        items: CONTACT_FIELDS.flatMap((key) => {
          const message = contactErrors[key];
          if (!message) return [];
          return [{ label: FIELD_LABELS[key], message }];
        }),
        onPressOk: () => {
          focusContactField(firstInvalidContact);
        },
      });
      return;
    }
    const partnerError = validatePartner(draftSpouseRef);
    if (partnerError) {
      Alert.alert('Profile incomplete', partnerError, [
        {
          text: 'OK',
          onPress: () => scrollToSection('partnerNames', true),
        },
      ]);
      return;
    }
    if (shouldValidate) {
      const missing = getMissingProfileFields({ ...draft, hasPostalAddress });
      const needsEmail = missing.includes('email');
      const needsMobile = missing.includes('mobile');
      if (needsEmail || needsMobile) {
        Alert.alert(
          'Profile incomplete',
          'You will be prompted to add the missing required fields now.',
          [{ text: 'OK' }],
          { cancelable: false }
        );
        missingQueueRef.current = [needsEmail ? 'email' : null, needsMobile ? 'mobile' : null].filter(Boolean) as MissingKey[];
        missingFlowActiveRef.current = true;
        openMissingField();
        return;
      }
    }
    if (hasUnsavedChanges) {
      persistDraft();
    }
    goProfile();
  }, [draft, focusContactField, goProfile, hasUnsavedChanges, hasPostalAddress, openMissingField, persistDraft, scrollToSection, shouldValidate, validateAllContactFields, validatePartner]);

  useEffect(() => {
    continueMissingFlowRef.current = continueMissingFlow;
  }, [continueMissingFlow]);

  const handleDiscard = useCallback(() => {
    setSheet(null);
    const reset = cloneProfile(initialProfile);
    setDraft(reset);
    const nextHasPostal = initialProfile?.hasPostalAddress ?? false;
    setHasPostalAddress(nextHasPostal);
    goProfile();
  }, [initialProfile, goProfile]);

  const handleClose = useCallback(() => {
    setSheet(null);

    if (!hasUnsavedChanges) {
      goProfile();
      return;
    }

    const message = `You have unsaved changes:\n${changedFieldLabels.map(label => `• ${label}`).join('\n')}`;

    Alert.alert('Unsaved changes', message, [
      { text: 'Discard', style: 'destructive', onPress: handleDiscard },
      { text: 'Save', onPress: handleSave },
    ]);
  }, [changedFieldLabels, handleDiscard, handleSave, goProfile, hasUnsavedChanges]);

  const idTypeLabel =
    draft.idType === 'ID_CARD'
      ? 'ID Card'
      : draft.idType === 'ID_BOOK'
      ? 'ID Book'
      : draft.idType === 'PASSPORT'
      ? 'Passport'
      : undefined;

  const handleToggleHasPostal = useCallback(() => {
    setHasPostalAddress(prev => {
      const next = !prev;
      setDraft(current => {
        const updated: Profile = {
          ...current,
          hasPostalAddress: next,
          address: current.address ? { ...current.address } : undefined,
          addressPostal: undefined,
        };
        return updated;
      });
      return next;
    });
  }, []);

  const Cell = ({
    label,
    value,
    onPress,
    required,
    error,
    multiline,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    required?: boolean;
    error?: boolean;
    multiline?: boolean;
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, required && styles.requiredLabel]}>{required ? `${label} *` : label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.cell,
          multiline && styles.cellMultiline,
          error && styles.cellError,
          pressed && { opacity: 0.92 },
        ]}
      >
        <Text
          style={[
            styles.value,
            styles.valueText,
            !value && styles.placeholder,
            error && styles.errorText,
          ]}
          numberOfLines={multiline ? undefined : 2}
          ellipsizeMode="tail"
        >
          {value || 'Tap to add'}
        </Text>
        <Text style={[styles.chev, error && styles.chevError]}>›</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Your profile"
          onClose={handleClose}
          style={styles.header}
          extraActions={
            <ButtonSave
              mode="icon"
              onPress={handleSave}
              disabled={!hasUnsavedChanges}
              iconButtonSize="sm"
              hitSlop={8}
            />
          }
        />
        <PageScrollView contentContainerStyle={styles.content} ref={scrollRef}>
          <Text style={styles.requiredNote}>* Required field</Text>
          {/* <View onLayout={handleSectionLayout('names')}>
            <Cell
              label="Full Names"
              value={
                draft.givenNames || draft.surname || draft.initials
                  ? `${draft.givenNames ?? ''}${draft.initials ? ` (${draft.initials})` : ''}${draft.surname ? ` ${draft.surname}` : ''}`.trim()
                  : undefined
              }
              onPress={openNames}
              required
              error={missingFields.has('givenNames') || missingFields.has('initials') || missingFields.has('surname')}
              multiline
            />
          </View>
          <View onLayout={handleSectionLayout('id')}>
            <Cell
              label={idTypeLabel ? `ID Number: (${idTypeLabel})` : 'ID Number'}
              value={draft.idNumber}
              onPress={openIdDetails}
              required
              error={missingFields.has('idNumber')}
            />
          </View> */}
          <View style={styles.sectionCard} onLayout={handleSectionLayout('contactInfo')}>
            <Text style={styles.sectionTitle}>Contact info</Text>
            <View onLayout={handleSectionLayout('email')}>
              <ContactInputCell
                label="Email"
                value={draft.email}
                onChangeText={(value) => setContactField('email', value)}
                onBlur={() => handleContactBlur('email')}
                inputRef={(ref) => {
                  contactInputRefs.current.email = ref;
                }}
                required
                error={missingFields.has('email') || !!fieldErrors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                styles={styles}
                neutral={neutral}
              />
            </View>
            <View onLayout={handleSectionLayout('cellphone')}>
              <ContactInputCell
                label="Cellphone"
                value={draft.mobile}
                onChangeText={(value) => setContactField('mobile', value)}
                onBlur={() => handleContactBlur('mobile')}
                inputRef={(ref) => {
                  contactInputRefs.current.mobile = ref;
                }}
                required
                error={missingFields.has('mobile') || !!fieldErrors.mobile}
                keyboardType="phone-pad"
                autoCapitalize="none"
                styles={styles}
                neutral={neutral}
              />
            </View>
            <View onLayout={handleSectionLayout('homePhone')}>
              <ContactInputCell
                label="Home phone"
                value={draft.homePhone}
                onChangeText={(value) => setContactField('homePhone', value)}
                onBlur={() => handleContactBlur('homePhone')}
                inputRef={(ref) => {
                  contactInputRefs.current.homePhone = ref;
                }}
                error={!!fieldErrors.homePhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                styles={styles}
                neutral={neutral}
              />
            </View>
            <View onLayout={handleSectionLayout('workPhone')}>
              <ContactInputCell
                label="Work phone"
                value={draft.workPhone}
                onChangeText={(value) => setContactField('workPhone', value)}
                onBlur={() => handleContactBlur('workPhone')}
                inputRef={(ref) => {
                  contactInputRefs.current.workPhone = ref;
                }}
                error={!!fieldErrors.workPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                styles={styles}
                neutral={neutral}
              />
            </View>
          </View>

          <View style={styles.sectionCard} onLayout={handleSectionLayout('employment')}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Employment</Text>
              <IconRoundButton
                buttonType="delete"
                accessibilityLabel="Clear employment details"
                onPress={confirmClearEmploymentDraft}
                disabled={!hasEmploymentData}
                size="sm"
                hitSlop={8}
              />
            </View>
            <ContactInputCell
              label="Trade or profession"
              value={draft.employment?.tradeOrProfession}
              onChangeText={(value) => setEmploymentField('tradeOrProfession', value)}
              onBlur={() => handleEmploymentBlur('tradeOrProfession')}
              inputRef={() => {}}
              error={!!employmentErrors.tradeOrProfession}
              keyboardType="default"
              autoCapitalize="words"
              styles={styles}
              neutral={neutral}
            />
            <ContactInputCell
              label="Self-employed details (if applicable)"
              value={draft.employment?.selfEmployedDetail}
              onChangeText={(value) => setEmploymentField('selfEmployedDetail', value)}
              onBlur={() => handleEmploymentBlur('selfEmployedDetail')}
              inputRef={() => {}}
              error={!!employmentErrors.selfEmployedDetail}
              keyboardType="default"
              autoCapitalize="words"
              styles={styles}
              neutral={neutral}
            />
            <ContactInputCell
              label="Employer/company"
              value={draft.employment?.employerName}
              onChangeText={(value) => setEmploymentField('employerName', value)}
              onBlur={() => handleEmploymentBlur('employerName')}
              inputRef={() => {}}
              error={!!employmentErrors.employerName}
              keyboardType="default"
              autoCapitalize="words"
              styles={styles}
              neutral={neutral}
            />
            <ContactInputCell
              label="Business address line 1"
              value={draft.employment?.employerAddress?.line1}
              onChangeText={(value) => setEmploymentField('businessAddressLine1', value)}
              onBlur={() => handleEmploymentBlur('businessAddressLine1')}
              inputRef={() => {}}
              error={!!employmentErrors.businessAddressLine1}
              keyboardType="default"
              autoCapitalize="words"
              styles={styles}
              neutral={neutral}
            />
            <ContactInputCell
              label="Business address line 2"
              value={draft.employment?.employerAddress?.line2}
              onChangeText={(value) => setEmploymentField('businessAddressLine2', value)}
              onBlur={() => handleEmploymentBlur('businessAddressLine2')}
              inputRef={() => {}}
              error={!!employmentErrors.businessAddressLine2}
              keyboardType="default"
              autoCapitalize="words"
              styles={styles}
              neutral={neutral}
            />
            <ContactInputCell
              label="Business city"
              value={draft.employment?.employerAddress?.city}
              onChangeText={(value) => setEmploymentField('businessAddressCity', value)}
              onBlur={() => handleEmploymentBlur('businessAddressCity')}
              inputRef={() => {}}
              error={!!employmentErrors.businessAddressCity}
              keyboardType="default"
              autoCapitalize="words"
              styles={styles}
              neutral={neutral}
            />
            <ContactInputCell
              label="Business postal code"
              value={draft.employment?.employerAddress?.postCode}
              onChangeText={(value) => setEmploymentField('businessAddressPostCode', value)}
              onBlur={() => handleEmploymentBlur('businessAddressPostCode')}
              inputRef={() => {}}
              error={!!employmentErrors.businessAddressPostCode}
              keyboardType="number-pad"
              autoCapitalize="none"
              styles={styles}
              neutral={neutral}
            />
          </View>

          <View style={styles.sectionCard} onLayout={handleSectionLayout('partnerDetails')}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Spouse / partner detail</Text>
              <IconRoundButton
                buttonType="delete"
                accessibilityLabel="Clear spouse or partner details"
                onPress={confirmClearSpouseDraft}
                disabled={!hasSpouseData}
                size="sm"
                hitSlop={8}
              />
            </View>
            <View onLayout={handleSectionLayout('partnerNames')}>
              <ContactInputCell
                label="Full names"
                value={draftSpouseRef?.fullNames}
                onChangeText={(value) => setSpouseField('fullNames', value)}
                onBlur={() => handleSpouseBlur('fullNames')}
                inputRef={() => {}}
                error={!!spouseErrors.fullNames}
                keyboardType="default"
                autoCapitalize="words"
                styles={styles}
                neutral={neutral}
              />
            </View>
            <View onLayout={handleSectionLayout('partnerId')}>
              <ContactInputCell
                label="Spouse / partner ID number"
                value={draftSpouseRef?.idNumber}
                onChangeText={(value) => setSpouseField('idNumber', value)}
                onBlur={() => handleSpouseBlur('idNumber')}
                inputRef={() => {}}
                error={!!spouseErrors.idNumber}
                keyboardType="default"
                autoCapitalize="characters"
                styles={styles}
                neutral={neutral}
              />
            </View>
            <ContactInputCell
              label="Spouse / partner cellphone"
              value={draftSpouseRef?.mobile}
              onChangeText={(value) => setSpouseField('mobile', value)}
              onBlur={() => handleSpouseBlur('mobile')}
              inputRef={() => {}}
              error={!!spouseErrors.mobile}
              keyboardType="phone-pad"
              autoCapitalize="none"
              styles={styles}
              neutral={neutral}
            />
          </View>

          {/* <View onLayout={handleSectionLayout('residentialAddress')}>
            <Cell
              label="Address"
              value={
                draft.address?.singleLine && draft.address?.postCode
                  ? `${draft.address.singleLine}, ${draft.address.postCode}`
                  : draft.address?.singleLine ?? draft.address?.postCode
              }
              onPress={() => openAddress('address', 'Residential address')}
              required
              error={missingFields.has('address.singleLine')}
              multiline
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Has postal address</Text>
            <IconRoundButton
              buttonType="confirm"
              accessibilityLabel={hasPostalAddress ? 'Remove postal address' : 'Add a postal address'}
              onPress={handleToggleHasPostal}
              borderColor={hasPostalAddress ? tones.green.base : neutral.base}
              size={36}
              hitSlop={8}
              style={styles.toggleButton}
            />
          </View>
          {hasPostalAddress ? (
            <View onLayout={handleSectionLayout('postalAddress')}>
              <Cell
                label="Postal address (excluding postcode)"
                value={draft.addressPostal?.singleLine && draft.addressPostal?.postCode
                  ? `${draft.addressPostal.singleLine}, ${draft.addressPostal.postCode}`
                  : draft.addressPostal?.singleLine ?? draft.addressPostal?.postCode}
                                

                onPress={() => openAddress('addressPostal', 'Postal address')}
                required={hasPostalAddress}
                error={missingFields.has('addressPostal.singleLine')}
                multiline
              />
            </View>
          ) : null} */}
          <ButtonSave
            label="Save profile"
            onPress={handleSave}
            disabled={!hasUnsavedChanges}
            style={styles.saveButton}
          />
        </PageScrollView>
      </View>

      {sheet?.type === 'text' && (
        <EditTextSheet
          visible
          title={sheet.title}
          initial={editingInitial}
          placeholder={sheet.title}
          onCancel={() => setSheet(null)}
          onSave={value => saveField(sheet.key as Exclude<EditableField, 'idType'>, value)}
          keyboardType={
            sheet.key === 'email'
              ? 'email-address'
              : sheet.key?.toString().includes('postCode')
              ? 'number-pad'
              : sheet.key === 'idNumber' && (draft.idType === 'ID_CARD' || draft.idType === 'ID_BOOK')
              ? 'number-pad'
              : sheet.key === 'mobile' || sheet.key === 'homePhone' || sheet.key === 'workPhone'
              ? 'phone-pad'
              : 'default'
          }
          autoCapitalize={
            sheet.key === 'email'
              ? 'none'
              : sheet.key === 'idNumber'
              ? 'characters'
              : 'words'
          }
        />
      )}

      {sheet?.type === 'idDetails' && (
        <IdDetailsSheet
          visible
          title={sheet.title}
          initialIdType={draft.idType}
          initialIdNumber={draft.idNumber}
          onCancel={() => setSheet(null)}
          onSave={saveIdDetails}
        />
      )}

      {sheet?.type === 'names' && (
        <NameSheet
          visible
          title={sheet.title}
          initial={{
            givenNames: draft.givenNames,
            initials: draft.initials,
            surname: draft.surname,
          }}
          onCancel={() => setSheet(null)}
          onSave={({ givenNames, initials, surname }) => {
            const trimmedGiven = givenNames.trim();
            const trimmedInitials = initials.trim();
            const trimmedSurname = surname.trim();

            let err: string | null = null;
            if (trimmedGiven) err = validateName(trimmedGiven);
            if (!err && trimmedSurname) err = validateName(trimmedSurname);
            if (err) {
              Alert.alert('Invalid input', err);
              return;
            }

            setDraft(prev => {
              const next = { ...prev };
              next.givenNames = trimmedGiven || undefined;
              next.surname = trimmedSurname || undefined;
              next.initials = (trimmedInitials || deriveInitialsFromNames(trimmedGiven)) || undefined;
              return next;
            });
            setSheet(null);
            if (missingFlowActiveRef.current) {
              setTimeout(() => continueMissingFlowRef.current?.(), 0);
            }
          }}
        />
      )}

      {sheet?.type === 'address' && (
        <AddressSheet
          visible
          title={sheet.title}
          initial={sheet.key === 'address' ? draft.address : draft.addressPostal}
          onCancel={() => setSheet(null)}
          onSave={(value) => saveAddress(sheet.key, value)}
        />
      )}

      {sheet?.type === 'select' && (
        <SelectSheet
          visible
          title="Choose ID Type"
          options={[
            { value: 'ID_CARD', label: 'ID Card' },
            { value: 'ID_BOOK', label: 'ID Book' },
            { value: 'PASSPORT', label: 'Passport' },
          ]}
          selected={draft.idType as any}
          onCancel={() => setSheet(null)}
          onPick={value => saveIdType(value as 'ID_CARD' | 'ID_BOOK' | 'PASSPORT')}
        />
      )}
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    content: { gap: 10, paddingBottom: 32 },
    sectionCard: {
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: neutral.border,
      padding: 14,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: neutral.onSurface,
      marginBottom: 10,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    label: { color: neutral.onSurface, marginBottom: 6, fontWeight: '700' },
    requiredLabel: { color: tones.teal.base },
    requiredNote: { color: tones.red.base, fontSize: 12, marginBottom: 4 },

    cell: {
      backgroundColor: neutral.onBase,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: 'rgba(0,0,0,0.2)',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    cellMultiline: { alignItems: 'flex-start' },
    cellError: {
      borderColor: tones.red.base,
    },
    value: { fontSize: 16, color: neutral.onSurface, fontWeight: '600' },
    valueText: { flex: 1, marginRight: 12 },
    inlineInput: {
      flex: 1,
      fontSize: 16,
      color: neutral.onSurface,
      fontWeight: '600',
      paddingVertical: 0,
      paddingHorizontal: 0,
      minHeight: 22,
    },
    placeholder: { color: neutral.border, fontWeight: '500' },
    errorText: { color: tones.red.base },
    chev: { fontSize: 24, color: neutral.border, marginLeft: 8, alignSelf: 'center' },
    chevError: { color: tones.red.base },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      marginTop: 4,
    },
    toggleLabel: { color: neutral.onSurface, fontWeight: '600' },
    toggleButton: { marginLeft: 12 },
    saveButton: { marginTop: 8 },
  });
