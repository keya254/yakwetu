import { Link } from 'react-router-dom';
import { PosterArt } from './PosterTile';

/** Top titles ranked with a big outlined numeral behind each poster. */
export default function TrendingRow({ movies, title = 'Trending this week' }) {
  if (!movies?.length) return null;
  return (
    <section className="section" id="trending">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p className="section-desc">What viewers are buying right now.</p>
        </div>
      </div>
      <div className="no-scrollbar">
        <ol className="trending-track">
          {movies.slice(0, 10).map((movie, index) => (
            <li key={movie.id} className="trending-item">
              <span className="trending-num" aria-hidden>
                {index + 1}
              </span>
              <Link
                to={`/movie/${movie.id}`}
                className="trending-poster"
                aria-label={`${index + 1}. ${movie.title}, KES ${movie.price ?? 5}`}
              >
                <PosterArt movie={movie} showBadges={false} />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
