import React, { useEffect, useMemo, useState } from 'react';
import {
  Employee,
  EmployeeFileDocument,
  PersonalFileCategory,
  SalaryAgreement,
  AgreementTemplate,
} from '../types';
import { FILE_SECTIONS, FileSectionId } from '../config/employeeFile';
import { fieldClassXs } from './ui/PageBanner';
import {
  ArrowRight,
  FilePlus2,
  FileText,
  MessageCircle,
  Paperclip,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { WhatsAppOnboardingShare } from './WhatsAppOnboardingShare';
import { CameraOrFilePick } from './CameraOrFilePick';
import {
  AttachmentActions,
  AttachmentSource,
  FileAttachmentViewer,
} from './FileAttachmentViewer';
import { isAgreementSignedByBothParties } from '../services/onboardingInvite';
import { isAgreementExpiredOrInactive } from '../services/agreementValidity';
import { isEmployeeActive } from '../types';

interface EmployeePersonalFileProps {
  employee: Employee;
  agreements: SalaryAgreement[];
  documents: EmployeeFileDocument[];
  templates?: AgreementTemplate[];
  onBack: () => void;
  onUpdateEmployee: (employee: Employee) => void;
  onAddDocument: (doc: EmployeeFileDocument) => void;
  onDeleteDocument: (docId: string) => void;
  onOpenAgreement: (agreement: SalaryAgreement) => void;
  /** כרטיסייה לפתיחה מניווט חיצוני (למשל לוג דאשבורד) */
  focusSection?: string | null;
  onFocusSectionConsumed?: () => void;
}

const MAX_FILE_BYTES_LOCAL = 400 * 1024; // ~400KB for localStorage safety
const MAX_FILE_BYTES_STORAGE = 10 * 1024 * 1024; // 10MB with Firebase Storage
const MAX_AVATAR_BYTES = 500 * 1024;
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

export const EmployeePersonalFile: React.FC<EmployeePersonalFileProps> = ({
  employee,
  agreements,
  documents,
  templates = [],
  onBack,
  onUpdateEmployee,
  onAddDocument,
  onDeleteDocument,
  onOpenAgreement,
  focusSection,
  onFocusSectionConsumed,
}) => {
  const [section, setSection] = useState<FileSectionId>(() => {
    try {
      const saved = sessionStorage.getItem(`club_file_section_${employee.id}`) as FileSectionId | null;
      if (saved && FILE_SECTIONS.some(s => s.id === saved)) return saved;
    } catch {
      // ignore
    }
    return 'identity';
  });
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [draft, setDraft] = useState<Employee>(() => ({
    ...employee,
    idNumber: employee.idNumber?.trim() === 'טרם הוזן' ? '' : employee.idNumber,
    email: employee.email?.trim().endsWith('@pending.local') ? '' : employee.email,
  }));
  const [showAddForm, setShowAddForm] = useState(false);

  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docNotes, setDocNotes] = useState('');
  const [docFileName, setDocFileName] = useState<string | undefined>();
  const [docFileDataUrl, setDocFileDataUrl] = useState<string | undefined>();
  const [docFileBlob, setDocFileBlob] = useState<File | null>(null);
  const [addingDoc, setAddingDoc] = useState(false);
  const [showOnboardingInvite, setShowOnboardingInvite] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<AttachmentSource | null>(null);

  useEffect(() => {
    setDraft({
      ...employee,
      idNumber: employee.idNumber?.trim() === 'טרם הוזן' ? '' : employee.idNumber,
      email: employee.email?.trim().endsWith('@pending.local') ? '' : employee.email,
    });
  }, [employee]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`club_file_section_${employee.id}`) as FileSectionId | null;
      if (saved && FILE_SECTIONS.some((s) => s.id === saved)) {
        setSection(saved);
        return;
      }
    } catch {
      // ignore
    }
    setSection('identity');
  }, [employee.id]);

  useEffect(() => {
    if (!focusSection) return;
    if (!FILE_SECTIONS.some((s) => s.id === focusSection)) return;
    setSection(focusSection as FileSectionId);
    onFocusSectionConsumed?.();
  }, [focusSection, onFocusSectionConsumed]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`club_file_section_${employee.id}`, section);
    } catch {
      // ignore
    }
  }, [section, employee.id]);

  const empDocs = useMemo(
    () => documents.filter(d => d.employeeId === employee.id),
    [documents, employee.id]
  );

  const empAgreements = useMemo(
    () => agreements.filter(a => a.employeeId === employee.id),
    [agreements, employee.id]
  );

  const signedAgreements = useMemo(
    () =>
      empAgreements.filter((ag) => {
        const tpl = templates.find((t) => t.id === ag.templateId);
        return isAgreementSignedByBothParties(ag, tpl?.fields);
      }),
    [empAgreements, templates]
  );

  const sectionMeta = FILE_SECTIONS.find(s => s.id === section)!;

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      identity: 1,
      salary: signedAgreements.length,
    };
    for (const s of FILE_SECTIONS) {
      if (s.id === 'identity' || s.id === 'salary') continue;
      map[s.id] = empDocs.filter(d => d.category === s.id).length;
    }
    return map;
  }, [signedAgreements.length, empDocs]);

  const categoryDocs = useMemo(() => {
    if (section === 'identity' || section === 'salary') return [];
    return empDocs
      .filter(d => d.category === section)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [empDocs, section]);

  const startEditIdentity = () => {
    setDraft({
      ...employee,
      bankAccount: employee.bankAccount || {
        bankName: '',
        branchNumber: '',
        accountNumber: '',
        accountHolderName: employee.name,
      },
    });
    setEditingIdentity(true);
  };

  const saveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    let next: Employee = { ...draft };
    try {
      const { useFirebaseStorage } = await import('../config/featureFlags');
      const { isFirebaseConfigured } = await import('../lib/firebase');
      if (useFirebaseStorage() && isFirebaseConfigured()) {
        const { dataUrlToBlob, uploadAvatarPhoto, uploadIdPhoto } = await import(
          '../services/storage/clubStorage'
        );
        if (next.avatarUrl?.startsWith('data:')) {
          const { blob, contentType } = await dataUrlToBlob(next.avatarUrl);
          const up = await uploadAvatarPhoto({
            employeeId: employee.id,
            data: blob,
            contentType,
          });
          next = { ...next, avatarUrl: up.downloadURL };
        }
        if (next.idCardPhotoUrl?.startsWith('data:')) {
          const { blob, contentType } = await dataUrlToBlob(next.idCardPhotoUrl);
          const up = await uploadIdPhoto({
            employeeId: employee.id,
            data: blob,
            contentType,
          });
          next = { ...next, idCardPhotoUrl: up.downloadURL };
        }
      }
      onUpdateEmployee(next);
      setDraft(next);
      setEditingIdentity(false);
    } catch (err) {
      console.error(err);
      alert(
        err instanceof Error
          ? `שמירת התמונה נכשלה: ${err.message}`
          : 'שמירת התמונה נכשלה — ודא ש-Storage Rules נפרסו'
      );
    }
  };

  const handleAvatarPick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('נא לבחור קובץ תמונה (JPG, PNG או WebP)');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      alert('גודל התמונה מוגבל ל־500KB. נסה תמונה קטנה יותר.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft(prev => ({ ...prev, avatarUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  const handleIdCardPick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('נא לבחור תמונה או PDF של תעודת זהות');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      alert('גודל הקובץ מוגבל ל־500KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft(prev => ({ ...prev, idCardPhotoUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  const resetAddForm = () => {
    setDocTitle('');
    setDocType(sectionMeta.suggestedTypes?.[0] || '');
    setDocDate(new Date().toISOString().split('T')[0]);
    setDocNotes('');
    setDocFileName(undefined);
    setDocFileDataUrl(undefined);
    setDocFileBlob(null);
    setShowAddForm(false);
  };

  const openAddForm = () => {
    setDocType(sectionMeta.suggestedTypes?.[0] || '');
    setDocTitle('');
    setShowAddForm(true);
  };

  const handleFilePick = async (file: File | null) => {
    if (!file) return;
    setDocFileName(file.name);
    setDocFileBlob(file);

    const { useFirebaseStorage } = await import('../config/featureFlags');
    const { isFirebaseConfigured } = await import('../lib/firebase');
    const storageOn = useFirebaseStorage() && isFirebaseConfigured();
    const maxBytes = storageOn ? MAX_FILE_BYTES_STORAGE : MAX_FILE_BYTES_LOCAL;

    if (file.size > maxBytes) {
      setDocFileDataUrl(undefined);
      setDocFileBlob(null);
      alert(
        storageOn
          ? 'הקובץ גדול מ־10MB — לא ניתן להעלות.'
          : 'הקובץ גדול מ־400KB — יישמר רק שם הקובץ בתיק (בלי תוכן).'
      );
      return;
    }

    if (storageOn) {
      // Content will be uploaded on submit — keep blob only
      setDocFileDataUrl(undefined);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setDocFileDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (section === 'identity' || section === 'salary') return;
    if (!docTitle.trim() || !docType.trim()) return;

    setAddingDoc(true);
    try {
      const id = `efd-${Date.now()}`;
      let fileDataUrl = docFileDataUrl;
      let storagePath: string | undefined;

      const { useFirebaseStorage } = await import('../config/featureFlags');
      const { isFirebaseConfigured } = await import('../lib/firebase');
      if (useFirebaseStorage() && isFirebaseConfigured() && docFileBlob) {
        const { uploadEmployeeFile } = await import('../services/storage/clubStorage');
        const uploaded = await uploadEmployeeFile({
          employeeId: employee.id,
          fileId: id,
          fileName: docFileBlob.name,
          data: docFileBlob,
          contentType: docFileBlob.type || 'application/octet-stream',
        });
        fileDataUrl = uploaded.downloadURL;
        storagePath = uploaded.storagePath;
      }

      const newDoc: EmployeeFileDocument = {
        id,
        employeeId: employee.id,
        category: section as PersonalFileCategory,
        title: docTitle.trim(),
        docType: docType.trim(),
        issuedAt: docDate,
        notes: docNotes.trim() || undefined,
        fileName: docFileName,
        fileDataUrl,
        storagePath,
        createdAt: new Date().toISOString(),
      };
      onAddDocument(newDoc);
      resetAddForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'העלאת הקובץ נכשלה');
    } finally {
      setAddingDoc(false);
    }
  };

  const completeness = useMemo(() => {
    const filled =
      (employee.phone ? 1 : 0) +
      (employee.address ? 1 : 0) +
      (employee.bankAccount?.accountNumber ? 1 : 0) +
      (empAgreements.length > 0 ? 1 : 0) +
      (['recruitment', 'tax', 'employment', 'absences', 'pension', 'evaluations'] as PersonalFileCategory[])
        .filter(c => empDocs.some(d => d.category === c)).length;
    const total = 10;
    return Math.round((filled / total) * 100);
  }, [employee, empAgreements.length, empDocs]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center text-xs font-bold text-slate-600 hover:text-[var(--brand)] transition-colors"
        >
          <ArrowRight className="w-4 h-4 ml-1" />
          חזרה לרשימת הסגל
        </button>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">שלמות התיק</span>
          <div className="w-28 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${completeness}%`,
                backgroundColor: completeness >= 70 ? 'var(--accent)' : 'var(--brand)',
              }}
            />
          </div>
          <span className="font-bold text-slate-800">{completeness}%</span>
        </div>
      </div>

      {/* Employee header */}
      <div
        className="rounded-3xl p-5 text-white shadow-lg flex flex-col sm:flex-row sm:items-center gap-4"
        style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
      >
        <img
          src={employee.avatarUrl || DEFAULT_AVATAR}
          alt={employee.name}
          className="w-16 h-16 rounded-full object-cover ring-4 ring-white/30"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-black tracking-tight">תיק אישי — {employee.name}</h2>
          <p className="text-sm text-white/85 mt-0.5">
            {employee.role} · {employee.department} · ת.ז. {employee.idNumber}
          </p>
          <p className="text-xs text-white/70 mt-1">
            תחילת העסקה: {new Date(employee.startDate).toLocaleDateString('he-IL')} · {empDocs.length} מסמכים בתיק · {signedAgreements.length} הסכמים חתומים
            {employee.profileLockedAt ? ' · פרטים ננעלו לאחר הזנת העובד' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/15 border border-white/25 rounded-2xl px-3.5 py-2.5 shrink-0 self-start sm:self-center">
          <span className="text-xs font-extrabold text-white whitespace-nowrap">
            {isEmployeeActive(employee) ? 'פעיל' : 'לא פעיל'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isEmployeeActive(employee)}
            aria-label={isEmployeeActive(employee) ? 'עובד פעיל' : 'עובד לא פעיל'}
            onClick={() => {
              const nextActive = !isEmployeeActive(employee);
              const next = { ...employee, isActive: nextActive };
              onUpdateEmployee(next);
              setDraft((prev) => ({ ...prev, isActive: nextActive }));
            }}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
              isEmployeeActive(employee) ? 'bg-emerald-400' : 'bg-white/35'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                isEmployeeActive(employee) ? 'left-[1.35rem]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Section nav */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 min-w-max">
          {FILE_SECTIONS.map(s => {
            const Icon = s.icon;
            const active = section === s.id;
            const count = counts[s.id] ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSection(s.id);
                  setShowAddForm(false);
                  setEditingIdentity(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  active ? 'text-white shadow-sm' : 'text-slate-600 hover:bg-[var(--brand-light)]'
                }`}
                style={active ? { backgroundColor: 'var(--brand)' } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.shortLabel}
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content panel */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-[var(--brand-light)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <sectionMeta.icon className="w-5 h-5 text-[var(--brand)]" />
              {sectionMeta.label}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{sectionMeta.description}</p>
          </div>
          {section !== 'identity' && section !== 'salary' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openAddForm}
                className="inline-flex items-center px-3.5 py-2 text-white font-bold rounded-xl text-xs shadow-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <FilePlus2 className="w-4 h-4 ml-1.5" />
                הוסף מסמך
              </button>
            </div>
          )}
          {section === 'identity' && !editingIdentity && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOnboardingInvite(true)}
                disabled={!isEmployeeActive(employee)}
                title={
                  isEmployeeActive(employee)
                    ? undefined
                    : 'לא ניתן לשלוח קישור לעובד לא פעיל'
                }
                className="inline-flex items-center px-3.5 py-2 text-white font-bold rounded-xl text-xs shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#25D366' }}
              >
                <MessageCircle className="w-4 h-4 ml-1.5" />
                שלח קישור תיק אישי לעובד
              </button>
              <button
                type="button"
                onClick={startEditIdentity}
                className="inline-flex items-center px-3.5 py-2 text-white font-bold rounded-xl text-xs shadow-sm"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                <Pencil className="w-4 h-4 ml-1.5" />
                עריכת פרטים
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          {/* IDENTITY */}
          {section === 'identity' && (
            editingIdentity ? (
              <form onSubmit={saveIdentity} className="space-y-4 max-w-2xl">
                {/* Employee photo */}
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-[var(--brand-light)]/60 border border-sky-100">
                  <img
                    src={draft.avatarUrl || DEFAULT_AVATAR}
                    alt={draft.name || 'תמונת עובד'}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                  />
                  <div className="flex-1 text-center sm:text-right space-y-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">תמונת העובד</h4>
                      <p className="text-[11px] text-slate-500">
                        התמונה תוצג ליד שם העובד בתיק ובכרטיס הסגל · JPG / PNG / WebP · עד 500KB
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <CameraOrFilePick
                        accept="image/jpeg,image/png,image/webp"
                        capture="user"
                        onFile={handleAvatarPick}
                        uploadLabel="העלאת קובץ"
                        cameraLabel="צילום במצלמה"
                      />
                      {draft.avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setDraft(prev => ({ ...prev, avatarUrl: undefined }))}
                          className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                          הסר תמונה
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex-1 space-y-2 w-full">
                    <h4 className="text-sm font-black text-slate-900">צילום תעודת זהות</h4>
                    <p className="text-[11px] text-slate-500">העובד / המנהל מעלים צילום ת.ז. · תמונה או PDF · עד 500KB</p>
                    {draft.idCardPhotoUrl ? (
                      <div className="space-y-2">
                        <img
                          src={draft.idCardPhotoUrl}
                          alt="תעודת זהות"
                          className="max-h-36 rounded-xl border border-slate-200 object-contain bg-white"
                        />
                        <div className="flex flex-wrap gap-2">
                          <CameraOrFilePick
                            accept="image/*,application/pdf"
                            capture="environment"
                            onFile={handleIdCardPick}
                            uploadLabel="החלפת קובץ"
                            cameraLabel="צילום מחדש"
                          />
                          <button
                            type="button"
                            onClick={() => setDraft(prev => ({ ...prev, idCardPhotoUrl: undefined }))}
                            className="text-xs font-bold text-rose-600 px-2"
                          >
                            הסר צילום
                          </button>
                        </div>
                      </div>
                    ) : (
                      <CameraOrFilePick
                        accept="image/*,application/pdf"
                        capture="environment"
                        onFile={handleIdCardPick}
                        uploadLabel="העלאת קובץ"
                        cameraLabel="צילום במצלמה"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs">
                    <span className="font-bold text-slate-600">שם מלא</span>
                    <input className={`${fieldClassXs} mt-1`} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required />
                  </label>
                  <label className="block text-xs">
                    <span className="font-bold text-slate-600">מספר ת.ז.</span>
                    <input className={`${fieldClassXs} mt-1 font-mono`} value={draft.idNumber} onChange={e => setDraft({ ...draft, idNumber: e.target.value })} required />
                  </label>
                  <label className="block text-xs sm:col-span-2">
                    <span className="font-bold text-slate-600">כתובת</span>
                    <input className={`${fieldClassXs} mt-1`} value={draft.address || ''} onChange={e => setDraft({ ...draft, address: e.target.value })} placeholder="רחוב, עיר" />
                  </label>
                  <label className="block text-xs">
                    <span className="font-bold text-slate-600">טלפון</span>
                    <input className={`${fieldClassXs} mt-1`} value={draft.phone || ''} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="05X-XXXXXXX" />
                  </label>
                  <label className="block text-xs">
                    <span className="font-bold text-slate-600">דוא״ל</span>
                    <input type="email" className={`${fieldClassXs} mt-1`} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
                  </label>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-800 mb-3">פרטי חשבון בנק</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs">
                      <span className="font-bold text-slate-600">שם הבנק</span>
                      <input
                        className={`${fieldClassXs} mt-1`}
                        value={draft.bankAccount?.bankName || ''}
                        onChange={e => setDraft({
                          ...draft,
                          bankAccount: { ...(draft.bankAccount || { branchNumber: '', accountNumber: '', accountHolderName: draft.name }), bankName: e.target.value },
                        })}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-bold text-slate-600">מספר סניף</span>
                      <input
                        className={`${fieldClassXs} mt-1 font-mono`}
                        value={draft.bankAccount?.branchNumber || ''}
                        onChange={e => setDraft({
                          ...draft,
                          bankAccount: { ...(draft.bankAccount || { bankName: '', accountNumber: '', accountHolderName: draft.name }), branchNumber: e.target.value },
                        })}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-bold text-slate-600">מספר חשבון</span>
                      <input
                        className={`${fieldClassXs} mt-1 font-mono`}
                        value={draft.bankAccount?.accountNumber || ''}
                        onChange={e => setDraft({
                          ...draft,
                          bankAccount: { ...(draft.bankAccount || { bankName: '', branchNumber: '', accountHolderName: draft.name }), accountNumber: e.target.value },
                        })}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-bold text-slate-600">שם בעל החשבון</span>
                      <input
                        className={`${fieldClassXs} mt-1`}
                        value={draft.bankAccount?.accountHolderName || ''}
                        onChange={e => setDraft({
                          ...draft,
                          bankAccount: { ...(draft.bankAccount || { bankName: '', branchNumber: '', accountNumber: '' }), accountHolderName: e.target.value },
                        })}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setEditingIdentity(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">
                    ביטול
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-xl text-white font-bold text-xs inline-flex items-center" style={{ backgroundColor: 'var(--accent)' }}>
                    <Save className="w-4 h-4 ml-1.5" />
                    שמור פרטים
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--brand-light)]/50 border border-sky-100">
                  <button
                    type="button"
                    disabled={!employee.avatarUrl}
                    onClick={() => {
                      if (!employee.avatarUrl) return;
                      setViewingAttachment({
                        title: `תמונת עובד — ${employee.name}`,
                        fileName: 'employee-avatar',
                        fileDataUrl: employee.avatarUrl,
                      });
                    }}
                    className="shrink-0 disabled:cursor-default"
                    title={employee.avatarUrl ? 'לחץ לצפייה מוגדלת' : undefined}
                  >
                    <img
                      src={employee.avatarUrl || DEFAULT_AVATAR}
                      alt={employee.name}
                      className={`w-20 h-20 rounded-full object-cover border-4 border-white shadow-md ${
                        employee.avatarUrl ? 'hover:opacity-90 transition-opacity cursor-zoom-in' : ''
                      }`}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-slate-500 mb-0.5">תמונת העובד</div>
                    <div className="font-black text-slate-900 text-lg">{employee.name}</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {employee.avatarUrl ? 'תמונה שמורה בתיק · לחץ לצפייה' : 'לא הועלתה תמונה — ניתן להוסיף בעריכת פרטים'}
                    </p>
                    {employee.avatarUrl && (
                      <div className="mt-2">
                        <AttachmentActions
                          title={`תמונת עובד — ${employee.name}`}
                          fileName="employee-avatar"
                          fileDataUrl={employee.avatarUrl}
                          onView={setViewingAttachment}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-[11px] font-bold text-slate-500">צילום תעודת זהות</div>
                    {employee.idCardPhotoUrl && (
                      <AttachmentActions
                        title="צילום תעודת זהות"
                        fileName="teudat-zehut"
                        fileDataUrl={employee.idCardPhotoUrl}
                        onView={setViewingAttachment}
                      />
                    )}
                  </div>
                  {employee.idCardPhotoUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setViewingAttachment({
                          title: 'צילום תעודת זהות',
                          fileName: 'teudat-zehut',
                          fileDataUrl: employee.idCardPhotoUrl,
                        })
                      }
                      className="block w-full text-right"
                      title="לחץ לצפייה מוגדלת"
                    >
                      <img
                        src={employee.idCardPhotoUrl}
                        alt="תעודת זהות"
                        className="max-h-40 rounded-xl border border-slate-200 object-contain bg-white hover:opacity-95 transition-opacity cursor-zoom-in"
                      />
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500">לא הועלה צילום ת.ז. — ניתן להוסיף בעריכה או דרך קישור לעובד</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {[
                    ['שם מלא', employee.name],
                    ['תעודת זהות', employee.idNumber],
                    ['כתובת', employee.address || '— לא הוזן'],
                    ['טלפון', employee.phone || '— לא הוזן'],
                    ['דוא״ל', employee.email],
                    ['תפקיד', employee.role],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[var(--brand-light)]/50 rounded-xl p-3 border border-sky-100">
                      <div className="text-[11px] font-bold text-slate-500 mb-0.5">{label}</div>
                      <div className="font-bold text-slate-900">{value}</div>
                    </div>
                  ))}
                  <div className="sm:col-span-2 bg-white rounded-xl p-4 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-500 mb-2">פרטי חשבון בנק</div>
                    {employee.bankAccount?.accountNumber ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-slate-500 block">בנק</span><strong>{employee.bankAccount.bankName}</strong></div>
                        <div><span className="text-slate-500 block">סניף</span><strong className="font-mono">{employee.bankAccount.branchNumber}</strong></div>
                        <div><span className="text-slate-500 block">חשבון</span><strong className="font-mono">{employee.bankAccount.accountNumber}</strong></div>
                        <div><span className="text-slate-500 block">בעל החשבון</span><strong>{employee.bankAccount.accountHolderName}</strong></div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">לא הוזנו פרטי בנק — לחץ על עריכת פרטים להשלמה.</p>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {/* SALARY AGREEMENTS — signed by employee + manager */}
          {section === 'salary' && (
            signedAgreements.length === 0 ? (
              <EmptyState text="אין הסכמי שכר חתומים (עובד + מנהל) להצגה." />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  מוצגים רק הסכמים שנחתמו על ידי העובד והמנהל ({signedAgreements.length} מתוך {empAgreements.length}).
                </p>
                {signedAgreements.map(ag => (
                  <div key={ag.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 hover:border-[var(--brand)]/40 transition-colors">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{ag.title}</div>
                      <div className="text-xs text-slate-500 mt-1 font-mono">
                        {ag.docNumber} · ₪{ag.monthlySalary.toLocaleString()} · {new Date(ag.createdAt).toLocaleDateString('he-IL')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {ag.blockchain ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--accent)' }}>
                          <ShieldCheck className="w-3.5 h-3.5 ml-1" />
                          מאומת #{ag.blockchain.blockNumber}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          חתום
                        </span>
                      )}
                      {isAgreementExpiredOrInactive(ag) && (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          לא פעיל
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenAgreement(ag)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                        style={{ backgroundColor: 'var(--brand)' }}
                      >
                        צפייה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* DOCUMENT CATEGORIES */}
          {section !== 'identity' && section !== 'salary' && (
            <div className="space-y-4">
              {showAddForm && (
                <form onSubmit={handleAddDocument} className="bg-[var(--brand-light)]/60 border border-sky-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800">הוספת מסמך לתיק</h4>
                    <button type="button" onClick={resetAddForm} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs">
                      <span className="font-bold text-slate-600">סוג מסמך</span>
                      <select
                        className={`${fieldClassXs} mt-1`}
                        value={docType}
                        onChange={e => {
                          setDocType(e.target.value);
                          if (!docTitle) setDocTitle(e.target.value);
                        }}
                      >
                        {(sectionMeta.suggestedTypes || ['מסמך']).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="font-bold text-slate-600">תאריך המסמך</span>
                      <input type="date" className={`${fieldClassXs} mt-1`} value={docDate} onChange={e => setDocDate(e.target.value)} required />
                    </label>
                    <label className="block text-xs sm:col-span-2">
                      <span className="font-bold text-slate-600">כותרת</span>
                      <input className={`${fieldClassXs} mt-1`} value={docTitle} onChange={e => setDocTitle(e.target.value)} required placeholder="שם המסמך בתיק" />
                    </label>
                    <label className="block text-xs sm:col-span-2">
                      <span className="font-bold text-slate-600">הערות</span>
                      <input className={`${fieldClassXs} mt-1`} value={docNotes} onChange={e => setDocNotes(e.target.value)} placeholder="אופציונלי" />
                    </label>
                    <label className="block text-xs sm:col-span-2">
                      <span className="font-bold text-slate-600 flex items-center gap-1">
                        <Paperclip className="w-3.5 h-3.5" />
                        צירוף קובץ (עד 400KB)
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        className="mt-1 block w-full text-xs"
                        onChange={e => handleFilePick(e.target.files?.[0] ?? null)}
                      />
                      {docFileName && <span className="text-[11px] text-slate-500 mt-1 block">{docFileName}</span>}
                    </label>
                  </div>
                  <button type="submit" className="px-4 py-2 rounded-xl text-white font-bold text-xs" style={{ backgroundColor: 'var(--brand)' }}>
                    שמור בתיק
                  </button>
                </form>
              )}

              {categoryDocs.length === 0 ? (
                <EmptyState text={`אין עדיין מסמכים בתיקייה "${sectionMeta.label}". לחץ על הוסף מסמך.`} />
              ) : (
                <div className="space-y-2">
                  {categoryDocs.map(doc => (
                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-[var(--brand-light)] text-[var(--brand)]">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{doc.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-semibold text-[var(--brand-dark)]">{doc.docType}</span>
                            {' · '}
                            {new Date(doc.issuedAt).toLocaleDateString('he-IL')}
                            {doc.fileName ? ` · ${doc.fileName}` : ''}
                          </div>
                          {doc.notes && <p className="text-[11px] text-slate-500 mt-1">{doc.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <AttachmentActions
                          title={doc.title}
                          fileName={doc.fileName}
                          fileDataUrl={doc.fileDataUrl}
                          storagePath={doc.storagePath}
                          onView={setViewingAttachment}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`למחוק את המסמך "${doc.title}" מהתיק?`)) {
                              onDeleteDocument(doc.id);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white inline-flex items-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 ml-1" />
                          מחק
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showOnboardingInvite && (
        <WhatsAppOnboardingShare
          employee={employee}
          agreements={agreements}
          documents={documents.filter((d) => d.employeeId === employee.id)}
          onClose={() => setShowOnboardingInvite(false)}
        />
      )}

      <FileAttachmentViewer
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--brand-light)] flex items-center justify-center text-[var(--brand)]">
        <FileText className="w-6 h-6" />
      </div>
      <p className="text-sm text-slate-600 font-medium">{text}</p>
    </div>
  );
}
