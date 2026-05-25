

export type MotivationSectionId =
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'
  | 'S9'
  | 'S10'
  | 'S11'
  | 'S12'
  | 'S13'
  | 'S14'
  | 'S15'
  | 'S16';

export type MotivationSectionKey =
  | 'titleSummary'
  | 'applicantIdentity'
  | 'synopsisPurpose'
  | 'experienceBackground'
  | 'trainingProficiency'
  | 'competency'
  | 'membershipStatus'
  | 'existingFirearms'
  | 'needJustification'
  | 'suitabilityFit'
  | 'activityUseDetail'
  | 'firearmCalibreContext'
  | 'safeStorage'
  | 'legalFraming'
  | 'conclusionRequest'
  | 'annexures';

export type MotivationApplicationType = 'new' | 'renewal';

export type MotivationSectionType = 's13' | 's15' | 's16';

export type MotivationPurposeType =
  | 'self_defence'
  | 'hunting'
  | 'sport_shooting'
  | 'mixed_hunting_sport';

export type MotivationOverlayKey =
  | 'base'
  | 'renewal'
  | 'selfDefence'
  | 'hunting'
  | 'sportShooting'
  | 'mixedHuntingSport';

export type SentenceStrength = 'standard' | 'strong' | 'veryStrong';

export type SentenceKind =
  | 'sectionIntro'
  | 'coreClaim'
  | 'supportingClaim'
  | 'comparison'
  | 'evidenceLink'
  | 'transition'
  | 'conclusion'
  | 'annexureLeadIn';

export type AnnexureReferenceStyle =
  | 'none'
  | 'single'
  | 'multiple'
  | 'grouped';

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'includes'
  | 'exists'
  | 'notExists'
  | 'truthy'
  | 'falsy';

export type TemplateVariableName =
  | 'applicantSex'
  | 'applicantFullName'
  | 'applicantInitials'
  | 'applicationTypeLabel'
  | 'sectionTypeLabel'
  | 'purposeLabel'
  | 'firearmDescription'
  | 'firearmShortDescription'
  | 'firearmTypeLabel'
  | 'firearmActionLabel'
  | 'firearmMake'
  | 'firearmModel'
  | 'firearmCalibre'
  | 'firearmSerialNumber'
  | 'primaryUse'
  | 'useSummary'
  | 'needSummary'
  | 'primaryNeedSummary'
  | 'needNoteSummary'
  | 'crimeStatsSummary'
  | 'suitabilitySummary'
  | 'inadequacySummary'
  | 'continuedNeedSummary'
  | 'occupation'
  | 'associationName'
  | 'trainingProviderName'
  | 'proficiencyCategories'
  | 'statementOfResultsItems'
  | 'competencyCategories'
  | 'safeDescription'
  | 'homeTypeSummary'
  | 'homeSecurityIntro'
  | 'homeSecurityMeasureSummary'
  | 'residenceSecuritySummary'
  | 'annexureReference'
  | 'annexureReferenceGrouped'
  | 'activitySummary'
  | 'huntingNoteSummary'
  | 'sportNoteSummary'
  | 'firearmExperienceSummary'
  | 'ownershipHistorySummary'
  | 'participationFrequencySummary'
  | 'existingFirearmOverlapSummary'
  | 'huntingEnvironmentSummary'
  | 'huntingSpeciesSummary'
  | 'huntingDistanceSummary'
  | 'sightingSystemLabel'
  | 'sightingUseRationale'
  | 'sportDisciplineSummary'
  | 'capabilitySummary'
  | 'illustrativeUseSummary'
  | 'capabilityLimitationSummary'
  | 'huntingContextSummary'
  | 'sportContextSummary'
  | 'selfDefenceContextSummary';

export interface SentenceCondition {
  field: string;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface SentenceEvidenceRule {
  /**
   * Requirement or evidence key expected by policy / annexure resolution.
   * Example: `competency_certificate`, `firearm_endorsement`, `safe_photos`.
   */
  key: string;
  required?: boolean;
  referenceStyle?: AnnexureReferenceStyle;
}

export interface SentenceTemplate {
  id: string;
  sectionId: MotivationSectionId;
  sectionKey: MotivationSectionKey;
  kind: SentenceKind;
  strength: SentenceStrength;
  text: string;
  variables?: TemplateVariableName[];
  conditions?: SentenceCondition[];
  evidence?: SentenceEvidenceRule[];
  tags?: string[];
  notes?: string;
}

export interface SectionSentenceBank {
  sectionId: MotivationSectionId;
  sectionKey: MotivationSectionKey;
  templates: SentenceTemplate[];
}

export interface OverlaySentenceBank {
  overlay: MotivationOverlayKey;
  templates: SentenceTemplate[];
}

export interface MotivationSentenceBank {
  version: string;
  sections: SectionSentenceBank[];
  overlays?: OverlaySentenceBank[];
}

export const MOTIVATION_SECTION_KEYS: Record<
  MotivationSectionId,
  MotivationSectionKey
> = {
  S1: 'titleSummary',
  S2: 'applicantIdentity',
  S3: 'synopsisPurpose',
  S4: 'experienceBackground',
  S5: 'trainingProficiency',
  S6: 'competency',
  S7: 'membershipStatus',
  S8: 'existingFirearms',
  S9: 'needJustification',
  S10: 'suitabilityFit',
  S11: 'activityUseDetail',
  S12: 'firearmCalibreContext',
  S13: 'safeStorage',
  S14: 'legalFraming',
  S15: 'conclusionRequest',
  S16: 'annexures',
};
