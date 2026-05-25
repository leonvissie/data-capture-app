export type AwardShortName = 'Oscars' | 'BAFTA' | 'Golden Globes' | string;

export type NominationResult = 'won' | 'nominated';

export interface Nomination {
  category: string;
  normalizedCategory: string;
  categoryGroup: string;
  result: NominationResult;
}

export interface MovieAward {
  awardShortName: AwardShortName;
  ceremonyYear: number;
  nominations: Nomination[];
}

export interface Movie {
  id: string;
  title: string;
  releaseYear: number;
  releaseDate: string | null;
  genres: string[];
  director: string | null;
  cast: string[];
  awards: MovieAward[];
}

export interface DatasetPeriod {
  label: string;
  releaseYearFrom: number;
  releaseYearTo: number;
}

export interface DatasetCoverage {
  status: string;
  importantNote: string;
  targetAwardBodies: string[];
  targetRule: string;
  missingForComprehensiveCoverage?: string[];
}

export interface DecadeDataset {
  schemaVersion: string;
  generatedAt: string;
  period: DatasetPeriod;
  coverage: DatasetCoverage;
  movies: Movie[];
}
