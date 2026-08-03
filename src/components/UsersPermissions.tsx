import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  Shield,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { PageBanner, fieldClassXs } from './ui/PageBanner';
import {
  AuthUser,
  SystemRole,
} from '../services/authApi';
import {
  authCreateUser,
  authDeleteUser,
  authListUsers,
  authUpdateUserRole,
} from '../services/authGateway';
import { useAuth } from '../context/AuthContext';

const ROLE_LABEL: Record<SystemRole, string> = {
  SYSTEM_ADMIN: 'מנהל מערכת',
  MANAGER: 'מנהל',
};

export const UsersPermissions: React.FC = () => {
  const { user: me, refreshMe } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addRole, setAddRole] = useState<SystemRole>('MANAGER');
  const [adding, setAdding] = useState(false);

  const isAdmin = me?.role === 'SYSTEM_ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let list = await authListUsers();
      // ניקוי כפילויות ישנות: אותו טלפון עם רשומת @sms.local מול אימייל אמיתי
      if (isAdmin) {
        const normPhone = (p?: string) => {
          let pl = String(p || '').replace(/\D/g, '');
          if (pl.startsWith('972')) pl = `0${pl.slice(3)}`;
          if (pl.length === 9 && pl.startsWith('5')) pl = `0${pl}`;
          return pl;
        };
        const isSynthetic = (email: string) =>
          email.trim().toLowerCase().endsWith('@sms.local');
        const realPhones = new Set(
          list
            .filter((u) => !isSynthetic(u.email) && normPhone(u.phone))
            .map((u) => normPhone(u.phone))
        );
        const dupes = list.filter(
          (u) => isSynthetic(u.email) && realPhones.has(normPhone(u.phone))
        );
        for (const d of dupes) {
          try {
            await authDeleteUser(d.id);
          } catch (err) {
            console.warn('cleanup duplicate user failed', d.id, err);
          }
        }
        if (dupes.length) {
          list = await authListUsers();
        }
      }
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת משתמשים');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetAddForm = () => {
    setAddName('');
    setAddEmail('');
    setAddPhone('');
    setAddRole('MANAGER');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      setError('נא להזין שם');
      return;
    }
    if (!addEmail.trim() && !addPhone.trim()) {
      setError('נא להזין אימייל או טלפון');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const created = await authCreateUser({
        name: addName.trim(),
        email: addEmail.trim() || undefined,
        phone: addPhone.trim() || undefined,
        role: isAdmin ? addRole : 'MANAGER',
      });
      setUsers((prev) => [...prev, created]);
      setShowAdd(false);
      resetAddForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'יצירת משתמש נכשלה');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId: string, role: SystemRole) => {
    if (!isAdmin) return;
    setBusyId(userId);
    setError(null);
    try {
      const updated = await authUpdateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if (me?.id === userId) await refreshMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'עדכון תפקיד נכשל');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (target: AuthUser) => {
    if (!isAdmin) {
      alert('רק מנהל מערכת יכול למחוק משתמשים');
      return;
    }
    if (me?.id === target.id) {
      alert('לא ניתן למחוק את עצמך');
      return;
    }
    if (!confirm(`למחוק את המשתמש ${target.name}?`)) return;

    setBusyId(target.id);
    setError(null);
    try {
      await authDeleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'מחיקה נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const canDelete = (target: AuthUser) => {
    if (!me || !isAdmin) return false;
    if (me.id === target.id) return false;
    return true;
  };

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Users}
        title="משתמשים והרשאות"
        subtitle="ניהול משתמשי המערכת · SYSTEM_ADMIN ו־MANAGER · התחברות Google או SMS"
        action={
          isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowAdd(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-extrabold rounded-xl text-xs"
            >
              <Plus className="w-4 h-4" />
              הוסף משתמש
            </button>
          ) : undefined
        }
      />

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-[var(--brand-light)]/40 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <UserCog className="w-5 h-5 text-[var(--brand)]" />
              רשימת משתמשים
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              כניסת מנהלים רק למשתמשים שנוספו כאן. עובדים נכנסים לתיק אישי בקישור + SMS OTP.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setShowAdd(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף משתמש
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              רענון
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            טוען משתמשים…
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 space-y-3">
            <p>אין משתמשים עדיין</p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-white text-xs font-bold"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף משתמש ראשון
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold">משתמש</th>
                  <th className="px-4 py-3 font-bold">אימייל / טלפון</th>
                  <th className="px-4 py-3 font-bold">תפקיד</th>
                  <th className="px-4 py-3 font-bold">התחברות אחרונה</th>
                  <th className="px-4 py-3 font-bold">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.picture ? (
                          <img
                            src={u.picture}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[var(--brand-light)] flex items-center justify-center text-[var(--brand)]">
                            <Shield className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900">{u.name}</div>
                          {me?.id === u.id && (
                            <div className="text-[10px] text-[var(--brand)] font-bold">את/ה</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      <div>{u.email?.endsWith('@sms.local') || u.email?.endsWith('@pending.local') ? '—' : u.email}</div>
                      {u.phone && <div className="text-slate-400 mt-0.5">{u.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) =>
                            void handleRoleChange(u.id, e.target.value as SystemRole)
                          }
                        >
                          <option value="MANAGER">{ROLE_LABEL.MANAGER}</option>
                          <option value="SYSTEM_ADMIN">{ROLE_LABEL.SYSTEM_ADMIN}</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex px-2 py-1 rounded-lg text-[11px] font-bold ${
                            u.role === 'SYSTEM_ADMIN'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {ROLE_LABEL[u.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.lastLoginAt).toLocaleString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!canDelete(u) || busyId === u.id}
                        onClick={() => void handleDelete(u)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          !canDelete(u)
                            ? me?.id === u.id
                              ? 'לא ניתן למחוק את עצמך'
                              : 'מנהל אינו יכול למחוק מנהל מערכת'
                            : 'מחק משתמש'
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        מחיקה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-[var(--navy,#0f172a)]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">הוספת משתמש</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  המשתמש יוכל להתחבר עם Google (אם הוגדר אימייל) או SMS (אם הוגדר טלפון).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  resetAddForm();
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleAddUser(e)} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">שם מלא *</span>
                <input
                  className={fieldClassXs}
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">אימייל (Google)</span>
                <input
                  type="email"
                  className={fieldClassXs}
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">טלפון (SMS)</span>
                <input
                  type="tel"
                  className={fieldClassXs}
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="05X-XXXXXXX"
                />
              </label>
              {isAdmin && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">תפקיד</span>
                  <select
                    className={fieldClassXs}
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as SystemRole)}
                  >
                    <option value="MANAGER">{ROLE_LABEL.MANAGER}</option>
                    <option value="SYSTEM_ADMIN">{ROLE_LABEL.SYSTEM_ADMIN}</option>
                  </select>
                </label>
              )}
              <p className="text-[10px] text-slate-400">חובה אימייל או טלפון (או שניהם)</p>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    resetAddForm();
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 py-2.5 rounded-xl text-white font-extrabold text-xs disabled:opacity-40 flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  צור משתמש
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
