import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { getPlatformProductBySku, getStoreProductIdsForPlatform } from './appStore';
import { logger } from '../utils/logger';
import { Application } from '../data/types';
import { getById } from '../data/sqlite';
import { persist, touch } from '../data/repo';
import { finaliseApplication } from '../utils/finaliseApplication';
import { PdfPageProgress } from '../pdf/supporting';
import { appConfig } from '../config/appConfig';
import {
  appendIapDebugLog,
  findSubmissionIdBySku,
  getPurchaseBySubmissionId,
  listPendingPurchases,
  markCancelled,
  markFailed,
  markPaid,
  upsertPurchase,
} from './storage';
import { OfflineReceiptVerifier, ReceiptVerifier, ReceiptVerificationInput } from './receiptVerifier';

type IapModule = typeof import('react-native-iap');

type IapPurchase = {
  productId: string;
  transactionId?: string;
  transactionReceipt?: string;
  transactionDate?: string | number;
  purchaseToken?: string;
  orderId?: string;
  purchaseTime?: number;
  purchaseStateAndroid?: number;
  isAcknowledgedAndroid?: boolean;
  transactionStateIOS?: number;
  [key: string]: unknown;
};

const normalizeTimestamp = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber).toISOString();
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return undefined;
};

export type PurchaseFlowResult =
  | { status: 'success'; submissionId: string; productId: string }
  | { status: 'already_paid'; submissionId: string; productId: string }
  | { status: 'in_progress'; submissionId: string; productId: string }
  | { status: 'pending'; submissionId: string; productId: string }
  | { status: 'cancelled'; submissionId: string; productId: string }
  | { status: 'failed'; submissionId: string; productId: string; message: string }
  | { status: 'not_ready'; message: string };

export type PurchaseFlowPhase = 'finalising_application_bundle';

type PurchaseRequest = {
  submissionId: string;
  sku: string;
  onPhaseChange?: (phase: PurchaseFlowPhase) => void;
  onProgressChange?: (progress: PdfPageProgress) => void;
};

const getStorePricing = async (sku: string) => {
  try {
    const products = await getProducts([sku]);
    const matched = products.find((item: { id: string }) => item.id === sku);
    if (!matched) return null;
    return {
      displayPrice: (matched as { displayPrice?: string | null }).displayPrice ?? undefined,
      price: (matched as { price?: number | null }).price ?? undefined,
      currency: (matched as { currency?: string | null }).currency ?? undefined,
    };
  } catch {
    return null;
  }
};

const getIapModule = (): IapModule | null => {
  // Expo Go cannot load custom native modules like react-native-iap.
  if ((Constants as { executionEnvironment?: string })?.executionEnvironment === 'storeClient') {
    return null;
  }
  // react-native-iap v14 depends on Nitro; avoid loading if Android native Nitro bridge is absent.
  if (Platform.OS === 'android' && !(NativeModules as Record<string, unknown>)?.NitroModules) {
    return null;
  }
  try {
    // Lazy require so the app doesn't crash if native module isn't linked yet.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-iap') as IapModule;
  } catch {
    return null;
  }
};

let connected = false;
let initPromise: Promise<void> | null = null;
let purchaseUpdateSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;
let receiptVerifier: ReceiptVerifier = new OfflineReceiptVerifier();

const pendingBySubmission = new Map<string, (result: PurchaseFlowResult) => void>();
const submissionBySku = new Map<string, string>();
const phaseListenerBySubmission = new Map<string, (phase: PurchaseFlowPhase) => void>();
const progressListenerBySubmission = new Map<string, (progress: PdfPageProgress) => void>();
const provisionalFailureTimerBySubmission = new Map<string, ReturnType<typeof setTimeout>>();
let lastRequestedSubmissionId: string | null = null;
const provisionalErrorTimeoutMs = Math.max(1, appConfig.features.iapProvisionalErrorTimeoutSeconds) * 1000;

const clearProvisionalFailure = (submissionId: string) => {
  const timer = provisionalFailureTimerBySubmission.get(submissionId);
  if (timer) {
    clearTimeout(timer);
    provisionalFailureTimerBySubmission.delete(submissionId);
  }
};

const resolvePending = (submissionId: string, result: PurchaseFlowResult) => {
  clearProvisionalFailure(submissionId);
  const resolver = pendingBySubmission.get(submissionId);
  if (resolver) {
    resolver(result);
    pendingBySubmission.delete(submissionId);
  }
  for (const [sku, mappedSubmission] of submissionBySku.entries()) {
    if (mappedSubmission === submissionId) {
      submissionBySku.delete(sku);
    }
  }
  phaseListenerBySubmission.delete(submissionId);
  progressListenerBySubmission.delete(submissionId);
};

