

import type { ApplicantSex, MotivationDistanceBand, MotivationSightingSystem } from '../../data/types';

export type FactCategory =
  | 'crime_stat'
  | 'crime_trend'
  | 'calibre_guidance'
  | 'hunting_guidance'
  | 'sport_shooting_guidance'
  | 'firearm_platform_guidance'
  | 'legal_context'
  | 'general_context';

export type FactContextType =
  | 'self_defence'
  | 'hunting'
  | 'sport_shooting'
  | 'mixed_hunting_sport'
  | 'shared';

export type FactJurisdictionType =
  | 'national'
  | 'province'
  | 'municipality'
  | 'site'
  | 'none';

export type FactRegionCode =
  | 'za'
  | 'ec'
  | 'fs'
  | 'gp'
  | 'kzn'
  | 'lp'
  | 'mp'
  | 'nc'
  | 'nw'
  | 'wc'
  | string;

export type FactMetricType =
  | 'count'
  | 'rate'
  | 'percentage'
  | 'year_on_year_change'
  | 'text_only'
  | 'other';

export type FactSourceType =
  | 'official_report'
  | 'official_statistics'
  | 'association_guidance'
  | 'curated_internal'
  | 'other';

export type FactReviewStatus =
  | 'draft'
  | 'reviewed'
  | 'approved'
  | 'archived';

export type CalibreUseContext =
  | 'self_defence'
  | 'hunting'
  | 'sport_shooting'
  | 'general';

export interface FactSourceReference {
  id: string;
  title: string;
  sourceType: FactSourceType;
  publisher?: string;
  publicationDate?: string;
  url?: string;
  notes?: string;
}

export interface FactJurisdiction {
  type: FactJurisdictionType;
  regionCode?: FactRegionCode;
  regionLabel?: string;
  localityLabel?: string;
}

export interface FactMetric {
  metricType: FactMetricType;
  value?: number;
  unit?: string;
  previousValue?: number;
  deltaValue?: number;
  periodLabel?: string;
}

export interface FactUsageRule {
  /**
   * Motivation sections where this fact may be injected.
   * Example: ['S9', 'S10', 'S12']
   */
  sectionIds?: string[];
  /**
   * Section / licence types where this fact is relevant.
   * Example: ['s13'] or ['s15', 's16']
   */
  sectionTypes?: string[];
  /**
   * Optional purpose filter.
   */
  contextTypes?: FactContextType[];
  applicantSexes?: ApplicantSex[];
  /**
   * Indicates whether the fact is preferred when the applicant's
   * residence or travel context matches the jurisdiction.
   */
  locationSensitive?: boolean;
  /**
   * Optional ranking hint for composer selection.
   */
  priority?: number;
  requiresSightingSystem?: boolean;
}

export interface FactRecord {
  id: string;
  category: FactCategory;
  contextType: FactContextType;
  title: string;
  summary: string;
  wording?: string;
  jurisdiction: FactJurisdiction;
  metric?: FactMetric;
  tags?: string[];
  calibre?: string;
  sightingSystem?: MotivationSightingSystem;
  firearmType?: string;
  useContexts?: CalibreUseContext[];
  usage?: FactUsageRule;
  source: FactSourceReference;
  effectiveFrom?: string;
  effectiveTo?: string;
  reviewStatus: FactReviewStatus;
  reviewNotes?: string;
}

export interface FactBank {
  version: string;
  facts: FactRecord[];
  huntingSpeciesGroupPills?: string[];
  huntingSpeciesGroups?: FactSpeciesGroupRecord[];
  calibreCatalog?: FactCalibreCatalogRecord[];
  sightingCatalog?: FactSightingCatalogRecord[];
}

export interface FactSpeciesGroupRecord {
  id: string;
  label: string;
  calibreKeys: string[];
  speciesExamples: string[];
}

export interface FactCalibreCatalogRecord {
  key: string;
  label: string;
  aliases?: string[];
  typicalDistanceLabel: string;
  minDistanceMetres: number;
  maxDistanceMetres: number;
  distanceBand: MotivationDistanceBand;
  notes?: string;
}

export interface FactSightingCatalogRecord {
  system: MotivationSightingSystem;
  label: string;
  aliases?: string[];
  selfDefenceRationale: string;
  huntingRationale: string;
  sportShootingRationale: string;
}

export interface FactSelectorContext {
  contextType: FactContextType;
  sectionType?: string;
  sectionId?: string;
  applicantRegionCodes?: FactRegionCode[];
  applicantSex?: ApplicantSex;
  calibre?: string;
  sightingSystem?: MotivationSightingSystem;
  firearmType?: string;
  tags?: string[];
}

export interface SelectedFact {
  fact: FactRecord;
  score: number;
  matchedOn: string[];
}
