import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageBannerProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}

export const PageBanner: React.FC<PageBannerProps> = ({
  icon: Icon,
  title,
  subtitle,
  badge,
  action,
}) => (
  <div
    className="rounded-3xl p-5 sm:p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
    style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
  >
    <div className="flex items-center gap-3">
      <div className="p-3 bg-white/15 border border-white/25 rounded-2xl shrink-0">
        <Icon className="w-7 h-7 text-white" />
      </div>
      <div>
        {badge}
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
        <p className="text-xs text-white/80 mt-0.5">{subtitle}</p>
      </div>
    </div>
    {action}
  </div>
);

export const fieldClass =
  'w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/35 focus:border-[var(--brand)]';

export const fieldClassXs =
  'w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/35 focus:border-[var(--brand)]';

export const primaryBtnClass =
  'px-5 py-2.5 text-white font-bold rounded-xl text-xs shadow-sm transition-all hover:opacity-95 flex items-center justify-center';

export const accentBtnClass =
  'px-5 py-2.5 text-white font-bold rounded-xl text-xs shadow-sm transition-all hover:opacity-95 flex items-center justify-center';
