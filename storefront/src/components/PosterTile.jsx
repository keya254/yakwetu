import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../context/LibraryContext';

export default function PosterTile({ movie }) {
  const navigate = useNavigate();
  const { isOwned } = useLibrary();
  if (!movie) return null;
  const owned = isOwned(movie.id);

  return (
    <button
      type="button"
      className="tile"
      onClick={() => navigate(`/movie/${movie.id}`)}
    >
      <div className="art" style={{ background: movie.bg }}>
        {owned ? <span className="owned-badge">OWNED</span> : null}
        <span className="price-badge">KES 5</span>
        {movie.poster ? (
          <img
            src={movie.poster}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fb = e.currentTarget.nextElementSibling;
              if (fb) fb.hidden = false;
            }}
          />
        ) : null}
        <span className="title-fallback" hidden={Boolean(movie.poster)}>
          {movie.title}
        </span>
      </div>
      <div className="info">
        <h4>{movie.title}</h4>
        <div className="g">
          {movie.year || ''} · ★ {movie.rating || '—'}
        </div>
      </div>
    </button>
  );
}
