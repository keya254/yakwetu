/* Yakwetu demo — shared event-tracking helpers.
   Events POST to same-origin /api/events → paystack-api → n8n YKW-01.
   Optional override: paste a full webhook URL in the settings bar. */

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

let SESSION_ID = localStorage.getItem('ykw_session') || (() => {
  const s = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem('ykw_session', s);
  return s;
})();

/** Start a fresh session (needed after payment_success so abandon can fire again). */
function newSession(){
  SESSION_ID = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem('ykw_session', SESSION_ID);
  return SESSION_ID;
}

function webhookUrl(){
  const saved = (localStorage.getItem('ykw_base') || '').trim().replace(/\/$/, '');
  // Full webhook URL override (advanced)
  if (saved.startsWith('http') && saved.includes('/webhook')) {
    return saved.endsWith('yakwetu-event') ? saved : saved.replace(/\/$/, '') + '/webhook/yakwetu-event';
  }
  // n8n base override
  if (saved.startsWith('http')) {
    return saved + '/webhook/yakwetu-event';
  }
  // Default: same-origin API forwarder (reliable on Dokploy)
  return location.origin.replace(/\/$/, '') + '/api/events';
}

function saveCfg(){
  const v = document.getElementById('whBase').value.trim();
  localStorage.setItem('ykw_base', v);
  const st = document.getElementById('cfgStatus');
  st.textContent = '→ ' + webhookUrl();
  st.className = 'ok';
}
if (document.getElementById('whBase')) {
  document.getElementById('whBase').value = localStorage.getItem('ykw_base') || '';
  document.getElementById('whBase').placeholder =
    'leave blank = /api/events (recommended)';
  document.getElementById('cfgStatus').textContent = '→ ' + webhookUrl();
}

async function track(event_type, movie, extra = {}){
  const payload = {
    event_type,
    user_id: USER.user_id, name: USER.name, phone: USER.phone, email: USER.email,
    session_id: (typeof currentSession === 'function' ? currentSession() : SESSION_ID),
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
    if (!r.ok) {
      return {
        error: body.hint || body.n8n?.message || body.message || `HTTP ${r.status}`,
        status: r.status,
        body
      };
    }
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
