'use strict';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const posterCache = new Map();
const kenyaCatalogCache = { at: 0, movies: [] };
const KENYA_CACHE_MS = 6 * 60 * 60 * 1000;
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const BGS = [
  '#1a1528', '#3f1e3a', '#2a1010', '#102820', '#2a2818', '#2a2430',
  '#252030', '#1a1a28', '#1a2a1a', '#201818', '#1e2838', '#2a1e28',
];

/** Verified Kenyan titles — poster_path works on image.tmdb.org without an API key. */
const CURATED = [
  {
    id: 'nairobi-half-life',
    title: 'Nairobi Half Life',
    year: 2012,
    genre: 'Crime Drama',
    runtime: '1h 36m',
    rating: '7.4',
    director: 'David Tosh Gitonga',
    cast: ['Joseph Wairimu', 'Olwenya Maina', 'Nancy Wanjiru'],
    blurb: 'A young actor chases fame and falls into Nairobi’s underworld.',
    tmdb: 130737,
    imdb: 'tt2187153',
    poster_path: '/1QYW51WrwmSsJBm1y9ZkdEeHp6q.jpg',
    backdrop_path: '/xhEkKDeFCBxK7p3Lo7p1RRZbN4Z.jpg',
  },
  {
    id: 'rafiki',
    title: 'Rafiki',
    year: 2018,
    genre: 'Romance Drama',
    runtime: '1h 23m',
    rating: '6.8',
    director: 'Wanuri Kahiu',
    cast: ['Samantha Mugatsia', 'Sheila Munyiva', 'Jimmy Gathu'],
    blurb: 'Two young women fall in love against family and political pressure.',
    tmdb: 517987,
    imdb: 'tt8286894',
    poster_path: '/letzgJyVmYYahcYNCYhzn75TyyE.jpg',
    backdrop_path: '/zMiQpwUGpdnC6goSl5ulL7kmkMg.jpg',
  },
  {
    id: '40-sticks',
    title: '40 Sticks',
    year: 2020,
    genre: 'Crime Thriller',
    runtime: '1h 21m',
    rating: '5.9',
    director: 'Orlando Eastwood',
    cast: ['Robert Agengo', 'Andreas Steiner', 'Muthoni Gathecha'],
    blurb: 'Prisoners crash in the forest — and someone starts hunting them.',
    tmdb: 767800,
    imdb: 'tt12851524',
    poster_path: '/yx5W63SoLh7n4pEgxqIITSQ1dFv.jpg',
    backdrop_path: '/ccsvwEVp0OYFEfcRksSfvDAxQH1.jpg',
  },
  {
    id: 'pumzi',
    title: 'Pumzi',
    year: 2010,
    genre: 'Sci-Fi',
    runtime: '22m',
    rating: '7.1',
    director: 'Wanuri Kahiu',
    cast: ['Kudzani Moswela', 'Leo Ojiambo'],
    blurb: 'In a water-scarce future, a curator risks everything for a seed.',
    tmdb: 45167,
    imdb: 'tt1552211',
    poster_path: '/i0kMucYXPyWhEqp5EOIXDmbW1Sw.jpg',
    backdrop_path: '/3hvCIWwPxjnvas6pB3FD8lCRwqh.jpg',
  },
  {
    id: 'the-first-grader',
    title: 'The First Grader',
    year: 2010,
    genre: 'Drama',
    runtime: '1h 43m',
    rating: '7.4',
    director: 'Justin Chadwick',
    cast: ['Oliver Litondo', 'Naomie Harris', 'Tony Kgoroge'],
    blurb: 'An 84-year-old Mau Mau veteran demands his right to school.',
    tmdb: 47559,
    imdb: 'tt1361815',
    poster_path: '/jstfYxEYMFfSO6tQaYL6O0AMUol.jpg',
    backdrop_path: '/tQRygoT0GWUvlZe0mcTAKf9RDbb.jpg',
  },
  {
    id: 'something-necessary',
    title: 'Something Necessary',
    year: 2013,
    genre: 'Drama',
    runtime: '1h 25m',
    rating: '6.9',
    director: 'Judy Kibinge',
    cast: ['Susan Wanjiru', 'Anne Wanjiru'],
    blurb: 'A lawyer fights for justice after post-election violence.',
    tmdb: 173228,
    imdb: 'tt2912338',
    poster_path: '/6tVNU7HFyDE4V6NgWW3ZoeUFCkW.jpg',
    backdrop_path: '/sjOBNy22KF5ciOlHqp7JUbt4ZfG.jpg',
  },
  {
    id: 'from-a-whisper',
    title: 'From a Whisper',
    year: 2008,
    genre: 'Drama',
    runtime: '1h 19m',
    rating: '7.0',
    director: 'Wanuri Kahiu',
    cast: ['Ken Ambani', 'Godwin Mwampembe'],
    blurb: 'Lives collide after the 1998 embassy bombing.',
    tmdb: 351480,
    imdb: 'tt1396223',
    poster_path: '/xhetu6gaSUJNZ4k6jJeqc7XrAy7.jpg',
    backdrop_path: '/xhetu6gaSUJNZ4k6jJeqc7XrAy7.jpg',
  },
  {
    id: 'kati-kati',
    title: 'Kati Kati',
    year: 2016,
    genre: 'Drama',
    runtime: '1h 15m',
    rating: '6.7',
    director: 'Mbithi Masya',
    cast: ['Nyokabi Gethaiga', 'Elsaphan Njora'],
    blurb: 'A young woman wakes in a purgatory of unfinished lives.',
    tmdb: 413602,
    imdb: 'tt5795086',
    poster_path: '/AflWVVqpDQ7ZswuYNEKjt5M0bRY.jpg',
    backdrop_path: '/xv8N6WKH9z7FGulKCdtp4sTXKqM.jpg',
  },
  {
    id: 'veve',
    title: 'Veve',
    year: 2014,
    genre: 'Crime Drama',
    runtime: '1h 34m',
    rating: '6.5',
    director: "Ng'endo Mukii",
    cast: ['Lowry Odhiambo', 'Lizz Njagah'],
    blurb: 'Miraa trade, politics, and impossible choices.',
    tmdb: 314520,
    poster_path: '/sXJL1egdjI5aVncHUXGppXN6Wbm.jpg',
    backdrop_path: '/q27kY1EQaktzml82rPiqYyWq2UI.jpg',
  },
  {
    id: 'stories-of-our-lives',
    title: 'Stories of Our Lives',
    year: 2014,
    genre: 'Drama',
    runtime: '1h 2m',
    rating: '7.2',
    director: 'Jim Chuchu',
    cast: ['Ensemble cast'],
    blurb: 'Anthology of queer Kenyan stories, raw and intimate.',
    tmdb: 287625,
    poster_path: '/uHa34QtV3B5zDMUozKEdkkQJy2G.jpg',
    backdrop_path: '/5CY5pE3W3mZmROe5jzoM2Z0hbmR.jpg',
  },
  {
    id: 'saikati',
    title: 'Saïkati',
    year: 1992,
    genre: 'Romance Adventure',
    runtime: '1h 34m',
    rating: '6.7',
    director: 'Anne Mungai',
    cast: ['Susan Achieng'],
    blurb: 'A Maasai woman forges her path between tradition and city.',
    tmdb: 539406,
    poster_path: '/fhhOFKFXqAdy4Q3Leosl4jekCiA.jpg',
    backdrop_path: '/fhhOFKFXqAdy4Q3Leosl4jekCiA.jpg',
  },
  {
    id: 'kibera-kid',
    title: 'Kibera Kid',
    year: 2006,
    genre: 'Short Drama',
    runtime: '15m',
    rating: '7.0',
    director: 'Nathan Collett',
    cast: ['Godfrey Odhiambo'],
    blurb: 'A boy in Kibera chooses between crime and courage.',
    tmdb: 0,
    poster_path: '',
    backdrop_path: '',
  },
];

