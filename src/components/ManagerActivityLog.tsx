import React, { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Search,
  Inbox,
} from 'lucide-react';
import type { ManagerActivityEvent } from '../types';
import { matchesActivitySearch } from '../config/activityLog';
import { fieldClassXs } from './ui/PageBanner';

type LogView = 'active' | 'archived' | 'all';

interface ManagerActivityLogProps {
  events: ManagerActivityEvent[];
  onArchiveEvent: (eventId: string) => void;
  onOpenEvent: (event: ManagerActivityEvent) => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const ManagerActivityLog: React.FC<ManagerActivityLogProps> = ({
  events,
  onArchiveEvent,
  onOpenEvent,
}) => {
  const [view, setView] = useState<LogView>('active');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const active = events.filter((e) => e.status === 'active').length;
    const archived = events.filter((e) => e.status === 'archived').length;
    return { active, archived, all: events.length };
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (view === 'active' && e.status !== 'active') return false;
      if (view === 'archived' && e.status !== 'archived') return false;
      return matchesActivitySearch(e, search);
    });
  }, [events, view, search]);

  const handleArchive = (eventId: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    onArchiveEvent(eventId);
  };

  const tabs: { id: LogView; label: string; count: number; icon: React.ElementType }[] = [
    { id: 'active', label: 'פעילות', count: counts.active, icon: Inbox },
    { id: 'archived', label: 'ארכיון', count: counts.archived, icon: Archive },
    { id: 'all', label: 'הכל', count: counts.all, icon: ClipboardList },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[var(--brand)]" />
            לוג אירועי תיק
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            עדכונים שהעובדים ביצעו בתיק האישי · לחיצה פותחת את הכרטיסייה הרלוונטית
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-colors border ${
                  active
                    ? 'text-white border-transparent'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                style={active ? { backgroundColor: 'var(--brand)' } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                <span
                  className={`min-w-[1.25rem] text-center rounded-md px-1 ${
                    active ? 'bg-white/20' : 'bg-white border border-slate-200'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-100">
        <div className="relative max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, ת.ז., סוג מסמך, כרטיסייה או תיאור…"
            className={`${fieldClassXs} pr-10`}
          />
        </div>
      </div>

      <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
        {filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-slate-500">
            {search.trim()
              ? 'לא נמצאו אירועים התואמים לחיפוש'
              : view === 'active'
                ? 'אין אירועים פעילים כרגע'
                : 'אין אירועים להצגה'}
          </li>
        )}

        {filtered.map((event) => {
          const isActive = event.status === 'active';
          return (
            <li key={event.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenEvent(event)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenEvent(event);
                  }
                }}
                className="w-full text-right px-5 py-3.5 flex items-start gap-3 hover:bg-[var(--brand-light)]/60 transition-colors cursor-pointer group"
              >
                <div
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    isActive ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 leading-relaxed group-hover:text-[var(--brand-dark)]">
                    {event.description}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-600">{formatWhen(event.createdAt)}</span>
                    <span>ת.ז. {event.employeeIdNumber || '—'}</span>
                    <span
                      className="px-1.5 py-0.5 rounded-md border border-slate-200 bg-white font-bold text-slate-700"
                    >
                      {event.categoryLabel}
                    </span>
                    {event.docType && <span>{event.docType}</span>}
                    {!isActive && event.archivedAt && (
                      <span className="text-slate-400">טופל · {formatWhen(event.archivedAt)}</span>
                    )}
                  </div>
                </div>
                {isActive && (
                  <button
                    type="button"
                    onClick={(e) => handleArchive(event.id, e)}
                    className="shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold text-white flex items-center gap-1 hover:opacity-95"
                    style={{ backgroundColor: 'var(--accent)' }}
                    title="סמן כטופל והעבר לארכיון"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    טופל
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
