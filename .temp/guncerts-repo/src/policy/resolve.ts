/* Lightweight policy resolver for the Documents screen.
 * - Loads the right policy for an application
 * - Applies licence-type extras/overrides
 * - Returns a normalized, render-ready array
 */

import policy517g from './517g.json';
import policy518a from './518a.json';
import policy517 from './517.json';
import { sharedRequirementDefaultsByCode } from './shared/commonDocuments';
import {
  type RawLicenceType,
  buildSectionToCodeIndex,
  FALLBACK_518A_LICENCE_TYPES,
  normalizeLicenceTypesWithFallback,
} from './licenceTypes';
import type { PolicyDocumentKind, RequirementScope } from '../data/types';

// --------- Minimal types (kept loose so we don't couple to app-wide types) ----------
type Kind = 'IMAGE' | 'PDF' | 'OTHER';

type Requirement = {
  code: string;
  label: string;
  description?: string;
  required: boolean;
  requiredUpload?: boolean;
  requireUpload?: boolean;
  min?: number;
  max?: number;
  allowedKinds?: Kind[];
  allowedMime?: string[];
  allowMultipleUploads?: boolean;
  autoSelectSingle?: boolean;
  help?: string;
  helpKey?: string;
  hints?: Record<string, unknown>;
  validation?: { maxAgeDays?: number };
  collectMode?: 'scan' | 'upload' | 'generated';
  templateRef?: string;
  dependsOn?: string[];
  displayOrder?: number;

  group?: string;
  groupDescription?: string;

  // Policy-driven document metadata
  documentKinds?: PolicyDocumentKind[];
  copies?: number;
  annexure?: string;
  scope?: RequirementScope;
};

const canonicalRequirementCode = (code?: string) => {
  return String(code ?? '').toUpperCase();
};

type LicenceTypePatch = {
  add?: Requirement[];
  extras?: Requirement[];      // alias of "add"
  remove?: string[];           // codes to remove
  override?: Requirement[];    // match by code, replace
  overrides?: {
    byLicenceType?: string[];  // licenceType codes this selection overrides
  };
};

type Policy = {
  type: 'RequirementPolicy';
  appType: '517g' | '518a' | string;
  jurisdiction?: string;
  formVersion?: string;
  version: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  notes?: string[];
  licenceTypes?: Record<string, unknown>;
  licenseTypes?: Record<string, unknown>;
  declarations?: Array<{
    code?: string;
    display?: boolean;
    displayOrder?: number;
    applicationField?: string;
    heading?: string;
    text?: string;
    label?: string;
    helpKey?: string;
  }>;
  requirements: Requirement[];
  filters?: {
    byLicenceType?: Record<string, LicenceTypePatch>;
  };
};

// What the Documents screen can render immediately
export type NormalizedRequirement = Requirement & {
  /** Unique key for UI lists (stable across renders) */
  key: string;
  /** Normalized scope flag */
  _scope: 'perApp' | 'perFirearm';
  /** Instance info when per-firearm */
  instance?: {
    firearmId: string;
    firearmLabel?: string;
  };
  /** Layout style hint for the documents screen */
  cardStyle: 'single' | 'multi' | 'statusMini';
  /** Ordering hint from policy */
  displayOrder?: number;
};

export type NormalizedAcknowledgement = {
  key: string;
  code?: string;
  displayOrder?: number;
  applicationField?: string;
  heading: string;
  text?: string;
  helpKey?: string;
  display: boolean;
};

export type ResolveInput = {
  application: {
    id: string;
    // Your schema uses `form: '517g'|'518a'` (or sometimes `type`), support both:
    form?: '517g' | '518a' | string;
    type?: '517g' | '518a' | string;
    // Licence code like "1.5"
    licenseType?: string;
    licenceType?: string; // alt spelling
    licenseTypes?: string[];
    licenceTypes?: string[];
  };
  firearms: Array<{
    id: string;
    make?: string;
    model?: string;
    firearmType?: string; // Handgun/Rifle/Shotgun/etc
    section?: string;
    licenseType?: string;
    licenceType?: string;
    licenseTypes?: string[];
    licenceTypes?: string[];
  }>;
};