function img(path, size) {
  if (!path) return '';
  const p = String(path).startsWith('/') ? path : `/${path}`;
  return `${TMDB_IMG}/${size}${p}`;
}

function curatedMovies() {
  return CURATED.map((m, i) => ({
    ...m,
    price: 5,
    bg: BGS[i % BGS.length],
    poster: img(m.poster_path, 'w500'),
    backdrop: img(m.backdrop_path || m.poster_path, 'w1280'),
    origin: 'KE',
  }));
}

async function fetchJson(url, headers = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'YakwetuCatalog/1.1', Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!r.ok) {
      console.warn('catalog fetch', r.status, url.replace(/api_key=[^&]+/, 'api_key=***'));
      return null;
    }
    return r.json();
  } catch (e) {
    console.warn('catalog fetch error', e.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

function slugify(title) {
  return (
    String(title || 'movie')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'movie'
  );
}

function formatRuntime(mins) {
  const n = Number(mins) || 0;
  if (!n) return '';
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function tmdbAuthHeaders() {
  // Support classic api_key query OR v4 read access token in Authorization
  if (TMDB_API_KEY.startsWith('eyJ')) {
    return { Authorization: `Bearer ${TMDB_API_KEY}` };
  }
  return {};
}

function withKey(url) {
  if (!TMDB_API_KEY || TMDB_API_KEY.startsWith('eyJ')) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}api_key=${encodeURIComponent(TMDB_API_KEY)}`;
}

async function enrichOne(item) {
  const id = item.id;
  if (posterCache.has(id)) return posterCache.get(id);

  // Prefer curated paths (instant, no network)
  const curated = CURATED.find((c) => c.id === id || (item.tmdb && c.tmdb === item.tmdb));
  if (curated && curated.poster_path) {
    const url = img(curated.poster_path, 'w500');
    posterCache.set(id, url);
    return url;
  }

  if (TMDB_API_KEY) {
    try {
      let path = '';
      const headers = tmdbAuthHeaders();
      if (item.tmdb) {
        const d = await fetchJson(withKey(`https://api.themoviedb.org/3/movie/${item.tmdb}`), headers);
        path = d && d.poster_path;
      }
      if (!path && item.title) {
        const q = encodeURIComponent(item.title);
        const y = item.year ? `&year=${item.year}` : '';
        const s = await fetchJson(
          withKey(`https://api.themoviedb.org/3/search/movie?query=${q}${y}`),
          headers
        );
        const hit = (s && s.results && s.results[0]) || null;
        path = hit && hit.poster_path;
      }
      if (path) {
        const url = img(path, 'w500');
        posterCache.set(id, url);
        return url;
      }
    } catch (e) {
      console.warn('tmdb enrich', id, e.message || e);
    }
  }

  if (OMDB_API_KEY) {
    try {
      let url = '';
      if (item.imdb) {
        const d = await fetchJson(
          `https://www.omdbapi.com/?i=${encodeURIComponent(item.imdb)}&apikey=${OMDB_API_KEY}`
        );
        if (d && d.Poster && d.Poster !== 'N/A') url = d.Poster;
      }
      if (!url && item.title) {
        const y = item.year ? `&y=${item.year}` : '';
        const d = await fetchJson(
          `https://www.omdbapi.com/?t=${encodeURIComponent(item.title)}${y}&apikey=${OMDB_API_KEY}`
        );
        if (d && d.Poster && d.Poster !== 'N/A') url = d.Poster;
      }
      if (url) {
        posterCache.set(id, url);
        return url;
      }
    } catch (e) {
      console.warn('omdb enrich', id, e.message || e);
    }
  }

  return '';
}

