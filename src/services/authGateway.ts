import type { AuthUser, SystemRole } from './authApi';
import { useFirebaseAuth } from '../config/featureFlags';
import { isFirebaseConfigured } from '../lib/firebase';

export function shouldUseFirebaseAuth(): boolean {
  return useFirebaseAuth() && isFirebaseConfigured();
}

export async function authLoginWithGoogle(idToken: string): Promise<{
  token?: string;
  customToken?: string;
  user: AuthUser;
}> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseLoginWithGoogle } = await import('./firebaseAuth');
    const user = await firebaseLoginWithGoogle(idToken);
    return { user };
  }
  const { loginWithGoogleIdToken } = await import('./authApi');
  return loginWithGoogleIdToken(idToken);
}

export async function authRequestSms(phone: string) {
  if (shouldUseFirebaseAuth()) {
    const { firebaseRequestSmsOtp } = await import('./firebaseAuth');
    return firebaseRequestSmsOtp(phone);
  }
  const { requestSmsOtp } = await import('./authApi');
  return requestSmsOtp(phone);
}

export async function authVerifySms(phone: string, code: string): Promise<{
  token?: string;
  user: AuthUser;
}> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseVerifySmsOtp } = await import('./firebaseAuth');
    const user = await firebaseVerifySmsOtp(phone, code);
    return { user };
  }
  const { verifySmsOtp } = await import('./authApi');
  return verifySmsOtp(phone, code);
}

export async function authFetchMe(): Promise<AuthUser | null> {
  if (shouldUseFirebaseAuth()) {
    const { getFirebaseAuth } = await import('../lib/firebase');
    const { mapFirebaseUser } = await import('./firebaseAuth');
    const u = getFirebaseAuth().currentUser;
    if (!u) return null;
    return mapFirebaseUser(u);
  }
  const { fetchMe } = await import('./authApi');
  return fetchMe();
}

export async function authLogout(): Promise<void> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseLogout } = await import('./firebaseAuth');
    await firebaseLogout();
    return;
  }
  const { logoutApi, setStoredToken } = await import('./authApi');
  await logoutApi();
  setStoredToken(null);
}

export async function authListUsers(): Promise<AuthUser[]> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseListUsers } = await import('./firebaseAuth');
    return firebaseListUsers();
  }
  const { listUsersApi } = await import('./authApi');
  return listUsersApi();
}

export async function authCreateUser(params: {
  name: string;
  email?: string;
  phone?: string;
  role?: SystemRole;
}): Promise<AuthUser> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseCreateUser } = await import('./firebaseAuth');
    return firebaseCreateUser(params);
  }
  const { createUserApi } = await import('./authApi');
  return createUserApi(params);
}

export async function authUpdateUserRole(
  userId: string,
  role: SystemRole
): Promise<AuthUser> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseUpdateUserRole } = await import('./firebaseAuth');
    return firebaseUpdateUserRole(userId, role);
  }
  const { updateUserRoleApi } = await import('./authApi');
  return updateUserRoleApi(userId, role);
}

export async function authDeleteUser(userId: string): Promise<void> {
  if (shouldUseFirebaseAuth()) {
    const { firebaseDeleteUser } = await import('./firebaseAuth');
    return firebaseDeleteUser(userId);
  }
  const { deleteUserApi } = await import('./authApi');
  return deleteUserApi(userId);
}

export async function authHeadersAsync(extra?: HeadersInit): Promise<HeadersInit> {
  if (shouldUseFirebaseAuth()) {
    const { getFirebaseAuth } = await import('../lib/firebase');
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }
  const { authHeaders } = await import('./authApi');
  return authHeaders(extra);
}
