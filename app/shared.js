/* Yakwetu demo — shared event-tracking helpers.
   Pages POST events to  {base}/webhook/yakwetu-event  (n8n YKW-01).
   If no base URL is saved, events are logged locally so the demo still flows. */

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
  if (saved) return saved;
  // Production default (Dokploy). Local: paste http://localhost:5678 in the settings bar.
  if (location.hostname === 'yakwetu.dontire.com' || location.hostname.endsWith('.dontire.com')) {
    return 'https://n8n.yakwetu.dontire.com';
  }
  return '';
}

function saveCfg(){
  const v = document.getElementById('whBase').value.trim();
  localStorage.setItem('ykw_base', v);
  const st = document.getElementById('cfgStatus');
  st.textContent = v ? '✓ saved — events go to n8n' : 'offline demo mode';
  st.className = 'ok';
}
if (document.getElementById('whBase')) {
  const saved = localStorage.getItem('ykw_base') || '';
  const fallback = webhookBase();
  document.getElementById('whBase').value = saved || (fallback || '');
  document.getElementById('cfgStatus').textContent =
    (saved || fallback) ? '✓ connected' : 'offline demo mode';
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
  // local mirror for the demo log
  const log = JSON.parse(localStorage.getItem('ykw_events') || '[]');
  log.push(payload); localStorage.setItem('ykw_events', JSON.stringify(log));

  const base = webhookBase();
  if (!base) { console.log('[offline]', payload); return { offline: true }; }
  try {
    const r = await fetch(base + '/webhook/yakwetu-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await r.json();
  } catch (e) {
    console.warn('webhook unreachable', e);
    return { error: String(e) };
  }
}

function toast(msg, err = false){
  const t = document.createElement('div');
  t.className = 't' + (err ? ' err' : '');
  t.textContent = msg;
  document.getElementById('toast').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
