import { useEffect, useMemo, useState } from 'react';
import Hero from '../components/Hero';
import MovieSection from '../components/MovieRow';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useLibrary } from '../context/LibraryContext';

const CHIPS = [
  { label: 'All', q: '' },
  { label: 'Crime', q: 'crime' },
  { label: 'Romance', q: 'romance' },
  { label: 'Comedy', q: 'comedy' },
  { label: 'Horror', q: 'horror' },
  { label: 'Docs', q: 'doc' },
  { label: 'Thriller', q: 'thriller' },
];

function genreBuckets(list) {
  const map = {
    Crime: ['Crime Drama', 'Crime Thriller'],
    Thriller: [
      'Thriller',
      'Psych Thriller',
      'Action Thriller',
      'Medical Thriller',
      'Eco Thriller',
      'Coastal Thriller',
      'Comedy Thriller',
    ],
    Drama: ['Drama', 'Family Drama', 'Music Drama', 'Short Drama', 'Drama Series'],
    Romance: ['Romance', 'Romance Drama', 'Romance Adventure'],
    Comedy: ['Comedy', 'Family Comedy', 'Comedy Drama'],
    Horror: ['Horror'],
    'Sci-Fi & Docs': ['Sci-Fi', 'Wildlife Doc', 'Nature Doc'],
    Action: ['Action', 'Action Thriller'],
  };
  const used = new Set();
  const rows = [];
  Object.keys(map).forEach((label) => {
    const items = list.filter((m) => map[label].includes(m.genre));
    items.forEach((m) => used.add(m.id));
    if (items.length >= 2) rows.push({ title: label, items });
  });
  const rest = list.filter((m) => !used.has(m.id));
  if (rest.length) rows.push({ title: 'More titles', items: rest });
  return rows;
}

export default function HomePage({ query, setQuery }) {
  const { search, movies } = useCatalog();
  const { user, isLoggedIn } = useAuth();
  const { ownedMovies, recommendations, watched, library } = useLibrary();
  const [slide, setSlide] = useState(0);

  const list = useMemo(() => search(query), [search, query]);

  const heroSlides = useMemo(() => {
    const base = query.trim() ? list : movies;
    return base
      .slice()
      .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
      .slice(0, 5);
  }, [movies, list, query]);

  useEffect(() => {
    setSlide(0);
  }, [query, heroSlides.map((m) => m.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.trim() || heroSlides.length < 2) return undefined;
    const t = setInterval(() => {
      setSlide((i) => (i + 1) % heroSlides.length);
    }, 7000);
    return () => clearInterval(t);
  }, [heroSlides, query]);

  const trending = useMemo(
    () =>
      list
        .slice()
        .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)),
    [list]
  );
  const loved = useMemo(
    () => list.filter((m) => Number(m.rating || 0) >= 7),
    [list]
  );
  const buckets = useMemo(() => genreBuckets(list), [list]);

  return (
    <>
      <Hero
        slides={heroSlides}
        activeIndex={Math.min(slide, Math.max(heroSlides.length - 1, 0))}
        onSelect={setSlide}
      />

      <section className="profile-bar">
        <div className="avatar">
          {(isLoggedIn ? user.name : 'Y').charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="who">{isLoggedIn ? user.name : 'Guest'}</div>
          <div className="sub">
            {isLoggedIn
              ? `${user.phone} · ${Object.keys(library).length} unlocked · ${watched.length} finished · all titles KES 5`
              : 'All titles KES 5 · sign in to buy & get SMS recs'}
          </div>
        </div>
      </section>

      <div className="catalog">
        {!list.length ? (
          <p className="empty">No titles match your search.</p>
        ) : (
          <>
            <div className="filters">
              {CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className={`chip${query.toLowerCase() === c.q ? ' on' : ''}`}
                  onClick={() => setQuery(c.q)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <MovieSection
              id="because"
              title={recommendations.headline}
              items={recommendations.items}
            />
            {ownedMovies.length ? (
              <MovieSection id="mylist" title="My List" items={ownedMovies} />
            ) : null}
            <MovieSection id="movies" title="Trending on Yakwetu" items={trending} />
            <MovieSection title="Critically loved" items={loved} />
            {buckets.map((b) => (
              <MovieSection key={b.title} title={b.title} items={b.items} />
            ))}
          </>
        )}
      </div>
    </>
  );
}
