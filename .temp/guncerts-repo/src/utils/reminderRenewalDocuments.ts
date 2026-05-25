import type { Application, Profile } from '../data/types';
import { getFirstProfile } from '../data/sqlite';
import { createApplication } from '../data/defaults';
import { persist } from '../data/repo';
import { seedDocsFor } from '../config/docSeed';
import { linkExistingProfileProofs } from './profileProofs';
import { buildDocumentsRoute } from '../navigation/helpers';
import {
  ReminderRenewalItemType,
  resolveActiveReminderApplications,
} from './reminderApplicationResolution';

type ReminderDocumentsNav = ReturnType<typeof buildDocumentsRoute>;
type ReminderReadyActionsRoute = {
  pathname: '/application/[id]/ready-actions';
  params: Record<string, string>;
};

export type PrepareReminderRenewalDocumentsResult =
  | {
      kind: 'openedExisting';
      application: Application;
      route: ReminderDocumentsNav | ReminderReadyActionsRoute;
    }
  | {
      kind: 'created';
      application: Application;
      route: ReminderDocumentsNav;
    }
  | {
      kind: 'multiple';
      form: '517g' | '518a';
      applications: Application[];
    };

const buildReminderDocumentsNav = (
  applicationId: string,
  returnTo: string,
  mode: 'new' | 'edit'
): ReminderDocumentsNav =>
  buildDocumentsRoute({
    id: applicationId,
    mode,
    nav: {
      returnTo,
      routeBack: returnTo,
      onComplete: returnTo,
      origin: returnTo,
      noChangesRouteBack: mode === 'new' ? returnTo : undefined,
      clearRouteBackHistory: true,
    },
  });

const buildReminderReadyActionsRoute = (
  applicationId: string,
  returnTo: string,
): ReminderReadyActionsRoute => ({
  pathname: '/application/[id]/ready-actions',
  params: {
    id: applicationId,
    nav: JSON.stringify({
      returnTo,
      routeBack: returnTo,
      origin: returnTo,
      clearRouteBackHistory: true,
    }),
  },
});

const seedRenewalApplication = (
  profile: Profile,
  itemType: ReminderRenewalItemType,
  itemId: string
): Application => {
  const form = itemType === 'competency' ? '517g' : '518a';
  const base = createApplication(form, {
    status: 'draft',
    paymentReceived: false,
    applicantProfileId: profile.id,
    selectedFirearmIds: itemType === 'firearm' ? [itemId] : [],
    competencyCertificateIds: itemType === 'competency' ? [itemId] : [],
    membershipIds: [],
    requireMembership: false,
    safeIds: [],
  });
  const seededDocs = seedDocsFor(base, profile);
  const docs = linkExistingProfileProofs(seededDocs, profile);
  const next = { ...base, docs } as Application;
  persist(next);
  return next;
};

export const prepareReminderRenewalDocuments = (
  itemType: ReminderRenewalItemType,
  itemId: string,
  returnTo = '/(tabs)'
): PrepareReminderRenewalDocumentsResult => {
  const resolved = resolveActiveReminderApplications(itemType, itemId);

  if (resolved.kind === 'multiple') {
    return {
      kind: 'multiple',
      form: resolved.form,
      applications: resolved.applications,
    };
  }

  if (resolved.kind === 'single') {
    const application = resolved.applications[0];
    return {
      kind: 'openedExisting',
      application,
      route:
        application.status === 'ready'
          ? buildReminderReadyActionsRoute(String(application.id), returnTo)
          : buildReminderDocumentsNav(String(application.id), returnTo, 'edit'),
    };
  }

  const profile = getFirstProfile();
  if (!profile) {
    throw new Error('No profile found to create a renewal application.');
  }

  const application = seedRenewalApplication(profile, itemType, itemId);
  return {
    kind: 'created',
    application,
    route: buildReminderDocumentsNav(String(application.id), returnTo, 'new'),
  };
};
