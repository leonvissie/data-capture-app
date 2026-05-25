// v1 schema (greenfield). Keep additions backward-compatible later by bumping schemaVersion.
import type { ReminderCode } from '../config/reminders';
import type { ScreenModePreference } from '../theme/screenMode';

export type UUID = string;
export type ApplicationStatus = 'draft' | 'ready' | 'submitted' | 'archived';
export type DocStatus = 'pending' | 'captured' | 'extracted' | 'verified';
export type CaptureMethod = 'camera' | 'upload' | 'manual';
export type ExtractionType =
  | 'CompetencyCertificate'
  | 'FirearmLicence'
  | 'IdentityDocument'
  | 'ProofOfAddress'
  | 'Unknown';

export type idType = 'ID_CARD' | 'ID_BOOK' | 'PASSPORT';
export type ApplicantSex = 'female' | 'male' | 'unknown';
export type CompetencyCategory = 'Handgun' | 'Rifle' | 'Shotgun' | 'HandMachineCarbine';
export type FirearmAction = 'Semi-automatic' | 'Automatic' | 'Manual' | 'Other';
export type FirearmType = 'Handgun' | 'Rifle' | 'Shotgun' | 'Combination' | 'Other';
export type ResidenceHomeType =
  | 'House'
  | 'Flat / Apartment'
  | 'Townhouse / Duplex'
  | 'Cluster / Estate unit'
  | 'Farm / Smallholding dwelling'
  | 'Room / Shared accommodation'
  | 'Other';
export type ResidenceSecurityMeasure =
  | 'None'
  | 'Monitored alarm'
  | 'Armed response'
  | 'Perimeter wall'
  | 'Security fencing'
  | 'Electric fencing'
  | 'Security gates'
  | 'Burglar bars'
  | 'CCTV / cameras'
  | 'Outdoor beams / sensors'
  | 'Guard dog'
  | 'Estate / complex access control'
  | 'On-site security / guards';
export type FirearmPurpose = 'hunting' | 'sport_shooting' | 'mixed_hunting_sport';
export type SafePhotoCategory = 'CLOSED' | 'OPEN' | 'BOLTS' | 'SERIAL' | 'SABS' | 'OTHER';
export type MembershipDocument =
  | 'ASSOCIATION_MEMBERSHIP'
  | 'ASSOCIATION_LETTER'
  | 'DEDICATED_HUNTER_CERT'
  | 'DEDICATED_SPORT_CERT'
  | 'FIREARM_ENDORSEMENT';
export type EndorsementCategory = 'SELF_DEFENCE' | 'HUNTING' | 'SPORT_SHOOTING';
export type ActivityEvidenceType = 'SPORT_SHOOTING' | 'HUNTING';
export type ActivityEvidenceCapturedAtSource = 'camera_now' | 'exif';
export type DocumentKind =  
  'ID_CARD'
  | 'ID_BOOK'
  | 'PASSPORT'
  | 'FIREARM_LICENCE'
  | 'PROOF_OF_ADDRESS'
  | 'COMPETENCY_CERT'
  | 'SAFE'
  | 'SUPPORTING_STATEMENT'
  | 'ASSOCIATION_MEMBERSHIP'
  | 'ASSOCIATION_LETTER'
  | 'DEDICATED_HUNTER_CERT'
  | 'DEDICATED_SPORT_CERT'
  | 'FIREARM_ENDORSEMENT'
  | 'ACTIVITY_EVIDENCE'
  | 'PROFICIENCY_HANDGUN'
  | 'PROFICIENCY_RIFLE'
  | 'PROFICIENCY_SHOTGUN'
  | 'PROFICIENCY_HANDMACHINECARBINE'
  | 'STATEMENT_OF_RESULTS'
  | 'STATEMENT_OF_RESULTS_KNOWLEDGE'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_1'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_2'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_3'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_4'
  | 'OTHER';

export type ProficiencyDocument =
  | 'PROFICIENCY_HANDGUN'
  | 'PROFICIENCY_RIFLE'
  | 'PROFICIENCY_SHOTGUN'
  | 'PROFICIENCY_HANDMACHINECARBINE'
  | 'STATEMENT_OF_RESULTS_KNOWLEDGE'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_1'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_2'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_3'
  | 'STATEMENT_OF_RESULTS_HANDLE_USE_4';
  
