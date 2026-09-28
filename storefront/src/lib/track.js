import { currentSession, loadUser, loadWebhookBase, saveWebhookBase, webhookUrl } from './storage';

export async function track(event_type, movie, extra = {}) {
  const USER = loadUser();
  if (!USER) return { error: 'not_logged_in' };

  const payload = {
    event_type,
    user_id: USER.user_id,
    name: USER.name,
    phone: USER.phone,
    email: USER.email || '',
    session_id: currentSession(),
    movie_id: movie?.id || null,
    movie_title: movie?.title || null,
    genre: movie?.genre || null,
    price_kes: movie?.price || null,
    ts: new Date().toISOString(),
    ...extra,
  };

  try {
    const log = JSON.parse(localStorage.getItem('ykw_events') || '[]');
    log.push(payload);
    localStorage.setItem('ykw_events', JSON.stringify(log.slice(-80)));
  } catch {}

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
    return { error: String(e), url };
  }
}

export { loadWebhookBase, saveWebhookBase, webhookUrl };
