import pricingConfig from '../config/pricing.json';
import { Application } from '../data/types';
import { resolveApplicationMotivation } from './motivationStore';

type PricingProduct = {
  id: string;
  label: string;
  form: '517g' | '518a';
  minItems: number;
  maxItems?: number;
  requiresMotivation?: boolean;
  vatIncluded?: boolean;
  invoiceText?: string;
  formText?: string;
  countText?: string;
  isActive?: boolean;
};

type PricingConfig = {
  currency: string;
  vatRate?: number;
  products: {
    tieredPricing?: {
      isActive?: boolean;
      items?: (PricingProduct & { amount: number })[];
    };
    perItemPricing?: {
      isActive?: boolean;
      items?: (PricingProduct & {
        baseAmount: number;
        includedItems: number;
        additionalItemAmount: number;
      })[];
    };
  };
};

const config = pricingConfig as PricingConfig;

const getApplicationItemCount = (application: Application): number => {
  if (application.form === '517g') {
    return application.competencyCertificateIds?.length ?? 0;
  }
  return application.selectedFirearmIds?.length ?? 0;
};

const getActivePricingItems = (configData: PricingConfig) => {
  const tieredItems = configData.products?.tieredPricing?.isActive
    ? configData.products?.tieredPricing?.items ?? []
    : [];
  const perItemItems = configData.products?.perItemPricing?.isActive
    ? configData.products?.perItemPricing?.items ?? []
    : [];

  return [...tieredItems, ...perItemItems].filter((item) => item.isActive !== false);
};

const isPerItemPricing = (
  item: PricingProduct,
): item is PricingProduct & {
  baseAmount: number;
  includedItems: number;
  additionalItemAmount: number;
} => 'baseAmount' in item;

const computePerItemAmount = (
  item: PricingProduct & {
    baseAmount: number;
    includedItems: number;
    additionalItemAmount: number;
  },
  count: number,
) => {
  const extraItems = Math.max(0, count - item.includedItems);
  return item.baseAmount + extraItems * item.additionalItemAmount;
};

const resolveRequiresMotivation = (application: Application, count: number) =>
  application.form === '518a' &&
  count === 1 &&
  application.motivationSource === 'wizard' &&
  (resolveApplicationMotivation(application)?.wizardStatus ?? application.motivationWizardStatus) === 'complete';

export const resolvePricingForApplication = (application: Application) => {
  const count = getApplicationItemCount(application);
  const requiresMotivation = resolveRequiresMotivation(application, count);
  const matchingItems = getActivePricingItems(config).filter((item) => {
    if (item.form !== application.form) return false;
    if (count < item.minItems) return false;
    if (typeof item.maxItems === 'number' && count > item.maxItems) return false;
    return true;
  });
  const product =
    matchingItems.find((item) => (item.requiresMotivation ?? false) === requiresMotivation) ??
    matchingItems[0];

  const amount = product
    ? isPerItemPricing(product)
      ? computePerItemAmount(product, count)
      : product.amount
    : null;

  return {
    currency: config.currency,
    vatRate: config.vatRate,
    count,
    product,
    amount,
  };
};

export const formatCurrency = (amount: number, currency: string): string => {
  if (currency === 'ZAR') {
    try {
      return `R ${amount.toLocaleString('en-ZA')}`;
    } catch {
      return `R ${amount}`;
    }
  }
  return `${amount} ${currency}`;
};

export const formatCountText = (text: string, count: number): string =>
  text.replace('{count}', String(count));
