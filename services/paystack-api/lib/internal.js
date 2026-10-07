'use strict';

const crypto = require('crypto');
const { query } = require('./db');
const { CURATED, curatedMovies } = require('./catalog');
const notify = require('./notify');

const STOREFRONT_URL = (process.env.STOREFRONT_URL || 'http://localhost:18080').replace(/\/$/, '');
const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY || process.env.ADMIN_TOKEN || 'change-me';

const PRICE = 5;
const TMDB_IMG = 'https://image.tmdb.org/t/p';

function catalogById() {
  const map = new Map();
  for (const m of curatedMovies()) map.set(m.id, m);
  // also raw curated as fallback
  for (const m of CURATED) {
    if (!map.has(m.id)) map.set(m.id, m);
  }
  return map;
}

function filmPrice(m) {
  return Number(m?.price || PRICE);
}

function filmPoster(m) {
  if (!m) return '';
  if (m.poster) return m.poster;
  if (m.backdrop) return m.backdrop;
  const path = m.poster_path || m.backdrop_path;
  if (!path) return '';
  const p = String(path).startsWith('/') ? path : `/${path}`;
  return `${TMDB_IMG}/w500${p}`;
}

function toFilmCard(id, m, overrides = {}) {
  return {
    id,
    title: overrides.title || m?.title || id,
    genres: String(overrides.genre || m?.genre || '')
      .split(/[•,/|]/)
      .map((g) => g.trim())
      .filter(Boolean),
    priceKes: Number(overrides.priceKes || filmPrice(m)),
    poster: filmPoster(m),
    posterUrl: filmPoster(m),
    backdrop: m?.backdrop || '',
  };
}

