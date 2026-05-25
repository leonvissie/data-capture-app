import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView,
  Platform, Animated, Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import { useTones } from '../theme/tones';

const SheetContainer: React.FC<{
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  height?: number;
  title?: string;
  onShow?: () => void;
}> = ({ visible, onRequestClose, children, height = 340, title, onShow }) => {
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const styles = React.useMemo(
    () => createStyles(neutral, tones, getScrimColor(effectiveMode, 0.35)),
    [effectiveMode, neutral, tones],
  );
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

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

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      onShow={onShow}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.kav}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={onRequestClose} />
          <Animated.View
            style={[
              styles.sheet,
              { height, paddingBottom: 12 + (keyboardVisible ? 0 : insets.bottom), transform: [{ translateY }] },
            ]}
          >
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const InputSheet: React.FC<{
  visible: boolean;
  title: string;
  value: string | undefined;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  height?: number;
  onCancel: () => void;
  onSave: (text: string) => void;
}> = (p) => {
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const styles = React.useMemo(
    () => createStyles(neutral, tones, getScrimColor(effectiveMode, 0.35)),
    [effectiveMode, neutral, tones],
  );
  const [text, setText] = React.useState(p.value ?? '');
  const inputRef = React.useRef<TextInput>(null);
  useEffect(() => setText(p.value ?? ''), [p.visible, p.value]);
  useEffect(() => {
    if (!p.visible) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [p.visible]);

  const focusInput = () => {
    const input = inputRef.current;
    if (!input) return;
    setTimeout(() => input.focus(), 50);
  };

  return (
    <SheetContainer
      visible={p.visible}
      onRequestClose={p.onCancel}
      title={p.title}
      onShow={focusInput}
      height={p.height ?? 160}
    >
      <View style={{ paddingHorizontal: 16, gap: 12, flex: 1 }}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={p.placeholder}
          keyboardType={p.keyboardType ?? 'default'}
          autoCapitalize={p.autoCapitalize ?? 'none'}
          secureTextEntry={p.secureTextEntry}
          style={styles.input}
          autoFocus
        />
        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={p.onCancel}>
            <Text style={[styles.btnText, { color: neutral.onSurface }]}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => p.onSave(text)}>
            <Text style={styles.btnText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </SheetContainer>
  );
};

export const SelectSheet: React.FC<{
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  value?: string;
  onCancel: () => void;
  onSelect: (value: string) => void;
}> = ({ visible, title, options, value, onCancel, onSelect }) => {
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const styles = React.useMemo(
    () => createStyles(neutral, tones, getScrimColor(effectiveMode, 0.35)),
    [effectiveMode, neutral, tones],
  );
  return (
    <SheetContainer visible={visible} onRequestClose={onCancel} title={title} height={options.length > 4 ? 380 : 280}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        {options.map(opt => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={[styles.option, active && styles.optionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
          <Text style={[styles.btnText, { color: neutral.onSurface }]}>Close</Text>
        </Pressable>
      </View>
    </SheetContainer>
  );
};

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>,
  scrimColor: string,
) =>
  StyleSheet.create({
    kav: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: scrimColor },
    sheet: {
      position: 'relative',
      backgroundColor: neutral.onBase,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 12,
    },
    title: { fontSize: 16, fontWeight: '700', color: neutral.onSurface, textAlign: 'center', marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: neutral.onSurface,
      backgroundColor: neutral.onBase,
    },
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
    btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    btnPrimary: { backgroundColor: tones.teal.base },
    btnGhost: { borderWidth: 1, borderColor: neutral.border, backgroundColor: 'transparent' },
    btnText: { color: tones.teal.onBase, fontWeight: '700' },

    option: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: neutral.border, borderRadius: 10 },
    optionActive: { borderColor: tones.teal.base, backgroundColor: tones.teal.surface },
    optionLabel: { color: neutral.onSurface, fontWeight: '600' },
    optionLabelActive: { color: tones.teal.onSurface },
  });
