import React, { useEffect, useMemo, useState } from 'react';
import {
  Employee,
  EmployeeFileDocument,
  RoleType,
  SalaryAgreement,
  AgreementTemplate,
  isEmployeeActive,
} from '../types';
import {
  Users,
  UserPlus,
  FolderOpen,
  FileText,
  Search,
  MessageCircle,
  Briefcase,
  Plus,
  Trash2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { PageBanner, fieldClassXs } from './ui/PageBanner';
import { EmployeePersonalFile } from './EmployeePersonalFile';
import { PERSONAL_FILE_CATEGORIES } from '../config/employeeFile';
import { WhatsAppOnboardingShare } from './WhatsAppOnboardingShare';
import { exportActiveEmployeesToExcel } from '../services/exportActiveEmployeesExcel';

const OPEN_FILE_KEY = 'club_open_employee_file';

type StaffListFilter = 'active' | 'all';

interface EmployeeManagerProps {
  employees: Employee[];
  roles: RoleType[];
  agreements: SalaryAgreement[];
  fileDocuments: EmployeeFileDocument[];
  templates?: AgreementTemplate[];
  onSelectEmployeeFilter: (employeeId: string) => void;
  onAddEmployee: (employee: Employee) => void;
  onUpdateEmployee: (employee: Employee) => void;
  onAddFileDocument: (doc: EmployeeFileDocument) => void;
  onDeleteFileDocument: (docId: string) => void;
  onOpenAgreement: (agreement: SalaryAgreement) => void;
  onRolesChange: (roles: RoleType[]) => void;
}

export const EmployeeManager: React.FC<EmployeeManagerProps> = ({
  employees,
  roles,
  agreements,
  fileDocuments,
  templates = [],
  onSelectEmployeeFilter,
  onAddEmployee,
  onUpdateEmployee,
  onAddFileDocument,
  onDeleteFileDocument,
  onOpenAgreement,
  onRolesChange,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(OPEN_FILE_KEY);
    } catch {
      return null;
    }
  });
  const [navFileSection, setNavFileSection] = useState<string | null>(null);

  // ניווט מלוג הדאשבורד — פתיחת תיק גם אם הכרטיסייה כבר פעילה
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ employeeId?: string; fileSection?: string }>).detail;
      if (detail?.employeeId) setSelectedEmployeeId(detail.employeeId);
      if (detail?.fileSection) setNavFileSection(detail.fileSection);
    };
    window.addEventListener('club-open-employee-file', onOpen);
    return () => window.removeEventListener('club-open-employee-file', onOpen);
  }, []);
  const [listSearch, setListSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState<StaffListFilter>('active');
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<RoleType>(roles[0] || '');

  useEffect(() => {
    if (roles.length === 0) return;
    if (!roles.includes(role)) {
      setRole(roles[0]);
    }
  }, [roles, role]);

  useEffect(() => {
    try {
      if (selectedEmployeeId) {
        sessionStorage.setItem(OPEN_FILE_KEY, selectedEmployeeId);
      } else {
        sessionStorage.removeItem(OPEN_FILE_KEY);
      }
    } catch {
      // ignore
    }
  }, [selectedEmployeeId]);

  const openEmployeeFile = (empId: string) => {
    setSelectedEmployeeId(empId);
  };

  const closeEmployeeFile = () => {
    setSelectedEmployeeId(null);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;

  // אם העובד נמחק — חזרה לרשימה
  useEffect(() => {
    if (selectedEmployeeId && !employees.some(e => e.id === selectedEmployeeId)) {
      setSelectedEmployeeId(null);
    }
  }, [employees, selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const byStatus =
      staffFilter === 'active' ? employees.filter((e) => isEmployeeActive(e)) : employees;
    const q = listSearch.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.idNumber.includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
    );
  }, [employees, listSearch, staffFilter]);

  const activeCount = useMemo(
    () => employees.filter((e) => isEmployeeActive(e)).length,
    [employees]
  );

  const docCountFor = (empId: string) =>
    fileDocuments.filter(d => d.employeeId === empId).length;

  const [inviteAfterCreateId, setInviteAfterCreateId] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  const resetCreateForm = () => {
    setName('');
    setIdNumber('');
    setEmail('');
    setPhone('');
    setAddress('');
  };

  const handleAddRole = () => {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    if (roles.some((r) => r === trimmed)) {
      alert('התפקיד כבר קיים ברשימה');
      return;
    }
    onRolesChange([...roles, trimmed]);
    setNewRoleName('');
  };

  const handleDeleteRole = (roleToDelete: RoleType) => {
    if (roles.length <= 1) {
      alert('חייבים להשאיר לפחות תפקיד אחד במערכת');
      return;
    }
    const empCount = employees.filter((e) => e.role === roleToDelete).length;
    const agrCount = agreements.filter((a) => a.role === roleToDelete).length;
    if (empCount > 0 || agrCount > 0) {
      const ok = window.confirm(
        `לתפקיד «${roleToDelete}» יש ${empCount} עובדים ו־${agrCount} הסכמים.\n` +
          'המחיקה תסיר אותו מרשימת הבחירה בלבד; הרשומות הקיימות יישמרו עם אותו תיוג.\nלהמשיך?'
      );
      if (!ok) return;
    }
    onRolesChange(roles.filter((r) => r !== roleToDelete));
  };

  const buildNewEmployee = (overrides?: Partial<Employee>): Employee => ({
    id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
    name: name.trim(),
    idNumber: idNumber.trim(),
    email: email.trim(),
    phone: phone.trim() || undefined,
    address: address.trim() || undefined,
    role,
    department: '',
    startDate: new Date().toISOString().split('T')[0],
    agreementsCount: 0,
    isActive: true,
    ...overrides,
  });

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !idNumber.trim()) return;

    const newEmp = buildNewEmployee();
    onAddEmployee(newEmp);
    setShowAddModal(false);
    resetCreateForm();
    openEmployeeFile(newEmp.id);
  };

  const handleCreateAndSendInvite = async () => {
    if (!name.trim() || !phone.trim() || sendingInvite) return;

    const phoneValue = phone.trim();
    const newEmp = buildNewEmployee({
      phone: phoneValue,
    });

    setSendingInvite(true);
    try {
      // יוצר את התיק מיד; חלון השיתוף מאפשר העתקה / שליחה בווטסאפ
      onAddEmployee(newEmp);
      setShowAddModal(false);
      resetCreateForm();
      openEmployeeFile(newEmp.id);
      setInviteAfterCreateId(newEmp.id);

      try {
        sessionStorage.setItem('club_open_employee_file', newEmp.id);
        sessionStorage.setItem('club_active_tab', 'employees');
      } catch {
        // ignore
      }
    } catch (err) {
      console.error(err);
      alert('יצירת העובד נכשלה. נסה שוב.');
    } finally {
      setSendingInvite(false);
    }
  };

  const canSendInvite = Boolean(name.trim() && phone.trim()) && !sendingInvite;

  if (selectedEmployee) {
    return (
      <>
        <EmployeePersonalFile
          employee={selectedEmployee}
          agreements={agreements}
          documents={fileDocuments}
          templates={templates}
          onBack={closeEmployeeFile}
          onUpdateEmployee={onUpdateEmployee}
          onAddDocument={onAddFileDocument}
          onDeleteDocument={onDeleteFileDocument}
          onOpenAgreement={onOpenAgreement}
          focusSection={navFileSection}
          onFocusSectionConsumed={() => setNavFileSection(null)}
        />
        {inviteAfterCreateId === selectedEmployee.id && (
          <WhatsAppOnboardingShare
            employee={selectedEmployee}
            agreements={agreements}
            documents={fileDocuments.filter((d) => d.employeeId === selectedEmployee.id)}
            onClose={() => setInviteAfterCreateId(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Users}
        title="סגל ועובדים — תיקים אישיים"
        subtitle="לכל עובד תיק אישי: פרטים מזהים, תעודות והסמכות, אישורי מס, העסקה, היעדרויות, פנסיה, הערכות והסכמי שכר בבלוקצ׳יין"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRolesModal(true)}
              className="px-4 py-2.5 bg-white/15 border border-white/30 text-white font-extrabold rounded-xl text-xs transition-all hover:bg-white/25 flex items-center"
            >
              <Briefcase className="w-4 h-4 ml-1.5" />
              ניהול תפקידים
            </button>
            <button
              type="button"
              onClick={() => {
                const { exportedCount } = exportActiveEmployeesToExcel(employees);
                if (exportedCount === 0) {
                  alert('אין עובדים פעילים לייצוא.');
                }
              }}
              className="px-4 py-2.5 bg-white/15 border border-white/30 text-white font-extrabold rounded-xl text-xs transition-all hover:bg-white/25 flex items-center"
            >
              <FileSpreadsheet className="w-4 h-4 ml-1.5" />
              יצא עובדים פעילים לאקסל
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 text-white font-extrabold rounded-xl text-xs shadow-lg transition-all hover:opacity-95 flex items-center"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <UserPlus className="w-4 h-4 ml-1.5" />
              הוסף עובד חדש
            </button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="חיפוש לפי שם, ת.ז., תפקיד או מחלקה..."
            className={`${fieldClassXs} pr-10`}
          />
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm self-start">
          <button
            type="button"
            onClick={() => setStaffFilter('active')}
            className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all ${
              staffFilter === 'active'
                ? 'text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
            style={staffFilter === 'active' ? { backgroundColor: 'var(--brand)' } : undefined}
          >
            עובדים פעילים ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStaffFilter('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all ${
              staffFilter === 'all'
                ? 'text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
            style={staffFilter === 'all' ? { backgroundColor: 'var(--brand)' } : undefined}
          >
            כל העובדים ({employees.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredEmployees.map((emp) => {
          const empAgreements = agreements.filter((a) => a.employeeId === emp.id);
          const signedCount = empAgreements.filter((a) => a.status === 'SIGNED').length;
          const fileCount = docCountFor(emp.id);
          const categoriesFilled = PERSONAL_FILE_CATEGORIES.filter((c) =>
            fileDocuments.some((d) => d.employeeId === emp.id && d.category === c)
          ).length;
          const active = isEmployeeActive(emp);

          return (
            <div
              key={emp.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                active
                  ? 'border-slate-200/90 hover:border-[var(--brand)]/30'
                  : 'border-slate-200/90 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={
                      emp.avatarUrl ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                    }
                    alt={emp.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[var(--brand)] shadow-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base">{emp.name}</h3>
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                          active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      ת.ז. {emp.idNumber} · {emp.id}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-xs bg-[var(--brand-light)] p-3 rounded-xl border border-slate-200/60 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">תפקיד</span>
                    <span
                      className="font-bold px-2 py-0.5 rounded border text-[var(--brand-dark)]"
                      style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderColor: 'var(--brand)' }}
                    >
                      {emp.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">מחלקה</span>
                    <span className="font-semibold text-slate-800">{emp.department}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">הסכמי שכר</span>
                    <span className="font-extrabold" style={{ color: 'var(--accent)' }}>
                      {signedCount}/{empAgreements.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">מסמכים בתיק</span>
                    <span className="font-bold text-slate-800">
                      {fileCount} · {categoriesFilled}/6 תיקיות
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openEmployeeFile(emp.id)}
                  className="w-full py-2.5 text-white font-bold rounded-xl text-xs transition-all hover:opacity-95 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  <FolderOpen className="w-4 h-4 ml-1.5" />
                  פתח תיק אישי
                </button>
                <button
                  type="button"
                  onClick={() => onSelectEmployeeFilter(emp.id)}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center border border-slate-200"
                >
                  <FileText className="w-3.5 h-3.5 ml-1.5" />
                  הסכמי שכר בארכיון
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredEmployees.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">
          {staffFilter === 'active' && !listSearch.trim()
            ? 'אין עובדים פעילים להצגה.'
            : 'לא נמצאו עובדים התואמים לחיפוש.'}
        </div>
      )}

      {showRolesModal && (
        <div className="fixed inset-0 z-50 bg-[var(--navy)]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">ניהול תפקידים</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  הרשימה משמשת בהוספת עובדים, תבניות וסינון ארכיון
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRolesModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddRole();
              }}
            >
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="שם תפקיד חדש"
                className={fieldClassXs}
              />
              <button
                type="submit"
                disabled={!newRoleName.trim()}
                className="shrink-0 px-3 py-2 text-white font-extrabold rounded-xl text-xs disabled:opacity-40 flex items-center gap-1"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
            </form>

            <ul className="space-y-2">
              {roles.map((r) => {
                const empCount = employees.filter((e) => e.role === r).length;
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{r}</p>
                      <p className="text-[10px] text-slate-500">{empCount} עובדים משויכים</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(r)}
                      className="shrink-0 p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                      title="מחק תפקיד"
                      aria-label={`מחק תפקיד ${r}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={() => setShowRolesModal(false)}
              className="w-full py-2.5 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-300 transition-colors"
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[var(--navy)]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 text-lg border-b border-slate-100 pb-2">
              הוספת עובד ופתיחת תיק אישי
            </h3>

            <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">שם מלא *</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className={fieldClassXs} />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">טלפון *</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={fieldClassXs} placeholder="05X-XXXXXXX" />
                <p className="text-[10px] text-slate-400 mt-1">נדרש לשליחת קישור להשלמת תיק בווטסאפ</p>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">תפקיד</label>
                <select value={role} onChange={e => setRole(e.target.value as RoleType)} className={fieldClassXs}>
                  {roles.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  disabled={!canSendInvite}
                  onClick={() => void handleCreateAndSendInvite()}
                  className="w-full py-2.5 rounded-xl text-white font-extrabold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#25D366' }}
                  title={!name.trim() || !phone.trim() ? 'יש להזין שם מלא ומספר טלפון' : undefined}
                >
                  <MessageCircle className="w-4 h-4" />
                  {sendingInvite ? 'מכין קישור…' : 'קישור לווטסאפ — העתקה או שליחה'}
                </button>
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  יוצר תיק עם שם, טלפון ותפקיד ופותח חלון להעתקת הקישור או שליחה בווטסאפ
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">מספר ת.ז.</label>
                  <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)} className={`${fieldClassXs} font-mono`} placeholder="אופציונלי אם שולחים קישור להשלמה" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">כתובת</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={fieldClassXs} />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">דוא״ל</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={fieldClassXs} />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetCreateForm();
                    }}
                    className="flex-1 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim() || !idNumber.trim()}
                    className="flex-1 py-2 text-white font-extrabold rounded-xl hover:opacity-95 transition-all disabled:opacity-40"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    צור תיק ושמור
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
