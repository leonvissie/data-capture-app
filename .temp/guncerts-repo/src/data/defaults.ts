import {
  ActivityEvidence,
  Application,
  Base,
  CompetencyCertificate,
  DevicePrefs,
  Document,
  Extraction,
  Firearm,
  Address,
  Motivation,
  Profile,
  Reminders,
  Safe,
  SupportingStatement,
  UserPrefs,
  UUID,
} from './types';
import { appConfig } from '../config/appConfig';
import { CURRENT_ENTITY_SCHEMA_VERSION } from './migrations';

const isoNow = () => new Date().toISOString();

const randomId = (prefix: string): UUID =>
  (globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Math.random().toString(36).slice(2)}`) as UUID;

const USE_DEV_DEFAULTS = appConfig.features.allowDevData && appConfig.seedData.useDevDefaults;
// const USE_DEV_DEFAULTS = false;

const DEFAULT_BASE = {
  id: '' as UUID,
  createdAt: '',
  updatedAt: '',
  schemaVersion: CURRENT_ENTITY_SCHEMA_VERSION,
  version: 1,
  ownerUserId: undefined,
  deviceId: undefined,
  deleted: false,
} satisfies Base;

export const DEV_ADDRESS = {
  //singleLine: '1234567 10 234567 20 234567 30 234567 40 234567 50 234567 60 234567 70 234567 80 234567 90 23456 100 23456 110 23456 120 23456 130 23456 140 23456 150',
  // singleLine: '123 Streetwise Lane, RandomSuburb, SomeCity',
  singleLine: '',
  postCode: '0088',
  line1: 'Flat 56 FlatNumber, 123 Streetwise Lane',
  line2: '',
  suburb: 'RandomSuburb',
  city: 'SomeCity',
  province: '',
  homeType: undefined,
  securityMeasures: [],
} satisfies Address;

export const DEV_POSTAL = {
  singleLine: '',
  postCode: '0088',
  line1: '1234567 10-234567 20-234567 30-234567 40-234567 50-234567 60-234567 70-234567 80-234567 90-23456',
  line2: '',
  suburb: '100-23456 110-23456 120-23456',
  city: '130-23456 140-23456',
  province: '',
  homeType: undefined,
  securityMeasures: [],
} satisfies Address;

export const DEV_PROFILE = {
  ...DEFAULT_BASE,
  type: 'Profile',
  givenNames: 'Daniel Martin',
  surname: 'Van Rensburg',
  initials: 'DM',
  occupation: '',
  employment: {
    tradeOrProfession: '',
    selfEmployedDetail: '',
    employerName: '',
    employerAddress: { ...DEV_ADDRESS },
  },
  maritalStatus: undefined,
  maritalStatusOther: '',
  idType: 'ID_CARD',
  isForeignNational: false,
  idNumber: '8206155678084',
  sexAtBirth: 'male',
  idBarcodeExtracted: false,
  email: 'dmvanrensburg@mockmail.com',
  mobile: '0812341234',
  references: [
    {
      relationshipCategory: 'spouse',
      relationshipDetail: 'Partner',
      type: 'Partner',
      fullNames: 'Jamie Elaine Van Rensburg',
      idNumber: '8001011234088',
      mobile: '0821234567',
    },
  ],
  proofOfAddressDate: undefined,
  address: { ...DEV_ADDRESS },
  hasPostalAddress: true,
  addressPostal: { ...DEV_POSTAL },
} satisfies Profile;


export const DEFAULT_ADDRESS = {
  singleLine: '',
  postCode: '',
  line1: '',
  line2: '',
  suburb: '',
  city: '',
  province: '',
  homeType: undefined,
  securityMeasures: [],
} satisfies Address;
export const DEFAULT_PROFILE = {
  ...DEFAULT_BASE,
  type: 'Profile',
  givenNames: '',
  surname: '',
  initials: '',
  occupation: '',
  employment: {
    tradeOrProfession: '',
    selfEmployedDetail: '',
    employerName: '',
    employerAddress: { ...DEFAULT_ADDRESS },
  },
  maritalStatus: undefined,
  maritalStatusOther: '',
  idType: undefined,
  isForeignNational: false,
  idNumber: '',
  sexAtBirth: 'unknown',
  idBarcodeExtracted: false,
  email: '',
  mobile: '',
  proofOfAddressDate: undefined,
  address: { ...DEFAULT_ADDRESS },
  hasPostalAddress: false,
} satisfies Profile;

const DEV_USER_PREFS = {
  ...DEFAULT_BASE,
  type: 'UserPrefs',
  holderProfileId: '' as UUID,
  applicationIntent: 'both',
  applicationType: 'both',
  welcomeFlow: undefined,
  useBiometrics: false,
  useCamera: false,
  usePhotoLibrary: false,
  syncToCloud: false,
  isFirstLoad: true,
  showFirstTimeSetup: true,
  shareFeedback: false,
  devModeEnabled: false,
  screenMode: 'default',
  syncKeyId: undefined,
  syncLastSnapshotAt: undefined,
  syncLastError: undefined,
  showPhotoLibraryAlert: true,
  passcodeTimeoutSec: 120,
  analyticsOptIn: false,
  remindRenewal: true,
  dfoCompetencyExpiryUsing: 'unknown',
  compCertCalcMethodSet: false,
  remindersResetRequestedAt: undefined,
  competencyRemindersResetRequestedAt: undefined,
  showFirearmWizardHint: false,
  showCompetencyWizardHint: false,
  showIdWizardHint: false,
  showAddressWizardHint: false,
  showSafeWizardHint: false,
  showMembershipWizardHint: false,
  showGetStarted: true,
  showGetStartedDisabled: false,
  showSendFeedbackMessage: true,
  collapsedPanels: {
    profile: {
      profile: false,
      competency: false,
      firearms: false,
      safes: false,
      memberships: false,
      supporting: false,
    },
    settings: {
      hints: true,
      preferences: true,
      device: true,
    },
    info: {
      tutorials: false,
      resources: true,
      security: true,
      whatItDoes: true,
      howItDoesIt: true,
      whatYouGet: true,
      howItWorks: true,
      pricing: true,
      support: true,
    },
  },
} satisfies UserPrefs;

const DEFAULT_USER_PREFS = {
  ...DEFAULT_BASE,
  type: 'UserPrefs',
  holderProfileId: '' as UUID,
  applicationIntent: 'both',
  applicationType: 'both',
  welcomeFlow: undefined,
  useBiometrics: false,
  useCamera: false,
  usePhotoLibrary: false,
  syncToCloud: false,
  isFirstLoad: true,
  showFirstTimeSetup: true,
  shareFeedback: false,
  devModeEnabled: false,
  screenMode: 'default',
  syncKeyId: undefined,
  syncLastSnapshotAt: undefined,
  syncLastError: undefined,
  showPhotoLibraryAlert: true,
  passcodeTimeoutSec: 120,
  analyticsOptIn: false,
  remindRenewal: false,
  dfoCompetencyExpiryUsing: 'unknown',
  compCertCalcMethodSet: false,
  remindersResetRequestedAt: undefined,
  competencyRemindersResetRequestedAt: undefined,
  showFirearmWizardHint: true,
  showCompetencyWizardHint: true,
  showIdWizardHint: true,
  showAddressWizardHint: true,
  showSafeWizardHint: true,
  showMembershipWizardHint: true,
  showSendFeedbackMessage: true,
  showGetStarted: true,
  showGetStartedDisabled: false,
  collapsedPanels: {
    profile: {
      profile: false,
      competency: false,
      memberships: false,
    },
    firearms: {
      FirearmsSection: false,
      FirearmStorageSection: false,
    },
    settings: {
      hints: false,
      preferences: false,
      device: false,
    },
    info: {
      tutorials: true,
      resources: true,
      security: true,
      whatItDoes: true,
      howItDoesIt: true,
      whatYouGet: true,
      howItWorks: true,
      pricing: true,
      support: true,
    }
  },
} satisfies UserPrefs;

const ACTIVE_PROFILE = USE_DEV_DEFAULTS ? DEV_PROFILE : DEFAULT_PROFILE;
const ACTIVE_USER_PREFS = USE_DEV_DEFAULTS ? DEV_USER_PREFS : DEFAULT_USER_PREFS;

const DEFAULT_DEVICE_PREFS = {
  ...DEFAULT_BASE,
  type: 'DevicePrefs',
  holderProfileId: undefined,
  deviceId: 'local-device',
  haptics: true,
  reducedMotion: false,
  cameraResolution: 'high',
  uploadOnCellular: false,
} satisfies DevicePrefs;

const DEFAULT_REMINDER = {
  ...DEFAULT_BASE,
  type: 'Reminders',
  holderProfileId: '' as UUID,
  reminderCode: 'FirearmExp' as Reminders['reminderCode'],
  showReminder: false,
  expiryValue: undefined,
} satisfies Reminders;

const DEFAULT_DOCUMENT = {
  ...DEFAULT_BASE,
  type: 'Document',
  holderProfileId: '' as UUID,
  kind: 'OTHER',
  filePath: '',
  sha256: '',
  pages: 0,
} satisfies Document;

const DEFAULT_EXTRACTION = {
  ...DEFAULT_BASE,
  type: 'Extraction',
  documentId: '' as UUID,
  extractionType: 'Unknown',
  fields: {},
  quality: 'medium',
  engine: 'manual',
} satisfies Extraction;

const DEFAULT_FIREARM = {
  ...DEFAULT_BASE,
  type: 'Firearm',
  holderProfileId: '' as UUID,
  manufacturerNameAddress: 'NONE',
  purpose: undefined,
  isCurrent: undefined,
  isDemoData: false,
} satisfies Firearm;

const DEFAULT_COMPETENCY_CERTIFICATE = {
  ...DEFAULT_BASE,
  type: 'CompetencyCertificate',
  holderProfileId: '' as UUID,
  categories: [],
  isCurrent: true,
  isDemoData: false,
} satisfies CompetencyCertificate;

const DEFAULT_SAFE = {
  ...DEFAULT_BASE,
  type: 'Safe',
  holderProfileId: '' as UUID,
  fireArms: [],
} satisfies Safe;

const DEFAULT_ACTIVITY_EVIDENCE = {
  ...DEFAULT_BASE,
  type: 'ActivityEvidence',
  holderProfileId: '' as UUID,
  evidenceType: 'SPORT_SHOOTING' as const,
  photos: [],
  notes: '',
} satisfies ActivityEvidence;

const DEFAULT_SUPPORTING_STATEMENT = {
  ...DEFAULT_BASE,
  type: 'SupportingStatement',
  holderProfileId: '' as UUID,
  status: 'empty' as const,
  slot: 'spouse_family',
  mode: undefined,
} satisfies SupportingStatement;

const DEFAULT_MOTIVATION = {
  ...DEFAULT_BASE,
  type: 'Motivation',
  holderProfileId: '' as UUID,
  firearmId: '' as UUID,
  source: undefined,
  wizardStatus: undefined,
  profile: undefined,
  text: undefined,
} satisfies Motivation;

const DEFAULT_APPLICATION = {
  ...DEFAULT_BASE,
  type: 'Application',
  form: '' as Application['form'],
  status: 'draft' as Application['status'],
  iap: undefined,
  declarations: [],
  userToSubmitMotivation: undefined,
  firearms: [],
  safeIds: [],
  selectedFirearmIds: [],
  membershipIds: [],
  proficiencyIds: [],
  activityEvidenceIds: [],
  supportingStatementIds: [],
  requireMembership: false,
  renewalCategories: [],
  renewalSelections: [],
  docs: undefined,
  competencyCertificateIds: [],
  motivationProfile: undefined,
  motivationSource: undefined,
  motivationWizardStatus: undefined,
  form517: undefined,
} satisfies Application;

const buildBase = (prefix: string, overrides: Partial<Base> = {}): Base => {
  const timestamp = isoNow();
  return {
    ...DEFAULT_BASE,
    ...overrides,
    id: overrides.id ?? randomId(prefix),
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    version: overrides.version ?? 1,
    schemaVersion: overrides.schemaVersion ?? CURRENT_ENTITY_SCHEMA_VERSION,
  };
};

export const createProfile = (overrides: Partial<Profile> = {}): Profile => {
  const base = buildBase('prof', overrides);
  return { ...ACTIVE_PROFILE, ...base, ...overrides };
};

export const createUserPrefs = (
  holderProfileId: UUID,
  overrides: Partial<UserPrefs> = {},
): UserPrefs => {
  const base = buildBase('up', overrides);
  return {
    ...ACTIVE_USER_PREFS,
    ...base,
    holderProfileId,
    applicationIntent: overrides.applicationIntent ?? ACTIVE_USER_PREFS.applicationIntent,
    applicationType: overrides.applicationType ?? ACTIVE_USER_PREFS.applicationType,
    welcomeFlow: overrides.welcomeFlow ?? ACTIVE_USER_PREFS.welcomeFlow,
    useBiometrics: overrides.useBiometrics ?? ACTIVE_USER_PREFS.useBiometrics,
    useCamera: overrides.useCamera ?? ACTIVE_USER_PREFS.useCamera,
    passcodeTimeoutSec: overrides.passcodeTimeoutSec ?? ACTIVE_USER_PREFS.passcodeTimeoutSec,
    analyticsOptIn: overrides.analyticsOptIn ?? ACTIVE_USER_PREFS.analyticsOptIn,
    syncToCloud: overrides.syncToCloud ?? ACTIVE_USER_PREFS.syncToCloud,
    isFirstLoad: overrides.isFirstLoad ?? ACTIVE_USER_PREFS.isFirstLoad,
    syncKeyId: overrides.syncKeyId ?? ACTIVE_USER_PREFS.syncKeyId,
    syncLastSnapshotAt: overrides.syncLastSnapshotAt ?? ACTIVE_USER_PREFS.syncLastSnapshotAt,
    syncLastError: overrides.syncLastError ?? ACTIVE_USER_PREFS.syncLastError,
    remindRenewal: overrides.remindRenewal ?? ACTIVE_USER_PREFS.remindRenewal,
    dfoCompetencyExpiryUsing:
      overrides.dfoCompetencyExpiryUsing ?? ACTIVE_USER_PREFS.dfoCompetencyExpiryUsing,
    compCertCalcMethodSet:
      overrides.compCertCalcMethodSet ?? ACTIVE_USER_PREFS.compCertCalcMethodSet,
    competencyRemindersResetRequestedAt:
      overrides.competencyRemindersResetRequestedAt ?? ACTIVE_USER_PREFS.competencyRemindersResetRequestedAt,
    showFirearmWizardHint: overrides.showFirearmWizardHint ?? ACTIVE_USER_PREFS.showFirearmWizardHint,
    showCompetencyWizardHint:
      overrides.showCompetencyWizardHint ?? ACTIVE_USER_PREFS.showCompetencyWizardHint,
    showIdWizardHint: overrides.showIdWizardHint ?? ACTIVE_USER_PREFS.showIdWizardHint,
    showAddressWizardHint: overrides.showAddressWizardHint ?? ACTIVE_USER_PREFS.showAddressWizardHint,
    showSafeWizardHint: overrides.showSafeWizardHint ?? ACTIVE_USER_PREFS.showSafeWizardHint,
    showMembershipWizardHint:
      overrides.showMembershipWizardHint ?? ACTIVE_USER_PREFS.showMembershipWizardHint,
    showGetStarted: overrides.showGetStarted ?? ACTIVE_USER_PREFS.showGetStarted,
    showGetStartedDisabled:
      overrides.showGetStartedDisabled ?? ACTIVE_USER_PREFS.showGetStartedDisabled,
    showSendFeedbackMessage:
      overrides.showSendFeedbackMessage ?? ACTIVE_USER_PREFS.showSendFeedbackMessage,
    showFirstTimeSetup: overrides.showFirstTimeSetup ?? ACTIVE_USER_PREFS.showFirstTimeSetup,
    collapsedPanels: overrides.collapsedPanels ?? ACTIVE_USER_PREFS.collapsedPanels,
    shareFeedback: overrides.shareFeedback ?? ACTIVE_USER_PREFS.shareFeedback,
    devModeEnabled: overrides.devModeEnabled ?? ACTIVE_USER_PREFS.devModeEnabled,
    screenMode: overrides.screenMode ?? ACTIVE_USER_PREFS.screenMode,
  };
};

export const createDevicePrefs = (
  overrides: Partial<DevicePrefs> = {},
  deviceIdFallback = 'local-device',
): DevicePrefs => {
  const base = buildBase('dp', overrides);
  return {
    ...DEFAULT_DEVICE_PREFS,
    ...base,
    holderProfileId: overrides.holderProfileId ?? DEFAULT_DEVICE_PREFS.holderProfileId,
    deviceId: overrides.deviceId ?? DEFAULT_DEVICE_PREFS.deviceId ?? deviceIdFallback,
    haptics: overrides.haptics ?? DEFAULT_DEVICE_PREFS.haptics,
    reducedMotion: overrides.reducedMotion ?? DEFAULT_DEVICE_PREFS.reducedMotion,
    cameraResolution: overrides.cameraResolution ?? DEFAULT_DEVICE_PREFS.cameraResolution,
    uploadOnCellular: overrides.uploadOnCellular ?? DEFAULT_DEVICE_PREFS.uploadOnCellular,
  };
};

export const createReminder = (
  holderProfileId: UUID,
  reminderCode: Reminders['reminderCode'],
  overrides: Partial<Reminders> = {},
): Reminders => {
  const base = buildBase('rem', overrides);
  return {
    ...DEFAULT_REMINDER,
    ...base,
    holderProfileId,
    reminderCode: overrides.reminderCode ?? reminderCode,
    showReminder: overrides.showReminder ?? DEFAULT_REMINDER.showReminder,
  };
};

export const createDocument = (
  required: Pick<Document, 'kind' | 'filePath' | 'sha256' | 'pages'>,
  overrides: Partial<Document> = {},
): Document => {
  const base = buildBase('doc', overrides);
  return {
    ...DEFAULT_DOCUMENT,
    ...base,
    ...required,
    notes: overrides.notes,
    isEncrypted: overrides.isEncrypted,
    encVersion: overrides.encVersion,
  };
};

export const createExtraction = (
  required: Pick<Extraction, 'documentId' | 'extractionType'>,
  overrides: Partial<Extraction> = {},
): Extraction => {
  const base = buildBase('ext', overrides);
  return {
    ...DEFAULT_EXTRACTION,
    ...base,
    documentId: required.documentId,
    extractionType: required.extractionType,
    fields: overrides.fields ?? DEFAULT_EXTRACTION.fields,
    quality: overrides.quality ?? DEFAULT_EXTRACTION.quality,
    engine: overrides.engine ?? DEFAULT_EXTRACTION.engine,
  };
};

export const createFirearm = (holderProfileId: UUID, overrides: Partial<Firearm> = {}): Firearm => {
  const base = buildBase('gun', overrides);
  return {
    ...DEFAULT_FIREARM,
    ...base,
    holderProfileId: overrides.holderProfileId ?? holderProfileId,
    firearmType: overrides.firearmType,
    isCurrent: overrides.isCurrent ?? DEFAULT_FIREARM.isCurrent,
  };
};

export const createCompetencyCertificate = (
  holderProfileId: UUID,
  categories: CompetencyCertificate['categories'] = [],
  overrides: Partial<CompetencyCertificate> = {},
): CompetencyCertificate => {
  const base = buildBase('cert', overrides);
  return {
    ...DEFAULT_COMPETENCY_CERTIFICATE,
    ...base,
    holderProfileId,
    categories,
    certificateNumber: overrides.certificateNumber,
    licenceTypes: overrides.licenceTypes,
    trainingProvider: overrides.trainingProvider,
    issuedAt: overrides.issuedAt,
    expiresAt: overrides.expiresAt,
    certificateDocumentId:
      overrides.certificateDocumentId,
    isCurrent: overrides.isCurrent ?? DEFAULT_COMPETENCY_CERTIFICATE.isCurrent,
    notes: overrides.notes,
  };
};

export const createSafe = (
  holderProfileId: UUID,
  overrides: Partial<Safe> = {},
): Safe => {
  const base = buildBase('safe', overrides);
  return {
    ...DEFAULT_SAFE,
    ...base,
    holderProfileId,
    safeName: overrides.safeName,
    fireArms: overrides.fireArms ?? DEFAULT_SAFE.fireArms,
    notes: overrides.notes,
  };
};

export const createSupportingStatement = (
  holderProfileId: UUID,
  overrides: Partial<SupportingStatement> = {},
): SupportingStatement => {
  const base = buildBase('ss', overrides);
  return {
    ...DEFAULT_SUPPORTING_STATEMENT,
    ...base,
    holderProfileId,
    status: overrides.status ?? DEFAULT_SUPPORTING_STATEMENT.status,
    slot: overrides.slot ?? DEFAULT_SUPPORTING_STATEMENT.slot,
    mode: overrides.mode ?? DEFAULT_SUPPORTING_STATEMENT.mode,
    relationshipCategory: overrides.relationshipCategory,
    relationshipDetail: overrides.relationshipDetail,
    applicationId: overrides.applicationId,
    documentId: overrides.documentId,
    wizardData: overrides.wizardData,
    generatedText: overrides.generatedText,
  };
};

export const createActivityEvidence = (
  holderProfileId: UUID,
  evidenceType: ActivityEvidence['evidenceType'],
  overrides: Partial<ActivityEvidence> = {},
): ActivityEvidence => {
  const base = buildBase('aev', overrides);
  return {
    ...DEFAULT_ACTIVITY_EVIDENCE,
    ...base,
    holderProfileId,
    evidenceType,
    photos: Array.isArray(overrides.photos) ? overrides.photos : DEFAULT_ACTIVITY_EVIDENCE.photos,
    notes: overrides.notes ?? DEFAULT_ACTIVITY_EVIDENCE.notes,
  };
};

export const createMotivation = (
  holderProfileId: UUID,
  firearmId: UUID,
  overrides: Partial<Motivation> = {},
): Motivation => {
  const base = buildBase('mot', overrides);
  return {
    ...DEFAULT_MOTIVATION,
    ...base,
    holderProfileId,
    firearmId,
    source: overrides.source ?? DEFAULT_MOTIVATION.source,
    wizardStatus: overrides.wizardStatus ?? DEFAULT_MOTIVATION.wizardStatus,
    profile: overrides.profile,
    text: overrides.text,
  };
};

export const createApplication = (
  form: Application['form'],
  overrides: Partial<Application> = {},
): Application => {
  const base = buildBase('app', overrides);
  return {
    ...DEFAULT_APPLICATION,
    ...base,
    form,
    status: overrides.status ?? DEFAULT_APPLICATION.status,
    firearms: overrides.firearms ?? DEFAULT_APPLICATION.firearms,
    safeIds: overrides.safeIds ?? DEFAULT_APPLICATION.safeIds,
    selectedFirearmIds:
      overrides.selectedFirearmIds ??
      // Legacy fallback for older callers
      (overrides as any).firearmIds ??
      DEFAULT_APPLICATION.selectedFirearmIds,
    membershipIds: overrides.membershipIds ?? DEFAULT_APPLICATION.membershipIds,
    proficiencyIds: overrides.proficiencyIds ?? DEFAULT_APPLICATION.proficiencyIds,
    activityEvidenceIds: overrides.activityEvidenceIds ?? DEFAULT_APPLICATION.activityEvidenceIds,
    supportingStatementIds:
      overrides.supportingStatementIds ?? DEFAULT_APPLICATION.supportingStatementIds,
    requireMembership: overrides.requireMembership ?? DEFAULT_APPLICATION.requireMembership,
    motivationText: overrides.motivationText,
    licenceType: overrides.licenceType,
    licenceTypes: overrides.licenceTypes,
    renewalCategories: overrides.renewalCategories ?? DEFAULT_APPLICATION.renewalCategories,
    renewalSelections: overrides.renewalSelections ?? DEFAULT_APPLICATION.renewalSelections,
    submittedAt: overrides.submittedAt,
    pdfPath: overrides.pdfPath,
    docs: overrides.docs ?? DEFAULT_APPLICATION.docs,
    capturePreference: overrides.capturePreference,
    declarations: overrides.declarations ?? DEFAULT_APPLICATION.declarations,
    userToSubmitMotivation: overrides.userToSubmitMotivation ?? DEFAULT_APPLICATION.userToSubmitMotivation,
    iap: overrides.iap,
    paymentReceived: overrides.paymentReceived,
    competencyCertificateIds:
      overrides.competencyCertificateIds ?? DEFAULT_APPLICATION.competencyCertificateIds,
    checklistDocumentId: overrides.checklistDocumentId,
    documentBundlePath: overrides.documentBundlePath,
    documentBundlePageCount:
      overrides.documentBundlePageCount,
    motivationProfile: overrides.motivationProfile,
    motivationSource: overrides.motivationSource,
    motivationWizardStatus: overrides.motivationWizardStatus,
  };
};

export const defaults = {
  base: DEFAULT_BASE,
  profile: ACTIVE_PROFILE,
  userPrefs: ACTIVE_USER_PREFS,
  devicePrefs: DEFAULT_DEVICE_PREFS,
  reminder: DEFAULT_REMINDER,
  document: DEFAULT_DOCUMENT,
  extraction: DEFAULT_EXTRACTION,
  firearm: DEFAULT_FIREARM,
  competencyCertificate: DEFAULT_COMPETENCY_CERTIFICATE,
  safe: DEFAULT_SAFE,
  activityEvidence: DEFAULT_ACTIVITY_EVIDENCE,
  motivation: DEFAULT_MOTIVATION,
  supportingStatement: DEFAULT_SUPPORTING_STATEMENT,
  application: DEFAULT_APPLICATION,
};