const notifyPhase = (submissionId: string, phase: PurchaseFlowPhase) => {
  phaseListenerBySubmission.get(submissionId)?.(phase);
};

const notifyProgress = (submissionId: string, progress: PdfPageProgress) => {
  progressListenerBySubmission.get(submissionId)?.(progress);
};

const isUserCancelledError = (error: { code?: string; message?: string } | null | undefined) => {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  return (
    /cancel/i.test(code) ||
    /cancel/i.test(message) ||
    code === 'E_USER_CANCELLED' ||
    code === 'E_USER_CANCELED' ||
    code === 'USER_CANCELLED'
  );
};

const isAlreadyOwnedError = (error: { code?: string; message?: string } | null | undefined) => {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  return /already_?owned/i.test(code) || /already owned/i.test(message);
};

const isClearlyFinalPurchaseError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  if (isUserCancelledError(error) || isAlreadyOwnedError(error)) return true;
  const code = `${error.code ?? ''}`.trim().toLowerCase();
  const message = `${error.message ?? ''}`.trim().toLowerCase();
  return (
    code === 'e_iap_not_available' ||
    code === 'e_service_error' ||
    code === 'e_network_error' ||
    code === 'billing_unavailable' ||
    code === 'item_unavailable' ||
    code === 'developer_error' ||
    /billing api version is not supported/.test(message) ||
    /billing is unavailable/.test(message) ||
    /item unavailable/.test(message) ||
    /developer error/.test(message)
  );
};

const scheduleProvisionalFailure = ({
  submissionId,
  productId,
  platform,
  message,
  source,
}: {
  submissionId: string;
  productId: string;
  platform: 'ios' | 'android';
  message: string;
  source: 'requestPurchase' | 'purchaseErrorListener';
}) => {
  if (!pendingBySubmission.has(submissionId)) return;
  clearProvisionalFailure(submissionId);
  appendIapDebugLog('purchase failure deferred', {
    submissionId,
    productId,
    platform,
    source,
    timeoutMs: provisionalErrorTimeoutMs,
    message,
  });
  const timer = setTimeout(() => {
    provisionalFailureTimerBySubmission.delete(submissionId);
    if (!pendingBySubmission.has(submissionId)) return;
    appendIapDebugLog('purchase failure timeout fired', {
      submissionId,
      productId,
      platform,
      source,
      timeoutMs: provisionalErrorTimeoutMs,
      message,
    });
    markFailed(submissionId, { platform, productId });
    resolvePending(submissionId, {
      status: 'failed',
      submissionId,
      productId,
      message,
    });
  }, provisionalErrorTimeoutMs);
  provisionalFailureTimerBySubmission.set(submissionId, timer);
};

const isPendingPurchase = (purchase: IapPurchase, platform: 'ios' | 'android') => {
  if (platform === 'android') {
    return purchase.purchaseStateAndroid === 2;
  }
  if (typeof purchase.transactionStateIOS === 'number') {
    return purchase.transactionStateIOS !== 1 && purchase.transactionStateIOS !== 3;
  }
  return false;
};

const getTokenOrReceipt = (purchase: IapPurchase, platform: 'ios' | 'android') => {
  if (platform === 'android') return purchase.purchaseToken;
  return purchase.transactionReceipt;
};

const resolveSubmissionIdForPurchase = (purchase: IapPurchase): string | null => {
  const productId = purchase.productId;
  if (!productId) return null;
  const mapped = submissionBySku.get(productId);
  if (mapped) return mapped;
  return findSubmissionIdBySku(productId);
};

export const setReceiptVerifier = (verifier: ReceiptVerifier) => {
  receiptVerifier = verifier;
};

const ensureConnection = async () => {
  const iap = getIapModule();
  if (!iap) {
    throw new Error('IAP native module unavailable');
  }
  if (connected) return;
  await iap.initConnection();
  connected = true;
};

const clearPurchaseListeners = () => {
  purchaseUpdateSub?.remove();
  purchaseUpdateSub = null;
  purchaseErrorSub?.remove();
  purchaseErrorSub = null;
};

