import type { CompetencyCertificate, Firearm } from '../data/types';
import {
  getCompetencyCertificateIdsInTerminalApplications,
  getFirearmIdsInTerminalApplications,
} from './applicationUsage';

export type DocumentIssueSeverity = 'missing' | 'warning';

export type DocumentSectionIssue = {
  key: string;
  severity: DocumentIssueSeverity;
  title: string;
  message: string;
  anchor?: string;
};

export const MISSING_ITEMS_HEADER = 'Please add/complete the following:';
export const MISSING_SUPPORTING_STATEMENT = 'Incomplete character reference';
export const DECLARATIONS_ANCHOR = 'declarations';

export const normalizeMissingItem = (value?: string | null) =>
  (value == null ? '' : String(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const parseMissingItems = (message?: string | null): string[] => {
  if (!message) return [];
  return String(message)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean);
};

export const buildMissingMessage = (items: string[]): string | undefined => {
  if (!items.length) return undefined;
  return [MISSING_ITEMS_HEADER, ...items.map((item) => `- ${item}`)].join('\n');
};

export const buildMissingItemOrder = (
  entries: Array<{ label?: string; code?: string; displayOrder?: number }>
) => {
  const map = new Map<string, number>();
  const sorted = entries
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => {
      const da = Number.isFinite(a.entry.displayOrder as number)
        ? (a.entry.displayOrder as number)
        : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(b.entry.displayOrder as number)
        ? (b.entry.displayOrder as number)
        : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.idx - b.idx;
    });

  const upsert = (label: string, rank: number) => {
    const key = normalizeMissingItem(label);
    if (!key || map.has(key)) return;
    map.set(key, rank);
  };

  sorted.forEach(({ entry }, rank) => {
    const code = `${entry.code ?? ''}`.toUpperCase();
    if (entry.label) upsert(entry.label, rank);
    if (code.includes('FIREARM')) upsert('Select at least one firearm', rank);
    if (code.includes('COMPETENCY')) upsert('Select at least one competency certificate', rank);
    if (code === 'MEMBERSHIP') upsert('Firearm association membership', rank);
    if (code.startsWith('SUPPORTING_STATEMENT')) upsert(MISSING_SUPPORTING_STATEMENT, rank);
  });

  upsert('Complete declarations section', Number.MAX_SAFE_INTEGER - 1);
  upsert(MISSING_SUPPORTING_STATEMENT, Number.MAX_SAFE_INTEGER);
  return map;
};

