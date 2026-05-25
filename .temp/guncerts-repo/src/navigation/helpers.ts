import type { Href } from 'expo-router';
import configJson from './config.json';

export type NavContext = {
  returnTo?: string | null;
  origin?: string | null;
  onComplete?: string | null;
  routeBack?: string | null;
  clearRouteBackHistory?: boolean | null;
  noChangesRouteBack?: string | null;
  saveDecisionResolved?: boolean | null;
};

type Config = {
  home: string;
  lists: {
    draft: string;
    ready: string;
    submitted: string;
    archived: string;
  };
  profile: string;
  documents?: {
    base?: string;
    applicationDocuments?: string;
    sources?: Record<
      string,
      {
        routeBack: string;
        noChangesRouteBack?: string;
        clearRouteBackHistory?: boolean;
      }
    >;
  };
  wizards?: Record<
    string,
    Array<{
      sourceScreen: string;
      routeTo: string;
      routeBack: string;
      clearRouteBackHistory?: boolean;
    }>
  >;
};

const cfg = configJson as Config;

const normalizePath = (value?: string | null, fallback?: string): string | undefined => {
  if (!value && value !== '') return fallback;
  const trimmed = `${value ?? ''}`.trim();
  if (!trimmed) return fallback;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  if (!decoded.startsWith('/')) {
    decoded = `/${decoded}`;
  }
  // collapse group route aliases
  if (decoded === '/(tabs)' || decoded === '/(tabs)/index' || decoded === '/index') {
    return cfg.home;
  }
  return decoded;
};

const toHref = (target?: string | null): Href => {
  const raw = `${target ?? ''}`.trim();
  if (!raw) return cfg.home as Href;
  const queryIndex = raw.indexOf('?');
  if (queryIndex < 0) {
    return normalizePath(raw, cfg.home) as Href;
  }
  const pathnameRaw = raw.slice(0, queryIndex);
  const queryRaw = raw.slice(queryIndex + 1);
  const pathname = normalizePath(pathnameRaw, cfg.home) || cfg.home;
  const search = new URLSearchParams(queryRaw);
  const params: Record<string, string> = {};
  search.forEach((value, key) => {
    params[key] = value;
  });
  return { pathname: pathname as any, params } as Href;
};

export const decodeNav = (nav?: Partial<NavContext> | null): NavContext => ({
  returnTo: normalizePath(nav?.returnTo),
  origin: normalizePath(nav?.origin),
  onComplete: normalizePath(nav?.onComplete),
  routeBack: normalizePath(nav?.routeBack),
  noChangesRouteBack: normalizePath((nav as any)?.noChangesRouteBack),
  saveDecisionResolved: typeof nav?.saveDecisionResolved === 'boolean' ? nav.saveDecisionResolved : null,
  clearRouteBackHistory: nav?.clearRouteBackHistory ?? null,
});

export const defaults = {
  home: cfg.home,
  lists: cfg.lists,
  profile: cfg.profile,
};

export const statusToListPath = (status?: string | null): Href => {
  if (status === 'submitted') return cfg.lists.submitted as Href;
  if (status === 'archived') return cfg.lists.archived as Href;
  if (status === 'ready') return cfg.lists.ready as Href;
  return cfg.lists.draft as Href;
};

const substituteParams = (path: string, params: Record<string, string | number | undefined>) => {
  return path.replace(/\[([^\]]+)\]/g, (_, key) => {
    const v = params[key];
    return v === undefined ? '' : String(v);
  });
};

const resolveDocumentsBase = () => {
  return cfg.documents?.base || (cfg.documents as any)?.applicationDocuments || '/application/[id]/documents';
};

type DocumentRoute = {
  routeTo: string;
  routeBack: string;
  noChangesRouteBack?: string | null;
  clearRouteBackHistory: boolean;
};

export const resolveDocumentsNav = (
  source?: string | null,
  params: Record<string, string | number | undefined> = {},
  overrides?: Partial<NavContext>
): DocumentRoute => {
  const baseCfg = source && cfg.documents?.sources ? cfg.documents.sources[source] : undefined;
  const defaultRouteBack = substituteParams(baseCfg?.routeBack ?? cfg.lists.draft, params);
  const noChangesRouteBack = baseCfg?.noChangesRouteBack
    ? substituteParams(baseCfg.noChangesRouteBack, params)
    : null;
  const nav = decodeNav({
    ...overrides,
    routeBack: overrides?.routeBack ?? defaultRouteBack,
    clearRouteBackHistory: baseCfg?.clearRouteBackHistory,
  });
  return {
    routeTo: substituteParams(resolveDocumentsBase(), params),
    routeBack: nav.routeBack || '',
    noChangesRouteBack: noChangesRouteBack ? normalizePath(noChangesRouteBack) ?? null : null,
    clearRouteBackHistory: nav.clearRouteBackHistory ?? true,
  };
};

type WizardRoute = {
  routeTo: string;
  routeBack: string;
  clearRouteBackHistory: boolean;
};

export const resolveWizardRoute = (
  wizardType: string,
  sourceScreen: string,
  params: Record<string, string | number | undefined> = {}
): WizardRoute | null => {
  const entries = cfg.wizards?.[wizardType];
  if (!entries) return null;
  const match = entries.find(e => e.sourceScreen === sourceScreen) ?? entries[0];
  if (!match) return null;
  const routeTo = substituteParams(match.routeTo, params);
  const routeBack = substituteParams(match.routeBack, params);
  return {
    routeTo,
    routeBack,
    clearRouteBackHistory: !!match.clearRouteBackHistory,
  };
};

export const backOrReplaceWithContext = (
  router: { back: () => void; replace: (href: Href) => void; canGoBack?: () => boolean; push?: (href: Href) => void },
  nav?: NavContext,
  fallback?: Href
) => {
  const target = nav?.routeBack || nav?.returnTo || nav?.origin || fallback || (cfg.home as Href);
  const shouldReplace = nav?.clearRouteBackHistory ?? true;
  const href = typeof target === 'string' ? toHref(target) : target;
  if (!shouldReplace) {
    const canGoBack = typeof router?.canGoBack === 'function' ? router.canGoBack() : false;
    if (canGoBack) {
      router.back();
      return;
    }
    if (typeof router.push === 'function') {
      router.push(href as Href);
      return;
    }
  }
  if (!shouldReplace && typeof router.push === 'function') {
    router.push(href as Href);
    return;
  }
  router.replace(href as Href);
};

export const buildDocumentsRoute = (opts: {
  id: string | number;
  mode?: string | null;
  anchor?: string | null;
  nav?: Partial<NavContext> | null;
}) => {
  const pathname = substituteParams(resolveDocumentsBase(), { id: opts.id });
  const params: Record<string, any> = {};
  if (opts.mode) params.mode = opts.mode;
  if (opts.anchor) params.anchor = opts.anchor;
  if (opts.nav) params.nav = JSON.stringify(opts.nav);
  return { pathname, params };
};

export const closeTo = (
  router: { replace: (href: Href) => void; push?: (href: Href) => void },
  target?: string | null,
  opts?: { useReplace?: boolean }
) => {
  const path = toHref(target);
  const useReplace = opts?.useReplace ?? true;
  if (!useReplace && typeof router.push === 'function') {
    router.push(path);
    return;
  }
  router.replace(path);
};
