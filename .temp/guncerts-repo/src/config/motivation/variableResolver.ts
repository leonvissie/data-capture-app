

import type { TemplateVariableName } from './sentenceBank.types';
import { competencyCategoryListLabel } from '../../utils/categoryLabel';
import { categoryLabel } from '../../utils/categoryLabel';

export interface VariableResolverContext {
  values: Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isMeaningfulFirearmValue(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && normalized.toUpperCase() !== 'NONE';
}

function resolveApplicationTypeLabel(values: Record<string, unknown>): string {
  const applicationType = asString(values.applicationType);
  switch (applicationType) {
    case 'new':
      return 'APPLICATION FOR A NEW LICENCE';
    case 'renewal':
      return 'APPLICATION FOR RENEWAL OF LICENCE';
    default:
      return 'LICENCE APPLICATION';
  }
}

function resolveSectionTypeLabel(values: Record<string, unknown>): string {
  const sectionType = asString(values.sectionType).toLowerCase();
  switch (sectionType) {
    case 's13':
      return 'SECTION 13';
    case 's15':
      return 'SECTION 15';
    case 's16':
      return 'SECTION 16';
    default:
      return 'THE RELEVANT SECTION';
  }
}

function resolvePurposeLabel(values: Record<string, unknown>): string {
  const purposeType = asString(values.purposeType);
  switch (purposeType) {
    case 'self_defence':
      return 'SELF-DEFENCE';
    case 'hunting':
      return 'HUNTING';
    case 'sport_shooting':
      return 'SPORT SHOOTING';
    case 'mixed_hunting_sport':
      return 'HUNTING AND SPORT SHOOTING';
    default:
      return 'LAWFUL PURPOSES';
  }
}

function resolveFirearmDescription(values: Record<string, unknown>): string {
  const firearmTypeRaw = asString(values.firearmTypeLabel || values.firearmType);
  const firearmType = categoryLabel(firearmTypeRaw).trim() || titleCase(firearmTypeRaw);
  const action = titleCase(asString(values.firearmActionLabel || values.firearmAction));
  const make = asString(values.firearmMake || values.make);
  const model = asString(values.firearmModel || values.model);
  const calibre = asString(values.firearmCalibre || values.calibre);
  const serial = asString(values.firearmSerialNumber || values.serialNumber);

  const mainParts = [make, model].filter(isMeaningfulFirearmValue).join(' ');
  const descriptors = [action, firearmType].filter(Boolean).join(' ');
  const prefix = [mainParts, descriptors].filter(Boolean).join(' ');
  const suffixParts = [calibre && `calibre ${calibre}`, serial && `serial number ${serial}`].filter(Boolean);

  if (!prefix && !suffixParts.length) return 'the firearm applied for';
  if (!suffixParts.length) return prefix;
  if (!prefix) return suffixParts.join(', ');
  return `${prefix}, ${suffixParts.join(', ')}`;
}

function resolveFirearmShortDescription(values: Record<string, unknown>): string {
  const make = asString(values.firearmMake || values.make);
  const model = asString(values.firearmModel || values.model);
  const serial = asString(values.firearmSerialNumber || values.serialNumber);
  const makeModel = [make, model].filter(isMeaningfulFirearmValue).join(' ');

  if (makeModel && serial) return `${makeModel} (${serial})`;
  if (makeModel) return makeModel;
  if (serial) return serial;
  return 'the firearm applied for';
}

function resolveCompetencyCategories(values: Record<string, unknown>): string {
  const raw = values.competencyCategories;
  if (Array.isArray(raw)) {
    return competencyCategoryListLabel(raw);
  }
  return asString(raw);
}

function resolvePrimaryUse(values: Record<string, unknown>): string {
  const primaryUse = asString(values.primaryUse);
  switch (primaryUse) {
    case 'self_defence':
      return 'self-defence';
    case 'hunting':
      return 'hunting';
    case 'sport_shooting':
      return 'sport shooting';
    default:
      switch (asString(values.purposeType)) {
        case 'self_defence':
          return 'self-defence';
        case 'hunting':
          return 'hunting';
        case 'sport_shooting':
          return 'sport shooting';
        case 'mixed_hunting_sport':
          return 'hunting and sport shooting';
        default:
          return 'lawful purposes';
      }
  }
}

function resolveVariable(
  name: TemplateVariableName,
  values: Record<string, unknown>
): string {
  switch (name) {
    case 'applicantSex':
      return asString(values.applicantSex);
    case 'applicantFullName':
      return asString(values.applicantFullName || values.fullName || values.fullNames);
    case 'applicantInitials':
      return asString(values.applicantInitials || values.initials);
    case 'applicationTypeLabel':
      return resolveApplicationTypeLabel(values);
    case 'sectionTypeLabel':
      return resolveSectionTypeLabel(values);
    case 'purposeLabel':
      return resolvePurposeLabel(values);
    case 'firearmDescription':
      return resolveFirearmDescription(values);
    case 'firearmShortDescription': {
      const resolved = resolveFirearmShortDescription(values);
      console.log('[motivation][variable-resolver] firearmShortDescription', {
        firearmMake: asString(values.firearmMake || values.make),
        firearmModel: asString(values.firearmModel || values.model),
        firearmSerialNumber: asString(values.firearmSerialNumber || values.serialNumber),
        resolved,
      });
      return resolved;
    }
    case 'firearmTypeLabel':
      return (
        categoryLabel(asString(values.firearmTypeLabel || values.firearmType)).trim() ||
        titleCase(asString(values.firearmTypeLabel || values.firearmType))
      );
    case 'firearmActionLabel':
      return titleCase(asString(values.firearmActionLabel || values.firearmAction));
    case 'firearmMake':
      return isMeaningfulFirearmValue(asString(values.firearmMake || values.make))
        ? asString(values.firearmMake || values.make)
        : '';
    case 'firearmModel':
      return isMeaningfulFirearmValue(asString(values.firearmModel || values.model))
        ? asString(values.firearmModel || values.model)
        : '';
    case 'firearmCalibre':
      return asString(values.firearmCalibre || values.calibre);
    case 'firearmSerialNumber':
      return asString(values.firearmSerialNumber || values.serialNumber);
    case 'primaryUse':
      return resolvePrimaryUse(values);
    case 'useSummary':
      return asString(values.useSummary);
    case 'needSummary':
      return asString(values.needSummary);
    case 'primaryNeedSummary':
      return asString(values.primaryNeedSummary);
    case 'needNoteSummary':
      return asString(values.needNoteSummary);
    case 'suitabilitySummary':
      return asString(values.suitabilitySummary);
    case 'inadequacySummary':
      return asString(values.inadequacySummary);
    case 'continuedNeedSummary':
      return asString(values.continuedNeedSummary);
    case 'occupation':
      return asString(values.occupation);
    case 'associationName':
      return asString(values.associationName);
    case 'trainingProviderName':
      return asString(values.trainingProviderName);
    case 'proficiencyCategories':
      return asString(values.proficiencyCategories);
    case 'statementOfResultsItems':
      return asString(values.statementOfResultsItems);
    case 'competencyCategories':
      return resolveCompetencyCategories(values);
    case 'safeDescription':
      return asString(values.safeDescription);
    case 'homeTypeSummary':
      return asString(values.homeTypeSummary);
    case 'homeSecurityIntro':
      return asString(values.homeSecurityIntro);
    case 'homeSecurityMeasureSummary':
      return asString(values.homeSecurityMeasureSummary);
    case 'residenceSecuritySummary':
      return asString(values.residenceSecuritySummary);
    case 'annexureReference':
      return asString(values.annexureReference);
    case 'annexureReferenceGrouped':
      return asString(values.annexureReferenceGrouped);
    case 'activitySummary':
      return asString(values.activitySummary);
    case 'huntingNoteSummary':
      return asString(values.huntingNoteSummary);
    case 'sportNoteSummary':
      return asString(values.sportNoteSummary);
    case 'firearmExperienceSummary':
      return asString(values.firearmExperienceSummary);
    case 'ownershipHistorySummary':
      return asString(values.ownershipHistorySummary);
    case 'participationFrequencySummary':
      return asString(values.participationFrequencySummary);
    case 'existingFirearmOverlapSummary':
      return asString(values.existingFirearmOverlapSummary);
    case 'huntingEnvironmentSummary':
      return asString(values.huntingEnvironmentSummary);
    case 'huntingSpeciesSummary':
      return asString(values.huntingSpeciesSummary);
    case 'huntingDistanceSummary':
      return asString(values.huntingDistanceSummary);
    case 'sightingSystemLabel':
      return asString(values.sightingSystemLabel);
    case 'sightingUseRationale':
      return asString(values.sightingUseRationale);
    case 'sportDisciplineSummary':
      return asString(values.sportDisciplineSummary);
    case 'capabilitySummary':
      return asString(values.capabilitySummary);
    case 'illustrativeUseSummary':
      return asString(values.illustrativeUseSummary);
    case 'capabilityLimitationSummary':
      return asString(values.capabilityLimitationSummary);
    case 'huntingContextSummary':
      return asString(values.huntingContextSummary);
    case 'sportContextSummary':
      return asString(values.sportContextSummary);
    case 'selfDefenceContextSummary':
      return asString(values.selfDefenceContextSummary);
    default:
      return '';
  }
}

export function resolveTemplateVariables(
  text: string,
  context: VariableResolverContext
): string {
  return text.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_match, variableName: string) => {
    const value = resolveVariable(
      variableName as TemplateVariableName,
      context.values
    );
    return value || '';
  });
}

export function resolveTemplateVariableMap(
  variableNames: TemplateVariableName[] | undefined,
  context: VariableResolverContext
): Record<TemplateVariableName, string> {
  const result = {} as Record<TemplateVariableName, string>;

  for (const variableName of variableNames ?? []) {
    result[variableName] = resolveVariable(variableName, context.values);
  }

  return result;
}
