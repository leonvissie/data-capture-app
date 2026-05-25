type ThemeModeListener = () => void;

const listeners = new Set<ThemeModeListener>();

export const subscribeThemeModeStorageChange = (listener: ThemeModeListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyThemeModeStorageChange = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener failures so one subscriber cannot block others.
    }
  });
};
