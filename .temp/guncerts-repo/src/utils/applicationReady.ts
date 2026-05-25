import { Application, CompetencyCategory, Document, Membership, Proficiency } from '../data/types';
import { getById, listByType } from '../data/sqlite';
import { resolveApplicationFirearms, resolveEffectiveMembershipIds } from '../pdf/context';
import { resolveRequirementsForApplication, type NormalizedAcknowledgement } from '../policy/resolve';
import { logger } from '@/src/utils/logger';
import type { Profile } from '../data/types';
import { validateForm517Readiness } from './form517Validation';
import { categoryLabel } from './categoryLabel';
import { resolveApplicationMotivation } from './motivationStore';
import { hasProficiencyCategory } from './proficiencyModel';

export type DocumentReadinessResult = {
  ready: boolean;
  message?: string;
  anchor?: string;
};

export type MembershipStatus = {
  membership: Membership | null;
  docs: Document[];
  associationReady: boolean;
  dedicatedReady: boolean;
  requirementSatisfied: boolean;
  name: string;
};

type AckItem = Pick<NormalizedAcknowledgement, 'applicationField' | 'key'> & { checked?: boolean };

const REQUIRED_CODE_KIND_MAP: Record<string, Document['kind'][]> = {
  FIREARM_LICENCE: ['FIREARM_LICENCE'],
  COMPETENCY_CERT: ['COMPETENCY_CERT'],
  ID_DOC: ['ID_CARD', 'ID_BOOK', 'PASSPORT'],
  PROOF_ADDRESS: ['PROOF_OF_ADDRESS'],
  SAFES: ['SAFE'],
  SUPPORTING_STATEMENT: ['SUPPORTING_STATEMENT'],
  SUPPORTING_STATEMENT_1: ['SUPPORTING_STATEMENT'],
  SUPPORTING_STATEMENT_2: ['SUPPORTING_STATEMENT'],
  SUPPORTING_STATEMENT_3: ['SUPPORTING_STATEMENT'],
  ASSOCIATION_MEMBERSHIP: ['ASSOCIATION_MEMBERSHIP'],
  ASSOCIATION_LETTER: ['ASSOCIATION_LETTER'],
  DEDICATED_HUNTER_CERT: ['DEDICATED_HUNTER_CERT'],
  DEDICATED_SPORT_CERT: ['DEDICATED_SPORT_CERT'],
  FIREARM_ENDORSEMENT: ['FIREARM_ENDORSEMENT'],
  STATEMENT_OF_RESULTS: ['STATEMENT_OF_RESULTS'],
};

const normalizeCode = (value?: string | null) => (value == null ? '' : String(value).toUpperCase());

const MEMBERSHIP_DOC_CODES = new Set([
  'ASSOCIATION_MEMBERSHIP',
  'ASSOCIATION_LETTER',
  'DEDICATED_HUNTER_CERT',
  'DEDICATED_SPORT_CERT',
  'FIREARM_ENDORSEMENT',
]);

const HANDLE_USE_KINDS = new Set<Document['kind']>([
  'STATEMENT_OF_RESULTS_HANDLE_USE_1',
  'STATEMENT_OF_RESULTS_HANDLE_USE_2',
  'STATEMENT_OF_RESULTS_HANDLE_USE_3',
  'STATEMENT_OF_RESULTS_HANDLE_USE_4',
]);

const hasNonEmptyDocId = (value?: string | null) => `${value ?? ''}`.trim().length > 0;