// -------------------- Loader --------------------
function loadPolicy(appType: string): Policy {
  const t = (appType || '').toLowerCase();
  if (t === '517') return policy517 as Policy;
  if (t === '517g') return policy517g as Policy;
  if (t === '518a') return policy518a as Policy;
  throw new Error(`Unknown appType: ${appType}`);
}

// -------------------- Helpers --------------------
function cloneReq(r: Requirement): Requirement {
  return JSON.parse(JSON.stringify(r));
}

function applySharedRequirementDefaults(req: Requirement, appType?: string): Requirement {
  const code = String(req.code ?? '').toUpperCase();
  if (!code) return req;
  const shared = sharedRequirementDefaultsByCode[code];
  if (!shared) return req;
  const appKey = String(appType ?? '').toLowerCase();
  const sharedBase: Record<string, unknown> = {};
  const formOverrides: Record<string, unknown> = {};
  Object.entries(shared).forEach(([key, value]) => {
    if (key.endsWith('ByForm') && value && typeof value === 'object' && !Array.isArray(value)) {
      const field = key.slice(0, -'ByForm'.length);
      const byFormValue = (value as Record<string, unknown>)[appKey];
      if (byFormValue !== undefined) {
        formOverrides[field] = byFormValue;
      }
      return;
    }
    sharedBase[key] = value;
  });
  const sharedResolved = { ...sharedBase, ...formOverrides };
  // Shared defaults provide the canonical base; policy keeps precedence for app-specific deltas.
  return { ...(sharedResolved as Requirement), ...req };
}

function buildSharedRequirementBase(code: string, appType?: string): Requirement | null {
  const shared = (sharedRequirementDefaultsByCode as Record<string, Record<string, unknown>>)[code];
  if (!shared) return null;
  const appKey = String(appType ?? '').toLowerCase();
  const sharedBase: Record<string, unknown> = {};
  const formOverrides: Record<string, unknown> = {};
  Object.entries(shared).forEach(([key, value]) => {
    if (key.endsWith('ByForm') && value && typeof value === 'object' && !Array.isArray(value)) {
      const field = key.slice(0, -'ByForm'.length);
      const byFormValue = (value as Record<string, unknown>)[appKey];
      if (byFormValue !== undefined) {
        formOverrides[field] = byFormValue;
      }
      return;
    }
    sharedBase[key] = value;
  });
  return { ...(sharedBase as Requirement), ...(formOverrides as Requirement), code };
}

function withSharedRequirements(policyRequirements: Requirement[], appType?: string): Requirement[] {
  const existingByCode = new Map<string, Requirement>();
  policyRequirements.forEach((req) => {
    const code = canonicalRequirementCode(req.code);
    if (!code) return;
    const nextReq = code === req.code ? req : { ...req, code };
    existingByCode.set(code, nextReq);
  });

  Object.keys(sharedRequirementDefaultsByCode).forEach((code) => {
    const upper = String(code).toUpperCase();
    const canonical = canonicalRequirementCode(upper);
    if (existingByCode.has(canonical)) return;
    const sharedBase = buildSharedRequirementBase(upper, appType);
    if (!sharedBase) return;
    const nextReq = canonical === sharedBase.code ? sharedBase : { ...sharedBase, code: canonical };
    existingByCode.set(canonical, nextReq);
  });

  return Array.from(existingByCode.values());
}

