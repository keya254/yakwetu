'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3001);
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || '';
const N8N_EVENT_WEBHOOK =
  process.env.N8N_EVENT_WEBHOOK || 'http://yakwetu-n8n:5678/webhook/yakwetu-event';
const CURRENCY = process.env.PAYSTACK_CURRENCY || 'KES';
const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_USERNAME = process.env.AT_USERNAME || '';
const AT_SENDER_ID = process.env.AT_SENDER_ID || 'AFTKNG';
const AT_API_URL =
  process.env.AT_API_URL || 'https://api.africastalking.com/version1/messaging';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'yakwetu-admin';
const ADMIN_PHONE = normalizePhoneEnv(
  process.env.ADMIN_PHONE || '+254702846542'
);

function normalizePhoneEnv(phone) {
  let p = String(phone || '').replace(/\s+/g, '');
  if (p.startsWith('07') || p.startsWith('01')) p = '+254' + p.slice(1);
  if (p.startsWith('254') && !p.startsWith('+')) p = '+' + p;
  return p;
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'yakwetu-db',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'yakwetu',
  password: process.env.POSTGRES_PASSWORD || 'yakwetu',
  database: process.env.POSTGRES_DB || 'yakwetu',
  max: 5,
});

/** phone → { code, name, phone, expiresAt } */
const otpStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;

const app = express();

// Raw body for webhook signature (must be before json parser on that route)
app.post(
  '/api/paystack/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      if (PAYSTACK_SECRET_KEY) {
        const secret = PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET_KEY;
        const hash = crypto
          .createHmac('sha512', secret)
          .update(req.body)
          .digest('hex');
        if (hash !== req.headers['x-paystack-signature']) {
          return res.status(401).json({ error: 'invalid signature' });
        }
      }
      const event = JSON.parse(req.body.toString('utf8'));
      await handlePaystackEvent(event);
      res.sendStatus(200);
    } catch (e) {
      console.error('webhook error', e);
      res.status(500).json({ error: String(e.message || e) });
    }
  }
);

app.use(cors());
app.use(express.json());

app.get('/api/ping', (_req, res) => res.json({ ok: true }));

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\s+/g, '');
  if (p.startsWith('07') || p.startsWith('01')) p = '+254' + p.slice(1);
  if (p.startsWith('254') && !p.startsWith('+')) p = '+' + p;
  return p;
}

function userIdFromPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return 'u_' + digits.slice(-9);
}

