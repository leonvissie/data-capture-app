import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTones } from '../theme/tones';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import { Button } from './Button';
import { IconRoundButton } from './RoundIconButton';
import { getFirstProfile } from '../data/sqlite';
import { getUserPrefs, persist, saveUserPrefs, withMeta } from '../data/repo';
import { Feedback, FeedbackType, UUID } from '../data/types';
import { useRouter } from 'expo-router';
import { appConfig } from '../config/appConfig';
import { logger } from '@/src/utils/logger';

type FeedbackModalProps = {
  visible: boolean;
  onClose: () => void;
  screenTitle?: string | null;
  screenRoute?: string | null;
  openedFrom?: string | null;
  closeTo?: string | null;
};

const FEEDBACK_TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'TYPO', label: 'Typo' },
  { value: 'BROKEN', label: 'Broken' },
  { value: 'REQUEST', label: 'Feature request' },
  { value: 'OTHER', label: 'Other' },
];

const MIN_LINES = 5;
const LINE_HEIGHT = 20;
const INPUT_VERTICAL_PADDING = 12;
const INPUT_MIN_HEIGHT = MIN_LINES * LINE_HEIGHT + INPUT_VERTICAL_PADDING * 2;

const createFeedbackId = (): UUID =>
  (globalThis.crypto?.randomUUID?.() ?? `feedback_${Math.random().toString(36).slice(2)}`) as UUID;

const resolveAppVersion = (): string | undefined =>
  (Constants?.expoConfig as any)?.version ??
  (Constants as any)?.manifest?.version ??
  (Constants as any)?.nativeAppVersion ??
  undefined;

const resolveDeviceModel = (): string | undefined =>
  (Constants as any)?.deviceName ??
  (Constants as any)?.modelName ??
  (Constants as any)?.platform?.ios?.model ??
  (Constants as any)?.platform?.android?.model ??
  undefined;