export function computeMembershipStatus(
  application: Application,
  opts?: { devModeEnabled?: boolean }
): MembershipStatus {
  const devModeEnabled = opts?.devModeEnabled === true;
  const membershipDocsById = new Map<string, Document[]>();
  listByType<Document>('Document').forEach((doc) => {
    if (doc.parentType !== 'Membership' || !doc.parentId) return;
    const kind = `${doc.kind ?? ''}`.toUpperCase();
    if (!MEMBERSHIP_DOC_CODES.has(kind)) return;
    const key = String(doc.parentId);
    if (!membershipDocsById.has(key)) membershipDocsById.set(key, []);
    membershipDocsById.get(key)!.push(doc);
  });

  const list = listByType<Membership>('Membership');
  const profileId = application.applicantProfileId ? String(application.applicantProfileId) : null;
  const filtered = profileId ? list.filter((m) => String(m.holderProfileId ?? '') === profileId) : list;
  const map = new Map<string, Membership>();
  filtered.forEach((m) => {
    if (m?.id) map.set(String(m.id), m);
  });
  const currentMembershipIds = resolveEffectiveMembershipIds(application);
  currentMembershipIds.forEach((mid) => {
    if (!map.has(mid)) {
      const found = getById<Membership>(mid);
      if (found) map.set(mid, found);
    }
  });
  const memberships = Array.from(map.values()).sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || '');
    const tb = Date.parse(b.updatedAt || b.createdAt || '');
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  const selectedMemberships = currentMembershipIds.length
    ? memberships.filter((m) => m?.id && currentMembershipIds.includes(String(m.id)))
    : [];
  const activeMembership = selectedMemberships[0] ?? memberships[0] ?? null;

  const calcStatus = (membership?: Membership | null) => {
    if (!membership) {
      return {
        membership: null,
        docs: [],
        associationReady: false,
        dedicatedReady: false,
        complete: false,
        name: '',
      };
    }
    const docs = membershipDocsById.get(String(membership.id)) ?? [];
    const byKind = new Set<string>();
    docs.forEach((doc) => byKind.add((doc.kind as string).toUpperCase()));
    // Proof of current membership is the required membership proof; the card remains optional.
    const associationReady = byKind.has('ASSOCIATION_LETTER');
    const dedicatedReady = byKind.has('DEDICATED_HUNTER_CERT') || byKind.has('DEDICATED_SPORT_CERT');
    const name = membership.associationName?.trim() ?? '';
    const complete = devModeEnabled ? !!name : associationReady && dedicatedReady && !!name;
    return { membership, docs, associationReady, dedicatedReady, complete, name };
  };

  const source = selectedMemberships.length ? selectedMemberships : memberships;
  const primary = calcStatus(activeMembership ?? source[0] ?? null);
  const requirementSatisfied = selectedMemberships.some((m) => calcStatus(m).complete);
  return { ...primary, requirementSatisfied };
}

const collectDocumentEntries = (application: Application) => {
  const entries: Array<{ kind?: Document['kind']; documentId?: string }> = [];
  const seen = new Set<string>();
  const push = (kind?: Document['kind'], documentId?: any) => {
    const id = documentId == null ? '' : String(documentId);
    if (!id || seen.has(id)) return;
    seen.add(id);
    entries.push({ kind, documentId: id });
  };

  const docStateDocs = application.docs?.documents ?? [];
  docStateDocs.forEach((entry) => {
    push(entry.kind, entry.documentId);
  });

  return entries;
};

const requirementCodeToDocumentKinds = (code?: string): Document['kind'][] => {
  const normalized = normalizeCode(code);
  if (!normalized) return [];
  const mapped = REQUIRED_CODE_KIND_MAP[normalized];
  if (mapped) return mapped;
  return [normalized as Document['kind']];
};

