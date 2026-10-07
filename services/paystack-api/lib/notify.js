'use strict';

const emailTpl = require('./email-templates');
const nudgeAnalytics = require('./nudge-analytics');

const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_USERNAME = process.env.AT_USERNAME || '';
const AT_SENDER_ID = process.env.AT_SENDER_ID || '';
const AT_API_URL =
  process.env.AT_API_URL || 'https://api.africastalking.com/version1/messaging';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM =
  process.env.RESEND_FROM || 'Yakwetu Sinema <onboarding@resend.dev>';

function smsConfigured() {
  return Boolean(AT_API_KEY && AT_USERNAME && AT_SENDER_ID);
}

function emailConfigured() {
  return Boolean(RESEND_API_KEY);
}

/**
 * Resolve which channel(s) to send on.
 * - Explicit channelsOverride: send ALL listed that have a contact (SMS and/or email).
 * - Otherwise: one channel — email preferred, SMS fallback (honours channel_pref).
 */
function resolveChannels(user, channelsOverride) {
  const phone = user?.phone || '';
  const email = user?.email || '';

  if (Array.isArray(channelsOverride) && channelsOverride.length) {
    const out = [];
    for (const c of channelsOverride) {
      if (c === 'email' && email && !out.includes('email')) out.push('email');
      if (c === 'sms' && phone && !out.includes('sms')) out.push('sms');
    }
    return out;
  }

  const one = pickChannel(user);
  return one ? [one] : [];
}

/**
 * Pick ONE delivery channel (default product rule):
 * - email if present (priority)
 * - else SMS if phone present
 * - honour explicit channel_pref=sms|email when that contact exists
 */
function pickChannel(user, channelsOverride) {
  if (Array.isArray(channelsOverride) && channelsOverride.length) {
    return resolveChannels(user, channelsOverride)[0] || null;
  }
  const phone = user?.phone || '';
  const email = user?.email || '';
  const pref = String(user?.channel_pref || user?.channelPref || 'both').toLowerCase();

  if (pref === 'sms') return phone ? 'sms' : email ? 'email' : null;
  if (pref === 'email') return email ? 'email' : phone ? 'sms' : null;

  if (email) return 'email';
  if (phone) return 'sms';
  return null;
}

async function sendSms(to, message) {
  if (!smsConfigured()) {
    const err = new Error("Africa's Talking SMS is not configured (AT_*)");
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

async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) {
    const err = new Error('Resend is not configured (RESEND_API_KEY)');
    err.code = 'resend_not_configured';
    throw err;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html: html || `<p>${text || ''}</p>`,
      text: text || undefined,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(json.message || `Resend failed ${r.status}`);
  }
  return json;
}

function pickTemplateFields(opts) {
  const keys = [
    'headline',
    'bodyHtml',
    'ctaUrl',
    'ctaLabel',
    'imageUrl',
    'filmTitle',
    'bundleTitle',
    'genre',
    'priceKes',
    'discountPct',
    'reasonHint',
    'badge',
    'preheader',
    'watchedTitle',
    'recommendedFilms',
  ];
  const out = {};
  for (const k of keys) {
    if (opts[k] != null && opts[k] !== '') out[k] = opts[k];
  }
  return out;
}

/**
 * Notify via SMS and/or email. Records every successful send in nudges + events analytics.
 * Default: one channel (email > SMS). Pass channelsOverride: ['sms','email'] to send both.
 */
async function notifyUser(user, opts = {}) {
  const {
    subject,
    message,
    html,
    channelsOverride,
    scenario,
    template,
    sessionId,
    skipAnalytics,
  } = opts;
  const phone = user?.phone || '';
  const email = user?.email || '';
  const channels = resolveChannels(user, channelsOverride);
  if (!channels.length) return [];

  const scen = scenario || template?.scenario || 'n8n_notify';
  const userId = user?.user_id || user?.userId || user?.id || null;

  // Avoid double-send when API already emailed/SMS'd recs and n8n journeys fires next
  // Avoid double-send when API already sent this scenario and n8n fires next
  const recScenarios = new Set([
    'C_after_watch',
    'C_recs',
    'journey_welcome',
    'after_watch',
    'watch_complete',
    'welcome',
    'signup',
    'A_abandon',
    'B_rescue',
    'B_incentive',
    'C_upsell',
  ]);
  if (userId && recScenarios.has(String(scen)) && !opts.force) {
    try {
      const { recentlyNotified } = require('./internal');
      if (
        await recentlyNotified(userId, [String(scen)], 20, {
          sessionId: opts.sessionId || opts.session_id || null,
          orderId: opts.orderId || opts.order_id || null,
        })
      ) {
        return [{ channel: 'skip', ok: true, skipped: true, reason: 'recently_notified' }];
      }
    } catch {
      /* proceed */
    }
  }

  const tplProps = {
    scenario: scen,
    name: user?.name || template?.name || '',
    message: message || '',
    subject,
    ...(template || {}),
    ...pickTemplateFields(opts),
  };
  const rendered = html
    ? { subject: subject || 'Yakwetu Sinema', html, text: message }
    : emailTpl.renderMarketingEmail(tplProps);
  const finalSubject = subject || rendered.subject;
  const finalHtml = html || rendered.html;
  const finalText = rendered.text || message;
  const sid = sessionId || opts.session_id || null;

  const results = [];

  async function deliver(channel) {
    try {
      if (channel === 'email' && email) {
        await sendEmail({
          to: email,
          subject: finalSubject,
          html: finalHtml,
          text: finalText,
        });
        results.push({ channel: 'email', ok: true, to: email });
        if (!skipAnalytics) {
          await nudgeAnalytics.recordNudge({
            userId,
            sessionId: sid,
            scenario: scen,
            channel: 'email',
            message,
            ok: true,
          });
        }
        return true;
      }
      if (channel === 'sms' && phone) {
        await sendSms(phone, message);
        results.push({ channel: 'sms', ok: true, to: phone });
        if (!skipAnalytics) {
          await nudgeAnalytics.recordNudge({
            userId,
            sessionId: sid,
            scenario: scen,
            channel: 'sms',
            message,
            ok: true,
          });
        }
        return true;
      }
      results.push({ channel, ok: false, error: 'missing contact' });
      return false;
    } catch (e) {
      const errMsg = String(e.message || e);
      results.push({ channel, ok: false, error: errMsg });
      if (!skipAnalytics && userId) {
        await nudgeAnalytics.recordNudge({
          userId,
          sessionId: sid,
          scenario: scen,
          channel,
          message,
          ok: false,
          error: errMsg,
        });
      }
      return false;
    }
  }

  // Explicit multi-channel request (admin / dual ping)
  if (Array.isArray(channelsOverride) && channelsOverride.length > 1) {
    for (const ch of channels) {
      await deliver(ch);
    }
    return results;
  }

  // Single preferred channel, with cross-channel fallback on hard failure
  const primary = channels[0];
  const ok = await deliver(primary);
  if (!ok) {
    const fallback = primary === 'email' ? 'sms' : 'email';
    if (channelsOverride) return results;
    if ((fallback === 'sms' && phone) || (fallback === 'email' && email)) {
      const before = results.length;
      await deliver(fallback);
      if (results.length > before && results[results.length - 1].ok) {
        results[results.length - 1].fallback = true;
      }
    }
  }
  return results;
}

module.exports = {
  sendSms,
  sendEmail,
  notifyUser,
  pickChannel,
  resolveChannels,
  smsConfigured,
  emailConfigured,
  renderMarketingEmail: emailTpl.renderMarketingEmail,
  recordNudge: nudgeAnalytics.recordNudge,
};
