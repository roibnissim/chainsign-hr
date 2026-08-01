import React from 'react';
import {
  Plus,
  Search,
  FileCheck2,
  Users,
  Blocks,
  Layers,
  FileSignature,
  Shield,
  Palette,
  LayoutDashboard,
  LogOut,
  UserCog,
} from 'lucide-react';
import { BrandingSettings } from '../config/branding';
import { ClubLogo } from './ClubLogo';
import { useAuth } from '../context/AuthContext';

export type AppTab =
  | 'dashboard'
  | 'repository'
  | 'signer'
  | 'templates'
  | 'verifier'
  | 'ledger'
  | 'employees'
  | 'branding'
  | 'users'
  | 'account';

interface HeaderProps {
  branding: BrandingSettings;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onNewAgreementClick: () => void;
  totalVerifiedCount: number;
}

const navItems: { id: AppTab; label: string; icon: React.ElementType; highlight?: boolean }[] = [
  { id: 'dashboard', label: 'דאשבורד', icon: LayoutDashboard },
  { id: 'repository', label: 'ארכיון מסמכים', icon: FileSignature },
  { id: 'signer', label: 'החתמת הסכם', icon: Plus },
  { id: 'templates', label: 'תבניות', icon: Layers },
  { id: 'employees', label: 'סגל ועובדים', icon: Users },
  { id: 'verifier', label: 'אימות PDF', icon: FileCheck2 },
  { id: 'ledger', label: 'סייר בלוקצ׳יין', icon: Blocks },
  { id: 'branding', label: 'מיתוג ולוגו', icon: Palette, highlight: true },
  { id: 'users', label: 'משתמשים והרשאות', icon: UserCog },
];

export const Header: React.FC<HeaderProps> = ({
  branding,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  onNewAgreementClick,
  totalVerifiedCount,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 shadow-md">
      {/* Top status strip — ASA-like sky blue */}
      <div
        className="px-4 py-1.5 text-xs text-white flex items-center justify-between"
        style={{ backgroundColor: branding.primaryColor }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center font-medium">
            <span
              className="w-2 h-2 rounded-full animate-pulse ml-2"
              style={{ backgroundColor: branding.accentColor }}
            />
            מערכת ניהול פעילה · {branding.clubNameEn}
          </span>
          <span className="opacity-40 hidden sm:inline">|</span>
          <span className="opacity-90 hidden sm:inline">{branding.tagline}</span>
        </div>
        <span
          className="bg-white/15 border border-white/25 px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center"
        >
          <Shield className="w-3.5 h-3.5 ml-1" />
          {totalVerifiedCount} מסמכים מאומתים
        </span>
      </div>

      {/* Main white header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Brand */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 group text-right"
          >
            <ClubLogo src={branding.logoDataUrl} size="md" className="group-hover:scale-105 transition-transform" />
            <div>
              <h1
                className="text-xl font-black tracking-tight group-hover:opacity-90 transition-opacity"
                style={{ color: branding.primaryColor }}
              >
                {branding.clubName}
              </h1>
              <p className="text-xs text-slate-500 font-medium">{branding.clubNameEn} · ניהול אגודה</p>
            </div>
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש עובד, הסכם או HASH..."
              className="w-full pl-4 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ ['--tw-ring-color' as string]: `${branding.primaryColor}55` }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-700"
              >
                נקה
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                title="החשבון שלי"
                aria-label="החשבון שלי"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all text-right ${
                  activeTab === 'account'
                    ? 'bg-[var(--brand-light)] border-[var(--brand)]/40 ring-1 ring-[var(--brand)]/30'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[var(--brand-light)]" />
                )}
                <div className="min-w-0 text-right hidden sm:block max-w-[160px]">
                  <p className="text-[11px] font-bold text-slate-800 truncate">{user.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {user.role === 'SYSTEM_ADMIN' ? 'מנהל מערכת' : 'מנהל'}
                  </p>
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-all"
              title="התנתקות"
            >
              <LogOut className="w-4 h-4 ml-1.5" />
              <span className="hidden sm:inline">יציאה</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('verifier')}
              className="flex items-center px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-all"
            >
              <FileCheck2 className="w-4 h-4 ml-1.5" style={{ color: branding.accentColor }} />
              אימות PDF
            </button>
            <button
              type="button"
              onClick={onNewAgreementClick}
              className="flex items-center px-4 py-2 text-white font-bold rounded-xl text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: branding.accentColor }}
            >
              <Plus className="w-4 h-4 ml-1.5 stroke-[3]" />
              הסכם חדש
            </button>
          </div>
        </div>
      </div>

      {/* Nav tabs — ASA style */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto flex gap-1 py-2 text-sm">
          {navItems.map(({ id, label, icon: Icon, highlight }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center px-3.5 py-2 rounded-lg font-semibold text-xs sm:text-sm whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white shadow-sm'
                    : highlight
                      ? 'text-[var(--brand)] hover:bg-[var(--brand-light)]'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
                style={
                  isActive
                    ? { backgroundColor: branding.primaryColor }
                    : undefined
                }
              >
                <Icon className="w-4 h-4 ml-1.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
