import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../context/LibraryContext';
import { track } from '../lib/track';

export default function Hero({ movie }) {
  const navigate = useNavigate();
  const { isOwned } = useLibrary();
  const [imgOk, setImgOk] = useState(Boolean(movie?.poster));

  useEffect(() => {
    setImgOk(Boolean(movie?.poster));
  }, [movie?.id, movie?.poster]);

  if (!movie) return null;
  const owned = isOwned(movie.id);

  const playOrBuy = () => {
    track('browse', movie);
    if (owned) {
      navigate(`/watch/${movie.id}`);
      return;
    }
    track('checkout_start', movie);
    navigate(`/checkout/${movie.id}`);
  };

  return (
    <section
      className="hero"
      style={{ ['--hero-bg']: movie.bg }}
    >
      <div className="hero-bg" />
      <div className="hero-poster">
        {movie.poster && imgOk ? (
          <img
            src={movie.poster}
            alt=""
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="fb" style={{ background: movie.bg }}>
            {movie.title}
          </div>
        )}
      </div>
      <div className="hero-copy">
        <h1>{movie.title}</h1>
        <div className="meta">
          <span className="star">★ {movie.rating || '—'}</span>
          <span>{movie.year}</span>
          <span>{movie.genre}</span>
          <span>KES {movie.price}</span>
        </div>
        <p>{movie.blurb}</p>
        <div className="cta">
          <button
            type="button"
            className={owned ? 'btn btn-primary' : 'btn btn-buy'}
            onClick={playOrBuy}
          >
            {owned ? '▶ Play' : `Buy · KES ${movie.price}`}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              track('browse', movie);
              navigate(`/movie/${movie.id}`);
            }}
          >
            More info
          </button>
        </div>
      </div>
    </section>
  );
}
