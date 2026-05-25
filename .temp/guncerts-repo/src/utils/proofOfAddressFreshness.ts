import { appConfig } from '../config/appConfig';
import { getDateFreshness } from './documentFreshness';

export type ProofOfAddressFreshnessStatus = 'unknown' | 'fresh' | 'warning' | 'expired';

export type ProofOfAddressFreshness = {
  status: ProofOfAddressFreshnessStatus;
  proofDate?: string;
  ageDays: number | null;
  warningAgeDays: number;
  expiryAgeDays: number;
};

export const getProofOfAddressFreshness = (
  proofDate?: string | null,
  now = new Date(),
): ProofOfAddressFreshness => {
  const rule = appConfig.documentFreshness.proofOfAddress;
  const freshness = getDateFreshness(proofDate, rule, now);
  return {
    status: freshness.status,
    proofDate: proofDate ?? undefined,
    ageDays: freshness.ageDays,
    warningAgeDays: rule.warningAgeDays,
    expiryAgeDays: rule.expiryAgeDays,
  };
};
