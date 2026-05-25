import { useCallback, useMemo, useState } from 'react';

export type UseHelpModalReturn = {
  isVisible: boolean;
  topicKey: string | null;
  open: (key: string) => void;
  close: () => void;
  props: {
    visible: boolean;
    topicKey: string | null;
    onClose: () => void;
  };
};

/**
 * Convenience hook so screens can open the help modal with a single call.
 */
export const useHelpModal = (initialKey: string | null = null): UseHelpModalReturn => {
  const [topicKey, setTopicKey] = useState<string | null>(initialKey);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const open = useCallback((key: string) => {
    setTopicKey(key);
    setIsVisible(true);
  }, []);

  const close = useCallback(() => setIsVisible(false), []);

  const props = useMemo(
    () => ({
      visible: isVisible,
      topicKey,
      onClose: close,
    }),
    [isVisible, topicKey, close],
  );

  return { isVisible, topicKey, open, close, props };
};

export default useHelpModal;
