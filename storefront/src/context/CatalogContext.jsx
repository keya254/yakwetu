import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CATALOG as BASE } from '../data/catalog';
import { loadPosterCache, savePosterCache } from '../lib/storage';

const CatalogContext = createContext(null);

function withCachedPosters() {
  const cached = loadPosterCache();
  return BASE.map((m) => ({
    ...m,
    poster: m.poster || cached[m.id] || '',
  }));
}

export function CatalogProvider({ children }) {
  const [movies, setMovies] = useState(withCachedPosters);

  const getById = useCallback(
    (id) => movies.find((m) => m.id === id) || null,
    [movies]
  );

  const search = useCallback(
    (q) => {
      const s = String(q || '').trim().toLowerCase();
      if (!s) return movies;
      return movies.filter(
        (m) =>
          m.title.toLowerCase().includes(s) ||
          m.genre.toLowerCase().includes(s) ||
          String(m.year).includes(s) ||
          (m.cast || []).join(' ').toLowerCase().includes(s) ||
          (m.blurb || '').toLowerCase().includes(s)
      );
    },
    [movies]
  );

  const applyPosters = useCallback((map) => {
    if (!map || !Object.keys(map).length) return;
    const cached = { ...loadPosterCache(), ...map };
    savePosterCache(cached);
    setMovies((prev) =>
      prev.map((m) => (map[m.id] ? { ...m, poster: map[m.id] } : m))
    );
  }, []);

  useEffect(() => {
    const need = movies.filter((m) => !m.poster).slice(0, 12);
    if (!need.length) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const run = async () => {
      try {
        const r = await fetch('/api/catalog/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
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
      } finally {
        clearTimeout(timer);
      }
    };

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => run(), { timeout: 2000 });
      return () => {
        cancelIdleCallback(id);
        ctrl.abort();
        clearTimeout(timer);
      };
    }
    const t = setTimeout(run, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      clearTimeout(timer);
    };
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ movies, getById, search, applyPosters }),
    [movies, getById, search, applyPosters]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog outside CatalogContext');
  return ctx;
}
