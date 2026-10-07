import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { similarMovies } from '../data/catalog';
import { useAuth } from './AuthContext';
import { useCatalog } from './CatalogContext';
import { loadLibrary, loadWatched, saveLibrary, saveWatched } from '../lib/storage';

const LibraryContext = createContext(null);

function mapRecItems(items, getById, movies) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const id = item.movieId || item.id;
      const fromCat = getById(id) || movies.find((m) => m.id === id);
      if (fromCat) {
        return {
          ...fromCat,
          reason: item.reason || null,
        };
      }
      if (!id) return null;
      return {
        id,
        title: item.title || id,
        genre: item.genre || (item.genres && item.genres[0]) || '',
        price: item.priceKes || item.price || 5,
        poster: item.poster || item.posterUrl || '',
        poster_path: item.poster_path || null,
        reason: item.reason || null,
      };
    })
    .filter(Boolean);
}

export function LibraryProvider({ children }) {
  const { movies, getById } = useCatalog();
  const { token, isLoggedIn } = useAuth();
  const [library, setLibrary] = useState(() => loadLibrary());
  const [watched, setWatched] = useState(() => loadWatched());
  const [serverRecs, setServerRecs] = useState(null);

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

  const localRecommendations = useMemo(() => {
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

  /** Prefer server profile recs when signed in; fall back to local taste. */
  const recommendations = useMemo(() => {
    if (serverRecs?.items?.length) {
      return {
        headline: serverRecs.headline || 'Recommended for you',
        items: mapRecItems(serverRecs.items, getById, movies),
        source: 'server',
        updatedAt: serverRecs.updatedAt || null,
      };
    }
    return { ...localRecommendations, source: 'local' };
  }, [serverRecs, localRecommendations, getById, movies]);

  /** Upsell row anchored on the most recent purchase (stateful library). */
  const becauseYouBought = useMemo(() => {
    const entries = Object.values(library).sort((a, b) =>
      String(b.unlockedAt || '').localeCompare(String(a.unlockedAt || ''))
    );
    if (!entries.length) return null;
    const last = entries[0];
    const seed = getById(last.id) || last;
    const ownedIds = new Set(Object.keys(library));
    const items = similarMovies(seed, 12, movies).filter((m) => !ownedIds.has(m.id));
    if (!items.length) return null;
    return {
      headline: `Because you bought ${seed.title}`,
      items,
      anchorTitle: seed.title,
    };
  }, [library, movies, getById]);

  const refreshRecommendations = useCallback(async () => {
    if (!token || !isLoggedIn) {
      setServerRecs(null);
      return null;
    }
    try {
      const r = await fetch('/api/library/recommendations?refresh=1&limit=8', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      const data = await r.json();
      const next = {
        headline: data.headline,
        items: data.items || [],
        updatedAt: data.updatedAt,
        mode: data.mode,
        anchor: data.anchor,
      };
      setServerRecs(next);
      return next;
    } catch {
      return null;
    }
  }, [token, isLoggedIn]);

  useEffect(() => {
    if (!token || !isLoggedIn) {
      setServerRecs(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/library/recommendations?limit=8', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (!cancelled) {
          setServerRecs({
            headline: data.headline,
            items: data.items || [],
            updatedAt: data.updatedAt,
            mode: data.mode,
            anchor: data.anchor,
          });
        }
      } catch {
        /* keep local fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isLoggedIn, watched.length, ownedMovies.length]);

  const value = useMemo(
    () => ({
      library,
      watched,
      isOwned,
      unlockMovie,
      markWatched,
      ownedMovies,
      recommendations,
      becauseYouBought,
      refreshRecommendations,
    }),
    [
      library,
      watched,
      isOwned,
      unlockMovie,
      markWatched,
      ownedMovies,
      recommendations,
      becauseYouBought,
      refreshRecommendations,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary outside LibraryProvider');
  return ctx;
}
