import { Application, Document, Profile, UUID } from './types';
import { listByType, deleteEntity } from './sqlite';
import { persist, touch } from './repo';
import { deleteOwnedDocFile } from '../utils/docCrypto';

type EntityType = 'Firearm' | 'CompetencyCertificate' | 'Safe' | 'Membership' | 'Proficiency' | 'Profile';

type CleanupResult = {
  updatedApplications: Application[];
  deletedDocumentIds: string[];
};

const normalizeId = (value: unknown) => String(value ?? '');

const isDraftOrReady = (app: Application) => app.status === 'draft' || app.status === 'ready';

const applicationReferencesFirearm = (app: Application, firearmId: string) => {
  const target = normalizeId(firearmId);
  if (Array.isArray(app.selectedFirearmIds) && app.selectedFirearmIds.some(fid => normalizeId(fid) === target)) {
    return true;
  }
  if (Array.isArray(app.firearms) && app.firearms.some(f => normalizeId((f as any)?.id) === target)) {
    return true;
  }
  const docs = app.docs?.documents ?? [];
  if (docs.some((entry) => entry.source?.type === 'Firearm' && normalizeId(entry.source?.id) === target)) {
    return true;
  }
  return false;
};

const applicationReferencesCertificate = (app: Application, certId: string) => {
  const target = normalizeId(certId);
  if (Array.isArray(app.competencyCertificateIds) && app.competencyCertificateIds.some(cid => normalizeId(cid) === target)) {
    return true;
  }
  const docs = app.docs?.documents ?? [];
  if (docs.some((entry) => entry.source?.type === 'CompetencyCertificate' && normalizeId(entry.source?.id) === target)) {
    return true;
  }
  return false;
};

export const getActiveApplicationsUsingFirearm = (firearmId: UUID): Application[] => {
  const target = normalizeId(firearmId);
  return listByType<Application>('Application').filter(
    app => isDraftOrReady(app) && applicationReferencesFirearm(app, target),
  );
};

export const getActiveApplicationsUsingCertificate = (certId: UUID): Application[] => {
  const target = normalizeId(certId);
  return listByType<Application>('Application').filter(
    app => isDraftOrReady(app) && applicationReferencesCertificate(app, target),
  );
};

export const getActiveApplicationsUsingSafe = (safeId: UUID): Application[] => {
  const target = normalizeId(safeId);
  return listByType<Application>('Application').filter(
    app =>
      isDraftOrReady(app) &&
      (app.docs?.documents ?? []).some(
        (entry) => entry.source?.type === 'Safe' && normalizeId(entry.source?.id) === target
      ),
  );
};

export const getActiveApplicationsUsingMembership = (membershipId: UUID): Application[] => {
  const target = normalizeId(membershipId);
  return listByType<Application>('Application').filter(
    app =>
      isDraftOrReady(app) &&
      (app.docs?.documents ?? []).some(
        (entry) => entry.source?.type === 'Membership' && normalizeId(entry.source?.id) === target
      ),
  );
};

export const getActiveApplicationsUsingProficiency = (proficiencyId: UUID): Application[] => {
  const target = normalizeId(proficiencyId);
  return listByType<Application>('Application').filter(
    app =>
      isDraftOrReady(app) &&
      (app.docs?.documents ?? []).some(
        (entry) => entry.source?.type === 'Proficiency' && normalizeId(entry.source?.id) === target
      ),
  );
};

const removeFirearmFromApplication = (app: Application, targetId: string) => {
  let changed = false;
  let nextFirearms = app.firearms;
  let nextSelectedFirearmIds = app.selectedFirearmIds;
  let nextDocs = app.docs;
  const removedDocIds: string[] = [];

  if (Array.isArray(app.firearms)) {
    const filtered = app.firearms.filter(f => normalizeId((f as any)?.id) !== targetId);
    if (filtered.length !== app.firearms.length) {
      changed = true;
      nextFirearms = filtered;
    }
  }

  if (Array.isArray(app.selectedFirearmIds)) {
    const filtered = app.selectedFirearmIds.filter(fid => normalizeId(fid) !== targetId);
    if (filtered.length !== app.selectedFirearmIds.length) {
      changed = true;
      nextSelectedFirearmIds = filtered;
    }
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) => !(entry.source?.type === 'Firearm' && normalizeId(entry.source?.id) === targetId)
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      removedDocIds.push(
        ...app.docs.documents
          .filter((entry) => entry.source?.type === 'Firearm' && normalizeId(entry.source?.id) === targetId)
          .map((entry) => String(entry.documentId))
      );
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) {
    return { updated: null as Application | null, removedDocIds: [] as string[] };
  }

  const touched = touch({
    ...app,
    firearms: nextFirearms,
    selectedFirearmIds: nextSelectedFirearmIds,
    docs: nextDocs,
  } as Application);

  return { updated: touched, removedDocIds };
};

