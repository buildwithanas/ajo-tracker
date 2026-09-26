import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('ajo_user');
    return raw ? JSON.parse(raw) : null;
  });

  
  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    localStorage.setItem('ajo_token', data.token);
    localStorage.setItem('ajo_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (full_name, email, password, phone) => {
    const data = await api.register({ full_name, email, password, phone });
    localStorage.setItem('ajo_token', data.token);
    localStorage.setItem('ajo_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ajo_token');
    localStorage.removeItem('ajo_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
