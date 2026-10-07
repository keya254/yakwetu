'use strict';

/**
 * Branded Yakwetu Sinema marketing emails.
 * Table-based HTML for Gmail/Outlook; warm cinema palette (saffron on dark).
 */

const STOREFRONT_URL = (
  process.env.STOREFRONT_URL ||
  process.env.PUBLIC_STOREFRONT_URL ||
  'http://localhost:18080'
).replace(/\/$/, '');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return 'there';
  return n.split(/\s+/)[0];
}

function extractUrl(message) {
  const m = String(message || '').match(/https?:\/\/[^\s<>"']+/);
  return m ? m[0] : '';
}

function stripUrl(message) {
  return String(message || '')
    .replace(/https?:\/\/[^\s<>"']+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[:\s]+$/g, '')
    .trim();
}

/** Friendly subjects + email structure per scenario */
const SCENARIOS = {
  journey_welcome: {
    subject: (p) =>
      p.filmTitle
        ? `Karibu ${firstName(p.name)} — start with ${p.filmTitle}`
        : `Karibu ${firstName(p.name)} — welcome to Yakwetu Sinema`,
    eyebrow: 'Karibu · Welcome',
    headline: (p) => `Your night in starts here, ${firstName(p.name)}`,
    body: (p) =>
      p.filmTitle
        ? `Thanks for joining Yakwetu Sinema — African stories, pay per title. We picked <strong>${esc(p.filmTitle)}</strong>${
            p.genre ? ` (${esc(p.genre)})` : ''
          } to get you started${p.priceKes ? ` for <strong>KES ${esc(p.priceKes)}</strong>` : ''}.`
        : `Thanks for joining Yakwetu Sinema. Browse Kenyan and African films from KES 5 — no subscription, just the title you want tonight.`,
    cta: 'Watch the trailer',
    ctaFallback: 'Browse films',
    badge: 'New member',
  },
  A_abandon: {
    subject: (p) =>
      p.filmTitle
        ? `${firstName(p.name)}, ${p.filmTitle} is still waiting`
        : `${firstName(p.name)}, your film is still in the cart`,
    eyebrow: 'Still interested?',
    headline: (p) => `We saved your seat for ${p.filmTitle || 'tonight’s film'}`,
    body: (p) => {
      const disc =
        p.discountPct && p.priceKes
          ? ` Finish checkout now for <strong>KES ${esc(p.priceKes)}</strong> (${esc(p.discountPct)}% off for the next hour).`
          : p.priceKes
            ? ` It’s ready for <strong>KES ${esc(p.priceKes)}</strong>.`
            : '';
      const bundle = p.bundleTitle
        ? ` Pair it with <strong>${esc(p.bundleTitle)}</strong> and save.`
        : '';
      return `You left <strong>${esc(p.filmTitle || 'a great film')}</strong> at checkout.${disc}${bundle} One tap and you’re watching.`;
    },
    cta: 'Finish checkout',
    badge: 'Saved for you',
  },
  B_rescue: {
    subject: (p) =>
      p.filmTitle
        ? `Pole — let’s finish ${p.filmTitle}`
        : `Pole — let’s finish your payment`,
    eyebrow: 'Quick fix',
    headline: (p) => `No worry, ${firstName(p.name)} — your film is still yours`,
    body: (p) => {
      const why = p.reasonHint
        ? ` ${esc(p.reasonHint)}`
        : ' The payment didn’t go through.';
      return `<strong>${esc(p.filmTitle || 'Your film')}</strong> is held for you.${why} Tap below to try again with M-Pesa or card — takes seconds.`;
    },
    cta: 'Complete payment',
    badge: 'Payment pending',
  },
  B_incentive: {
    subject: (p) =>
      p.filmTitle
        ? `10% off ${p.filmTitle} — ends soon`
        : `A little help to finish — 10% off`,
    eyebrow: 'Special for you',
    headline: (p) => `Still want ${p.filmTitle || 'that film'}, ${firstName(p.name)}?`,
    body: (p) =>
      `Use code <strong>PONA10</strong> for <strong>10% off</strong>${
        p.priceKes ? ` — now <strong>KES ${esc(p.priceKes)}</strong>` : ''
      }. Offer is for the next hour only. Your seat is still waiting.`,
    cta: 'Claim 10% off',
    badge: 'PONA10 · 10% off',
  },
  C_upsell: {
    subject: (p) =>
      p.bundleTitle
        ? `Since you liked ${p.filmTitle || 'that film'} — ${p.bundleTitle}`
        : `Something else you’ll love tonight`,
    eyebrow: 'What to watch next',
    headline: (p) => `Loved ${p.filmTitle || 'the film'}? Keep the night going`,
    body: (p) =>
      p.bundleTitle
        ? `We put together <strong>${esc(p.bundleTitle)}</strong>${
            p.discountPct && p.priceKes
              ? ` at <strong>KES ${esc(p.priceKes)}</strong> (${esc(p.discountPct)}% off)`
              : p.priceKes
                ? ` for <strong>KES ${esc(p.priceKes)}</strong>`
                : ''
          }. Same vibe — ready when you are.`
        : `Here’s a pick that matches what you just watched — pay per title, no subscription.`,
    cta: 'Unlock this bundle',
    badge: (p) => (p.discountPct ? `${p.discountPct}% off` : 'For you'),
  },
  C_after_watch: {
    subject: (p) =>
      p.filmTitle && p.watchedTitle
        ? `After ${p.watchedTitle} — try ${p.filmTitle}`
        : p.filmTitle
          ? `Next up: ${p.filmTitle}`
          : `What to watch next on Yakwetu`,
    eyebrow: 'Because you just watched',
    headline: (p) =>
      p.watchedTitle
        ? `Still in the mood after ${p.watchedTitle}?`
        : `Still in the mood, ${firstName(p.name)}?`,
    body: (p) => {
      const list = Array.isArray(p.recommendedFilms) ? p.recommendedFilms.filter(Boolean) : [];
      if (list.length > 1) {
        const rows = list
          .slice(0, 3)
          .map(
            (f, i) =>
              `<li style="margin:0 0 8px;"><strong>${esc(f.title || 'Film')}</strong>${
                f.genre ? ` · ${esc(f.genre)}` : ''
              }${f.priceKes ? ` · KES ${esc(f.priceKes)}` : ''}${i === 0 ? ' ← top pick' : ''}</li>`
          )
          .join('');
        return `You finished the film — nice. Here are titles picked for you:<ul style="margin:12px 0 0;padding-left:18px;">${rows}</ul>`;
      }
      return p.filmTitle
        ? `You finished the film — nice. Next we recommend <strong>${esc(p.filmTitle)}</strong>${
            p.genre ? ` (${esc(p.genre)})` : ''
          }${
            p.priceKes ? ` for <strong>KES ${esc(p.priceKes)}</strong>` : ''
          }. Pay per title, start whenever you’re ready.`
        : `Browse more Kenyan and African stories — pay only for what you watch.`;
    },
    cta: 'Watch next',
    ctaFallback: 'Browse films',
    badge: 'Recommended for you',
  },
  C_recs: {
    subject: (p) =>
      p.filmTitle
        ? `${firstName(p.name)}, we picked ${p.filmTitle} for you`
        : `${firstName(p.name)}, films recommended for you`,
    eyebrow: 'Recommended for you',
    headline: (p) => `Picks for you, ${firstName(p.name)}`,
    body: (p) => {
      const list = Array.isArray(p.recommendedFilms) ? p.recommendedFilms.filter(Boolean) : [];
      if (list.length) {
        const rows = list
          .slice(0, 3)
          .map(
            (f) =>
              `<li style="margin:0 0 8px;"><strong>${esc(f.title || 'Film')}</strong>${
                f.genre ? ` · ${esc(f.genre)}` : ''
              }${f.priceKes ? ` · KES ${esc(f.priceKes)}` : ''}</li>`
          )
          .join('');
        return `Based on what you watch and buy on Yakwetu, we recommend:<ul style="margin:12px 0 0;padding-left:18px;">${rows}</ul>`;
      }
      return p.filmTitle
        ? `We recommend <strong>${esc(p.filmTitle)}</strong>${
            p.priceKes ? ` for <strong>KES ${esc(p.priceKes)}</strong>` : ''
          }. Pay per title — no subscription.`
        : `Browse Kenyan and African films from KES 5 — pay only for what you watch.`;
    },
    cta: 'See recommendations',
    ctaFallback: 'Browse films',
    badge: 'For you',
  },
  C_last_call: {
    subject: (p) =>
      p.bundleTitle
        ? `Last call: ${p.bundleTitle} offer ends soon`
        : `Last call on your Yakwetu offer`,
    eyebrow: 'Ending soon',
    headline: (p) => `Last chance, ${firstName(p.name)}`,
    body: (p) =>
      `Your bundle${p.bundleTitle ? ` (<strong>${esc(p.bundleTitle)}</strong>)` : ''}${
        p.priceKes ? ` at <strong>KES ${esc(p.priceKes)}</strong>` : ''
      } won’t stay at this price much longer. Grab it before it expires.`,
    cta: 'Get it before it expires',
    badge: 'Limited time',
  },
  demo_lab_ping: {
    subject: () => 'Yakwetu Demo Lab — channel check',
    eyebrow: 'Demo',
    headline: () => 'Dual-channel ping OK',
    body: (p) => esc(stripUrl(p.message) || 'Your SMS/email path is working.'),
    cta: 'Open Yakwetu',
    badge: 'Demo Lab',
  },
  admin_followup: {
    subject: (p) => p.subject || 'A note from Yakwetu Sinema',
    eyebrow: 'From the Yakwetu team',
    headline: (p) => `Hi ${firstName(p.name)}`,
    body: (p) => esc(stripUrl(p.message) || 'We saved something for you.'),
    cta: 'Open Yakwetu',
    badge: null,
  },
  n8n_notify: {
    subject: (p) => p.subject || 'Yakwetu Sinema',
    eyebrow: 'Yakwetu Sinema',
    headline: (p) => `Hi ${firstName(p.name)}`,
    body: (p) => esc(stripUrl(p.message) || ''),
    cta: 'Open Yakwetu',
    badge: null,
  },
};

function resolveScenario(scenario) {
  const key = String(scenario || 'n8n_notify').trim();
  if (SCENARIOS[key]) return { key, cfg: SCENARIOS[key] };
  const aliases = {
    welcome: 'journey_welcome',
    signup: 'journey_welcome',
    abandon: 'A_abandon',
    abandonment: 'A_abandon',
    checkout_abandoned: 'A_abandon',
    rescue: 'B_rescue',
    payment_failed: 'B_rescue',
    incentive: 'B_incentive',
    upsell: 'C_upsell',
    after_watch: 'C_after_watch',
    watch_complete: 'C_after_watch',
    recommendations: 'C_recs',
    recs: 'C_recs',
    recommended: 'C_recs',
    last_call: 'C_last_call',
    demo: 'demo_lab_ping',
    dual_helper: 'n8n_notify',
  };
  const mapped = aliases[key] || aliases[key.replace(/^ykw[_-]?/i, '')] || 'n8n_notify';
  return { key: mapped, cfg: SCENARIOS[mapped] || SCENARIOS.n8n_notify };
}

/**
 * @param {object} props
 * @returns {{ subject: string, html: string, text: string }}
 */
function renderMarketingEmail(props = {}) {
  const {
    scenario,
    name = '',
    message = '',
    subject: subjectOverride,
    headline: headlineOverride,
    bodyHtml,
    ctaUrl,
    ctaLabel,
    imageUrl,
    filmTitle,
    bundleTitle,
    genre,
    priceKes,
    discountPct,
    reasonHint,
    badge: badgeOverride,
    preheader,
    watchedTitle,
    recommendedFilms,
  } = props;

  const { cfg } = resolveScenario(scenario);
  const p = {
    name,
    message,
    subject: subjectOverride,
    filmTitle,
    bundleTitle,
    genre,
    priceKes,
    discountPct,
    reasonHint,
    watchedTitle,
    recommendedFilms,
  };

  const url = ctaUrl || extractUrl(message) || `${STOREFRONT_URL}/browse`;
  const subject =
    subjectOverride ||
    (typeof cfg.subject === 'function' ? cfg.subject(p) : cfg.subject) ||
    'Yakwetu Sinema';
  const headline =
    headlineOverride ||
    (typeof cfg.headline === 'function' ? cfg.headline(p) : cfg.headline);
  const body =
    bodyHtml ||
    (typeof cfg.body === 'function' ? cfg.body(p) : cfg.body) ||
    esc(stripUrl(message));
  const cta =
    ctaLabel ||
    cfg.cta ||
    (filmTitle || bundleTitle ? cfg.ctaFallback : null) ||
    cfg.ctaFallback ||
    'Open Yakwetu';
  const badge =
    badgeOverride !== undefined
      ? badgeOverride
      : typeof cfg.badge === 'function'
        ? cfg.badge(p)
        : cfg.badge;
  // Prefer real posters (jpg/png). SVG banners are unreliable in Gmail — use HTML hero instead.
  const posterOk =
    imageUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(imageUrl) && !/svg/i.test(imageUrl);
  const heroImg = posterOk ? imageUrl : null;
  const preview =
    preheader ||
    stripUrl(message).slice(0, 110) ||
    'African films · pay per title · Yakwetu Sinema';

  const htmlHero = heroImg
    ? `<tr>
            <td style="padding:0;line-height:0;background:#0c0a08;">
              <img src="${esc(heroImg)}" width="560" alt="${esc(filmTitle || bundleTitle || 'Yakwetu Sinema')}" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
            </td>
          </tr>`
    : `<tr>
            <td style="padding:0;background:linear-gradient(135deg,#3d2a12 0%,#1a1510 48%,#2a2118 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 28px 32px;font-family:Georgia,'Times New Roman',serif;">
                    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#f5a524;font-family:Arial,Helvetica,sans-serif;margin-bottom:10px;">Tonight on Yakwetu</div>
                    <div style="font-size:28px;line-height:1.2;font-weight:700;color:#fff8ec;letter-spacing:-0.02em;">
                      ${esc(filmTitle || bundleTitle || 'Stories from home.')}
                    </div>
                    <div style="margin-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:rgba(245,240,230,0.65);">
                      Pay per title · No subscription · M-Pesa ready
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(subject)}</title>
<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#141210;color:#f5f0e6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141210;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1c1916;border-radius:16px;overflow:hidden;border:1px solid rgba(245,240,230,0.1);">
          <!-- Brand bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#2a2118 0%,#1a1510 55%,#3d2a12 100%);padding:22px 28px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" width="44">
                    <div style="width:36px;height:36px;border-radius:8px;background:#0c0a08;border:2px solid #f5a524;text-align:center;line-height:32px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#f5a524;">Y</div>
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#fff8ec;line-height:1.1;">
                      Yakwetu<span style="color:#f5a524;font-weight:600;"> Sinema</span>
                    </div>
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,230,0.55);padding-top:4px;">
                      African films · pay per title
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${htmlHero}

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
              ${
                badge
                  ? `<div style="display:inline-block;background:rgba(245,165,36,0.15);color:#f5a524;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;margin-bottom:14px;">${esc(badge)}</div>`
                  : ''
              }
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(245,240,230,0.45);margin-bottom:8px;">${esc(cfg.eyebrow || 'Yakwetu')}</div>
              <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:700;color:#fff8ec;letter-spacing:-0.02em;">${esc(headline)}</h1>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:rgba(245,240,230,0.82);">${body}</p>
              ${
                filmTitle || priceKes
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#141210;border-radius:12px;border:1px solid rgba(245,240,230,0.08);">
                <tr>
                  <td style="padding:14px 16px;">
                    ${filmTitle ? `<div style="font-size:15px;font-weight:700;color:#fff8ec;">${esc(filmTitle)}${bundleTitle ? ` <span style="color:rgba(245,240,230,0.45);font-weight:500;">+</span> ${esc(bundleTitle)}` : ''}</div>` : ''}
                    ${genre ? `<div style="font-size:13px;color:rgba(245,240,230,0.5);padding-top:4px;">${esc(genre)}</div>` : ''}
                    ${priceKes ? `<div style="font-size:18px;font-weight:800;color:#f5a524;padding-top:8px;">KES ${esc(priceKes)}${discountPct ? ` <span style="font-size:13px;font-weight:600;color:rgba(245,165,36,0.75);">· ${esc(discountPct)}% off</span>` : ''}</div>` : ''}
                  </td>
                </tr>
              </table>`
                  : ''
              }
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="border-radius:10px;background:#f5a524;">
                    <a href="${esc(url)}" style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#1a1208;text-decoration:none;border-radius:10px;">
                      ${esc(cta)} →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:12px;line-height:1.4;color:rgba(245,240,230,0.4);word-break:break-all;">
                Or open: <a href="${esc(url)}" style="color:#f5a524;text-decoration:underline;">${esc(url)}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 28px 28px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid rgba(245,240,230,0.08);">
              <p style="margin:0 0 6px;font-size:13px;color:rgba(245,240,230,0.55);">
                Yakwetu Sinema — Kenyan &amp; African films, pay only for what you watch.
              </p>
              <p style="margin:0;font-size:12px;color:rgba(245,240,230,0.35);">
                <a href="${esc(STOREFRONT_URL)}" style="color:#f5a524;text-decoration:none;">${esc(STOREFRONT_URL.replace(/^https?:\/\//, ''))}</a>
                · You’re getting this because you signed up or started checkout with us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    headline,
    '',
    stripUrl(message) || String(body).replace(/<[^>]+>/g, ''),
    filmTitle ? `Film: ${filmTitle}` : '',
    priceKes ? `Price: KES ${priceKes}` : '',
    '',
    `${cta}: ${url}`,
    '',
    'Yakwetu Sinema — African films, pay per title.',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

module.exports = {
  renderMarketingEmail,
  STOREFRONT_URL,
  resolveScenario,
  firstName,
  stripUrl,
  extractUrl,
};
