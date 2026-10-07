'use strict';

const crypto = require('crypto');
const { query } = require('./db');
const outbox = require('./outbox');

const ABANDON_DELAY_MIN = Number(process.env.ABANDON_DELAY_MIN || 2);

async function createOpenOrder({
  user_id,
  movie_id,
  movie_title,
  genre,
  session_id,
  price_kes,
  paystack_ref,
}) {
  const id = 'ord_' + crypto.randomBytes(8).toString('hex');
  const abandonAt = new Date(Date.now() + ABANDON_DELAY_MIN * 60 * 1000);
  await query(
    `INSERT INTO orders (id, user_id, movie_id, movie_title, genre, session_id, price_kes, status, paystack_ref, abandon_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9)`,
    [
      id,
      user_id,
      movie_id || null,
      movie_title || null,
      genre || null,
      session_id || null,
      price_kes,
      paystack_ref || null,
      abandonAt.toISOString(),
    ]
  );
  return { id, abandon_at: abandonAt.toISOString() };
}

async function markOrderPaid(orderId, { reference, channel, raw, amount_kes }) {
  await query(
    `UPDATE orders SET status = 'paid', updated_at = NOW(), paystack_ref = COALESCE($2, paystack_ref) WHERE id = $1`,
    [orderId, reference || null]
  );
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const order = rows[0];
  if (!order) return null;

  await query(
    `INSERT INTO payments (order_id, user_id, reference, amount_kes, status, channel, raw)
     VALUES ($1,$2,$3,$4,'success',$5,$6)
     ON CONFLICT (reference) DO UPDATE SET status = 'success'`,
    [
      order.id,
      order.user_id,
      reference || order.paystack_ref,
      amount_kes ?? order.price_kes,
      channel || null,
      JSON.stringify(raw || {}),
    ]
  );

  if (order.movie_id) {
    await query(
      `INSERT INTO entitlements (user_id, movie_id, order_id, price_kes)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, movie_id) DO UPDATE SET order_id = EXCLUDED.order_id`,
      [order.user_id, order.movie_id, order.id, order.price_kes]
    );
  }
  return order;
}

