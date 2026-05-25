import { appConfig } from '../config/appConfig';
import { createApplication } from '../data/defaults';
import type { Application, CompetencyCertificate, Firearm, Membership } from '../data/types';
import { resolveRequirementsForApplication } from '../policy/resolve';
import policy518a from '../policy/518a.json';
import {
  buildMembershipDocumentFreshnessCopy,
  getMembershipDocumentFreshness,
} from '../utils/membershipDocumentFreshness';
import {
  buildMembershipSubmissionWarningCopy,
  getMembershipSubmissionValidity,
} from '../utils/membershipSubmissionValidity';
import { getProofOfAddressFreshness } from '../utils/proofOfAddressFreshness';

export type MatrixDocumentInput = {
  kind: string;
  requirementCode?: string;
  requirementRelatedId?: string;
  requirementRelatedLabel?: string;
};

export type ApplicationMatrixScenario = {
  id: string;
  label: string;
  form: '517g' | '518a';
  licenceType?: string;
  licenceTypes?: string[];
  proofOfAddressDate?: string;
  documents?: MatrixDocumentInput[];
  selectedFirearms?: Firearm[];
  selectedCertificates?: CompetencyCertificate[];
  selectedMemberships?: Membership[];
  declarations?: string[];
  userToSubmitMotivation?: boolean;
  hasSubmittedFirearm?: boolean;
  hasSubmittedCompetency?: boolean;
  hasExpiredFirearm?: boolean;
  hasExpiredCompetency?: boolean;
  now?: string | Date;
};

export type MatrixIssueType = 'info' | 'missing' | 'warning';

export type ApplicationMatrixRow = {
  profileId: string;
  profileLabel: string;
  form: '517g' | '518a';
  issueType: MatrixIssueType;
  issueKey: string;
  screen: string;
  anchor?: string;
  message: string;
  blocksFinalise: boolean;
  blocksPayment: boolean;
};

export type ApplicationMatrixResult = {
  profileId: string;
  profileLabel: string;
  form: '517g' | '518a';
  rows: ApplicationMatrixRow[];
  blocksFinalise: boolean;
  blocksPayment: boolean;
};

const DEFAULT_PROFILE_ID = 'matrix-profile';
const DEFAULT_SCREEN = 'Documents, Ready actions';
const PAYMENT_SCREEN = 'Documents, Ready actions, Payment';
const REQUIRED_CODE_KIND_MAP: Record<string, string[]> = {
  FIREARM_LICENCE: ['FIREARM_LICENCE'],
  COMPETENCY_CERT: ['COMPETENCY_CERT'],
  ID_DOC: ['ID_CARD', 'ID_BOOK', 'PASSPORT'],
  PROOF_ADDRESS: ['PROOF_OF_ADDRESS'],
  SAFES: ['SAFE'],
  SUPPORTING_STATEMENT: ['SUPPORTING_STATEMENT'],
  SUPPORTING_STATEMENT_1: ['SUPPORTING_STATEMENT'],
  SUPPORTING_STATEMENT_2: ['SUPPORTING_STATEMENT'],
  ASSOCIATION_MEMBERSHIP: ['ASSOCIATION_MEMBERSHIP'],
  ASSOCIATION_LETTER: ['ASSOCIATION_LETTER'],
  DEDICATED_HUNTER_CERT: ['DEDICATED_HUNTER_CERT'],
  DEDICATED_SPORT_CERT: ['DEDICATED_SPORT_CERT'],
  FIREARM_ENDORSEMENT: ['FIREARM_ENDORSEMENT'],
  PASSPORT_PHOTOS: ['PHOTO'],
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeCode = (value?: string | null) => (value == null ? '' : String(value).toUpperCase());

const requirementCodeToDocumentKinds = (code?: string) => {
  const normalized = normalizeCode(code);
  if (!normalized) return [];
  return REQUIRED_CODE_KIND_MAP[normalized] ?? [normalized];
};

const parseMissingItems = (message?: string | null): string[] => {
  if (!message) return [];
  return String(message)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean);
};

const getFirearmMaxRule = (policy: any) => {
  const rules = Array.isArray(policy?.maxItemsPerApplication) ? policy.maxItemsPerApplication : [];
  return (
    rules.find((rule: { itemKind?: string }) => {
      const kind = String(rule?.itemKind ?? '').trim().toUpperCase();
      return kind === 'FIREARM_LICENCE' || kind === 'FIREARM' || kind === 'FIREARM_LICENSE';
    }) ?? null
  );
};

const resolveFirearmSectionCode = (firearm?: Firearm): '13' | '15' | null => {
  const raw = String(firearm?.section ?? '').toUpperCase();
  if (!raw) return null;
  const normalized = raw.replace(/SECTION/gi, '').replace(/[^0-9]/g, '');
  if (normalized === '13') return '13';
  if (normalized === '15') return '15';
  return null;
};

