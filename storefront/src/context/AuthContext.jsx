import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  clearAuth,
  isAuthed,
  loadUser,
  saveUser as persistUser,
} from '../lib/storage';

const AuthContext = createContext(null);

// VITE_AUTH_DISABLED=true (e.g. in .env.local): browse without the phone/OTP
// login, as a guest viewer. For local demos when the API on :3001 isn't
// running. Unset, login works as normal.
export const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';
const GUEST = { name: 'Guest Viewer', phone: '+254700000000', email: 'guest@yakwetu.demo' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() =>
    isAuthed() ? loadUser() : AUTH_DISABLED ? GUEST : null
  );

  const login = useCallback((u) => {
    const saved = persistUser(u);
    setUser(saved);
    return saved;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(AUTH_DISABLED ? GUEST : null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      persistUser(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoggedIn: Boolean(user?.phone && user?.name),
      login,
      logout,
      updateUser,
    }),
    [user, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