export type LicenceMembershipRequirement = 'required' | 'optional' | 'none';

export type PolicyDocumentKind = {
  kind: DocumentKind;
  numberOfSides: 1 | 2;
};

export type RequirementScope = {
  perApp?: boolean;
  perFirearm?: boolean;
  perSafe?: boolean;
  perCertificate?: boolean;
  perMembership?: boolean;
};

export type ApplicationDocState = {
  applicationId: UUID;
  policy: {
    form: '517g' | '518a' | '517';
    version: string;
    effectiveFrom?: string;
    licenceTypes?: string[];
    includeMembershipIfPresent?: boolean;
  };
  requirements: Array<{
    code: string;
    required: boolean;
    requireUpload: boolean;
    isSupportingDocument: boolean;
    isChecklistItem: boolean;
    documentKinds?: PolicyDocumentKind[];
    annexure?: string;
    min?: number;
    copies?: number;
    scope?: 'perApp' | 'perFirearm' | 'perSafe' | 'perCertificate' | 'perMembership';
  }>;
  documents: ApplicationDocEntry[];
};

export type ApplicationDocEntry = {
  requirementCode: string;
  kind: DocumentKind;
  documentId: UUID;
  source: {
    type: ApplicationDocSourceType;
    id?: UUID;
  };
};

export type FeedbackType = 'TYPO' | 'BROKEN' | 'REQUEST' | 'OTHER';
export type CompetencyExpiryReminderPreference = 'compIssueDate' | 'firearmExpiry' | 'unknown';
export type ApplicationIntent = 'new' | 'renewal' | 'both';
export type ApplicationTypePreference = 'competency' | 'firearm' | 'both';
export type WelcomeFlowPreference =
  | 'new_competency_517'
  | 'new_firearm_271'
  | 'renew_competency_517g'
  | 'renew_firearm_518a';

export type Base = {
  id: UUID;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number; // start at 1
  version: number;       // bump on each write
  ownerUserId?: string | null;
  deviceId?: string;
  deleted?: boolean;
};

export type ApplicationDocSourceType =
  | 'Application'
  | 'Profile'
  | 'Firearm'
  | 'Safe'
  | 'CompetencyCertificate'
  | 'Membership'
  | 'Proficiency'
  | 'ActivityEvidence';

/* ---------------- Profile ---------------- */
export type Address = {
  singleLine?: string;
  postCode?: string;
  line1?: string;
  line2?: string;
  suburb?: string;
  city?: string;
  province?: string;
  homeType?: ResidenceHomeType;
  securityMeasures?: ResidenceSecurityMeasure[];
  // province?: Province;
};

export type ReferenceRelationshipCategory =
  | 'spouse'
  | 'family'
  | 'friend'
  | 'colleague'
  | 'neighbour';

export type ReferenceInfo = {
  statementNumber?: 1 | 2 | 3;
  fullNames?: string;
  type?: string; // relationship detail alias (e.g. Wife, Husband, Partner)
  idNumber?: string;
  mobile?: string;
  since?: string; // 4-digit year
  address?: string;
  relationshipCategory?: ReferenceRelationshipCategory;
  relationshipDetail?: string;
};

export type Profile = Base & {
  type: 'Profile';
  givenNames?: string;
  surname?: string;
  initials?: string;
  occupation?: string;
  employment?: {
    tradeOrProfession?: string;
    selfEmployedDetail?: string;
    employerName?: string;
    employerAddress?: Address;
  };
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widow' | 'widower' | 'other';
  maritalStatusOther?: string;
  usedFirearmsSince?: string;
  firearmOwnerSince?: string;

  idType?: idType;
  isForeignNational?: boolean;
  documentIdFront?: UUID;    // Document(idType)
  documentIdBack?: UUID;     // Document(idType)
  idNumber?: string;
  sexAtBirth?: ApplicantSex;
  idBarcodeExtracted?: boolean;
  email?: string;
  mobile?: string;
  homePhone?: string;
  workPhone?: string;
  proofOfAddressDate?: string; // ISO date

  hasPostalAddress?: boolean;
  address?: Address;
  addressPostal?: Address;
  references?: ReferenceInfo[];
};

