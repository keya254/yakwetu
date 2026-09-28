import { useEffect, useMemo, useState } from 'react';
import Hero from '../components/Hero';
import MovieRow from '../components/MovieRow';
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
  const [featured, setFeatured] = useState(null);

  const list = useMemo(() => search(query), [search, query]);

  useEffect(() => {
    if (!featured || query) {
      setFeatured(list[0] || movies[0] || null);
    }
  }, [list, movies, query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.trim()) return undefined;
    const t = setInterval(() => {
      const i = Math.floor(Math.random() * movies.length);
      setFeatured(movies[i]);
    }, 12000);
    return () => clearInterval(t);
  }, [movies, query]);

  const trending = useMemo(
    () =>
      list
        .slice()
        .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
        .slice(0, 14),
    [list]
  );
  const cheap = useMemo(() => list.filter((m) => m.price <= 10).slice(0, 14), [list]);
  const loved = useMemo(
    () => list.filter((m) => Number(m.rating || 0) >= 7).slice(0, 14),
    [list]
  );
  const buckets = useMemo(() => genreBuckets(list), [list]);

  return (
    <>
      <Hero movie={featured} />
      <section className="profile-bar">
        <div className="avatar">
          {(isLoggedIn ? user.name : 'Y').charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="who">{isLoggedIn ? user.name : 'Guest'}</div>
          <div className="sub">
            {isLoggedIn
              ? `${user.phone} · ${Object.keys(library).length} unlocked · ${watched.length} finished`
              : 'Sign in to unlock purchases & SMS recommendations'}
          </div>
        </div>
      </section>

      <div className="rows">
        {!list.length ? (
          <p className="empty">No titles match your search.</p>
        ) : (
          <>
            <MovieRow
              id="because"
              title={recommendations.headline}
              items={recommendations.items}
            />
            {ownedMovies.length ? (
              <MovieRow id="mylist" title="My List" items={ownedMovies} />
            ) : null}

            <section className="row">
              <div className="row-head">
                <h3>Browse</h3>
                <span>filters</span>
              </div>
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
            </section>

            <MovieRow id="movies" title="Trending on Yakwetu" items={trending} />
            <MovieRow title="From KES 5" items={cheap} />
            <MovieRow title="Critically loved" items={loved} />
            {buckets.map((b) => (
              <MovieRow key={b.title} title={b.title} items={b.items} />
            ))}
          </>
        )}
      </div>
    </>
  );
}