async function fetchKenyanMovies(limit = 12) {
  if (!TMDB_API_KEY) return null;
  const now = Date.now();
  if (kenyaCatalogCache.movies.length && now - kenyaCatalogCache.at < KENYA_CACHE_MS) {
    return kenyaCatalogCache.movies.slice(0, limit);
  }

  const headers = tmdbAuthHeaders();
  const discover = await fetchJson(
    withKey(
      'https://api.themoviedb.org/3/discover/movie?with_origin_country=KE&sort_by=popularity.desc&include_adult=false&page=1'
    ),
    headers,
    10000
  );
  let results = (discover && discover.results) || [];

  if (results.length < 6) {
    const search = await fetchJson(
      withKey(
        `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent('Kenya')}&include_adult=false`
      ),
      headers,
      10000
    );
    const extra = (search && search.results) || [];
    const seen = new Set(results.map((r) => r.id));
    for (const r of extra) {
      if (!seen.has(r.id)) {
        results.push(r);
        seen.add(r.id);
      }
    }
  }

  // Seed with curated hits so known Kenyan classics always appear with correct IDs
  const curatedIds = new Set(CURATED.map((c) => c.tmdb).filter(Boolean));
  for (const c of CURATED) {
    if (c.tmdb && !results.some((r) => r.id === c.tmdb)) {
      results.unshift({
        id: c.tmdb,
        title: c.title,
        overview: c.blurb,
        poster_path: c.poster_path,
        backdrop_path: c.backdrop_path,
        release_date: `${c.year}-01-01`,
        vote_average: Number(c.rating) || 0,
      });
    }
  }
  // Prefer curated IDs first
  results.sort((a, b) => Number(curatedIds.has(b.id)) - Number(curatedIds.has(a.id)));

  results = results.slice(0, Math.min(limit, 16));
  const movies = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const known = CURATED.find((c) => c.tmdb === r.id);
    const detail = await fetchJson(
      withKey(`https://api.themoviedb.org/3/movie/${r.id}?append_to_response=credits`),
      headers,
      8000
    );
    const d = detail || r;
    const genres = (d.genres || []).map((g) => g.name);
    const genre = (known && known.genre) || genres.slice(0, 2).join(' ') || 'Drama';
    const crew = (d.credits && d.credits.crew) || [];
    const cast =
      (known && known.cast) ||
      ((d.credits && d.credits.cast) || []).slice(0, 4).map((c) => c.name);
    const director =
      (known && known.director) ||
      (crew.find((c) => c.job === 'Director') || {}).name ||
      'Kenyan cinema';
    const year = String(d.release_date || r.release_date || '').slice(0, 4);
    const posterPath = d.poster_path || r.poster_path || (known && known.poster_path) || '';
    const backdropPath =
      d.backdrop_path || r.backdrop_path || (known && known.backdrop_path) || posterPath;

    movies.push({
      id: (known && known.id) || slugify(d.title || r.title) || `tmdb-${r.id}`,
      title: d.title || r.title,
      year: year ? Number(year) : null,
      genre,
      price: 5,
      bg: BGS[i % BGS.length],
      runtime: formatRuntime(d.runtime) || (known && known.runtime) || '',
      rating: d.vote_average ? String(Number(d.vote_average).toFixed(1)) : (known && known.rating) || '—',
      director,
      cast: cast.length ? cast : ['Cast TBA'],
      blurb: d.overview || r.overview || (known && known.blurb) || 'A Kenyan story on Yakwetu.',
      tmdb: r.id,
      imdb: (known && known.imdb) || '',
      poster_path: posterPath,
      backdrop_path: backdropPath,
      poster: img(posterPath, 'w500'),
      backdrop: img(backdropPath, 'w1280'),
      origin: 'KE',
    });
  }

  if (movies.length) {
    kenyaCatalogCache.at = now;
    kenyaCatalogCache.movies = movies;
  }
  return movies;
}