function requireInternal(req, res, next) {
  const header =
    req.headers['x-internal-token'] ||
    req.headers['x-admin-token'] ||
    (String(req.headers.authorization || '').startsWith('Bearer ')
      ? String(req.headers.authorization).slice(7)
      : '');
  if (!header || header !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

function firstName(name) {
  const n = String(name || '').trim();
  return n ? n.split(/\s+/)[0] : 'there';
}

async function getOrderViewer(orderId, opts = {}) {
  const bad =
    !orderId ||
    orderId === 'undefined' ||
    orderId === 'null' ||
    orderId === 'latest' ||
    orderId === 'missing';

  let order = null;
  if (!bad) {
    const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    order = rows[0] || null;
  }

  // Fallback: latest order for this viewer (covers queued demo msgs without orderId)
  if (!order && opts.userId) {
    const { rows } = await query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [opts.userId]
    );
    order = rows[0] || null;
  }

  if (!order) {
    // Last resort: synthesize a viewer payload so n8n can still notify
    if (!opts.userId && !opts.email && !opts.phone) return null;
    const userId = opts.userId || 'anon';
    const { rows: users } = await query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
    const user = users[0] || {
      user_id: userId,
      name: opts.name || '',
      phone: opts.phone || '',
      email: opts.email || '',
      channel_pref: opts.email ? 'email' : 'sms',
    };
    const movieId = opts.movieId || 'nairobi-half-life';
    const cat = catalogById().get(movieId);
    const film = toFilmCard(movieId, cat, {
      title: opts.movieTitle,
      genre: opts.genre,
      priceKes: opts.priceKes,
    });
    return {
      order: {
        id: orderId && !bad ? orderId : `synth_${userId}`,
        paid: false,
        status: 'open',
        movieIds: [movieId],
        movieId,
        movieTitle: film.title,
        genre: opts.genre || cat?.genre || '',
        priceKes: film.priceKes,
        sessionId: opts.sessionId || null,
        paystackRef: null,
        failureReason: opts.failureReason || null,
        synthesized: true,
      },
      user: {
        id: user.user_id,
        firstName: firstName(user.name || opts.name),
        name: user.name || opts.name || '',
        phone: user.phone || opts.phone || '',
        email: user.email || opts.email || '',
        channelPref: user.channel_pref || (user.email || opts.email ? 'email' : 'sms'),
        channel_pref: user.channel_pref || (user.email || opts.email ? 'email' : 'sms'),
      },
      films: [film],
      ownsAll: false,
      ownedMovieIds: [],
    };
  }

  const { rows: users } = await query(`SELECT * FROM users WHERE user_id = $1`, [order.user_id]);
  const user = users[0] || { user_id: order.user_id };
  const ents = await query(
    `SELECT movie_id FROM entitlements WHERE user_id = $1`,
    [order.user_id]
  );
  const ownedMovieIds = ents.rows.map((r) => r.movie_id).filter(Boolean);
  const movieIds = order.movie_id ? [order.movie_id] : [];
  const paid = order.status === 'paid';
  const ownsAll = movieIds.length > 0 && movieIds.every((id) => ownedMovieIds.includes(id));
  const cat = catalogById();
  const films = movieIds.map((id) => {
    const m = cat.get(id);
    return toFilmCard(id, m, {
      title: order.movie_title,
      genre: order.genre,
      priceKes: order.price_kes,
    });
  });

  return {
    order: {
      id: order.id,
      paid,
      status: order.status,
      movieIds,
      movieId: order.movie_id,
      movieTitle: order.movie_title,
      genre: order.genre,
      priceKes: Number(order.price_kes),
      sessionId: order.session_id,
      paystackRef: order.paystack_ref,
      failureReason: order.failure_reason,
    },
    user: {
      id: user.user_id,
      firstName: firstName(user.name),
      name: user.name || '',
      phone: user.phone || '',
      email: user.email || '',
      channelPref: user.channel_pref || (user.email ? 'email' : 'sms'),
      channel_pref: user.channel_pref || (user.email ? 'email' : 'sms'),
    },
    films,
    ownsAll,
    ownedMovieIds,
  };
}

async function userTaste(userId) {
  if (!userId) return { owned: [], watched: [], anchor: null };
  const [ents, watches] = await Promise.all([
    query(`SELECT movie_id FROM entitlements WHERE user_id = $1`, [userId]).catch(() => ({
      rows: [],
    })),
    query(
      `SELECT movie_id, movie_title FROM events
       WHERE user_id = $1 AND event_type = 'watch_complete' AND movie_id IS NOT NULL
       ORDER BY ts DESC LIMIT 12`,
      [userId]
    ).catch(() => ({ rows: [] })),
  ]);
  const owned = ents.rows.map((r) => r.movie_id).filter(Boolean);
  const watched = watches.rows.map((r) => r.movie_id).filter(Boolean);
  const anchor = watched[0] || owned[0] || null;
  return { owned, watched, anchor };
}

async function saveUserRecommendations(userId, payload) {
  if (!userId) return;
  const items = payload?.data?.items || [];
  const mode = payload?.data?.mode || 'browse';
  const anchor = payload?.data?.anchor || null;
  const headline =
    payload?.headline ||
    (mode === 'next' && anchor
      ? `Because you watched`
      : items.length
        ? 'Recommended for you'
        : 'Popular on Yakwetu');
  await query(
    `INSERT INTO user_recommendations (user_id, mode, anchor, headline, items, updated_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       mode = EXCLUDED.mode,
       anchor = EXCLUDED.anchor,
       headline = EXCLUDED.headline,
       items = EXCLUDED.items,
       updated_at = NOW()`,
    [userId, mode, anchor, headline, JSON.stringify(items)]
  ).catch((e) => console.warn('saveUserRecommendations', e.message || e));
}

async function getStoredRecommendations(userId) {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT user_id, mode, anchor, headline, items, updated_at
     FROM user_recommendations WHERE user_id = $1`,
    [userId]
  ).catch(() => ({ rows: [] }));
  return rows[0] || null;
}

async function recommend({ mode, anchor, exclude = [], limit = 3, userId = null, persist = true }) {
  const cat = catalogById();
  const taste = userId ? await userTaste(userId) : { owned: [], watched: [], anchor: null };
  const excluded = new Set(
    [...(exclude || []), ...taste.owned, ...taste.watched].filter(Boolean)
  );
  const resolvedAnchor = anchor || taste.anchor || null;
  const anchorMovie = resolvedAnchor ? cat.get(resolvedAnchor) : null;
  const anchorGenre = String(anchorMovie?.genre || '')
    .toLowerCase()
    .split(/\s+/)[0];

  let pool = CURATED.filter((m) => m.id && !excluded.has(m.id));
  if (anchorGenre) {
    const same = pool.filter((m) =>
      String(m.genre || '')
        .toLowerCase()
        .includes(anchorGenre)
    );
    const rest = pool.filter((m) => !same.includes(m));
    pool = same.concat(rest);
  }

  const cap = Math.max(1, Math.min(Number(limit) || 3, 12));
  const items = pool.slice(0, cap).map((m) => {
    const matched = [];
    if (
      anchorGenre &&
      String(m.genre || '')
        .toLowerCase()
        .includes(anchorGenre)
    ) {
      matched.push(anchorGenre);
    }
    const reason =
      mode === 'next' && anchorMovie
        ? `Because you watched ${anchorMovie.title}`
        : taste.owned.length && anchorMovie && taste.owned.includes(resolvedAnchor)
          ? `Because you bought ${anchorMovie.title}`
          : matched.length
            ? `Also ${matched.join(', ')}`
            : 'Popular on Yakwetu';
    return {
      movieId: m.id,
      id: m.id,
      title: m.title,
      genre: m.genre || '',
      genres: String(m.genre || '')
        .split(/[•,/|]/)
        .map((g) => g.trim())
        .filter(Boolean),
      priceKes: filmPrice(m),
      price: filmPrice(m),
      pageUrl: `${STOREFRONT_URL}/movie/${m.id}`,
      poster: filmPoster(m),
      posterUrl: filmPoster(m),
      poster_path: m.poster_path || null,
      reason,
      why: { matchedGenres: matched },
    };
  });

  const headline =
    mode === 'next' && anchorMovie
      ? `Because you watched ${anchorMovie.title}`
      : taste.owned.length && anchorMovie
        ? `Because you bought ${anchorMovie.title}`
        : 'Recommended for you';

  const out = {
    headline,
    data: {
      items,
      mode: mode || 'browse',
      anchor: resolvedAnchor,
      userId: userId || null,
    },
  };

  if (persist && userId && items.length) {
    await saveUserRecommendations(userId, out);
  }
  return out;
}

async function recentlyNotified(userId, scenarios, withinMinutes = 40, scope = {}) {
  if (!userId) return false;
  const list = Array.isArray(scenarios) ? scenarios : [scenarios];
  const { orderId = null, sessionId = null } = scope || {};
  const params = [userId, list, withinMinutes];
  let sql = `
    SELECT 1 FROM nudges
    WHERE user_id = $1
      AND scenario = ANY($2::text[])
      AND sent_at > NOW() - make_interval(mins => $3::int)
      AND message NOT LIKE 'ERROR:%'`;
  if (orderId) {
    params.push(String(orderId));
    // Prefer exact order match so a new failed payment still notifies
    sql += ` AND (session_id = $${params.length} OR message LIKE $${params.length + 1})`;
    params.push(`%${orderId}%`);
  } else if (sessionId) {
    params.push(String(sessionId));
    sql += ` AND session_id = $${params.length}`;
  }
  sql += ` LIMIT 1`;
  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  return rows.length > 0;
}

/**
 * Build recs for a user and send email (preferred) or SMS with the recommended films.
 * Used after watch_complete / signup so delivery does not depend only on n8n.
 */
async function sendRecommendedFilmsNotify(userId, opts = {}) {
  if (!userId) return { ok: false, error: 'userId required' };

  const {
    mode = 'next',
    anchor = null,
    scenario = 'C_after_watch',
    watchedTitle = null,
    sessionId = null,
    limit = 3,
    dedupeMinutes = 40,
    force = false,
  } = opts;

  const dedupeScenarios = [scenario];
  if (
    !force &&
    (await recentlyNotified(userId, dedupeScenarios, dedupeMinutes, {
      orderId: null,
      sessionId,
    }))
  ) {
    return { ok: false, skipped: true, reason: 'recently_notified', channels: [] };
  }

  const { rows } = await query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return { ok: false, error: 'user not found' };
  if (!row.email && !row.phone) return { ok: false, error: 'no contact' };

  const rec = await recommend({
    mode,
    anchor,
    limit,
    userId,
    persist: true,
  });
  const items = rec?.data?.items || [];
  if (!items.length) return { ok: false, error: 'no recommendations' };

  const store = STOREFRONT_URL;
  const top = items[0];
  const titles = items.map((i) => i.title).filter(Boolean);
  const recommendedFilms = items.map((i) => ({
    title: i.title,
    genre: (i.genres && i.genres[0]) || i.genre || '',
    priceKes: i.priceKes || i.price || 5,
    id: i.movieId || i.id,
    url: i.pageUrl || `${store}/movie/${i.movieId || i.id}`,
  }));

  const ctaUrl = top.pageUrl || `${store}/movie/${top.movieId || top.id}`;
  const first = firstName(row.name);
  let message;
  if (scenario === 'journey_welcome') {
    message = `Karibu ${first}! Start with ${titles[0]}${
      titles.length > 1 ? ` (also ${titles.slice(1).join(', ')})` : ''
    } — from KES ${top.priceKes || 5}: ${ctaUrl}`;
  } else if (watchedTitle) {
    message = `Nice one, ${first}! After ${watchedTitle}, try ${titles.join(' · ')} — from KES ${
      top.priceKes || 5
    }: ${ctaUrl}`;
  } else {
    message = `${first}, recommended for you: ${titles.join(' · ')} — from KES ${
      top.priceKes || 5
    }: ${ctaUrl}`;
  }
  if (message.length > 300) message = message.slice(0, 297) + '...';

  const user = {
    user_id: row.user_id,
    id: row.user_id,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    channel_pref: row.channel_pref || (row.email ? 'email' : 'sms'),
    channelPref: row.channel_pref || (row.email ? 'email' : 'sms'),
  };

  const results = await notify.notifyUser(user, {
    scenario,
    subject:
      scenario === 'journey_welcome'
        ? `Karibu ${first} — start with ${titles[0]}`
        : watchedTitle
          ? `After ${watchedTitle} — try ${titles[0]}`
          : `Recommended for you: ${titles[0]}`,
    message,
    sessionId,
    force: true,
    filmTitle: titles[0],
    bundleTitle: titles.length > 1 ? titles.slice(1).join(' + ') : null,
    genre: (top.genres && top.genres[0]) || top.genre || '',
    priceKes: top.priceKes || top.price || 5,
    watchedTitle: watchedTitle || null,
    ctaUrl,
    ctaLabel: scenario === 'journey_welcome' ? 'Watch the trailer' : 'Watch next',
    imageUrl: top.poster || top.posterUrl || null,
    recommendedFilms,
  });

  const sent = (results || []).filter((r) => r.ok && !r.skipped);
  return {
    ok: sent.length > 0,
    skipped: false,
    channels: sent.map((r) => r.channel),
    results,
    recommendations: recommendedFilms,
    headline: rec.headline,
  };
}

function toNotifyUser(row) {
  return {
    user_id: row.user_id,
    id: row.user_id,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    channel_pref: row.channel_pref || (row.email ? 'email' : 'sms'),
    channelPref: row.channel_pref || (row.email ? 'email' : 'sms'),
  };
}

/**
 * Reliable abandon / rescue SMS|email from the API (does not depend on n8n staying up).
 * Creates an offer link when possible, then notifies.
 */
async function sendCheckoutJourneyNotify(userId, opts = {}) {
  if (!userId) return { ok: false, error: 'userId required' };
  const {
    scenario = 'A_abandon',
    orderId = null,
    movieId = null,
    movieTitle = null,
    priceKes = 5,
    failureReason = null,
    sessionId = null,
    dedupeMinutes = 25,
    force = false,
  } = opts;

  if (
    !force &&
    (await recentlyNotified(userId, [scenario], dedupeMinutes, { orderId, sessionId }))
  ) {
    return { ok: false, skipped: true, reason: 'recently_notified', channels: [] };
  }

  const { rows } = await query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return { ok: false, error: 'user not found', channels: [] };
  if (!row.email && !row.phone) return { ok: false, error: 'no contact', channels: [] };

  const first = firstName(row.name);
  const title = movieTitle || 'your film';
  const store = STOREFRONT_URL;
  let url = `${store}/browse`;
  let discountPct = scenario === 'B_incentive' ? 10 : scenario === 'A_abandon' ? 10 : 0;
  let totalKes = Number(priceKes) || 5;
  let nudgeId = null;
  let films = [];

  try {
    const mid = movieId || 'nairobi-half-life';
    const code = scenario === 'B_incentive' ? 'PONA10' : null;
    if (scenario === 'A_abandon' || scenario === 'B_rescue' || scenario === 'B_incentive') {
      // Pair cart film with one rec when abandoning
      let movieIds = [mid];
      if (scenario === 'A_abandon') {
        const rec = await recommend({
          mode: 'browse',
          anchor: mid,
          exclude: [mid],
          limit: 1,
          userId,
          persist: true,
        });
        const extra = rec?.data?.items?.[0];
        if (extra?.movieId || extra?.id) {
          movieIds = [mid, extra.movieId || extra.id];
          discountPct = 20;
        }
      }
      const link = await createOfferLink({
        userId,
        orderId,
        scenario,
        step: scenario === 'B_incentive' ? 'incentive' : 'first',
        movieIds,
        discountPct,
        ttlMinutes: 60,
        code,
      });
      url = link.url;
      totalKes = link.totalKes;
      discountPct = link.discountPct;
      nudgeId = link.nudgeId;
      films = link.films || [];
    }
  } catch (e) {
    console.warn('checkout journey offer link', e.message || e);
    if (movieId) url = `${store}/checkout/${encodeURIComponent(movieId)}`;
  }

  let message;
  let subject;
  const orderTag = orderId ? ` [${orderId}]` : '';
  if (scenario === 'A_abandon') {
    const bundle = films[1]?.title;
    message = bundle
      ? `Hi ${first} — ${title} is still in your cart. Grab it with ${bundle} for KES ${totalKes} (${discountPct}% off): ${url}`
      : `Hi ${first} — ${title} is still waiting. Finish for KES ${totalKes}${discountPct ? ` (${discountPct}% off)` : ''}: ${url}`;
    subject = `${first}, ${title} is still waiting`;
  } else if (scenario === 'B_incentive') {
    message = `Still want ${title}, ${first}? Use PONA10 for 10% off — now KES ${totalKes}. ${url}`;
    subject = `10% off ${title} — ends soon`;
  } else {
    // B_rescue — include PONA10 tip so demo still works without n8n incentive wait
    const hint = failureReason
      ? String(failureReason).toLowerCase().includes('pin')
        ? ' The PIN didn’t match.'
        : String(failureReason).toLowerCase().includes('insufficient') ||
            String(failureReason).toLowerCase().includes('balance')
          ? ' Top up M-Pesa and you’re done.'
          : ` (${failureReason}).`
      : ' The payment didn’t go through.';
    message = `Pole ${first} — ${title} is held for you.${hint} Try again (code PONA10 = 10% off): ${url}`;
    subject = `Pole — let’s finish ${title}`;
  }
  if (orderTag) message = `${message}${orderTag}`;
  if (message.length > 320) message = message.slice(0, 317) + '...';

  const results = await notify.notifyUser(toNotifyUser(row), {
    scenario,
    subject,
    message,
    sessionId: sessionId || orderId || null,
    force: true, // already deduped above for this order/scenario
    filmTitle: title,
    bundleTitle: films[1]?.title || null,
    genre: null,
    priceKes: totalKes,
    discountPct: discountPct || null,
    reasonHint: failureReason || null,
    ctaUrl: url,
    ctaLabel:
      scenario === 'A_abandon'
        ? 'Finish checkout'
        : scenario === 'B_incentive'
          ? 'Claim 10% off'
          : 'Complete payment',
    imageUrl: films[0]?.poster || films[0]?.posterUrl || null,
    recommendedFilms: films.map((f) => ({
      title: f.title,
      priceKes: f.priceKes,
      id: f.id,
    })),
  });

  const sent = (results || []).filter((r) => r.ok && !r.skipped);
  return {
    ok: sent.length > 0,
    skipped: false,
    channels: sent.map((r) => r.channel),
    results,
    nudgeId,
    url,
    scenario,
  };
}

async function createOfferLink({
  userId,
  orderId,
  scenario,
  step,
  movieIds,
  discountPct,
  ttlMinutes,
  code,
}) {
  const ids = (movieIds || []).filter(Boolean);
  if (!ids.length) {
    const err = new Error('movieIds required');
    err.status = 400;
    throw err;
  }

  const cat = catalogById();
  const films = ids.map((id) => {
    const m = cat.get(id) || { id, title: id, price: PRICE };
    return {
      id: m.id || id,
      title: m.title || id,
      priceKes: filmPrice(m),
      poster: filmPoster(m),
      posterUrl: filmPoster(m),
    };
  });

  const subtotal = films.reduce((s, f) => s + f.priceKes, 0);
  const pct = Math.max(0, Math.min(90, Number(discountPct) || 0));
  const totalKes = Math.max(1, Math.round(subtotal * (1 - pct / 100)));
  const nudgeId = 'nudge_' + crypto.randomBytes(8).toString('hex');
  const ttl = Math.max(5, Number(ttlMinutes) || 60);
  const expires = new Date(Date.now() + ttl * 60 * 1000);
  const primary = films[0].id;
  const url = `${STOREFRONT_URL}/checkout/${encodeURIComponent(primary)}?nudge=${encodeURIComponent(nudgeId)}&d=${pct}${code ? `&code=${encodeURIComponent(code)}` : ''}`;

  await query(
    `INSERT INTO offer_links (
       id, user_id, order_id, scenario, step, movie_ids, discount_pct, code, total_kes, url, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      nudgeId,
      userId || null,
      orderId || null,
      scenario || null,
      step || null,
      ids,
      pct,
      code || null,
      totalKes,
      url,
      expires.toISOString(),
    ]
  );

  return {
    ok: true,
    status: 'created',
    nudgeId,
    url,
    films,
    totalKes,
    discountPct: pct,
    expiresAt: expires.toISOString(),
    code: code || null,
  };
}

