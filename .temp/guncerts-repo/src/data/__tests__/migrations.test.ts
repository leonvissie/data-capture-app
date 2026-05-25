import { describe, expect, test } from '@jest/globals';
import type { AnyEntity, Application, Firearm, Profile, Proficiency, UserPrefs } from '../types';
import {
  CURRENT_ENTITY_SCHEMA_VERSION,
  migrateEntity,
  migrateStoredRecordRow,
} from '../migrations';

const baseMeta = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  schemaVersion: 1,
};

describe('migrateEntity', () => {
  test('backfills missing profile defaults and bumps schema version', () => {
    const legacyProfile = {
      id: 'profile-1',
      type: 'Profile',
      givenNames: 'Jane',
      surname: 'Doe',
      holderProfileId: 'profile-1',
      ...baseMeta,
    } as unknown as Profile;

    const { entity, changed } = migrateEntity(legacyProfile);

    expect(changed).toBe(true);
    expect(entity.schemaVersion).toBe(CURRENT_ENTITY_SCHEMA_VERSION);
    expect(entity.hasPostalAddress).toBe(false);
    expect(entity.isForeignNational).toBe(false);
    expect(entity.idBarcodeExtracted).toBe(false);
    expect(entity.employment).toEqual({
      tradeOrProfession: '',
      selfEmployedDetail: '',
      employerName: '',
      employerAddress: {
        singleLine: '',
        postCode: '',
        line1: '',
        line2: '',
        suburb: '',
        city: '',
        province: '',
        homeType: undefined,
        securityMeasures: [],
      },
    });
    expect(entity.maritalStatus).toBeUndefined();
    expect(entity.maritalStatusOther).toBe('');
    expect(entity.address).toEqual({
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
  });

  test('backfills new firearm purpose and extended address fields safely', () => {
    const legacyProfile = {
      id: 'profile-2',
      type: 'Profile',
      givenNames: 'Jane',
      surname: 'Doe',
      address: {
        city: 'Pretoria',
      },
      ...baseMeta,
    } as unknown as Profile;

    const { entity } = migrateEntity(legacyProfile);

    expect(entity.address).toEqual({
      singleLine: '',
      postCode: '',
      line1: '',
      line2: '',
      suburb: '',
      city: 'Pretoria',
      province: '',
      homeType: undefined,
      securityMeasures: [],
    });
  });

  test('backfills current application arrays from legacy shape', () => {
    const legacyApplication = {
      id: 'app-1',
      type: 'Application',
      form: '518a',
      applicantProfileId: 'profile-1',
      firearmIds: ['gun-1'],
      ...baseMeta,
    } as unknown as Application;

    const { entity, changed } = migrateEntity(legacyApplication);

    expect(changed).toBe(true);
    expect(entity.schemaVersion).toBe(CURRENT_ENTITY_SCHEMA_VERSION);
    expect(entity.status).toBe('draft');
    expect(entity.selectedFirearmIds).toEqual(['gun-1']);
    expect(entity.membershipIds).toEqual([]);
    expect(entity.proficiencyIds).toEqual([]);
    expect(entity.supportingStatementIds).toEqual([]);
    expect(entity.competencyCertificateIds).toEqual([]);
    expect(entity.declarations).toEqual([]);
    expect(entity.form517).toBeUndefined();
    expect(entity.motivationId).toBeUndefined();
    expect(entity.motivationFirearmId).toBeUndefined();
  });

  test('keeps legacy application records compatible when motivation and 517 data are absent', () => {
    const legacyApplication = {
      id: 'app-legacy',
      type: 'Application',
      form: '517',
      applicantProfileId: 'profile-1',
      userToSubmitMotivation: true,
      selectedFirearmIds: ['gun-1'],
      ...baseMeta,
    } as unknown as Application;

    const { entity, changed } = migrateEntity(legacyApplication);

    expect(changed).toBe(true);
    expect(entity.schemaVersion).toBe(CURRENT_ENTITY_SCHEMA_VERSION);
    expect(entity.form).toBe('517');
    expect(entity.userToSubmitMotivation).toBe(true);
    expect(entity.form517).toBeUndefined();
    expect(entity.motivationId).toBeUndefined();
    expect(entity.motivationFirearmId).toBeUndefined();
    expect(entity.motivationSource).toBeUndefined();
    expect(entity.motivationWizardStatus).toBeUndefined();
  });

  test('sanitizes malformed 517 payload without crashing', () => {
    const legacyApplication = {
      id: 'app-517-malformed',
      type: 'Application',
      form: '517',
      applicantProfileId: 'profile-1',
      form517: {
        sectionD: {},
        sectionG: {
          trainingFirearmTypes: 'Rifle',
          trainingFirearmOther: 42,
        },
        sectionH: {
          h2TrainingInstitutionName: 10,
          h5CaseDetails: null,
        },
      },
      ...baseMeta,
    } as unknown as Application;

    const { entity } = migrateEntity(legacyApplication);

    expect(entity.form517?.sectionD?.possessFirearmCompetencies).toEqual([]);
    expect(entity.form517?.sectionG?.trainingFirearmTypes).toEqual([]);
    expect(entity.form517?.sectionG?.trainingFirearmOther).toBe('');
    expect(entity.form517?.sectionH?.h2TrainingInstitutionName).toBe('');
    expect(entity.form517?.sectionH?.h5CaseDetails).toEqual([]);
  });

  test('backfills firearm purpose safely when missing', () => {
    const legacyFirearm = {
      id: 'gun-1',
      type: 'Firearm',
      holderProfileId: 'profile-1',
      make: 'Glock',
      model: '19',
      ...baseMeta,
    } as unknown as Firearm;

    const { entity, changed } = migrateEntity(legacyFirearm);

    expect(changed).toBe(true);
    expect(entity.schemaVersion).toBe(CURRENT_ENTITY_SCHEMA_VERSION);
    expect(entity.purpose).toBeUndefined();
  });

  test('maps legacy one-to-one proficiency kinds to explicit categories during migration', () => {
    const legacyProficiency = {
      id: 'prof-1',
      type: 'Proficiency',
      holderProfileId: 'profile-1',
      providerName: 'Legacy Trainer',
      proficiencyDocumentIds: [
        {
          kind: 'PROFICIENCY_HANDGUN',
          documentId: 'doc-handgun',
          issuedAt: '2025-01-15',
          serialNumber: 'HG-001',
        },
      ],
      ...baseMeta,
    } as unknown as Proficiency;

    const { entity, changed } = migrateEntity(legacyProficiency);

    expect(changed).toBe(true);
    expect(entity.schemaVersion).toBe(CURRENT_ENTITY_SCHEMA_VERSION);
    expect(entity.proficiencyDocumentIds?.[0]).toEqual(
      expect.objectContaining({
        kind: 'PROFICIENCY_HANDGUN',
        categories: ['Handgun'],
      }),
    );
    expect(entity.proficiencyCertificates?.[0]).toEqual(
      expect.objectContaining({
        kind: 'PROFICIENCY_HANDGUN',
        categories: ['Handgun'],
      }),
    );
  });

  test('keeps current user prefs stable once already normalized', () => {
    const currentPrefs: UserPrefs = {
      id: 'prefs-1',
      type: 'UserPrefs',
      holderProfileId: 'profile-1',
      useBiometrics: false,
      useCamera: false,
      usePhotoLibrary: false,
      showPhotoLibraryAlert: true,
      syncToCloud: false,
      isFirstLoad: true,
      passcodeTimeoutSec: 120,
      analyticsOptIn: false,
      remindRenewal: false,
      compCertCalcMethodSet: false,
      showFirearmWizardHint: true,
      showCompetencyWizardHint: true,
      showIdWizardHint: true,
      showAddressWizardHint: true,
      showSafeWizardHint: true,
      showMembershipWizardHint: true,
      showGetStarted: true,
      showFirstTimeSetup: true,
      showGetStartedDisabled: false,
      showSendFeedbackMessage: true,
      shareFeedback: false,
      devModeEnabled: false,
      screenMode: 'default',
      collapsedPanels: {},
      createdAt: baseMeta.createdAt,
      updatedAt: baseMeta.updatedAt,
      version: 1,
      schemaVersion: CURRENT_ENTITY_SCHEMA_VERSION,
    };

    const { entity, changed } = migrateEntity(currentPrefs);

    expect(changed).toBe(false);
    expect(entity).toEqual(currentPrefs);
  });
});

describe('migrateStoredRecordRow', () => {
  test('rewrites stored row blob when entity needs migration', () => {
    const legacyDocument: AnyEntity = {
      id: 'doc-1',
      type: 'Document',
      holderProfileId: 'profile-1',
      kind: 'OTHER',
      filePath: '/tmp/file.pdf',
      sha256: 'abc123',
      pages: 1,
      createdAt: baseMeta.createdAt,
      updatedAt: baseMeta.updatedAt,
      version: 1,
      schemaVersion: 1,
    };

    const result = migrateStoredRecordRow({
      id: legacyDocument.id,
      type: legacyDocument.type,
      blob: JSON.stringify(legacyDocument),
      createdAt: legacyDocument.createdAt,
      updatedAt: legacyDocument.updatedAt,
    });

    expect(result).not.toBeNull();
    expect(JSON.parse(result!.blob)).toEqual(
      expect.objectContaining({
        schemaVersion: CURRENT_ENTITY_SCHEMA_VERSION,
        isEncrypted: false,
      }),
    );
  });
});
