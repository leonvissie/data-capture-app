import type { AnyEntity, Document, Proficiency, SafePhotoCategory } from '../data/types';
import {
  createCompetencyCertificate,
  createDocument,
  createFirearm,
  createProfile,
  createSafe,
  createSupportingStatement,
} from '../data/defaults';
import { withMeta } from '../data/repo';
import { getById, saveEntity } from '../data/sqlite';
import {
  DEMO_COMPETENCY_CERTIFICATE,
  DEMO_DATASET_VERSION,
  DEMO_DOCUMENTS,
  DEMO_FIREARM,
  DEMO_PROFICIENCY,
  DEMO_PROFILE,
  DEMO_SAFE,
} from './demoDataset';
import { DEMO_FILE_MANIFEST } from './demoFileManifest';

type SeedCounts = {
  created: number;
  updated: number;
  unchanged: number;
};

export type DemoSeedResult = SeedCounts & {
  datasetVersion: number;
  total: number;
};

const stripMeta = (entity: AnyEntity) => {
  const { createdAt, updatedAt, schemaVersion, version, ...rest } = entity;
  return rest;
};

const toJson = (value: unknown) => JSON.stringify(value);

const upsertEntity = (incoming: AnyEntity, counts: SeedCounts) => {
  const existing = getById<AnyEntity>(incoming.id);
  if (!existing) {
    saveEntity(incoming);
    counts.created += 1;
    return;
  }

  if (toJson(stripMeta(existing)) === toJson(stripMeta(incoming))) {
    counts.unchanged += 1;
    return;
  }

  const updated: AnyEntity = {
    ...incoming,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    schemaVersion: existing.schemaVersion ?? incoming.schemaVersion ?? 1,
    version: Math.max(existing.version ?? 1, incoming.version ?? 1) + 1,
  };
  saveEntity(updated);
  counts.updated += 1;
};

const buildDocumentFilePath = (fileName: string) => `demo/${fileName}`;

const buildDemoDocuments = (): Document[] =>
  DEMO_DOCUMENTS.map((seed) => {
    const manifest = DEMO_FILE_MANIFEST[seed.fileKey];
    const identityDocumentSide =
      manifest.identityDocumentSide ??
      (seed.fileKey === 'id_card_front' ? 'front' : seed.fileKey === 'id_card_back' ? 'back' : undefined);
    const normalizedName =
      seed.fileKey === 'id_card_front' ? 'ID Front' :
      seed.fileKey === 'id_card_back' ? 'ID Back' :
      seed.name;
    return createDocument(
      {
        kind: manifest.kind,
        filePath: buildDocumentFilePath(manifest.fileName),
        sha256: `demo-${seed.fileKey}`,
        pages: manifest.pages,
      },
      {
        id: seed.id,
        holderProfileId: DEMO_PROFILE.id,
        mime: manifest.mime,
        name: normalizedName,
        parentType: seed.parentType,
        parentId: seed.parentId,
        identityDocumentSide,
        capturedAt: '2025-01-01T10:00:00.000Z',
      },
    );
  });

