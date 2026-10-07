'use strict';

const { query } = require('./db');
const outbox = require('./outbox');
const orders = require('./orders');

function failureClass(reason) {
  const lower = String(reason || '').toLowerCase();
  if (lower.includes('insufficient') || lower.includes('balance') || lower.includes('fund')) {
    return 'insufficient_funds';
  }
  if (lower.includes('pin')) return 'wrong_pin';
  if (lower.includes('timeout') || lower.includes('cancel') || lower.includes('abandon')) {
    return 'timeout_or_cancel';
  }
  if (lower.includes('limit')) return 'limit_exceeded';
  return 'declined';
}

async function upsertUserFromEvent(body) {
  const user_id = body.user_id;
  if (!user_id) return;
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const channel_pref =
    body.channel_pref || body.channelPref || (email ? 'email' : phone ? 'sms' : 'email');
  // SMS-only demos must clear a previously stored email or notify keeps picking email.
  const clearEmail = String(channel_pref).toLowerCase() === 'sms' && !email;
  await query(
    `INSERT INTO users (user_id, name, phone, email, channel_pref, last_seen)
     VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       name = COALESCE(NULLIF(EXCLUDED.name,''), users.name),
       phone = COALESCE(NULLIF(EXCLUDED.phone,''), users.phone),
       email = CASE
         WHEN $6::boolean THEN NULL
         ELSE COALESCE(NULLIF(EXCLUDED.email,''), users.email)
       END,
       channel_pref = EXCLUDED.channel_pref,
       last_seen = NOW()`,
    [user_id, body.name || '', phone, email, channel_pref, clearEmail]
  );
}

async function touchSession(body, stateHint) {
  const sid = body.session_id;
  if (!sid || !body.user_id) return;
  let state = stateHint || 'browsing';
  if (body.event_type === 'checkout_start') state = 'checkout';
  if (body.event_type === 'payment_failed') state = 'failed';
  if (body.event_type === 'payment_success') state = 'purchased';

  await query(
    `INSERT INTO sessions (session_id, user_id, state, last_activity, last_movie_id, last_movie_title, last_genre, last_price, recovered)
     VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8)
     ON CONFLICT (session_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       state = CASE
         WHEN sessions.state = 'purchased' THEN sessions.state
         ELSE EXCLUDED.state
       END,
       last_activity = NOW(),
       last_movie_id = COALESCE(EXCLUDED.last_movie_id, sessions.last_movie_id),
       last_movie_title = COALESCE(EXCLUDED.last_movie_title, sessions.last_movie_title),
       last_genre = COALESCE(EXCLUDED.last_genre, sessions.last_genre),
       last_price = COALESCE(EXCLUDED.last_price, sessions.last_price),
       recovered = sessions.recovered OR EXCLUDED.recovered`,
    [
      sid,
      body.user_id,
      state,
      body.movie_id || null,
      body.movie_title || null,
      body.genre || null,
      body.price_kes ?? null,
      body.event_type === 'payment_success',
    ]
  );
}

async function logEvent(body) {
  await query(
    `INSERT INTO events (user_id, session_id, event_type, movie_id, movie_title, genre, price_kes, failure_reason, ts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, NOW()))`,
    [
      body.user_id || null,
      body.session_id || null,
      body.event_type,
      body.movie_id || null,
      body.movie_title || null,
      body.genre || null,
      body.price_kes ?? null,
      body.failure_reason || null,
      body.ts || null,
    ]
  );
}

/**
 * Ingest a storefront / demo-lab event: persist to Postgres + outbox → RabbitMQ.
 * Always attaches a real orders.id for checkout / payment paths.
 */
