import { Link } from 'react-router-dom';
import MovieSection from '../components/MovieRow';
import { PosterArt } from '../components/PosterTile';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';

function formatKes(n) {
  return `KES ${Number(n || 0)}`;
}

export default function MyFilmsPage() {
  const { isLoggedIn } = useAuth();
  const { library, ownedMovies, becauseYouBought, recommendations, refreshRecommendations } =
    useLibrary();
  const totalSpent = ownedMovies.reduce((sum, m) => {
    const entry = library[m.id];
    return sum + Number(entry?.price ?? m.price ?? 0);
  }, 0);

  return (
    <main>
      <div className="my-films">
        <h1>My films</h1>
        <p className="lede">
          {ownedMovies.length
            ? `${ownedMovies.length} film${ownedMovies.length === 1 ? '' : 's'} in your library · ${formatKes(totalSpent)} spent, yours to keep.`
            : 'Films you buy live here, yours to keep.'}
        </p>

        {ownedMovies.length === 0 ? (
          <div className="empty-library">
            <div className="icon" aria-hidden>
              ▤
            </div>
            <p style={{ marginTop: 16, fontWeight: 600, color: 'var(--text)' }}>
              Nothing here yet
            </p>
            <p>Buy a film once with M-Pesa or card and it stays in your library.</p>
            <Link to="/browse" className="btn btn-buy">
              Browse films
            </Link>
          </div>
        ) : (
          <ul className="library-grid">
            {ownedMovies.map((movie) => {
              const entry = library[movie.id];
              const when = entry?.unlockedAt
                ? new Date(entry.unlockedAt).toLocaleDateString('en-KE', {
                    day: 'numeric',
                    month: 'short',
                  })
                : '';
              return (
                <li key={movie.id}>
                  <Link to={`/movie/${movie.id}`}>
                    <PosterArt movie={movie} showBadges={false} />
                    <p className="title">{movie.title}</p>
                  </Link>
                  <p className="when">
                    {when}
                    {entry?.price != null ? ` · ${formatKes(entry.price)}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(recommendations?.items?.length || becauseYouBought?.items?.length) ? (
        <div style={{ paddingBottom: 48 }}>
          {recommendations?.items?.length ? (
            <MovieSection
              id="profile-recs"
              title={recommendations.headline || 'Recommended for you'}
              description={
                isLoggedIn
                  ? 'Saved on your profile from what you watch and buy.'
                  : 'Picked from what you watch on this device.'
              }
              items={recommendations.items}
            />
          ) : null}
          {becauseYouBought?.items?.length ? (
            <MovieSection
              title={becauseYouBought.headline}
              description="Anchored on your latest purchase."
              items={becauseYouBought.items}
            />
          ) : null}
          {isLoggedIn ? (
            <div style={{ padding: '0 20px 24px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => refreshRecommendations()}
              >
                Refresh recommendations
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