const resolveOsVersion = (): string => {
  const version = Platform.Version ?? 'unknown';
  return `${Platform.OS} ${version}`;
};

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  visible,
  onClose,
  screenTitle,
  screenRoute,
  openedFrom,
  closeTo,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const styles = useMemo(
    () => createStyles(neutral, tones, getScrimColor(effectiveMode, 0.45)),
    [effectiveMode, neutral, tones],
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const inputAnchorYRef = useRef<number | null>(null);
  const pendingScrollRef = useRef(false);
  const [selectedType, setSelectedType] = useState<FeedbackType | undefined>(undefined);
  const [feedbackText, setFeedbackText] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [saving, setSaving] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [allowInputFocus, setAllowInputFocus] = useState(false);
  const allowInputFocusRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!visible) return;
    setSelectedType(undefined);
    setFeedbackText('');
    setInputHeight(INPUT_MIN_HEIGHT);
    setAllowInputFocus(false);
    allowInputFocusRef.current = false;
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const handleShow = (event: any) => {
      const height = event?.endCoordinates?.height ?? 0;
      setKeyboardInset(height);
    };
    const handleHide = () => setKeyboardInset(0);
    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const meta = useMemo(
    () => ({
      appVersion: resolveAppVersion(),
      deviceModel: resolveDeviceModel(),
      osVersion: resolveOsVersion(),
      buildEnv: appConfig.buildEnv as Feedback['buildEnv'],
    }),
    [],
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const focusInputAfterScroll = useCallback(() => {
    const attemptScroll = (attempt: number) => {
      requestAnimationFrame(() => {
        const targetY = inputAnchorYRef.current;
        const scrollNode = scrollRef.current;
        if (!scrollNode) {
          if (attempt < 3) {
            setTimeout(() => attemptScroll(attempt + 1), 80);
          }
          return;
        }
        if (targetY === null || targetY === undefined) {
          scrollNode.scrollToEnd({ animated: true });
          if (attempt < 3) {
            setTimeout(() => attemptScroll(attempt + 1), 80);
          }
          return;
        }
        scrollNode.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            inputRef.current?.focus();
            scrollNode.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
          }, 200);
        });
        pendingScrollRef.current = false;
      });
    };

    attemptScroll(0);
  }, []);

  const handleMemoFocus = useCallback(() => {
    if (!allowInputFocusRef.current) return;
    const targetY = inputAnchorYRef.current;
    if (targetY === null || targetY === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
  }, []);

  const handleMemoPressIn = useCallback(() => {
    allowInputFocusRef.current = true;
    if (!allowInputFocus) {
      setAllowInputFocus(true);
    }
    const attemptScroll = (attempt: number) => {
      requestAnimationFrame(() => {
        const targetY = inputAnchorYRef.current;
        const scrollNode = scrollRef.current;
        if (targetY === null || targetY === undefined || !scrollNode) {
          if (attempt < 3) {
            setTimeout(() => attemptScroll(attempt + 1), 80);
          }
          return;
        }
        scrollNode.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
        if (attempt === 0) {
          setTimeout(() => {
            scrollNode.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
          }, 120);
        }
      });
    };
    attemptScroll(0);
  }, [allowInputFocus]);

  const handleSelectType = useCallback(
    (next: FeedbackType) => {
      setSelectedType(next);
      allowInputFocusRef.current = true;
      if (!allowInputFocus) {
        setAllowInputFocus(true);
      }
      pendingScrollRef.current = true;
      focusInputAfterScroll();
      if (keyboardInset === 0) {
        setTimeout(() => {
          focusInputAfterScroll();
        }, 180);
      }
    },
    [allowInputFocus, focusInputAfterScroll, keyboardInset],
  );

  const handleSubmit = useCallback(() => {
    if (!feedbackText.trim()) {
      return;
    }

    const profile = getFirstProfile();
    if (!profile) {
      Alert.alert('No profile found', 'Please create a profile before submitting feedback.');
      return;
    }
    const prefs = getUserPrefs(profile.id);
    const shouldPrompt = prefs?.showSendFeedbackMessage === true;

    const saveFeedback = () => {
      const entry: Feedback = withMeta({
        id: createFeedbackId(),
        type: 'Feedback',
        holderProfileId: profile.id,
        feedbackScreen: screenTitle || 'Unknown',
        feedbackRoute: screenRoute ?? undefined,
        openedFrom: openedFrom ?? undefined,
        closeTo: closeTo ?? undefined,
        feedbackType: selectedType,
        feedbackText: feedbackText.trim(),
        appVersion: meta.appVersion,
        deviceModel: meta.deviceModel,
        osVersion: meta.osVersion,
        buildEnv: meta.buildEnv,
        exportedAt: undefined,
      });
      persist(entry, false);
    };

    try {
      setSaving(true);
      if (shouldPrompt) {
        Alert.alert(
          'Send feedback',
          'You can send your feedback directly to the developer from the Settings tab.',
          [
            { text: 'Ok', style: 'cancel', onPress: handleClose },
            {
              text: 'Take me there',
              onPress: () => {
                if (prefs) {
                  saveUserPrefs({ ...prefs, showSendFeedbackMessage: false });
                }
                saveFeedback();
                handleClose();
                router.replace('/(tabs)/settings?scroll=shareFeedback' as any);
              },
            },
          ],
        );
        return;
      }
      saveFeedback();
      handleClose();
    } catch (error: any) {
      logger.warn('feedback save error', error);
      Alert.alert('Unable to save feedback', error?.message ?? 'An error occurred while saving feedback.');
    } finally {
      setSaving(false);
    }
  }, [feedbackText, handleClose, meta, router, screenRoute, screenTitle, selectedType]);

  const submitDisabled = saving || feedbackText.trim().length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.modalShell} edges={['top', 'bottom']}>
          <View
            style={[styles.modalContainer, { backgroundColor: neutral.onBase, borderColor: neutral.border }]}
            accessibilityViewIsModal
            accessibilityLabel="Feedback form"
          >
            <View style={styles.header}>
              <Text style={styles.heading}>Feedback</Text>
              <IconRoundButton
                buttonType="close"
                accessibilityLabel="Close feedback"
                variant="ghost"
                size="sm"
                borderColor={tones.orange.base}
                onPress={handleClose}
                hitSlop={12}
              />
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.scrollContainer}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 + keyboardInset }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <Text style={styles.label}>Feedback type</Text>
              <View style={styles.typeRow}>
                {FEEDBACK_TYPE_OPTIONS.map((option) => {
                  const selected = option.value === selectedType;
                  const tone = tones.orange;
                  return (
                    <Button
                      key={option.value}
                      label={option.label}
                      onPress={() => handleSelectType(option.value)}
                      tone="orange"
                      variant={selected ? 'solid' : 'outline'}
                      backgroundColor={selected ? tone.base : tone.surface}
                      pressedBackgroundColor={selected ? tone.emphasis : tone.surface}
                      textColor={selected ? tone.onBase : tone.onSurface}
                      borderColor={selected ? tone.base : tone.border}
                      fullWidth={false}
                      style={styles.typeButton}
                      labelStyle={styles.typeLabel}
                      contentStyle={styles.typeButtonContent}
                      centerContent
                      centerText
                    />
                  );
                })}
              </View>

              <Text style={styles.label}>Details</Text>
              <View
                onLayout={(event) => {
                  inputAnchorYRef.current = event.nativeEvent.layout.y;
                  if (pendingScrollRef.current) {
                    focusInputAfterScroll();
                  }
                }}
              >
                <TextInput
                  ref={inputRef}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder="Tell us what happened and what you expected."
                  placeholderTextColor={neutral.base}
                  multiline
                  showSoftInputOnFocus={allowInputFocus}
                  onPressIn={handleMemoPressIn}
                  onContentSizeChange={(event) => {
                    const nextHeight = Math.max(INPUT_MIN_HEIGHT, event.nativeEvent.contentSize.height);
                    setInputHeight(nextHeight);
                  }}
                  style={[styles.textInput, { height: inputHeight }]}
                  textAlignVertical="top"
                  returnKeyType="done"
                  blurOnSubmit
                  onFocus={handleMemoFocus}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>

              <Button
                label="Submit feedback"
                onPress={handleSubmit}
                disabled={submitDisabled}
                loading={saving}
                tone="orange"
                style={styles.submitButton}
                centerText
                centerContent
              />
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>,
  scrimColor: string,
) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: scrimColor,
    justifyContent: 'flex-end',
  },
  modalShell: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    marginTop: Platform.OS === 'ios' ? 48 : 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: neutral.border,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: neutral.onSurface,
    flex: 1,
    marginRight: 12,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: neutral.base,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  typeButtonContent: {
    flex: 0,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: neutral.onBase,
    borderRadius: 16,
    borderColor: neutral.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: INPUT_VERTICAL_PADDING,
    fontSize: 15,
    lineHeight: LINE_HEIGHT,
    color: neutral.onSurface,
  },
  submitButton: {
    marginTop: 8,
  },
});

export default FeedbackModal;