export function computeDocumentReadiness(params: {
  application: Application;
  acknowledgementItems?: AckItem[] | null;
  membershipRequirement?: 'required' | 'optional' | 'hidden' | 'none';
  membershipStatus?: Partial<MembershipStatus>;
  shouldBypassValidation?: boolean;
}): DocumentReadinessResult {
  const {
    application,
    acknowledgementItems = [],
    membershipRequirement: _membershipRequirement = 'hidden',
    membershipStatus = {},
    shouldBypassValidation = false,
  } = params;

  try {
    const is517 = application.form === '517';
    const form517Readiness = is517
      ? validateForm517Readiness(
          application,
          application.applicantProfileId
            ? getById<Profile>(String(application.applicantProfileId))
            : null
        )
      : null;

    const effectiveFirearmIds = Array.isArray(application.selectedFirearmIds)
      ? application.selectedFirearmIds.filter(Boolean).map((id) => String(id))
      : undefined;
    const firearms = resolveApplicationFirearms(application).map((firearm) => ({
      id: firearm.id == null ? '' : String(firearm.id),
      make: firearm.make,
      model: firearm.model,
      firearmType: firearm.firearmType,
      section: (firearm as any).section,
      licenseType: (firearm as any).licenseType ?? (firearm as any).licenceType,
      licenceType: (firearm as any).licenceType ?? (firearm as any).licenseType,
      licenseTypes: (firearm as any).licenseTypes ?? (firearm as any).licenceTypes,
      licenceTypes: (firearm as any).licenceTypes ?? (firearm as any).licenseTypes,
    }));

    const resolved = resolveRequirementsForApplication({
      application: {
        id: application.id,
        form: (application as any).form || (application as any).type,
        licenseType: (application as any).licenseType ?? (application as any).licenceType,
        licenceType: (application as any).licenceType ?? (application as any).licenseType,
        licenseTypes: (application as any).licenseTypes ?? (application as any).licenceTypes,
        licenceTypes: (application as any).licenceTypes ?? (application as any).licenseTypes,
      },
      firearms,
    });

    const isMembershipDocCode = (code?: string) => {
      const raw = normalizeCode(code);
      return (
        raw === 'MEMBERSHIP' ||
        raw === 'ASSOCIATION_MEMBERSHIP' ||
        raw === 'ASSOCIATION_LETTER' ||
        raw === 'DEDICATED_HUNTER_CERT' ||
        raw === 'DEDICATED_SPORT_CERT'
      );
    };

    const requiredDefs = resolved.requirements.filter(
      (req: any) =>
        req.requiredForApplication === true &&
        req.isOptional !== true &&
        !isMembershipDocCode(req.__code ?? req.code ?? req.key)
    );
    const proficiencyDef = resolved.requirements.find(
      (def) => normalizeCode((def as any).__code ?? def.code ?? def.key) === 'PROFICIENCY'
    );
    const proficiencyRequirement: 'required' | 'optional' =
      proficiencyDef && ((proficiencyDef as any).requiredForApplication === true || proficiencyDef.required === true)
        ? 'required'
        : 'optional';

    const documents = collectDocumentEntries(application);
    const documentKinds = new Set(
      documents
        .map((doc) => normalizeCode(doc.kind as string | undefined))
        .filter((kind) => !!kind)
    );
    const acked = new Set<string>();
    (acknowledgementItems ?? []).forEach((ack) => {
      if (!ack?.checked) return;
      const code = normalizeCode(ack.key ?? ack.applicationField ?? '');
      const raw = normalizeCode((ack as any).code ?? (ack as any).key ?? '');
      if (code) acked.add(code);
      if (raw) acked.add(raw);
    });

    const outstanding: Array<{ label: string; anchor?: string; scrollable?: boolean }> = [];

    if (is517 && form517Readiness && !form517Readiness.ready) {
      outstanding.push({ label: 'Required SAPS 517 info', anchor: 'SAPS_517_FORM', scrollable: true });
    }

    if (is517 && proficiencyRequirement === 'required') {
      const requestedCategories = new Set<CompetencyCategory>();
      (application.form517?.sectionD?.possessFirearmCompetencies ?? []).forEach((entry) => {
        if (entry === 'Handgun' || entry === 'Rifle' || entry === 'Shotgun' || entry === 'HandMachineCarbine') {
          requestedCategories.add(entry);
        }
      });

      const selectedProficiencyIds = Array.isArray(application.proficiencyIds)
        ? application.proficiencyIds.filter(Boolean).map((id) => String(id))
        : [];
      const selectedProficiencies = selectedProficiencyIds
        .map((id) => getById<Proficiency>(id))
        .filter((item): item is Proficiency => !!item);

      if (!selectedProficiencies.length) {
        outstanding.push({
          label: 'Proficiency: Add at least one training/proficiency entry.',
          anchor: 'PROFICIENCY',
          scrollable: true,
        });
      } else {
        const hasKnowledge = selectedProficiencies.some((proficiency) =>
          (proficiency.proficiencyDocumentIds ?? []).some(
            (entry) =>
              entry.kind === 'STATEMENT_OF_RESULTS_KNOWLEDGE' &&
              hasNonEmptyDocId(entry.documentId)
          )
        );
        if (!hasKnowledge) {
          outstanding.push({
            label: 'Proficiency: Add statement of results (knowledge of the Act).',
            anchor: 'PROFICIENCY',
            scrollable: true,
          });
        }

        requestedCategories.forEach((category) => {
          const hasCategoryProficiency = selectedProficiencies.some((proficiency) =>
            hasProficiencyCategory(proficiency, category)
          );
          if (!hasCategoryProficiency) {
            outstanding.push({
              label: `Proficiency: Add ${categoryLabel(category)} proficiency certificate.`,
              anchor: 'PROFICIENCY',
              scrollable: true,
            });
          }

          const hasHandleUseForCategory = selectedProficiencies.some((proficiency) =>
            (proficiency.proficiencyDocumentIds ?? []).some(
              (entry) =>
                HANDLE_USE_KINDS.has(entry.kind as Document['kind']) &&
                hasNonEmptyDocId(entry.documentId) &&
                Array.isArray(entry.categories) &&
                entry.categories.includes(category)
            )
          );
          if (!hasHandleUseForCategory) {
            outstanding.push({
              label: `Proficiency: Add handle and use result for ${categoryLabel(category)}.`,
              anchor: 'PROFICIENCY',
              scrollable: true,
            });
          }
        });
      }
    }

    const membershipDef = resolved.requirements.find(
      (def) => normalizeCode((def as any).__code ?? def.code ?? def.key) === 'MEMBERSHIP'
    );
    const motivationDef = resolved.requirements.find(
      (def) => normalizeCode((def as any).__code ?? def.code ?? def.key) === 'MOTIVATION'
    );

    const applySelectionGating = Array.isArray(application.selectedFirearmIds) || Array.isArray(application.competencyCertificateIds);
    const selectedFirearmIdSet = new Set<string>(effectiveFirearmIds ?? []);
    const selectedCompetencyIdSet = new Set<string>(
      Array.isArray(application.competencyCertificateIds)
        ? application.competencyCertificateIds.filter(Boolean).map((id) => String(id))
        : []
    );

    // Required document uploads derived from policy
    requiredDefs.forEach((def: any) => {
      const rawCode = normalizeCode((def as any).__code ?? def.code ?? def.key);
      if (!rawCode) return;
      if (rawCode === 'PROFICIENCY') {
        // Proficiency card readiness is evaluated by form-specific logic above to avoid duplicate warnings.
        return;
      }
      if (
        is517 &&
        (rawCode === 'STATEMENT_OF_RESULTS_KNOWLEDGE' ||
          rawCode.startsWith('STATEMENT_OF_RESULTS_HANDLE_USE_'))
      ) {
        // For 517, these warnings are emitted by custom proficiency/category logic above.
        // Skip generic policy missing warnings to avoid duplicate warning-card rows.
        return;
      }
      if (rawCode === 'SAPS_517_FORM') {
        if (is517) {
          if (form517Readiness?.ready) return;
          // For 517, keep a single consolidated readiness warning instead of duplicating
          // SAPS_517_FORM label and granular H/G/E/D field lines.
          return;
        }
      }
      if (rawCode.startsWith('SUPPORTING_STATEMENT')) {
        // Supporting statements are optional for submission unless explicitly in draft state.
        // Draft-state gating is handled in the documents screen flow.
        return;
      }
      if (applySelectionGating && rawCode.includes('FIREARM')) {
        if (!selectedFirearmIdSet.size) {
          outstanding.push({ label: 'Select at least one firearm', anchor: def.key, scrollable: true });
          return;
        }
      }
      if (applySelectionGating && rawCode.includes('COMPETENCY')) {
        if (!selectedCompetencyIdSet.size) {
          outstanding.push({ label: 'Select at least one competency certificate', anchor: def.key, scrollable: true });
          return;
        }
      }
      const expectedKinds = requirementCodeToDocumentKinds(rawCode);
      const hasDoc = expectedKinds.some((kind) => documentKinds.has(normalizeCode(kind)));
      const canAcknowledge = def.requiredUpload === false || def.requireUpload === false;
      const isAcknowledged = canAcknowledge && acked.has(rawCode);
      if (!hasDoc) {
        if (isAcknowledged) return;
        outstanding.push({ label: def.label ?? def.key ?? def.code, anchor: def.key, scrollable: true });
      }
    });

    const is518a = normalizeCode((application as any).form || (application as any).type) === '518A';
    const membershipRequirement =
      resolved.membershipRequirement ?? (_membershipRequirement !== 'hidden' ? _membershipRequirement : 'none');

    // Membership (518a only, gated by policy membership requirement)
    if (is518a && membershipRequirement === 'required' && !shouldBypassValidation) {
      if (!membershipStatus.requirementSatisfied) {
        outstanding.push({
          label: 'Firearm association membership',
          anchor: membershipDef?.key,
          scrollable: true,
        });
      }
    }

    // Declarations (policy-driven for both 517g and 518a)
    if ((resolved.declarations?.length ?? 0) > 0 && !shouldBypassValidation) {
      const declarationSet = new Set<string>(
        Array.isArray((application as any).declarations)
          ? (application as any).declarations.map((value: unknown) => {
              const normalized = typeof value === 'string' ? normalizeCode(value) : '';
              return normalized || String(value).toUpperCase();
            })
          : []
      );
      const declarationsComplete = (resolved.declarations ?? []).every((ack) => {
        const code = normalizeCode((ack as any).code);
        if (!code) return true;
        return declarationSet.has(code);
      });
      if (!declarationsComplete) {
        const anchor = (acknowledgementItems ?? []).find((ack) => ack.key)?.key;
        outstanding.push({
          label: 'Complete declarations section',
          anchor,
          scrollable: false,
        });
      }
    }

    if (motivationDef && !shouldBypassValidation) {
      const linkedMotivation = resolveApplicationMotivation(application);
      const motivationSource = `${(application as any).motivationSource ?? linkedMotivation?.source ?? ''}`.trim().toLowerCase();
      const hasSelection =
        typeof application.userToSubmitMotivation === 'boolean' ||
        motivationSource === 'wizard';
      if (!hasSelection) {
        outstanding.push({
          label: (motivationDef as any).label2 ?? motivationDef.label ?? motivationDef.key ?? 'Motivation choice',
          anchor: motivationDef.key,
          scrollable: true,
        });
      }
    }

    if (!outstanding.length) {
      return { ready: true };
    }

    const anchor = outstanding.find((item) => item.anchor && item.scrollable !== false)?.anchor;
    const lines = ['Please add/complete the following:', ...outstanding.map((item) => `- ${item.label}`)];
    return {
      ready: false,
      message: lines.join('\n'),
      anchor,
    };
  } catch (err) {
    logger.warn('document readiness failed', err);
    return { ready: false };
  }
}