/* ---------------- Preferences ---------------- */
// Account-level, sync across devices
export type UserPrefs = Base & {
  type: 'UserPrefs';
  holderProfileId: UUID;          // link to Profile.id
  applicationIntent?: ApplicationIntent;
  applicationType?: ApplicationTypePreference;
  welcomeFlow?: WelcomeFlowPreference;
  isFirstLoad?: boolean;
  useBiometrics?: boolean;
  useCamera?: boolean;
  usePhotoLibrary?: boolean;
  showPhotoLibraryAlert?: boolean;
  syncToCloud?: boolean;
  syncKeyId?: string;
  syncLastSnapshotAt?: string;
  syncLastError?: string;
  passcodeTimeoutSec?: number;
  analyticsOptIn?: boolean;
  remindRenewal?: boolean;
  dfoCompetencyExpiryUsing?: CompetencyExpiryReminderPreference;
  compCertCalcMethodSet?: boolean;
  remindersResetRequestedAt?: string;
  competencyRemindersResetRequestedAt?: string;
  showFirearmWizardHint?: boolean;
  showCompetencyWizardHint?: boolean;
  showIdWizardHint?: boolean;
  showAddressWizardHint?: boolean;
  showSafeWizardHint?: boolean;
  showMembershipWizardHint?: boolean;
  showGetStarted?: boolean;
  showFirstTimeSetup?: boolean;
  showGetStartedDisabled?: boolean;
  showSendFeedbackMessage?: boolean;
  collapsedPanels?: Record<string, Record<string, boolean>>;
  shareFeedback?: boolean;
  devModeEnabled?: boolean;
  screenMode?: ScreenModePreference;
};

// Device-level, stays on this device (or you can sync if you want)
export type DevicePrefs = Base & {
  type: 'DevicePrefs';
  holderProfileId?: UUID;         // optional link
  deviceId?: string;              // from Base.deviceId too
  haptics?: boolean;
  reducedMotion?: boolean;
  cameraResolution?: 'low' | 'medium' | 'high';
  uploadOnCellular?: boolean;
};

export type Reminders = Base & {
  type: 'Reminders';
  holderProfileId: UUID;
  itemId?: UUID;
  reminderCode: ReminderCode;
  showReminder?: boolean;
  expiryValue?: string;
};

export type Feedback = Base & {
  type: 'Feedback';
  holderProfileId: UUID;
  feedbackScreen: string;
  feedbackRoute?: string;
  openedFrom?: string;
  closeTo?: string;
  feedbackType?: FeedbackType;
  feedbackText: string;
  appVersion?: string;
  deviceModel?: string;
  osVersion?: string;
  buildEnv?: 'dev' | 'stage' | 'prod';
  exportedAt?: string; // ISO date
};

/* ---------------- Document ---------------- */
export type IdentityDocumentSide = 'front' | 'back' | 'both' | 'not_applicable';

export type Document = Base & {
  type: 'Document';
  holderProfileId: UUID;
  kind: DocumentKind;
  filePath: string;       // local path (relative to app docs) or URI
  thumbPath?: string;     // optional thumbnail
  sha256: string;         // file content hash
  pages: number;          // for PDFs, multi-page images, etc.
  ocrExtractionId?: UUID; // points to Extraction.id
  notes?: string;
  name?: string;
  uri?: string;           // local file URI
  mime?: string;
  size?: number;
  barcodeType?: string;
  barcodeData?: string;
  parentType?: 'Firearm' | 'CompetencyCertificate' | 'Safe' | 'Profile' | 'Membership' | 'Proficiency' | 'ActivityEvidence' | 'SupportingStatement';
  parentId?: UUID;
  // NEW (encryption + typing)
  isEncrypted?: boolean;               // true when stored encrypted on device
  encVersion?: 'v1';                   // future-proofing
  applicationId?: UUID;
  requirementCode?: string;
  requirementRelatedId?: UUID;
  requirementRelatedLabel?: string;
  capturedAt?: string;
  identityDocumentSide?: IdentityDocumentSide;
  base64Data?: string;                 // fallback storage when filesystem is unavailable
};

