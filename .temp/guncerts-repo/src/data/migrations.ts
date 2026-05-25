import type {
  ActivityEvidence,
  Address,
  AnyEntity,
  Application,
  Base,
  CompetencyCategory,
  DevicePrefs,
  Document,
  Feedback,
  Firearm,
  Membership,
  Motivation,
  Profile,
  Proficiency,
  ResidenceHomeType,
  ResidenceSecurityMeasure,
  Reminders,
  Safe,
  SupportingStatement,
  UserPrefs,
} from './types';

export const CURRENT_ENTITY_SCHEMA_VERSION = 8;

type StoredRecordRow = {
  id: string;
  type: string;
  blob: string;
  createdAt: string;
  updatedAt: string;
};

type MigrationResult<T> = {
  entity: T;
  changed: boolean;
};

const emptyAddress = (): Address => ({
  singleLine: '',
  postCode: '',
  line1: '',
  line2: '',
  suburb: '',
  city: '',
  province: '',
  homeType: undefined,
  securityMeasures: [],
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const RESIDENCE_HOME_TYPES: ResidenceHomeType[] = [
  'House',
  'Flat / Apartment',
  'Townhouse / Duplex',
  'Cluster / Estate unit',
  'Farm / Smallholding dwelling',
  'Room / Shared accommodation',
  'Other',
];

const RESIDENCE_SECURITY_MEASURES: ResidenceSecurityMeasure[] = [
  'Monitored alarm',
  'Armed response',
  'Perimeter wall',
  'Security fencing',
  'Electric fencing',
  'Security gates',
  'Burglar bars',
  'CCTV / cameras',
  'Outdoor beams / sensors',
  'Guard dog',
  'Estate / complex access control',
  'On-site security / guards',
];

const isResidenceHomeType = (value: unknown): value is ResidenceHomeType =>
  typeof value === 'string' && RESIDENCE_HOME_TYPES.includes(value as ResidenceHomeType);

const isResidenceSecurityMeasure = (
  value: unknown
): value is ResidenceSecurityMeasure =>
  typeof value === 'string' &&
  RESIDENCE_SECURITY_MEASURES.includes(value as ResidenceSecurityMeasure);

const normalizeAddress = (value: unknown): Address => {
  if (!isObject(value)) return emptyAddress();
  return {
    singleLine: typeof value.singleLine === 'string' ? value.singleLine : '',
    postCode: typeof value.postCode === 'string' ? value.postCode : '',
    line1: typeof value.line1 === 'string' ? value.line1 : '',
    line2: typeof value.line2 === 'string' ? value.line2 : '',
    suburb: typeof value.suburb === 'string' ? value.suburb : '',
    city: typeof value.city === 'string' ? value.city : '',
    province: typeof value.province === 'string' ? value.province : '',
    homeType: isResidenceHomeType(value.homeType) ? value.homeType : undefined,
    securityMeasures: Array.isArray(value.securityMeasures)
      ? value.securityMeasures.filter(
          (measure): measure is ResidenceSecurityMeasure =>
            isResidenceSecurityMeasure(measure)
        )
      : [],
  };
};

const normalizeBase = <T extends Base>(entity: T): T => {
  const schemaVersion =
    Number.isFinite(entity.schemaVersion) && entity.schemaVersion > 0
      ? entity.schemaVersion
      : CURRENT_ENTITY_SCHEMA_VERSION;
  const version = Number.isFinite(entity.version) && entity.version > 0 ? entity.version : 1;
  return {
    ...entity,
    schemaVersion,
    version,
  };
};

const normalizeProfile = (entity: Profile): Profile => {
  const normalized = normalizeBase(entity);
  const validMaritalStatus =
    normalized.maritalStatus === 'single' ||
    normalized.maritalStatus === 'married' ||
    normalized.maritalStatus === 'divorced' ||
    normalized.maritalStatus === 'widow' ||
    normalized.maritalStatus === 'widower' ||
    normalized.maritalStatus === 'other'
      ? normalized.maritalStatus
      : undefined;
  return {
    ...normalized,
    occupation: typeof normalized.occupation === 'string' ? normalized.occupation : '',
    employment: isObject(normalized.employment)
      ? {
          tradeOrProfession:
            typeof normalized.employment.tradeOrProfession === 'string'
              ? normalized.employment.tradeOrProfession
              : '',
          selfEmployedDetail:
            typeof normalized.employment.selfEmployedDetail === 'string'
              ? normalized.employment.selfEmployedDetail
              : '',
          employerName:
            typeof normalized.employment.employerName === 'string'
              ? normalized.employment.employerName
              : '',
          employerAddress: normalizeAddress(normalized.employment.employerAddress),
        }
      : {
          tradeOrProfession: '',
          selfEmployedDetail: '',
          employerName: '',
          employerAddress: emptyAddress(),
        },
    maritalStatus: validMaritalStatus,
    maritalStatusOther:
      typeof normalized.maritalStatusOther === 'string' ? normalized.maritalStatusOther : '',
    isForeignNational: normalized.isForeignNational ?? false,
    sexAtBirth:
      normalized.sexAtBirth === 'female' || normalized.sexAtBirth === 'male'
        ? normalized.sexAtBirth
        : 'unknown',
    idBarcodeExtracted: normalized.idBarcodeExtracted ?? false,
    hasPostalAddress: normalized.hasPostalAddress ?? false,
    references: Array.isArray(normalized.references)
      ? normalized.references
          .filter((item): item is Record<string, unknown> => isObject(item))
          .map((item) => ({
            statementNumber:
              item.statementNumber === 1 || item.statementNumber === 2 || item.statementNumber === 3
                ? item.statementNumber
                : undefined,
            fullNames: typeof item.fullNames === 'string' ? item.fullNames : undefined,
            type: typeof item.type === 'string' ? item.type : undefined,
            idNumber: typeof item.idNumber === 'string' ? item.idNumber : undefined,
            mobile: typeof item.mobile === 'string' ? item.mobile : undefined,
            since: typeof item.since === 'string' ? item.since : undefined,
            address: typeof item.address === 'string' ? item.address : undefined,
            relationshipCategory:
              item.relationshipCategory === 'spouse' ||
              item.relationshipCategory === 'family' ||
              item.relationshipCategory === 'friend' ||
              item.relationshipCategory === 'colleague' ||
              item.relationshipCategory === 'neighbour'
                ? item.relationshipCategory
                : undefined,
            relationshipDetail:
              typeof item.relationshipDetail === 'string' ? item.relationshipDetail : undefined,
          }))
      : [],
    address: normalizeAddress(normalized.address),
    addressPostal: normalized.addressPostal
      ? normalizeAddress(normalized.addressPostal)
      : normalized.addressPostal,
  };
};

const normalizeUserPrefs = (entity: UserPrefs): UserPrefs => {
  const normalized = normalizeBase(entity);
  const collapsedPanels = isObject(normalized.collapsedPanels)
    ? (normalized.collapsedPanels as Record<string, Record<string, boolean>>)
    : {};

  return {
    ...normalized,
    applicationIntent:
      normalized.applicationIntent === 'new' ||
      normalized.applicationIntent === 'renewal' ||
      normalized.applicationIntent === 'both'
        ? normalized.applicationIntent
        : 'both',
    applicationType:
      normalized.applicationType === 'competency' ||
      normalized.applicationType === 'firearm' ||
      normalized.applicationType === 'both'
        ? normalized.applicationType
        : 'both',
    welcomeFlow:
      normalized.welcomeFlow === 'new_competency_517' ||
      normalized.welcomeFlow === 'new_firearm_271' ||
      normalized.welcomeFlow === 'renew_competency_517g' ||
      normalized.welcomeFlow === 'renew_firearm_518a'
        ? normalized.welcomeFlow
        : undefined,
    dfoCompetencyExpiryUsing:
      normalized.dfoCompetencyExpiryUsing === 'compIssueDate' ||
      normalized.dfoCompetencyExpiryUsing === 'firearmExpiry' ||
      normalized.dfoCompetencyExpiryUsing === 'unknown'
        ? normalized.dfoCompetencyExpiryUsing
        : 'unknown',
    useBiometrics: normalized.useBiometrics ?? false,
    useCamera: normalized.useCamera ?? false,
    usePhotoLibrary: normalized.usePhotoLibrary ?? false,
    showPhotoLibraryAlert: normalized.showPhotoLibraryAlert ?? true,
    syncToCloud: normalized.syncToCloud ?? false,
    isFirstLoad: normalized.isFirstLoad ?? true,
    passcodeTimeoutSec: normalized.passcodeTimeoutSec ?? 120,
    analyticsOptIn: normalized.analyticsOptIn ?? false,
    remindRenewal: normalized.remindRenewal ?? false,
    compCertCalcMethodSet: normalized.compCertCalcMethodSet ?? false,
    showFirearmWizardHint: normalized.showFirearmWizardHint ?? true,
    showCompetencyWizardHint: normalized.showCompetencyWizardHint ?? true,
    showIdWizardHint: normalized.showIdWizardHint ?? true,
    showAddressWizardHint: normalized.showAddressWizardHint ?? true,
    showSafeWizardHint: normalized.showSafeWizardHint ?? true,
    showMembershipWizardHint: normalized.showMembershipWizardHint ?? true,
    showGetStarted: normalized.showGetStarted ?? true,
    showFirstTimeSetup: normalized.showFirstTimeSetup ?? true,
    showGetStartedDisabled: normalized.showGetStartedDisabled ?? false,
    showSendFeedbackMessage: normalized.showSendFeedbackMessage ?? true,
    shareFeedback: normalized.shareFeedback ?? false,
    devModeEnabled: normalized.devModeEnabled ?? false,
    screenMode: normalized.screenMode ?? 'default',
    collapsedPanels,
  };
};

const normalizeDevicePrefs = (entity: DevicePrefs): DevicePrefs => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    deviceId: normalized.deviceId ?? 'local-device',
    haptics: normalized.haptics ?? true,
    reducedMotion: normalized.reducedMotion ?? false,
    cameraResolution: normalized.cameraResolution ?? 'high',
    uploadOnCellular: normalized.uploadOnCellular ?? false,
  };
};

