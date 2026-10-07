import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearAuth,
  isAuthed,
  loadUser,
  saveUser as persistUser,
  loadSessionToken,
  saveSessionToken,
  clearSessionToken,
} from '../lib/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (isAuthed() ? loadUser() : null));
  const [token, setToken] = useState(() => loadSessionToken());

  const applySession = useCallback((u, t) => {
    const saved = persistUser(u);
    if (t) {
      saveSessionToken(t);
      setToken(t);
    }
    setUser(saved);
    return saved;
  }, []);

  const login = useCallback(
    (u, t) => applySession(u, t),
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    clearAuth();
    clearSessionToken();
    setToken(null);
    setUser(null);
  }, [token]);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      persistUser(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          if (r.status === 401) {
            clearAuth();
            clearSessionToken();
            if (!cancelled) {
              setToken(null);
              setUser(null);
            }
          }
          return;
        }
        const data = await r.json();
        if (!cancelled && data.user) applySession(data.user, token);
        if (!cancelled && Array.isArray(data.entitlements) && data.entitlements.length) {
          try {
            const lib = JSON.parse(localStorage.getItem('ykw_library') || '{}');
            for (const e of data.entitlements) {
              lib[e.movie_id] = {
                id: e.movie_id,
                price: e.price_kes,
                unlockedAt: e.unlocked_at,
              };
            }
            localStorage.setItem('ykw_library', JSON.stringify(lib));
          } catch {}
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applySession]);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoggedIn: Boolean(user && (user.phone || user.email) && user.name),
      login,
      logout,
      updateUser,
      authHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    [user, token, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
