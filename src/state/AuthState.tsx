import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiEnabled, apiRequest, apiResponse } from '@/data/api';
import { clearSession, getSavedSession, saveSession } from '@/data/sessionStore';
import type { AccountUser } from '@/data/sessionTypes';

interface AuthValue {
  user: AccountUser | null; ready: boolean; demo: boolean;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, otp: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDemo: (demo: boolean) => void;
}
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: React.PropsWithChildren) {
  const [user,setUser] = useState<AccountUser | null>(null);
  const [ready,setReady] = useState(false);
  const [demo,setDemo] = useState(!apiEnabled);
  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      try {
        if (!apiEnabled) return;
        const saved = await getSavedSession();
        try {
          const session = await apiRequest<{ user: AccountUser } | null>('/api/auth/get-session');
          if (session?.user) { await saveSession(session.user,saved?.token); if (alive) setUser(session.user); }
          else await clearSession();
        } catch { if (alive && saved?.user) setUser(saved.user); }
      } catch { /* Nečitelné uložené přihlášení vyžaduje nový kód. */ }
      finally { if (alive) setReady(true); }
    };
    void initialize();
    return () => { alive = false; };
  },[]);
  const requestCode = async (email: string) => { await apiRequest('/api/auth/email-otp/send-verification-otp',{ method: 'POST',body: JSON.stringify({ email: email.trim().toLowerCase(),type: 'sign-in' }) }); };
  const verifyCode = async (email: string, otp: string, name: string) => {
    const response = await apiResponse('/api/auth/sign-in/email-otp',{ method: 'POST',body: JSON.stringify({ email: email.trim().toLowerCase(),otp,name: name.trim() || email.split('@')[0] }) });
    const session = await response.json() as { user: AccountUser; token: string };
    await saveSession(session.user,response.headers.get('set-auth-token') ?? session.token);
    setDemo(false); setUser(session.user);
  };
  const signOut = async () => {
    await apiRequest('/api/auth/sign-out',{ method: 'POST',body: '{}' });
    await clearSession(); setUser(null); setDemo(false);
  };
  return <AuthContext.Provider value={{ user,ready,demo,requestCode,verifyCode,signOut,setDemo }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Chybí AuthProvider.');
  return value;
}