const handlePurchaseUpdate = async (purchase: IapPurchase) => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const submissionId = resolveSubmissionIdForPurchase(purchase);
  appendIapDebugLog('purchase update received', {
    platform,
    submissionId,
    productId: purchase.productId,
    transactionId: purchase.transactionId,
    transactionStateIOS: purchase.transactionStateIOS,
    purchaseStateAndroid: purchase.purchaseStateAndroid,
  });
  if (!submissionId) {
    logger.warn('[IAP] purchase update without submission mapping', {
      productId: purchase.productId,
    });
    try {
      await finalizePurchase(purchase, platform);
    } catch (error) {
      logger.warn('[IAP] finalize orphan purchase failed', error);
    }
    return;
  }

  clearProvisionalFailure(submissionId);

  const productId = purchase.productId;
  const meta = getPlatformProductBySku(productId, platform);
  const isConsumable = meta?.platform.isConsumable ?? true;

  if (isPendingPurchase(purchase, platform)) {
    appendIapDebugLog('purchase update pending', {
      submissionId,
      productId,
    });
    upsertPurchase(submissionId, {
      platform,
      productId,
      status: 'pending',
      transactionId: purchase.transactionId,
      transactionDate: normalizeTimestamp(purchase.transactionDate),
      purchaseToken: purchase.purchaseToken,
      orderId: purchase.orderId,
      purchaseTime: normalizeTimestamp(purchase.purchaseTime),
    });
    resolvePending(submissionId, { status: 'pending', submissionId, productId });
    return;
  }

  upsertPurchase(submissionId, {
    platform,
    productId,
    status: 'purchased',
    transactionId: purchase.transactionId,
    transactionDate: normalizeTimestamp(purchase.transactionDate),
    purchaseToken: purchase.purchaseToken,
    orderId: purchase.orderId,
    purchaseTime: normalizeTimestamp(purchase.purchaseTime),
  });

  const verificationPayload: ReceiptVerificationInput = {
    platform,
    sku: productId,
    transactionId: purchase.transactionId,
    tokenOrReceipt: getTokenOrReceipt(purchase, platform),
    submissionId,
  };
  let verification: { ok: boolean; reason?: string } = { ok: false, reason: 'verification_failed' };
  try {
    verification = await receiptVerifier.verify(verificationPayload);
    appendIapDebugLog('receipt verification result', {
      submissionId,
      productId,
      ok: verification.ok,
      reason: verification.reason,
    });
  } catch (error) {
    logger.warn('[IAP] receipt verification failed', error);
    appendIapDebugLog('receipt verification threw', {
      submissionId,
      productId,
      message: (error as { message?: string })?.message ?? String(error),
    });
  }

  if (!verification.ok) {
    markFailed(submissionId, {
      platform,
      productId,
      transactionId: purchase.transactionId,
      transactionDate: normalizeTimestamp(purchase.transactionDate),
      purchaseToken: purchase.purchaseToken,
      orderId: purchase.orderId,
      purchaseTime: normalizeTimestamp(purchase.purchaseTime),
    });
    resolvePending(submissionId, {
      status: 'failed',
      submissionId,
      productId,
      message: verification.reason ?? 'Receipt verification failed.',
    });
    return;
  }

  markPaid(submissionId, {
    platform,
    productId,
    transactionId: purchase.transactionId,
    transactionDate: normalizeTimestamp(purchase.transactionDate),
    purchaseToken: purchase.purchaseToken,
    orderId: purchase.orderId,
    purchaseTime: normalizeTimestamp(purchase.purchaseTime),
  });

  const latestApplication = getById<Application>(submissionId);
  if (latestApplication && latestApplication.status !== 'submitted') {
    try {
      notifyPhase(submissionId, 'finalising_application_bundle');
      appendIapDebugLog('finalising application bundle start', {
        submissionId,
        productId,
      });
      await finaliseApplication(latestApplication, {
        onProgress: (progress) => {
          notifyProgress(submissionId, progress);
        },
      });
      appendIapDebugLog('finalising application bundle complete', {
        submissionId,
        productId,
      });
    } catch (error) {
      logger.warn('[IAP] finalise application failed after verified payment', error);
      appendIapDebugLog('finalising application bundle failed', {
        submissionId,
        productId,
        message: (error as { message?: string })?.message ?? String(error),
      });
      const fallback = touch({
        ...latestApplication,
        status: 'submitted',
        paymentReceived: true,
      } as Application);
      persist(fallback);
    }
  }

  try {
    await finalizePurchase(purchase, platform, isConsumable);
    appendIapDebugLog('finishTransaction complete', {
      submissionId,
      productId,
      platform,
    });
  } catch (error) {
    logger.warn('[IAP] finalize purchase failed', error);
    appendIapDebugLog('finishTransaction failed', {
      submissionId,
      productId,
      platform,
      message: (error as { message?: string })?.message ?? String(error),
    });
  }

  appendIapDebugLog('purchase resolved success', {
    submissionId,
    productId,
  });
  resolvePending(submissionId, { status: 'success', submissionId, productId });
};

