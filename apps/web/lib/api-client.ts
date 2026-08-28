import { getCookie, setCookie, removeCookie } from './cookies';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://learnai-uzat.onrender.com/api/v1';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefreshRetry?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getCookie('learnai_refresh_token');
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        setCookie('learnai_access_token', data.accessToken, 15 * 60);
        setCookie('learnai_refresh_token', data.refreshToken, 7 * 24 * 60 * 60);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, skipRefreshRetry, headers, ...rest } = options;

  const accessToken = skipAuth ? null : getCookie('learnai_access_token');
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };
  if (accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  if (response.status === 401 && !skipAuth && !skipRefreshRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefreshRetry: true });
    }
    removeCookie('learnai_access_token');
    removeCookie('learnai_refresh_token');
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = body?.message ?? response.statusText ?? 'Request failed';
    throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message, body);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, data?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
