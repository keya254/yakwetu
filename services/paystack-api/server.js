'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { query } = require('./lib/db');
const auth = require('./lib/auth');
const notify = require('./lib/notify');
const outbox = require('./lib/outbox');
const events = require('./lib/events');
const orders = require('./lib/orders');
const { mountCatalog, TMDB_API_KEY, OMDB_API_KEY } = require('./lib/catalog');
const { mountInternal, recommend, getStoredRecommendations } = require('./lib/internal');

const PORT = Number(process.env.PORT || 3001);
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || '';
const CURRENCY = process.env.PAYSTACK_CURRENCY || 'KES';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const ADMIN_PHONE = auth.normalizePhone(process.env.ADMIN_PHONE || '');
const ADMIN_EMAIL = auth.normalizeEmail(process.env.ADMIN_EMAIL || '');
const N8N_EVENT_WEBHOOK =
  process.env.N8N_EVENT_WEBHOOK || 'http://sinema-flows:5678/webhook/yakwetu-event';
const STOREFRONT_URL = (process.env.STOREFRONT_URL || 'http://localhost:18080').replace(/\/$/, '');

const app = express();
let schemaReady = false;

app.post(
  '/api/paystack/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      if (PAYSTACK_SECRET_KEY) {
        const secret = PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET_KEY;
        const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
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
app.use(express.json({ limit: '1mb' }));

app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    schema_ready: schemaReady,
    paystack_configured: Boolean(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY),
    at_sms_configured: notify.smsConfigured(),
    resend_configured: notify.emailConfigured(),
    rabbitmq_configured: outbox.configured(),
    n8n_event_webhook: N8N_EVENT_WEBHOOK,
    abandon_delay_min: orders.ABANDON_DELAY_MIN,
  });
});

app.get('/api/config/public', (_req, res) => {
  res.json({
    paystack_enabled: Boolean(PAYSTACK_PUBLIC_KEY && PAYSTACK_SECRET_KEY),
    sms_enabled: notify.smsConfigured(),
    email_enabled: notify.emailConfigured(),
    analytics: 'postgres',
  });
});

/* ───────────── Auth ───────────── */

