import { useCallback, useRef } from 'react';

type AnchorFocusFn = () => void;

export function useValidationAnchors() {
  const mapRef = useRef(new Map<string, AnchorFocusFn>());

  const registerAnchor = useCallback((key: string, focus: AnchorFocusFn) => {
    mapRef.current.set(key, focus);
    return () => {
      mapRef.current.delete(key);
    };
  }, []);

  const focusAnchor = useCallback((key?: string) => {
    if (!key) return;
    mapRef.current.get(key)?.();
  }, []);

  return { registerAnchor, focusAnchor };
}
