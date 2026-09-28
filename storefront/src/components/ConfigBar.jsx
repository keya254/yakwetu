import { useState } from 'react';
import { loadWebhookBase, saveWebhookBase, webhookUrl } from '../lib/track';
import { useAuth } from '../context/AuthContext';

export default function ConfigBar() {
  const { user } = useAuth();
  const [base, setBase] = useState(loadWebhookBase);
  const [status, setStatus] = useState(() => '→ ' + webhookUrl());

  return (
    <div className="cfg-bar">
      <span>Events →</span>
      <input
        value={base}
        onChange={(e) => setBase(e.target.value)}
        placeholder="blank = /api/events"
      />
      <button
        type="button"
        onClick={() => {
          saveWebhookBase(base);
          setStatus('→ ' + webhookUrl());
        }}
      >
        Save
      </button>
      <span>{status}</span>
      {user ? (
        <span style={{ marginLeft: 'auto' }}>
          {user.name} · {user.phone}
        </span>
      ) : null}
    </div>
  );
}