/* ---------------- Extraction ---------------- */
export type Extraction = Base & {
  type: 'Extraction';
  documentId: UUID;
  extractionType: ExtractionType;
  fields: Record<string, string>;
  quality: 'low' | 'medium' | 'high';
  engine: 'mlkit' | 'tesseract' | 'manual';
  rawText?: string;
  errorCode?: string;
  errorMessage?: string;
};

/* ---------------- Competency Certificate ---------------- */
export type CompetencyCertificate = Base & {
  type: 'CompetencyCertificate';
  holderProfileId: UUID;
  categories: CompetencyCategory[]; // e.g., ['Handgun','Rifle']
  certificateNumber?: string;
  licenceTypes?: string[];
  trainingProvider?: string;
  issuedAt?: string;   // ISO date
  expiresAt?: string;  // ISO date
  expiresAtCompCertCalc?: string; // ISO date
  expiresAtFirearmCalc?: string; // ISO date
  certificateDocumentId?: UUID; // Document(kind='COMPETENCY_CERT')
  isCurrent?: boolean;
  isDemoData?: boolean;
  notes?: string;
};

/* ---------------- Firearms ---------------- */
export type Firearm = Base & {
  type: 'Firearm';
  holderProfileId: UUID;
  barCodeIdNumber?: string;
  barcodeInitialSurname?: string;
  firearmType?: CompetencyCategory;
  make?: string;
  model?: string;
  firearmSerialNumber?: string;
  calibre?: string;
  barrelMake?: string;
  barrelSerialNo?: string;
  receiverMake?: string;
  receiverSerialNumber?: string;
  frameMake?: string;
  frameSerialNumber?: string;
  firearmAction?: FirearmAction;
  firearmActionOther?: string;
  licenseNumber?: string;
  section?: string;
  purpose?: FirearmPurpose;
  manufacturerNameAddress?: string;
  validFrom?: string; // ISO date
  validTo?: string;   // ISO date
  isCurrent?: boolean;
  isDemoData?: boolean;
};

/* ---------------- Safes ---------------- */
export type Safe = Base & {
  type: 'Safe';
  safeName?: string;
  holderProfileId: UUID;
  fireArms?: Firearm[];
  safePhotos?: {
    category: SafePhotoCategory;
    documentId: UUID;
  }[];
  make?: string;
  notes?: string;
};

/* ---------------- Memberships ---------------- */
export type Membership = Base & {
  type: 'Membership';
  associationName?: string;
  enrolledAt?: string; // ISO date
  membershipExpiresAt?: string; // ISO date
  holderProfileId: UUID;
  membershipDocumentIds?: {
    kind: MembershipDocument;
    documentId: UUID;
    relatedFirearmId?: UUID;
    category?: EndorsementCategory;
    issueDate?: string; // ISO date
    expiryDate?: string; // ISO date
    notes?: string;
  }[];
  notes?: string;
};

/* ---------------- Proficiency ---------------- */
export type Proficiency = Base & {
  type: 'Proficiency';
  trainingProviderName?: string;
  issuedAt?: string;   // ISO date
  expiresAt?: string;  // ISO date
  holderProfileId: UUID;
  proficiencyDocumentIds?: {
    kind: ProficiencyDocument;
    documentId: UUID;
    categories?: CompetencyCategory[];
    issuedAt?: string; // ISO date
    serialNumber?: string;
  }[];
  proficiencyCertificates?: {
    kind:
      | 'PROFICIENCY_HANDGUN'
      | 'PROFICIENCY_RIFLE'
      | 'PROFICIENCY_SHOTGUN'
      | 'PROFICIENCY_HANDMACHINECARBINE';
    documentId: UUID;
    categories?: CompetencyCategory[];
    issuedAt?: string; // ISO date
    serialNumber?: string;
  }[];
  notes?: string;
};

/* ---------------- Activity Evidence ---------------- */
export type ActivityEvidence = Base & {
  type: 'ActivityEvidence';
  holderProfileId: UUID;
  evidenceType: ActivityEvidenceType;
  photos: {
    documentId: UUID;
    capturedAt?: string; // YYYY-MM-DD
    capturedAtSource?: ActivityEvidenceCapturedAtSource;
  }[];
  notes?: string;
};

