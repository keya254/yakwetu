import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function LoginPage() {
  const { isLoggedIn, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/browse';

  const [mode, setMode] = useState('password'); // password | otp
  const [form, setForm] = useState('signin'); // signin | signup
  const [otpStep, setOtpStep] = useState(1);
  const [otpChannel, setOtpChannel] = useState('sms');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [channelPref, setChannelPref] = useState('both');
  const [code, setCode] = useState('');
  const [pendingDest, setPendingDest] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoggedIn) navigate(next, { replace: true });
  }, [isLoggedIn, navigate, next]);

  function set(field) {
    return (e) => setField(field, e.target.value);
  }
  function setField(field, value) {
    if (field === 'name') setName(value);
    if (field === 'phone') setPhone(value);
    if (field === 'email') setEmail(value);
    if (field === 'password') setPassword(value);
    if (field === 'code') setCode(value);
  }

  async function signupPassword() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          password,
          channel_pref: channelPref,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Sign up failed');
      login(data.user, data.token);
      toast('Karibu, ' + data.user.name);
      navigate(next, { replace: true });
    } catch (e) {
      setErr(String(e.message || e));
      toast(String(e.message || e), true);
    } finally {
      setBusy(false);
    }
  }

  async function loginPassword() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          password,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Sign in failed');
      login(data.user, data.token);
      toast('Welcome back, ' + data.user.name);
      navigate(next, { replace: true });
    } catch (e) {
      setErr(String(e.message || e));
      toast(String(e.message || e), true);
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          channel: otpChannel,
          purpose: form === 'signup' ? 'signup' : 'login',
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not send OTP');
      setPendingDest(data.destination);
      setOtpStep(2);
      toast(data.hint || 'OTP sent');
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
        body: JSON.stringify({
          channel: otpChannel,
          purpose: form === 'signup' ? 'signup' : 'login',
          phone: otpChannel === 'sms' ? pendingDest : phone.trim() || undefined,
          email: otpChannel === 'email' ? pendingDest : email.trim() || undefined,
          destination: pendingDest,
          code: code.trim(),
          name: name.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Verification failed');
      login(data.user, data.token);
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
          Yakwetu<span className="tag">Sinema</span>
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>
          {form === 'signup' ? 'Join free' : 'Sign in'}
        </h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Kenyans can use phone (SMS). Anyone worldwide can use email. Pick password or one-time
          code.
        </p>

        <div className="auth-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`chip${mode === 'password' ? ' on' : ''}`}
            onClick={() => {
              setMode('password');
              setOtpStep(1);
              setErr('');
            }}
          >
            Password
          </button>
          <button
            type="button"
            className={`chip${mode === 'otp' ? ' on' : ''}`}
            onClick={() => {
              setMode('otp');
              setOtpStep(1);
              setErr('');
            }}
          >
            One-time code
          </button>
        </div>

        <div className="err-text">{err}</div>

        {mode === 'password' ? (
          <div className="stack">
            {form === 'signup' ? (
              <div className="field">
                <label>Your name</label>
                <input value={name} onChange={set('name')} placeholder="Wanjiku Mwangi" autoComplete="name" />
              </div>
            ) : null}
            <div className="field">
              <label>Email {form === 'signin' ? '(or phone below)' : '(recommended outside Kenya)'}</label>
              <input value={email} onChange={set('email')} type="email" placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>Phone {form === 'signup' ? '(Kenya, optional)' : '(optional)'}</label>
              <input value={phone} onChange={set('phone')} placeholder="+2547XXXXXXXX" autoComplete="tel" />
            </div>
            <div className="field">
              <label>Password</label>
              <input value={password} onChange={set('password')} type="password" autoComplete={form === 'signup' ? 'new-password' : 'current-password'} />
            </div>
            {form === 'signup' ? (
              <div className="field">
                <label>Prefer messages by</label>
                <select
                  value={channelPref}
                  onChange={(e) => setChannelPref(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'oklch(0.95 0.012 80 / 6%)',
                    border: '1px solid var(--line-strong)',
                    color: 'var(--text)',
                    padding: '12px 14px',
                    borderRadius: '0.5rem',
                  }}
                >
                  <option value="both">SMS and email</option>
                  <option value="sms">SMS only</option>
                  <option value="email">Email only</option>
                </select>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-buy btn-block btn-lg"
              disabled={busy}
              onClick={form === 'signup' ? signupPassword : loginPassword}
            >
              {form === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        ) : otpStep === 1 ? (
          <div className="stack">
            {form === 'signup' ? (
              <div className="field">
                <label>Your name</label>
                <input value={name} onChange={set('name')} placeholder="Wanjiku Mwangi" />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`chip${otpChannel === 'sms' ? ' on' : ''}`}
                onClick={() => setOtpChannel('sms')}
              >
                SMS
              </button>
              <button
                type="button"
                className={`chip${otpChannel === 'email' ? ' on' : ''}`}
                onClick={() => setOtpChannel('email')}
              >
                Email
              </button>
            </div>
            {otpChannel === 'sms' ? (
              <div className="field">
                <label>Kenyan phone</label>
                <input value={phone} onChange={set('phone')} placeholder="+2547XXXXXXXX" />
              </div>
            ) : (
              <div className="field">
                <label>Email</label>
                <input value={email} onChange={set('email')} type="email" placeholder="you@example.com" />
              </div>
            )}
            <button type="button" className="btn btn-buy btn-block btn-lg" disabled={busy} onClick={requestOtp}>
              Send code
            </button>
          </div>
        ) : (
          <div className="stack">
            <div className="field">
              <label>
                Enter the 6-digit code sent to <b>{pendingDest}</b>
              </label>
              <input value={code} onChange={set('code')} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
            </div>
            <button type="button" className="btn btn-buy btn-block btn-lg" disabled={busy} onClick={verifyOtp}>
              Verify &amp; continue
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                setOtpStep(1);
                setErr('');
              }}
            >
              Use a different {otpChannel === 'sms' ? 'number' : 'email'}
            </button>
          </div>
        )}

        <p className="muted" style={{ marginTop: 16 }}>
          {form === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" className="linkish" style={{ color: 'var(--saffron)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setForm('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="linkish" style={{ color: 'var(--saffron)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setForm('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          <Link to="/" style={{ color: 'var(--saffron)' }}>
            ← Back home
          </Link>
          {' · '}
          <Link to="/browse" style={{ color: 'var(--saffron)' }}>
            Browse as guest
          </Link>
        </p>
      </div>
    </div>
  );
}
