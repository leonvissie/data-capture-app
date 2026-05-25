import { getPlatformProductBySku, getStoreProductIdsForPlatform } from './appStore';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
type IapModule = typeof import('react-native-iap');

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
import { logger } from '../utils/logger';

export type PurchaseResult =
  | { status: 'success'; productId: string }
  | { status: 'unsupported'; message: string }
  | { status: 'not_ready'; message: string };

export type IapProduct = {
  id: string;
  platform: 'ios' | 'android';
  displayPrice?: string | null;
  price?: number | null;
  currency?: string | null;
};

export type PurchaseProvider = {
  platform: 'ios' | 'android';
  getProducts: (skus?: string[]) => Promise<IapProduct[]>;
  purchase: (productId: string) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
};

let connected = false;
let purchaseUpdateSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;

const clearPurchaseListeners = () => {
  purchaseUpdateSub?.remove();
  purchaseUpdateSub = null;
  purchaseErrorSub?.remove();
  purchaseErrorSub = null;
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

const waitForPurchase = (expectedProductId: string, platform: 'ios' | 'android') =>
  new Promise<PurchaseResult>((resolve) => {
    const iap = getIapModule();
    if (!iap) {
      resolve({
        status: 'not_ready',
        message: 'IAP native module unavailable',
      });
      return;
    }
    clearPurchaseListeners();
    purchaseUpdateSub = iap.purchaseUpdatedListener(async (purchase) => {
      if (purchase.productId !== expectedProductId) return;
      const meta = getPlatformProductBySku(expectedProductId, platform);
      const isConsumable = meta?.platform.isConsumable ?? true;
      try {
        await iap.finishTransaction({ purchase, isConsumable });
      } catch {
        // Even if finishing fails, we still surface success for now.
      }
      clearPurchaseListeners();
      resolve({ status: 'success', productId: purchase.productId });
    });
    purchaseErrorSub = iap.purchaseErrorListener((error) => {
      clearPurchaseListeners();
      resolve({
        status: 'not_ready',
        message: error.message ?? 'Purchase failed.',
      });
    });
  });

const findMatchingPurchase = (
  result: unknown,
  expectedProductId: string,
): { productId: string } | null => {
  if (!result) return null;
  if (Array.isArray(result)) {
    return (result.find((item) => item && (item as { productId?: string }).productId === expectedProductId) ??
      null) as { productId: string } | null;
  }
  if ((result as { productId?: string }).productId === expectedProductId) {
    return result as { productId: string };
  }
  return null;
};

const createIosProvider = (): PurchaseProvider => ({
  platform: 'ios',
  getProducts: async (requestedSkus?: string[]) => {
    const iap = getIapModule();
    if (!iap) return [];
    await ensureConnection();
    const skus = requestedSkus?.length ? requestedSkus : getStoreProductIdsForPlatform('ios');
    logger.warn('[IAP] fetchProducts', { skus });
    const products = (await iap.fetchProducts({ skus, type: 'in-app' })) ?? [];
    logger.warn('[IAP] fetchProducts result', {
      count: products.length,
      ids: products.map((item) => item.id),
    });
    return products.map((item) => ({
      id: item.id,
      platform: 'ios',
      displayPrice: item.displayPrice ?? null,
      price: item.price ?? null,
      currency: item.currency ?? null,
    }));
  },
  purchase: async (productId: string) => {
    const iap = getIapModule();
    if (!iap) {
      return { status: 'not_ready', message: 'IAP native module unavailable' };
    }
    await ensureConnection();
    logger.warn('[IAP] requestPurchase', { productId });
    const pending = waitForPurchase(productId, 'ios');
    try {
      const result = await iap.requestPurchase({
        request: { apple: { sku: productId } },
        type: 'in-app',
      });
      const matched = findMatchingPurchase(result, productId);
      if (matched) {
        const meta = getPlatformProductBySku(productId, 'ios');
        const isConsumable = meta?.platform.isConsumable ?? true;
        try {
          await iap.finishTransaction({ purchase: matched as any, isConsumable });
        } catch {
          // Best-effort finalize.
        }
        clearPurchaseListeners();
        return { status: 'success', productId };
      }
    } catch (error: any) {
      clearPurchaseListeners();
      logger.warn('[IAP] requestPurchase failed', error);
      return {
        status: 'not_ready',
        message: error?.message ?? 'Purchase request failed.',
      };
    }
    return pending;
  },
  restore: async () => {
    const iap = getIapModule();
    if (!iap) {
      return { status: 'not_ready', message: 'IAP native module unavailable' };
    }
    await ensureConnection();
    try {
      logger.warn('[IAP] restorePurchases');
      await iap.restorePurchases();
      return { status: 'success', productId: 'restore' };
    } catch (error: any) {
      logger.warn('[IAP] restore failed', error);
      return {
        status: 'not_ready',
        message: error?.message ?? 'Restore failed.',
      };
    }
  },
});

const createAndroidProvider = (): PurchaseProvider => ({
  platform: 'android',
  getProducts: async (requestedSkus?: string[]) => {
    const iap = getIapModule();
    if (!iap) return [];
    await ensureConnection();
    const skus = requestedSkus?.length ? requestedSkus : getStoreProductIdsForPlatform('android');
    logger.warn('[IAP] fetchProducts (android)', { skus });
    const products = (await iap.fetchProducts({ skus, type: 'in-app' })) ?? [];
    logger.warn('[IAP] fetchProducts result (android)', {
      count: products.length,
      ids: products.map((item) => item.id),
    });
    return products.map((item) => ({
      id: item.id,
      platform: 'android',
      displayPrice: item.displayPrice ?? null,
      price: item.price ?? null,
      currency: item.currency ?? null,
    }));
  },
  purchase: async (productId: string) => {
    const iap = getIapModule();
    if (!iap) {
      return { status: 'not_ready', message: 'IAP native module unavailable' };
    }
    await ensureConnection();
    logger.warn('[IAP] requestPurchase (android)', { productId });
    const pending = waitForPurchase(productId, 'android');
    try {
      const result = await iap.requestPurchase({
        request: { google: { skus: [productId] } },
        type: 'in-app',
      });
      const matched = findMatchingPurchase(result, productId);
      if (matched) {
        const meta = getPlatformProductBySku(productId, 'android');
        const isConsumable = meta?.platform.isConsumable ?? true;
        try {
          await iap.finishTransaction({ purchase: matched as any, isConsumable });
        } catch {
          // Best-effort finalize.
        }
        clearPurchaseListeners();
        return { status: 'success', productId };
      }
    } catch (error: any) {
      clearPurchaseListeners();
      logger.warn('[IAP] requestPurchase failed (android)', error);
      return {
        status: 'not_ready',
        message: error?.message ?? 'Purchase request failed.',
      };
    }
    return pending;
  },
  restore: async () => {
    const iap = getIapModule();
    if (!iap) {
      return { status: 'not_ready', message: 'IAP native module unavailable' };
    }
    await ensureConnection();
    try {
      logger.warn('[IAP] restorePurchases (android)');
      await iap.getAvailablePurchases();
      return { status: 'success', productId: 'restore' };
    } catch (error: any) {
      logger.warn('[IAP] restore failed (android)', error);
      return {
        status: 'not_ready',
        message: error?.message ?? 'Restore failed.',
      };
    }
  },
});

export const getPurchaseProvider = (platform: 'ios' | 'android'): PurchaseProvider =>
  platform === 'ios' ? createIosProvider() : createAndroidProvider();