/* ---------------- Supporting Statements ---------------- */
export type SupportingStatementSlot =
  | 'spouse_family'
  | 'friend_colleague_neighbour'
  | 'additional_reference';
export type SupportingStatementMode = 'wizard' | 'upload' | 'external';
export type SupportingRelationshipCategory =
  | 'spouse'
  | 'family'
  | 'friend'
  | 'colleague'
  | 'neighbour';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SupportingStatement = Base & {
  type: 'SupportingStatement';
  holderProfileId: UUID;
  applicationId?: UUID;
  status?: 'empty' | 'draft' | 'complete';
  slot: SupportingStatementSlot;
  relationshipCategory?: SupportingRelationshipCategory;
  relationshipDetail?: string; // e.g., mother, uncle, coworker, neighbour
  mode?: SupportingStatementMode;
  documentId?: UUID;
  wizardData?: Record<string, JsonValue>;
  generatedText?: string;
};

/* ---------------- AnnexureA ---------------- */
export type AnnexureA = {
  firearmType?: FirearmType;
  make?: string;
  model?: string;
  calibre?: string;             // ZA spelling
  serialNumber?: string;        // deprecated alias (keep if you parse legacy)
  // Detailed parts:
  barrelMake?: string;
  barrelSerialNumber?: string;
  frameMake?: string;
  frameSerialNumber?: string;
  receiverMake?: string;
  receiverSerialNumber?: string;
  licenceNumber?: string;       // ZA spelling
  licenceExpiry?: string;       // ISO date
  firearmAction?: FirearmAction;
  firearmActionOther?: string;
};

/* ---------------- Application (unified 517g / 518a) ---------------- */
export type RenewalSelection = {
  licenceType: string;
  categories: CompetencyCategory[];
};

export type MotivationStructuredFrequency =
  | 'rare'
  | 'occasional'
  | 'regular'
  | 'frequent';

export type MotivationRiskExposureTag =
  | 'travels_after_dark'
  | 'frequent_road_travel'
  | 'client_site_visits'
  | 'isolated_areas'
  | 'crime_hotspots'
  | 'valuable_equipment'
  | 'family_protection'
  | 'farm_or_rural_access';

export type MotivationNeedReasonTag =
  | 'personal_protection'
  | 'dedicated_hunting'
  | 'dedicated_sport'
  | 'training_continuity'
  | 'ethical_hunting'
  | 'platform_fit'
  | 'existing_firearm_gap';

export type MotivationFirearmLimitationTag =
  | 'wrong_platform'
  | 'wrong_calibre'
  | 'not_concealable'
  | 'not_field_practical'
  | 'not_discipline_specific'
  | 'insufficient_hunting_fit'
  | 'insufficient_training_fit'
  | 'shared_role_conflict';

export type MotivationFirearmAttributeTag =
  | 'manageable_recoil'
  | 'reliable'
  | 'accurate'
  | 'portable'
  | 'low_ammunition_cost'
  | 'training_friendly'
  | 'field_practical'
  | 'short_range_suitable'
  | 'medium_range_suitable'
  | 'humane_application';

export type MotivationHuntingTerrainTag =
  | 'bushveld'
  | 'open_field'
  | 'mountain'
  | 'mixed_field';

export type MotivationSightingSystem =
  | 'iron_sights'
  | 'scope'
  | 'red_dot'
  | 'mixed';

export type MotivationDistanceBand =
  | 'under_50m'
  | '50_to_150m'
  | '150_to_300m'
  | '300m_plus';

export type MotivationSportDisciplineTag =
  | 'general_range_practice'
  | 'club_competition'
  | 'precision_rimfire'
  | 'practical_rifle'
  | 'steel_challenge';

export type MotivationApplicantContext = {
  occupation?: string;
  residenceProvince?: string;
  yearsOfFirearmExperience?: number;
  travelFrequency?: MotivationStructuredFrequency;
  exposureTags?: MotivationRiskExposureTag[];
  backgroundNote?: string;
};

export type MotivationNeedProfile = {
  reasonTags?: MotivationNeedReasonTag[];
  primaryNeed?: string;
  note?: string;
};