const removeCertificateFromApplication = (app: Application, targetId: string) => {
  let changed = false;
  let nextCertificateIds = app.competencyCertificateIds;
  let nextDocs = app.docs;
  const removedDocIds: string[] = [];

  if (Array.isArray(app.competencyCertificateIds)) {
    const filtered = app.competencyCertificateIds.filter(cid => normalizeId(cid) !== targetId);
    if (filtered.length !== app.competencyCertificateIds.length) {
      changed = true;
      nextCertificateIds = filtered;
    }
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) =>
        !(entry.source?.type === 'CompetencyCertificate' && normalizeId(entry.source?.id) === targetId)
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      removedDocIds.push(
        ...app.docs.documents
          .filter((entry) => entry.source?.type === 'CompetencyCertificate' && normalizeId(entry.source?.id) === targetId)
          .map((entry) => String(entry.documentId))
      );
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) {
    return { updated: null as Application | null, removedDocIds: [] as string[] };
  }

  const touched = touch({
    ...app,
    competencyCertificateIds: nextCertificateIds,
    docs: nextDocs,
  } as Application);

  return { updated: touched, removedDocIds };
};

const removeSafeFromApplication = (app: Application, targetId: string) => {
  let changed = false;
  let nextSafeIds = app.safeIds;
  let nextDocs = app.docs;
  const removedDocIds: string[] = [];

  if (Array.isArray(app.safeIds)) {
    const filtered = app.safeIds.filter(sid => normalizeId(sid) !== targetId);
    if (filtered.length !== app.safeIds.length) {
      changed = true;
      nextSafeIds = filtered;
    }
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) => !(entry.source?.type === 'Safe' && normalizeId(entry.source?.id) === targetId)
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      removedDocIds.push(
        ...app.docs.documents
          .filter((entry) => entry.source?.type === 'Safe' && normalizeId(entry.source?.id) === targetId)
          .map((entry) => String(entry.documentId))
      );
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) {
    return { updated: null as Application | null, removedDocIds: [] as string[] };
  }

  const touched = touch({
    ...app,
    safeIds: nextSafeIds,
    docs: nextDocs,
  } as Application);

  return { updated: touched, removedDocIds };
};

const removeMembershipFromApplication = (app: Application, targetId: string) => {
  let changed = false;
  let nextMembershipIds = app.membershipIds;
  let nextDocs = app.docs;
  const removedDocIds: string[] = [];

  if (Array.isArray(app.membershipIds)) {
    const filtered = app.membershipIds.filter(mid => normalizeId(mid) !== targetId);
    if (filtered.length !== app.membershipIds.length) {
      changed = true;
      nextMembershipIds = filtered;
    }
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) => !(entry.source?.type === 'Membership' && normalizeId(entry.source?.id) === targetId)
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      removedDocIds.push(
        ...app.docs.documents
          .filter((entry) => entry.source?.type === 'Membership' && normalizeId(entry.source?.id) === targetId)
          .map((entry) => String(entry.documentId))
      );
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) {
    return { updated: null as Application | null, removedDocIds: [] as string[] };
  }

  const touched = touch({
    ...app,
    membershipIds: nextMembershipIds,
    docs: nextDocs,
  } as Application);

  return { updated: touched, removedDocIds };
};

const removeProficiencyFromApplication = (app: Application, targetId: string) => {
  let changed = false;
  let nextProficiencyIds = app.proficiencyIds;
  let nextDocs = app.docs;
  const removedDocIds: string[] = [];

  if (Array.isArray(app.proficiencyIds)) {
    const filtered = app.proficiencyIds.filter(pid => normalizeId(pid) !== targetId);
    if (filtered.length !== app.proficiencyIds.length) {
      changed = true;
      nextProficiencyIds = filtered;
    }
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) => !(entry.source?.type === 'Proficiency' && normalizeId(entry.source?.id) === targetId)
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      removedDocIds.push(
        ...app.docs.documents
          .filter((entry) => entry.source?.type === 'Proficiency' && normalizeId(entry.source?.id) === targetId)
          .map((entry) => String(entry.documentId))
      );
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) {
    return { updated: null as Application | null, removedDocIds: [] as string[] };
  }

  const touched = touch({
    ...app,
    proficiencyIds: nextProficiencyIds,
    docs: nextDocs,
  } as Application);

  return { updated: touched, removedDocIds };
};

const collectDocumentsForRequirement = (
  docs: Document[],
  appId: string,
  targetId: string
) => docs.filter(
  doc =>
    normalizeId(doc.applicationId) === appId &&
    normalizeId(doc.requirementRelatedId) === targetId,
);

const collectDocumentsForEntity = (
  docs: Document[],
  entityType: EntityType,
  entityId: string
) => docs.filter(
  doc =>
    doc.parentType === entityType &&
    normalizeId(doc.parentId) === entityId,
);

