import type { Movie } from '@/data/types';
import { getAllMovies, loadFacets, loadMoviesById } from '@/data';

export type FilterKey = 'decade' | 'year' | 'genre' | 'award' | 'director' | 'actor' | 'normalizedCategory' | 'ceremonyYear';
export type WatchStatusFilter = 'watched' | 'not_watched';
export type OutcomeFilter = 'winner' | 'nominee';

export type FilterState = {
  decade: string[];
  year: string[];
  genre: string[];
  award: string[];
  director: string[];
  actor: string[];
  normalizedCategory: string[];
  ceremonyYear: string[];
  outcome: OutcomeFilter[];
  watchStatus: WatchStatusFilter[];
};
export type StateFilterKey = keyof FilterState;

export const emptyFilterState: FilterState = {
  decade: [],
  year: [],
  genre: [],
  award: [],
  director: [],
  actor: [],
  normalizedCategory: [],
  ceremonyYear: [],
  outcome: [],
  watchStatus: [],
};

export function getFacetValues(key: FilterKey): string[] {
  const facets = loadFacets();
  switch (key) {
    case 'award':
      return Object.keys(facets.awardShortName);
    case 'genre':
      return Object.keys(facets.genres);
    case 'director':
      return Object.keys(facets.directors);
    case 'actor':
      return Object.keys(facets.cast);
    case 'normalizedCategory':
      return Object.keys(facets.normalizedCategory);
    case 'ceremonyYear':
      return Object.keys(facets.ceremonyYear);
    case 'decade':
      return ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
    case 'year': {
      const movies = getAllMovies();
      return [...new Set(movies.map((m) => String(m.releaseYear)))].sort((a, b) => Number(a) - Number(b));
    }
    default:
      return [];
  }
}

const DECADE_RANGES: Record<string, [number, number]> = {
  '1970s': [1970, 1979],
  '1980s': [1980, 1989],
  '1990s': [1990, 1999],
  '2000s': [2000, 2009],
  '2010s': [2010, 2019],
  '2020s': [2020, 2029],
};

function idsForDecade(decade: string): Set<string> {
  const movies = getAllMovies();
  const range = DECADE_RANGES[decade];
  if (!range) return new Set();
  return new Set(movies.filter((m) => m.releaseYear >= range[0] && m.releaseYear <= range[1]).map((m) => m.id));
}

function idsForYear(year: string): Set<string> {
  const y = Number(year);
  if (!Number.isFinite(y)) return new Set();
  const movies = getAllMovies();
  return new Set(movies.filter((m) => m.releaseYear === y).map((m) => m.id));
}