async function getOfferLink(nudgeId) {
  const { rows } = await query(`SELECT * FROM offer_links WHERE id = $1`, [nudgeId]);
  const row = rows[0];
  if (!row) return null;
  return {
    nudgeId: row.id,
    used: Boolean(row.used_at),
    expired: row.expires_at && new Date(row.expires_at) < new Date(),
    url: row.url,
    totalKes: Number(row.total_kes),
    discountPct: Number(row.discount_pct),
    movieIds: row.movie_ids || [],
    userId: row.user_id,
    orderId: row.order_id,
  };
}

function mountInternal(app) {
  app.get('/api/internal/orders/:orderId', requireInternal, async (req, res) => {
    try {
      const data = await getOrderViewer(req.params.orderId, {
        userId: req.query.userId || req.query.user_id || null,
        email: req.query.email || null,
        phone: req.query.phone || null,
        name: req.query.name || null,
        movieId: req.query.movieId || req.query.movie_id || null,
        movieTitle: req.query.movieTitle || req.query.movie_title || null,
        genre: req.query.genre || null,
        priceKes: req.query.priceKes || req.query.price_kes || null,
        sessionId: req.query.sessionId || req.query.session_id || null,
        failureReason: req.query.failureReason || req.query.failure_reason || null,
      });
      if (!data) {
        // Soft 200 so n8n IF nodes can skip instead of hard-failing the run.
        // ownsAll=false when we have a contact — let abandon still attempt an offer.
        const movieId = req.query.movieId || req.query.movie_id || null;
        const hasContact = Boolean(req.query.userId || req.query.user_id || req.query.email || req.query.phone);
        return res.json({
          order: {
            id: req.params.orderId === 'undefined' || req.params.orderId === 'null' ? null : req.params.orderId,
            paid: false,
            status: 'missing',
            movieIds: movieId ? [movieId] : [],
            movieId,
            movieTitle: req.query.movieTitle || req.query.movie_title || null,
            genre: null,
            priceKes: 5,
            sessionId: null,
            paystackRef: null,
            failureReason: null,
            missing: true,
          },
          user: {
            id: req.query.userId || req.query.user_id || null,
            firstName: 'there',
            name: req.query.name || '',
            phone: req.query.phone || '',
            email: req.query.email || '',
            channelPref: req.query.email ? 'email' : 'sms',
            channel_pref: req.query.email ? 'email' : 'sms',
          },
          films: [],
          ownsAll: !hasContact,
          ownedMovieIds: [],
          error: 'order not found',
        });
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/internal/nudges', requireInternal, async (req, res) => {
    try {
      const body = req.body || {};
      const out = await createOfferLink({
        userId: body.userId,
        orderId: body.orderId,
        scenario: body.scenario,
        step: body.step,
        movieIds: body.movieIds,
        discountPct: body.discountPct,
        ttlMinutes: body.ttlMinutes,
        code: body.code,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/internal/nudges/:nudgeId', requireInternal, async (req, res) => {
    try {
      const data = await getOfferLink(req.params.nudgeId);
      if (!data) return res.status(404).json({ error: 'nudge not found' });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // Compatible with sinema-recs-shaped calls from n8n
  app.get('/api/recs/:userId', requireInternal, async (req, res) => {
    try {
      const exclude = String(req.query.exclude || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const out = await recommend({
        mode: String(req.query.mode || 'browse'),
        anchor: req.query.anchor || null,
        exclude,
        limit: Number(req.query.limit) || 6,
        userId: req.params.userId,
        persist: true,
      });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/internal/recommendations/:userId', requireInternal, async (req, res) => {
    try {
      const stored = await getStoredRecommendations(req.params.userId);
      if (stored) {
        return res.json({
          ok: true,
          userId: stored.user_id,
          headline: stored.headline,
          mode: stored.mode,
          anchor: stored.anchor,
          items: stored.items || [],
          updatedAt: stored.updated_at,
        });
      }
      const fresh = await recommend({
        mode: 'browse',
        limit: 8,
        userId: req.params.userId,
        persist: true,
      });
      res.json({
        ok: true,
        userId: req.params.userId,
        headline: fresh.headline,
        mode: fresh.data.mode,
        anchor: fresh.data.anchor,
        items: fresh.data.items,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/internal/users/:userId', requireInternal, async (req, res) => {
    try {
      const { rows } = await query(`SELECT * FROM users WHERE user_id = $1`, [req.params.userId]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'user not found' });
      res.json({
        id: user.user_id,
        user_id: user.user_id,
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
        channel_pref: user.channel_pref || 'both',
        channelPref: user.channel_pref || 'both',
        firstName: firstName(user.name),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  /** Journeys: has this viewer browsed / checked out / watched since signup? */
  app.get('/api/internal/viewers/:userId', requireInternal, async (req, res) => {
    try {
      const userId = req.params.userId;
      const { rows } = await query(
        `SELECT event_type, COUNT(*)::int AS n
         FROM events WHERE user_id = $1 AND ts > NOW() - interval '7 days'
         GROUP BY event_type`,
        [userId]
      );
      const byType = Object.fromEntries(rows.map((r) => [r.event_type, r.n]));
      const played =
        (byType.browse || 0) +
          (byType.checkout_start || 0) +
          (byType.watch_complete || 0) +
          (byType.payment_success || 0) >
        0;
      res.json({
        userId,
        played,
        trailerPlayed: Boolean(byType.browse || byType.watch_complete),
        events: byType,
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/internal/notify', requireInternal, async (req, res) => {
    try {
      const body = req.body || {};
      const phone = String(body.phone || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const message = String(body.message || '').trim();
      if (!message) return res.status(400).json({ error: 'message required' });
      if (!phone && !email) {
        return res.status(400).json({ error: 'phone or email required', skipped: true });
      }

      const user = {
        user_id: body.userId || body.user_id || null,
        name: body.name || body.firstName || '',
        phone,
        email,
        channel_pref: body.channelPref || body.channel_pref || (email ? 'email' : 'sms'),
        channelPref: body.channelPref || body.channel_pref || (email ? 'email' : 'sms'),
      };

      const scenario = body.scenario || 'n8n_notify';
      const sid = body.sessionId || body.session_id || null;
      const results = await notify.notifyUser(user, {
        subject: body.subject,
        message,
        html: body.html,
        scenario,
        sessionId: sid,
        ctaUrl: body.ctaUrl || body.url || null,
        ctaLabel: body.ctaLabel || null,
        imageUrl: body.imageUrl || body.posterUrl || body.poster || null,
        filmTitle: body.filmTitle || body.title || body.cartTitle || body.boughtTitle || null,
        bundleTitle:
          body.bundleTitle ||
          (Array.isArray(body.pickTitles) ? body.pickTitles.join(' + ') : body.pickTitle) ||
          null,
        genre: body.genre || null,
        priceKes: body.priceKes || body.totalKes || null,
        discountPct: body.discountPct || null,
        reasonHint: body.reasonHint || body.strategy || null,
        headline: body.headline || null,
        badge: body.badge || null,
        preheader: body.preheader || null,
        watchedTitle: body.watchedTitle || body.boughtTitle || null,
        recommendedFilms: Array.isArray(body.recommendedFilms)
          ? body.recommendedFilms
          : Array.isArray(body.films)
            ? body.films.map((f) => ({
                title: f.title,
                genre: (f.genres && f.genres[0]) || f.genre || '',
                priceKes: f.priceKes || f.price || null,
                id: f.id || f.movieId,
              }))
            : null,
      });

      const ok = results.some((r) => r.ok);
      // Analytics (nudges + events) recorded inside notify.notifyUser

      res.json({
        ok,
        results,
        channel: results.find((r) => r.ok)?.channel || null,
        channels: results.filter((r) => r.ok).map((r) => r.channel),
        skipped: !ok,
      });
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/internal/notify-recommendations', requireInternal, async (req, res) => {
    try {
      const body = req.body || {};
      const userId = body.userId || body.user_id;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const out = await sendRecommendedFilmsNotify(userId, {
        mode: body.mode || 'next',
        anchor: body.anchor || body.movieId || body.movie_id || null,
        scenario: body.scenario || 'C_after_watch',
        watchedTitle: body.watchedTitle || body.movieTitle || body.movie_title || null,
        sessionId: body.sessionId || body.session_id || null,
        limit: Number(body.limit) || 3,
        force: Boolean(body.force),
      });
      res.status(out.ok || out.skipped ? 200 : 400).json(out);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/internal/stats', requireInternal, async (req, res) => {
    try {
      const days = Math.min(30, Math.max(1, Number(req.query.days) || 1));
      const q = async (sql, params = []) => (await query(sql, params)).rows;
      const [revenue, payments, fails, nudges, top] = await Promise.all([
        q(
          `SELECT COALESCE(SUM(price_kes),0)::float AS kes,
                  COUNT(*)::int AS n
           FROM events
           WHERE event_type = 'payment_success' AND ts > NOW() - make_interval(days => $1::int)`,
          [days]
        ),
        q(
          `SELECT status, COUNT(*)::int AS n FROM payments
           WHERE created_at > NOW() - make_interval(days => $1::int) GROUP BY status`,
          [days]
        ),
        q(
          `SELECT COALESCE(failure_reason,'(unknown)') AS reason, COUNT(*)::int AS n
           FROM orders WHERE status = 'failed' AND updated_at > NOW() - make_interval(days => $1::int)
           GROUP BY 1 ORDER BY n DESC LIMIT 8`,
          [days]
        ),
        q(
          `SELECT scenario, channel, COUNT(*)::int AS sent,
                  SUM(CASE WHEN converted THEN 1 ELSE 0 END)::int AS converted
           FROM nudges WHERE sent_at > NOW() - make_interval(days => $1::int)
           GROUP BY scenario, channel`,
          [days]
        ),
        q(
          `SELECT movie_title, COUNT(*)::int AS purchases
           FROM events WHERE event_type = 'payment_success' AND ts > NOW() - make_interval(days => $1::int)
           GROUP BY movie_title ORDER BY purchases DESC LIMIT 5`,
          [days]
        ),
      ]);
      res.json({
        days,
        revenue_kes: revenue[0]?.kes || 0,
        purchases: revenue[0]?.n || 0,
        payments,
        failures: fails,
        nudges,
        top_films: top,
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}

module.exports = {
  mountInternal,
  requireInternal,
  INTERNAL_API_KEY,
  recommend,
  getStoredRecommendations,
  saveUserRecommendations,
  sendRecommendedFilmsNotify,
  sendCheckoutJourneyNotify,
  recentlyNotified,
};
