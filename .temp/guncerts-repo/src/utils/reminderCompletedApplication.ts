import type { Application } from '../data/types';
import { resolveTerminalReminderApplications, type ReminderRenewalItemType } from './reminderApplicationResolution';

type ReminderReadyActionsRoute = {
  pathname: '/application/[id]/ready-actions';
  params: Record<string, string>;
};

export type PrepareReminderCompletedApplicationResult =
  | {
      kind: 'none';
      form: '517g' | '518a';
      applications: [];
    }
  | {
      kind: 'single';
      application: Application;
      route: ReminderReadyActionsRoute;
    }
  | {
      kind: 'multiple';
      form: '517g' | '518a';
      applications: Application[];
    };

const buildOriginNav = (returnTo: string) =>
  encodeURIComponent(
    JSON.stringify({
      returnTo,
      routeBack: returnTo,
      origin: returnTo,
      clearRouteBackHistory: true,
    }),
  );

const listPathForStatus = (status?: string | null) =>
  status === 'archived' ? '/application/archive' : '/application/submitted';

export const prepareReminderCompletedApplication = (
  itemType: ReminderRenewalItemType,
  itemId: string,
  returnTo = '/(tabs)',
): PrepareReminderCompletedApplicationResult => {
  const resolved = resolveTerminalReminderApplications(itemType, itemId);

  if (resolved.kind === 'multiple') {
    return {
      kind: 'multiple',
      form: resolved.form,
      applications: resolved.applications,
    };
  }

  if (resolved.kind === 'none') {
    return {
      kind: 'none',
      form: resolved.form,
      applications: [],
    };
  }

  const application = resolved.applications[0];

  return {
    kind: 'single',
    application,
    route: {
      pathname: '/application/[id]/ready-actions',
      params: {
        id: String(application.id),
        nav: JSON.stringify({
          returnTo,
          routeBack: returnTo,
          origin: returnTo,
          clearRouteBackHistory: true,
        }),
        hideHome: '1',
      },
    },
  };
};

export const buildReminderCompletedListRoute = (
  status: 'submitted' | 'archived',
  returnTo = '/(tabs)',
) => {
  const pathname = status === 'archived' ? '/application/archive' : '/application/submitted';
  return {
    pathname,
    params: {
      nav: buildOriginNav(returnTo),
      hideHome: '1',
    },
  } as const;
};
