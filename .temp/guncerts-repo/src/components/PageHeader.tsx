import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { appConfig } from '../config/appConfig';
import { useTones } from '../theme/tones';
import { usePathname, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { IconButtonGroup } from './IconButton';
import { IconRoundButton } from './RoundIconButton';
import ButtonSave from './ButtonSave';
import { useFeedback } from '../providers/FeedbackProvider';
import { getUserPrefs } from '../data/repo';
import { getFirstProfile } from '../data/sqlite';
import { logger } from '@/src/utils/logger';

type Props = {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  backFallback?: string | (() => void);
  onSave?: () => void;
  saveDisabled?: boolean;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  leadingActions?: React.ReactNode;
  extraActions?: React.ReactNode;
};

export default function PageHeader({
  title,
  onClose,
  onBack,
  backFallback,
  onSave,
  saveDisabled = false,
  style,
  titleStyle,
  leadingActions,
  extraActions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const tones = useTones();
  const neutral = tones.grey;
  const { openFeedback } = useFeedback();
  const [shareFeedbackEnabled, setShareFeedbackEnabled] = React.useState(false);

  const refreshShareFeedback = React.useCallback(() => {
    try {
      const profile = getFirstProfile();
      if (!profile) {
        setShareFeedbackEnabled(false);
        return;
      }
      const prefs = getUserPrefs(profile.id);
      setShareFeedbackEnabled(!!prefs?.shareFeedback);
    } catch (error) {
      logger.warn('feedback prefs read error', error);
      setShareFeedbackEnabled(false);
    }
  }, []);

  React.useEffect(() => {
    refreshShareFeedback();
  }, [refreshShareFeedback]);

  useFocusEffect(
    React.useCallback(() => {
      refreshShareFeedback();
    }, [refreshShareFeedback]),
  );

  const showFeedback =
    !appConfig.isProd && appConfig.features.allowFeedback && shareFeedbackEnabled;

  const handleBack = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if ((router as any)?.canGoBack?.()) {
      router.back();
      return;
    }
    if (typeof backFallback === 'function') {
      backFallback();
      return;
    }
    if (backFallback) {
      router.replace(backFallback as any);
      return;
    }
    router.replace('/(tabs)' as any);
  }, [router, onBack, backFallback]);

  const showBack = onBack !== undefined || backFallback !== undefined;
  const showClose = typeof onClose === 'function';
  const hasSave = typeof onSave === 'function';

  const resolveCloseTarget = React.useCallback((): string | undefined => {
    if (typeof backFallback === 'string') return backFallback;
    if (typeof backFallback === 'function') return 'callback';
    if (showBack) return 'back';
    if (showClose) return 'close';
    return undefined;
  }, [backFallback, showBack, showClose]);

  const buildCloseTo = React.useCallback((): string | undefined => {
    const target = resolveCloseTarget();
    const closeTargets: { save?: string; close?: string } = {};
    if (hasSave) closeTargets.save = target ?? 'save';
    if (showBack || showClose) closeTargets.close = target ?? (showBack ? 'back' : 'close');
    const keys = Object.keys(closeTargets);
    if (!keys.length) return undefined;
    if (keys.length === 1) return closeTargets[keys[0] as keyof typeof closeTargets];
    return JSON.stringify(closeTargets);
  }, [hasSave, resolveCloseTarget, showBack, showClose]);

  const handleFeedback = React.useCallback(() => {
    openFeedback({
      screenTitle: title,
      screenRoute: pathname,
      openedFrom: pathname,
      closeTo: buildCloseTo(),
    });
  }, [buildCloseTo, openFeedback, pathname, title]);

  const styles = useMemo(() => createStyles(neutral), [neutral]);

  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.title, titleStyle]} numberOfLines={2}>
        {title}
      </Text>
      <IconButtonGroup spacing={8} style={styles.actions}>
        {showFeedback ? (
          <IconRoundButton
            buttonType="chatbubble-ellipses"
            accessibilityLabel="Leave feedback"
            variant="solid"
            size="sm"
            hitSlop={8}
            onPress={handleFeedback}
          />
        ) : null}
        {leadingActions}
        {showBack ? (
          <IconRoundButton
            buttonType="back"
            accessibilityLabel="Back"
            onPress={handleBack}
            size="sm"
            hitSlop={8}
          />
        ) : null}
        {extraActions}
        {onSave ? (
          <ButtonSave
            mode="icon"
            onPress={onSave}
            disabled={saveDisabled}
            iconButtonSize="sm"
            hitSlop={8}
          />
        ) : null}
        {showClose ? (
          <IconRoundButton
            buttonType="close"
            accessibilityLabel="Back"
            onPress={onClose}
            size="sm"
            hitSlop={8}
          />
        ) : null}
      </IconButtonGroup>
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      color: neutral.onSurface,
      paddingRight: 12,
    },
    actions: {
      alignItems: 'center',
    },
  });
