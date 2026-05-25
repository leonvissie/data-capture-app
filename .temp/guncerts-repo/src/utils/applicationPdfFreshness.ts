import { getById, listByType } from '../data/sqlite';
import { persist, touch } from '../data/repo';
import type {
  Application,
  ApplicationDocEntry,
  CompetencyCertificate,
  Document,
  Membership,
  Profile,
  Proficiency,
  Safe,
  SupportingStatement,
} from '../data/types';
import {
  resolveApplicationCompetencyCertificates,
  resolveApplicationFirearms,
  resolveEffectiveMembershipIds,
  resolveEffectiveProficiencyIds,
  resolveEffectiveSafeIds,
} from '../pdf/context';

const normalize = (value: unknown) => String(value ?? '').trim();

const isGeneratedPdfDoc = (doc: Document): boolean => {
  const requirementCode = normalize(doc.requirementCode).toUpperCase();
  if (requirementCode === 'CHECKLIST') return true;
  const name = normalize(doc.name).toLowerCase();
  const mime = normalize(doc.mime).toLowerCase();
  if (mime === 'application/pdf' && (name.includes('checklist') || name.includes('supporting documents'))) {
    return true;
  }
  return false;
};

const inferSource = (doc: Document): ApplicationDocEntry['source'] => {
  const parentType = normalize(doc.parentType);
  const parentId = normalize(doc.parentId);
  if (
    parentType === 'Application' ||
    parentType === 'Profile' ||
    parentType === 'Firearm' ||
    parentType === 'Safe' ||
    parentType === 'CompetencyCertificate' ||
    parentType === 'Membership' ||
    parentType === 'Proficiency'
  ) {
    return {
      type: parentType,
      id: parentId || undefined,
    };
  }
  return { type: 'Application', id: normalize(doc.applicationId) || undefined };
};

const toEntry = (doc: Document, existing?: ApplicationDocEntry): ApplicationDocEntry => ({
  requirementCode: normalize(doc.requirementCode || existing?.requirementCode),
  kind: doc.kind,
  documentId: doc.id,
  source: existing?.source ?? inferSource(doc),
});

const sameEntry = (a: ApplicationDocEntry, b: ApplicationDocEntry): boolean => (
  a.documentId === b.documentId &&
  a.kind === b.kind &&
  normalize(a.requirementCode).toUpperCase() === normalize(b.requirementCode).toUpperCase() &&
  a.source?.type === b.source?.type &&
  normalize(a.source?.id) === normalize(b.source?.id)
);