const buildSectionLimitWarningIssues = (params: {
  rule?: { section13?: number; section15?: number } | null;
  selectedFirearms: Firearm[];
  firearmAnchor?: string;
}) => {
  const { rule, selectedFirearms, firearmAnchor } = params;
  if (!rule) return [] as Array<{ key: string; message: string; anchor?: string }>;
  const issues: Array<{ key: string; message: string; anchor?: string }> = [];
  const section13Limit = Number(rule.section13);
  const section15Limit = Number(rule.section15);
  const section13Count = selectedFirearms.filter((firearm) => resolveFirearmSectionCode(firearm) === '13').length;
  const section15Count = selectedFirearms.filter((firearm) => resolveFirearmSectionCode(firearm) === '15').length;
  if (Number.isFinite(section13Limit) && section13Limit >= 0 && section13Count > section13Limit) {
    issues.push({
      key: 'warning:section13_limit',
      message: `Section 13 firearms selected: ${section13Count}. Allowed: ${section13Limit} as per the Act.`,
      anchor: firearmAnchor,
    });
  }
  if (Number.isFinite(section15Limit) && section15Limit >= 0 && section15Count > section15Limit) {
    issues.push({
      key: 'warning:section15_limit',
      message: `Section 15 firearms selected: ${section15Count}. Allowed: ${section15Limit} as per the Act.`,
      anchor: firearmAnchor,
    });
  }
  return issues;
};

