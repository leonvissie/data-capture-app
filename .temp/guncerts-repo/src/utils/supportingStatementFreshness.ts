import { appConfig } from '../config/appConfig';
import { Application, SupportingStatement, SupportingStatementSlot } from '../data/types';
import { aggregateDocumentFreshness, type AggregatedDocumentFreshness } from './documentFreshness';

const SUPPORTING_SLOTS: SupportingStatementSlot[] = [
  'spouse_family',
  'friend_colleague_neighbour',
  'additional_reference',
];

const getStatementDate = (statement: SupportingStatement): string | undefined => {
  const raw = statement.wizardData?.date;
  return typeof raw === 'string' ? raw : undefined;
};

const pickLatest = (items: SupportingStatement[]) =>
  items
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    })[0];

export const resolveSupportingStatementsForApplication = (
  application: Application,
  allStatements: SupportingStatement[],
): SupportingStatement[] => {
  const profileId = application.applicantProfileId ? String(application.applicantProfileId) : '';
  const linkedIds = new Set<string>(
    Array.isArray(application.supportingStatementIds)
      ? application.supportingStatementIds.filter(Boolean).map((id) => String(id))
      : [],
  );
  const byProfile = profileId
    ? allStatements.filter((statement) => String(statement.holderProfileId ?? '') === profileId)
    : allStatements;

  return SUPPORTING_SLOTS.map((slot) => {
    const bySlot = byProfile.filter((statement) => statement.slot === slot);
    const appLinked = bySlot.filter(
      (statement) => String(statement.applicationId ?? '') === String(application.id),
    );
    const linked = bySlot.filter((statement) => linkedIds.has(String(statement.id ?? '')));
    return pickLatest(appLinked) ?? pickLatest(linked) ?? pickLatest(bySlot) ?? null;
  }).filter((statement): statement is SupportingStatement => !!statement);
};

export type SupportingStatementFreshness = AggregatedDocumentFreshness;

export const getSupportingStatementFreshness = (
  statements: SupportingStatement[],
  now = new Date(),
): SupportingStatementFreshness => {
  const rule = appConfig.documentFreshness.supportingStatement;
  const entries = statements
    .filter((statement) => `${statement.status ?? 'empty'}`.toLowerCase() === 'complete')
    .map((statement) => ({
      id: String(statement.id),
      date: getStatementDate(statement),
      rule,
      label: rule.label,
    }));

  return aggregateDocumentFreshness(entries, now);
};

export const buildSupportingStatementFreshnessCopy = (
  freshness: SupportingStatementFreshness,
) => {
  if (freshness.status === 'expired') {
    return `At least one selected character reference date is more than ${freshness.expiryAgeDays} days old. Update your character references before finalising this application.`;
  }
  if (freshness.status === 'warning') {
    return `At least one selected character reference date is more than ${freshness.warningAgeDays} days old. Some DFOs may require character references dated within the last ${freshness.expiryAgeDays} days when you submit your application.`;
  }
  return null;
};