const normalizeReminder = (entity: Reminders): Reminders => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    showReminder: normalized.showReminder ?? false,
  };
};

const normalizeFeedback = (entity: Feedback): Feedback => normalizeBase(entity);

const normalizeDocument = (entity: Document): Document => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    pages: Number.isFinite(normalized.pages) ? normalized.pages : 0,
    isEncrypted: normalized.isEncrypted ?? false,
  };
};

const normalizeFirearm = (entity: Firearm): Firearm => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    purpose:
      normalized.purpose === 'hunting' ||
      normalized.purpose === 'sport_shooting' ||
      normalized.purpose === 'mixed_hunting_sport'
        ? normalized.purpose
        : undefined,
    isDemoData: normalized.isDemoData ?? false,
  };
};

const normalizeSafe = (entity: Safe): Safe => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    fireArms: Array.isArray(normalized.fireArms) ? normalized.fireArms : [],
    safePhotos: Array.isArray(normalized.safePhotos) ? normalized.safePhotos : [],
  };
};

const normalizeMembership = (entity: Membership): Membership => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    membershipDocumentIds: Array.isArray(normalized.membershipDocumentIds)
      ? normalized.membershipDocumentIds
          .filter((entry) => {
            const kind = entry?.kind;
            const documentId = (entry?.documentId ?? '').trim();
            return (
              (kind === 'ASSOCIATION_MEMBERSHIP' ||
                kind === 'ASSOCIATION_LETTER' ||
                kind === 'DEDICATED_HUNTER_CERT' ||
                kind === 'DEDICATED_SPORT_CERT' ||
                kind === 'FIREARM_ENDORSEMENT') &&
              documentId.length > 0
            );
          })
          .map((entry) => {
            const category =
              entry.kind === 'FIREARM_ENDORSEMENT' &&
              (entry as any).category &&
              ((entry as any).category === 'SELF_DEFENCE' ||
                (entry as any).category === 'HUNTING' ||
                (entry as any).category === 'SPORT_SHOOTING')
                ? ((entry as any).category as 'SELF_DEFENCE' | 'HUNTING' | 'SPORT_SHOOTING')
                : undefined;
            const relatedFirearmIdRaw =
              entry.kind === 'FIREARM_ENDORSEMENT'
                ? String((entry as any).relatedFirearmId ?? '').trim()
                : '';
            const notesRaw = String((entry as any).notes ?? '').trim();
            return {
              kind: entry.kind,
              documentId: entry.documentId,
              relatedFirearmId: relatedFirearmIdRaw || undefined,
              category,
              issueDate: typeof entry.issueDate === 'string' ? entry.issueDate : undefined,
              expiryDate: typeof entry.expiryDate === 'string' ? entry.expiryDate : undefined,
              notes: notesRaw || undefined,
            };
          })
      : [],
  };
};

