const AUTH_KEY = 'ykw_user';
const AUTH_FLAG = 'ykw_authed';
const SESSION_KEY = 'ykw_session';
const SESSION_TOKEN_KEY = 'ykw_session_token';
const LIB_KEY = 'ykw_library';
const WATCHED_KEY = 'ykw_watched';
const POSTERS_KEY = 'ykw_posters';
const BASE_KEY = 'ykw_base';

export function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

export function isAuthed() {
  const u = loadUser();
  return Boolean(localStorage.getItem(AUTH_FLAG) && u?.name && (u?.phone || u?.email));
}

export function saveUser(u) {
  const user = {
    user_id: u.user_id,
    name: u.name,
    phone: u.phone || '',
    email: u.email || '',
    channel_pref: u.channel_pref || (u.phone ? 'sms' : 'email'),
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_FLAG, '1');
  newSession();
  return user;
}

export function clearAuth() {
  localStorage.removeItem(AUTH_FLAG);
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function loadSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY) || '';
}

export function saveSessionToken(token) {
  if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
  else localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function currentSession() {
  let s = localStorage.getItem(SESSION_KEY);
  if (!s) {
    s = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

export function newSession() {
  const s = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem(SESSION_KEY, s);
  return s;
}

export function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveLibrary(lib) {
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
}

export function loadWatched() {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveWatched(list) {
  localStorage.setItem(WATCHED_KEY, JSON.stringify(list.slice(0, 40)));
}

export function loadPosterCache() {
  try {
    return JSON.parse(localStorage.getItem(POSTERS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function savePosterCache(map) {
  localStorage.setItem(POSTERS_KEY, JSON.stringify(map));
}

export function webhookUrl() {
  const saved = (localStorage.getItem(BASE_KEY) || '').trim().replace(/\/$/, '');
  if (saved.startsWith('http') && saved.includes('/webhook')) {
    return saved.endsWith('yakwetu-event')
      ? saved
      : saved.replace(/\/$/, '') + '/webhook/yakwetu-event';
  }
  if (saved.startsWith('http')) return saved + '/webhook/yakwetu-event';
  return (typeof location !== 'undefined' ? location.origin : '') + '/api/events';
}

export function saveWebhookBase(v) {
  localStorage.setItem(BASE_KEY, (v || '').trim());
}

export function loadWebhookBase() {
  return localStorage.getItem(BASE_KEY) || '';
}
