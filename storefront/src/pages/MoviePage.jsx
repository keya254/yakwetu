import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MovieSection from '../components/MovieRow';
import { useCatalog } from '../context/CatalogContext';
import { useLibrary } from '../context/LibraryContext';
import { similarMovies } from '../data/catalog';
import { track } from '../lib/track';

export default function MoviePage() {
  const { id } = useParams();
  const { getById, movies, ready } = useCatalog();
  const { isOwned } = useLibrary();
  const navigate = useNavigate();
  const movie = getById(id);
  const [posterOk, setPosterOk] = useState(true);
  const [bgOk, setBgOk] = useState(true);

  useEffect(() => {
    setPosterOk(true);
    setBgOk(true);
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
          <Link to="/" className="btn btn-buy" style={{ marginTop: 12 }}>
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  const owned = isOwned(movie.id);
  const similar = similarMovies(movie, 12, movies);
  const backdrop = movie.backdrop || movie.poster || '';
  const genres = String(movie.genre || '')
    .split(/[•,/|]/)
    .map((g) => g.trim())
    .filter(Boolean);

  const goWatchOrBuy = () => {
    track('browse', movie);
    if (owned) {
      navigate(`/watch/${movie.id}`);
      return;
    }
    track('checkout_start', movie);
    navigate(`/checkout/${movie.id}`);
  };

  return (
    <div className="film-page">
      <nav className="film-crumbs">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/#movies">Movies</Link>
        <span>/</span>
        <span>{movie.title}</span>
      </nav>

      {/* Player / backdrop stage */}
      <div className="film-stage" style={{ ['--hero-bg']: movie.bg || '#1a1528' }}>
        {backdrop && bgOk ? (
          <img
            className="film-stage-bg"
            src={backdrop}
            alt=""
            onError={() => setBgOk(false)}
          />
        ) : (
          <div className="film-stage-fallback" style={{ background: movie.bg }} />
        )}
        <div className="film-stage-shade" />
        <button type="button" className="film-play" onClick={goWatchOrBuy}>
          <span className="film-play-icon">▶</span>
          <span>{owned ? 'Play now' : 'Buy · KES 5'}</span>
        </button>
      </div>

      {/* Info block: poster | details | actions */}
      <div className="film-info">
        <div className="film-poster-col">
          <div className="film-poster">
            {movie.poster && posterOk ? (
              <img src={movie.poster} alt="" onError={() => setPosterOk(false)} />
            ) : (
              <div className="film-poster-fb" style={{ background: movie.bg }}>
                {movie.title}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost film-trailer" onClick={goWatchOrBuy}>
            {owned ? '▶ Watch' : 'Buy to unlock'}
          </button>
        </div>

        <div className="film-main">
          <h1>{movie.title}</h1>
          <p className="film-blurb">{movie.blurb || 'No synopsis available.'}</p>
          <dl className="film-meta">
            <div>
              <dt>Genre</dt>
              <dd>
                {genres.length
                  ? genres.map((g) => (
                      <span key={g} className="film-tag">
                        {g}
                      </span>
                    ))
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Actors</dt>
              <dd>{(movie.cast || []).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>Director</dt>
              <dd>{movie.director || '—'}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>Kenya</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{movie.runtime || '—'}</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>
                <span className="film-hd">HD</span>
              </dd>
            </div>
            <div>
              <dt>Release</dt>
              <dd>{movie.year || '—'}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd>★ {movie.rating || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="film-actions">
          <button type="button" className="btn btn-buy film-action-btn" onClick={goWatchOrBuy}>
            {owned ? '▶ Stream · Unlocked' : 'Buy · KES 5'}
          </button>
          <Link to="/" className="btn btn-ghost film-action-btn">
            ← Browse more
          </Link>
          <div className="film-status">
            Status: <b>{owned ? 'Unlocked' : 'Locked'}</b>
          </div>
        </div>
      </div>

      {(movie.cast || []).length ? (
        <section className="film-cast">
          <h2>Cast</h2>
          <div className="cast-row">
            {movie.cast.map((name, i) => (
              <div className="cast-p" key={name + i}>
                <div className="cast-av" style={{ background: movie.bg }}>
                  {(name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="cast-name">{name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {i === 0 ? 'Lead' : 'Cast'}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="film-related">
        <MovieSection title="Related movies" items={similar} />
      </div>
    </div>
  );
}
