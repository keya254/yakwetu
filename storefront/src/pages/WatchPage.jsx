import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import { track } from '../lib/track';

export default function WatchPage() {
  const { id } = useParams();
  const { getById } = useCatalog();
  const { isOwned, unlockMovie, markWatched } = useLibrary();
  const { toast } = useToast();
  const movie = getById(id);

  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const [finished, setFinished] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!movie) return undefined;
    if (!isOwned(movie.id)) return undefined;
    unlockMovie(movie);
    setPlaying(true);
    toast('Unlocked & playing — enjoy');
    timer.current = setInterval(() => {
      setPct((p) => Math.min(99, p + 1));
    }, 800);
    return () => clearInterval(timer.current);
  }, [movie?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || finished) clearInterval(timer.current);
    else if (movie && isOwned(movie.id) && !finished) {
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        setPct((p) => Math.min(99, p + 1));
      }, 800);
    }
    return () => clearInterval(timer.current);
  }, [playing, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!movie) {
    return (
      <div className="page">
        <p className="empty">Movie not found.</p>
        <Link to="/">← Home</Link>
      </div>
    );
  }

  const owned = isOwned(movie.id);

  async function finish() {
    if (finished || !owned) return;
    setFinished(true);
    setPlaying(false);
    setPct(100);
    clearInterval(timer.current);
    markWatched(movie);
    const r = await track('watch_complete', movie);
    if (r?.error) toast('Could not notify n8n: ' + r.error, true);
    else toast('Finished — SMS recommendation + Home row updated');
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      {owned ? (
        <div className="status-pill">
          {finished ? 'Finished watching' : playing ? 'Movie started' : 'Paused'}
        </div>
      ) : null}
      <h1
        style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 'clamp(28px, 6vw, 42px)',
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {movie.title}
      </h1>
      <p className="muted" style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
        {movie.genre} · {movie.year} · ★ {movie.rating}
      </p>

      <div className="player" style={{ background: movie.bg }}>
        {movie.poster ? <img className="bgimg" src={movie.poster} alt="" /> : null}
        <div className="title-mark">{movie.title}</div>
        <div className="muted" style={{ position: 'relative', zIndex: 1, fontSize: 14 }}>
          {owned
            ? finished
              ? 'Finished'
              : `${playing ? 'Playing' : 'Paused'} · ${pct}%`
            : 'Locked — buy to watch'}
        </div>
        <div className="bar" style={{ width: pct + '%' }} />
      </div>

      {!owned ? (
        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <h2 style={{ marginTop: 4 }}>Buy to unlock</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Demo prices start at KES 5. After payment this title unlocks in your library.
          </p>
          <Link className="btn btn-buy" style={{ marginTop: 14, display: 'inline-flex' }} to={`/checkout/${movie.id}`}>
            Buy to watch · KES {movie.price}
          </Link>
        </div>
      ) : (
        <>
          <div className="controls">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={finished}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="btn btn-buy"
              disabled={finished}
              onClick={finish}
            >
              {finished ? 'Finished' : 'Finish watching'}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Finish watching sends <code>watch_complete</code> to n8n (SMS recommendation) and updates
            “Because you watched…” on Home.
          </p>
          {finished ? (
            <div className="card" style={{ marginTop: 18, textAlign: 'center' }}>
              <h2>You finished the movie</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                Recommendation SMS is on the way.
              </p>
              <Link to="/#because" style={{ color: 'var(--gold)', display: 'inline-block', marginTop: 12 }}>
                See recommendations →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
