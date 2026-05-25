import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TourStep, TourTargetLayout } from '@/features/tour/types';
import { useSurfacePalette } from '@/providers/ThemeModeProvider';
import { radii, spacing, typography } from '@/theme';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

const TARGET_BUBBLE_GAP = 16;

export function TourOverlay({
  visible,
  step,
  stepIndex,
  totalSteps,
  canProceed,
  dismissOnly = false,
  dismissLabel = 'OK',
  hideActions = false,
  hideBack = false,
  targetLayout,
  onBack,
  onNext,
  onSkip,
}: {
  visible: boolean;
  step: TourStep | null;
  stepIndex: number;
  totalSteps: number;
  canProceed: boolean;
  dismissOnly?: boolean;
  dismissLabel?: string;
  hideActions?: boolean;
  hideBack?: boolean;
  targetLayout: TourTargetLayout | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const palette = useSurfacePalette();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeMs = 300;
  const [isRendered, setIsRendered] = useState(visible && !!step);
  const [hasFreshTargetForStep, setHasFreshTargetForStep] = useState(false);
  const [lockedTargetLayout, setLockedTargetLayout] = useState<TourTargetLayout | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStepIdRef = useRef<string | null>(step?.id ?? null);
  const previousVisibleRef = useRef(visible);
  const previousCanRenderContentRef = useRef(false);
  const latestVisibleRef = useRef(visible);

  useEffect(() => {
    latestVisibleRef.current = visible;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (visible && step) {
      latestVisibleRef.current = true;
      const didBecomeVisible = !previousVisibleRef.current && visible;
      setIsRendered(true);

      const isStepChange = previousStepIdRef.current !== step.id;
      if (isStepChange) {
        setHasFreshTargetForStep(!step.targetId);
        setLockedTargetLayout(null);
      }
      if (didBecomeVisible) {
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: fadeMs,
          useNativeDriver: true,
        }).start();
      } else {
        // Keep step-to-step transitions visually stable (no blink).
        opacity.setValue(1);
      }
      previousStepIdRef.current = step.id;
      previousVisibleRef.current = visible;
      return;
    }

    if (!visible && isRendered) {
      latestVisibleRef.current = false;
      previousVisibleRef.current = visible;
      Animated.timing(opacity, {
        toValue: 0,
        duration: fadeMs,
        useNativeDriver: true,
      }).start();
      hideTimerRef.current = setTimeout(() => {
        if (!latestVisibleRef.current) {
          setIsRendered(false);
        }
      }, fadeMs);
    } else {
      latestVisibleRef.current = false;
      previousVisibleRef.current = visible;
    }
  }, [fadeMs, isRendered, opacity, step, stepIndex, visible]);

  useEffect(() => {
    const allowRelockForDynamicTarget = step?.id === 'select-general-filter' || step?.id === 'scroll-filter-pills';
    if (!step?.targetId) {
      setHasFreshTargetForStep(true);
      setLockedTargetLayout(null);
      return;
    }
    if (targetLayout) {
      setHasFreshTargetForStep(true);
      const nextLayout = {
        x: Math.round(targetLayout.x),
        y: Math.round(targetLayout.y),
        width: Math.round(targetLayout.width),
        height: Math.round(targetLayout.height),
      };
      setLockedTargetLayout((prev) => (allowRelockForDynamicTarget ? nextLayout : prev ?? nextLayout));
    }
  }, [step?.id, step?.targetId, targetLayout]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const measuredTarget = step?.targetId ? (lockedTargetLayout ?? targetLayout) : null;
  const requiresMeasuredTarget = !!step?.targetId && (!measuredTarget || !hasFreshTargetForStep);
  const canRenderContent = !requiresMeasuredTarget;

  useEffect(() => {
    if (!visible || !step) {
      previousCanRenderContentRef.current = false;
      return;
    }
    if (!canRenderContent) {
      previousCanRenderContentRef.current = false;
      return;
    }

    const didBecomeRenderable = !previousCanRenderContentRef.current;
    previousCanRenderContentRef.current = true;
    if (!didBecomeRenderable) return;

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: fadeMs,
      useNativeDriver: true,
    }).start();
  }, [canRenderContent, fadeMs, opacity, step, visible]);

  const shouldRenderOverlay = (visible && !!step && totalSteps > 0) || (isRendered && !!step && totalSteps > 0);
  if (!shouldRenderOverlay || !step) {
    return null;
  }

  const bubbleWidth = Math.min(width - spacing.lg * 2, 360);
  const targetInsetX =
    step.id === 'general-results-count'
      ? 8
      : step.id === 'expand-card'
      ? 8
      : step.id === 'watch-plus'
      ? 8
      : step.id === 'award-pill-colors'
      ? 8
      : 4;
  const targetInsetLeft = targetInsetX;
  const targetInsetRight = step.id === 'scroll-filter-pills' ? targetInsetX + 4 : targetInsetX;
  const targetInsetY =
    step.id === 'expand-card' ? 12 : step.id === 'watch-plus' ? 8 : step.id === 'award-pill-colors' ? 8 : 4;
  const targetInsetTop = step.id === 'scroll-filter-pills' ? targetInsetY + 6 : targetInsetY;
  const targetInsetBottom = step.id === 'scroll-filter-pills' ? Math.max(0, targetInsetY - 7) : targetInsetY;
  const minBubbleTop = Math.max(insets.top + spacing.sm, 24);
  const maxBubbleTop = Math.max(minBubbleTop, height - 230 - insets.bottom);
  let bubbleTop = clamp(height * 0.68, minBubbleTop, maxBubbleTop);
  let bubbleLeft = clamp((width - bubbleWidth) / 2, spacing.md, width - bubbleWidth - spacing.md);

  if (measuredTarget) {
    const preferred = step.placement ?? 'auto';
    const placeTop = preferred === 'top' || (preferred === 'auto' && measuredTarget.y > height * 0.55);

    bubbleTop = placeTop
      ? clamp(measuredTarget.y - 170, minBubbleTop, maxBubbleTop)
      : clamp(measuredTarget.y + measuredTarget.height + TARGET_BUBBLE_GAP, minBubbleTop, maxBubbleTop);
    bubbleLeft = clamp(
      measuredTarget.x + measuredTarget.width / 2 - bubbleWidth / 2,
      spacing.md,
      width - bubbleWidth - spacing.md,
    );

    // Guarantee bubble does not overlap highlighted target area.
    const bubbleApproxHeight = dismissOnly ? 150 : 250;
    const bubbleBottom = bubbleTop + bubbleApproxHeight;
    const targetTop = measuredTarget.y - targetInsetTop;
    const targetBottom = measuredTarget.y + measuredTarget.height + targetInsetBottom;
    const overlapsTarget = bubbleBottom > targetTop && bubbleTop < targetBottom;
    if (overlapsTarget) {
      const aboveTop = clamp(targetTop - bubbleApproxHeight - TARGET_BUBBLE_GAP, minBubbleTop, maxBubbleTop);
      const belowTop = clamp(targetBottom + TARGET_BUBBLE_GAP, minBubbleTop, maxBubbleTop);
      const aboveFits = aboveTop + bubbleApproxHeight <= targetTop - 4;
      bubbleTop = aboveFits ? aboveTop : belowTop;
    }
  }

  // Keep this step's bubble lower on screen for better reading flow.
  if (step.id === 'award-pill-colors' || step.id === 'general-results-count') {
    bubbleTop = clamp(bubbleTop + 82, minBubbleTop, maxBubbleTop);
  }

  const progress = `${stepIndex + 1} / ${totalSteps}`;
  const progressPct = totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;
  const canGoBack = stepIndex > 0 && !dismissOnly && !hideActions && !hideBack;
  const isLastStep = stepIndex >= totalSteps - 1;

  return (
    <View style={styles.safe} pointerEvents="box-none">
      {!measuredTarget ? <Pressable style={styles.backdrop} onPress={() => {}} importantForAccessibility="no-hide-descendants" /> : null}

      <Animated.View style={styles.fadeLayer} pointerEvents="box-none">
        {measuredTarget ? (
          <View style={styles.maskWrap} pointerEvents="box-none">
            <Pressable
              style={[
                styles.maskBlock,
                { left: 0, top: 0, right: 0, height: Math.max(0, measuredTarget.y - targetInsetTop) },
              ]}
              onPress={() => {}}
              importantForAccessibility="no-hide-descendants"
            />
            <Pressable
              style={[
                styles.maskBlock,
                {
                  left: 0,
                  top: Math.max(0, measuredTarget.y - targetInsetTop),
                  width: Math.max(0, measuredTarget.x - targetInsetLeft),
                  height: measuredTarget.height + targetInsetTop + targetInsetBottom,
                },
              ]}
              onPress={() => {}}
              importantForAccessibility="no-hide-descendants"
            />
            <Pressable
              style={[
                styles.maskBlock,
                {
                  left: measuredTarget.x + measuredTarget.width + targetInsetRight,
                  top: Math.max(0, measuredTarget.y - targetInsetTop),
                  right: 0,
                  height: measuredTarget.height + targetInsetTop + targetInsetBottom,
                },
              ]}
              onPress={() => {}}
              importantForAccessibility="no-hide-descendants"
            />
            <Pressable
              style={[
                styles.maskBlock,
                {
                  left: 0,
                  top: measuredTarget.y + measuredTarget.height + targetInsetBottom,
                  right: 0,
                  bottom: 0,
                },
              ]}
              onPress={() => {}}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
        ) : null}
        {measuredTarget ? (
          <View
            pointerEvents="none"
            style={[
              styles.targetHint,
              {
                borderColor: palette.tones.teal.base,
                left: measuredTarget.x - targetInsetLeft,
                top: measuredTarget.y - targetInsetTop,
                width: measuredTarget.width + targetInsetLeft + targetInsetRight,
                height: measuredTarget.height + targetInsetTop + targetInsetBottom,
              },
            ]}
          />
        ) : null}

        {!requiresMeasuredTarget ? (
          <Animated.View
            style={[
              styles.bubble,
              {
                opacity: visible ? 1 : opacity,
                width: bubbleWidth,
                left: bubbleLeft,
                top: bubbleTop,
                backgroundColor: palette.card,
                borderColor: palette.border,
              },
            ]}
          >
        {!dismissOnly ? (
          <>
            <View style={styles.progressRow}>
              <Text style={[styles.progressText, { color: palette.textMuted }]}>{progress}</Text>
              <Pressable
                onPress={onSkip}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Skip tour"
                accessibilityHint="Pause the tour and close this overlay"
              >
                <Text style={[styles.progressText, { color: palette.tones.purple.base }]}>
                  Skip
                </Text>
              </Pressable>
            </View>

            <View style={[styles.progressBarTrack, { backgroundColor: palette.cardMuted }]}>
              <View style={[styles.progressBarFill, { width: `${progressPct}%`, backgroundColor: palette.tones.teal.base }]} />
            </View>
          </>
        ) : null}

        <Text style={[styles.title, { color: palette.text }]}>{step.title}</Text>
        <Text style={[styles.body, { color: palette.textMuted }]}>{step.body}</Text>

        {!hideActions ? (
          <View style={styles.actionsRow}>
            {canGoBack ? (
              <Pressable
                style={[styles.actionBtn, { borderColor: palette.border }]}
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
                accessibilityHint="Go to the previous tour step"
              >
                <Text style={[styles.actionText, { color: palette.textMuted }]}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={!canProceed}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canProceed }}
              accessibilityLabel={dismissOnly ? dismissLabel : isLastStep ? 'Get started' : 'Next'}
              accessibilityHint={dismissOnly ? 'Close the tour message' : 'Continue to the next tour step'}
              style={[
                styles.actionBtn,
                styles.actionBtnPrimary,
                { backgroundColor: canProceed ? palette.tones.teal.base : palette.tones.grey.base, opacity: canProceed ? 1 : 0.65 },
              ]}
              onPress={onNext}
            >
              <Text style={[styles.actionText, { color: palette.tones.teal.onBase }]}>
                {dismissOnly ? dismissLabel : isLastStep ? 'Get started' : 'Next'}
              </Text>
            </Pressable>
          </View>
        ) : null}
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 2, 11, 0.7)',
  },
  fadeLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  maskWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  maskBlock: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 2, 11, 0.7)',
  },
  targetHint: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: radii.md,
  },
  bubble: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    ...typography.bodySmallStrong,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  title: {
    ...typography.sectionTitle,
  },
  body: {
    ...typography.bodySmall,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  actionBtn: {
    minWidth: 84,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    borderColor: 'transparent',
  },
  actionText: {
    ...typography.buttonLabel,
  },
});