const normalizeProficiency = (entity: Proficiency): Proficiency => {
  const normalized = normalizeBase(entity);
  const legacyEntries = Array.isArray(normalized.proficiencyDocumentIds)
    ? normalized.proficiencyDocumentIds
    : [];
  const normalizedLegacyEntries = legacyEntries.map((entry) => {
    if (
      entry.kind !== 'PROFICIENCY_HANDGUN' &&
      entry.kind !== 'PROFICIENCY_RIFLE' &&
      entry.kind !== 'PROFICIENCY_SHOTGUN' &&
      entry.kind !== 'PROFICIENCY_HANDMACHINECARBINE'
    ) {
      return entry;
    }

    if (Array.isArray(entry.categories) && entry.categories.length > 0) {
      return entry;
    }

    const defaultCategory: CompetencyCategory =
      entry.kind === 'PROFICIENCY_HANDGUN'
        ? 'Handgun'
        : entry.kind === 'PROFICIENCY_RIFLE'
          ? 'Rifle'
          : entry.kind === 'PROFICIENCY_SHOTGUN'
            ? 'Shotgun'
            : 'HandMachineCarbine';

    return {
      ...entry,
      categories: [defaultCategory],
    };
  });
  const existingCertificates = Array.isArray((normalized as any).proficiencyCertificates)
    ? ((normalized as any).proficiencyCertificates as Proficiency['proficiencyCertificates'])
    : [];
  const synthesizedCertificates = existingCertificates && existingCertificates.length
    ? existingCertificates
    : normalizedLegacyEntries
        .filter((entry) =>
          entry.kind === 'PROFICIENCY_HANDGUN' ||
          entry.kind === 'PROFICIENCY_RIFLE' ||
          entry.kind === 'PROFICIENCY_SHOTGUN' ||
          entry.kind === 'PROFICIENCY_HANDMACHINECARBINE',
        )
        .map((entry) => ({
          kind: (
            entry.kind === 'PROFICIENCY_HANDGUN'
              ? 'PROFICIENCY_HANDGUN'
              : entry.kind === 'PROFICIENCY_RIFLE'
                ? 'PROFICIENCY_RIFLE'
                : entry.kind === 'PROFICIENCY_SHOTGUN'
                  ? 'PROFICIENCY_SHOTGUN'
                  : 'PROFICIENCY_HANDMACHINECARBINE'
          ) as
            | 'PROFICIENCY_HANDGUN'
            | 'PROFICIENCY_RIFLE'
            | 'PROFICIENCY_SHOTGUN'
            | 'PROFICIENCY_HANDMACHINECARBINE',
          documentId: entry.documentId,
          categories: (
            entry.categories && entry.categories.length
              ? entry.categories
              : entry.kind === 'PROFICIENCY_HANDGUN'
                ? ['Handgun']
                : entry.kind === 'PROFICIENCY_RIFLE'
                  ? ['Rifle']
                  : entry.kind === 'PROFICIENCY_SHOTGUN'
                    ? ['Shotgun']
                    : ['HandMachineCarbine']
          ) as CompetencyCategory[],
          issuedAt: entry.issuedAt,
          serialNumber: entry.serialNumber,
        }));
  return {
    ...normalized,
    proficiencyDocumentIds: normalizedLegacyEntries,
    proficiencyCertificates: synthesizedCertificates ?? [],
  };
};