export const sortMissingItems = (items: string[], order: Map<string, number>) =>
  items
    .map((label, idx) => ({
      label,
      idx,
      rank: order.get(normalizeMissingItem(label)) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.idx - b.idx;
    })
    .map((item) => item.label);

export type FirearmMaxRule = {
  itemKind?: string;
  section13?: number;
  section15?: number;
};

export const getFirearmMaxRule = (policy: any): FirearmMaxRule | null => {
  const rules = Array.isArray(policy?.maxItemsPerApplication) ? policy.maxItemsPerApplication : [];
  for (const rule of rules) {
    const kind = String(rule?.itemKind ?? '').trim().toUpperCase();
    if (kind === 'FIREARM_LICENCE' || kind === 'FIREARM' || kind === 'FIREARM_LICENSE') {
      return rule as FirearmMaxRule;
    }
  }
  return null;
};

export const resolveFirearmSectionCode = (firearm?: Firearm): '13' | '15' | null => {
  const raw = String(firearm?.section ?? '').toUpperCase();
  if (!raw) return null;
  const normalized = raw.replace(/SECTION/gi, '').replace(/[^0-9]/g, '');
  if (normalized === '13') return '13';
  if (normalized === '15') return '15';
  return null;
};

export const buildSectionLimitWarningIssues = (params: {
  rule?: FirearmMaxRule | null;
  selectedFirearms: Firearm[];
  firearmAnchor?: string;
}): DocumentSectionIssue[] => {
  const { rule, selectedFirearms, firearmAnchor } = params;
  if (!rule) return [];
  const issues: DocumentSectionIssue[] = [];
  const section13Limit = Number(rule.section13);
  const section15Limit = Number(rule.section15);
  const section13Count = selectedFirearms.filter((firearm) => resolveFirearmSectionCode(firearm) === '13').length;
  const section15Count = selectedFirearms.filter((firearm) => resolveFirearmSectionCode(firearm) === '15').length;
  if (Number.isFinite(section13Limit) && section13Limit >= 0 && section13Count > section13Limit) {
    issues.push({
      key: 'warning:section13_limit',
      severity: 'warning',
      title: 'Warning',
      message: `Section 13 firearms selected: ${section13Count}. Allowed: ${section13Limit} as per the Act.`,
      anchor: firearmAnchor,
    });
  }
  if (Number.isFinite(section15Limit) && section15Limit >= 0 && section15Count > section15Limit) {
    issues.push({
      key: 'warning:section15_limit',
      severity: 'warning',
      title: 'Warning',
      message: `Section 15 firearms selected: ${section15Count}. Allowed: ${section15Limit} as per the Act.`,
      anchor: firearmAnchor,
    });
  }
  return issues;
};

export const buildDemoDataWarningIssues = (params: {
  selectedFirearms: Firearm[];
  selectedCertificates: CompetencyCertificate[];
  firearmAnchor?: string;
  competencyAnchor?: string;
}): DocumentSectionIssue[] => {
  const { selectedFirearms, selectedCertificates, firearmAnchor, competencyAnchor } = params;
  const issues: DocumentSectionIssue[] = [];
  const hasDemoFirearm = selectedFirearms.some((firearm) => firearm.isDemoData === true);
  const hasDemoCompetency = selectedCertificates.some((cert) => cert.isDemoData === true);

  if (hasDemoFirearm && firearmAnchor) {
    issues.push({
      key: 'warning:demo_firearm',
      severity: 'warning',
      title: 'Warning',
      message: 'You have included demo firearm data.',
      anchor: firearmAnchor,
    });
  }

  if (hasDemoCompetency && competencyAnchor) {
    issues.push({
      key: 'warning:demo_competency',
      severity: 'warning',
      title: 'Warning',
      message: 'You have included demo competency certificate data.',
      anchor: competencyAnchor,
    });
  }

  return issues;
};

export const firstIssueAnchor = (issues: DocumentSectionIssue[]): string | undefined =>
  issues.find((issue) => !!issue.anchor)?.anchor;

export type SubmittedApplicationWarningState = {
  hasSubmittedFirearm: boolean;
  hasSubmittedCompetency: boolean;
  issues: DocumentSectionIssue[];
};

export const buildSubmittedApplicationWarningCopy = (params: {
  hasSubmittedFirearm: boolean;
  hasSubmittedCompetency: boolean;
}): string | undefined => {
  const { hasSubmittedFirearm, hasSubmittedCompetency } = params;
  if (hasSubmittedFirearm && hasSubmittedCompetency) {
    return 'You have included a firearm and competency certificate that already appear in submitted or archived applications.';
  }
  if (hasSubmittedFirearm) {
    return 'You have included a firearm that already appears in a submitted or archived application.';
  }
  if (hasSubmittedCompetency) {
    return 'You have included a competency certificate that already appears in a submitted or archived application.';
  }
  return undefined;
};

export const buildExpiredSelectionWarningCopy = (params: {
  hasExpiredFirearm: boolean;
  hasExpiredCompetency: boolean;
}): string | undefined => {
  const { hasExpiredFirearm, hasExpiredCompetency } = params;
  if (hasExpiredFirearm && hasExpiredCompetency) {
    return 'You have included an expired firearm and competency certificate.';
  }
  if (hasExpiredFirearm) {
    return 'You have included an expired firearm.';
  }
  if (hasExpiredCompetency) {
    return 'You have included an expired competency certificate.';
  }
  return undefined;
};

export const buildSubmittedApplicationWarningIssues = (params: {
  form?: string | null;
  selectedFirearms: Firearm[];
  selectedCertificates: CompetencyCertificate[];
  firearmAnchor?: string;
  competencyAnchor?: string;
}): SubmittedApplicationWarningState => {
  const { form, selectedFirearms, selectedCertificates, firearmAnchor, competencyAnchor } = params;
  const normalizedForm = String(form ?? '').trim().toLowerCase();
  const shouldCheckFirearms = normalizedForm === '518a';
  const shouldCheckCompetencies = normalizedForm === '517g';
  const submittedFirearmIds = shouldCheckFirearms ? getFirearmIdsInTerminalApplications(normalizedForm) : new Set<string>();
  const submittedCompetencyIds = shouldCheckCompetencies
    ? getCompetencyCertificateIdsInTerminalApplications(normalizedForm)
    : new Set<string>();
  const hasSubmittedFirearm = shouldCheckFirearms && selectedFirearms.some((firearm) =>
    firearm?.id != null && submittedFirearmIds.has(String(firearm.id))
  );
  const hasSubmittedCompetency = shouldCheckCompetencies && selectedCertificates.some((certificate) =>
    certificate?.id != null && submittedCompetencyIds.has(String(certificate.id))
  );
  const message = buildSubmittedApplicationWarningCopy({
    hasSubmittedFirearm,
    hasSubmittedCompetency,
  });
  const issues: DocumentSectionIssue[] = [];
  if (!message) {
    return {
      hasSubmittedFirearm,
      hasSubmittedCompetency,
      issues,
    };
  }
  if (hasSubmittedFirearm && firearmAnchor) {
    issues.push({
      key: hasSubmittedCompetency ? 'warning:submitted_items' : 'warning:submitted_firearm',
      severity: 'warning',
      title: 'Warning',
      message,
      anchor: firearmAnchor,
    });
  }
  if (hasSubmittedCompetency && competencyAnchor) {
    issues.push({
      key: hasSubmittedFirearm ? 'warning:submitted_items' : 'warning:submitted_competency',
      severity: 'warning',
      title: 'Warning',
      message,
      anchor: competencyAnchor,
    });
  }
  return {
    hasSubmittedFirearm,
    hasSubmittedCompetency,
    issues,
  };
};
