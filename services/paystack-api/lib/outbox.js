'use strict';

const crypto = require('crypto');
const amqp = require('amqplib');
const { query } = require('./db');

const RABBITMQ_URL = process.env.RABBITMQ_URL || '';
const EXCHANGE = 'yakwetu.events';

/** routing_key → queue for n8n consumers */
const BINDINGS = [
  { key: 'payment.abandoned', queue: 'q.n8n.checkout-abandoned' },
  { key: 'payment.failed', queue: 'q.n8n.payment-failed' },
  { key: 'purchase.confirmed', queue: 'q.n8n.post-purchase' },
  { key: 'user.signed_up', queue: 'q.n8n.journeys' },
  { key: 'watch_complete', queue: 'q.n8n.journeys' },
  { key: 'browse', queue: 'q.n8n.intake' },
  { key: 'checkout_start', queue: 'q.n8n.intake' },
  { key: 'payment_success', queue: 'q.n8n.intake' },
  { key: 'payment_failed', queue: 'q.n8n.intake' },
  { key: 'signup', queue: 'q.n8n.intake' },
];

let channel = null;
let connecting = null;

function routingKeyFor(type) {
  const map = {
    payment_abandoned: 'payment.abandoned',
    payment_failed: 'payment.failed',
    payment_success: 'purchase.confirmed',
    purchase_confirmed: 'purchase.confirmed',
    user_signed_up: 'user.signed_up',
    signup: 'user.signed_up',
  };
  return map[type] || type;
}

async function ensureChannel() {
  if (!RABBITMQ_URL) return null;
  if (channel) return channel;
  if (connecting) return connecting;
  connecting = (async () => {
    const conn = await Promise.race([
      amqp.connect(RABBITMQ_URL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RabbitMQ connect timeout (8s)')), 8000)
      ),
    ]);
    conn.on('error', (e) => {
      console.error('rabbitmq connection error', e.message || e);
      channel = null;
      connecting = null;
    });
    conn.on('close', () => {
      channel = null;
      connecting = null;
    });
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
    const declared = new Set();
    for (const b of BINDINGS) {
      if (!declared.has(b.queue)) {
        await ch.assertQueue(b.queue, { durable: true });
        declared.add(b.queue);
      }
      await ch.bindQueue(b.queue, EXCHANGE, b.key);
    }
    channel = ch;
    connecting = null;
    console.log('rabbitmq connected', EXCHANGE);
    return ch;
  })().catch((e) => {
    connecting = null;
    console.error('rabbitmq connect failed', e.message || e);
    return null;
  });
  return connecting;
}

async function enqueue({ type, payload, routingKey, occurredAt }) {
  const id = crypto.randomUUID();
  const rk = routingKey || routingKeyFor(type);
  const envelope = {
    id,
    type,
    occurredAt: occurredAt || new Date().toISOString(),
    ...payload,
  };
  await query(
    `INSERT INTO event_outbox (id, type, exchange, routing_key, payload, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, type, EXCHANGE, rk, JSON.stringify(envelope), envelope.occurredAt]
  );
  return { id, routingKey: rk, envelope };
}

async function publishOne(row) {
  const ch = await ensureChannel();
  if (!ch) {
    throw new Error('RabbitMQ unavailable');
  }
  const body = Buffer.from(JSON.stringify(row.payload));
  ch.publish(EXCHANGE, row.routing_key, body, {
    contentType: 'application/json',
    messageId: row.id,
    persistent: true,
    timestamp: Date.now(),
    type: row.type,
  });
}

async function drainOnce(limit = 40) {
  const { rows } = await query(
    `UPDATE event_outbox
     SET locked_until = NOW() + interval '30 seconds', attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM event_outbox
       WHERE published_at IS NULL
         AND (locked_until IS NULL OR locked_until < NOW())
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit]
  );

  for (const row of rows) {
    try {
      if (typeof row.payload === 'string') row.payload = JSON.parse(row.payload);
      await publishOne(row);
      await query(
        `UPDATE event_outbox SET published_at = NOW(), last_error = NULL, locked_until = NULL WHERE id = $1`,
        [row.id]
      );
    } catch (e) {
      await query(
        `UPDATE event_outbox SET last_error = $2, locked_until = NOW() + interval '15 seconds' WHERE id = $1`,
        [row.id, String(e.message || e).slice(0, 500)]
      );
    }
  }
  return rows.length;
}

function startDrain(intervalMs = 1500) {
  const tick = async () => {
    try {
      // Keep trying RabbitMQ after boot races (API often starts before broker is ready)
      if (RABBITMQ_URL && !channel) {
        await ensureChannel();
      }
      await drainOnce();
    } catch (e) {
      if (e.code === '42P01') return; // tables not migrated yet
      console.error('outbox drain', e.message || e);
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

function configured() {
  return Boolean(RABBITMQ_URL);
}

module.exports = {
  enqueue,
  drainOnce,
  startDrain,
  ensureChannel,
  routingKeyFor,
  configured,
  EXCHANGE,
  BINDINGS,
};