const deleteDocuments = async (docs: Document[], population: Document[]) => {
  if (!docs.length) return;

  const remaining = population.filter(doc => !docs.some(rem => rem.id === doc.id));
  const seenUris = new Set<string>();
  const extractionIdsToDelete = new Set<string>();

  for (const doc of docs) {
    const candidates = [doc.uri, doc.filePath, doc.thumbPath].map(val => normalizeId(val).trim()).filter(Boolean);
    for (const uri of candidates) {
      if (seenUris.has(uri)) continue;
      seenUris.add(uri);
      try {
        await deleteOwnedDocFile(uri);
      } catch {
        // swallow errors deleting individual files
      }
    }

    if (doc.ocrExtractionId) {
      const extractionId = normalizeId(doc.ocrExtractionId);
      const stillUsed = remaining.some(other => normalizeId(other.ocrExtractionId) === extractionId);
      if (!stillUsed) {
        extractionIdsToDelete.add(extractionId);
      }
    }

    deleteEntity(doc.id);
  }

  extractionIdsToDelete.forEach(id => {
    if (!id) return;
    deleteEntity(id);
  });
};

const detachFromApplications = async (
  entityType: EntityType,
  entityId: UUID
): Promise<CleanupResult> => {
  const target = normalizeId(entityId);
  const allDocs = listByType<Document>('Document');
  const updatedApplications: Application[] = [];
  const deletedDocumentIds = new Set<string>();

  const apps = entityType === 'Firearm'
    ? getActiveApplicationsUsingFirearm(target)
    : entityType === 'CompetencyCertificate'
      ? getActiveApplicationsUsingCertificate(target)
      : entityType === 'Safe'
        ? getActiveApplicationsUsingSafe(target)
        : entityType === 'Membership'
          ? getActiveApplicationsUsingMembership(target)
          : getActiveApplicationsUsingProficiency(target);

  for (const app of apps) {
    const removal = entityType === 'Firearm'
      ? removeFirearmFromApplication(app, target)
      : entityType === 'CompetencyCertificate'
        ? removeCertificateFromApplication(app, target)
        : entityType === 'Safe'
          ? removeSafeFromApplication(app, target)
          : entityType === 'Membership'
            ? removeMembershipFromApplication(app, target)
            : removeProficiencyFromApplication(app, target);

    const perAppDocs = collectDocumentsForRequirement(allDocs, app.id, target);
    perAppDocs.forEach(doc => deletedDocumentIds.add(doc.id));

    removal.removedDocIds.forEach(id => deletedDocumentIds.add(id));

    if (removal.updated) {
      persist(removal.updated);
      updatedApplications.push(removal.updated);
    }
  }

  if (deletedDocumentIds.size) {
    const docsToDelete = allDocs.filter(doc => deletedDocumentIds.has(doc.id));
    await deleteDocuments(docsToDelete, allDocs);
  }

  return {
    updatedApplications,
    deletedDocumentIds: Array.from(deletedDocumentIds),
  };
};

export const removeFirearmAssociations = async (firearmId: UUID) => {
  return detachFromApplications('Firearm', firearmId);
};

export const removeCompetencyAssociations = async (certId: UUID) => {
  return detachFromApplications('CompetencyCertificate', certId);
};

export const removeSafeAssociations = async (safeId: UUID) => {
  return detachFromApplications('Safe', safeId);
};

export const removeMembershipAssociations = async (membershipId: UUID) => {
  return detachFromApplications('Membership', membershipId);
};

export const removeProficiencyAssociations = async (proficiencyId: UUID) => {
  return detachFromApplications('Proficiency', proficiencyId);
};

export const deleteEntityDocuments = async (entityType: EntityType, entityId: UUID) => {
  const target = normalizeId(entityId);
  const allDocs = listByType<Document>('Document');
  const docs = collectDocumentsForEntity(allDocs, entityType, target);
  await deleteDocuments(docs, allDocs);
};

export const clearProfileProofOfAddress = async (profileId: UUID) => {
  const target = normalizeId(profileId);
  const allDocs = listByType<Document>('Document');
  const proofDocs = allDocs.filter(
    (doc) => doc.parentType === 'Profile' && normalizeId(doc.parentId) === target && doc.kind === 'PROOF_OF_ADDRESS',
  );
  const docIdSet = new Set(proofDocs.map((doc) => normalizeId(doc.id)));
  const updatedApplications: Application[] = [];

  for (const app of listByType<Application>('Application')) {
    if (!isDraftOrReady(app)) continue;
    if (!app.docs?.documents?.length) continue;
    const filtered = app.docs.documents.filter((entry) => !docIdSet.has(normalizeId(entry.documentId)));
    if (filtered.length === app.docs.documents.length) continue;
    const next = touch({ ...app, docs: { ...app.docs, documents: filtered } } as Application);
    persist(next);
    updatedApplications.push(next);
  }

  if (proofDocs.length) {
    await deleteDocuments(proofDocs, allDocs);
  }

  const profile = listByType<Profile>('Profile').find((entry) => normalizeId(entry.id) === target) ?? null;
  let updatedProfile: Profile | null = null;
  if (profile && profile.proofOfAddressDate) {
    updatedProfile = touch({ ...profile, proofOfAddressDate: undefined } as Profile);
    persist(updatedProfile);
  }

  return {
    changed: proofDocs.length > 0 || Boolean(updatedProfile),
    deletedDocumentIds: proofDocs.map((doc) => String(doc.id)),
    updatedApplications,
    updatedProfile,
  };
};
