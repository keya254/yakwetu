/** TMDB / catalog image URL helpers — size-aware, cache-friendly. */

const TMDB_BASE = 'https://image.tmdb.org/t/p';
const PATH_RE = /\/t\/p\/(?:original|w\d+|w\d+_and_h\d+_multi_faces)(\/[A-Za-z0-9_.]+)$/i;

/** Extract TMDB file path from a full URL or return a bare path. */
export function tmdbPath(input) {
  if (!input) return '';
  const s = String(input).trim();
  if (!s) return '';
  const m = s.match(PATH_RE);
  if (m) return m[1].startsWith('/') ? m[1] : `/${m[1]}`;
  if (s.startsWith('/') && /\.(jpg|jpeg|png|webp)$/i.test(s)) return s;
  return '';
}

/** Build a sized TMDB URL. Pass through non-TMDB URLs unchanged. */
export function imageUrl(input, size = 'w500') {
  if (!input) return '';
  const s = String(input).trim();
  if (!s) return '';
  const path = tmdbPath(s);
  if (path) return `${TMDB_BASE}/${size}${path}`;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return `${TMDB_BASE}/${size}${s}`;
  return s;
}

export function posterUrl(movie, size = 'w342') {
  if (!movie) return '';
  return (
    imageUrl(movie.poster_path || movie.poster, size) ||
    imageUrl(movie.backdrop_path || movie.backdrop, size) ||
    ''
  );
}

export function backdropUrl(movie, size = 'w1280') {
  if (!movie) return '';
  return (
    imageUrl(movie.backdrop_path || movie.backdrop, size) ||
    imageUrl(movie.poster_path || movie.poster, size) ||
    ''
  );
}

/** Responsive srcset for posters (tiles / cards). */
export function posterSrcSet(movie) {
  const path = tmdbPath(movie?.poster_path || movie?.poster);
  if (!path) {
    const u = posterUrl(movie, 'w500');
    return u ? { src: u, srcSet: undefined, sizes: undefined } : { src: '', srcSet: undefined, sizes: undefined };
  }
  return {
    src: `${TMDB_BASE}/w342${path}`,
    srcSet: `${TMDB_BASE}/w185${path} 185w, ${TMDB_BASE}/w342${path} 342w, ${TMDB_BASE}/w500${path} 500w, ${TMDB_BASE}/w780${path} 780w`,
    sizes: '(max-width: 640px) 42vw, (max-width: 1024px) 18vw, 160px',
  };
}

/** Hero / landing full-bleed. Prefer backdrop. */
export function heroSrcSet(movie) {
  const path = tmdbPath(movie?.backdrop_path || movie?.backdrop || movie?.poster_path || movie?.poster);
  if (!path) {
    const u = backdropUrl(movie, 'w1280');
    return { src: u, srcSet: undefined, sizes: '100vw' };
  }
  return {
    src: `${TMDB_BASE}/w1280${path}`,
    srcSet: `${TMDB_BASE}/w780${path} 780w, ${TMDB_BASE}/w1280${path} 1280w, ${TMDB_BASE}/original${path} 1920w`,
    sizes: '100vw',
  };
}

/** Normalize API / cache movie so poster + backdrop always resolve. */
export function normalizeMovieImages(movie) {
  if (!movie) return movie;
  const poster = posterUrl(movie, 'w500');
  const backdrop = backdropUrl(movie, 'w1280') || poster;
  return {
    ...movie,
    poster,
    backdrop,
    poster_path: movie.poster_path || tmdbPath(movie.poster) || '',
    backdrop_path: movie.backdrop_path || tmdbPath(movie.backdrop) || '',
  };
}