async function markOrderFailed(orderId, reason) {
  await query(
    `UPDATE orders SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
    [orderId, reason || 'Payment failed']
  );
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  return rows[0] || null;
}

async function findOrderByRef(reference) {
  const { rows } = await query(`SELECT * FROM orders WHERE paystack_ref = $1`, [reference]);
  return rows[0] || null;
}

async function entitlementsFor(userId) {
  const { rows } = await query(
    `SELECT movie_id, order_id, price_kes, unlocked_at FROM entitlements WHERE user_id = $1 ORDER BY unlocked_at DESC`,
    [userId]
  );
  return rows;
}

/** Scan open orders past abandon_at and emit payment.abandoned once. */
async function processAbandonments() {
  const { rows } = await query(
    `UPDATE orders SET status = 'abandoned', updated_at = NOW()
     WHERE status = 'open' AND abandon_at IS NOT NULL AND abandon_at <= NOW()
     RETURNING *`
  );
  for (const order of rows) {
    const { rows: users } = await query(`SELECT * FROM users WHERE user_id = $1`, [order.user_id]);
    const user = users[0] || {};

    // Persist analytics row (avoid circular require of events.js)
    await query(
      `INSERT INTO events (user_id, session_id, event_type, movie_id, movie_title, genre, price_kes, failure_reason, ts)
       VALUES ($1,$2,'payment_abandoned',$3,$4,$5,$6,NULL,NOW())`,
      [
        order.user_id,
        order.session_id,
        order.movie_id,
        order.movie_title,
        order.genre,
        order.price_kes,
      ]
    ).catch(() => null);

    if (order.session_id) {
      await query(
        `UPDATE sessions SET state = 'abandoned', last_activity = NOW() WHERE session_id = $1`,
        [order.session_id]
      ).catch(() => null);
    }

    await outbox.enqueue({
      type: 'payment.abandoned',
      routingKey: 'payment.abandoned',
      payload: {
        user_id: order.user_id,
        userId: order.user_id,
        orderId: order.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        session_id: order.session_id,
        movie_id: order.movie_id,
        movie_title: order.movie_title,
        genre: order.genre,
        price_kes: order.price_kes,
        channel_pref: user.channel_pref,
        properties: {
          orderId: order.id,
          movieId: order.movie_id,
          movieTitle: order.movie_title,
          genre: order.genre,
          priceKes: Number(order.price_kes),
          sessionId: order.session_id,
          phone: user.phone,
          email: user.email,
          name: user.name,
          channelPref: user.channel_pref,
        },
      },
    });

    // Reliable SMS/email even if n8n is restarting (Demo Lab dual-ping path)
    try {
      const { sendCheckoutJourneyNotify } = require('./internal');
      const out = await sendCheckoutJourneyNotify(order.user_id, {
        scenario: 'A_abandon',
        orderId: order.id,
        movieId: order.movie_id,
        movieTitle: order.movie_title,
        priceKes: order.price_kes,
        sessionId: order.session_id,
      });
      if (out?.skipped) {
        console.log('abandon notify skipped', order.id, out.reason);
      } else if (out && !out.ok) {
        console.warn('abandon notify', order.id, out.error || out);
      } else if (out?.ok) {
        console.log('abandon notify sent', order.id, out.channels || []);
      }
    } catch (e) {
      console.warn('abandon notify', e.message || e);
    }
  }
  return rows.length;
}

function startAbandonScanner(intervalMs = 20000) {
  const tick = async () => {
    try {
      await processAbandonments();
    } catch (e) {
      if (e.code === '42P01') return;
      console.error('abandon scanner', e.message || e);
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

async function findOpenOrderForSession(session_id, user_id) {
  if (!session_id) return null;
  const { rows } = await query(
    `SELECT * FROM orders
     WHERE session_id = $1 AND ($2::text IS NULL OR user_id = $2)
       AND status IN ('open','abandoned','failed')
     ORDER BY created_at DESC LIMIT 1`,
    [session_id, user_id || null]
  );
  return rows[0] || null;
}

/**
 * Ensure a real orders row exists for demo / checkout / payment events.
 * Returns the order row.
 */
async function ensureOrder(body, { status = 'open', failReason = null } = {}) {
  const session_id = body.session_id || null;
  const user_id = body.user_id;
  if (!user_id) return null;

  let order = body.order_id
    ? (await query(`SELECT * FROM orders WHERE id = $1`, [body.order_id])).rows[0]
    : null;
  if (!order && session_id) {
    order = await findOpenOrderForSession(session_id, user_id);
  }

  if (!order) {
    const created = await createOpenOrder({
      user_id,
      movie_id: body.movie_id,
      movie_title: body.movie_title,
      genre: body.genre,
      session_id,
      price_kes: body.price_kes || 5,
      paystack_ref: body.paystack_reference || body.reference || null,
    });
    order = (await query(`SELECT * FROM orders WHERE id = $1`, [created.id])).rows[0];
  }

  if (status === 'failed' && order.status !== 'paid') {
    await markOrderFailed(order.id, failReason || body.failure_reason || 'Payment failed');
    order = (await query(`SELECT * FROM orders WHERE id = $1`, [order.id])).rows[0];
  }
  if (status === 'abandoned' && order.status === 'open') {
    await query(
      `UPDATE orders SET status = 'abandoned', abandon_at = COALESCE(abandon_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [order.id]
    );
    order = (await query(`SELECT * FROM orders WHERE id = $1`, [order.id])).rows[0];
  }
  if (status === 'paid' && order.status !== 'paid') {
    await markOrderPaid(order.id, {
      reference:
        body.paystack_reference || body.reference || order.paystack_ref || `demo_${order.id}`,
      amount_kes: body.price_kes || order.price_kes,
      channel: body.channel || 'demo',
      raw: { source: 'ensureOrder' },
    });
    order = (await query(`SELECT * FROM orders WHERE id = $1`, [order.id])).rows[0];
  }

  return order;
}

module.exports = {
  createOpenOrder,
  markOrderPaid,
  markOrderFailed,
  findOrderByRef,
  findOpenOrderForSession,
  ensureOrder,
  entitlementsFor,
  processAbandonments,
  startAbandonScanner,
  ABANDON_DELAY_MIN,
};