export const buildDemoEntities = (): AnyEntity[] => {
  const docs = buildDemoDocuments();

  const profile = createProfile({
    id: DEMO_PROFILE.id,
    givenNames: DEMO_PROFILE.givenNames,
    surname: DEMO_PROFILE.surname,
    initials: DEMO_PROFILE.initials,
    idType: DEMO_PROFILE.idType,
    idNumber: DEMO_PROFILE.idNumber,
    email: DEMO_PROFILE.email,
    mobile: DEMO_PROFILE.mobile,
    maritalStatus: DEMO_PROFILE.maritalStatus,
    employment: DEMO_PROFILE.employment
      ? {
          tradeOrProfession: DEMO_PROFILE.employment.tradeOrProfession,
          selfEmployedDetail: DEMO_PROFILE.employment.selfEmployedDetail,
          employerName: DEMO_PROFILE.employment.employerName,
          employerAddress: DEMO_PROFILE.employment.employerAddress
            ? { ...DEMO_PROFILE.employment.employerAddress }
            : undefined,
        }
      : undefined,
    references: Array.isArray(DEMO_PROFILE.references)
      ? DEMO_PROFILE.references.map((entry) => ({ ...entry }))
      : undefined,
    address: { ...DEMO_PROFILE.address },
    hasPostalAddress: false,
    documentIdFront: DEMO_PROFILE.idDocFrontId,
    documentIdBack: DEMO_PROFILE.idDocBackId,
  });

  const firearm = createFirearm(DEMO_PROFILE.id, {
    id: DEMO_FIREARM.id,
    firearmType: DEMO_FIREARM.firearmType,
    firearmAction: DEMO_FIREARM.firearmAction,
    make: DEMO_FIREARM.make,
    model: DEMO_FIREARM.model,
    calibre: DEMO_FIREARM.calibre,
    firearmSerialNumber: DEMO_FIREARM.firearmSerialNumber,
    barrelMake: DEMO_FIREARM.make,
    barrelSerialNo: DEMO_FIREARM.firearmSerialNumber,
    frameMake: DEMO_FIREARM.make,
    frameSerialNumber: DEMO_FIREARM.firearmSerialNumber,
    receiverMake: DEMO_FIREARM.make,
    receiverSerialNumber: DEMO_FIREARM.firearmSerialNumber,
    licenseNumber: DEMO_FIREARM.licenseNumber,
    section: DEMO_FIREARM.section,
    validFrom: DEMO_FIREARM.validFrom,
    validTo: DEMO_FIREARM.validTo,
    manufacturerNameAddress: 'Demo manufacturer',
    isCurrent: true,
    isDemoData: DEMO_FIREARM.isDemoData,
  });

  const competencyCertificate = createCompetencyCertificate(
    DEMO_PROFILE.id,
    DEMO_COMPETENCY_CERTIFICATE.categories,
    {
      id: DEMO_COMPETENCY_CERTIFICATE.id,
      licenceTypes: DEMO_COMPETENCY_CERTIFICATE.licenceTypes,
      certificateNumber: DEMO_COMPETENCY_CERTIFICATE.certificateNumber,
      trainingProvider: DEMO_COMPETENCY_CERTIFICATE.trainingProvider,
      issuedAt: DEMO_COMPETENCY_CERTIFICATE.issuedAt,
      expiresAt: DEMO_COMPETENCY_CERTIFICATE.expiresAt,
      certificateDocumentId: DEMO_COMPETENCY_CERTIFICATE.certificateDocumentId,
      isCurrent: true,
      isDemoData: DEMO_COMPETENCY_CERTIFICATE.isDemoData,
    },
  );

  const safePhotos = DEMO_SAFE.photoDocumentIds
    .map((documentId) => {
      const doc = docs.find((item) => item.id === documentId);
      if (!doc) return null;
      const safeCategory = DEMO_FILE_MANIFEST[
        DEMO_DOCUMENTS.find((entry) => entry.id === documentId)?.fileKey ?? 'safe_closed'
      ].safeCategory;
      if (!safeCategory) return null;
      return {
        category: safeCategory as SafePhotoCategory,
        documentId: doc.id,
      };
    })
    .filter((item): item is { category: SafePhotoCategory; documentId: string } => !!item);

  const safe = createSafe(DEMO_PROFILE.id, {
    id: DEMO_SAFE.id,
    safeName: DEMO_SAFE.safeName,
    make: DEMO_SAFE.make,
    notes: DEMO_SAFE.notes,
    safePhotos,
  });

  const proficiency = withMeta<Proficiency>({
    id: DEMO_PROFICIENCY.id,
    type: 'Proficiency',
    holderProfileId: DEMO_PROFICIENCY.holderProfileId,
    trainingProviderName: DEMO_PROFICIENCY.trainingProviderName,
    proficiencyDocumentIds: DEMO_PROFICIENCY.proficiencyDocumentIds.map((entry) => ({
      kind: entry.kind,
      documentId: entry.documentId,
      issuedAt: entry.issuedAt,
      serialNumber: entry.serialNumber,
      categories: entry.categories ? [...entry.categories] : undefined,
    })),
  });

  return [profile, ...docs, firearm, competencyCertificate, proficiency, safe];
};

export const seedDemoDataset = (): DemoSeedResult => {
  const entities = buildDemoEntities();
  const counts: SeedCounts = { created: 0, updated: 0, unchanged: 0 };
  entities.forEach((entity) => upsertEntity(entity, counts));

  return {
    ...counts,
    datasetVersion: DEMO_DATASET_VERSION,
    total: entities.length,
  };
};