function collapseRequirementFamilies(requirements: Requirement[]): Requirement[] {
  const byCode = new Map<string, Requirement>();
  requirements.forEach((req) => {
    const canonical = canonicalRequirementCode(req.code);
    if (!canonical) return;
    const nextReq = canonical === req.code ? req : { ...req, code: canonical };
    const existing = byCode.get(canonical);
    if (!existing) {
      byCode.set(canonical, nextReq);
      return;
    }
    byCode.set(canonical, {
      ...existing,
      ...nextReq,
      required: Boolean(existing.required || nextReq.required),
      requireUpload: Boolean(existing.requireUpload || nextReq.requireUpload),
      requiredUpload: Boolean(existing.requiredUpload || nextReq.requiredUpload),
      min:
        Number.isFinite(existing.min as number) && Number.isFinite(nextReq.min as number)
          ? Math.max(existing.min as number, nextReq.min as number)
          : Number.isFinite(existing.min as number)
            ? existing.min
            : nextReq.min,
      max:
        Number.isFinite(existing.max as number) && Number.isFinite(nextReq.max as number)
          ? Math.max(existing.max as number, nextReq.max as number)
          : Number.isFinite(existing.max as number)
            ? existing.max
            : nextReq.max,
    });
  });
  return Array.from(byCode.values());
}

function applyLicenceTypePatch(base: Requirement[], patch?: LicenceTypePatch): Requirement[] {
  if (!patch) return base;

  // normalize "extras" -> "add"
  const add = [...(patch.add || []), ...(patch.extras || [])];

  // Index for quick override/remove
  const byCode = new Map(base.map(r => [r.code, r] as const));

  // remove
  for (const code of patch.remove || []) {
    byCode.delete(code);
  }

  // override (by code)
  for (const o of patch.override || []) {
    byCode.set(o.code, cloneReq(o));
  }

  // add/extras (append; if code collides, treat as override)
  for (const a of add) {
    byCode.set(a.code, cloneReq(a));
  }

  return Array.from(byCode.values());
}

function sortLicenceCodes(codes: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(codes).map((c) => c.trim()).filter(Boolean))).sort(
    (a, b) => {
      const na = Number.parseFloat(a);
      const nb = Number.parseFloat(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    }
  );
}

function inferLicenceCodes(policy: Policy, input: ResolveInput): string[] {
  const licenceTypes = normalizeLicenceTypesWithFallback(
    policy.licenceTypes as Record<string, RawLicenceType> | undefined,
    policy.appType === '518a' ? FALLBACK_518A_LICENCE_TYPES : undefined
  );
  const knownCodeMap = new Map<string, string>();
  licenceTypes.forEach(({ code }) => {
    knownCodeMap.set(code.toUpperCase(), code);
  });
  Object.keys(policy.filters?.byLicenceType ?? {}).forEach((code) => {
    const trimmed = code.trim();
    if (trimmed) {
      knownCodeMap.set(trimmed.toUpperCase(), trimmed);
    }
  });

  const sectionIndex = buildSectionToCodeIndex(
    (policy.licenceTypes as Record<string, RawLicenceType> | undefined) ??
      (policy.appType === '518a' ? FALLBACK_518A_LICENCE_TYPES : undefined)
  );
  const sectionMap = new Map<string, string>(
    Object.entries(sectionIndex).map(([key, value]) => [key.toUpperCase(), value])
  );

  const normalizeCode = (raw: unknown): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const str = String(raw).trim();
    if (!str) return undefined;
    const upper = str.toUpperCase();

    if (knownCodeMap.has(upper)) {
      return knownCodeMap.get(upper);
    }

    const dotMatch = upper.match(/\d+\.\d+/);
    if (dotMatch) {
      const candidate = dotMatch[0].toUpperCase();
      if (knownCodeMap.has(candidate)) {
        return knownCodeMap.get(candidate);
      }
    }

    const candidates = [
      upper,
      upper.replace(/^SECTION\s*/i, '').trim(),
      upper.replace(/[^0-9]/g, ''),
    ].filter(Boolean);

    for (const key of candidates) {
      const mapped = sectionMap.get(key.toUpperCase());
      if (mapped) return mapped;
    }

    // If we don't know the code, fall back to the raw value to avoid dropping data
    return knownCodeMap.size ? undefined : str;
  };

  const addCodes = (value: unknown, into: Set<string>) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => addCodes(v, into));
      return;
    }
    const normalized = normalizeCode(value);
    if (normalized) into.add(normalized);
  };

  const collected = new Set<string>();
  addCodes((input.application as any).licenseTypes ?? (input.application as any).licenceTypes, collected);
  addCodes((input.application as any).licenseType ?? (input.application as any).licenceType, collected);

  (input.firearms || []).forEach((firearm) => {
    addCodes((firearm as any).licenseTypes ?? (firearm as any).licenceTypes, collected);
    addCodes((firearm as any).licenseType ?? (firearm as any).licenceType, collected);
    addCodes((firearm as any).section, collected);
  });

  return sortLicenceCodes(collected);
}

