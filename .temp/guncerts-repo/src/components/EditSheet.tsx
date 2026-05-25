import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, InteractionManager, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import { useTones } from '../theme/tones';
type IdType = 'ID_CARD' | 'ID_BOOK' | 'PASSPORT';
type AddressFields = {
  line1: string;
  line2: string;
  suburb: string;
  city: string;
  postCode: string;
};
type NameFields = {
  givenNames: string;
  initials: string;
  surname: string;
};

type PartnerFields = {
  fullNames: string;
  idNumber: string;
};

type EditTextSheetFilterPill = {
  key: string;
  label: string;
  value: string;
};

export function EditTextSheet({
  visible,
  title,
  initial,
  placeholder,
  keyboardType,
  mask,
  multiline = false,
  maxLength,
  autoCapitalize = 'sentences',
  validate,
  validationErrorFallback,
  resolveFilterPills,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  keyboardType?: 'default'|'email-address'|'numeric'|'phone-pad'|'number-pad';
  mask?: 'date';
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none'|'sentences'|'words'|'characters';
  validate?: (value: string) => string | null | undefined;
  validationErrorFallback?: string | ((value: string) => string | null | undefined);
  resolveFilterPills?: (query: string) => EditTextSheetFilterPill[];
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const styles = useSheetStyles();
  const [value, setValue] = useState(initial ?? '');
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const shouldSelectRef = useRef(false);
  const rawValueRef = useRef('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const query = value.trim();
  const filterPills = useMemo(() => {
    if (!resolveFilterPills) return [] as EditTextSheetFilterPill[];
    if (!query) return [] as EditTextSheetFilterPill[];
    return resolveFilterPills(query);
  }, [query, resolveFilterPills]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => { setValue(initial ?? ''); }, [initial, visible]);
  useEffect(() => {
    if (!visible) return;
    const raw = initial ?? '';
    const shouldSelectNone = raw.trim().toUpperCase() === 'NONE';
    shouldSelectRef.current = shouldSelectNone;
    rawValueRef.current = raw;
    return () => {
      shouldSelectRef.current = false;
      rawValueRef.current = '';
    };
  }, [initial, visible]);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        input.focus();
        if (shouldSelectRef.current) {
          const len = rawValueRef.current.length;
          input.setNativeProps({ selection: { start: 0, end: len } });
        }
      }, 120);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      focusInput();
    }, 240);
    return () => clearTimeout(timer);
  }, [focusInput, visible]);

  const maskYYYYMMDD = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };

  const handleChange = (v: string) => {
    if (mask === 'date') {
      setValue(maskYYYYMMDD(v));
    } else {
      setValue(v);
    }
  };

  const handleSave = () => {
    const v = value.trim();
    if (mask === 'date') {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!ok) {
        Alert.alert('Invalid date', 'Please enter a date like 2025-09-22');
        return;
      }
    }
    const validationMessage = validate?.(v);
    if (validationMessage) {
      const fallbackValue =
        typeof validationErrorFallback === 'function'
          ? validationErrorFallback(v)
          : validationErrorFallback;
      if (fallbackValue != null) {
        setValue(fallbackValue);
      }
      Alert.alert('Invalid value', validationMessage);
      return;
    }
    onSave(v);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onCancel}
      onShow={focusInput}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onCancel} />
          <View style={[styles.sheet, { paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom) }]}>
            <Text style={styles.title}>{title}</Text>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                multiline && styles.inputMultiline,
              ]}
              placeholder={placeholder}
              value={value}
              onChangeText={handleChange}
              keyboardType={mask === 'date' ? 'numeric' : keyboardType}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              multiline={multiline}
              maxLength={maxLength}
              textAlignVertical={multiline ? 'top' : 'center'}
              autoFocus
            />
            {filterPills.length ? (
              <View style={styles.filterPillsWrap}>
                {filterPills.map((pill) => (
                  <Pressable
                    key={pill.key}
                    accessibilityRole="button"
                    onPress={() => setValue(pill.value)}
                    style={({ pressed }) => [
                      styles.filterPill,
                      pressed && styles.filterPillPressed,
                    ]}
                  >
                    <Text style={styles.filterPillText}>{pill.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}><Text style={styles.btnCancelTxt}>Cancel</Text></Pressable>
              <Pressable style={[styles.btn, styles.save]} onPress={handleSave}><Text style={styles.btnSaveTxt}>Save</Text></Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function IdDetailsSheet({
  visible,
  title,
  initialIdType,
  initialIdNumber,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  initialIdType?: IdType;
  initialIdNumber?: string;
  onCancel: () => void;
  onSave: (idType: IdType, idNumber: string) => void;
}) {
  const styles = useSheetStyles();
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const [idType, setIdType] = useState<IdType | undefined>(initialIdType);
  const [idNumber, setIdNumber] = useState(initialIdNumber ?? '');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setIdType(initialIdType);
    setIdNumber(initialIdNumber ?? '');
  }, [visible, initialIdType, initialIdNumber]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboardType =
    idType === 'ID_CARD' || idType === 'ID_BOOK' ? 'number-pad' : 'default';
  const idNumberLabel = idType === 'PASSPORT' ? 'Passport Number' : 'ID Number';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onCancel} />
          <View style={[styles.sheet, { paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom) }]}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.optionList}>
              {[
                { value: 'ID_CARD', label: 'ID Card' },
                { value: 'ID_BOOK', label: 'ID Book' },
                { value: 'PASSPORT', label: 'Passport' },
              ].map(option => {
                const active = idType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setIdType(option.value as IdType)}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text style={[styles.optionTxt, active && styles.optionTxtActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>{idNumberLabel}</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={idNumberLabel}
              value={idNumber}
              onChangeText={setIdNumber}
              keyboardType={keyboardType}
              autoCapitalize={idType === 'PASSPORT' ? 'characters' : 'none'}
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
                <Text style={styles.btnCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.save]}
                onPress={() => {
                  if (!idType) {
                    Alert.alert('Select ID Type', 'Please choose an ID type to continue.');
                    return;
                  }
                  onSave(idType, idNumber);
                }}
              >
                <Text style={styles.btnSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function AddressSheet({
  visible,
  title,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  initial?: Partial<AddressFields>;
  onCancel: () => void;
  onSave: (value: AddressFields) => void;
}) {
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [line1, setLine1] = useState(initial?.line1 ?? '');
  const [line2, setLine2] = useState(initial?.line2 ?? '');
  const [suburb, setSuburb] = useState(initial?.suburb ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [postCode, setPostCode] = useState(initial?.postCode ?? '');

  useEffect(() => {
    if (!visible) return;
    setLine1(initial?.line1 ?? '');
    setLine2(initial?.line2 ?? '');
    setSuburb(initial?.suburb ?? '');
    setCity(initial?.city ?? '');
    setPostCode(initial?.postCode ?? '');
  }, [visible, initial]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onCancel} />
          <View style={[styles.sheet, { paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom) }]}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView
              style={styles.fieldScroll}
              contentContainerStyle={styles.fieldScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Line 1</Text>
                <TextInput
                  style={styles.input}
                  value={line1}
                  onChangeText={setLine1}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              {/* <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Line 2 (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={line2}
                  onChangeText={setLine2}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View> */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Suburb (at least one of Suburb/City)</Text>
                <TextInput
                  style={styles.input}
                  value={suburb}
                  onChangeText={setSuburb}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>City (at least one of Suburb/City)</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Post Code</Text>
                <TextInput
                  style={styles.input}
                  value={postCode}
                  onChangeText={setPostCode}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </ScrollView>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
                <Text style={styles.btnCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.save]}
                onPress={() => onSave({ line1, line2, suburb, city, postCode })}
              >
                <Text style={styles.btnSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function NameSheet({
  visible,
  title,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  initial?: Partial<NameFields>;
  onCancel: () => void;
  onSave: (value: NameFields) => void;
}) {
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [givenNames, setGivenNames] = useState(initial?.givenNames ?? '');
  const [initials, setInitials] = useState(initial?.initials ?? '');
  const [surname, setSurname] = useState(initial?.surname ?? '');
  const initialsDirtyRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setGivenNames(initial?.givenNames ?? '');
    setInitials(initial?.initials ?? '');
    setSurname(initial?.surname ?? '');
    initialsDirtyRef.current = false;
  }, [visible, initial]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onCancel} />
          <View style={[styles.sheet, { paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom) }]}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView
              style={styles.fieldScroll}
              contentContainerStyle={styles.fieldScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Full names</Text>
                <TextInput
                  style={styles.input}
                  value={givenNames}
                  onChangeText={(value) => {
                    setGivenNames(value);
                    if (!initialsDirtyRef.current) {
                      const parts = value
                        .split(/\s+/)
                        .map(part => part.trim())
                        .filter(Boolean)
                        .map(part => part[0] ?? '');
                      setInitials(parts.length ? parts.join('').toUpperCase() : '');
                    }
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Initials</Text>
                <TextInput
                  style={styles.input}
                  value={initials}
                  onChangeText={(value) => {
                    initialsDirtyRef.current = true;
                    setInitials(value);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Surname</Text>
                <TextInput
                  style={styles.input}
                  value={surname}
                  onChangeText={setSurname}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </ScrollView>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
                <Text style={styles.btnCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.save]}
                onPress={() => onSave({ givenNames, initials, surname })}
              >
                <Text style={styles.btnSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PartnerDetailsSheet({
  visible,
  title,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  initial?: Partial<PartnerFields>;
  onCancel: () => void;
  onSave: (value: PartnerFields) => void;
}) {
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [fullNames, setFullNames] = useState(initial?.fullNames ?? '');
  const [idNumber, setIdNumber] = useState(initial?.idNumber ?? '');

  useEffect(() => {
    if (!visible) return;
    setFullNames(initial?.fullNames ?? '');
    setIdNumber(initial?.idNumber ?? '');
  }, [visible, initial]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onCancel} />
          <View style={[styles.sheet, { paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom) }]}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView
              style={styles.fieldScroll}
              contentContainerStyle={styles.fieldScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Full names</Text>
                <TextInput
                  style={styles.input}
                  value={fullNames}
                  onChangeText={setFullNames}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>ID Number</Text>
                <TextInput
                  style={styles.input}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </ScrollView>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
                <Text style={styles.btnCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.save]}
                onPress={() => onSave({ fullNames, idNumber })}
              >
                <Text style={styles.btnSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SelectSheet<T extends string>({
  visible,
  title,
  subtitle,
  options,
  selected,
  onCancel,
  onPick,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  options: { value: T; label: string }[];
  selected?: T;
  onCancel: () => void;
  onPick: (v: T) => void;
}) {
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map(opt => (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                onPress={() => onPick(opt.value)}
                style={({ pressed }) => [
                  styles.option,
                  selected === opt.value && styles.optionActive,
                  pressed && (selected === opt.value ? styles.optionPressedActive : styles.optionPressed),
                ]}
              >
                <Text style={[styles.optionTxt, selected === opt.value && styles.optionTxtActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useSheetStyles = () => {
  const tones = useTones();
  const grey = tones.grey;
  const { effectiveMode } = useThemeMode();
  return useMemo(
    () => createStyles(grey, tones.teal, getScrimColor(effectiveMode, 0.45)),
    [effectiveMode, grey, tones.teal],
  );
};

const createStyles = (
  grey: ReturnType<typeof useTones>['grey'],
  primary: ReturnType<typeof useTones>['teal'],
  scrimColor: string,
) =>
  StyleSheet.create({
    kav: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: scrimColor, justifyContent: 'flex-end' },
    sheet: { backgroundColor: grey.onBase, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 12 },
    title: { fontSize: 16, fontWeight: '700', color: grey.onSurface },
    input: {
      backgroundColor: grey.onBase,
      borderWidth: 1,
      borderColor: grey.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 16,
      color: grey.onSurface,
    },
    inputMultiline: { minHeight: 120 },
    row: { flexDirection: 'row', gap: 10, marginTop: 0 },
    btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    cancel: { backgroundColor: grey.surface },
    save: { backgroundColor: primary.base },
    btnCancelTxt: { color: grey.onSurface, fontWeight: '700' },
    btnSaveTxt: { color: primary.onBase, fontWeight: '700' },
    optionList: { marginBottom: 4 },
    fieldLabel: { color: grey.base, fontWeight: '600' },
    fieldBlock: { marginBottom: 10 },
    fieldScroll: { maxHeight: 360 },
    fieldScrollContent: { paddingBottom: 4 },
    option: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: grey.border,
      marginBottom: 8,
      backgroundColor: grey.onBase,
    },
    optionActive: { borderColor: primary.base, backgroundColor: primary.surface },
    optionPressed: { borderColor: grey.base, backgroundColor: grey.surface, opacity: 0.92 },
    optionPressedActive: { borderColor: primary.emphasis, backgroundColor: primary.emphasis, opacity: 0.92 },
    optionTxt: { color: grey.onSurface, fontWeight: '600' },
    optionTxtActive: { color: primary.onSurface },
    subtitle: { color: grey.base, fontWeight: '600' },
    filterPillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: primary.base,
      backgroundColor: primary.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterPillPressed: { opacity: 0.85 },
    filterPillText: { color: primary.onSurface, fontWeight: '600' },
  });
