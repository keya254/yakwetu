import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../context/LibraryContext';
import { posterSrcSet } from '../lib/images';

function hueFor(title) {
  let hash = 0;
  for (const char of String(title || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 15 + (hash % 60);
}

export function PosterArt({ movie, className = '', showBadges = true, priority = false }) {
  const { isOwned } = useLibrary();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!movie) return null;

  const owned = isOwned(movie.id);
  const hue = hueFor(movie.title);
  const { src, srcSet, sizes } = posterSrcSet(movie);
  const showImg = Boolean(src) && !failed;

  return (
    <div className={`art ${className}`.trim()}>
      {showBadges && owned ? <span className="owned-badge">Owned</span> : null}
      {showBadges && !owned ? (
        <span className="price-badge">KES {movie.price ?? 5}</span>
      ) : null}

      {/* Always paint branded fallback underneath so failed loads never flash empty */}
      <div
        className="poster-fallback"
        aria-hidden={showImg && loaded ? 'true' : undefined}
        style={{
          background: `linear-gradient(160deg, oklch(0.42 0.09 ${hue}) 0%, oklch(0.26 0.05 ${hue}) 55%, oklch(0.19 0.02 ${hue}) 100%)`,
        }}
      >
        <span className="brand">Yakwetu</span>
        <div>
          <span className="title">{movie.title}</span>
          {movie.year ? <span className="year">{movie.year}</span> : null}
        </div>
      </div>

      {showImg ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={loaded ? 'is-loaded' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

export default function PosterTile({ movie, compact = false, priority = false }) {
  const navigate = useNavigate();
  if (!movie) return null;
  const genre = String(movie.genre || '').split(/[•,/|]/)[0]?.trim();

  return (
    <button type="button" className="tile" onClick={() => navigate(`/movie/${movie.id}`)}>
      <PosterArt movie={movie} priority={priority} />
      {!compact ? (
        <div className="info">
          <h4>{movie.title}</h4>
          <div className="g">
            <span>{[movie.year, genre].filter(Boolean).join(' · ')}</span>
            <span className="price">KES {movie.price ?? 5}</span>
          </div>
        </div>
      ) : null}
    </button>
  );
}
