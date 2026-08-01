export type SystemRole = 'SYSTEM_ADMIN' | 'MANAGER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  /** מזהה גוגל — או sms:<phone> למשתמשי SMS */
  googleSub: string;
  phone?: string;
  notificationEmail?: string;
  notifyEmployeeUpdates?: boolean;
  notifyAgreementSigned?: boolean;
  role: SystemRole;
  createdAt: string;
  lastLoginAt: string;
}

export interface PublicAuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  phone?: string;
  notificationEmail?: string;
  notifyEmployeeUpdates?: boolean;
  notifyAgreementSigned?: boolean;
  role: SystemRole;
  createdAt: string;
  lastLoginAt: string;
}

export function toPublicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    phone: user.phone,
    notificationEmail: user.notificationEmail,
    notifyEmployeeUpdates: user.notifyEmployeeUpdates,
    notifyAgreementSigned: user.notifyAgreementSigned,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}