const resolveFallbackSubmission = () => {
  if (pendingBySubmission.size === 1) {
    return Array.from(pendingBySubmission.keys())[0] ?? null;
  }
  if (lastRequestedSubmissionId && pendingBySubmission.has(lastRequestedSubmissionId)) {
    return lastRequestedSubmissionId;
  }
  return null;
};

const handlePurchaseError = (error: { code?: string; message?: string; productId?: string }) => {
  const productId = error.productId;
  const submissionId = productId ? resolveSubmissionIdForPurchase({ productId }) : resolveFallbackSubmission();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  appendIapDebugLog('purchase error listener', {
    submissionId,
    productId,
    code: error.code,
    message: error.message,
  });
  if (!submissionId) return;
  const stored = getPurchaseBySubmissionId(submissionId);
  const resolvedProductId = productId ?? stored?.productId;
  if (!resolvedProductId) return;
  if (isUserCancelledError(error)) {
    markCancelled(submissionId, { platform, productId: resolvedProductId });
    resolvePending(submissionId, { status: 'cancelled', submissionId, productId: resolvedProductId });
    return;
  }
  if (isAlreadyOwnedError(error)) {
    reconcilePurchases().catch((reconcileError) =>
      logger.warn('[IAP] reconcile after already-owned purchase error failed', reconcileError),
    );
    return;
  }
  if (!isClearlyFinalPurchaseError(error) && pendingBySubmission.has(submissionId)) {
    scheduleProvisionalFailure({
      submissionId,
      productId: resolvedProductId,
      platform,
      source: 'purchaseErrorListener',
      message: error.message ?? 'Purchase failed.',
    });
    return;
  }
  markFailed(submissionId, { platform, productId: resolvedProductId });
  resolvePending(submissionId, {
    status: 'failed',
    submissionId,
    productId: resolvedProductId,
    message: error.message ?? 'Purchase failed.',
  });
};

const reconcilePurchases = async () => {
  const iap = getIapModule();
  if (!iap) return;
  try {
    const available = await iap.getAvailablePurchases();
    for (const purchase of available as unknown as IapPurchase[]) {
      await handlePurchaseUpdate(purchase);
    }
  } catch (error) {
    logger.warn('[IAP] reconcile purchases failed', error);
  }
};

export const initIap = async (verifier?: ReceiptVerifier) => {
  if (verifier) setReceiptVerifier(verifier);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const iap = getIapModule();
    if (!iap) {
      throw new Error('IAP native module unavailable');
    }
    await ensureConnection();
    if (!purchaseUpdateSub) {
      purchaseUpdateSub = iap.purchaseUpdatedListener((purchase) => {
        handlePurchaseUpdate(purchase as unknown as IapPurchase).catch((error) =>
          logger.warn('[IAP] purchase update handler failed', error),
        );
      });
    }
    if (!purchaseErrorSub) {
      purchaseErrorSub = iap.purchaseErrorListener((error) => {
        handlePurchaseError(error as { code?: string; message?: string; productId?: string });
      });
    }
    await reconcilePurchases();
    const pending = listPendingPurchases();
    if (pending.length) {
      logger.warn('[IAP] pending purchases on init', {
        count: pending.length,
        submissions: pending.map((p) => p.submissionId),
      });
    }
  })();
  return initPromise;
};

export const getProducts = async (productIds?: string[]) => {
  const iap = getIapModule();
  if (!iap) return [];
  await initIap();
  const skus =
    productIds?.length
      ? productIds
      : getStoreProductIdsForPlatform(Platform.OS === 'ios' ? 'ios' : 'android');
  logger.warn('[IAP] fetchProducts', { skus });
  const products = (await iap.fetchProducts({ skus, type: 'in-app' })) ?? [];
  logger.warn('[IAP] fetchProducts result', {
    count: products.length,
    ids: products.map((item: { id: string }) => item.id),
  });
  return products;
};

