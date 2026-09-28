/* Yakwetu storefront — auth + event tracking → /api/events → n8n YKW-01 */

const AUTH_KEY = 'ykw_user';
const AUTH_FLAG = 'ykw_authed';

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

let USER = loadUser();

let SESSION_ID = localStorage.getItem('ykw_session') || (() => {
  const s = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem('ykw_session', s);
  return s;
})();

function newSession() {
  SESSION_ID = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem('ykw_session', SESSION_ID);
  return SESSION_ID;
}

function currentSession() {
  return SESSION_ID;
}

function isLoggedIn() {
  return Boolean(localStorage.getItem(AUTH_FLAG) && USER && USER.phone && USER.name);
}

function saveUser(u) {
  USER = {
    user_id: u.user_id,
    name: u.name,
    phone: u.phone,
    email: u.email || '',
    channel_pref: u.channel_pref || 'sms',
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(USER));
  localStorage.setItem(AUTH_FLAG, '1');
  newSession();
  return USER;
}

function logout() {
  localStorage.removeItem(AUTH_FLAG);
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('ykw_session');
  USER = null;
  location.href = 'login.html';
}

/** Redirect to login unless on login.html / demo-lab.html */
function requireAuth() {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  if (page === 'login.html' || page === 'admin.html') return;
  if (!isLoggedIn()) {
    location.href = 'login.html?next=' + encodeURIComponent(page || 'index.html');
  }
}

requireAuth();

function webhookUrl() {
  const saved = (localStorage.getItem('ykw_base') || '').trim().replace(/\/$/, '');
  if (saved.startsWith('http') && saved.includes('/webhook')) {
    return saved.endsWith('yakwetu-event') ? saved : saved.replace(/\/$/, '') + '/webhook/yakwetu-event';
  }
  if (saved.startsWith('http')) return saved + '/webhook/yakwetu-event';
  return location.origin.replace(/\/$/, '') + '/api/events';
}

function saveCfg() {
  const el = document.getElementById('whBase');
  if (!el) return;
  localStorage.setItem('ykw_base', el.value.trim());
  const st = document.getElementById('cfgStatus');
  if (st) {
    st.textContent = '→ ' + webhookUrl();
    st.className = 'ok';
  }
}

if (document.getElementById('whBase')) {
  document.getElementById('whBase').value = localStorage.getItem('ykw_base') || '';
  document.getElementById('whBase').placeholder = 'leave blank = /api/events (live)';
  const st = document.getElementById('cfgStatus');
  if (st) st.textContent = '→ ' + webhookUrl();
}

async function track(event_type, movie, extra = {}) {
  if (!USER) USER = loadUser();
  if (!USER) {
    return { error: 'not_logged_in' };
  }
  const payload = {
    event_type,
    user_id: USER.user_id,
    name: USER.name,
    phone: USER.phone,
    email: USER.email || '',
    session_id: SESSION_ID,
    movie_id: movie?.id || null,
    movie_title: movie?.title || null,
    genre: movie?.genre || null,
    price_kes: movie?.price || null,
    ts: new Date().toISOString(),
    ...extra,
  };
  const log = JSON.parse(localStorage.getItem('ykw_events') || '[]');
  log.push(payload);
  localStorage.setItem('ykw_events', JSON.stringify(log));

  const url = webhookUrl();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text, status: r.status };
    }
    if (!r.ok) {
      return {
        error: body.hint || body.n8n?.message || body.message || `HTTP ${r.status}`,
        status: r.status,
        body,
      };
    }
    return body;
  } catch (e) {
    console.warn('webhook unreachable', url, e);
    return { error: String(e), url };
  }
}

function toast(msg, err = false) {
  let host = document.getElementById('toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast';
    host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:50;display:flex;flex-direction:column;gap:8px';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 't' + (err ? ' err' : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function renderAuthChip() {
  const el = document.getElementById('who');
  if (el && USER) el.textContent = USER.name + ' · ' + USER.phone;
  const out = document.getElementById('logoutBtn');
  if (out) out.onclick = () => logout();
}

document.addEventListener('DOMContentLoaded', renderAuthChip);
renderAuthChip();
