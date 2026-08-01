import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../services/authApi';
import {
  authFetchMe,
  authLoginWithGoogle,
  authLogout,
  authVerifySms,
  shouldUseFirebaseAuth,
} from '../services/authGateway';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithSms: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const me = await authFetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      if (shouldUseFirebaseAuth()) {
        const { subscribeFirebaseAuth } = await import('../services/firebaseAuth');
        unsub = subscribeFirebaseAuth((u) => {
          if (!cancelled) {
            setUser(u);
            setLoading(false);
          }
        });
        return;
      }
      try {
        const me = await authFetchMe();
        if (!cancelled) setUser(me);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { user: next } = await authLoginWithGoogle(idToken);
    setUser(next);
  }, []);

  const loginWithSms = useCallback(async (phone: string, code: string) => {
    const { user: next } = await authVerifySms(phone, code);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, loginWithGoogle, loginWithSms, logout, refreshMe }),
    [user, loading, loginWithGoogle, loginWithSms, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
