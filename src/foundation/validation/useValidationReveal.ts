import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import type { RefObject } from 'react';

type AnchorFocusFn = () => void;

export function useValidationReveal(scrollRef: RefObject<ScrollView | null>) {
  const focusMapRef = useRef(new Map<string, AnchorFocusFn>());
  const layoutMapRef = useRef(new Map<string, number>());

  const registerAnchor = useCallback((key: string, focus: AnchorFocusFn) => {
    focusMapRef.current.set(key, focus);
    return () => {
      focusMapRef.current.delete(key);
    };
  }, []);

  const registerFieldLayout = useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      layoutMapRef.current.set(key, event.nativeEvent.layout.y);
    },
    [],
  );

  const focusAnchor = useCallback(
    (key?: string) => {
      if (!key) return;
      const y = layoutMapRef.current.get(key);
      if (typeof y === 'number') {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
      }
      focusMapRef.current.get(key)?.();
    },
    [scrollRef],
  );

  return { registerAnchor, registerFieldLayout, focusAnchor };
}
