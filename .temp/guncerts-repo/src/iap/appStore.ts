import appStoreConfig from '../config/appStore.json';
import { Application } from '../data/types';
import { resolveApplicationMotivation } from '../utils/motivationStore';

export type StoreProduct = {
  internalId: string;
  refName: string;
  form: '517g' | '518a';
  minItems?: number;
  maxItems?: number;
  requiresMotivation?: boolean;
  platform: {
    apple: {
      productId: string;
      isConsumable: boolean;
      price?: number;
    };
    google: {
      productId: string;
      isConsumable: boolean;
      price?: number;
    };
  };
};

type AppStoreConfig = {
  products: StoreProduct[];
};

const config = appStoreConfig as AppStoreConfig;

const matchesRange = (product: StoreProduct, count: number) => {
  const minItems = typeof product.minItems === 'number' ? product.minItems : 1;
  const maxItems = product.maxItems;
  if (count < minItems) return false;
  if (typeof maxItems === 'number' && count > maxItems) return false;
  return true;
};

const resolveRequiresMotivation = (application?: Application) =>
  application?.form === '518a' &&
  application?.motivationSource === 'wizard' &&
  (resolveApplicationMotivation(application)?.wizardStatus ?? application?.motivationWizardStatus) === 'complete';

export const getStoreProducts = (): StoreProduct[] => config.products ?? [];

export const getStoreProductIdsForPlatform = (platform: 'ios' | 'android') =>
  getStoreProducts().map((product) =>
    platform === 'ios' ? product.platform.apple.productId : product.platform.google.productId
  );

export const resolveStoreProductForApplication = (
  form: '517g' | '518a',
  count: number,
  application?: Application,
) => {
  const products = getStoreProducts().filter((product) => product.form === form);
  const requiresMotivation = resolveRequiresMotivation(application);
  const matchingRange = products.filter((product) => matchesRange(product, count));

  const exactVariant = matchingRange.find(
    (product) => (product.requiresMotivation ?? false) === requiresMotivation,
  );
  if (exactVariant) return exactVariant;

  for (const product of products) {
    if (matchesRange(product, count)) return product;
  }
  return null;
};

export const getPlatformProductBySku = (sku: string, platform: 'ios' | 'android') => {
  for (const product of getStoreProducts()) {
    const platformData = platform === 'ios' ? product.platform.apple : product.platform.google;
    if (platformData.productId === sku) {
      return { product, platform: platformData };
    }
  }
  return null;
};
