import { Application } from '../data/types';
import { getById, listByType } from '../data/sqlite';
import { now, persist, touch } from '../data/repo';
import { logger } from '../utils/logger';

const debugLog: string[] = [];

export const getIapDebugLog = (): string[] => [...debugLog];

export const clearIapDebugLog = () => {
  debugLog.length = 0;
};

const pushDebugLog = (line: string) => {
  debugLog.push(line);
  if (debugLog.length > 20) debugLog.shift();
};

export const appendIapDebugLog = (message: string, data?: Record<string, unknown>) => {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  const line = `[IAP] ${message}${payload}`;
  pushDebugLog(line);
  logger.warn(line);
};

export type PurchaseRecord = NonNullable<Application['iap']> & {
  submissionId: string;
};

const ensureApplication = (submissionId: string): Application | null => {
  const app = getById<Application>(submissionId);
  if (!app) {
    logger.warn('[IAP] missing application for submission', { submissionId });
    return null;
  }
  return app;
};

const updateApplicationIap = (
  application: Application,
  nextIap: NonNullable<Application['iap']>,
  paymentReceived?: boolean,
): PurchaseRecord => {
  logger.warn('[IAP] updateApplicationIap', {
    applicationId: application.id,
    status: nextIap.status,
    productId: nextIap.productId,
    paymentReceived,
  });
  pushDebugLog(
    `[IAP] updateApplicationIap app=${application.id} status=${nextIap.status} product=${nextIap.productId} paymentReceived=${String(
      paymentReceived ?? application.paymentReceived ?? 'n/a',
    )}`,
  );
  const updated: Application = {
    ...application,
    iap: nextIap,
    paymentReceived: typeof paymentReceived === 'boolean' ? paymentReceived : application.paymentReceived,
  };
  persist(touch(updated));
  return { ...nextIap, submissionId: application.id };
};

export const getPurchaseBySubmissionId = (submissionId: string): PurchaseRecord | null => {
  const app = ensureApplication(submissionId);
  if (!app || !app.iap) return null;
  return { ...app.iap, submissionId: app.id };
};

export const findSubmissionIdBySku = (productId: string): string | null => {
  const apps = listByType<Application>('Application');
  const match =
    apps.find((app) => app.iap?.productId === productId && (app.iap.status === 'pending' || app.iap.status === 'purchased')) ??
    apps.find((app) => app.iap?.productId === productId);
  return match?.id ?? null;
};

export const upsertPurchase = (
  submissionId: string,
  next: Partial<NonNullable<Application['iap']>> & {
    platform: 'ios' | 'android';
    productId: string;
    status: NonNullable<Application['iap']>['status'];
  },
): PurchaseRecord | null => {
  const app = ensureApplication(submissionId);
  if (!app) return null;
  const existing = app.iap ?? {
    platform: next.platform,
    productId: next.productId,
    status: next.status,
  };
  const updated: NonNullable<Application['iap']> = {
    ...existing,
    ...next,
    lastCheckedAt: now(),
  };
  return updateApplicationIap(app, updated);
};

export const markPaid = (
  submissionId: string,
  details?: Partial<NonNullable<Application['iap']>>,
): PurchaseRecord | null => {
  const app = ensureApplication(submissionId);
  if (!app) return null;
  const current = app.iap;
  if (!current) return null;
  const updated: NonNullable<Application['iap']> = {
    ...current,
    ...details,
    status: 'verified',
    lastCheckedAt: now(),
  };
  return updateApplicationIap(app, updated, true);
};

export const markCancelled = (
  submissionId: string,
  details?: Partial<NonNullable<Application['iap']>>,
): PurchaseRecord | null => {
  const app = ensureApplication(submissionId);
  if (!app) return null;
  const current = app.iap;
  if (!current) return null;
  const updated: NonNullable<Application['iap']> = {
    ...current,
    ...details,
    status: 'cancelled',
    lastCheckedAt: now(),
  };
  return updateApplicationIap(app, updated, false);
};

export const markFailed = (
  submissionId: string,
  details?: Partial<NonNullable<Application['iap']>>,
): PurchaseRecord | null => {
  const app = ensureApplication(submissionId);
  if (!app) return null;
  const current = app.iap;
  if (!current) return null;
  const updated: NonNullable<Application['iap']> = {
    ...current,
    ...details,
    status: 'failed',
    lastCheckedAt: now(),
  };
  return updateApplicationIap(app, updated, false);
};

export const listPendingPurchases = (): PurchaseRecord[] => {
  return listByType<Application>('Application')
    .filter((app) => app.iap?.status === 'pending' || app.iap?.status === 'purchased')
    .map((app) => ({ ...(app.iap as NonNullable<Application['iap']>), submissionId: app.id }));
};
