'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3001);
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || '';
const N8N_EVENT_WEBHOOK =
  process.env.N8N_EVENT_WEBHOOK || 'http://yakwetu-n8n:5678/webhook/yakwetu-event';
const CURRENCY = process.env.PAYSTACK_CURRENCY || 'KES';

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

app.get('/api/health', async (_req, res) => {
  let n8n_ping = { ok: false };
  try {
    // Lightweight reachability (n8n healthz), does not fire workflows
    const base = N8N_EVENT_WEBHOOK.replace(/\/webhook\/.*$/, '');
    const r = await fetch(base + '/healthz');
    n8n_ping = { ok: r.ok, status: r.status, base };
  } catch (e) {
    n8n_ping = { ok: false, error: String(e.message || e) };
  }
  res.json({
    ok: true,
    paystack_configured: Boolean(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY),
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
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
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

app.listen(PORT, () => {
  console.log(
    `paystack-api on :${PORT} | configured=${Boolean(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY)} | n8n=${N8N_EVENT_WEBHOOK}`
  );
});