async function ingestEvent(body) {
  const event_type = String(body.event_type || '').trim();
  if (!event_type) {
    const err = new Error('event_type required');
    err.status = 400;
    throw err;
  }

  await upsertUserFromEvent(body);
  await touchSession(body);
  await logEvent(body);

  let order = null;
  if (event_type === 'checkout_start' && body.user_id && body.movie_id) {
    order = await orders.ensureOrder(body, { status: 'open' });
  } else if (event_type === 'payment_failed' && body.user_id) {
    order = await orders.ensureOrder(
      {
        ...body,
        movie_id: body.movie_id || 'nairobi-half-life',
        movie_title: body.movie_title || 'Nairobi Half Life',
      },
      {
        status: 'failed',
        failReason: body.failure_reason || 'Payment failed',
      }
    );
  } else if (event_type === 'payment_success' && body.user_id) {
    order = await orders.ensureOrder(
      {
        ...body,
        movie_id: body.movie_id || 'nairobi-half-life',
        movie_title: body.movie_title || 'Nairobi Half Life',
      },
      { status: 'paid' }
    );
  } else if (body.order_id) {
    const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [body.order_id]);
    order = rows[0] || null;
  }

  if (event_type === 'payment_failed' && body.failure_reason) {
    await query(
      `INSERT INTO dropoffs (user_id, session_id, movie_id, failure_class)
       VALUES ($1,$2,$3,$4)`,
      [body.user_id, body.session_id, body.movie_id || null, failureClass(body.failure_reason)]
    );
  }

  const orderId = order?.id || body.order_id || null;
  const rkOverride =
    event_type === 'payment_failed'
      ? 'payment.failed'
      : event_type === 'payment_success'
        ? 'purchase.confirmed'
        : event_type === 'signup'
          ? 'user.signed_up'
          : null;

  const { id, routingKey, envelope } = await outbox.enqueue({
    type: rkOverride || event_type,
    routingKey: rkOverride || undefined,
    payload: {
      user_id: body.user_id,
      userId: body.user_id,
      orderId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      session_id: body.session_id,
      movie_id: body.movie_id,
      movie_title: body.movie_title,
      genre: body.genre,
      price_kes: body.price_kes,
      failure_reason: body.failure_reason,
      channel_pref: body.channel_pref,
      properties: {
        orderId,
        movieId: body.movie_id,
        movieTitle: body.movie_title,
        genre: body.genre,
        priceKes: body.price_kes,
        failureReason: body.failure_reason,
        reason: body.failure_reason ? failureClass(body.failure_reason) : undefined,
        sessionId: body.session_id,
        phone: body.phone,
        email: body.email,
        name: body.name,
        channelPref: body.channel_pref,
      },
    },
  });

  // Reliable messaging from API (n8n still gets Rabbit events for LLM copy / follow-ups)
  if (body.user_id) {
    try {
      const {
        recommend,
        sendRecommendedFilmsNotify,
        sendCheckoutJourneyNotify,
      } = require('./internal');

      if (event_type === 'payment_failed') {
        const out = await sendCheckoutJourneyNotify(body.user_id, {
          scenario: 'B_rescue',
          orderId,
          movieId: body.movie_id || order?.movie_id || null,
          movieTitle: body.movie_title || order?.movie_title || null,
          priceKes: body.price_kes || order?.price_kes || 5,
          failureReason: body.failure_reason || null,
          sessionId: body.session_id || null,
        });
        if (out?.skipped) {
          console.log('rescue notify skipped', out.reason);
        } else if (out && !out.ok) {
          console.warn('rescue notify', out.error || out);
        } else if (out?.ok) {
          console.log('rescue notify sent', out.channels || []);
        }
      } else if (event_type === 'watch_complete' || event_type === 'signup') {
        const out = await sendRecommendedFilmsNotify(body.user_id, {
          mode: event_type === 'watch_complete' ? 'next' : 'browse',
          anchor: body.movie_id || null,
          scenario: event_type === 'signup' ? 'journey_welcome' : 'C_after_watch',
          watchedTitle: event_type === 'watch_complete' ? body.movie_title || null : null,
          sessionId: body.session_id || null,
          limit: 3,
        });
        if (out && !out.ok && !out.skipped) {
          console.warn('recommend notify', out.error || out);
        }
      } else if (event_type === 'payment_success') {
        // Immediate “what’s next” so Demo Lab doesn’t wait on YKW 04’s Wait node
        const out = await sendRecommendedFilmsNotify(body.user_id, {
          mode: 'browse',
          anchor: body.movie_id || null,
          scenario: 'C_upsell',
          watchedTitle: body.movie_title || null,
          sessionId: body.session_id || null,
          limit: 3,
          dedupeMinutes: 25,
        });
        if (out && !out.ok && !out.skipped) {
          console.warn('upsell notify', out.error || out);
        }
        await recommend({
          mode: 'browse',
          anchor: body.movie_id || null,
          limit: 8,
          userId: body.user_id,
          persist: true,
        }).catch(() => null);
      }
    } catch (e) {
      console.warn('journey notify', e.message || e);
    }
  }

  return {
    ok: true,
    outbox_id: id,
    routing_key: routingKey,
    order_id: orderId,
    status: 'accepted',
  };
}

module.exports = { ingestEvent, failureClass, upsertUserFromEvent, logEvent, touchSession };