async function sendAtSms(to, message) {
  if (!AT_API_KEY || !AT_USERNAME || !AT_SENDER_ID) {
    const err = new Error('AT_USERNAME, AT_API_KEY, and AT_SENDER_ID must be set on paystack-api');
    err.code = 'at_not_configured';
    throw err;
  }
  const body = new URLSearchParams({
    username: AT_USERNAME,
    to,
    message,
    from: AT_SENDER_ID,
    bulkSMSMode: '1',
  });
  const r = await fetch(AT_API_URL, {
    method: 'POST',
    headers: {
      apiKey: AT_API_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!r.ok) {
    throw new Error(`AT SMS failed ${r.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

/** Request OTP — SMS via Africa's Talking */
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Enter your name (at least 2 characters)' });
    }
    if (!/^\+254[17]\d{8}$/.test(phone)) {
      return res.status(400).json({
        error: 'Use a valid Kenyan phone like +2547XXXXXXXX',
      });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(phone, {
      code,
      name,
      phone,
      expiresAt: Date.now() + OTP_TTL_MS,
    });
    const msg = `Yakwetu login code: ${code}. Valid 10 minutes. Don't share it.`;
    await sendAtSms(phone, msg);
    res.json({
      ok: true,
      phone,
      expires_in_sec: Math.floor(OTP_TTL_MS / 1000),
      hint: 'OTP sent by SMS',
    });
  } catch (e) {
    console.error('request-otp', e);
    res.status(e.code === 'at_not_configured' ? 503 : 502).json({
      error: String(e.message || e),
    });
  }
});

/** Verify OTP → session user for storefront */
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    const row = otpStore.get(phone);
    if (!row || row.expiresAt < Date.now()) {
      otpStore.delete(phone);
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (row.code !== code) {
      return res.status(400).json({ error: 'Incorrect code' });
    }
    otpStore.delete(phone);
    const user = {
      user_id: userIdFromPhone(phone),
      name: row.name,
      phone,
      email: '',
      channel_pref: 'sms',
    };
    // Best-effort signup event into n8n
    try {
      await forwardToN8n({
        event_type: 'signup',
        ...user,
        session_id: 'sess_auth_' + Date.now().toString(36),
        ts: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('signup event failed', e.message || e);
    }
    res.json({ ok: true, user });
  } catch (e) {
    console.error('verify-otp', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/health', async (_req, res) => {
  let n8n_ping = { ok: false };
  try {
    const base = N8N_EVENT_WEBHOOK.replace(/\/webhook\/.*$/, '');
    const r = await fetch(base + '/healthz', {
      signal: AbortSignal.timeout(3000),
    });
    n8n_ping = { ok: r.ok, status: r.status, base };
  } catch (e) {
    n8n_ping = { ok: false, error: String(e.message || e) };
  }
  res.json({
    ok: true,
    paystack_configured: Boolean(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY),
    at_sms_configured: Boolean(AT_API_KEY && AT_USERNAME && AT_SENDER_ID),
    n8n_ping,
    n8n_event_webhook: N8N_EVENT_WEBHOOK,
  });
});

/** Same-origin event intake for the storefront / demo-lab (avoids nginx→n8n proxy quirks). */
app.post('/api/events', async (req, res) => {
  try {
    const r = await fetch(N8N_EVENT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const text = await r.text();
    let parsed;
    if (!text || !text.trim()) {
      // n8n sometimes returns 200 with empty body even when workflow ran
      parsed = {
        status: r.ok ? 'ok' : 'empty_error',
        note: 'n8n returned empty body — check Executions tab (not the Editor canvas)',
      };
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (!r.ok) {
      // Surface n8n's hint (e.g. workflow not active) instead of opaque HTML 500
      return res.status(r.status).json({
        error: 'n8n_webhook_failed',
        status: r.status,
        n8n: parsed,
        hint:
          parsed?.hint ||
          parsed?.message ||
          'Check YKW 01 is Active (top-right toggle) and Postgres credentials are set.',
        webhook: N8N_EVENT_WEBHOOK,
      });
    }
    return res.status(200).json(parsed);
  } catch (e) {
    console.error('events forward failed', e);
    return res.status(502).json({
      error: 'n8n_unreachable',
      detail: String(e.message || e),
      webhook: N8N_EVENT_WEBHOOK,
    });
  }
});

app.get('/api/paystack/config', (_req, res) => {
  res.json({
    publicKey: PAYSTACK_PUBLIC_KEY || null,
    currency: CURRENCY,
    enabled: Boolean(PAYSTACK_PUBLIC_KEY && PAYSTACK_SECRET_KEY),
  });
});

app.post('/api/paystack/initialize', async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(503).json({ error: 'PAYSTACK_SECRET_KEY not set' });
  }
  const {
    email,
    amount_kes,
    user_id,
    name,
    phone,
    session_id,
    movie_id,
    movie_title,
    genre,
  } = req.body || {};

  if (!email || !amount_kes || !user_id || !session_id) {
    return res.status(400).json({
      error: 'email, amount_kes, user_id, and session_id are required',
    });
  }

  const amount = Math.round(Number(amount_kes) * 100); // Paystack: subunits
  if (!Number.isFinite(amount) || amount < 100) {
    return res.status(400).json({ error: 'amount_kes too small' });
  }

  const reference = `ykw_${session_id}_${Date.now()}`;
  const metadata = {
    user_id: String(user_id),
    name: name || '',
    phone: phone || '',
    email: email || '',
    session_id: String(session_id),
    movie_id: movie_id || null,
    movie_title: movie_title || null,
    genre: genre || null,
    price_kes: Number(amount_kes),
  };

  try {
    const data = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount,
        currency: CURRENCY,
        reference,
        metadata,
        channels: ['card', 'mobile_money', 'bank', 'ussd'],
        callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined,
      }),
    });
    res.json({
      authorization_url: data.authorization_url,
      access_code: data.access_code,
      reference: data.reference,
      publicKey: PAYSTACK_PUBLIC_KEY,
    });
  } catch (e) {
    console.error('initialize failed', e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.get('/api/paystack/verify/:reference', async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(503).json({ error: 'PAYSTACK_SECRET_KEY not set' });
  }
  try {
    const data = await paystackFetch(
      `/transaction/verify/${encodeURIComponent(req.params.reference)}`
    );
    const result = await emitFromTransaction(data);
    res.json({ status: data.status, gateway_response: data.gateway_response, ...result });
  } catch (e) {
    console.error('verify failed', e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

async function paystackFetch(path, options = {}) {
  const r = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await r.json();
  if (!json.status) {
    throw new Error(json.message || `Paystack error ${r.status}`);
  }
  return json.data;
}

async function handlePaystackEvent(event) {
  const name = event.event || '';
  const data = event.data || {};
  if (name === 'charge.success') {
    await emitFromTransaction(data);
  } else if (
    name === 'charge.failed' ||
    name === 'charge.abandoned' ||
    name === 'paymentrequest.failed'
  ) {
    await emitFromTransaction({ ...data, status: 'failed' });
  }
}

function mapFailureReason(tx) {
  const raw = (
    tx.gateway_response ||
    tx.message ||
    tx.status ||
    'Payment failed'
  ).toString();
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient') || lower.includes('balance') || lower.includes('fund')) {
    return 'Insufficient balance';
  }
  if (lower.includes('pin') || lower.includes('otp') || lower.includes('authoris')) {
    return 'Wrong M-Pesa PIN entered';
  }
  if (
    lower.includes('timeout') ||
    lower.includes('cancel') ||
    lower.includes('abandon') ||
    lower.includes('expired')
  ) {
    return 'Request timed out / cancelled by user';
  }
  if (lower.includes('limit')) {
    return 'Transaction limit exceeded';
  }
  return raw;
}

function metaOf(tx) {
  const m = tx.metadata || {};
  // Paystack sometimes nests custom_fields; prefer flat metadata we sent
  return {
    user_id: m.user_id,
    name: m.name || '',
    phone: m.phone || '',
    email: m.email || tx.customer?.email || '',
    session_id: m.session_id,
    movie_id: m.movie_id || null,
    movie_title: m.movie_title || null,
    genre: m.genre || null,
    price_kes: m.price_kes || (tx.amount != null ? tx.amount / 100 : null),
  };
}

async function emitFromTransaction(tx) {
  const meta = metaOf(tx);
  if (!meta.user_id || !meta.session_id) {
    console.warn('transaction missing yakwetu metadata', tx.reference);
    return { emitted: false, reason: 'missing metadata' };
  }

  const success = String(tx.status).toLowerCase() === 'success';
  const payload = {
    event_type: success ? 'payment_success' : 'payment_failed',
    user_id: meta.user_id,
    name: meta.name,
    phone: meta.phone,
    email: meta.email,
    session_id: meta.session_id,
    movie_id: meta.movie_id,
    movie_title: meta.movie_title,
    genre: meta.genre,
    price_kes: meta.price_kes,
    failure_reason: success ? null : mapFailureReason(tx),
    paystack_reference: tx.reference,
    paystack_status: tx.status,
    ts: new Date().toISOString(),
  };

  await forwardToN8n(payload);
  return { emitted: true, event_type: payload.event_type };
}

async function forwardToN8n(payload) {
  console.log('→ n8n', payload.event_type, payload.session_id, payload.paystack_reference || '');
  const r = await fetch(N8N_EVENT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`n8n webhook ${r.status}: ${text}`);
  }
}

function requireAdmin(req, res, next) {
  const token =
    req.headers['x-admin-token'] ||
    req.query.token ||
    (req.body && req.body.token);
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'invalid admin token' });
  }
  next();
}

app.get('/api/admin/config', (_req, res) => {
  res.json({
    admin_phone_hint: ADMIN_PHONE.replace(/(\+254\d{2})\d{5}(\d{2})/, '$1*****$2'),
    admin_phone: ADMIN_PHONE,
  });
});

/** OTP only works for the configured ADMIN_PHONE */
app.post('/api/admin/request-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone || ADMIN_PHONE);
    if (phone !== ADMIN_PHONE) {
      return res.status(403).json({
        error: 'Only the configured admin phone can access this dashboard',
      });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set('admin:' + phone, {
      code,
      phone,
      expiresAt: Date.now() + OTP_TTL_MS,
      kind: 'admin',
    });
    await sendAtSms(
      phone,
      `Yakwetu admin code: ${code}. Valid 10 minutes.`
    );
    res.json({ ok: true, phone, expires_in_sec: Math.floor(OTP_TTL_MS / 1000) });
  } catch (e) {
    console.error('admin request-otp', e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/api/admin/verify-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone || ADMIN_PHONE);
    const code = String(req.body?.code || '').trim();
    if (phone !== ADMIN_PHONE) {
      return res.status(403).json({ error: 'Not an admin phone' });
    }
    const row = otpStore.get('admin:' + phone);
    if (!row || row.expiresAt < Date.now()) {
      otpStore.delete('admin:' + phone);
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (row.code !== code) {
      return res.status(400).json({ error: 'Incorrect code' });
    }
    otpStore.delete('admin:' + phone);
    res.json({
      ok: true,
      token: ADMIN_TOKEN,
      phone: ADMIN_PHONE,
      name: 'Admin',
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/summary', requireAdmin, async (_req, res) => {
  try {
    const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
    const [users, events, payments, fails, watches, sessions, nudges, dropoffs, revenue] =
      await Promise.all([
        q(`SELECT COUNT(*)::int AS n FROM users`),
        q(`SELECT event_type, COUNT(*)::int AS n FROM events GROUP BY event_type ORDER BY n DESC`),
        q(`SELECT COUNT(*)::int AS n FROM events WHERE event_type = 'payment_success'`),
        q(`SELECT COUNT(*)::int AS n FROM events WHERE event_type = 'payment_failed'`),
        q(`SELECT COUNT(*)::int AS n FROM events WHERE event_type = 'watch_complete'`),
        q(`SELECT state, COUNT(*)::int AS n, SUM(CASE WHEN recovered THEN 1 ELSE 0 END)::int AS recovered
           FROM sessions GROUP BY state ORDER BY n DESC`),
        q(`SELECT scenario, channel, COUNT(*)::int AS sent,
                  SUM(CASE WHEN converted THEN 1 ELSE 0 END)::int AS converted
           FROM nudges GROUP BY scenario, channel ORDER BY sent DESC`),
        q(`SELECT COALESCE(failure_class,'(unknown)') AS failure_class, COUNT(*)::int AS n
           FROM dropoffs GROUP BY 1 ORDER BY n DESC`),
        q(`SELECT COALESCE(SUM(price_kes),0)::float AS kes
           FROM events WHERE event_type = 'payment_success'`),
      ]);
    res.json({
      users: users[0]?.n || 0,
      payment_success: payments[0]?.n || 0,
      payment_failed: fails[0]?.n || 0,
      watch_complete: watches[0]?.n || 0,
      revenue_kes: revenue[0]?.kes || 0,
      events_by_type: events,
      sessions_by_state: sessions,
      nudges,
      dropoffs,
    });
  } catch (e) {
    console.error('admin summary', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/events', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await pool.query(
      `SELECT e.id, e.ts, e.event_type, e.user_id, u.name, u.phone, e.session_id,
              e.movie_title, e.genre, e.price_kes, e.failure_reason
       FROM events e
       LEFT JOIN users u ON u.user_id = e.user_id
       ORDER BY e.ts DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ events: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.ts, e.event_type, e.user_id, u.name, u.phone, e.session_id,
              e.movie_id, e.movie_title, e.price_kes, e.failure_reason
       FROM events e
       LEFT JOIN users u ON u.user_id = e.user_id
       WHERE e.event_type IN ('payment_success','payment_failed','checkout_start')
       ORDER BY e.ts DESC
       LIMIT 100`
    );
    res.json({ payments: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/followups', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.session_id, s.user_id, u.name, u.phone, u.email, s.state, s.recovered,
              s.nudge_count, s.last_activity, s.last_movie_title, s.last_genre, s.last_price,
              ROUND(EXTRACT(EPOCH FROM (NOW() - s.last_activity))/60)::int AS idle_minutes
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.recovered = false
         AND s.state IN ('browsing','checkout','failed')
       ORDER BY s.last_activity ASC
       LIMIT 50`
    );
    res.json({ candidates: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/nudges', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.sent_at, n.scenario, n.channel, n.converted, n.user_id,
              u.name, u.phone, n.session_id, LEFT(n.message, 160) AS message
       FROM nudges n
       LEFT JOIN users u ON u.user_id = n.user_id
       ORDER BY n.sent_at DESC
       LIMIT 80`
    );
    res.json({ nudges: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Manual follow-up SMS from admin dashboard */
app.post('/api/admin/follow-up', requireAdmin, async (req, res) => {
  try {
    const {
      user_id,
      phone,
      name,
      session_id,
      movie_title,
      message,
      scenario,
    } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message required' });
    }
    const to = normalizePhone(phone);
    const text = String(message).trim();
    await sendAtSms(to, text);

    const uid = user_id || userIdFromPhone(to);
    const sid = session_id || 'sess_admin_' + Date.now().toString(36);
    const scen = scenario || 'admin_followup';

    await pool.query(
      `INSERT INTO users (user_id, name, phone, last_seen)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name,''), users.name),
         phone = COALESCE(NULLIF(EXCLUDED.phone,''), users.phone),
         last_seen = NOW()`,
      [uid, name || '', to]
    );
    await pool.query(
      `INSERT INTO nudges (user_id, session_id, scenario, channel, message, sent_at)
       VALUES ($1,$2,$3,'sms',$4,NOW())`,
      [uid, sid, scen, text]
    );
    await pool.query(
      `UPDATE sessions SET nudge_count = nudge_count + 1, last_nudge_at = NOW()
       WHERE session_id = $1`,
      [sid]
    ).catch(() => {});

    res.json({
      ok: true,
      sent_to: to,
      movie_title: movie_title || null,
      scenario: scen,
    });
  } catch (e) {
    console.error('admin follow-up', e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const posterCache = new Map(); // id → poster url

async function fetchJson(url, headers = {}, timeoutMs = 3500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'YakwetuCatalog/1.0', ...headers },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function enrichOne(item) {
  const id = item.id;
  if (posterCache.has(id)) return posterCache.get(id);

  // 1) TMDB by id or title search (free key: themoviedb.org)
  if (TMDB_API_KEY) {
    try {
      let path = '';
      if (item.tmdb) {
        const d = await fetchJson(
          `https://api.themoviedb.org/3/movie/${item.tmdb}?api_key=${TMDB_API_KEY}`
        );
        path = d && d.poster_path;
      }
      if (!path && item.title) {
        const q = encodeURIComponent(item.title);
        const y = item.year ? `&year=${item.year}` : '';
        const s = await fetchJson(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${q}${y}`
        );
        const hit = (s && s.results && s.results[0]) || null;
        path = hit && hit.poster_path;
      }
      if (path) {
        const url = `https://image.tmdb.org/t/p/w500${path}`;
        posterCache.set(id, url);
        return url;
      }
    } catch (e) {
      console.warn('tmdb enrich', id, e.message || e);
    }
  }

  // 2) OMDb / IMDb poster (free key: omdbapi.com)
  if (OMDB_API_KEY) {
    try {
      let url = '';
      if (item.imdb) {
        const d = await fetchJson(
          `https://www.omdbapi.com/?i=${encodeURIComponent(item.imdb)}&apikey=${OMDB_API_KEY}`
        );
        if (d && d.Poster && d.Poster !== 'N/A') url = d.Poster;
      }
      if (!url && item.title) {
        const y = item.year ? `&y=${item.year}` : '';
        const d = await fetchJson(
          `https://www.omdbapi.com/?t=${encodeURIComponent(item.title)}${y}&apikey=${OMDB_API_KEY}`
        );
        if (d && d.Poster && d.Poster !== 'N/A') url = d.Poster;
      }
      if (url) {
        posterCache.set(id, url);
        return url;
      }
    } catch (e) {
      console.warn('omdb enrich', id, e.message || e);
    }
  }

  // 3) Wikipedia only when no TMDB/OMDb keys (slow path)
  if (!TMDB_API_KEY && !OMDB_API_KEY && item.title) {
    try {
      const titles = [
        item.title,
        `${item.title} (film)`,
        item.year ? `${item.title} (${item.year} film)` : null,
      ].filter(Boolean);
      for (const t of titles) {
        const q = encodeURIComponent(t);
        const d = await fetchJson(
          `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=500&titles=${q}&origin=*`,
          {},
          2500
        );
        const pages = (d && d.query && d.query.pages) || {};
        for (const p of Object.values(pages)) {
          const src = p.thumbnail && p.thumbnail.source;
          if (src) {
            const url = String(src).split('?')[0];
            posterCache.set(id, url);
            return url;
          }
        }
      }
    } catch (e) {
      console.warn('wiki enrich', id, e.message || e);
    }
  }

  return '';
}

app.get('/api/catalog/config', (_req, res) => {
  res.json({
    tmdb: Boolean(TMDB_API_KEY),
    omdb: Boolean(OMDB_API_KEY),
    wikipedia: true,
  });
});

app.post('/api/catalog/enrich', async (req, res) => {
  try {
    const titles = Array.isArray(req.body && req.body.titles)
      ? req.body.titles.slice(0, 12)
      : [];
    const posters = {};
    for (let i = 0; i < titles.length; i += 6) {
      const batch = titles.slice(i, i + 6);
      const results = await Promise.all(batch.map((t) => enrichOne(t)));
      batch.forEach((t, idx) => {
        if (results[idx]) posters[t.id] = results[idx];
      });
    }
    res.json({
      posters,
      sources: {
        tmdb: Boolean(TMDB_API_KEY),
        omdb: Boolean(OMDB_API_KEY),
        wikipedia: !TMDB_API_KEY && !OMDB_API_KEY,
      },
    });
  } catch (e) {
    console.error('catalog enrich', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(
    `paystack-api on :${PORT} | paystack=${Boolean(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY)} | at_sms=${Boolean(AT_API_KEY && AT_USERNAME)} | tmdb=${Boolean(TMDB_API_KEY)} | omdb=${Boolean(OMDB_API_KEY)} | n8n=${N8N_EVENT_WEBHOOK}`
  );
});
