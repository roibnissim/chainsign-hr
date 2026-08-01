export type SystemRole = 'SYSTEM_ADMIN' | 'MANAGER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  phone?: string;
  /** כתובת מייל לקבלת התראות מערכת (יכולה להיות שונה מ־email להתחברות) */
  notificationEmail?: string;
  /** דיווח יומי על עדכוני עובד (פרופיל / מסמכים) — ברירת מחדל true */
  notifyEmployeeUpdates?: boolean;
  /** דיווח יומי על הסכם שנחתם — ברירת מחדל true */
  notifyAgreementSigned?: boolean;
  role: SystemRole;
  createdAt: string;
  lastLoginAt: string;
}

const TOKEN_KEY = 'club_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStoredToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function loginWithGoogleIdToken(idToken: string): Promise<{
  token: string;
  user: AuthUser;
}> {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data.message || data.error || 'google_login_failed');
  }
  setStoredToken(data.token);
  return { token: data.token, user: data.user };
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  const res = await fetch('/api/auth/me', {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    setStoredToken(null);
    return null;
  }
  const data = await parseJson(res);
  if (!res.ok) return null;
  return data.user as AuthUser;
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {
    // ignore
  } finally {
    setStoredToken(null);
  }
}

export async function listUsersApi(): Promise<AuthUser[]> {
  const res = await fetch('/api/users', { headers: authHeaders() });
  const data = await parseJson(res);
  if (res.status === 401) throw new Error('unauthorized');
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error(data.message || data.error || 'list_failed');
  return (data.users || []) as AuthUser[];
}

export async function updateUserRoleApi(
  userId: string,
  role: SystemRole
): Promise<AuthUser> {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ role }),
  });
  const data = await parseJson(res);
  if (res.status === 401) throw new Error('unauthorized');
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error(data.message || data.error || 'update_failed');
  return data.user as AuthUser;
}

export async function createUserApi(params: {
  name: string;
  email?: string;
  phone?: string;
  role?: SystemRole;
}): Promise<AuthUser> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  const data = await parseJson(res);
  if (res.status === 401) throw new Error('unauthorized');
  if (res.status === 403) throw new Error(data.message || 'forbidden');
  if (!res.ok) throw new Error(data.message || data.error || 'create_failed');
  return data.user as AuthUser;
}

export async function deleteUserApi(userId: string): Promise<void> {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await parseJson(res);
  if (res.status === 401) throw new Error('unauthorized');
  if (res.status === 403) throw new Error(data.message || 'forbidden');
  if (!res.ok) throw new Error(data.message || data.error || 'delete_failed');
}

export async function requestSmsOtp(phone: string): Promise<{
  phone: string;
  expiresInSec: number;
  testMode?: boolean;
  testCode?: string;
  message?: string;
}> {
  const res = await fetch('/api/auth/sms/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.message || data.error || 'sms_request_failed');
  return data;
}

export async function verifySmsOtp(
  phone: string,
  code: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/sms/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.message || data.error || 'sms_verify_failed');
  setStoredToken(data.token);
  return { token: data.token, user: data.user };
}
