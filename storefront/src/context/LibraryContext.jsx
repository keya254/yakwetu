import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { similarMovies } from '../data/catalog';
import { useCatalog } from './CatalogContext';
import { loadLibrary, loadWatched, saveLibrary, saveWatched } from '../lib/storage';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { movies, getById } = useCatalog();
  const [library, setLibrary] = useState(() => loadLibrary());
  const [watched, setWatched] = useState(() => loadWatched());

  const isOwned = useCallback((id) => Boolean(library[id]), [library]);

  const unlockMovie = useCallback((movie) => {
    if (!movie?.id) return;
    setLibrary((prev) => {
      const next = {
        ...prev,
        [movie.id]: {
          id: movie.id,
          title: movie.title,
          genre: movie.genre,
          price: movie.price || 5,
          unlockedAt: new Date().toISOString(),
        },
      };
      saveLibrary(next);
      return next;
    });
  }, []);

  const markWatched = useCallback((movie) => {
    if (!movie?.id) return;
    setWatched((prev) => {
      const next = [
        {
          id: movie.id,
          title: movie.title,
          genre: movie.genre,
          at: new Date().toISOString(),
        },
        ...prev.filter((w) => w.id !== movie.id),
      ].slice(0, 40);
      saveWatched(next);
      return next;
    });
  }, []);

  const ownedMovies = useMemo(
    () =>
      Object.keys(library)
        .map((id) => getById(id))
        .filter(Boolean),
    [library, getById]
  );

  const recommendations = useMemo(() => {
    if (!watched.length) {
      return {
        headline: 'Recommended for you',
        items: movies.slice(0, 12),
      };
    }
    const last = watched[0];
    const seed = getById(last.id) || last;
    const watchedIds = new Set(watched.map((w) => w.id));
    let items = similarMovies(seed, 16, movies).filter((m) => !watchedIds.has(m.id));
    if (items.length < 8) {
      for (const m of movies) {
        if (watchedIds.has(m.id) || items.some((x) => x.id === m.id)) continue;
        items.push(m);
        if (items.length >= 12) break;
      }
    }
    return {
      headline: `Because you watched ${last.title}`,
      items: items.slice(0, 12),
    };
  }, [watched, movies, getById]);

  const value = useMemo(
    () => ({
      library,
      watched,
      isOwned,
      unlockMovie,
      markWatched,
      ownedMovies,
      recommendations,
    }),
    [library, watched, isOwned, unlockMovie, markWatched, ownedMovies, recommendations]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary outside LibraryProvider');
  return ctx;
}
