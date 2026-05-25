import Constants from 'expo-constants';

export type BuildEnv = 'dev' | 'stage' | 'prod';
export type ComplianceNoticeTrigger = 'version' | 'build' | 'both' | 'always';
export type DemoConfig = {
  enabled: boolean;
  allowResetFromLogin: boolean;
  datasetVersion: number;
};
export type DocumentFreshnessRule = {
  label: string;
  warningAgeDays: number;
  expiryAgeDays: number;
  autoDocDeletion: boolean;
  allowPaymentOnWarn: boolean;
  allowPaymentOnExpiry: boolean;
};

type RawExtra = Record<string, unknown>;
type TabConfigEntry = { label?: string; icon?: string };
type TabsConfig = Record<string, TabConfigEntry>;

const rawExtra: RawExtra =
  ((Constants?.expoConfig as any)?.extra as RawExtra) ??
  ((Constants as any)?.manifest?.extra as RawExtra) ??
  {};

const normalizeEnv = (value: unknown): BuildEnv => {
  const raw = `${value ?? ''}`.trim().toLowerCase();
  if (raw === 'prod' || raw === 'production') return 'prod';
  if (raw === 'stage' || raw === 'staging') return 'stage';
  return 'dev';
};

const buildEnv = normalizeEnv(rawExtra.APP_ENV ?? process.env.APP_ENV);
const isProd = buildEnv === 'prod';
const isDev = buildEnv === 'dev';
const isStage = buildEnv === 'stage';

const normalizeComplianceNoticeTrigger = (value: unknown): ComplianceNoticeTrigger => {
  const raw = `${value ?? ''}`.trim().toLowerCase();
  if (raw === 'version' || raw === 'build' || raw === 'both' || raw === 'always') {
    return raw;
  }
  return 'both';
};

const features = {
  // update for dev
  showDevTools: true, 
  logsEnabled: true,
  allowScreenshots: true, 
  enableValidation: true,
  showWatermark: false,
  paymentBehaviour: 'test' as 'message' | 'test' | 'iap' | 'final',
  //update
  iapProvisionalErrorTimeoutSeconds: 10,
  duplicateChecks: true,
  demoModeEnabled: true,
  demoAllowResetFromLogin: true,
  demoDatasetVersion: 2,
  allowFeedback: false,
  allowDevData: false,
  allowDevOcr: true,
  hideSupportingStatements: false,
  enableIdBarcodeExtraction: false,
  allowArchivedApplicationDeletion: false,
};

const documentFreshness = {
  proofOfAddress: {
    label: 'Proof of address',
    warningAgeDays: 70,
    expiryAgeDays: 90,
    autoDocDeletion: true,
    allowPaymentOnWarn: true,
    allowPaymentOnExpiry: false,
  },
  associationMembership: {
    label: 'Membership card',
    warningAgeDays: 70,
    expiryAgeDays: 90,
    autoDocDeletion: false,
    allowPaymentOnWarn: true,
    allowPaymentOnExpiry: false,
  },
  associationLetter: {
    label: 'Proof of membership letter',
    warningAgeDays: 70,
    expiryAgeDays: 90,
    autoDocDeletion: false,
    allowPaymentOnWarn: true,
    allowPaymentOnExpiry: false,
  },
  dedicatedHunter: {
    label: 'Dedicated hunter certificate',
    warningAgeDays: 70,
    expiryAgeDays: 90,
    autoDocDeletion: false,
    allowPaymentOnWarn: true,
    allowPaymentOnExpiry: false,
  },
  dedicatedSport: {
    label: 'Dedicated sport shooter certificate',
    warningAgeDays: 70,
    expiryAgeDays: 90,
    autoDocDeletion: false,
    allowPaymentOnWarn: true,
    allowPaymentOnExpiry: false,
  },
  supportingStatement: {
    label: 'Character reference',
    warningAgeDays: 70,
    expiryAgeDays: 90,
    autoDocDeletion: false,
    allowPaymentOnWarn: true,
    allowPaymentOnExpiry: false,
  },
} as const satisfies Record<string, DocumentFreshnessRule>;

const proofOfAddress = documentFreshness.proofOfAddress;

const membership = {
  submissionWarningDays: 180,
};

const seedData = {
  useDevDefaults: true,
};

const demo: DemoConfig = {
  enabled: features.demoModeEnabled,
  allowResetFromLogin: features.demoAllowResetFromLogin,
  datasetVersion: features.demoDatasetVersion,
};

export const appConfig = {
  buildEnv,
  isProd,
  isDev,
  isStage,
  complianceNotice: {
    trigger: normalizeComplianceNoticeTrigger(rawExtra.complianceNoticeTrigger),
  },
  demo,
  documentFreshness,
  proofOfAddress,
  membership,
  features,
  seedData,
  tabs: (rawExtra.tabs ?? {}) as TabsConfig,
};

export const allowLogs = (devModeEnabled: boolean): boolean =>
  appConfig.features.logsEnabled && devModeEnabled;

export const allowScreenCapture = (): boolean =>
  appConfig.features.allowScreenshots;
