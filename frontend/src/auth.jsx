import { createContext, useContext, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const save = (token, user) => {
  if (token) localStorage.setItem('va_token', token);
  localStorage.setItem('va_user', JSON.stringify(user));
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('va_user')); } catch { return null; }
  });
  // Returns { need_2fa, temp_token } when a code is needed, otherwise logs in
  const login = async (loginId, password) => {
    const d = await api('POST', '/auth/login', { login: loginId, password });
    if (d.need_2fa) return d;
    save(d.token, d.user); setUser(d.user);
    return d;
  };
  const verify2fa = async (temp_token, code) => {
    const d = await api('POST', '/auth/2fa/verify', { temp_token, code });
    save(d.token, d.user); setUser(d.user);
    return d;
  };
  const refresh = async () => {
    const u = await api('GET', '/auth/me');
    save(null, u); setUser(u);
  };
  const logout = () => {
    localStorage.removeItem('va_token'); localStorage.removeItem('va_user'); setUser(null);
  };
  return <Ctx.Provider value={{ user, login, verify2fa, refresh, logout }}>{children}</Ctx.Provider>;
}
