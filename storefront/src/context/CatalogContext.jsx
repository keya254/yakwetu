import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CATALOG as BASE, searchMovies as searchIn } from '../data/catalog';
import { normalizeMovieImages } from '../lib/images';
import { loadPosterCache, savePosterCache } from '../lib/storage';

const CatalogContext = createContext(null);
const KENYA_CACHE_KEY = 'ykw_kenya_catalog_v3';

function hydrateList(list) {
  const cached = loadPosterCache();
  return (list || []).map((m) => {
    const patched = {
      ...m,
      poster: m.poster || cached[m.id] || '',
      backdrop: m.backdrop || m.poster || cached[m.id] || '',
    };
    return normalizeMovieImages(patched);
  });
}

function loadCachedKenya() {
  try {
    const raw = JSON.parse(localStorage.getItem(KENYA_CACHE_KEY) || 'null');
    if (raw && Array.isArray(raw.movies) && raw.movies.length && raw.at) {
      if (Date.now() - raw.at < 12 * 60 * 60 * 1000) return raw.movies;
    }
  } catch {}
  return null;
}

export function CatalogProvider({ children }) {
  const cached = loadCachedKenya();
  // Always start from curated BASE (has verified posters) so first paint is never blank
  const [movies, setMovies] = useState(() => hydrateList(BASE));
  const [source, setSource] = useState('static');
  const [ready, setReady] = useState(true);

  const getById = useCallback(
    (id) => movies.find((m) => m.id === id) || null,
    [movies]
  );

  const search = useCallback((q) => searchIn(q, movies), [movies]);

  const applyPosters = useCallback((map) => {
    if (!map || !Object.keys(map).length) return;
    const cachedMap = { ...loadPosterCache(), ...map };
    savePosterCache(cachedMap);
    setMovies((prev) =>
      prev.map((m) =>
        map[m.id]
          ? normalizeMovieImages({
              ...m,
              poster: map[m.id],
              poster_path: map[m.id],
              backdrop: m.backdrop || map[m.id],
            })
          : m
      )
    );
  }, []);

  useEffect(() => {
    // Drop stale v1/v2 caches that had wrong TMDB IDs / empty posters
    try {
      localStorage.removeItem('ykw_kenya_catalog');
      localStorage.removeItem('ykw_kenya_catalog_v2');
      localStorage.removeItem('ykw_posters'); // old enrich may have pointed at wrong films
    } catch {}

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);

    (async () => {
      // Prefer live TMDB kenya list when the API key is configured
      try {
        const r = await fetch('/api/catalog/kenya?limit=12', { signal: ctrl.signal });
        if (r.ok) {
          const data = await r.json();
          if (data.ok && Array.isArray(data.movies) && data.movies.length) {
            const list = hydrateList(data.movies);
            // Only swap if we actually got usable posters
            const withArt = list.filter((m) => m.poster).length;
            if (withArt >= Math.min(4, list.length)) {
              setMovies(list);
              setSource('tmdb');
              localStorage.setItem(
                KENYA_CACHE_KEY,
                JSON.stringify({ at: Date.now(), movies: data.movies })
              );
              return;
            }
          }
        }
      } catch {
        /* keep curated */
      } finally {
        clearTimeout(timer);
        setReady(true);
      }

      // Enrich any remaining gaps (e.g. Kibera Kid) via API when keys exist
      const need = hydrateList(cached || BASE).filter((m) => !m.poster).slice(0, 12);
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
    () => ({ movies, getById, search, applyPosters, source, ready }),
    [movies, getById, search, applyPosters, source, ready]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog outside CatalogContext');
  return ctx;
}
