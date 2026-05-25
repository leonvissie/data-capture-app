import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import FeedbackModal from '../components/FeedbackModal';

type FeedbackOpenOptions = {
  screenTitle?: string | null;
  screenRoute?: string | null;
  openedFrom?: string | null;
  closeTo?: string | null;
};

type FeedbackContextValue = {
  openFeedback: (options?: FeedbackOpenOptions) => void;
  closeFeedback: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue>({
  openFeedback: () => {},
  closeFeedback: () => {},
});

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [screenTitle, setScreenTitle] = useState<string | null>(null);
  const [screenRoute, setScreenRoute] = useState<string | null>(null);
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const [closeTo, setCloseTo] = useState<string | null>(null);

  const openFeedback = useCallback((options?: FeedbackOpenOptions) => {
    setScreenTitle(options?.screenTitle ?? null);
    setScreenRoute(options?.screenRoute ?? null);
    setOpenedFrom(options?.openedFrom ?? null);
    setCloseTo(options?.closeTo ?? null);
    setVisible(true);
  }, []);

  const closeFeedback = useCallback(() => {
    setVisible(false);
  }, []);

  const value = useMemo(
    () => ({
      openFeedback,
      closeFeedback,
    }),
    [openFeedback, closeFeedback],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackModal
        visible={visible}
        onClose={closeFeedback}
        screenTitle={screenTitle}
        screenRoute={screenRoute}
        openedFrom={openedFrom}
        closeTo={closeTo}
      />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
