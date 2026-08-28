'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthTokensDto, UserDto } from '@learnai/shared';
import { api, ApiError } from './api-client';
import { getCookie, removeCookie, setCookie } from './cookies';

interface AuthContextValue {
  user: UserDto | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; firstName: string; lastName: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function persistTokens(tokens: Pick<AuthTokensDto, 'accessToken' | 'refreshToken'>) {
  setCookie('learnai_access_token', tokens.accessToken, 15 * 60);
  setCookie('learnai_refresh_token', tokens.refreshToken, 7 * 24 * 60 * 60);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const accessToken = getCookie('learnai_access_token');
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    api
      .get<UserDto>('/users/me')
      .then(setUser)
      .catch(() => {
        removeCookie('learnai_access_token');
        removeCookie('learnai_refresh_token');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<AuthTokensDto>('/auth/login', { email, password }, { skipAuth: true });
    persistTokens(result);
    setUser(result.user);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string; role?: string }) => {
      const result = await api.post<AuthTokensDto>('/auth/register', input, { skipAuth: true });
      persistTokens(result);
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    const refreshToken = getCookie('learnai_refresh_token');
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      removeCookie('learnai_access_token');
      removeCookie('learnai_refresh_token');
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
