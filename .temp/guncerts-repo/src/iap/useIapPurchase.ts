import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Application } from '../data/types';
import { resolveStoreProductForApplication } from './appStore';
import { getProducts, initIap, PurchaseFlowPhase, PurchaseFlowResult, purchaseForSubmission } from './iap';
import { PdfPageProgress } from '../pdf/supporting';
import { resolvePricingForApplication } from '../utils/pricing';

type IapDebug = (message: string, data?: Record<string, unknown>) => void;
type IapPhaseChange = (phase: PurchaseFlowPhase) => void;
type IapProgressChange = (progress: PdfPageProgress) => void;
type StorePriceSnapshot = {
  displayPrice: string | null;
  price: number | null;
  currency: string | null;
};

const priceCacheBySku = new Map<string, StorePriceSnapshot>();
const priceRequestBySku = new Map<string, Promise<StorePriceSnapshot | null>>();

const readPriceSnapshot = (sku: string | null | undefined) => {
  if (!sku) return null;
  return priceCacheBySku.get(sku) ?? null;
};

const resolveSkuForApplication = (
  application?: Application,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
) => {
  if (!application) return null;
  if (application.form === '517') return null;
  const pricing = resolvePricingForApplication(application);
  if (!pricing?.count) return null;
  const selectedProduct = resolveStoreProductForApplication(application.form, pricing.count, application);
  if (!selectedProduct) return null;
  return platform === 'ios'
    ? selectedProduct.platform.apple.productId
    : selectedProduct.platform.google.productId;
};

const fetchStorePriceForSku = async (
  sku: string,
  debug?: IapDebug,
): Promise<StorePriceSnapshot | null> => {
  const cached = readPriceSnapshot(sku);
  if (cached) return cached;

  const inFlight = priceRequestBySku.get(sku);
  if (inFlight) return inFlight;

  const request = (async () => {
    await initIap();
    debug?.('prefetch start', { resolvedSku: sku });
    const products = await getProducts([sku]);
    const ids = (products ?? []).map((item) => item.id);
    const matched = (products ?? []).find((item) => item.id === sku);
    const snapshot: StorePriceSnapshot = {
      displayPrice: matched?.displayPrice ?? null,
      currency: matched?.currency ?? null,
      price: matched?.price ?? null,
    };
    priceCacheBySku.set(sku, snapshot);
    debug?.('prefetch done', {
      skus: ids,
      displayPrice: snapshot.displayPrice,
      currency: snapshot.currency,
      price: snapshot.price,
    });
    return snapshot;
  })()
    .catch((error) => {
      debug?.('prefetch error', { message: error?.message ?? String(error) });
      return null;
    })
    .finally(() => {
      priceRequestBySku.delete(sku);
    });

  priceRequestBySku.set(sku, request);
  return request;
};

export const prefetchIapPriceForApplication = (
  application?: Application,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
) => {
  const resolvedSku = resolveSkuForApplication(application, platform);
  if (!resolvedSku) return Promise.resolve(null);
  return fetchStorePriceForSku(resolvedSku);
};

export const useIapPurchase = (
  application?: Application,
  onDebug?: IapDebug,
  onPhaseChange?: IapPhaseChange,
  onProgressChange?: IapProgressChange
) => {
  const [lastResult, setLastResult] = useState<PurchaseFlowResult | null>(null);
  const [storePriceLabel, setStorePriceLabel] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  const pricing = useMemo(() => {
    if (!application) return null;
    if (application.form === '517') return null;
    return resolvePricingForApplication(application);
  }, [application]);

  const selectedProduct = useMemo(() => {
    if (!application || !pricing?.count) return null;
    if (application.form === '517') return null;
    return resolveStoreProductForApplication(application.form, pricing.count, application);
  }, [application, pricing?.count]);

  const resolvedSku = useMemo(() => {
    if (!selectedProduct) return null;
    return platform === 'ios'
      ? selectedProduct.platform.apple.productId
      : selectedProduct.platform.google.productId;
  }, [platform, selectedProduct]);

  const debug = (message: string, data?: Record<string, unknown>) => {
    onDebug?.(message, data);
  };

  useEffect(() => {
    if (!resolvedSku || !application) {
      setStorePriceLabel(null);
      setPriceLoading(false);
      return;
    }
    const cached = readPriceSnapshot(resolvedSku);
    if (cached) {
      setStorePriceLabel(cached.displayPrice);
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    fetchStorePriceForSku(resolvedSku, debug).then((snapshot) => {
      if (cancelled) return;
      setStorePriceLabel(snapshot?.displayPrice ?? null);
      setPriceLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [application, platform, resolvedSku]);

  const purchase = async () => {
    debug('purchase start', {
      platform,
      form: application?.form,
      count: pricing?.count,
      selectedProductId: selectedProduct?.internalId,
      resolvedSku,
    });
    if (!application) {
      const result: PurchaseFlowResult = {
        status: 'not_ready',
        message: 'No application loaded for purchase.',
      };
      setLastResult(result);
      return result;
    }
    if (!selectedProduct) {
      const result: PurchaseFlowResult = {
        status: 'not_ready',
        message: 'No matching store product configured for this application.',
      };
      debug('no matching product', {
        platform,
        form: application?.form,
        count: pricing?.count,
      });
      setLastResult(result);
      return result;
    }
    const productId = resolvedSku;
    if (!productId) {
      const result: PurchaseFlowResult = {
        status: 'not_ready',
        message: 'No SKU configured for this platform.',
      };
      debug('missing sku', {
        platform,
        productId,
        selectedProductId: selectedProduct.internalId,
      });
      setLastResult(result);
      return result;
    }
    debug('request purchase', { productId });
    const submissionId = application.id;
    const result = await purchaseForSubmission({
      submissionId,
      sku: productId,
      onPhaseChange,
      onProgressChange,
    });
    debug('purchase result', result as Record<string, unknown>);
    setLastResult(result);
    return result;
  };

  return {
    platform,
    selectedProduct,
    lastResult,
    purchase,
    storePriceLabel,
    priceLoading,
  };
};