export const purchaseForSubmission = async ({
  submissionId,
  sku,
  onPhaseChange,
  onProgressChange,
}: PurchaseRequest): Promise<PurchaseFlowResult> => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const iap = getIapModule();
  if (!iap) {
    return { status: 'not_ready', message: 'IAP native module unavailable' };
  }
  try {
    await initIap();
  } catch (error) {
    return {
      status: 'not_ready',
      message: (error as { message?: string })?.message ?? 'IAP init failed.',
    };
  }

  const existing = getPurchaseBySubmissionId(submissionId);
  if (existing?.status === 'verified') {
    appendIapDebugLog('purchase short-circuit already_paid', {
      submissionId,
      sku,
      existingStatus: existing.status,
    });
    return { status: 'already_paid', submissionId, productId: existing.productId };
  }
  if (existing?.status === 'pending' || existing?.status === 'purchased') {
    appendIapDebugLog('purchase short-circuit in_progress', {
      submissionId,
      sku,
      existingStatus: existing.status,
    });
    return { status: 'in_progress', submissionId, productId: existing.productId };
  }

  const pricing = await getStorePricing(sku);
  upsertPurchase(submissionId, {
    platform,
    productId: sku,
    status: 'pending',
    displayPrice: pricing?.displayPrice,
    price: pricing?.price,
    currency: pricing?.currency,
  });

  submissionBySku.set(sku, submissionId);
  if (onPhaseChange) {
    phaseListenerBySubmission.set(submissionId, onPhaseChange);
  } else {
    phaseListenerBySubmission.delete(submissionId);
  }
  if (onProgressChange) {
    progressListenerBySubmission.set(submissionId, onProgressChange);
  } else {
    progressListenerBySubmission.delete(submissionId);
  }
  lastRequestedSubmissionId = submissionId;

  const pendingPromise = new Promise<PurchaseFlowResult>((resolve) => {
    pendingBySubmission.set(submissionId, resolve);
  });

  logger.warn('[IAP] requestPurchase', { submissionId, sku });
  appendIapDebugLog('requestPurchase start', {
    submissionId,
    sku,
    platform,
  });
  try {
    await iap.requestPurchase({
      request: platform === 'ios' ? { apple: { sku } } : { google: { skus: [sku] } },
      type: 'in-app',
    });
    appendIapDebugLog('requestPurchase call returned', {
      submissionId,
      sku,
      platform,
    });
  } catch (error) {
    logger.warn('[IAP] requestPurchase failed', error);
    appendIapDebugLog('requestPurchase threw', {
      submissionId,
      sku,
      platform,
      code: (error as { code?: string })?.code,
      message: (error as { message?: string })?.message ?? String(error),
    });
    if (isUserCancelledError(error as { code?: string; message?: string })) {
      markCancelled(submissionId, { platform, productId: sku });
      resolvePending(submissionId, { status: 'cancelled', submissionId, productId: sku });
      return pendingPromise;
    }
    if (isAlreadyOwnedError(error as { code?: string; message?: string })) {
      await reconcilePurchases();
      const updated = getPurchaseBySubmissionId(submissionId);
      if (updated?.status === 'verified') {
        resolvePending(submissionId, { status: 'success', submissionId, productId: sku });
        return pendingPromise;
      }
    }
    const purchaseError = error as { code?: string; message?: string };
    if (!isClearlyFinalPurchaseError(purchaseError) && pendingBySubmission.has(submissionId)) {
      scheduleProvisionalFailure({
        submissionId,
        productId: sku,
        platform,
        source: 'requestPurchase',
        message: purchaseError.message ?? 'Purchase failed.',
      });
      return pendingPromise;
    }
    markFailed(submissionId, { platform, productId: sku });
    resolvePending(submissionId, {
      status: 'failed',
      submissionId,
      productId: sku,
      message: purchaseError.message ?? 'Purchase failed.',
    });
  }

  return pendingPromise;
};

export const finalizePurchase = async (
  purchase: IapPurchase,
  platform: 'ios' | 'android',
  isConsumableOverride?: boolean,
) => {
  const iap = getIapModule();
  if (!iap) {
    throw new Error('IAP native module unavailable');
  }
  const meta = getPlatformProductBySku(purchase.productId, platform);
  const isConsumable = typeof isConsumableOverride === 'boolean' ? isConsumableOverride : meta?.platform.isConsumable ?? true;
  await iap.finishTransaction({ purchase: purchase as unknown as import('react-native-iap').Purchase, isConsumable });
};

export const shutdownIap = async () => {
  clearPurchaseListeners();
  provisionalFailureTimerBySubmission.forEach((timer) => clearTimeout(timer));
  provisionalFailureTimerBySubmission.clear();
  connected = false;
  initPromise = null;
  const iap = getIapModule();
  if (!iap) return;
  try {
    await iap.endConnection();
  } catch {
    // Ignore disconnect errors.
  }
};