function unionForFacet(facetMap: Record<string, string[]>, values: string[]): Set<string> {
  const result = new Set<string>();
  for (const v of values) {
    for (const id of facetMap[v] ?? []) result.add(id);
  }
  return result;
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function movieMatchesOutcome(movie: Movie, outcome: OutcomeFilter): boolean {
  if (outcome === 'winner') {
    return movie.awards.some((award) => award.nominations.some((n) => n.result === 'won'));
  }
  return movie.awards.some((award) => award.nominations.some((n) => n.result === 'nominated'));
}

function idsForOutcomes(moviesById: Record<string, Movie>, outcomes: OutcomeFilter[]): Set<string> {
  const out = new Set<string>();
  for (const [id, movie] of Object.entries(moviesById)) {
    if (outcomes.some((o) => movieMatchesOutcome(movie, o))) out.add(id);
  }
  return out;
}

export function applyFilters(state: FilterState): Movie[] {
  const moviesById = loadMoviesById();
  const allIds = new Set(Object.keys(moviesById));
  const facets = loadFacets();

  let current = allIds;
  const rules: Array<Set<string> | null> = [
    state.decade.length ? unionFromValues(state.decade, idsForDecade) : null,
    state.year.length ? unionFromValues(state.year, idsForYear) : null,
    state.genre.length ? unionForFacet(facets.genres, state.genre) : null,
    state.award.length ? unionForFacet(facets.awardShortName, state.award) : null,
    state.director.length ? unionForFacet(facets.directors, state.director) : null,
    state.actor.length ? unionForFacet(facets.cast, state.actor) : null,
    state.normalizedCategory.length ? unionForFacet(facets.normalizedCategory, state.normalizedCategory) : null,
    state.ceremonyYear.length ? unionForFacet(facets.ceremonyYear, state.ceremonyYear) : null,
    state.outcome.length ? idsForOutcomes(moviesById, state.outcome) : null,
  ];

  for (const set of rules) {
    if (!set) continue;
    current = intersect(current, set);
  }

  return [...current]
    .map((id) => moviesById[id])
    .filter(Boolean)
    .sort((a, b) => b.releaseYear - a.releaseYear || a.title.localeCompare(b.title));
}

function unionFromValues(values: string[], fn: (v: string) => Set<string>): Set<string> {
  const result = new Set<string>();
  for (const v of values) {
    const ids = fn(v);
    for (const id of ids) result.add(id);
  }
  return result;
}

function filterIdsForState(state: FilterState, excludeKey?: FilterKey): Set<string> {
  const moviesById = loadMoviesById();
  const allIds = new Set(Object.keys(moviesById));
  const facets = loadFacets();

  let current = allIds;
  const rules: Array<Set<string> | null> = [
    excludeKey !== 'decade' && state.decade.length ? unionFromValues(state.decade, idsForDecade) : null,
    excludeKey !== 'year' && state.year.length ? unionFromValues(state.year, idsForYear) : null,
    excludeKey !== 'genre' && state.genre.length ? unionForFacet(facets.genres, state.genre) : null,
    excludeKey !== 'award' && state.award.length ? unionForFacet(facets.awardShortName, state.award) : null,
    excludeKey !== 'director' && state.director.length ? unionForFacet(facets.directors, state.director) : null,
    excludeKey !== 'actor' && state.actor.length ? unionForFacet(facets.cast, state.actor) : null,
    excludeKey !== 'normalizedCategory' && state.normalizedCategory.length
      ? unionForFacet(facets.normalizedCategory, state.normalizedCategory)
      : null,
    excludeKey !== 'ceremonyYear' && state.ceremonyYear.length ? unionForFacet(facets.ceremonyYear, state.ceremonyYear) : null,
    state.outcome.length ? idsForOutcomes(moviesById, state.outcome) : null,
  ];

  for (const set of rules) {
    if (!set) continue;
    current = intersect(current, set);
  }
  return current;
}

export function getFacetValuesForState(state: FilterState, key: FilterKey): string[] {
  const facets = loadFacets();
  const moviesById = loadMoviesById();
  const scopedIds = filterIdsForState(state, key);
  const selected = new Set(state[key] ?? []);

  if (key === 'decade') {
    const values = Object.keys(DECADE_RANGES).filter((decade) => {
      const [from, to] = DECADE_RANGES[decade];
      for (const id of scopedIds) {
        const movie = moviesById[id];
        if (movie && movie.releaseYear >= from && movie.releaseYear <= to) return true;
      }
      return false;
    });
    for (const v of selected) if (!values.includes(v)) values.push(v);
    return values;
  }

  if (key === 'year') {
    const values = [...new Set([...scopedIds].map((id) => String(moviesById[id]?.releaseYear)).filter(Boolean))].sort(
      (a, b) => Number(a) - Number(b),
    );
    for (const v of selected) if (!values.includes(v)) values.push(v);
    return values;
  }

  const facetMap =
    key === 'award'
      ? facets.awardShortName
      : key === 'genre'
        ? facets.genres
        : key === 'director'
          ? facets.directors
          : key === 'actor'
            ? facets.cast
            : key === 'normalizedCategory'
              ? facets.normalizedCategory
              : facets.ceremonyYear;

  const values = Object.keys(facetMap).filter((value) => {
    const ids = facetMap[value] ?? [];
    for (const id of ids) if (scopedIds.has(id)) return true;
    return false;
  });

  for (const v of selected) if (!values.includes(v)) values.push(v);
  return values;
}
