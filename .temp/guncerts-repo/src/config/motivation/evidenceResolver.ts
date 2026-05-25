import type {
  ActivityEvidence,
  Application,
  ApplicationDocEntry,
  ApplicationDocState,
  DocumentKind,
  Firearm,
  PolicyDocumentKind,
} from '../../data/types';
import { resolveRequirementsForApplication } from '../../policy/resolve';
import { getById } from '../../data/sqlite';

type ResolverRequirement = {
  code: string;
  label?: string;
  description?: string;
  required?: boolean;
  requireUpload?: boolean;
  requiredForApplication?: boolean;
  isOptional?: boolean;
  isSupportingDocument?: boolean;
  isChecklistItem?: boolean;
  documentKinds?: PolicyDocumentKind[];
  annexure?: string;
  min?: number;
  copies?: number;
  scope?: 'perApp' | 'perFirearm' | 'perSafe' | 'perCertificate' | 'perMembership';
};

export interface ResolvedEvidenceRequirement {
  code: string;
  label?: string;
  description?: string;
  evidenceKeys: string[];
  required: boolean;
  satisfied: boolean;
  matchedDocumentIds: string[];
  matchedDocumentKinds: DocumentKind[];
  scope?: ResolverRequirement['scope'];
  annexure?: string;
}

export interface ResolvedEvidence {
  evidenceKeys: string[];
  optionalEvidenceKeys: string[];
  satisfiedRequirementCodes: string[];
  missingRequiredRequirementCodes: string[];
  matchedDocumentsByRequirement: Record<string, string[]>;
  matchedDocumentKindsByRequirement: Partial<Record<string, DocumentKind[]>>;
  requirements: ResolvedEvidenceRequirement[];
}

export interface ResolveEvidenceInput {
  application?: Application | null;
  docState?: ApplicationDocState | null;
}

const GROUPED_REQUIREMENT_KIND_MAP: Record<string, DocumentKind[]> = {
  MEMBERSHIP: [
    'ASSOCIATION_MEMBERSHIP',
    'ASSOCIATION_LETTER',
    'DEDICATED_HUNTER_CERT',
    'DEDICATED_SPORT_CERT',
    'FIREARM_ENDORSEMENT',
  ],
  PROFICIENCY: [
    'PROFICIENCY_HANDGUN',
    'PROFICIENCY_RIFLE',
    'PROFICIENCY_SHOTGUN',
    'PROFICIENCY_HANDMACHINECARBINE',
  ],
  SAFES: ['SAFE'],
  ID_DOC: ['ID_CARD', 'ID_BOOK', 'PASSPORT'],
  PROOF_ADDRESS: ['PROOF_OF_ADDRESS'],
  SUPPORTING_STATEMENT_1: ['SUPPORTING_STATEMENT'],
  SUPPORTING_STATEMENT_2: ['SUPPORTING_STATEMENT'],
};

const REQUIREMENT_EVIDENCE_MAP: Array<{
  matches: (code: string, kinds: DocumentKind[]) => boolean;
  evidenceKey: string;
}> = [
  {
    matches: (code) => code === 'COMPETENCY_CERT',
    evidenceKey: 'competency_certificate',
  },
  {
    matches: (code) => code === 'PROFICIENCY' || code.startsWith('PROFICIENCY_'),
    evidenceKey: 'proficiency_certificate',
  },
  {
    matches: (code) =>
      code === 'MEMBERSHIP' ||
      code === 'ASSOCIATION_MEMBERSHIP' ||
      code === 'ASSOCIATION_LETTER',
    evidenceKey: 'association_membership',
  },
  {
    matches: (code) =>
      code === 'DEDICATED_HUNTER_CERT' || code === 'DEDICATED_SPORT_CERT',
    evidenceKey: 'dedicated_status',
  },
  {
    matches: (code) => code === 'FIREARM_ENDORSEMENT',
    evidenceKey: 'firearm_endorsement',
  },
  {
    matches: (code) => code.startsWith('STATEMENT_OF_RESULTS_'),
    evidenceKey: 'statement_of_results',
  },
  {
    matches: (code) => code === 'FIREARM_LICENCE',
    evidenceKey: 'existing_licence_copy',
  },
  {
    matches: (code, kinds) => code === 'SAFES' || kinds.includes('SAFE'),
    evidenceKey: 'safe_photos',
  },
  {
    matches: (code, kinds) => code === 'ACTIVITY_EVIDENCE' || kinds.includes('ACTIVITY_EVIDENCE'),
    evidenceKey: 'activity_report',
  },
];

