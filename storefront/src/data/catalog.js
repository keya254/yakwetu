/* Curated Kenyan catalog. TMDB IDs verified; poster_path works on image.tmdb.org without an API key. */

const IMG = 'https://image.tmdb.org/t/p';

function tmdb(path, size = 'w500') {
  if (!path) return '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${IMG}/${size}${p}`;
}

export const CATALOG = [
  {
    id: 'nairobi-half-life',
    title: 'Nairobi Half Life',
    year: 2012,
    genre: 'Crime Drama',
    price: 5,
    bg: '#1a1528',
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
    price: 5,
    bg: '#3f1e3a',
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
    price: 5,
    bg: '#2a1010',
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
    price: 5,
    bg: '#102820',
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
    price: 5,
    bg: '#2a2818',
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
    price: 5,
    bg: '#2a2430',
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
    price: 5,
    bg: '#252030',
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
    price: 5,
    bg: '#1a1a28',
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
    price: 5,
    bg: '#1a2a1a',
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
    price: 5,
    bg: '#2a1e28',
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
    price: 5,
    bg: '#2a3020',
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
    price: 5,
    bg: '#2a2220',
    runtime: '15m',
    rating: '7.0',
    director: 'Nathan Collett',
    cast: ['Godfrey Odhiambo'],
    blurb: 'A boy in Kibera chooses between crime and courage.',
    tmdb: 0,
    // No reliable TMDB asset — branded fallback only
    poster_path: '',
    backdrop_path: '',
  },
].map((m) => ({
  ...m,
  poster: m.poster || (m.poster_path ? tmdb(m.poster_path, 'w500') : ''),
  backdrop: m.backdrop || (m.backdrop_path ? tmdb(m.backdrop_path, 'w1280') : ''),
  origin: 'KE',
}));

export function getMovieById(id) {
  return CATALOG.find((m) => m.id === id) || null;
}

export function searchMovies(q, list = CATALOG) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return list.slice();
  return list.filter(
    (m) =>
      m.title.toLowerCase().includes(s) ||
      m.genre.toLowerCase().includes(s) ||
      String(m.year).includes(s) ||
      (m.cast || []).join(' ').toLowerCase().includes(s) ||
      (m.blurb || '').toLowerCase().includes(s)
  );
}

export function genresInCatalog(list = CATALOG) {
  return Array.from(new Set(list.map((m) => m.genre))).sort();
}

export function similarMovies(movie, limit = 12, list = CATALOG) {
  if (!movie) return list.slice(0, limit);
  const same = list.filter((m) => m.id !== movie.id && m.genre === movie.genre);
  const rest = list.filter((m) => m.id !== movie.id && m.genre !== movie.genre);
  return same.concat(rest).slice(0, limit);
}

export function posterUrl(m) {
  if (m && m.poster) return m.poster;
  if (m && m.poster_path) return tmdb(m.poster_path, 'w500');
  return '';
}

export const MOVIES = CATALOG;
