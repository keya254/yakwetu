import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import { useCatalog } from '../context/CatalogContext';
import { useLibrary } from '../context/LibraryContext';
import { similarMovies } from '../data/catalog';
import { track } from '../lib/track';

export default function MoviePage() {
  const { id } = useParams();
  const { getById, movies } = useCatalog();
  const { isOwned } = useLibrary();
  const navigate = useNavigate();
  const movie = getById(id);
  const [posterOk, setPosterOk] = useState(Boolean(movie?.poster));

  useEffect(() => {
    setPosterOk(Boolean(movie?.poster));
  }, [movie?.id, movie?.poster]);

  useEffect(() => {
    if (movie) track('browse', movie);
  }, [movie?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!movie) {
    return (
      <div className="page">
        <p className="empty">Movie not found.</p>
        <Link to="/">← Home</Link>
      </div>
    );
  }

  const owned = isOwned(movie.id);
  const similar = similarMovies(movie, 12, movies).map((m) => getById(m.id) || m);

  return (
    <>
      <div className="movie-detail">
        <div className="detail-hero" style={{ ['--hero-bg']: movie.bg }}>
          <h1
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(36px, 8vw, 64px)',
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            {movie.title}
          </h1>
          <div className="meta" style={{ color: 'var(--gold)', marginBottom: 12 }}>
            {movie.genre}
          </div>
          <div className="cta" style={{ marginBottom: 12 }}>
            {owned ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`/watch/${movie.id}`)}
              >
                ▶ Play
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-buy"
                onClick={() => {
                  track('checkout_start', movie);
                  navigate(`/checkout/${movie.id}`);
                }}
              >
                Buy to watch · KES {movie.price}
              </button>
            )}
            <Link className="btn btn-ghost" to="/">
              Back
            </Link>
          </div>
          <div className="meta" style={{ color: 'var(--muted)', marginBottom: 10 }}>
            <span>
              <b style={{ color: 'var(--text)' }}>{movie.year}</b>
            </span>
            <span>{movie.runtime}</span>
            <span>★ {movie.rating}</span>
            <span>KES {movie.price}</span>
          </div>
          <p className="muted">{movie.blurb}</p>
        </div>

        <div className="stack">
          <div className="detail-poster">
            {movie.poster && posterOk ? (
              <img src={movie.poster} alt="" onError={() => setPosterOk(false)} />
            ) : (
              <div className="fb" style={{ background: movie.bg }}>
                {movie.title}
              </div>
            )}
          </div>
          <div className="side-stats">
            <div>
              <span>Director</span>
              <b>{movie.director || '—'}</b>
            </div>
            <div>
              <span>Runtime</span>
              <b>{movie.runtime || '—'}</b>
            </div>
            <div>
              <span>Release</span>
              <b>{movie.year || '—'}</b>
            </div>
            <div>
              <span>Price</span>
              <b>KES {movie.price}</b>
            </div>
            <div>
              <span>Status</span>
              <b>{owned ? 'Unlocked' : 'Locked'}</b>
            </div>
          </div>
        </div>
      </div>

      <section className="row">
        <div className="row-head">
          <h3>Cast</h3>
        </div>
        <div className="cast-row" style={{ padding: '0 var(--pad)' }}>
          {(movie.cast || ['Cast TBA']).map((name, i) => (
            <div className="cast-p" key={name + i}>
              <div className="cast-av" style={{ background: movie.bg }}>
                {(name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {i === 0 ? 'Lead' : 'Cast'}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="catalog" style={{ paddingTop: 0 }}>
        <MovieRow title="You might also like" items={similar} />
      </div>
    </>
  );
}
