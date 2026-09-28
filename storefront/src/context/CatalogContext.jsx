import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CATALOG as BASE, searchMovies as searchIn } from '../data/catalog';
import { loadPosterCache, savePosterCache } from '../lib/storage';

const CatalogContext = createContext(null);
const KENYA_CACHE_KEY = 'ykw_kenya_catalog';

function withCachedPosters(list) {
  const cached = loadPosterCache();
  return list.map((m) => ({
    ...m,
    poster: m.poster || cached[m.id] || '',
  }));
}

function loadCachedKenya() {
  try {
    const raw = JSON.parse(localStorage.getItem(KENYA_CACHE_KEY) || 'null');
    if (raw && Array.isArray(raw.movies) && raw.movies.length && raw.at) {
      // reuse for 12 hours
      if (Date.now() - raw.at < 12 * 60 * 60 * 1000) return raw.movies;
    }
  } catch {}
  return null;
}

export function CatalogProvider({ children }) {
  const [movies, setMovies] = useState(() =>
    withCachedPosters(loadCachedKenya() || BASE)
  );
  const [source, setSource] = useState(() =>
    loadCachedKenya() ? 'tmdb-cache' : 'static'
  );

  const getById = useCallback(
    (id) => movies.find((m) => m.id === id) || null,
    [movies]
  );

  const search = useCallback((q) => searchIn(q, movies), [movies]);

  const applyPosters = useCallback((map) => {
    if (!map || !Object.keys(map).length) return;
    const cached = { ...loadPosterCache(), ...map };
    savePosterCache(cached);
    setMovies((prev) =>
      prev.map((m) => (map[m.id] ? { ...m, poster: map[m.id] } : m))
    );
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);

    (async () => {
      try {
        const r = await fetch('/api/catalog/kenya?limit=12', {
          signal: ctrl.signal,
        });
        if (!r.ok) return;
        const data = await r.json();
        if (data.ok && Array.isArray(data.movies) && data.movies.length) {
          const list = withCachedPosters(data.movies);
          setMovies(list);
          setSource('tmdb');
          localStorage.setItem(
            KENYA_CACHE_KEY,
            JSON.stringify({ at: Date.now(), movies: data.movies })
          );
          return;
        }
      } catch {
        /* keep fallback */
      } finally {
        clearTimeout(timer);
      }

      // No TMDB list — enrich static Kenyan posters
      const need = movies.filter((m) => !m.poster).slice(0, 12);
      if (!need.length) return;
      try {
        const r = await fetch('/api/catalog/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titles: need.map((m) => ({
              id: m.id,
              title: m.title,
              year: m.year,
              tmdb: m.tmdb || 0,
              imdb: m.imdb || '',
            })),
          }),
        });
        if (!r.ok) return;
        const data = await r.json();
        applyPosters(data.posters || {});
      } catch {
        /* ignore */
      }
    })();

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ movies, getById, search, applyPosters, source }),
    [movies, getById, search, applyPosters, source]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog outside CatalogContext');
  return ctx;
}
