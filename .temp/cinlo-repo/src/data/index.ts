import type { Movie } from './types';

export type MoviesById = Record<string, Movie>;
export type FacetIndex = Record<string, string[]>;

export function loadMoviesById(): MoviesById {
  return require('./indexes/movies_by_id.json') as MoviesById;
}

export function loadFacets() {
  return {
    awardShortName: require('./indexes/facet_awardShortName.json') as FacetIndex,
    genres: require('./indexes/facet_genres.json') as FacetIndex,
    directors: require('./indexes/facet_directors.json') as FacetIndex,
    cast: require('./indexes/facet_cast.json') as FacetIndex,
    ceremonyYear: require('./indexes/facet_ceremonyYear.json') as FacetIndex,
    normalizedCategory: require('./indexes/facet_normalizedCategory.json') as FacetIndex,
  };
}

export function getAllMovies(): Movie[] {
  const byId = loadMoviesById();
  return Object.values(byId);
}