const normalizeActivityEvidence = (entity: ActivityEvidence): ActivityEvidence => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    evidenceType:
      normalized.evidenceType === 'HUNTING' || normalized.evidenceType === 'SPORT_SHOOTING'
        ? normalized.evidenceType
        : 'SPORT_SHOOTING',
    photos: Array.isArray(normalized.photos)
      ? normalized.photos
          .filter((entry) => !!entry && typeof entry.documentId === 'string' && entry.documentId.trim().length > 0)
          .map((entry) => ({
            documentId: entry.documentId,
            capturedAt: typeof entry.capturedAt === 'string' ? entry.capturedAt : undefined,
            capturedAtSource:
              entry.capturedAtSource === 'camera_now' || entry.capturedAtSource === 'exif'
                ? entry.capturedAtSource
                : undefined,
          }))
      : [],
  };
};

const normalizeSupportingStatement = (entity: SupportingStatement): SupportingStatement => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    status: normalized.status ?? 'empty',
    slot:
      normalized.slot === 'spouse_family' ||
      normalized.slot === 'friend_colleague_neighbour' ||
      normalized.slot === 'additional_reference'
        ? normalized.slot
        : 'spouse_family',
  };
};

const normalizeMotivation = (entity: Motivation): Motivation => {
  const normalized = normalizeBase(entity);
  return {
    ...normalized,
    source:
      normalized.source === 'standard' ||
      normalized.source === 'own' ||
      normalized.source === 'wizard'
        ? normalized.source
        : undefined,
    wizardStatus:
      normalized.wizardStatus === 'draft' || normalized.wizardStatus === 'complete'
        ? normalized.wizardStatus
        : undefined,
  };
};