export type MotivationExistingFirearmComparison = {
  comparisonEntries?: MotivationExistingFirearmComparisonEntry[];
  comparedFirearmIds?: UUID[];
  limitationTags?: MotivationFirearmLimitationTag[];
  note?: string;
  overviewNote?: string;
};

export type MotivationExistingFirearmComparisonRole =
  | 'same_role'
  | 'partial_overlap'
  | 'different_role';

export type MotivationExistingFirearmComparisonEntry = {
  firearmId?: UUID;
  label?: string;
  make?: string;
  model?: string;
  calibre?: string;
  firearmSerialNumber?: string;
  firearmType?: CompetencyCategory;
  firearmAction?: FirearmAction;
  comparisonRole?: MotivationExistingFirearmComparisonRole;
  limitationTags?: MotivationFirearmLimitationTag[];
  note?: string;
};

export type MotivationHuntingProfile = {
  species?: string[];
  terrainTags?: MotivationHuntingTerrainTag[];
  distanceBand?: MotivationDistanceBand;
  sightingSystem?: MotivationSightingSystem;
  tripFrequency?: MotivationStructuredFrequency;
  tripsPerYear?: number;
  note?: string;
};

export type MotivationSportProfile = {
  disciplineTags?: MotivationSportDisciplineTag[];
  participationFrequency?: MotivationStructuredFrequency;
  sessionsPerYear?: number;
  note?: string;
};

export type MotivationSelfDefenceProfile = {
  exposureTags?: MotivationRiskExposureTag[];
  travelFrequency?: MotivationStructuredFrequency;
  note?: string;
};

export type MotivationFirearmFitProfile = {
  attributeTags?: MotivationFirearmAttributeTag[];
  recoilSensitivity?: 'low' | 'moderate' | 'high';
  sightingSystem?: MotivationSightingSystem;
  note?: string;
};

export type MotivationSupportProfile = {
  selectedSafeIds?: UUID[];
  referenceCount?: number;
  hasActivityEvidence?: boolean;
  hasFarmLetters?: boolean;
  hasEndorsement?: boolean;
  note?: string;
};

export type MotivationProfile = {
  version: 1;
  applicantContext?: MotivationApplicantContext;
  needProfile?: MotivationNeedProfile;
  existingComparison?: MotivationExistingFirearmComparison;
  huntingProfile?: MotivationHuntingProfile;
  sportProfile?: MotivationSportProfile;
  selfDefenceProfile?: MotivationSelfDefenceProfile;
  firearmFitProfile?: MotivationFirearmFitProfile;
  supportProfile?: MotivationSupportProfile;
};

export type Motivation = Base & {
  type: 'Motivation';
  holderProfileId: UUID;
  firearmId: UUID;
  profile?: MotivationProfile;
  text?: string;
  source?: 'standard' | 'own' | 'wizard';
  wizardStatus?: 'draft' | 'complete';
};

export type CompetencyType = CompetencyCategory;
export type TrainingType = 'Pistol' | 'Revolver' | 'Rifle' | 'Shotgun' | 'Other';
export type YesNo = 'yes' | 'no';
export type CompellingReason =
  | 'ConductBusiness'
  | 'GainfullyEmployed'
  | 'DedicatedHunter'
  | 'DedicatedSportPerson'
  | 'PrivateCollector'
  | 'PublicCollector'
  | 'Other';

export type Form517SectionD = {
  possessFirearmCompetencies?: CompetencyType[];
};

export type Form517SectionG = {
  passedActTest?: boolean;
  passedPracticalTraining?: boolean;
  trainingFirearmTypes?: TrainingType[];
  trainingFirearmOther?: string;
};

export type Form517CaseDetail = {
  policeStation?: string;
  caseNumber?: string;
  chargeOrOffence?: string;
  outcome?: string;
  dateFrom?: string;
  period?: string;
  circumstances?: string;
  firearmDetails?: string;
};

