import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { track } from '../lib/track';

const PAY_MARKS = ['M-PESA', 'Airtel Money', 'Visa', 'Mastercard'];

function formatKes(n) {
  return `KES ${Number(n || 0)}`;
}

export function PurchaseCard({ movie, className = '' }) {
  const { isLoggedIn } = useAuth();
  const { isOwned, library } = useLibrary();
  const navigate = useNavigate();
  const owned = isOwned(movie.id);
  const ownedSince = library[movie.id]?.unlockedAt;

  const facts = useMemo(
    () =>
      [
        'HD, on your phone, laptop or TV',
        movie.runtime ? `${movie.runtime}, watch at your own pace` : 'Watch at your own pace',
        (movie.cast || []).length ? (movie.cast || []).slice(0, 2).join(', ') : null,
      ].filter(Boolean),
    [movie]
  );

  const go = () => {
    track('browse', movie);
    if (!isLoggedIn) {
      navigate(`/login?next=${encodeURIComponent(`/checkout/${movie.id}`)}`);
      return;
    }
    if (owned) {
      navigate(`/watch/${movie.id}`);
      return;
    }
    track('checkout_start', movie);
    navigate(`/checkout/${movie.id}`);
  };

  if (owned) {
    return (
      <aside className={`purchase-card ${className}`.trim()}>
        <p className="purchase-owned">✓ In your library</p>
        <p className="purchase-sub">
          {ownedSince
            ? `Bought ${new Date(ownedSince).toLocaleDateString('en-KE', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}. It’s yours to keep.`
            : 'It’s yours to keep.'}
        </p>
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={go}>
            ▶ Watch now
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <Link to="/my-films" className="btn btn-ghost btn-block">
            In My films
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`purchase-card ${className}`.trim()}>
      <p className="purchase-price">{formatKes(movie.price)}</p>
      <p className="purchase-sub">Yours to keep. One payment, no subscription.</p>
      <ul className="purchase-facts">
        {facts.map((f) => (
          <li key={f}>
            <span className="check">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 24 }}>
        <button type="button" className="btn btn-buy btn-lg btn-block" onClick={go}>
          {isLoggedIn ? `Buy for ${formatKes(movie.price)}` : 'Join free to buy'}
        </button>
      </div>
      <div className="pay-marks">
        {PAY_MARKS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <p className="purchase-secure">
        <span aria-hidden>🔒</span> Secured by Paystack · Unlocks instantly
      </p>
    </aside>
  );
}

export function MobileBuyBar({ movie }) {
  const { isLoggedIn } = useAuth();
  const { isOwned } = useLibrary();
  const navigate = useNavigate();
  const owned = isOwned(movie.id);

  const go = () => {
    if (!isLoggedIn) {
      navigate(`/login?next=${encodeURIComponent(`/checkout/${movie.id}`)}`);
      return;
    }
    if (owned) {
      navigate(`/watch/${movie.id}`);
      return;
    }
    track('checkout_start', movie);
    navigate(`/checkout/${movie.id}`);
  };

  return (
    <div className="mobile-buy-bar">
      <div className="meta">
        <p>{movie.title}</p>
        <p>{owned ? 'In your library' : `${formatKes(movie.price)} · M-Pesa or card`}</p>
      </div>
      <button type="button" className={owned ? 'btn btn-secondary' : 'btn btn-buy'} onClick={go}>
        {owned ? 'Watch' : `Buy · ${formatKes(movie.price)}`}
      </button>
    </div>
  );
}