const normalizeApplication = (entity: Application): Application => {
  const normalized = normalizeBase(entity);
  const legacyFirearmIds = Array.isArray((normalized as any).firearmIds)
    ? ((normalized as any).firearmIds as string[])
    : [];

  return {
    ...normalized,
    form: normalized.form === '517' || normalized.form === '517g' || normalized.form === '518a'
      ? normalized.form
      : '517g',
    status: normalized.status ?? 'draft',
    applicationType:
      normalized.applicationType === 'new' || normalized.applicationType === 'renewal'
        ? normalized.applicationType
        : normalized.form === '517'
          ? 'new'
          : 'renewal',
    declarations: Array.isArray(normalized.declarations) ? normalized.declarations : [],
    firearms: Array.isArray(normalized.firearms) ? normalized.firearms : [],
    safeIds: Array.isArray(normalized.safeIds) ? normalized.safeIds : [],
    selectedFirearmIds: Array.isArray(normalized.selectedFirearmIds)
      ? normalized.selectedFirearmIds
      : legacyFirearmIds,
    membershipIds: Array.isArray(normalized.membershipIds) ? normalized.membershipIds : [],
    proficiencyIds: Array.isArray(normalized.proficiencyIds) ? normalized.proficiencyIds : [],
    activityEvidenceIds: Array.isArray((normalized as any).activityEvidenceIds)
      ? (normalized as any).activityEvidenceIds
      : [],
    supportingStatementIds: Array.isArray(normalized.supportingStatementIds)
      ? normalized.supportingStatementIds
      : [],
    competencyCertificateIds: Array.isArray(normalized.competencyCertificateIds)
      ? normalized.competencyCertificateIds
      : [],
    renewalCategories: Array.isArray(normalized.renewalCategories) ? normalized.renewalCategories : [],
    renewalSelections: Array.isArray(normalized.renewalSelections) ? normalized.renewalSelections : [],
    requireMembership: normalized.requireMembership ?? false,
    motivationId:
      typeof normalized.motivationId === 'string' && normalized.motivationId.trim().length > 0
        ? normalized.motivationId
        : undefined,
    motivationFirearmId:
      typeof normalized.motivationFirearmId === 'string' && normalized.motivationFirearmId.trim().length > 0
        ? normalized.motivationFirearmId
        : undefined,
    form517: isObject(normalized.form517)
      ? {
          sectionD: isObject(normalized.form517.sectionD)
            ? {
                possessFirearmCompetencies: Array.isArray(normalized.form517.sectionD.possessFirearmCompetencies)
                  ? normalized.form517.sectionD.possessFirearmCompetencies
                  : [],
              }
            : undefined,
          sectionG: isObject(normalized.form517.sectionG)
            ? {
                passedActTest:
                  typeof normalized.form517.sectionG.passedActTest === 'boolean'
                    ? normalized.form517.sectionG.passedActTest
                    : undefined,
                passedPracticalTraining:
                  typeof normalized.form517.sectionG.passedPracticalTraining === 'boolean'
                    ? normalized.form517.sectionG.passedPracticalTraining
                    : undefined,
                trainingFirearmTypes: Array.isArray(normalized.form517.sectionG.trainingFirearmTypes)
                  ? normalized.form517.sectionG.trainingFirearmTypes
                  : [],
                trainingFirearmOther:
                  typeof normalized.form517.sectionG.trainingFirearmOther === 'string'
                    ? normalized.form517.sectionG.trainingFirearmOther
                    : '',
              }
            : undefined,
          sectionH: isObject(normalized.form517.sectionH)
            ? {
                ...normalized.form517.sectionH,
                h2TrainingInstitutionName:
                  typeof normalized.form517.sectionH.h2TrainingInstitutionName === 'string'
                    ? normalized.form517.sectionH.h2TrainingInstitutionName
                    : '',
                h3TrainingCertificateSerial:
                  typeof normalized.form517.sectionH.h3TrainingCertificateSerial === 'string'
                    ? normalized.form517.sectionH.h3TrainingCertificateSerial
                    : '',
                h4TrainingCertificateDateIssued:
                  typeof normalized.form517.sectionH.h4TrainingCertificateDateIssued === 'string'
                    ? normalized.form517.sectionH.h4TrainingCertificateDateIssued
                    : '',
                h5CaseDetails: Array.isArray(normalized.form517.sectionH.h5CaseDetails)
                  ? normalized.form517.sectionH.h5CaseDetails
                  : [],
                h6CaseDetails: Array.isArray(normalized.form517.sectionH.h6CaseDetails)
                  ? normalized.form517.sectionH.h6CaseDetails
                  : [],
                h7CaseDetails: Array.isArray(normalized.form517.sectionH.h7CaseDetails)
                  ? normalized.form517.sectionH.h7CaseDetails
                  : [],
                h8CaseDetails: Array.isArray(normalized.form517.sectionH.h8CaseDetails)
                  ? normalized.form517.sectionH.h8CaseDetails
                  : [],
                h9CaseDetails: Array.isArray(normalized.form517.sectionH.h9CaseDetails)
                  ? normalized.form517.sectionH.h9CaseDetails
                  : [],
                h10CaseDetails: Array.isArray(normalized.form517.sectionH.h10CaseDetails)
                  ? normalized.form517.sectionH.h10CaseDetails
                  : [],
                h11Details:
                  typeof normalized.form517.sectionH.h11Details === 'string'
                    ? normalized.form517.sectionH.h11Details
                    : '',
                h12Details:
                  typeof normalized.form517.sectionH.h12Details === 'string'
                    ? normalized.form517.sectionH.h12Details
                    : '',
                h13Details:
                  typeof normalized.form517.sectionH.h13Details === 'string'
                    ? normalized.form517.sectionH.h13Details
                    : '',
                h14Details:
                  typeof normalized.form517.sectionH.h14Details === 'string'
                    ? normalized.form517.sectionH.h14Details
                    : '',
                h15Details:
                  typeof normalized.form517.sectionH.h15Details === 'string'
                    ? normalized.form517.sectionH.h15Details
                    : '',
                h16Details:
                  typeof normalized.form517.sectionH.h16Details === 'string'
                    ? normalized.form517.sectionH.h16Details
                    : '',
                h17Under21CompellingReasons: Array.isArray(normalized.form517.sectionH.h17Under21CompellingReasons)
                  ? normalized.form517.sectionH.h17Under21CompellingReasons
                  : [],
                h17OtherReasonText:
                  typeof normalized.form517.sectionH.h17OtherReasonText === 'string'
                    ? normalized.form517.sectionH.h17OtherReasonText
                    : '',
                h17FullDetails:
                  typeof normalized.form517.sectionH.h17FullDetails === 'string'
                    ? normalized.form517.sectionH.h17FullDetails
                    : '',
                h17Confirmed21OrOlder:
                  typeof normalized.form517.sectionH.h17Confirmed21OrOlder === 'boolean'
                    ? normalized.form517.sectionH.h17Confirmed21OrOlder
                    : false,
              }
            : undefined,
        }
      : undefined,
  };
};

