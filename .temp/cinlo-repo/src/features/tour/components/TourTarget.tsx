import React, { useCallback, useEffect, useRef } from 'react';
import { InteractionManager, Platform, View, type ViewProps } from 'react-native';

import { useTour } from '@/providers';

export function TourTarget({
  targetId,
  measureVersion = 0,
  children,
  ...rest
}: ViewProps & { targetId: string; measureVersion?: number }) {
  const { registerTargetLayout, activeTargetId, targetEpoch } = useTour();
  const ref = useRef<View>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const isActiveTarget = activeTargetId === targetId;

  const measure = useCallback(() => {
    // Android can report incorrect window Y for views inside virtualized/scroll containers.
    // Prefer pageX/pageY there; keep measureInWindow on iOS.
    if (Platform.OS === 'android') {
      ref.current?.measure((_, __, width, height, pageX, pageY) => {
        if (!width || !height) return;
        registerTargetLayout(targetId, { x: pageX, y: pageY, width, height });
      });
      return;
    }

    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        registerTargetLayout(targetId, { x, y, width, height });
        return;
      }

      // Fallback path for rare layout timing cases.
      ref.current?.measure((_, __, w, h, pageX, pageY) => {
        if (!w || !h) return;
        registerTargetLayout(targetId, { x: pageX, y: pageY, width: w, height: h });
      });
    });
  }, [registerTargetLayout, targetId]);

  useEffect(() => {
    if (!isActiveTarget) {
      registerTargetLayout(targetId, null);
      return;
    }

    const timer = setTimeout(measure, 0);
    retryTimerRef.current = setTimeout(measure, 90);
    interactionTaskRef.current = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(measure);
    });
    return () => {
      clearTimeout(timer);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      interactionTaskRef.current?.cancel?.();
      registerTargetLayout(targetId, null);
    };
  }, [isActiveTarget, measure, measureVersion, registerTargetLayout, targetEpoch, targetId]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={() => {
        if (!isActiveTarget) return;
        requestAnimationFrame(measure);
      }}
      {...rest}
    >
      {children}
    </View>
  );
}