export type Form517SectionH = {
  h1TrainingCertificateConfirmed?: boolean;
  h2TrainingInstitutionName?: string;
  h3TrainingCertificateSerial?: string;
  h4TrainingCertificateDateIssued?: string;
  h5ConvictionsConfirmed?: boolean;
  h5CaseDetails?: Form517CaseDetail[];
  h6PendingCasesConfirmed?: boolean;
  h6CaseDetails?: Form517CaseDetail[];
  h7LostStolenConfirmed?: boolean;
  h7CaseDetails?: Form517CaseDetail[];
  h8NegligenceCaseConfirmed?: boolean;
  h8CaseDetails?: Form517CaseDetail[];
  h9DeclaredUnfitConfirmed?: boolean;
  h9CaseDetails?: Form517CaseDetail[];
  h10ConfiscationConfirmed?: boolean;
  h10CaseDetails?: Form517CaseDetail[];
  h11ProtectionOrderAnswer?: YesNo;
  h11Details?: string;
  h12DeniedLicenceAnswer?: YesNo;
  h12Details?: string;
  h13SuicideDepressionSubstanceAnswer?: YesNo;
  h13Details?: string;
  h14DiagnosedTreatedAnswer?: YesNo;
  h14Details?: string;
  h15DivorceSeparationViolenceAnswer?: YesNo;
  h15Details?: string;
  h16ForcedJobLossAnswer?: YesNo;
  h16Details?: string;
  h17Under21CompellingReasons?: CompellingReason[];
  h17OtherReasonText?: string;
  h17FullDetails?: string;
  h17Confirmed21OrOlder?: boolean;
};

export type Form517Data = {
  sectionD?: Form517SectionD;
  sectionG?: Form517SectionG;
  sectionH?: Form517SectionH;
};

export type Application = Base & {
  type: 'Application';
  form: '517g' | '518a' | '517';
  applicationType?: 'new' | 'renewal';
  status: ApplicationStatus;
  iap?: {
    platform: 'ios' | 'android';
    productId: string;
    status: 'pending' | 'purchased' | 'verified' | 'failed' | 'cancelled';
    displayPrice?: string;
    price?: number;
    currency?: string;
    transactionId?: string; // iOS
    transactionDate?: string; // iOS (ISO or ms timestamp as string)
    purchaseToken?: string; // Android
    orderId?: string; // Android
    purchaseTime?: string; // Android (ISO or ms timestamp as string)
    lastCheckedAt?: string; // ISO timestamp
  };
  applicantProfileId?: UUID;
  paymentReceived?: boolean;
  userConfirmedAccuracy?: boolean;
  includesExpiredCompetencies?: UUID[];
  includesExpiredLicences?: UUID[];
  declarations?: string[];
  submittedAt?: string;
  requireMembership?: boolean;
  userToSubmitMotivation?: boolean;
  licenceType?: string;
  licenceTypes?: string[];
  renewalCategories?: CompetencyCategory[];
  renewalSelections?: RenewalSelection[];
  competencyCertificateIds?: UUID[]; // which certificates were selected for this app
  selectedFirearmIds?: UUID[];
  firearms?: Firearm[];
  safeIds?: UUID[];
  membershipIds?: UUID[];
  proficiencyIds?: UUID[];
  activityEvidenceIds?: UUID[];
  supportingStatementIds?: UUID[];
  docs?: ApplicationDocState;
  capturePreference?: CaptureMethod | 'mixed';
  checklistDocumentId?: UUID;
  documentBundlePath?: string;
  documentBundlePageCount?: number;
  motivationProfile?: MotivationProfile;
  motivationText?: string;
  motivationSource?: 'standard' | 'own' | 'wizard';
  motivationWizardStatus?: 'draft' | 'complete';
  motivationId?: UUID;
  motivationFirearmId?: UUID;
  form517?: Form517Data;
  pdfPath?: string;
  // firearmIds?: UUID[];
  // motivationText?: string;
  // pdfPath?: string;
};

/* ---------------- Union ---------------- */
export type AnyEntity =
  | Profile
  | UserPrefs
  | DevicePrefs
  | Document
  | Extraction
  | Application
  | Firearm
  | CompetencyCertificate
  | Safe
  | Membership
  | Proficiency
  | ActivityEvidence
  | Motivation
  | SupportingStatement
  | Feedback
  | Reminders;

/* ---------------- Outbox (future sync) ---------------- */
export type OutboxItem = {
  id: UUID;
  entityType: AnyEntity['type'];
  entityId: UUID;
  op: 'UPSERT' | 'DELETE';
  payload: AnyEntity;
  createdAt: string;
};