export function migrateEntity<T extends AnyEntity>(entity: T): MigrationResult<T> {
  const rawSchemaVersion =
    Number.isFinite(entity.schemaVersion) && entity.schemaVersion > 0 ? entity.schemaVersion : 1;

  let next: AnyEntity;
  switch (entity.type) {
    case 'Profile':
      next = normalizeProfile(entity);
      break;
    case 'UserPrefs':
      next = normalizeUserPrefs(entity);
      break;
    case 'DevicePrefs':
      next = normalizeDevicePrefs(entity);
      break;
    case 'Reminders':
      next = normalizeReminder(entity);
      break;
    case 'Feedback':
      next = normalizeFeedback(entity);
      break;
    case 'Document':
      next = normalizeDocument(entity);
      break;
    case 'Firearm':
      next = normalizeFirearm(entity);
      break;
    case 'Safe':
      next = normalizeSafe(entity);
      break;
    case 'Membership':
      next = normalizeMembership(entity);
      break;
    case 'Proficiency':
      next = normalizeProficiency(entity);
      break;
    case 'ActivityEvidence':
      next = normalizeActivityEvidence(entity);
      break;
    case 'SupportingStatement':
      next = normalizeSupportingStatement(entity);
      break;
    case 'Motivation':
      next = normalizeMotivation(entity);
      break;
    case 'Application':
      next = normalizeApplication(entity);
      break;
    default:
      next = normalizeBase(entity);
      break;
  }

  if (rawSchemaVersion < CURRENT_ENTITY_SCHEMA_VERSION) {
    next = {
      ...next,
      schemaVersion: CURRENT_ENTITY_SCHEMA_VERSION,
    } as AnyEntity;
  }

  const changed = JSON.stringify(entity) !== JSON.stringify(next);
  return { entity: next as T, changed };
}

export function migrateStoredRecordRow(row: StoredRecordRow): StoredRecordRow | null {
  try {
    const parsed = JSON.parse(row.blob) as AnyEntity;
    if (!parsed || parsed.id !== row.id) return null;
    const { entity, changed } = migrateEntity(parsed);
    if (!changed) return null;
    return {
      ...row,
      updatedAt: entity.updatedAt ?? row.updatedAt,
      blob: JSON.stringify(entity),
    };
  } catch {
    return null;
  }
}
