import { useMemo, useState } from 'react';
import MovieSection from '../components/MovieRow';
import TrendingRow from '../components/TrendingRow';
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
    Drama: ['Drama', 'Family Drama', 'Music Drama', 'Short Drama', 'Drama Series', 'Crime Drama', 'Romance Drama', 'Comedy Drama'],
    Thrillers: [
      'Thriller',
      'Psych Thriller',
      'Action Thriller',
      'Medical Thriller',
      'Eco Thriller',
      'Coastal Thriller',
      'Comedy Thriller',
      'Crime Thriller',
    ],
    Comedy: ['Comedy', 'Family Comedy', 'Comedy Drama'],
    Romance: ['Romance', 'Romance Drama', 'Romance Adventure'],
    Horror: ['Horror'],
    'Sci-Fi & Docs': ['Sci-Fi', 'Wildlife Doc', 'Nature Doc'],
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

function firstName(name) {
  return String(name || 'friend').trim().split(/\s+/)[0];
}

export default function HomePage({ query, setQuery }) {
  const { search } = useCatalog();
  const { user, isLoggedIn } = useAuth();
  const { ownedMovies, recommendations, becauseYouBought } = useLibrary();
  const [chip, setChip] = useState('');

  const activeQuery = query || chip;
  const list = useMemo(() => search(activeQuery), [search, activeQuery]);

  const trending = useMemo(
    () =>
      list
        .slice()
        .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
        .slice(0, 10),
    [list]
  );
  const buckets = useMemo(() => genreBuckets(list), [list]);
  const kenya = useMemo(() => list.slice(0, 10), [list]);
  const fresh = useMemo(() => list.slice().reverse().slice(0, 10), [list]);

  return (
    <main>
      <div className="browse-intro">
        <h1>
          {isLoggedIn ? `Karibu, ${firstName(user?.name)}.` : 'Browse films'}
        </h1>
        <p>Pick a film. Pay once, it’s yours to watch.</p>
      </div>

      <div className="catalog-rows">
        <div className="filters">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`chip${(query || chip).toLowerCase() === c.q ? ' on' : ''}`}
              onClick={() => {
                setChip(c.q);
                setQuery(c.q);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {!list.length ? (
          <p className="empty">No titles match your search.</p>
        ) : (
          <>
            <MovieSection
              id="because"
              title={recommendations.headline}
              description="Picked from what you watch."
              items={recommendations.items}
            />
            {becauseYouBought?.items?.length ? (
              <MovieSection
                title={becauseYouBought.headline}
                description="Anchored on your latest purchase."
                items={becauseYouBought.items}
              />
            ) : null}
            {ownedMovies.length ? (
              <MovieSection id="mylist" title="My films" items={ownedMovies} />
            ) : null}
            <TrendingRow movies={trending} />
            <MovieSection title="Made in Kenya" items={kenya} />
            <MovieSection title="New releases" items={fresh} />
            {buckets.map((b) => (
              <MovieSection key={b.title} title={b.title} items={b.items} />
            ))}
          </>
        )}
      </div>
    </main>
  );
}
