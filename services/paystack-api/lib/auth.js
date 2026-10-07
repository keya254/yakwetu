'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('./db');
const notify = require('./notify');

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_DAYS = 30;

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\s+/g, '');
  if (!p) return '';
  if (p.startsWith('07') || p.startsWith('01')) p = '+254' + p.slice(1);
  if (p.startsWith('254') && !p.startsWith('+')) p = '+' + p;
  return p;
}

function isKenyanPhone(phone) {
  return /^\+254[17]\d{8}$/.test(phone);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function userIdFrom(phone, email) {
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    return 'u_' + digits.slice(-9);
  }
  const hash = crypto.createHash('sha1').update(email).digest('hex').slice(0, 10);
  return 'u_e_' + hash;
}

function publicUser(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    channel_pref: row.channel_pref || 'sms',
    auth_providers: row.auth_providers || 'otp',
  };
}

async function upsertUser({ user_id, name, phone, email, channel_pref, password_hash, auth_providers }) {
  const emailNorm = normalizeEmail(email);
  const pref = channel_pref || (emailNorm ? 'email' : phone ? 'sms' : 'sms');
  const clearEmail = String(pref).toLowerCase() === 'sms' && !emailNorm;
  const { rows } = await query(
    `INSERT INTO users (user_id, name, phone, email, channel_pref, password_hash, auth_providers, last_seen)
     VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       name = COALESCE(NULLIF(EXCLUDED.name,''), users.name),
       phone = COALESCE(NULLIF(EXCLUDED.phone,''), users.phone),
       email = CASE
         WHEN $8::boolean THEN NULL
         ELSE COALESCE(NULLIF(EXCLUDED.email,''), users.email)
       END,
       channel_pref = EXCLUDED.channel_pref,
       password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
       auth_providers = COALESCE(EXCLUDED.auth_providers, users.auth_providers),
       last_seen = NOW()
     RETURNING *`,
    [
      user_id,
      name || '',
      phone || '',
      emailNorm || '',
      pref,
      password_hash || null,
      auth_providers || 'otp',
      clearEmail,
    ]
  );
  return rows[0];
}

async function findUser({ user_id, phone, email }) {
  if (user_id) {
    const { rows } = await query(`SELECT * FROM users WHERE user_id = $1`, [user_id]);
    return rows[0] || null;
  }
  if (phone) {
    const { rows } = await query(`SELECT * FROM users WHERE phone = $1`, [phone]);
    return rows[0] || null;
  }
  if (email) {
    const { rows } = await query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
    return rows[0] || null;
  }
  return null;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await query(
    `INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`,
    [token, userId, expires.toISOString()]
  );
  return { token, expires_at: expires.toISOString() };
}

async function sessionUser(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.* FROM auth_sessions s
     JOIN users u ON u.user_id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return rows[0] || null;
}

async function destroySession(token) {
  if (!token) return;
  await query(`DELETE FROM auth_sessions WHERE token = $1`, [token]);
}

async function storeOtp({ channel, destination, purpose, name, payload }) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + OTP_TTL_MS);
  const run = async () => {
    await query(`DELETE FROM otp_codes WHERE destination = $1 AND purpose = $2`, [
      destination,
      purpose,
    ]);
    await query(
      `INSERT INTO otp_codes (channel, destination, code, purpose, name, payload, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        channel,
        destination,
        code,
        purpose,
        name || null,
        JSON.stringify(payload || {}),
        expires.toISOString(),
      ]
    );
  };
  try {
    await run();
  } catch (e) {
    if (e.code === '42P01') {
      // Table missing — migrate then retry once
      const { migrate } = require('./migrate');
      await migrate();
      await run();
    } else {
      throw e;
    }
  }
  return { code, expires_at: expires.toISOString() };
}

async function consumeOtp({ destination, purpose, code }) {
  const { rows } = await query(
    `SELECT * FROM otp_codes
     WHERE destination = $1 AND purpose = $2 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [destination, purpose]
  );
  const row = rows[0];
  if (!row) return { ok: false, error: 'Code expired — request a new one' };
  if (row.code !== String(code || '').trim()) {
    return { ok: false, error: 'Incorrect code' };
  }
  await query(`DELETE FROM otp_codes WHERE id = $1`, [row.id]);
  return { ok: true, row };
}

async function sendOtpMessage({ channel, destination, code, purpose }) {
  const label = purpose === 'admin' ? 'admin' : 'login';
  const msg = `Yakwetu ${label} code: ${code}. Valid 10 minutes. Don't share it.`;
  if (channel === 'sms') {
    await notify.sendSms(destination, msg);
  } else {
    const store = (
      process.env.STOREFRONT_URL ||
      process.env.PUBLIC_STOREFRONT_URL ||
      'http://localhost:18080'
    ).replace(/\/$/, '');
    const branded = notify.renderMarketingEmail({
      scenario: 'n8n_notify',
      subject: `Your Yakwetu ${label} code`,
      headline: 'Your one-time code',
      bodyHtml: `Use this code to ${
        purpose === 'admin' ? 'open the admin dashboard' : 'sign in'
      }. It expires in <strong>10 minutes</strong>. Never share it with anyone.<br/><br/><span style="font-size:32px;letter-spacing:6px;font-weight:800;color:#f5a524;font-family:Georgia,serif;">${code}</span><br/><br/><span style="font-size:14px;color:rgba(245,240,230,0.55);">If you didn’t request this, you can ignore this email.</span>`,
      badge: 'Secure login',
      ctaUrl: store,
      ctaLabel: 'Open Yakwetu',
      message: msg,
    });
    await notify.sendEmail({
      to: destination,
      subject: branded.subject,
      text: msg,
      html: branded.html,
    });
  }
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password), hash);
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.headers['x-session-token'] || req.query.token || null;
}

module.exports = {
  normalizePhone,
  isKenyanPhone,
  normalizeEmail,
  isEmail,
  userIdFrom,
  publicUser,
  upsertUser,
  findUser,
  createSession,
  sessionUser,
  destroySession,
  storeOtp,
  consumeOtp,
  sendOtpMessage,
  hashPassword,
  verifyPassword,
  bearerToken,
  OTP_TTL_MS,
};