// -------------------- Main API --------------------
/**
 * Resolve a render-ready list of requirements for an application.
 * - Loads the policy based on application.form/type
 * - Applies licence-type extras/overrides (e.g., 1.5 Dedicated)
 * - Normalizes requirements for immediate rendering
 */
export function resolveRequirementsForApplication(
  input: ResolveInput
): {
  policy: Pick<Policy, 'appType' | 'version' | 'formVersion'>;
  requirements: NormalizedRequirement[];
  declarations?: NormalizedAcknowledgement[];
  membershipRequirement?: 'required' | 'optional' | 'none';
  includeMembershipIfPresent?: boolean;
} {
  const { application } = input;

  const appType = (application.form || application.type) as string;
  const policy = loadPolicy(appType);
  const licenceTypesRecord = policy.licenceTypes as Record<string, RawLicenceType> | undefined;

  // 1) Start from policy requirements
  let reqs: Requirement[] = withSharedRequirements(policy.requirements.map(cloneReq), appType)
    .map(cloneReq)
    .map((req) => applySharedRequirementDefaults(req, appType));

  // 2) Apply licence-type filter patch(s)
  const licenceCodes = inferLicenceCodes(policy, input);
  const membershipRequirement = (() => {
    const normalized = normalizeLicenceTypesWithFallback(
      licenceTypesRecord,
      policy.appType === '518a' ? FALLBACK_518A_LICENCE_TYPES : undefined
    );
    if (!licenceCodes.length || !normalized.length) return 'none';
    const byCode = new Map<string, typeof normalized[number]>();
    normalized.forEach((entry) => {
      byCode.set(entry.code, entry);
    });
    let hasOptional = false;
    let hasRequired = false;
    const stringToLevel = (value: unknown): 'required' | 'optional' | 'none' => {
      if (value === true) return 'required';
      if (value === false || value === null || value === undefined) return 'none';
      const str = String(value).toLowerCase().trim();
      if (str === 'true' || str === 'yes' || str === 'required') return 'required';
      if (str === 'optional') return 'optional';
      return 'none';
    };
    for (const code of licenceCodes) {
      const entry = byCode.get(code);
      const raw = (entry?.raw ?? {}) as Record<string, unknown>;
      const level = stringToLevel((raw as any).membershipRequired);
      if (level === 'required') {
        hasRequired = true;
        break;
      }
      if (level === 'optional') {
        hasOptional = true;
      }
    }
    if (hasRequired) return 'required';
    if (hasOptional) return 'optional';
    return 'none';
  })();
  if (licenceCodes.length && policy.filters?.byLicenceType) {
    const trimmedCodes = licenceCodes.map((code) => code.trim()).filter(Boolean);

    // If a licenceType specifies overrides.byLicenceType, suppress those other licence patches
    const overridden = new Set<string>();
    trimmedCodes.forEach((code) => {
      const patch = policy.filters?.byLicenceType?.[code];
      if (!patch?.overrides?.byLicenceType) return;
      patch.overrides.byLicenceType.forEach((target) => {
        const t = String(target ?? '').trim();
        if (t) overridden.add(t);
      });
    });

    const effectiveCodes = trimmedCodes.filter((code) => !overridden.has(code));

    for (const code of effectiveCodes) {
      const patch = policy.filters.byLicenceType[code];
      if (patch) {
        reqs = applyLicenceTypePatch(reqs, patch).map((req) =>
          applySharedRequirementDefaults(req, appType)
        );
      }
    }
  }
  reqs = collapseRequirementFamilies(reqs);

  const includeMembershipIfPresent = (() => {
    const normalized = normalizeLicenceTypesWithFallback(
      licenceTypesRecord,
      policy.appType === '518a' ? FALLBACK_518A_LICENCE_TYPES : undefined
    );
    if (!licenceCodes.length || !normalized.length) return false;
    const byCode = new Map<string, typeof normalized[number]>();
    normalized.forEach((entry) => {
      byCode.set(entry.code, entry);
    });
    return licenceCodes.some((code) => {
      const entry = byCode.get(code);
      const raw = (entry?.raw ?? {}) as Record<string, unknown>;
      return raw.includeMembershipIfPresent === true;
    });
  })();

  // 3) Sort by display order (when provided) then normalize output shape for the Documents screen
  const normalizeCardStyle = (value?: string) => {
    const raw = (value ?? 'single').toLowerCase();
    if (raw === 'multi') return 'multi';
    if (raw === 'statusmini' || raw === 'status-mini' || raw === 'status_mini') return 'statusMini';
    return 'single';
  };

  const sortedReqs = reqs
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => {
      const da = Number.isFinite(a.r.displayOrder as number) ? (a.r.displayOrder as number) : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(b.r.displayOrder as number) ? (b.r.displayOrder as number) : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.idx - b.idx;
    })
    .map(({ r }) => r);

  const codeCounts = new Map<string, number>();
  const normalized: NormalizedRequirement[] = sortedReqs.map((r) => {
    const code = r.code ?? 'REQ';
    const prev = codeCounts.get(code) ?? 0;
    const nextCount = prev + 1;
    codeCounts.set(code, nextCount);
    const keyBase = `${code}::app`;
    const key = nextCount === 1 ? keyBase : `${keyBase}::${nextCount}`;

    return {
      ...r,
      requiredUpload: r.requiredUpload ?? r.requireUpload ?? true,
      key,
      _scope: 'perApp',
      cardStyle: normalizeCardStyle((r as any).cardStyle),
    };
  });

  const declarations: NormalizedAcknowledgement[] | undefined = (() => {
    const acks = policy.declarations;
    if (!acks || !acks.length) return undefined;
    const sorted = acks
      .map((ack, idx) => ({ ack, idx }))
      .filter(({ ack }) => ack.display !== false)
      .sort((a, b) => {
        const da = Number.isFinite(a.ack.displayOrder as number)
          ? (a.ack.displayOrder as number)
          : Number.POSITIVE_INFINITY;
        const db = Number.isFinite(b.ack.displayOrder as number)
          ? (b.ack.displayOrder as number)
          : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return a.idx - b.idx;
      })
      .map(({ ack }, idx) => {
        const code = ack.code || `ACK_${idx + 1}`;
        return {
          key: `ack::${code}::${idx + 1}`,
          code,
          displayOrder: ack.displayOrder,
          applicationField: ack.applicationField,
          heading: ack.heading || ack.label || code,
          text: ack.text,
          helpKey: ack.helpKey,
          display: ack.display !== false,
        } as NormalizedAcknowledgement;
      });
    return sorted;
  })();

  // (Optional) You can sort here if needed (e.g., required first)

  return {
    policy: { appType: policy.appType, version: policy.version, formVersion: policy.formVersion },
    requirements: normalized,
    declarations,
    membershipRequirement,
    includeMembershipIfPresent,
  };
}
