import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function LoginPage() {
  const { isLoggedIn, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoggedIn) navigate(next, { replace: true });
  }, [isLoggedIn, navigate, next]);

  async function requestOtp() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not send OTP');
      setPendingPhone(data.phone);
      setStep(2);
      toast('OTP sent by SMS');
    } catch (e) {
      setErr(String(e.message || e));
      toast(String(e.message || e), true);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pendingPhone, code: code.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Verification failed');
      login(data.user);
      toast('Welcome, ' + data.user.name);
      navigate(next, { replace: true });
    } catch (e) {
      setErr(String(e.message || e));
      toast(String(e.message || e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow" style={{ paddingTop: 40 }}>
      <div className="card">
        <div className="logo" style={{ marginBottom: 8 }}>
          YAKWETU
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sign up / log in</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Enter your name and phone. We’ll SMS a one-time code — that’s the number we use for
          payment and recommendation texts.
        </p>
        <div className="err-text">{err}</div>

        {step === 1 ? (
          <div className="stack">
            <div className="field">
              <label>Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wanjiku Mwangi"
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label>Phone (M-Pesa / SMS)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2547XXXXXXXX"
                autoComplete="tel"
              />
            </div>
            <button
              type="button"
              className="btn btn-buy"
              style={{ width: '100%' }}
              disabled={busy}
              onClick={requestOtp}
            >
              Send OTP
            </button>
          </div>
        ) : (
          <div className="stack">
            <div className="field">
              <label>
                Enter the 6-digit code we sent to <b>{pendingPhone}</b>
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="button"
              className="btn btn-buy"
              style={{ width: '100%' }}
              disabled={busy}
              onClick={verifyOtp}
            >
              Verify &amp; continue
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              onClick={() => {
                setStep(1);
                setErr('');
              }}
            >
              Use a different number
            </button>
          </div>
        )}
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/" style={{ color: 'var(--gold)' }}>
            ← Back home
          </Link>
        </p>
      </div>
    </div>
  );
}
