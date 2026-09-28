import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../context/LibraryContext';
import { track } from '../lib/track';

export default function Hero({ slides = [], activeIndex = 0, onSelect }) {
  const navigate = useNavigate();
  const { isOwned } = useLibrary();
  const movie = slides[activeIndex] || slides[0];
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
    <section className="hero" style={{ ['--hero-bg']: movie.bg }}>
      <div className="hero-media">
        {movie.poster && imgOk ? (
          <img
            className="hero-img"
            src={movie.poster}
            alt=""
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="hero-fallback" style={{ background: movie.bg }} />
        )}
        <div className="hero-shade" />
      </div>

      <div className="hero-copy">
        <h1>{movie.title}</h1>
        <div className="meta">
          <span className="star">★ {movie.rating || '—'}/10</span>
          <span>{movie.year}</span>
          <span>{movie.runtime || movie.genre}</span>
          <span className="price-tag">KES 5</span>
        </div>
        <p>{movie.blurb}</p>
        <div className="cta">
          <button
            type="button"
            className={owned ? 'btn btn-primary' : 'btn btn-buy'}
            onClick={playOrBuy}
          >
            {owned ? '▶ Play' : 'Buy · KES 5'}
          </button>
          <button
            type="button"
            className="btn btn-round"
            aria-label="More info"
            onClick={() => {
              track('browse', movie);
              navigate(`/movie/${movie.id}`);
            }}
          >
            i
          </button>
        </div>
      </div>

      {slides.length > 1 ? (
        <div className="hero-dots" role="tablist" aria-label="Featured titles">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              className={`dot${i === activeIndex ? ' on' : ''}`}
              onClick={() => onSelect?.(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
