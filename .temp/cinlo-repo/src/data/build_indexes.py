#!/usr/bin/env python3
import glob
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DECADES_DIR = ROOT / "decades"
INDEXES_DIR = ROOT / "indexes"
INDEXES_DIR.mkdir(parents=True, exist_ok=True)


def add_unique(lst, v):
    if v not in lst:
        lst.append(v)


def main():
    files = sorted(glob.glob(str(DECADES_DIR / "awards_movies_*.json")))
    movies = []
    for f in files:
        data = json.load(open(f))
        movies.extend(data.get("movies", []))

    movies_by_id = {}

    facet_award = defaultdict(list)
    facet_genres = defaultdict(list)
    facet_directors = defaultdict(list)
    facet_cast = defaultdict(list)
    facet_ceremony_year = defaultdict(list)
    facet_norm_category = defaultdict(list)

    for movie in movies:
        mid = movie["id"]
        movies_by_id[mid] = movie

        genres = movie.get("genres") or []
        director = movie.get("director")
        cast = movie.get("cast") or []

        for g in genres:
            add_unique(facet_genres[g], mid)
        if director:
            add_unique(facet_directors[director], mid)
        for c in cast:
            add_unique(facet_cast[c], mid)

        for award in movie.get("awards", []):
            award_name = award.get("awardShortName")
            ceremony_year = str(award.get("ceremonyYear"))
            if award_name:
                add_unique(facet_award[award_name], mid)
            add_unique(facet_ceremony_year[ceremony_year], mid)

            for n in award.get("nominations", []):
                nc = n.get("normalizedCategory")
                if nc:
                    add_unique(facet_norm_category[nc], mid)

    outputs = {
        "movies_by_id.json": dict(sorted(movies_by_id.items())),
        "facet_awardShortName.json": {k: sorted(v) for k, v in sorted(facet_award.items())},
        "facet_genres.json": {k: sorted(v) for k, v in sorted(facet_genres.items())},
        "facet_directors.json": {k: sorted(v) for k, v in sorted(facet_directors.items())},
        "facet_cast.json": {k: sorted(v) for k, v in sorted(facet_cast.items())},
        "facet_ceremonyYear.json": {k: sorted(v) for k, v in sorted(facet_ceremony_year.items(), key=lambda x: int(x[0]))},
        "facet_normalizedCategory.json": {k: sorted(v) for k, v in sorted(facet_norm_category.items())},
    }

    for name, payload in outputs.items():
        out = INDEXES_DIR / name
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        print(f"Wrote {out}")


if __name__ == "__main__":
    main()
