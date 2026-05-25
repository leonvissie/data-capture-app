import type { Href } from 'expo-router';

type RouterLike = {
  back: () => void;
  replace: (href: Href) => void;
  canGoBack?: () => boolean;
};

// Decode a possibly URI-encoded return path and ensure a leading slash.
export const normalizeReturnTo = (
  value?: string | string[] | null,
  fallback: Href = '/(tabs)' as Href
): Href => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return fallback;
  const trimmed = `${raw}`.trim();
  if (!trimmed) return fallback;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  if (decoded && !decoded.startsWith('/')) {
    decoded = `/${decoded}`;
  }
  if (decoded === '/(tabs)' || decoded === '/(tabs)/index' || decoded === '/index') {
    return '/(tabs)' as Href;
  }
  return decoded as Href;
};

export const canNavigateBack = (router?: RouterLike | null) => {
  const fn = router?.canGoBack;
  return typeof fn === 'function' ? fn.call(router) : false;
};

export const backOrReplace = (router: RouterLike, fallback: Href = '/(tabs)' as Href) => {
  if (canNavigateBack(router)) {
    router.back();
    return;
  }
  router.replace(fallback);
};
