'use strict';

const { query } = require('./db');

/**
 * Persist a successful (or failed) nudge for CRM + admin analytics.
 */
async function recordNudge({
  userId,
  sessionId,
  scenario,
  channel,
  message,
  ok = true,
  error = null,
}) {
  if (!userId || !channel) return null;
  try {
    const { rows } = await query(
      `INSERT INTO nudges (user_id, session_id, scenario, channel, message, sent_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       RETURNING id`,
      [
        userId,
        sessionId || null,
        scenario || 'n8n_notify',
        channel,
        ok ? String(message || '').slice(0, 2000) : `ERROR: ${error || 'send failed'}`.slice(0, 2000),
      ]
    );
    if (ok && sessionId) {
      await query(
        `UPDATE sessions
         SET nudge_count = COALESCE(nudge_count, 0) + 1, last_nudge_at = NOW()
         WHERE session_id = $1`,
        [sessionId]
      ).catch(() => null);
    }
    // First-party analytics event (shows in admin timeline / funnel adjacent)
    if (ok) {
      await query(
        `INSERT INTO events (user_id, session_id, event_type, movie_id, movie_title, genre, price_kes, failure_reason, ts)
         VALUES ($1,$2,'nudge_sent',NULL,NULL,NULL,NULL,$3,NOW())`,
        [userId, sessionId || null, `${scenario || 'nudge'}|${channel}`]
      ).catch(() => null);
    }
    return rows[0]?.id || null;
  } catch (e) {
    console.warn('recordNudge', e.message || e);
    return null;
  }
}

/** Human labels for admin coverage dashboard */
const COVERAGE = [
  {
    issue: 'New signup — needs a first film',
    scenario: 'journey_welcome',
    event: 'user.signed_up / signup',
    workflow: 'Journeys',
  },
  {
    issue: 'Left checkout / cart without paying',
    scenario: 'A_abandon',
    event: 'payment.abandoned',
    workflow: 'YKW 02',
  },
  {
    issue: 'Payment failed (PIN, balance, timeout, declined)',
    scenario: 'B_rescue',
    event: 'payment.failed',
    workflow: 'YKW 03',
  },
  {
    issue: 'Still unpaid after rescue — needs incentive',
    scenario: 'B_incentive',
    event: 'payment.failed (follow-up)',
    workflow: 'YKW 03',
  },
  {
    issue: 'Bought a film — recommend what to watch next',
    scenario: 'C_upsell',
    event: 'purchase.confirmed',
    workflow: 'YKW 04',
  },
  {
    issue: 'Upsell offer expiring',
    scenario: 'C_last_call',
    event: 'purchase.confirmed (reminder)',
    workflow: 'YKW 04',
  },
  {
    issue: 'Finished watching — recommend next title',
    scenario: 'C_after_watch',
    event: 'watch_complete',
    workflow: 'Journeys',
  },
  {
    issue: 'Admin manual follow-up',
    scenario: 'admin_followup',
    event: 'CRM',
    workflow: 'Admin',
  },
];

async function coverageStats(days = 30) {
  const { rows } = await query(
    `SELECT scenario, channel,
            COUNT(*)::int AS sent,
            SUM(CASE WHEN converted THEN 1 ELSE 0 END)::int AS converted,
            SUM(CASE WHEN message LIKE 'ERROR:%' THEN 1 ELSE 0 END)::int AS errors
     FROM nudges
     WHERE sent_at > NOW() - make_interval(days => $1::int)
     GROUP BY scenario, channel`,
    [days]
  );

  const byScenario = {};
  for (const r of rows) {
    const key = r.scenario || 'unknown';
    if (!byScenario[key]) {
      byScenario[key] = { scenario: key, sent: 0, converted: 0, errors: 0, sms: 0, email: 0 };
    }
    byScenario[key].sent += r.sent;
    byScenario[key].converted += r.converted;
    byScenario[key].errors += r.errors;
    if (r.channel === 'sms') byScenario[key].sms += r.sent;
    if (r.channel === 'email') byScenario[key].email += r.sent;
  }

  const coverage = COVERAGE.map((c) => {
    const aliases = [c.scenario];
    if (c.scenario === 'admin_followup') {
      aliases.push('admin_payment_rescue', 'admin_abandon_nudge', 'demo_lab_ping');
    }
    if (c.scenario === 'journey_welcome') aliases.push('welcome');
    const stats = aliases.reduce(
      (acc, a) => {
        const s = byScenario[a];
        if (!s) return acc;
        return {
          sent: acc.sent + s.sent,
          converted: acc.converted + s.converted,
          errors: acc.errors + s.errors,
          sms: acc.sms + s.sms,
          email: acc.email + s.email,
        };
      },
      { sent: 0, converted: 0, errors: 0, sms: 0, email: 0 }
    );
    return {
      ...c,
      ...stats,
      status: stats.sent > 0 ? 'active' : 'ready',
    };
  });

  return {
    days,
    coverage,
    by_scenario: Object.values(byScenario).sort((a, b) => b.sent - a.sent),
    by_channel: rows.reduce((acc, r) => {
      const ch = r.channel || 'unknown';
      if (!acc[ch]) acc[ch] = { channel: ch, sent: 0, converted: 0 };
      acc[ch].sent += r.sent;
      acc[ch].converted += r.converted;
      return acc;
    }, {}),
  };
}

module.exports = { recordNudge, coverageStats, COVERAGE };
