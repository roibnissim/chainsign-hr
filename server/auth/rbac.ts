import type { IncomingMessage, ServerResponse } from 'http';
import type { AuthUser, SystemRole } from './types';
import { getBearerUser } from './jwt';

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<AuthUser | null> {
  const user = await getBearerUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
    return null;
  }
  return user;
}

export async function requireRole(
  req: IncomingMessage,
  res: ServerResponse,
  role: SystemRole
): Promise<AuthUser | null> {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.role !== role) {
    sendJson(res, 403, { error: 'forbidden', message: 'אין הרשאה לפעולה זו' });
    return null;
  }
  return user;
}

/** MANAGER לא יכול למחוק אף משתמש; רק SYSTEM_ADMIN מוחק (לא את עצמו, לא את מנהל המערכת האחרון) */
export function canDeleteUser(actor: AuthUser, target: AuthUser): boolean {
  if (actor.id === target.id) return false;
  if (actor.role !== 'SYSTEM_ADMIN') return false;
  return true;
}

export function canCreateUsers(actor: AuthUser): boolean {
  return actor.role === 'SYSTEM_ADMIN';
}