function mountCatalog(app) {
  app.get('/api/catalog/config', (_req, res) => {
    res.json({
      tmdb: Boolean(TMDB_API_KEY),
      omdb: Boolean(OMDB_API_KEY),
      kenya_endpoint: true,
      curated: CURATED.length,
    });
  });

  app.post('/api/catalog/enrich', async (req, res) => {
    try {
      const titles = Array.isArray(req.body && req.body.titles)
        ? req.body.titles.slice(0, 12)
        : [];
      const posters = {};
      for (let i = 0; i < titles.length; i += 6) {
        const batch = titles.slice(i, i + 6);
        const results = await Promise.all(batch.map((t) => enrichOne(t)));
        batch.forEach((t, idx) => {
          if (results[idx]) posters[t.id] = results[idx];
        });
      }
      res.json({ posters, sources: { tmdb: Boolean(TMDB_API_KEY), omdb: Boolean(OMDB_API_KEY) } });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/catalog/kenya', async (req, res) => {
    try {
      const limit = Math.min(20, Math.max(4, Number(req.query.limit) || 12));
      if (!TMDB_API_KEY) {
        const movies = curatedMovies().slice(0, limit);
        return res.json({
          ok: true,
          source: 'curated',
          warning: 'TMDB_API_KEY not set — serving verified curated posters',
          count: movies.length,
          movies,
        });
      }
      const movies = await fetchKenyanMovies(limit);
      if (!movies || !movies.length) {
        const fallback = curatedMovies().slice(0, limit);
        return res.json({
          ok: true,
          source: 'curated',
          warning: 'TMDB live fetch empty — serving curated',
          count: fallback.length,
          movies: fallback,
        });
      }
      res.json({ ok: true, source: 'tmdb', count: movies.length, movies });
    } catch (e) {
      const fallback = curatedMovies().slice(0, 12);
      res.status(200).json({
        ok: true,
        source: 'curated',
        error: String(e.message || e),
        count: fallback.length,
        movies: fallback,
      });
    }
  });
}

module.exports = { mountCatalog, TMDB_API_KEY, OMDB_API_KEY, CURATED, curatedMovies, img };
