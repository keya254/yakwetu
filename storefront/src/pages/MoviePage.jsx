import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MovieSection from '../components/MovieRow';
import { PosterArt } from '../components/PosterTile';
import { MobileBuyBar, PurchaseCard } from '../components/PurchaseCard';
import { useCatalog } from '../context/CatalogContext';
import { similarMovies } from '../data/catalog';
import { heroSrcSet } from '../lib/images';
import { track } from '../lib/track';

export default function MoviePage() {
  const { id } = useParams();
  const { getById, movies, ready } = useCatalog();
  const movie = getById(id);
  const [bgOk, setBgOk] = useState(true);
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    setBgOk(true);
    setBgLoaded(false);
  }, [movie?.id, movie?.poster, movie?.backdrop]);
  useEffect(() => {
    if (movie) track('browse', movie);
  }, [movie?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready && !movie) {
    return (
      <div className="film-page">
        <div className="film-loading">Loading movie…</div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="film-page">
        <div className="film-loading">
          <p>Movie not found.</p>
          <Link to="/browse" className="btn btn-buy" style={{ marginTop: 12 }}>
            ← Browse films
          </Link>
        </div>
      </div>
    );
  }

  const similar = similarMovies(movie, 12, movies);
  const hero = heroSrcSet(movie);
  const genres = String(movie.genre || '')
    .split(/[•,/|]/)
    .map((g) => g.trim())
    .filter(Boolean);
  const facts = [movie.year, movie.runtime].filter(Boolean);

  return (
    <>
      <main className="film-page">
        <section className="film-hero">
          {hero.src && bgOk ? (
            <img
              className={`film-hero-bg${bgLoaded ? ' is-loaded' : ''}`}
              src={hero.src}
              srcSet={hero.srcSet}
              sizes={hero.sizes}
              alt=""
              decoding="async"
              fetchPriority="high"
              onLoad={() => setBgLoaded(true)}
              onError={() => setBgOk(false)}
            />
          ) : null}
          <div className="film-hero-shade" />

          <div className="film-grid">
            <div className="film-poster-desk">
              <PosterArt movie={movie} showBadges={false} priority />
            </div>

            <div className="film-main">
              <div className="film-title-row">
                <div className="film-poster-mob">
                  <PosterArt movie={movie} showBadges={false} priority />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="film-facts">{facts.join(' · ')}</p>
                  <h1>{movie.title}</h1>
                </div>
              </div>

              <div className="film-badges">
                {genres.map((g) => (
                  <span key={g} className="badge">
                    {g}
                  </span>
                ))}
                {movie.rating ? (
                  <span className="imdb-rating">
                    <span className="star">★</span>
                    <span>{movie.rating}</span> rating
                  </span>
                ) : null}
              </div>

              {movie.blurb ? (
                <details className="film-plot">
                  <summary>
                    <span className="clamp">{movie.blurb}</span>
                    <span className="more">More</span>
                  </summary>
                </details>
              ) : null}

              <dl className="film-meta">
                {movie.director ? (
                  <div>
                    <dt>Director</dt>
                    <dd>{movie.director}</dd>
                  </div>
                ) : null}
                {(movie.cast || []).length ? (
                  <div>
                    <dt>Starring</dt>
                    <dd>{movie.cast.join(', ')}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Country</dt>
                  <dd>Kenya</dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>HD</dd>
                </div>
              </dl>
            </div>

            <PurchaseCard movie={movie} />
          </div>
        </section>

        <div className="film-related">
          <MovieSection title="More like this" items={similar} />
        </div>
      </main>
      <MobileBuyBar movie={movie} />
    </>
  );
}