function normalizeCode(value: unknown): string {
  return value == null ? '' : String(value).trim().toUpperCase();
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function toDocumentKinds(requirement: ResolverRequirement): DocumentKind[] {
  const explicit = (requirement.documentKinds ?? [])
    .map((entry) => entry?.kind)
    .filter(Boolean) as DocumentKind[];

  if (explicit.length) return dedupe(explicit);

  const code = normalizeCode(requirement.code);
  const grouped = GROUPED_REQUIREMENT_KIND_MAP[code];
  if (grouped?.length) return grouped;

  return [];
}

function toEvidenceKeys(requirement: ResolverRequirement): string[] {
  const code = normalizeCode(requirement.code);
  const documentKinds = toDocumentKinds(requirement);

  return REQUIREMENT_EVIDENCE_MAP
    .filter((entry) => entry.matches(code, documentKinds))
    .map((entry) => entry.evidenceKey);
}

function buildPolicyRequirements(application: Application): ResolverRequirement[] {
  const toResolverFirearm = (firearm: Firearm) => ({
    id: String(firearm.id ?? ''),
    make: firearm.make,
    model: firearm.model,
    firearmType: firearm.firearmType,
    section: (firearm as any).section,
    licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
    licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
    licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
    licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
  });

  const inlineFirearms = (Array.isArray(application.firearms) ? application.firearms : [])
    .filter(Boolean)
    .map(toResolverFirearm)
    .filter((firearm) => firearm.id);

  const selectedFirearms = (Array.isArray(application.selectedFirearmIds)
    ? application.selectedFirearmIds
    : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
    .map((id) => getById<Firearm>(id))
    .filter((firearm): firearm is Firearm => Boolean(firearm))
    .map(toResolverFirearm)
    .filter((firearm) => firearm.id);

  const firearms = Array.from(
    new Map(
      [...inlineFirearms, ...selectedFirearms].map((firearm) => [firearm.id, firearm] as const)
    ).values()
  );

  const resolved = resolveRequirementsForApplication({
    application: {
      id: String(application.id),
      form: application.form,
      licenseType: (application as any).licenseType ?? (application as any).licenceType,
      licenceType: (application as any).licenceType ?? (application as any).licenseType,
      licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
      licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
    },
    firearms,
  });

  return resolved.requirements.map((requirement) => ({
    code: requirement.code,
    label: (requirement as any).label,
    description: (requirement as any).description,
    required: (requirement as any).required,
    requireUpload:
      (requirement as any).requiredUpload ?? (requirement as any).requireUpload,
    requiredForApplication: (requirement as any).requiredForApplication,
    isOptional: (requirement as any).isOptional,
    isSupportingDocument: (requirement as any).isSupportingDocument,
    isChecklistItem: (requirement as any).isChecklistItem,
    documentKinds: (requirement as any).documentKinds,
    annexure: (requirement as any).annexure,
    min: (requirement as any).min,
    copies: (requirement as any).copies,
    scope: ((requirement as any).scope &&
      typeof (requirement as any).scope === 'string'
      ? (requirement as any).scope
      : undefined) as ResolverRequirement['scope'],
  }));
}

function mergeRequirements(
  docState: ApplicationDocState | null | undefined,
  application: Application | null | undefined
): ResolverRequirement[] {
  const merged = new Map<string, ResolverRequirement>();
  const append = (requirement: ResolverRequirement) => {
    const code = normalizeCode(requirement.code);
    if (!code) return;
    const previous = merged.get(code);
    merged.set(code, {
      ...previous,
      ...requirement,
      code,
      documentKinds: requirement.documentKinds ?? previous?.documentKinds,
      scope: requirement.scope ?? previous?.scope,
    });
  };

  (docState?.requirements ?? []).forEach((requirement) => {
    append({
      code: requirement.code,
      label: undefined,
      description: undefined,
      required: requirement.required,
      requireUpload: requirement.requireUpload,
      isSupportingDocument: requirement.isSupportingDocument,
      isChecklistItem: requirement.isChecklistItem,
      documentKinds: requirement.documentKinds,
      annexure: requirement.annexure,
      min: requirement.min,
      copies: requirement.copies,
      scope: requirement.scope,
    });
  });

  if (application) {
    buildPolicyRequirements(application).forEach(append);
  }

  return Array.from(merged.values());
}

function matchesRequirement(
  entry: ApplicationDocEntry,
  requirement: ResolverRequirement
): boolean {
  const requirementCode = normalizeCode(requirement.code);
  const entryCode = normalizeCode(entry.requirementCode);
  if (entryCode && entryCode === requirementCode) return true;

  const expectedKinds = toDocumentKinds(requirement);
  return expectedKinds.includes(entry.kind);
}

function isRequiredRequirement(requirement: ResolverRequirement): boolean {
  if (
    requirement.requiredForApplication === true &&
    requirement.requireUpload !== false &&
    requirement.isOptional !== true
  ) {
    return true;
  }

  return requirement.required === true && requirement.requireUpload !== false;
}

function resolveEvidenceFromParts(
  application: Application | null | undefined,
  docState: ApplicationDocState | null | undefined
): ResolvedEvidence {
  const requirements = mergeRequirements(docState, application);
  const rawDocuments = docState?.documents ?? application?.docs?.documents ?? [];
  const selectedMembershipIds = new Set<string>(
    (application?.membershipIds ?? []).filter(Boolean).map((id) => String(id))
  );
  const hasExplicitNoSelectedMemberships =
    Array.isArray(application?.membershipIds) && application.membershipIds.length === 0;
  const selectedFirearmIds = new Set<string>(
    (application?.selectedFirearmIds ?? []).filter(Boolean).map((id) => String(id))
  );
  const selectedSafeIds = new Set<string>(
    (application?.safeIds ?? []).filter(Boolean).map((id) => String(id))
  );
  const selectedProficiencyIds = new Set<string>(
    (application?.proficiencyIds ?? []).filter(Boolean).map((id) => String(id))
  );
  const selectedActivityEvidenceIds = new Set<string>(
    (application?.activityEvidenceIds ?? []).filter(Boolean).map((id) => String(id))
  );
  const documents = rawDocuments.filter((entry) => {
    const sourceType = `${entry?.source?.type ?? ''}`.toLowerCase();
    const sourceId = entry?.source?.id ? String(entry.source.id) : '';
    if (sourceType === 'membership' && sourceId) {
      if (hasExplicitNoSelectedMemberships) {
        return false;
      }
      if (selectedMembershipIds.size > 0) {
        return selectedMembershipIds.has(sourceId);
      }
    }
    if (sourceType === 'firearm' && sourceId && selectedFirearmIds.size > 0) {
      return selectedFirearmIds.has(sourceId);
    }
    if (sourceType === 'safe' && sourceId && selectedSafeIds.size > 0) {
      return selectedSafeIds.has(sourceId);
    }
    if (sourceType === 'proficiency' && sourceId && selectedProficiencyIds.size > 0) {
      return selectedProficiencyIds.has(sourceId);
    }
    if (sourceType === 'activityevidence' && sourceId && selectedActivityEvidenceIds.size > 0) {
      return selectedActivityEvidenceIds.has(sourceId);
    }
    return true;
  });

  const satisfiedRequirementCodes = new Set<string>();
  const missingRequiredRequirementCodes = new Set<string>();
  const evidenceKeys = new Set<string>();
  const optionalEvidenceKeys = new Set<string>();
  const matchedDocumentsByRequirement = new Map<string, string[]>();
  const matchedDocumentKindsByRequirement = new Map<string, DocumentKind[]>();

  const requirementResults = requirements.map<ResolvedEvidenceRequirement>((requirement) => {
    const code = normalizeCode(requirement.code);
    const matches = documents.filter((entry) => matchesRequirement(entry, requirement));
    const matchedIds = dedupe(matches.map((entry) => String(entry.documentId)).filter(Boolean));
    const matchedKinds = dedupe(matches.map((entry) => entry.kind).filter(Boolean));
    const derivedEvidenceKeys = toEvidenceKeys(requirement);
    const satisfied = matchedIds.length > 0;
    const required = isRequiredRequirement(requirement);

    if (satisfied) {
      satisfiedRequirementCodes.add(code);
      matchedDocumentsByRequirement.set(code, matchedIds);
      matchedDocumentKindsByRequirement.set(code, matchedKinds);
      derivedEvidenceKeys.forEach((key) => {
        evidenceKeys.add(key);
        if (!required) {
          optionalEvidenceKeys.add(key);
        }
      });
    } else if (required) {
      missingRequiredRequirementCodes.add(code);
    }

    return {
      code,
      label: requirement.label,
      description: requirement.description,
      evidenceKeys: derivedEvidenceKeys,
      required,
      satisfied,
      matchedDocumentIds: matchedIds,
      matchedDocumentKinds: matchedKinds,
      scope: requirement.scope,
      annexure: requirement.annexure,
    };
  });

  // Keep direct document-driven evidence available even when requirement metadata is thin.
  documents.forEach((entry) => {
    const looseRequirement: ResolverRequirement = {
      code: entry.requirementCode || entry.kind,
      documentKinds: [{ kind: entry.kind, numberOfSides: 1 }],
    };
    toEvidenceKeys(looseRequirement).forEach((key) => evidenceKeys.add(key));
  });

  // Activity evidence documents are stored under ActivityEvidence entities and may not always
  // be mirrored into application doc state entries. Promote activity_report when selected
  // activity entities contain linked photos.
  if (selectedActivityEvidenceIds.size > 0) {
    const hasSelectedActivityPhotos = Array.from(selectedActivityEvidenceIds).some((id) => {
      const item = getById<ActivityEvidence>(id);
      return Boolean(item && !item.deleted && Array.isArray(item.photos) && item.photos.length > 0);
    });
    if (hasSelectedActivityPhotos) {
      evidenceKeys.add('activity_report');
      optionalEvidenceKeys.add('activity_report');
    }
  }

  return {
    evidenceKeys: Array.from(evidenceKeys).sort(),
    optionalEvidenceKeys: Array.from(optionalEvidenceKeys).sort(),
    satisfiedRequirementCodes: Array.from(satisfiedRequirementCodes).sort(),
    missingRequiredRequirementCodes: Array.from(missingRequiredRequirementCodes).sort(),
    matchedDocumentsByRequirement: Object.fromEntries(
      Array.from(matchedDocumentsByRequirement.entries()).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    matchedDocumentKindsByRequirement: Object.fromEntries(
      Array.from(matchedDocumentKindsByRequirement.entries()).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    requirements: requirementResults.sort((left, right) => left.code.localeCompare(right.code)),
  };
}

export function resolveEvidence(input: ResolveEvidenceInput | Application | ApplicationDocState): ResolvedEvidence {
  if ('type' in input && input.type === 'Application') {
    return resolveEvidenceFromParts(input, input.docs);
  }

  if ('applicationId' in input && 'documents' in input) {
    return resolveEvidenceFromParts(undefined, input);
  }

  const { application, docState } = input as ResolveEvidenceInput;
  return resolveEvidenceFromParts(application ?? undefined, docState ?? application?.docs);
}

export function resolveEvidenceFromApplication(application: Application): ResolvedEvidence {
  return resolveEvidenceFromParts(application, application.docs);
}

export function resolveEvidenceFromDocState(docState: ApplicationDocState): ResolvedEvidence {
  return resolveEvidenceFromParts(undefined, docState);
}
