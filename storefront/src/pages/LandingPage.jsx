import { useState } from 'react';
import { Link } from 'react-router-dom';
import MovieSection from '../components/MovieRow';
import { PosterArt } from '../components/PosterTile';
import TrendingRow from '../components/TrendingRow';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { heroSrcSet } from '../lib/images';

function formatKes(n) {
  return `KES ${Number(n || 0)}`;
}

export default function LandingPage() {
  const { movies } = useCatalog();
  const { isLoggedIn } = useAuth();
  const [heroOk, setHeroOk] = useState(true);
  const [heroLoaded, setHeroLoaded] = useState(false);

  const trending = movies
    .slice()
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 10);
  const lead = trending[0];
  const hero = lead ? heroSrcSet(lead) : { src: '' };
  const kenya = movies.filter((m) => /kenya|nairobi|maasai|kibera/i.test(
    `${m.title} ${m.blurb || ''} ${m.genre || ''}`
  ));
  const madeInKenya = kenya.length >= 4 ? kenya : movies.slice(0, 8);
  const fresh = movies.slice().reverse().slice(0, 8);

  return (
    <main>
      <section className="landing-hero">
        {hero.src && heroOk ? (
          <img
            className={`landing-hero-bg${heroLoaded ? ' is-loaded' : ''}`}
            src={hero.src}
            srcSet={hero.srcSet}
            sizes={hero.sizes}
            alt=""
            decoding="async"
            fetchPriority="high"
            onLoad={() => setHeroLoaded(true)}
            onError={() => setHeroOk(false)}
          />
        ) : null}
        <div className="landing-hero-shade" />
        <div className="landing-hero-inner">
          <div>
            <p className="landing-kicker">Kenyan &amp; pan-African cinema</p>
            <h1>
              Our stories.
              <br />
              Pay per title.
            </h1>
            <p className="landing-lead">
              Films from Nairobi to the Coast, from {formatKes(5)}. No subscription — buy the
              film you want and watch it tonight.
            </p>
            <div className="landing-cta">
              <Link
                to={isLoggedIn ? '/browse' : '/login'}
                className="btn btn-buy btn-lg"
              >
                {isLoggedIn ? 'Go to your films' : 'Join free'} →
              </Link>
              <a href="#trending" className="btn btn-ghost btn-lg">
                See what’s trending
              </a>
            </div>
          </div>

          {lead ? (
            <Link to={`/movie/${lead.id}`} className="lead-card">
              <div style={{ width: 176, flexShrink: 0 }}>
                <PosterArt movie={lead} showBadges={false} priority />
              </div>
              <div className="lead-meta">
                <p className="lead-rank">#1 this week</p>
                <p className="lead-title">{lead.title}</p>
                <p className="lead-facts">
                  {[lead.year, lead.genre?.split(/[•,/|]/)[0], lead.runtime]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="lead-price">{formatKes(lead.price)}</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <div className="catalog-rows">
        <TrendingRow movies={trending} />
        <MovieSection
          title="Made in Kenya"
          description="From Nairobi’s streets to the shores of Lake Victoria."
          items={madeInKenya}
        />
        <MovieSection title="New releases" description="Just landed on Yakwetu." items={fresh} />
      </div>
    </main>
  );
}