app.post('/api/auth/signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = auth.normalizePhone(req.body?.phone);
    const email = auth.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const channel_pref = String(req.body?.channel_pref || (email ? 'email' : phone ? 'sms' : 'email'));

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Enter your name (at least 2 characters)' });
    }
    if (!phone && !email) {
      return res.status(400).json({ error: 'Provide a phone number and/or email' });
    }
    if (phone && !auth.isKenyanPhone(phone)) {
      return res.status(400).json({
        error: 'Kenyan phones must look like +2547XXXXXXXX (or leave phone blank and use email)',
      });
    }
    if (email && !auth.isEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!password && !phone && !email) {
      return res.status(400).json({ error: 'Set a password or use OTP after signup' });
    }

    if (email) {
      const existing = await auth.findUser({ email });
      if (existing?.password_hash) {
        return res.status(409).json({ error: 'An account with this email already exists — sign in' });
      }
    }
    if (phone) {
      const existing = await auth.findUser({ phone });
      if (existing?.password_hash) {
        return res.status(409).json({ error: 'An account with this phone already exists — sign in' });
      }
    }

    const user_id = auth.userIdFrom(phone, email);
    const password_hash = password ? await auth.hashPassword(password) : null;
    const providers = password ? (phone || email ? 'otp,password' : 'password') : 'otp';
    const row = await auth.upsertUser({
      user_id,
      name,
      phone,
      email,
      channel_pref,
      password_hash,
      auth_providers: providers,
    });

    const session = await auth.createSession(row.user_id);
    await events.ingestEvent({
      event_type: 'signup',
      user_id: row.user_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      channel_pref: row.channel_pref,
      session_id: 'sess_auth_' + Date.now().toString(36),
    });
    await outbox.enqueue({
      type: 'user.signed_up',
      routingKey: 'user.signed_up',
      payload: {
        userId: row.user_id,
        properties: {
          name: row.name,
          phone: row.phone,
          email: row.email,
          channelPref: row.channel_pref,
        },
      },
    });

    // Welcome message (best-effort) — branded email / short SMS; logged to nudges analytics
    await notify
      .notifyUser(row, {
        scenario: 'journey_welcome',
        subject: 'Karibu — welcome to Yakwetu Sinema',
        message: `Hi ${name.split(' ')[0]}, karibu to Yakwetu Sinema! African films from KES 5 — pay per title, no subscription: ${STOREFRONT_URL}/browse`,
        ctaUrl: `${STOREFRONT_URL}/browse`,
        ctaLabel: 'Browse films',
      })
      .catch(() => []);

    res.json({ ok: true, user: auth.publicUser(row), token: session.token, expires_at: session.expires_at });
  } catch (e) {
    console.error('signup', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = auth.normalizeEmail(req.body?.email);
    const phone = auth.normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ error: 'Password required' });
    if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' });

    const row = email
      ? await auth.findUser({ email })
      : await auth.findUser({ phone: auth.normalizePhone(phone) });
    if (!row || !(await auth.verifyPassword(password, row.password_hash))) {
      return res.status(401).json({ error: 'Invalid email/phone or password' });
    }
    await query(`UPDATE users SET last_seen = NOW() WHERE user_id = $1`, [row.user_id]);
    const session = await auth.createSession(row.user_id);
    res.json({ ok: true, user: auth.publicUser(row), token: session.token, expires_at: session.expires_at });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const channel = String(req.body?.channel || 'sms').toLowerCase() === 'email' ? 'email' : 'sms';
    const purpose = String(req.body?.purpose || 'login');
    let destination =
      channel === 'email'
        ? auth.normalizeEmail(req.body?.email || req.body?.destination)
        : auth.normalizePhone(req.body?.phone || req.body?.destination);

    if (channel === 'sms') {
      if (!auth.isKenyanPhone(destination)) {
        return res.status(400).json({ error: 'Use a Kenyan phone like +2547XXXXXXXX for SMS OTP' });
      }
      if (!notify.smsConfigured()) {
        return res.status(503).json({ error: 'SMS is not configured on the server' });
      }
    } else {
      if (!auth.isEmail(destination)) {
        return res.status(400).json({ error: 'Enter a valid email for email OTP' });
      }
      if (!notify.emailConfigured()) {
        return res.status(503).json({ error: 'Email (Resend) is not configured on the server' });
      }
    }

    if (purpose === 'signup' && (!name || name.length < 2)) {
      return res.status(400).json({ error: 'Enter your name to sign up' });
    }

    const { code } = await auth.storeOtp({
      channel,
      destination,
      purpose,
      name,
      payload: {
        channel_pref: channel === 'sms' ? 'sms' : 'email',
        phone: channel === 'sms' ? destination : auth.normalizePhone(req.body?.phone),
        email: channel === 'email' ? destination : auth.normalizeEmail(req.body?.email),
      },
    });
    await auth.sendOtpMessage({ channel, destination, code, purpose });
    res.json({
      ok: true,
      channel,
      destination,
      expires_in_sec: Math.floor(auth.OTP_TTL_MS / 1000),
      hint: channel === 'sms' ? 'OTP sent by SMS' : 'OTP sent by email',
    });
  } catch (e) {
    console.error('request-otp', e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const channel = String(req.body?.channel || 'sms').toLowerCase() === 'email' ? 'email' : 'sms';
    const purpose = String(req.body?.purpose || 'login');
    const destination =
      channel === 'email'
        ? auth.normalizeEmail(req.body?.email || req.body?.destination || req.body?.phone)
        : auth.normalizePhone(req.body?.phone || req.body?.destination);
    const code = String(req.body?.code || '').trim();
    const result = await auth.consumeOtp({ destination, purpose, code });
    if (!result.ok) return res.status(400).json({ error: result.error });

    const payload = result.row.payload || {};
    const name = String(req.body?.name || result.row.name || payload.name || 'Viewer').trim();
    const phone = auth.normalizePhone(payload.phone || (channel === 'sms' ? destination : ''));
    const email = auth.normalizeEmail(payload.email || (channel === 'email' ? destination : ''));
    const user_id = auth.userIdFrom(phone, email);
    const row = await auth.upsertUser({
      user_id,
      name,
      phone,
      email,
      channel_pref: payload.channel_pref || channel,
      auth_providers: 'otp',
    });
    const session = await auth.createSession(row.user_id);

    if (purpose === 'signup' || purpose === 'login') {
      await events.ingestEvent({
        event_type: 'signup',
        user_id: row.user_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        channel_pref: row.channel_pref,
        session_id: 'sess_auth_' + Date.now().toString(36),
      }).catch(() => null);
    }

    res.json({ ok: true, user: auth.publicUser(row), token: session.token });
  } catch (e) {
    console.error('verify-otp', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const row = await auth.sessionUser(auth.bearerToken(req));
  if (!row) return res.status(401).json({ error: 'Not signed in' });
  const ents = await orders.entitlementsFor(row.user_id);
  let recommendations = null;
  try {
    const stored = await getStoredRecommendations(row.user_id);
    if (stored) {
      recommendations = {
        headline: stored.headline,
        mode: stored.mode,
        anchor: stored.anchor,
        items: stored.items || [],
        updatedAt: stored.updated_at,
      };
    } else {
      const fresh = await recommend({
        mode: ents.length ? 'next' : 'browse',
        limit: 8,
        userId: row.user_id,
        persist: true,
      });
      recommendations = {
        headline: fresh.headline,
        mode: fresh.data.mode,
        anchor: fresh.data.anchor,
        items: fresh.data.items,
        updatedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn('auth/me recommendations', e.message || e);
  }
  res.json({ ok: true, user: auth.publicUser(row), entitlements: ents, recommendations });
});

app.post('/api/auth/logout', async (req, res) => {
  await auth.destroySession(auth.bearerToken(req));
  res.json({ ok: true });
});

app.get('/api/library', async (req, res) => {
  const row = await auth.sessionUser(auth.bearerToken(req));
  if (!row) return res.status(401).json({ error: 'Not signed in' });
  const ents = await orders.entitlementsFor(row.user_id);
  res.json({ ok: true, entitlements: ents });
});

app.get('/api/library/recommendations', async (req, res) => {
  try {
    const row = await auth.sessionUser(auth.bearerToken(req));
    if (!row) return res.status(401).json({ error: 'Not signed in' });
    const refresh = String(req.query.refresh || '') === '1';
    let stored = refresh ? null : await getStoredRecommendations(row.user_id);
    if (!stored) {
      const fresh = await recommend({
        mode: String(req.query.mode || 'browse'),
        limit: Number(req.query.limit) || 8,
        userId: row.user_id,
        persist: true,
      });
      return res.json({
        ok: true,
        headline: fresh.headline,
        mode: fresh.data.mode,
        anchor: fresh.data.anchor,
        items: fresh.data.items,
        updatedAt: new Date().toISOString(),
      });
    }
    res.json({
      ok: true,
      headline: stored.headline,
      mode: stored.mode,
      anchor: stored.anchor,
      items: stored.items || [],
      updatedAt: stored.updated_at,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* ───────────── Events ───────────── */

app.post('/api/events', async (req, res) => {
  try {
    if (!schemaReady) {
      return res.status(503).json({ error: 'API still starting (schema not ready). Retry in a few seconds.' });
    }
    const body = req.body || {};
    // Support batch { events: [...] } and single event_type payloads (demo-lab)
    if (Array.isArray(body.events)) {
      const results = [];
      for (const ev of body.events.slice(0, 50)) {
        results.push(
          await events.ingestEvent({
            ...ev,
            event_type: ev.event_type || ev.type,
            user_id: ev.user_id || body.user_id,
            session_id: ev.session_id || body.sessionId || body.session_id,
          })
        );
      }
      return res.status(202).json({ ok: true, results });
    }
    const result = await events.ingestEvent(body);

    // Optional legacy forward for YKW-01 until fully cut over
    if (process.env.FORWARD_EVENTS_TO_N8N === '1') {
      fetch(N8N_EVENT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
    }

    return res.status(202).json(result);
  } catch (e) {
    console.error('events', e);
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});

app.post('/api/demo/abandon-scan', async (req, res) => {
  try {
    const session_id = req.body?.session_id || req.query.session_id;
    const force = Boolean(req.body?.force ?? true);
    let order_ids = [];
    if (session_id) {
      await query(
        `UPDATE sessions SET last_activity = NOW() - interval '50 minutes', state = 'checkout'
         WHERE session_id = $1`,
        [session_id]
      );
      // Re-open previously abandoned demo orders so the scanner can publish again
      if (force) {
        await query(
          `UPDATE orders SET status = 'open', abandon_at = NOW() - interval '1 minute', updated_at = NOW()
           WHERE session_id = $1 AND status IN ('open','abandoned')`,
          [session_id]
        );
      } else {
        await query(
          `UPDATE orders SET abandon_at = NOW() - interval '1 minute'
           WHERE session_id = $1 AND status = 'open'`,
          [session_id]
        );
      }
      const { rows: pending } = await query(
        `SELECT id FROM orders WHERE session_id = $1 AND status = 'open'`,
        [session_id]
      );
      order_ids = pending.map((r) => r.id);
    }
    const n = await orders.processAbandonments();
    if (!order_ids.length && session_id) {
      const { rows } = await query(
        `SELECT id FROM orders WHERE session_id = $1 AND status = 'abandoned' ORDER BY updated_at DESC LIMIT 5`,
        [session_id]
      );
      order_ids = rows.map((r) => r.id);
    }
    res.json({ ok: true, abandoned: n, session_id: session_id || null, order_ids });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* ───────────── Paystack ───────────── */

app.get('/api/paystack/config', (_req, res) => {
  res.json({
    publicKey: PAYSTACK_PUBLIC_KEY || null,
    currency: CURRENCY,
    enabled: Boolean(PAYSTACK_PUBLIC_KEY && PAYSTACK_SECRET_KEY),
    channels: ['card', 'mobile_money'],
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

  const amount = Math.round(Number(amount_kes) * 100);
  if (!Number.isFinite(amount) || amount < 100) {
    return res.status(400).json({ error: 'amount_kes too small' });
  }

  const reference = `ykw_${session_id}_${Date.now()}`;
  const order = await orders.createOpenOrder({
    user_id: String(user_id),
    movie_id,
    movie_title,
    genre,
    session_id: String(session_id),
    price_kes: Number(amount_kes),
    paystack_ref: reference,
  });

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
    order_id: order.id,
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

    await events.ingestEvent({
      event_type: 'checkout_start',
      ...metadata,
    });

    res.json({
      authorization_url: data.authorization_url,
      access_code: data.access_code,
      reference: data.reference,
      publicKey: PAYSTACK_PUBLIC_KEY,
      order_id: order.id,
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
  if (!json.status) throw new Error(json.message || `Paystack error ${r.status}`);
  return json.data;
}

async function handlePaystackEvent(event) {
  const name = event.event || '';
  const data = event.data || {};
  if (name === 'charge.success') await emitFromTransaction(data);
  else if (name === 'charge.failed' || name === 'charge.abandoned' || name === 'paymentrequest.failed') {
    await emitFromTransaction({ ...data, status: 'failed' });
  }
}

function mapFailureReason(tx) {
  const raw = (tx.gateway_response || tx.message || tx.status || 'Payment failed').toString();
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient') || lower.includes('balance') || lower.includes('fund')) {
    return 'Insufficient balance';
  }
  if (lower.includes('pin') || lower.includes('otp') || lower.includes('authoris')) {
    return 'Wrong M-Pesa PIN entered';
  }
  if (lower.includes('timeout') || lower.includes('cancel') || lower.includes('abandon') || lower.includes('expired')) {
    return 'Request timed out / cancelled by user';
  }
  if (lower.includes('limit')) return 'Transaction limit exceeded';
  return raw;
}

function metaOf(tx) {
  const m = tx.metadata || {};
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
    order_id: m.order_id || null,
  };
}

async function emitFromTransaction(tx) {
  const meta = metaOf(tx);
  if (!meta.user_id || !meta.session_id) {
    console.warn('transaction missing yakwetu metadata', tx.reference);
    return { emitted: false, reason: 'missing metadata' };
  }

  const success = String(tx.status).toLowerCase() === 'success';
  let order = meta.order_id
    ? (await query(`SELECT * FROM orders WHERE id = $1`, [meta.order_id])).rows[0]
    : await orders.findOrderByRef(tx.reference);

  if (success) {
    if (order) {
      await orders.markOrderPaid(order.id, {
        reference: tx.reference,
        channel: tx.channel || tx.authorization?.channel,
        amount_kes: meta.price_kes,
        raw: tx,
      });
    }
    await events.ingestEvent({
      event_type: 'payment_success',
      ...meta,
      paystack_reference: tx.reference,
    });
    await outbox.enqueue({
      type: 'purchase.confirmed',
      routingKey: 'purchase.confirmed',
      payload: {
        userId: meta.user_id,
        orderId: order?.id || meta.order_id,
        properties: {
          orderId: order?.id || meta.order_id,
          movieId: meta.movie_id,
          movieTitle: meta.movie_title,
          priceKes: meta.price_kes,
          reference: tx.reference,
          phone: meta.phone,
          email: meta.email,
          name: meta.name,
        },
      },
    });
  } else {
    const reason = mapFailureReason(tx);
    if (order) await orders.markOrderFailed(order.id, reason);
    await events.ingestEvent({
      event_type: 'payment_failed',
      ...meta,
      failure_reason: reason,
      paystack_reference: tx.reference,
    });
    await outbox.enqueue({
      type: 'payment.failed',
      routingKey: 'payment.failed',
      payload: {
        userId: meta.user_id,
        orderId: order?.id || meta.order_id,
        properties: {
          orderId: order?.id || meta.order_id,
          movieId: meta.movie_id,
          movieTitle: meta.movie_title,
          priceKes: meta.price_kes,
          reason: events.failureClass(reason),
          failureReason: reason,
          phone: meta.phone,
          email: meta.email,
          name: meta.name,
        },
      },
    });
  }

  return { emitted: true, event_type: success ? 'payment_success' : 'payment_failed' };
}

/* ───────────── Admin CRM ───────────── */

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token || (req.body && req.body.token);
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'invalid admin token' });
  }
  next();
}

app.get('/api/admin/config', (_req, res) => {
  res.json({
    admin_phone_hint: ADMIN_PHONE.replace(/(\+254\d{2})\d{5}(\d{2})/, '$1*****$2'),
    admin_phone: ADMIN_PHONE,
    admin_email: ADMIN_EMAIL || null,
    email_otp: Boolean(ADMIN_EMAIL && notify.emailConfigured()),
    sms_otp: notify.smsConfigured(),
  });
});

app.post('/api/admin/request-otp', async (req, res) => {
  try {
    const channel = String(req.body?.channel || 'sms').toLowerCase() === 'email' ? 'email' : 'sms';
    const destination =
      channel === 'email'
        ? auth.normalizeEmail(req.body?.email || ADMIN_EMAIL)
        : auth.normalizePhone(req.body?.phone || ADMIN_PHONE);

    if (channel === 'sms' && destination !== ADMIN_PHONE) {
      return res.status(403).json({ error: 'Only the configured admin phone can access this dashboard' });
    }
    if (channel === 'email' && (!ADMIN_EMAIL || destination !== ADMIN_EMAIL)) {
      return res.status(403).json({ error: 'Only the configured admin email can access this dashboard' });
    }

    const { code } = await auth.storeOtp({
      channel,
      destination,
      purpose: 'admin',
      name: 'Admin',
    });
    await auth.sendOtpMessage({ channel, destination, code, purpose: 'admin' });
    res.json({ ok: true, channel, destination, expires_in_sec: Math.floor(auth.OTP_TTL_MS / 1000) });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/api/admin/verify-otp', async (req, res) => {
  try {
    const channel = String(req.body?.channel || 'sms').toLowerCase() === 'email' ? 'email' : 'sms';
    const destination =
      channel === 'email'
        ? auth.normalizeEmail(req.body?.email || ADMIN_EMAIL)
        : auth.normalizePhone(req.body?.phone || ADMIN_PHONE);
    const result = await auth.consumeOtp({
      destination,
      purpose: 'admin',
      code: req.body?.code,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, token: ADMIN_TOKEN, phone: ADMIN_PHONE, email: ADMIN_EMAIL, name: 'Admin' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/summary', requireAdmin, async (_req, res) => {
  try {
    const q = async (sql, params = []) => (await query(sql, params)).rows;
    const [users, eventTypes, payments, fails, watches, sessions, nudges, dropoffs, revenue, tasks] =
      await Promise.all([
        q(`SELECT COUNT(*)::int AS n FROM users`),
        q(`SELECT event_type, COUNT(*)::int AS n FROM events GROUP BY event_type ORDER BY n DESC`),
        q(`SELECT COUNT(*)::int AS n FROM events WHERE event_type = 'payment_success'`),
        q(`SELECT COUNT(*)::int AS n FROM events WHERE event_type = 'payment_failed'`),
        q(`SELECT COUNT(*)::int AS n FROM events WHERE event_type = 'watch_complete'`),
        q(`SELECT state, COUNT(*)::int AS n, SUM(CASE WHEN recovered THEN 1 ELSE 0 END)::int AS recovered FROM sessions GROUP BY state`),
        q(`SELECT scenario, channel, COUNT(*)::int AS sent, SUM(CASE WHEN converted THEN 1 ELSE 0 END)::int AS converted FROM nudges GROUP BY scenario, channel`),
        q(`SELECT COALESCE(failure_class,'(unknown)') AS failure_class, COUNT(*)::int AS n FROM dropoffs GROUP BY 1 ORDER BY n DESC`),
        q(`SELECT COALESCE(SUM(price_kes),0)::float AS kes FROM events WHERE event_type = 'payment_success'`),
        q(`SELECT status, COUNT(*)::int AS n FROM crm_tasks GROUP BY status`),
      ]);
    res.json({
      users: users[0]?.n || 0,
      payment_success: payments[0]?.n || 0,
      payment_failed: fails[0]?.n || 0,
      watch_complete: watches[0]?.n || 0,
      revenue_kes: revenue[0]?.kes || 0,
      events_by_type: eventTypes,
      sessions_by_state: sessions,
      nudges,
      dropoffs,
      tasks,
      rabbitmq: outbox.configured(),
      analytics: 'postgres',
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/analytics', requireAdmin, async (_req, res) => {
  try {
    const q = async (sql, params = []) => (await query(sql, params)).rows;
    const nudgeAnalytics = require('./lib/nudge-analytics');
    const [funnel, topFilms, byDay, channels, messaging] = await Promise.all([
      q(`SELECT
           COUNT(*) FILTER (WHERE event_type = 'browse')::int AS browse,
           COUNT(*) FILTER (WHERE event_type = 'checkout_start')::int AS checkout_start,
           COUNT(*) FILTER (WHERE event_type = 'payment_failed')::int AS payment_failed,
           COUNT(*) FILTER (WHERE event_type = 'payment_success')::int AS payment_success,
           COUNT(*) FILTER (WHERE event_type = 'watch_complete')::int AS watch_complete,
           COUNT(*) FILTER (WHERE event_type = 'signup')::int AS signup,
           COUNT(*) FILTER (WHERE event_type = 'nudge_sent')::int AS nudge_sent,
           COUNT(*) FILTER (WHERE event_type = 'payment_abandoned')::int AS payment_abandoned
         FROM events
         WHERE ts > NOW() - interval '30 days'`),
      q(`SELECT movie_id, movie_title, COUNT(*)::int AS views,
                SUM(CASE WHEN event_type = 'payment_success' THEN 1 ELSE 0 END)::int AS purchases,
                COALESCE(SUM(CASE WHEN event_type = 'payment_success' THEN price_kes ELSE 0 END),0)::float AS revenue_kes
         FROM events
         WHERE movie_id IS NOT NULL AND ts > NOW() - interval '30 days'
         GROUP BY movie_id, movie_title
         ORDER BY views DESC NULLS LAST
         LIMIT 15`),
      q(`SELECT date_trunc('day', ts)::date AS day,
                COUNT(*)::int AS events,
                COUNT(*) FILTER (WHERE event_type = 'payment_success')::int AS paid,
                COUNT(*) FILTER (WHERE event_type = 'nudge_sent')::int AS nudges,
                COALESCE(SUM(CASE WHEN event_type = 'payment_success' THEN price_kes ELSE 0 END),0)::float AS revenue_kes
         FROM events
         WHERE ts > NOW() - interval '14 days'
         GROUP BY 1 ORDER BY 1`),
      q(`SELECT channel, COUNT(*)::int AS sent,
                SUM(CASE WHEN converted THEN 1 ELSE 0 END)::int AS converted
         FROM nudges
         WHERE sent_at > NOW() - interval '30 days'
         GROUP BY channel ORDER BY sent DESC`),
      nudgeAnalytics.coverageStats(30),
    ]);
    res.json({
      window_days: 30,
      funnel: funnel[0] || {},
      top_films: topFilms,
      by_day: byDay,
      nudge_channels: channels,
      messaging,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/events', requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT e.id, e.ts, e.event_type, e.user_id, u.name, u.phone, u.email, e.session_id,
            e.movie_title, e.genre, e.price_kes, e.failure_reason
     FROM events e LEFT JOIN users u ON u.user_id = e.user_id
     ORDER BY e.ts DESC LIMIT $1`,
    [limit]
  );
  res.json({ events: rows });
});

app.get('/api/admin/payments', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    `SELECT o.*, u.name, u.phone, u.email
     FROM orders o LEFT JOIN users u ON u.user_id = o.user_id
     ORDER BY o.created_at DESC LIMIT 100`
  );
  res.json({ payments: rows, orders: rows });
});

app.get('/api/admin/followups', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    `SELECT s.session_id, s.user_id, u.name, u.phone, u.email, u.channel_pref, s.state, s.recovered,
            s.nudge_count, s.last_activity, s.last_movie_id, s.last_movie_title, s.last_genre, s.last_price,
            ROUND(EXTRACT(EPOCH FROM (NOW() - s.last_activity))/60)::int AS idle_minutes
     FROM sessions s
     JOIN users u ON u.user_id = s.user_id
     WHERE s.recovered = false AND s.state IN ('browsing','checkout','failed')
     ORDER BY s.last_activity ASC LIMIT 50`
  );
  res.json({ candidates: rows });
});

app.get('/api/admin/nudges', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.sent_at, n.scenario, n.channel, n.converted, n.user_id,
            u.name, u.phone, u.email, n.session_id, LEFT(n.message, 200) AS message
     FROM nudges n LEFT JOIN users u ON u.user_id = n.user_id
     ORDER BY n.sent_at DESC LIMIT 80`
  );
  res.json({ nudges: rows });
});

app.get('/api/admin/contacts', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  let sql = `SELECT user_id, name, phone, email, channel_pref, created_at, last_seen,
                    (SELECT COUNT(*) FROM events e WHERE e.user_id = users.user_id) AS event_count,
                    (SELECT COUNT(*) FROM entitlements en WHERE en.user_id = users.user_id) AS films
             FROM users`;
  if (q) {
    params.push(`%${q}%`);
    sql += ` WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 OR user_id ILIKE $1`;
  }
  sql += ` ORDER BY last_seen DESC NULLS LAST LIMIT 100`;
  const { rows } = await query(sql, params);
  res.json({ contacts: rows });
});

app.get('/api/admin/contacts/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { rows: users } = await query(`SELECT * FROM users WHERE user_id = $1`, [id]);
  if (!users[0]) return res.status(404).json({ error: 'Not found' });
  const [timeline, ents, notes, tasks, nudgeRows, storedRecs] = await Promise.all([
    query(
      `SELECT id, ts, event_type, movie_title, price_kes, failure_reason, session_id
       FROM events WHERE user_id = $1 ORDER BY ts DESC LIMIT 80`,
      [id]
    ),
    query(`SELECT * FROM entitlements WHERE user_id = $1 ORDER BY unlocked_at DESC`, [id]),
    query(`SELECT * FROM crm_notes WHERE user_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT * FROM crm_tasks WHERE user_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT * FROM nudges WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 40`, [id]),
    getStoredRecommendations(id),
  ]);
  let recommendations = storedRecs
    ? {
        headline: storedRecs.headline,
        mode: storedRecs.mode,
        anchor: storedRecs.anchor,
        items: storedRecs.items || [],
        updatedAt: storedRecs.updated_at,
      }
    : null;
  if (!recommendations) {
    try {
      const fresh = await recommend({ mode: 'browse', limit: 8, userId: id, persist: true });
      recommendations = {
        headline: fresh.headline,
        mode: fresh.data.mode,
        anchor: fresh.data.anchor,
        items: fresh.data.items,
        updatedAt: new Date().toISOString(),
      };
    } catch {}
  }
  res.json({
    contact: auth.publicUser(users[0]),
    timeline: timeline.rows,
    entitlements: ents.rows,
    notes: notes.rows,
    tasks: tasks.rows,
    nudges: nudgeRows.rows,
    recommendations,
  });
});

app.post('/api/admin/notes', requireAdmin, async (req, res) => {
  const { user_id, body } = req.body || {};
  if (!user_id || !body) return res.status(400).json({ error: 'user_id and body required' });
  const { rows } = await query(
    `INSERT INTO crm_notes (user_id, body, author) VALUES ($1,$2,'admin') RETURNING *`,
    [user_id, String(body).trim()]
  );
  res.json({ ok: true, note: rows[0] });
});

app.post('/api/admin/tasks', requireAdmin, async (req, res) => {
  const { user_id, session_id, title, body, due_at } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const { rows } = await query(
    `INSERT INTO crm_tasks (user_id, session_id, title, body, due_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [user_id || null, session_id || null, title, body || null, due_at || null]
  );
  res.json({ ok: true, task: rows[0] });
});

app.patch('/api/admin/tasks/:id', requireAdmin, async (req, res) => {
  const status = String(req.body?.status || 'done');
  const { rows } = await query(
    `UPDATE crm_tasks SET status = $2,
       completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE completed_at END
     WHERE id = $1 RETURNING *`,
    [req.params.id, status]
  );
  res.json({ ok: true, task: rows[0] });
});

app.get('/api/admin/tasks', requireAdmin, async (req, res) => {
  const status = req.query.status || 'open';
  const { rows } = await query(
    `SELECT t.*, u.name, u.phone, u.email FROM crm_tasks t
     LEFT JOIN users u ON u.user_id = t.user_id
     WHERE ($1 = 'all' OR t.status = $1)
     ORDER BY t.created_at DESC LIMIT 100`,
    [status]
  );
  res.json({ tasks: rows });
});

app.post('/api/admin/follow-up', requireAdmin, async (req, res) => {
  try {
    const {
      user_id,
      phone,
      email,
      name,
      session_id,
      movie_title,
      message,
      subject,
      scenario,
      channels,
    } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });

    const user = {
      user_id: user_id || auth.userIdFrom(auth.normalizePhone(phone), auth.normalizeEmail(email)),
      name: name || '',
      phone: auth.normalizePhone(phone),
      email: auth.normalizeEmail(email),
      channel_pref: 'both',
    };
    await auth.upsertUser(user);

    const sid = session_id || 'sess_admin_' + Date.now().toString(36);
    const scen = scenario || 'admin_followup';
    const results = await notify.notifyUser(user, {
      subject: subject || `Yakwetu — ${movie_title || 'your film'}`,
      message: String(message).trim(),
      channelsOverride: Array.isArray(channels) && channels.length ? channels : undefined,
      scenario: scen,
      sessionId: sid,
      filmTitle: movie_title || null,
      ctaUrl: req.body?.ctaUrl || req.body?.url || null,
      imageUrl: req.body?.imageUrl || req.body?.poster || null,
    });

    // Analytics (nudges + events + session nudge_count) recorded inside notifyUser

    await query(
      `INSERT INTO crm_tasks (user_id, session_id, title, body, status, completed_at)
       VALUES ($1,$2,$3,$4,'done',NOW())`,
      [user.user_id, sid, `Follow-up: ${scen}`, String(message).trim().slice(0, 280)]
    ).catch(() => {});

    res.json({ ok: true, results, user_id: user.user_id });
  } catch (e) {
    console.error('admin follow-up', e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/api/admin/retrigger', requireAdmin, async (req, res) => {
  try {
    const { type, user_id, order_id, movie_id, movie_title, price_kes, phone, email, name, session_id } =
      req.body || {};
    const rk =
      type === 'abandon'
        ? 'payment.abandoned'
        : type === 'rescue'
          ? 'payment.failed'
          : type === 'upsell'
            ? 'purchase.confirmed'
            : null;
    if (!rk) return res.status(400).json({ error: 'type must be abandon|rescue|upsell' });
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // Prefer an existing order; otherwise create a real one so n8n GET /orders/:id works
    let order = null;
    if (order_id) {
      const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [order_id]);
      order = rows[0] || null;
    }
    if (!order) {
      const { rows } = await query(
        `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user_id]
      );
      order = rows[0] || null;
    }
    if (!order) {
      order = await orders.ensureOrder(
        {
          user_id,
          order_id,
          session_id: session_id || `admin_${Date.now()}`,
          movie_id: movie_id || 'nairobi-half-life',
          movie_title: movie_title || 'Nairobi Half Life',
          genre: 'Crime Drama',
          price_kes: price_kes || 5,
          failure_reason: type === 'rescue' ? 'Insufficient balance' : null,
          phone,
          email,
          name,
        },
        {
          status: type === 'upsell' ? 'paid' : type === 'abandon' ? 'abandoned' : 'failed',
          failReason: 'Insufficient balance',
        }
      );
    }

    const oid = order.id;
    const enq = await outbox.enqueue({
      type: rk,
      routingKey: rk,
      payload: {
        userId: user_id,
        orderId: oid,
        properties: {
          orderId: oid,
          movieId: order.movie_id || movie_id,
          movieTitle: order.movie_title || movie_title,
          priceKes: Number(order.price_kes || price_kes || 5),
          phone: phone || null,
          email: email || null,
          name: name || null,
          manual: true,
          reason: type === 'rescue' ? 'insufficient_funds' : undefined,
        },
      },
    });
    res.json({ ok: true, outbox_id: enq.id, routing_key: rk, order_id: oid });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/admin/queues', requireAdmin, async (_req, res) => {
  try {
    const base = (process.env.RABBITMQ_MGMT_URL || 'http://sinema-broker:15672').replace(/\/$/, '');
    const user = process.env.RABBITMQ_USER || 'sinema';
    const pass = process.env.RABBITMQ_PASSWORD || 'change-me';
    const vhost = encodeURIComponent(process.env.RABBITMQ_VHOST || 'sinema');
    const r = await fetch(`${base}/api/queues/${vhost}`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
      },
    });
    if (!r.ok) {
      return res.status(502).json({ error: `RabbitMQ management ${r.status}`, configured: outbox.configured() });
    }
    const queues = await r.json();
    res.json({
      queues: (queues || []).map((q) => ({
        name: q.name,
        messages: q.messages,
        consumers: q.consumers,
      })),
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e), configured: outbox.configured() });
  }
});

mountCatalog(app);
mountInternal(app);

/** One-shot schema fix (OTP / outbox tables). Header: x-admin-token */
app.post('/api/admin/migrate', requireAdmin, async (_req, res) => {
  try {
    const { migrate } = require('./lib/migrate');
    const result = await migrate();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

async function bootSchemaAndWorkers() {
  const { migrate } = require('./lib/migrate');
  let lastErr;
  for (let i = 0; i < 20; i++) {
    try {
      await migrate();
      schemaReady = true;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`schema migrate attempt ${i + 1}/20 failed:`, e.message || e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (lastErr && !schemaReady) {
    console.error(
      'schema migrate failed — call POST /api/admin/migrate with x-admin-token after DB is up',
      lastErr.message || lastErr
    );
  }

  if (schemaReady) {
    outbox.startDrain(1500);
    orders.startAbandonScanner(20000);
  } else {
    const wait = setInterval(async () => {
      try {
        await migrate();
        schemaReady = true;
        clearInterval(wait);
        outbox.startDrain(1500);
        orders.startAbandonScanner(20000);
        console.log('schema migrate: recovered — starting outbox + abandon scanners');
      } catch (e) {
        console.warn('schema migrate retry:', e.message || e);
      }
    }, 10000);
  }

  outbox.ensureChannel().catch(() => null);
}

function start() {
  // Listen immediately so nginx doesn't 504 during migrate / cold start
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `yakwetu-api :${PORT} | schema=${schemaReady ? 'ready' : 'booting'} | paystack=${Boolean(PAYSTACK_SECRET_KEY)} | sms=${notify.smsConfigured()} | email=${notify.emailConfigured()} | rabbitmq=${outbox.configured()} | analytics=postgres | tmdb=${Boolean(TMDB_API_KEY)}`
    );
  });
  server.on('error', (e) => {
    console.error('http server error', e.message || e);
  });
  bootSchemaAndWorkers().catch((e) => {
    console.error('schema/workers boot failed', e);
  });
}

process.on('uncaughtException', (e) => {
  console.error('uncaughtException', e);
});
process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection', e);
});

start();
