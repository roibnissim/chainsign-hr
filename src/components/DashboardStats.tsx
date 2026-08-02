import React from 'react';
import {
  FileText,
  ShieldCheck,
  Clock,
  TrendingUp,
  CheckCircle2,
  Lock,
  Cpu,
} from 'lucide-react';
import { SalaryAgreement, Employee, AgreementTemplate } from '../types';
import { isAgreementInForce } from '../services/agreementValidity';
import { resolveAgreementMonthlySalary } from '../services/agreementSalary';

interface DashboardStatsProps {
  agreements: SalaryAgreement[];
  employees: Employee[];
  templates?: AgreementTemplate[];
  onFilterStatus: (status: string) => void;
  clubName?: string;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  agreements,
  employees,
  templates = [],
  onFilterStatus,
  clubName = 'האגודה',
}) => {
  const totalCount = agreements.length;
  const signedCount = agreements.filter((a) => a.status === 'SIGNED').length;
  const pendingCount = agreements.filter((a) => a.status === 'PENDING_SIGNATURE').length;
  const activeAgreements = agreements.filter(isAgreementInForce);
  const totalMonthlyPayroll = activeAgreements.reduce(
    (acc, curr) => acc + resolveAgreementMonthlySalary(curr, templates),
    0
  );
  const totalRolesTagged = new Set(agreements.map((a) => a.role)).size;

  return (
    <div className="space-y-6 mb-6">
      <div
        className="brand-hero rounded-3xl p-6 sm:p-8 shadow-lg"
        style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
      >
        <p className="text-sm text-white/80 font-medium mb-1">ברוכים הבאים למערכת הניהול</p>
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
          {clubName} — לשחק חזק!
        </h2>
        <p className="mt-2 text-white/85 max-w-2xl text-sm sm:text-base">
          ניהול הסכמים, סגל וחתימות דיגיטליות במקום אחד — עם אימות מסמכים מאובטח.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onFilterStatus('ALL')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              סה״כ הסכמים
            </span>
            <div className="p-2.5 bg-[var(--brand-light)] text-[var(--brand)] rounded-xl group-hover:bg-[var(--brand)] group-hover:text-white transition-colors">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-slate-900">{totalCount}</div>
            <span className="text-xs text-slate-500 font-medium">במערכת</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              {employees.length} עובדים · {totalRolesTagged} תפקידים
            </span>
            <span className="text-[var(--brand)] font-bold group-hover:underline">הצג הכל ←</span>
          </div>
        </div>

        <div
          onClick={() => onFilterStatus('SIGNED')}
          className="p-5 rounded-2xl shadow-md text-white hover:shadow-lg transition-all cursor-pointer group"
          style={{ background: 'linear-gradient(135deg, var(--brand-dark), var(--brand))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/90 uppercase tracking-wider flex items-center">
              <Lock className="w-3.5 h-3.5 ml-1" />
              חתומים ומאומתים
            </span>
            <div className="p-2.5 bg-white/15 border border-white/20 rounded-xl group-hover:bg-white group-hover:text-[var(--brand)] transition-colors">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white">{signedCount}</div>
            <span className="text-xs bg-white/15 border border-white/25 px-2 py-0.5 rounded-full font-medium">
              Verified
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-white/80">
            <span>טביעת אצבע SHA-256</span>
            <span className="font-bold group-hover:underline">סנן חתומים ←</span>
          </div>
        </div>

        <div
          onClick={() => onFilterStatus('PENDING_SIGNATURE')}
          className="bg-white p-5 rounded-2xl border border-sky-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider">
              ממתינים לחתימה
            </span>
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl group-hover:bg-sky-500 group-hover:text-white transition-colors">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-sky-900">{pendingCount}</div>
            <span className="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
              תזכורת פעילה
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>נשלח לאישור העובד</span>
            <span className="text-sky-600 font-bold group-hover:underline">סנן ממתינים ←</span>
          </div>
        </div>

        <div
          onClick={() => onFilterStatus('SIGNED_IN_FORCE')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              היקף שכר חודשי
            </span>
            <div className="p-2.5 bg-[var(--brand-light)] text-[var(--brand)] rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div
            className="flex items-baseline justify-between gap-2 min-w-0"
            title={
              activeAgreements.length
                ? activeAgreements
                    .map(
                      (a) =>
                        `${a.employeeName}: \u20AA${resolveAgreementMonthlySalary(a, templates).toLocaleString('he-IL')}`
                    )
                    .join(' | ')
                : 'אין הסכמים חתומים בטווח התוקף'
            }
          >
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums tracking-tight truncate">
              {'\u20AA'}
              {(Number(totalMonthlyPayroll) || 0).toLocaleString('he-IL')}
            </div>
            <span className="text-xs text-slate-500 font-medium shrink-0">בחודש</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center text-slate-500">
              <Cpu className="w-3.5 h-3.5 ml-1 text-slate-400" />
              {activeAgreements.length} הסכמים פעילים
            </span>
            <span className="font-bold flex items-center group-hover:underline" style={{ color: 'var(--accent)' }}>
              <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
              בטווח תוקף — הצג ←
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
