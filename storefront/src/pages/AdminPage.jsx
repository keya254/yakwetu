import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Wordmark from '../components/Wordmark';

const TOKEN_KEY = 'ykw_admin_token';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

async function api(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const headers = Object.assign({ 'x-admin-token': token }, opts.headers || {});
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetch(path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export default function AdminPage() {
  const [cfg, setCfg] = useState(null);
  const [authed, setAuthed] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [channel, setChannel] = useState('sms');
  const [code, setCode] = useState('');
  const [gateErr, setGateErr] = useState('');
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactQ, setContactQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [nudges, setNudges] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [queues, setQueues] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [msgDrafts, setMsgDrafts] = useState({});

  const unlock = useCallback(() => setAuthed(true), []);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    const [s, f, e, n, p, t, q, a] = await Promise.all([
      api('/api/admin/summary'),
      api('/api/admin/followups'),
      api('/api/admin/events?limit=40'),
      api('/api/admin/nudges'),
      api('/api/admin/payments'),
      api('/api/admin/tasks?status=open'),
      api('/api/admin/queues').catch(() => ({ queues: [] })),
      api('/api/admin/analytics').catch(() => null),
    ]);
    setSummary(s);
    setFollowups(f.candidates || []);
    setEvents(e.events || []);
    setNudges(n.nudges || []);
    setOrders(p.orders || p.payments || []);
    setTasks(t.tasks || []);
    setQueues(q.queues || []);
    setAnalytics(a);
    unlock();
  }, [unlock]);

  useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => null);
    if (localStorage.getItem(TOKEN_KEY)) refresh().catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      setAuthed(false);
    });
  }, [refresh]);

  async function requestOtp() {
    setGateErr('');
    try {
      const body =
        channel === 'email'
          ? { channel: 'email', email: cfg?.admin_email }
          : { channel: 'sms', phone: cfg?.admin_phone };
      const r = await fetch('/api/admin/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'OTP failed');
      setGateErr(`Code sent via ${d.channel} to ${d.destination}`);
    } catch (e) {
      setGateErr(e.message);
    }
  }

  async function verifyOtp() {
    setGateErr('');
    try {
      const body =
        channel === 'email'
          ? { channel: 'email', email: cfg?.admin_email, code }
          : { channel: 'sms', phone: cfg?.admin_phone, code };
      const r = await fetch('/api/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Verify failed');
      localStorage.setItem(TOKEN_KEY, d.token);
      await refresh();
    } catch (e) {
      setGateErr(e.message);
    }
  }

  async function searchContacts() {
    const d = await api(`/api/admin/contacts?q=${encodeURIComponent(contactQ)}`);
    setContacts(d.contacts || []);
  }

  async function openContact(id) {
    setSelected(id);
    const d = await api(`/api/admin/contacts/${encodeURIComponent(id)}`);
    setDetail(d);
    setTab('contacts');
  }

  async function sendFollow(row, i, channels) {
    const message = msgDrafts[i] || defaultMsg(row);
    const data = await api('/api/admin/follow-up', {
      method: 'POST',
      body: JSON.stringify({
        user_id: row.user_id,
        phone: row.phone,
        email: row.email,
        name: row.name,
        session_id: row.session_id,
        movie_title: row.last_movie_title,
        message,
        channels,
        scenario: row.state === 'failed' ? 'admin_payment_rescue' : 'admin_abandon_nudge',
      }),
    });
    alert(`Sent: ${(data.results || []).map((r) => `${r.channel}:${r.ok ? 'ok' : r.error}`).join(', ')}`);
    await refresh();
  }

  async function saveNote() {
    if (!selected || !noteBody.trim()) return;
    await api('/api/admin/notes', {
      method: 'POST',
      body: JSON.stringify({ user_id: selected, body: noteBody.trim() }),
    });
    setNoteBody('');
    await openContact(selected);
  }

  async function addTask() {
    if (!selected) return;
    const title = prompt('Task title');
    if (!title) return;
    await api('/api/admin/tasks', {
      method: 'POST',
      body: JSON.stringify({ user_id: selected, title }),
    });
    await openContact(selected);
    await refresh();
  }

  function defaultMsg(r) {
    const first = (r.name || '').split(' ')[0] || 'there';
    const film = r.last_movie_title || 'your film';
    const link = `${location.origin}/checkout/${encodeURIComponent(r.last_movie_id || 'nairobi-half-life')}?resume=${r.session_id}`;
    if (r.state === 'failed') {
      return `Hi ${first} — your payment for ${film} didn’t go through. No money was lost. Retry: ${link}`;
    }
    return `Hi ${first} — ${film} is still waiting on Yakwetu. Finish checkout: ${link}`;
  }

  if (!authed) {
    return (
      <div className="page page-narrow" style={{ paddingTop: 48 }}>
        <div className="card">
          <Wordmark to="/" />
          <h1 style={{ marginTop: 16, fontSize: 22 }}>Admin CRM</h1>
          <p className="muted" style={{ margin: '8px 0 16px' }}>
            OTP to the configured admin phone or email.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" className={`chip${channel === 'sms' ? ' on' : ''}`} onClick={() => setChannel('sms')}>
              SMS
            </button>
            <button
              type="button"
              className={`chip${channel === 'email' ? ' on' : ''}`}
              onClick={() => setChannel('email')}
              disabled={!cfg?.admin_email}
            >
              Email
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>
            {channel === 'sms' ? cfg?.admin_phone : cfg?.admin_email || 'Set ADMIN_EMAIL'}
          </p>
          <div className="stack">
            <button type="button" className="btn btn-buy" onClick={requestOtp}>
              Send admin OTP
            </button>
            <div className="field">
              <label>Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
            </div>
            <button type="button" className="btn btn-secondary" onClick={verifyOtp}>
              Unlock
            </button>
            {gateErr ? <p className="muted">{gateErr}</p> : null}
          </div>
          <p style={{ marginTop: 16 }}>
            <Link to="/" style={{ color: 'var(--saffron)' }}>
              ← Storefront
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-crm">
      <header className="site-header">
        <div className="header-left">
          <Wordmark to="/browse" />
          <nav className="header-nav" style={{ display: 'flex' }}>
            {[
              ['overview', 'Overview'],
              ['followups', 'Follow-ups'],
              ['contacts', 'Contacts'],
              ['payments', 'Payments'],
              ['nudges', 'Nudges'],
              ['tasks', 'Tasks'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="linkish"
                style={{ color: tab === id ? 'var(--text)' : 'var(--muted)' }}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()}>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              localStorage.removeItem(TOKEN_KEY);
              setAuthed(false);
            }}
          >
            Lock
          </button>
          <Link to="/demo-lab.html" className="btn btn-ghost btn-sm">
            Demo Lab
          </Link>
        </div>
      </header>

      <main className="my-films" style={{ paddingTop: 24 }}>
        {tab === 'overview' && summary ? (
          <>
            <h1>Overview</h1>
            <p className="lede">Pipeline health for Yakwetu Sinema.</p>
            <div className="admin-stats">
              {[
                ['Users', summary.users],
                ['Paid', summary.payment_success],
                ['Failed', summary.payment_failed],
                ['Watches', summary.watch_complete],
                ['Revenue KES', Math.round(summary.revenue_kes || 0)],
              ].map(([k, v]) => (
                <div className="admin-stat" key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </div>
              ))}
            </div>
            <div className="admin-panels" style={{ marginTop: 24 }}>
              <section className="purchase-card">
                <h2 style={{ fontSize: 16, marginBottom: 10 }}>RabbitMQ queues</h2>
                {queues.length ? (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Queue</th>
                        <th>Messages</th>
                        <th>Consumers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queues.map((q) => (
                        <tr key={q.name}>
                          <td>{q.name}</td>
                          <td>{q.messages}</td>
                          <td>{q.consumers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">No queue data (RabbitMQ management unreachable or empty).</p>
                )}
                <p className="muted" style={{ marginTop: 8 }}>
                  Analytics: Postgres (first-party) · RabbitMQ: {summary.rabbitmq ? 'on' : 'off'}
                </p>
              </section>
              <section className="purchase-card">
                <h2 style={{ fontSize: 16, marginBottom: 10 }}>Funnel (30 days)</h2>
                {analytics?.funnel ? (
                  <table className="admin-table">
                    <tbody>
                      {Object.entries(analytics.funnel).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">No funnel data yet.</p>
                )}
                {analytics?.top_films?.length ? (
                  <>
                    <h3 style={{ marginTop: 14, fontSize: 13 }}>Top films</h3>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Film</th>
                          <th>Views</th>
                          <th>Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.top_films.slice(0, 8).map((f) => (
                          <tr key={f.movie_id || f.movie_title}>
                            <td>{f.movie_title || f.movie_id}</td>
                            <td>{f.views}</td>
                            <td>{f.purchases}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
              </section>
              <section className="purchase-card">
                <h2 style={{ fontSize: 16, marginBottom: 10 }}>Messaging coverage (30 days)</h2>
                <p className="muted" style={{ marginBottom: 10 }}>
                  Every customer issue we auto-message — SMS and email both work (email preferred when both set; Dual ping / admin can send both).
                </p>
                {analytics?.messaging?.coverage?.length ? (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Customer issue</th>
                        <th>Workflow</th>
                        <th>Sent</th>
                        <th>SMS</th>
                        <th>Email</th>
                        <th>Converted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.messaging.coverage.map((row) => (
                        <tr key={row.scenario}>
                          <td>
                            <strong style={{ fontWeight: 600 }}>{row.issue}</strong>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {row.scenario} · {row.event}
                            </div>
                          </td>
                          <td>{row.workflow}</td>
                          <td>{row.sent}</td>
                          <td>{row.sms}</td>
                          <td>{row.email}</td>
                          <td>{row.converted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">No nudges yet — run Demo Lab or wait for live traffic.</p>
                )}
                {analytics?.nudge_channels?.length ? (
                  <>
                    <h3 style={{ marginTop: 14, fontSize: 13 }}>By channel</h3>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Channel</th>
                          <th>Sent</th>
                          <th>Converted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.nudge_channels.map((c) => (
                          <tr key={c.channel}>
                            <td>{c.channel}</td>
                            <td>{c.sent}</td>
                            <td>{c.converted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
              </section>
              <section className="purchase-card">
                <h2 style={{ fontSize: 16, marginBottom: 10 }}>Recent events</h2>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.slice(0, 12).map((r) => (
                      <tr key={r.id}>
                        <td>{fmtTs(r.ts)}</td>
                        <td>{r.event_type}</td>
                        <td>
                          <button type="button" className="linkish" onClick={() => openContact(r.user_id)}>
                            {r.name || r.user_id}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        ) : null}

        {tab === 'followups' ? (
          <>
            <h1>Follow-up queue</h1>
            <p className="lede">Open abandon / fail sessions — SMS, email, or both.</p>
            <div className="stack" style={{ marginTop: 20, gap: 14 }}>
              {followups.length === 0 ? <p className="muted">No open sessions.</p> : null}
              {followups.map((r, i) => (
                <div key={r.session_id} className="purchase-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{r.name || r.user_id}</strong>
                      <div className="muted">
                        {[r.phone, r.email].filter(Boolean).join(' · ')} · {r.state} · idle {r.idle_minutes}m
                      </div>
                      <div className="muted">{r.last_movie_title || '—'} · nudges {r.nudge_count}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openContact(r.user_id)}>
                      Open contact
                    </button>
                  </div>
                  <textarea
                    className="admin-textarea"
                    value={msgDrafts[i] ?? defaultMsg(r)}
                    onChange={(e) => setMsgDrafts((m) => ({ ...m, [i]: e.target.value }))}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {r.phone ? (
                      <button type="button" className="btn btn-buy btn-sm" onClick={() => sendFollow(r, i, ['sms'])}>
                        SMS
                      </button>
                    ) : null}
                    {r.email ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => sendFollow(r, i, ['email'])}>
                        Email
                      </button>
                    ) : null}
                    {r.phone && r.email ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendFollow(r, i, ['sms', 'email'])}>
                        Both
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {tab === 'contacts' ? (
          <>
            <h1>Contacts</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 16 }}>
              <input
                value={contactQ}
                onChange={(e) => setContactQ(e.target.value)}
                placeholder="Search name, phone, email…"
                style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px' }}
              />
              <button type="button" className="btn btn-buy" onClick={searchContacts}>
                Search
              </button>
            </div>
            <div className="admin-panels">
              <section className="purchase-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Reach</th>
                      <th>Films</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => (
                      <tr key={c.user_id}>
                        <td>
                          <button type="button" className="linkish" onClick={() => openContact(c.user_id)}>
                            {c.name || c.user_id}
                          </button>
                        </td>
                        <td className="muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</td>
                        <td>{c.films}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {detail ? (
                <section className="purchase-card">
                  <h2 style={{ fontSize: 18 }}>{detail.contact?.name}</h2>
                  <p className="muted">
                    {[detail.contact?.phone, detail.contact?.email, detail.contact?.channel_pref]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={addTask}>
                      Add task
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        api('/api/admin/retrigger', {
                          method: 'POST',
                          body: JSON.stringify({
                            type: 'rescue',
                            user_id: detail.contact.user_id,
                            phone: detail.contact.phone,
                            email: detail.contact.email,
                            name: detail.contact.name,
                            movie_id: detail.timeline?.find((e) => e.movie_id)?.movie_id,
                            movie_title: detail.timeline?.find((e) => e.movie_title)?.movie_title,
                          }),
                        }).then((d) => alert(d.order_id ? `Rescue queued · order ${d.order_id}` : 'Rescue event queued'))
                      }
                    >
                      Re-trigger rescue
                    </button>
                  </div>
                  <div className="field">
                    <label>Add note</label>
                    <textarea className="admin-textarea" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
                    <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={saveNote}>
                      Save note
                    </button>
                  </div>
                  <h3 style={{ marginTop: 16, fontSize: 14 }}>Timeline</h3>
                  <ul className="muted" style={{ listStyle: 'none', marginTop: 8 }}>
                    {(detail.timeline || []).slice(0, 20).map((ev) => (
                      <li key={ev.id} style={{ marginBottom: 6 }}>
                        {fmtTs(ev.ts)} · {ev.event_type} · {ev.movie_title || '—'}
                      </li>
                    ))}
                  </ul>
                  <h3 style={{ marginTop: 12, fontSize: 14 }}>Notes</h3>
                  <ul style={{ listStyle: 'none', marginTop: 8 }}>
                    {(detail.notes || []).map((n) => (
                      <li key={n.id} className="muted" style={{ marginBottom: 6 }}>
                        {fmtTs(n.created_at)} — {n.body}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === 'payments' ? (
          <>
            <h1>Orders & payments</h1>
            <table className="admin-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>User</th>
                  <th>Film</th>
                  <th>KES</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{fmtTs(o.created_at)}</td>
                    <td>{o.status}</td>
                    <td>
                      <button type="button" className="linkish" onClick={() => openContact(o.user_id)}>
                        {o.name || o.user_id}
                      </button>
                    </td>
                    <td>{o.movie_title || '—'}</td>
                    <td>{o.price_kes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {tab === 'nudges' ? (
          <>
            <h1>Nudges sent</h1>
            <table className="admin-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Scenario</th>
                  <th>Channel</th>
                  <th>User</th>
                  <th>Converted</th>
                </tr>
              </thead>
              <tbody>
                {nudges.map((n) => (
                  <tr key={n.id}>
                    <td>{fmtTs(n.sent_at)}</td>
                    <td>{n.scenario}</td>
                    <td>{n.channel}</td>
                    <td>{n.name || n.user_id}</td>
                    <td>{n.converted ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {tab === 'tasks' ? (
          <>
            <h1>Open tasks</h1>
            <div className="stack" style={{ marginTop: 16 }}>
              {tasks.map((t) => (
                <div key={t.id} className="purchase-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <strong>{t.title}</strong>
                    <div className="muted">{t.name || t.user_id} · {fmtTs(t.created_at)}</div>
                    {t.body ? <p className="muted">{t.body}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      api(`/api/admin/tasks/${t.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'done' }),
                      }).then(refresh)
                    }
                  >
                    Done
                  </button>
                </div>
              ))}
              {!tasks.length ? <p className="muted">No open tasks.</p> : null}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

// silence unused in SSR-less build
void esc;