export const ensureApplicationPdfFreshness = (applicationId: string): Application | null => {
  const application = getById<Application>(applicationId);
  if (!application) return null;

  const existingEntries = Array.isArray(application.docs?.documents)
    ? application.docs!.documents
    : [];
  const existingByDocId = new Map<string, ApplicationDocEntry>();
  existingEntries.forEach((entry) => {
    const id = normalize(entry.documentId);
    if (!id) return;
    if (!existingByDocId.has(id)) existingByDocId.set(id, entry);
  });

  const refreshedDocs = listByType<Document>('Document')
    .filter((doc) => !doc.deleted && normalize(doc.applicationId) === normalize(application.id))
    .filter((doc) => !isGeneratedPdfDoc(doc));

  const nextEntriesMap = new Map<string, ApplicationDocEntry>();
  const appendDocEntry = (
    doc: Document | null | undefined,
    options?: {
      source?: ApplicationDocEntry['source'];
      requirementCode?: string;
      kind?: Document['kind'];
    },
  ) => {
    if (!doc || doc.deleted || isGeneratedPdfDoc(doc)) return;
    const id = normalize(doc.id);
    if (!id) return;
    const existing = existingByDocId.get(id);
    const base = toEntry(doc, existing);
    const next: ApplicationDocEntry = {
      ...base,
      source: options?.source ?? base.source,
      requirementCode: normalize(options?.requirementCode || base.requirementCode),
      kind: options?.kind ?? base.kind,
    };
    if (!normalize(next.requirementCode)) return;
    nextEntriesMap.set(id, next);
  };

  refreshedDocs.forEach((doc) => {
    appendDocEntry(doc);
  });

  // Profile docs used by the application holder (ID and proof of address).
  const profile = application.applicantProfileId
    ? getById<Profile>(String(application.applicantProfileId))
    : null;
  if (profile) {
    const front = normalize(profile.documentIdFront);
    const back = normalize(profile.documentIdBack);
    if (front) appendDocEntry(getById<Document>(front), { source: { type: 'Profile', id: String(profile.id) } });
    if (back) appendDocEntry(getById<Document>(back), { source: { type: 'Profile', id: String(profile.id) } });
    listByType<Document>('Document')
      .filter((doc) => !doc.deleted && normalize(doc.holderProfileId) === normalize(profile.id))
      .filter((doc) => {
        const kind = normalize(doc.kind).toUpperCase();
        return kind === 'PROOF_OF_ADDRESS' || kind === 'ID_CARD' || kind === 'ID_BOOK' || kind === 'PASSPORT';
      })
      .forEach((doc) => appendDocEntry(doc, { source: { type: 'Profile', id: String(profile.id) } }));
  }

  // Competency certificate documents.
  resolveApplicationCompetencyCertificates(application).forEach((cert: CompetencyCertificate) => {
    const docId = normalize(cert.certificateDocumentId);
    if (!docId) return;
    appendDocEntry(getById<Document>(docId), {
      source: { type: 'CompetencyCertificate', id: String(cert.id) },
      requirementCode: 'COMPETENCY_CERT',
    });
  });

  // Membership documents.
  resolveEffectiveMembershipIds(application).forEach((membershipId) => {
    const membership = getById<Membership>(String(membershipId));
    if (!membership || membership.deleted) return;
    (membership.membershipDocumentIds ?? []).forEach((entry) => {
      const docId = normalize(entry?.documentId);
      if (!docId) return;
      appendDocEntry(getById<Document>(docId), {
        source: { type: 'Membership', id: String(membership.id) },
        requirementCode: String(entry.kind ?? ''),
      });
    });
  });

  // Safe documents.
  resolveEffectiveSafeIds(application).forEach((safeId) => {
    const safe = getById<Safe>(String(safeId));
    if (!safe || safe.deleted) return;
    (safe.safePhotos ?? []).forEach((photo) => {
      const docId = normalize(photo?.documentId);
      if (!docId) return;
      appendDocEntry(getById<Document>(docId), {
        source: { type: 'Safe', id: String(safe.id) },
        requirementCode: 'SAFES',
      });
    });
  });

  // Ensure selected proficiencies always drive current linked docs, even if those docs
  // are not yet stamped with applicationId.
  resolveEffectiveProficiencyIds(application).forEach((proficiencyId) => {
    const proficiency = getById<Proficiency>(String(proficiencyId));
    if (!proficiency || proficiency.deleted) return;
    (proficiency.proficiencyDocumentIds ?? []).forEach((entry) => {
      const docId = normalize(entry?.documentId);
      if (!docId) return;
      const doc = getById<Document>(docId);
      appendDocEntry(doc, {
        source: { type: 'Proficiency', id: String(proficiency.id) },
        requirementCode: String(entry.kind ?? ''),
        kind: doc?.kind ?? ('OTHER' as Document['kind']),
      });
    });
  });

  // Supporting statements attached to this application/profile.
  const supportingIds = new Set<string>(
    Array.isArray(application.supportingStatementIds)
      ? application.supportingStatementIds.map((id) => normalize(id)).filter(Boolean)
      : [],
  );
  listByType<SupportingStatement>('SupportingStatement')
    .filter((statement) => !statement.deleted)
    .filter((statement) => {
      const byId = supportingIds.has(normalize(statement.id));
      const byApplication = normalize(statement.applicationId) === normalize(application.id);
      const byProfile =
        normalize(statement.holderProfileId) === normalize(application.applicantProfileId);
      return byId || byApplication || byProfile;
    })
    .forEach((statement) => {
      const docId = normalize(statement.documentId);
      if (!docId) return;
      appendDocEntry(getById<Document>(docId), {
        source: { type: 'Application', id: String(application.id) },
        requirementCode: 'SUPPORTING_STATEMENT',
      });
    });

  // Parent-linked docs for selected firearms/certs/safes/memberships/proficiencies.
  const selectedEntityIds = new Set<string>();
  resolveApplicationFirearms(application).forEach((firearm) => selectedEntityIds.add(String(firearm.id)));
  resolveApplicationCompetencyCertificates(application).forEach((cert) => selectedEntityIds.add(String(cert.id)));
  resolveEffectiveSafeIds(application).forEach((id) => selectedEntityIds.add(String(id)));
  resolveEffectiveMembershipIds(application).forEach((id) => selectedEntityIds.add(String(id)));
  resolveEffectiveProficiencyIds(application).forEach((id) => selectedEntityIds.add(String(id)));
  listByType<Document>('Document')
    .filter((doc) => !doc.deleted && selectedEntityIds.has(normalize(doc.parentId)))
    .forEach((doc) => appendDocEntry(doc));

  // Keep any existing entry that still points at a live doc even if applicationId is missing.
  existingByDocId.forEach((entry, docId) => {
    if (nextEntriesMap.has(docId)) return;
    const liveDoc = getById<Document>(docId);
    appendDocEntry(liveDoc, {
      source: entry.source,
      requirementCode: entry.requirementCode,
      kind: entry.kind,
    });
  });

  const nextEntries = Array.from(nextEntriesMap.values()).sort((a, b) => {
    const da = getById<Document>(String(a.documentId));
    const db = getById<Document>(String(b.documentId));
    const ta = Date.parse((da?.updatedAt || da?.createdAt || '') as string);
    const tb = Date.parse((db?.updatedAt || db?.createdAt || '') as string);
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  const prevEntries = existingEntries;
  const changed =
    prevEntries.length !== nextEntries.length ||
    prevEntries.some((entry, idx) => !nextEntries[idx] || !sameEntry(entry, nextEntries[idx]));

  if (!changed) return application;

  const nextApp = touch({
    ...application,
    docs: {
      ...(application.docs ?? {
        applicationId: application.id,
        policy: { form: application.form, version: '' },
        requirements: [],
        documents: [],
      }),
      applicationId: application.id,
      documents: nextEntries,
    },
    checklistDocumentId: undefined,
    documentBundlePath: undefined,
    documentBundlePageCount: undefined,
  } as Application);
  persist(nextApp);
  return nextApp;
};
