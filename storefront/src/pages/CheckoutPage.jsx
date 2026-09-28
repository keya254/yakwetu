import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import { currentSession } from '../lib/storage';
import { track } from '../lib/track';

export default function CheckoutPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { getById } = useCatalog();
  const { user, updateUser } = useAuth();
  const { isOwned, unlockMovie } = useLibrary();
  const { toast } = useToast();
  const navigate = useNavigate();
  const movie = getById(id);

  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [view, setView] = useState('pay'); // pay | stk | ok | fail
  const [failReason, setFailReason] = useState('');
  const [payOutcome, setPayOutcome] = useState(null);

  useEffect(() => {
    if (!movie) return;
    if (isOwned(movie.id)) setView('ok');
    if (params.get('resume')) {
      toast('Welcome back — session restored from nudge link');
      track('checkout_start', movie, { resumed_from_nudge: true });
    }
    (async () => {
      try {
        const r = await fetch('/api/paystack/config');
        const cfg = await r.json();
        setPaystackEnabled(!!cfg.enabled);
      } catch {
        setPaystackEnabled(false);
      }
    })();
  }, [movie?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!movie) {
    return (
      <div className="page">
        <p className="empty">Movie not found.</p>
        <Link to="/">← Home</Link>
      </div>
    );
  }

  function showSuccess() {
    unlockMovie(movie);
    setView('ok');
    toast('Unlocked — start watching anytime');
  }

  function showFail(reason) {
    setFailReason(reason);
    setView('fail');
    toast('Payment failed — rescue SMS on the way', true);
  }

  async function startPay() {
    updateUser({ phone: phone.trim() || user.phone, email: email.trim() || user.email });
    setPayOutcome(null);
    await track('checkout_start', movie);

    if (!paystackEnabled) {
      setView('stk');
      toast('STK simulated — use demo controls');
      setTimeout(() => setView('pay'), 1200);
      return;
    }

    setView('stk');
    try {
      const r = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || user.email,
          amount_kes: movie.price,
          user_id: user.user_id,
          name: user.name,
          phone: phone.trim() || user.phone,
          session_id: currentSession(),
          movie_id: movie.id,
          movie_title: movie.title,
          genre: movie.genre,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Initialize failed');

      if (typeof window.PaystackPop !== 'undefined' && window.PaystackPop.setup) {
        const handler = window.PaystackPop.setup({
          key: data.publicKey,
          email: email.trim() || user.email,
          amount: Math.round(movie.price * 100),
          currency: 'KES',
          ref: data.reference,
          callback: (response) => {
            setPayOutcome('pending');
            verifyAndFinish(response.reference);
          },
          onClose: () => {
            if (payOutcome === 'success' || payOutcome === 'failed' || payOutcome === 'pending')
              return;
            setPayOutcome('failed');
            setView('pay');
            track('payment_failed', movie, {
              failure_reason: 'Request timed out / cancelled by user',
            }).then(() => showFail('Payment window closed before completion'));
          },
        });
        handler.openIframe();
      } else if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        throw new Error('Paystack popup unavailable');
      }
    } catch (e) {
      setView('pay');
      toast(String(e.message || e), true);
    }
  }

  async function verifyAndFinish(reference) {
    try {
      const r = await fetch('/api/paystack/verify/' + encodeURIComponent(reference));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Verify failed');
      if (data.status === 'success' || data.event_type === 'payment_success') {
        setPayOutcome('success');
        if (!data.emitted) await track('payment_success', movie);
        showSuccess();
      } else {
        setPayOutcome('failed');
        const reason = data.gateway_response || 'Payment failed';
        if (!data.emitted) await track('payment_failed', movie, { failure_reason: reason });
        showFail(reason);
      }
    } catch (e) {
      setPayOutcome('failed');
      setView('pay');
      toast(String(e.message || e), true);
    }
  }

  async function resolvePay(success, reason) {
    if (success) {
      setPayOutcome('success');
      await track('payment_success', movie);
      showSuccess();
    } else {
      setPayOutcome('failed');
      await track('payment_failed', movie, { failure_reason: reason });
      showFail(reason);
    }
  }

  return (
    <div className="page page-narrow" style={{ paddingTop: 24 }}>
      <div className="card">
        {view === 'pay' && (
          <>
            <div
              className="muted"
              style={{
                marginBottom: 12,
                padding: '4px 8px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                display: 'inline-block',
              }}
            >
              {paystackEnabled ? 'Paystack live' : 'Simulate mode — demo controls below'}
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: movie.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: 24,
                }}
              >
                {(movie.title || 'Y').charAt(0)}
              </div>
              <div>
                <h2 style={{ fontSize: 18 }}>{movie.title}</h2>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>
                  {movie.genre}
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderTop: '1px dashed #2c2c3a',
                borderBottom: '1px dashed #2c2c3a',
                marginBottom: 16,
              }}
            >
              <span>Total (own it forever)</span>
              <b style={{ color: 'var(--gold)', fontSize: 18 }}>KES {movie.price}</b>
            </div>
            <div className="field">
              <label>Email (Paystack receipt)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="field">
              <label>Phone (M-Pesa / SMS)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <button type="button" className="btn btn-buy" style={{ width: '100%' }} onClick={startPay}>
              {paystackEnabled ? 'Pay with Paystack' : 'Simulate M-Pesa STK'}
            </button>
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>
                Simulate payment outcomes
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" className="btn btn-ghost" onClick={() => resolvePay(true)}>
                  Success
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => resolvePay(false, 'Insufficient balance')}
                >
                  Insufficient funds
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => resolvePay(false, 'Wrong M-Pesa PIN entered')}
                >
                  Wrong PIN
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => resolvePay(false, 'Request timed out / cancelled by user')}
                >
                  Timeout
                </button>
              </div>
            </div>
          </>
        )}

        {view === 'stk' && (
          <div style={{ textAlign: 'center', padding: '28px 0' }}>
            <p>Opening payment…</p>
            <p className="muted" style={{ marginTop: 8 }}>
              Complete payment in the popup
            </p>
          </div>
        )}

        {view === 'ok' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>Unlocked</div>
            <h2>Purchase complete</h2>
            <p className="muted" style={{ margin: '8px 0 16px' }}>
              This title is in your library.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/watch/${movie.id}`)}
            >
              ▶ Watch now
            </button>
          </div>
        )}

        {view === 'fail' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <h2>Payment didn&apos;t go through</h2>
            <p className="muted" style={{ margin: '8px 0' }}>
              {failReason}
            </p>
            <p style={{ color: 'var(--gold)', fontSize: 13 }}>
              We’ll SMS you right away with help to complete payment.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 14 }}
              onClick={() => {
                setView('pay');
                track('checkout_start', movie, { retry: true });
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Load Paystack script once
if (typeof document !== 'undefined' && !document.getElementById('paystack-js')) {
  const s = document.createElement('script');
  s.id = 'paystack-js';
  s.src = 'https://js.paystack.co/v1/inline.js';
  document.head.appendChild(s);
}