const buildSubmittedApplicationWarningCopy = (params: {
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

const buildExpiredSelectionWarningCopy = (params: {
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

const buildApplication = (scenario: ApplicationMatrixScenario): Application => {
  const selectedFirearms = scenario.selectedFirearms ?? [];
  const selectedCertificates = scenario.selectedCertificates ?? [];
  const selectedMemberships = scenario.selectedMemberships ?? [];
  return createApplication(scenario.form, {
    id: `matrix-app-${scenario.id}`,
    applicantProfileId: DEFAULT_PROFILE_ID,
    licenceType: scenario.licenceType,
    licenceTypes: scenario.licenceTypes,
    selectedFirearmIds: selectedFirearms.map((item) => item.id),
    firearms: selectedFirearms,
    competencyCertificateIds: selectedCertificates.map((item) => item.id),
    membershipIds: selectedMemberships.map((item) => item.id),
    declarations: scenario.declarations ?? [],
    userToSubmitMotivation: scenario.userToSubmitMotivation,
    includesExpiredLicences: scenario.hasExpiredFirearm ? ['expired-firearm'] : [],
    includesExpiredCompetencies: scenario.hasExpiredCompetency ? ['expired-cert'] : [],
    docs: {
      applicationId: `matrix-app-${scenario.id}`,
      policy: {
        form: scenario.form,
        version: 'matrix',
        licenceTypes: scenario.licenceTypes ?? (scenario.licenceType ? [scenario.licenceType] : undefined),
      },
      requirements: [],
      documents: (scenario.documents ?? []).map((doc, index) => ({
        requirementCode: doc.requirementCode ?? doc.kind,
        kind: doc.kind as any,
        documentId: `${scenario.id}-doc-${index + 1}`,
        source: { type: 'Application' as const },
        requirementRelatedId: doc.requirementRelatedId,
        requirementRelatedLabel: doc.requirementRelatedLabel,
      })),
    },
  });
};

const buildAckItems = (application: Application) => {
  const resolved = resolveRequirementsForApplication({
    application: {
      id: application.id,
      form: application.form,
      licenceType: application.licenceType,
      licenceTypes: application.licenceTypes,
    },
    firearms: application.firearms ?? [],
  });
  const checked = new Set((application.declarations ?? []).map((entry) => String(entry).toUpperCase()));
  return {
    resolved,
    acknowledgementItems: (resolved.declarations ?? []).map((ack) => ({
      key: ack.key,
      code: ack.code,
      applicationField: ack.applicationField,
      checked: checked.has(String(ack.code ?? '').toUpperCase()),
    })),
  };
};

const issueRow = (
  scenario: ApplicationMatrixScenario,
  issue: Omit<ApplicationMatrixRow, 'profileId' | 'profileLabel' | 'form'>,
): ApplicationMatrixRow => ({
  profileId: scenario.id,
  profileLabel: scenario.label,
  form: scenario.form,
  ...issue,
});

export const evaluateApplicationMatrixScenario = (
  scenario: ApplicationMatrixScenario,
): ApplicationMatrixResult => {
  const application = buildApplication(scenario);
  const { resolved, acknowledgementItems } = buildAckItems(application);
  const now = scenario.now ? new Date(scenario.now) : new Date();
  const rows: ApplicationMatrixRow[] = [];

  const readiness = (() => {
    const documents = new Set(
      (scenario.documents ?? [])
        .map((doc) => normalizeCode(doc.kind))
        .filter(Boolean),
    );
    const acked = new Set(
      acknowledgementItems
        .filter((item) => item.checked)
        .flatMap((item) => [normalizeCode(item.key), normalizeCode((item as any).code)])
        .filter(Boolean),
    );
    const outstanding: string[] = [];
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

    resolved.requirements
      .filter(
        (req) =>
          (req as any).requiredForApplication === true &&
          (req as any).isOptional !== true &&
          !isMembershipDocCode((req as any).__code ?? req.code ?? req.key),
      )
      .forEach((def) => {
        const rawCode = normalizeCode((def as any).__code ?? def.code ?? def.key);
        if (!rawCode) return;
        if (rawCode.startsWith('SUPPORTING_STATEMENT')) return;
        if (rawCode.includes('FIREARM') && !(scenario.selectedFirearms ?? []).length) {
          outstanding.push('Select at least one firearm');
          return;
        }
        if (rawCode.includes('COMPETENCY') && !(scenario.selectedCertificates ?? []).length) {
          outstanding.push('Select at least one competency certificate');
          return;
        }
        const canAcknowledge = def.requiredUpload === false || def.requireUpload === false;
        const hasDocument = requirementCodeToDocumentKinds(rawCode).some((kind) => documents.has(kind));
        if (!hasDocument && !(canAcknowledge && acked.has(rawCode))) {
          outstanding.push(def.label ?? def.key ?? def.code);
        }
      });

    if (
      scenario.form === '518a' &&
      resolved.membershipRequirement === 'required' &&
      !(scenario.selectedMemberships ?? []).length
    ) {
      outstanding.push('Firearm association membership');
    }

    const declarationSet = new Set((scenario.declarations ?? []).map((value) => normalizeCode(value)));
    const declarationsComplete = (resolved.declarations ?? []).every((ack) => {
      const code = normalizeCode(ack.code);
      return !code || declarationSet.has(code);
    });
    if (!declarationsComplete) {
      outstanding.push('Confirm all declarations');
    }

    const motivationDef = resolved.requirements.find(
      (def) => normalizeCode((def as any).__code ?? def.code ?? def.key) === 'MOTIVATION',
    );
    if (motivationDef && typeof scenario.userToSubmitMotivation !== 'boolean') {
      outstanding.push(
        ((motivationDef as any).label2 ?? motivationDef.label ?? motivationDef.key ?? 'Motivation choice') as string,
      );
    }

    const uniqueOutstanding = Array.from(new Set(outstanding));
    return {
      ready: uniqueOutstanding.length === 0,
      message: uniqueOutstanding.length
        ? ['Please add/complete the following:', ...uniqueOutstanding.map((item) => `- ${item}`)].join('\n')
        : undefined,
      anchor: uniqueOutstanding.length ? 'matrix' : undefined,
    };
  })();

  parseMissingItems(readiness.message).forEach((item) => {
    rows.push(
      issueRow(scenario, {
        issueType: 'missing',
        issueKey: `missing:${slugify(item)}`,
        screen: PAYMENT_SCREEN,
        anchor: readiness.anchor,
        message: item,
        blocksFinalise: true,
        blocksPayment: true,
      }),
    );
  });

  const proofOfAddressFreshness = getProofOfAddressFreshness(scenario.proofOfAddressDate, now);
  if (proofOfAddressFreshness.status === 'warning') {
    rows.push(
      issueRow(scenario, {
        issueType: 'warning',
        issueKey: 'warning:proof_of_address_age',
        screen: PAYMENT_SCREEN,
        anchor: 'PROOF_ADDRESS::app',
        message: `Your proof of address date is more than ${appConfig.documentFreshness.proofOfAddress.warningAgeDays} days old. Upload a newer document before it reaches ${appConfig.documentFreshness.proofOfAddress.expiryAgeDays} days.`,
        blocksFinalise: false,
        blocksPayment: false,
      }),
    );
  }

  const membershipSubmissionValidity = getMembershipSubmissionValidity(
    scenario.selectedMemberships ?? [],
    now,
  );
  const membershipWarning = buildMembershipSubmissionWarningCopy(membershipSubmissionValidity);
  if (membershipWarning) {
    const expired = membershipSubmissionValidity.status === 'expired';
    rows.push(
      issueRow(scenario, {
        issueType: 'warning',
        issueKey: expired ? 'warning:membership_expired' : 'warning:membership_submission_window',
        screen: PAYMENT_SCREEN,
        anchor: 'MEMBERSHIP::app',
        message: membershipWarning,
        blocksFinalise: expired,
        blocksPayment: expired,
      }),
    );
  }

  const membershipDocumentFreshness = getMembershipDocumentFreshness(
    scenario.selectedMemberships ?? [],
    now,
  );
  const membershipDocumentWarning = buildMembershipDocumentFreshnessCopy(membershipDocumentFreshness);
  if (membershipDocumentWarning) {
    const expired = membershipDocumentFreshness.status === 'expired';
    rows.push(
      issueRow(scenario, {
        issueType: 'warning',
        issueKey: expired
          ? 'warning:membership_document_expired'
          : 'warning:membership_document_window',
        screen: PAYMENT_SCREEN,
        anchor: 'MEMBERSHIP::app',
        message: membershipDocumentWarning,
        blocksFinalise: expired,
        blocksPayment: expired,
      }),
    );
  }

  const submittedWarning = buildSubmittedApplicationWarningCopy({
    hasSubmittedFirearm: scenario.hasSubmittedFirearm === true,
    hasSubmittedCompetency: scenario.hasSubmittedCompetency === true,
  });
  if (submittedWarning) {
    rows.push(
      issueRow(scenario, {
        issueType: 'warning',
        issueKey:
          scenario.hasSubmittedFirearm && scenario.hasSubmittedCompetency
            ? 'warning:submitted_items'
            : scenario.hasSubmittedFirearm
              ? 'warning:submitted_firearm'
              : 'warning:submitted_competency',
        screen: PAYMENT_SCREEN,
        anchor: scenario.hasSubmittedFirearm ? 'FIREARM_LICENCE::app' : 'COMPETENCY_CERT::app',
        message: submittedWarning,
        blocksFinalise: false,
        blocksPayment: false,
      }),
    );
  }

  const expiredWarning = buildExpiredSelectionWarningCopy({
    hasExpiredFirearm: scenario.hasExpiredFirearm === true,
    hasExpiredCompetency: scenario.hasExpiredCompetency === true,
  });
  if (expiredWarning) {
    rows.push(
      issueRow(scenario, {
        issueType: 'warning',
        issueKey:
          scenario.hasExpiredFirearm && scenario.hasExpiredCompetency
            ? 'warning:expired_items'
            : scenario.hasExpiredFirearm
              ? 'warning:expired_firearm'
              : 'warning:expired_competency',
        screen: PAYMENT_SCREEN,
        anchor: scenario.hasExpiredFirearm ? 'FIREARM_LICENCE::app' : 'COMPETENCY_CERT::app',
        message: expiredWarning,
        blocksFinalise: false,
        blocksPayment: false,
      }),
    );
  }

  if (scenario.form === '518a') {
    buildSectionLimitWarningIssues({
      rule: getFirearmMaxRule(policy518a),
      selectedFirearms: scenario.selectedFirearms ?? [],
      firearmAnchor: 'FIREARM_LICENCE::app',
    }).forEach((issue) => {
      rows.push(
        issueRow(scenario, {
          issueType: 'warning',
          issueKey: issue.key,
          screen: DEFAULT_SCREEN,
          anchor: issue.anchor,
          message: issue.message,
          blocksFinalise: true,
          blocksPayment: true,
        }),
      );
    });
  }

  if (!rows.length) {
    rows.push(
      issueRow(scenario, {
        issueType: 'info',
        issueKey: 'info:clear',
        screen: DEFAULT_SCREEN,
        message: 'No missing items or warnings triggered.',
        blocksFinalise: false,
        blocksPayment: false,
      }),
    );
  }

  return {
    profileId: scenario.id,
    profileLabel: scenario.label,
    form: scenario.form,
    rows,
    blocksFinalise: rows.some((row) => row.blocksFinalise),
    blocksPayment: rows.some((row) => row.blocksPayment),
  };
};

export const evaluateApplicationMatrix = (scenarios: ApplicationMatrixScenario[]) =>
  scenarios.map((scenario) => evaluateApplicationMatrixScenario(scenario));

const escapeCsv = (value: string | boolean | undefined) => {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

export const applicationMatrixToCsv = (results: ApplicationMatrixResult[]) => {
  const header = [
    'profileId',
    'profileLabel',
    'form',
    'issueType',
    'issueKey',
    'screen',
    'anchor',
    'message',
    'blocksFinalise',
    'blocksPayment',
  ];
  const lines = [header.join(',')];
  results.forEach((result) => {
    result.rows.forEach((row) => {
      lines.push(
        [
          row.profileId,
          row.profileLabel,
          row.form,
          row.issueType,
          row.issueKey,
          row.screen,
          row.anchor,
          row.message,
          row.blocksFinalise,
          row.blocksPayment,
        ]
          .map(escapeCsv)
          .join(','),
      );
    });
  });
  return lines.join('\n');
};
