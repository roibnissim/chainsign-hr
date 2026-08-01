import React, { useState, useMemo } from 'react';
import { 
  SalaryAgreement, 
  Employee, 
  RoleType, 
  FilterState,
  AgreementTemplate,
} from '../types';
import { 
  FileText, 
  Download, 
  Eye, 
  ShieldCheck, 
  Clock, 
  UserCheck, 
  Briefcase, 
  Filter, 
  Search, 
  FileCheck2,
  Tag,
  PenTool,
  Grid,
  List,
  X
} from 'lucide-react';
import { getDownloadableAgreementPdf, downloadPdfFile } from '../services/agreementPdfDownload';
import { isAgreementExpiredOrInactive } from '../services/agreementValidity';

interface DocumentRepositoryProps {
  agreements: SalaryAgreement[];
  employees: Employee[];
  roles: RoleType[];
  templates?: AgreementTemplate[];
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
  onOpenViewer: (agreement: SalaryAgreement) => void;
  onOpenSignerModal: (agreement: SalaryAgreement) => void;
}

const emptyFilters: FilterState = {
  searchQuery: '',
  employeeId: '',
  role: '',
  status: 'ALL',
  blockchainVerifiedOnly: false,
  dateRange: 'ALL',
};

export const DocumentRepository: React.FC<DocumentRepositoryProps> = ({
  agreements,
  employees,
  roles,
  templates = [],
  filterState,
  setFilterState,
  onOpenViewer,
  onOpenSignerModal
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filteredAgreements = useMemo(() => {
    return agreements.filter(doc => {
      if (filterState.searchQuery) {
        const q = filterState.searchQuery.toLowerCase();
        const matchTitle = doc.title.toLowerCase().includes(q);
        const matchEmpName = doc.employeeName.toLowerCase().includes(q);
        const matchRole = doc.role.toLowerCase().includes(q);
        const matchDocNum = doc.docNumber.toLowerCase().includes(q);
        const matchHash = doc.fileHash.toLowerCase().includes(q);
        const matchTags = doc.tags.some(t => t.toLowerCase().includes(q));

        if (!matchTitle && !matchEmpName && !matchRole && !matchDocNum && !matchHash && !matchTags) {
          return false;
        }
      }

      if (filterState.employeeId && doc.employeeId !== filterState.employeeId) {
        return false;
      }

      if (filterState.role && doc.role !== filterState.role) {
        return false;
      }

      if (filterState.status && filterState.status !== 'ALL' && doc.status !== filterState.status) {
        return false;
      }

      if (filterState.blockchainVerifiedOnly && (!doc.blockchain || doc.status !== 'SIGNED')) {
        return false;
      }

      return true;
    });
  }, [agreements, filterState]);

  const activeFilterCount = [
    filterState.employeeId,
    filterState.role,
    filterState.status !== 'ALL' ? filterState.status : '',
    filterState.searchQuery,
  ].filter(Boolean).length;

  const handleFastDownload = async (agreement: SalaryAgreement) => {
    try {
      setDownloadingId(agreement.id);
      const emp = employees.find(e => e.id === agreement.employeeId);
      const pdfBytes = await getDownloadableAgreementPdf(agreement, emp, templates);
      const safeName = `${agreement.docNumber}_${agreement.employeeName.replace(/\s+/g, '_')}_Signed.pdf`;
      downloadPdfFile(pdfBytes, safeName);
    } catch (error) {
      console.error('Error generating PDF download:', error);
      alert('אירעה שגיאה בייצור קובץ ה-PDF להורדה.');
    } finally {
      setDownloadingId(null);
    }
  };

  const selectClass =
    'w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/35 focus:border-[var(--brand)] transition-shadow';

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden mb-8">
      {/* Section header — club blue */}
      <div
        className="p-5 sm:p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-xl font-black tracking-tight text-white flex items-center">
              <FileCheck2 className="w-5 h-5 ml-2 text-white/90" />
              שליפה וניהול קבצים לפי תיוגים
            </h2>
            <span className="bg-white/20 border border-white/30 text-white px-2.5 py-0.5 rounded-full text-xs font-bold">
              {filteredAgreements.length} קבצים
            </span>
            {activeFilterCount > 0 && (
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {activeFilterCount} סינונים פעילים
              </span>
            )}
          </div>
          <p className="text-xs text-white/80">
            סינון מהיר לפי תיוג עובד ותיוג תפקיד · הורדת PDF מיידית
          </p>
        </div>

        <div className="bg-white/15 backdrop-blur-sm p-1 rounded-xl border border-white/20 flex items-center self-start">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center transition-all ${
              viewMode === 'table' ? 'bg-white text-[var(--brand)] shadow-sm' : 'text-white/80 hover:text-white'
            }`}
          >
            <List className="w-4 h-4 ml-1" />
            טבלה
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center transition-all ${
              viewMode === 'cards' ? 'bg-white text-[var(--brand)] shadow-sm' : 'text-white/80 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4 ml-1" />
            כרטיסים
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="p-4 bg-[var(--brand-light)]/50 border-b border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
            <UserCheck className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
            תיוג לפי עובד
          </label>
          <select
            value={filterState.employeeId}
            onChange={(e) => setFilterState(prev => ({ ...prev, employeeId: e.target.value }))}
            className={selectClass}
          >
            <option value="">כל העובדים</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.idNumber}) — {emp.role}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
            <Briefcase className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
            תיוג לפי תפקיד
          </label>
          <select
            value={filterState.role}
            onChange={(e) => setFilterState(prev => ({ ...prev, role: e.target.value }))}
            className={selectClass}
          >
            <option value="">כל התפקידים</option>
            {roles.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
            <Filter className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
            סטטוס חתימה
          </label>
          <select
            value={filterState.status}
            onChange={(e) => setFilterState(prev => ({ ...prev, status: e.target.value }))}
            className={selectClass}
          >
            <option value="ALL">כל הסטטוסים</option>
            <option value="SIGNED">חתומים ומאומתים</option>
            <option value="PENDING_SIGNATURE">ממתינים לחתימה</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setFilterState(emptyFilters)}
            className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs transition-colors border border-slate-200 flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            איפוס סינונים
          </button>
        </div>
      </div>

      {/* Quick role tag pills */}
      <div className="px-5 py-3 bg-white border-b border-slate-100 flex items-center gap-2 overflow-x-auto scrollbar-none text-xs">
        <span className="font-bold text-slate-500 text-[11px] whitespace-nowrap flex items-center ml-1">
          <Tag className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
          סינון מהיר:
        </span>
        <button
          type="button"
          onClick={() => setFilterState(prev => ({ ...prev, role: '' }))}
          className={`px-3 py-1.5 rounded-full transition-all text-xs font-bold whitespace-nowrap ${
            !filterState.role
              ? 'text-white shadow-sm'
              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-[var(--brand)] hover:text-[var(--brand)]'
          }`}
          style={!filterState.role ? { backgroundColor: 'var(--brand)' } : undefined}
        >
          הכל
        </button>
        {roles.map(role => {
          const active = filterState.role === role;
          return (
            <button
              key={role}
              type="button"
              onClick={() => setFilterState(prev => ({ ...prev, role }))}
              className={`px-3 py-1.5 rounded-full transition-all text-xs font-semibold whitespace-nowrap ${
                active
                  ? 'text-white shadow-sm'
                  : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-[var(--brand)] hover:text-[var(--brand)]'
              }`}
              style={active ? { backgroundColor: 'var(--brand)' } : undefined}
            >
              {role}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {filteredAgreements.length === 0 ? (
        <div className="p-12 text-center">
          <div className="p-4 bg-[var(--brand-light)] rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3 text-[var(--brand)]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-base font-black text-slate-800">לא נמצאו מסמכים לתיוגים שנבחרו</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            נסה לבטל חלק מהסינונים או לחפש לפי שם עובד, תפקיד או מס׳ הסכם.
          </p>
          <button
            type="button"
            onClick={() => setFilterState(emptyFilters)}
            className="mt-4 px-5 py-2.5 text-white font-bold rounded-xl text-xs shadow-sm"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            אפס סינונים
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-700">
            <thead className="bg-[var(--brand-light)] text-[var(--navy)] uppercase font-bold border-b border-sky-100">
              <tr>
                <th className="px-4 py-3.5">מסמך</th>
                <th className="px-4 py-3.5">תיוג עובד</th>
                <th className="px-4 py-3.5">תיוג תפקיד</th>
                <th className="px-4 py-3.5">שכר חודשי</th>
                <th className="px-4 py-3.5">סטטוס</th>
                <th className="px-4 py-3.5">תאריך</th>
                <th className="px-4 py-3.5 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredAgreements.map((doc) => {
                const emp = employees.find(e => e.id === doc.employeeId);
                const isSigned = doc.status === 'SIGNED';

                return (
                  <tr key={doc.id} className="hover:bg-[var(--brand-light)]/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`p-2 rounded-xl mt-0.5 ${
                            isSigned
                              ? 'bg-emerald-50 text-[var(--accent)]'
                              : 'bg-sky-50 text-[var(--brand)]'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <button
                            type="button"
                            className="font-bold text-slate-900 text-sm hover:text-[var(--brand)] transition-colors text-right"
                            onClick={() => onOpenViewer(doc)}
                          >
                            {doc.title}
                          </button>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                            <span className="font-semibold text-slate-700">{doc.docNumber}</span>
                            <span>·</span>
                            <span>v{doc.version}</span>
                          </div>
                          {doc.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {doc.tags.slice(0, 3).map(tag => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 border border-slate-100"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => setFilterState(prev => ({ ...prev, employeeId: doc.employeeId }))}
                        className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-[var(--brand-light)] hover:bg-sky-100 text-slate-800 rounded-xl transition-colors border border-sky-100"
                        title="סנן לפי עובד זה"
                      >
                        {emp?.avatarUrl ? (
                          <img src={emp.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 text-[var(--brand)]" />
                        )}
                        <span className="font-bold text-xs">{doc.employeeName}</span>
                      </button>
                    </td>

                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => setFilterState(prev => ({ ...prev, role: doc.role }))}
                        className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors border"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--brand) 10%, white)',
                          color: 'var(--brand-dark)',
                          borderColor: 'color-mix(in srgb, var(--brand) 25%, white)',
                        }}
                        title="סנן לפי תפקיד זה"
                      >
                        <Briefcase className="w-3 h-3 ml-1" />
                        {doc.role}
                      </button>
                    </td>

                    <td className="px-4 py-3.5 font-black text-slate-900">
                      ₪{doc.monthlySalary.toLocaleString()}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-1.5">
                        {isSigned && doc.blockchain ? (
                          <div
                            className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold text-white"
                            style={{ backgroundColor: 'var(--accent)' }}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 ml-1" />
                            מאומת #{doc.blockchain.blockNumber}
                          </div>
                        ) : isSigned ? (
                          <div className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] font-bold">
                            חתום
                          </div>
                        ) : (
                          <div className="inline-flex items-center px-2.5 py-1 bg-sky-50 text-sky-800 border border-sky-200 rounded-xl text-[11px] font-bold">
                            <Clock className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
                            ממתין לחתימה
                          </div>
                        )}
                        {isAgreementExpiredOrInactive(doc) && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            לא פעיל
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px]">
                      {new Date(doc.createdAt).toLocaleDateString('he-IL')}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenViewer(doc)}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs transition-colors flex items-center border border-slate-200"
                        >
                          <Eye className="w-3.5 h-3.5 ml-1" />
                          צפייה
                        </button>

                        <button
                          type="button"
                          onClick={() => handleFastDownload(doc)}
                          disabled={downloadingId === doc.id}
                          className="px-3 py-1.5 text-white font-bold rounded-xl text-xs transition-all flex items-center shadow-sm disabled:opacity-50"
                          style={{ backgroundColor: 'var(--brand)' }}
                        >
                          <Download className="w-3.5 h-3.5 ml-1" />
                          {downloadingId === doc.id ? 'מייצר...' : 'PDF'}
                        </button>

                        {!isSigned && (
                          <button
                            type="button"
                            onClick={() => onOpenSignerModal(doc)}
                            className="px-3 py-1.5 text-white font-bold rounded-xl text-xs transition-colors flex items-center shadow-sm"
                            style={{ backgroundColor: 'var(--accent)' }}
                          >
                            <PenTool className="w-3.5 h-3.5 ml-1" />
                            {doc.employeeSignedAt ||
                            doc.fieldSignatures?.some((fs) => fs.signerRole === 'employee')
                              ? 'חתימת מועדון'
                              : 'המשך חתימה'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgreements.map((doc) => {
            const isSigned = doc.status === 'SIGNED';

            return (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-[var(--brand)]/30 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-[var(--brand)] bg-[var(--brand-light)] px-2 py-0.5 rounded-lg">
                      {doc.docNumber}
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      {isSigned ? (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center text-white"
                          style={{ backgroundColor: 'var(--accent)' }}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 ml-1" />
                          מאומת
                        </span>
                      ) : (
                        <span className="bg-sky-50 text-sky-800 border border-sky-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center">
                          <Clock className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
                          ממתין
                        </span>
                      )}
                      {isAgreementExpiredOrInactive(doc) && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          לא פעיל
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenViewer(doc)}
                    className="font-black text-slate-900 text-base mb-3 group-hover:text-[var(--brand)] transition-colors text-right w-full"
                  >
                    {doc.title}
                  </button>

                  <div className="space-y-2 mb-4 bg-[var(--brand-light)]/60 p-3 rounded-xl border border-sky-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">תיוג עובד</span>
                      <span className="font-bold text-slate-900 flex items-center">
                        <UserCheck className="w-3.5 h-3.5 ml-1 text-[var(--brand)]" />
                        {doc.employeeName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">תיוג תפקיד</span>
                      <span className="font-bold text-[var(--brand-dark)] bg-white px-2 py-0.5 rounded-lg border border-sky-100 text-[11px]">
                        {doc.role}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">שכר חודשי</span>
                      <span className="font-extrabold" style={{ color: 'var(--accent)' }}>
                        ₪{doc.monthlySalary.toLocaleString()}
                      </span>
                    </div>
                    {doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-sky-100/80">
                        {doc.tags.map(tag => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded-md bg-white text-slate-500 border border-slate-100"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenViewer(doc)}
                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center border border-slate-200"
                  >
                    <Eye className="w-3.5 h-3.5 ml-1" />
                    צפה
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFastDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="flex-1 py-2 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    <Download className="w-3.5 h-3.5 ml-1" />
                    {downloadingId === doc.id ? 'מוריד...' : 'הורד PDF'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
