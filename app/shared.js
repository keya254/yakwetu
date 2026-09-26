/* Yakwetu demo — shared event-tracking helpers.
   Events POST to same-origin /webhook/yakwetu-event (nginx → n8n YKW-01).
   Optional override: paste an n8n base URL in the settings bar. */

const USER = JSON.parse(localStorage.getItem('ykw_user') || 'null') || (() => {
  const u = {
    user_id: 'u_' + Math.floor(1000 + Math.random() * 9000),
    name: 'Wanjiku Mwangi',
    phone: '+254702846542',
    email: 'wanjiku@example.com'
  };
  localStorage.setItem('ykw_user', JSON.stringify(u));
  return u;
})();

const SESSION_ID = localStorage.getItem('ykw_session') || (() => {
  const s = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem('ykw_session', s);
  return s;
})();

function webhookBase(){
  const saved = (localStorage.getItem('ykw_base') || '').replace(/\/$/, '');
  // Prefer same-origin so browser never hits n8n cross-origin (CORS).
  // Empty string = use current site origin via webhookUrl().
  if (saved === '' || saved === 'same' || saved === 'local') return '';
  if (saved) return saved;
  return ''; // same-origin by default
}

function webhookUrl(){
  const base = webhookBase();
  if (!base) return location.origin.replace(/\/$/, '') + '/webhook/yakwetu-event';
  return base.replace(/\/$/, '') + '/webhook/yakwetu-event';
}

function saveCfg(){
  const v = document.getElementById('whBase').value.trim();
  // Blank or "same" → same-origin proxy
  localStorage.setItem('ykw_base', (v === 'same' || v === location.origin) ? '' : v);
  const st = document.getElementById('cfgStatus');
  st.textContent = '✓ ' + webhookUrl();
  st.className = 'ok';
}
if (document.getElementById('whBase')) {
  const saved = localStorage.getItem('ykw_base');
  document.getElementById('whBase').value =
    saved === null || saved === '' ? '' : saved;
  document.getElementById('whBase').placeholder =
    'leave blank = same-origin /webhook (recommended)';
  document.getElementById('cfgStatus').textContent = '→ ' + webhookUrl();
}

async function track(event_type, movie, extra = {}){
  const payload = {
    event_type,
    user_id: USER.user_id, name: USER.name, phone: USER.phone, email: USER.email,
    session_id: SESSION_ID,
    movie_id: movie?.id || null, movie_title: movie?.title || null,
    genre: movie?.genre || null, price_kes: movie?.price || null,
    ts: new Date().toISOString(), ...extra
  };
  const log = JSON.parse(localStorage.getItem('ykw_events') || '[]');
  log.push(payload); localStorage.setItem('ykw_events', JSON.stringify(log));

  const url = webhookUrl();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text, status: r.status }; }
    if (!r.ok) return { error: `HTTP ${r.status}`, body };
    return body;
  } catch (e) {
    console.warn('webhook unreachable', url, e);
    return { error: String(e), url };
  }
}

function toast(msg, err = false){
  const t = document.createElement('div');
  t.className = 't' + (err ? ' err' : '');
  t.textContent = msg;
  document.getElementById('toast').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
