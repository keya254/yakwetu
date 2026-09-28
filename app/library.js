/* Library: purchases, watched history, on-site recommendations */

const LIB_KEY = 'ykw_library';
const WATCHED_KEY = 'ykw_watched';

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(LIB_KEY) || '{}'); }
  catch { return {}; }
}

function saveLibrary(lib) {
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
}

function isOwned(movieId) {
  return Boolean(loadLibrary()[movieId]);
}

function unlockMovie(movie) {
  if (!movie || !movie.id) return;
  const lib = loadLibrary();
  lib[movie.id] = {
    id: movie.id,
    title: movie.title,
    genre: movie.genre,
    price: movie.price,
    unlockedAt: new Date().toISOString(),
  };
  saveLibrary(lib);
  return lib[movie.id];
}

function ownedMovies() {
  const lib = loadLibrary();
  return Object.keys(lib)
    .map((id) => getMovieById(id))
    .filter(Boolean);
}

function markWatched(movie) {
  if (!movie || !movie.id) return;
  const list = loadWatched().filter((w) => w.id !== movie.id);
  list.unshift({
    id: movie.id,
    title: movie.title,
    genre: movie.genre,
    at: new Date().toISOString(),
  });
  localStorage.setItem(WATCHED_KEY, JSON.stringify(list.slice(0, 40)));
}

function loadWatched() {
  try { return JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]'); }
  catch { return []; }
}

/** Netflix-style “Because you watched…” from local history + catalog */
function profileRecommendations(limit = 16) {
  const watched = loadWatched();
  if (!watched.length) {
    return {
      headline: 'Recommended for you',
      items: (typeof CATALOG !== 'undefined' ? CATALOG : []).slice(0, limit),
    };
  }
  const last = watched[0];
  const seed = typeof getMovieById === 'function' ? getMovieById(last.id) : null;
  const watchedIds = new Set(watched.map((w) => w.id));
  let items = [];
  if (seed && typeof similarMovies === 'function') {
    items = similarMovies(seed, limit + 5).filter((m) => !watchedIds.has(m.id));
  }
  if (items.length < limit && typeof CATALOG !== 'undefined') {
    for (const m of CATALOG) {
      if (watchedIds.has(m.id)) continue;
      if (items.some((x) => x.id === m.id)) continue;
      items.push(m);
      if (items.length >= limit) break;
    }
  }
  return {
    headline: `Because you watched ${last.title}`,
    items: items.slice(0, limit),
  };
}
