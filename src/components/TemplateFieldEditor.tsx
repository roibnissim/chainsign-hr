import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TemplateField,
  TemplateFieldKind,
  TemplateSignerRole,
  TEMPLATE_FIELD_KIND_LABELS,
} from '../types';
import {
  displayRectToPdf,
  pdfRectToDisplay,
  renderPdfPages,
  RenderedPdfPage,
} from '../services/pdfRenderer';
import { Trash2, MousePointer2, Link2, X } from 'lucide-react';

interface TemplateFieldEditorProps {
  pdfBytes: Uint8Array;
  fields: TemplateField[];
  onChangeFields: (fields: TemplateField[]) => void;
}

const KIND_OPTIONS: TemplateFieldKind[] = [
  'employee_name',
  'id_number',
  'phone',
  'address',
  'email',
  'salary',
  'salary_words',
  'date_day',
  'date_month',
  'date_year',
  'text',
  'signature',
];

function newFieldId() {
  return `fld-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const TemplateFieldEditor: React.FC<TemplateFieldEditorProps> = ({
  pdfBytes,
  fields,
  onChangeFields,
}) => {
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<TemplateFieldKind>('salary');
  const [signerRole, setSignerRole] = useState<TemplateSignerRole>('employee');
  const [linkSalaryId, setLinkSalaryId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{
    pageIndex: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const salaryFields = useMemo(
    () => fields.filter((f) => f.kind === 'salary'),
    [fields]
  );

  useEffect(() => {
    if (salaryFields.length > 0 && !linkSalaryId) {
      setLinkSalaryId(salaryFields[0].id);
    }
  }, [salaryFields, linkSalaryId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    renderPdfPages(pdfBytes)
      .then((p) => {
        if (!cancelled) setPages(p);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError('לא ניתן להציג את קובץ ה-PDF');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId]
  );

  const updateField = useCallback(
    (id: string, patch: Partial<TemplateField>) => {
      onChangeFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    },
    [fields, onChangeFields]
  );

  const removeField = (id: string) => {
    onChangeFields(
      fields
        .filter((f) => f.id !== id)
        .map((f) =>
          f.linkedSalaryFieldId === id ? { ...f, linkedSalaryFieldId: undefined } : f
        )
    );
    if (selectedId === id) setSelectedId(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeField(selectedId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, fields]);

  const getLocalPoint = (pageIndex: number, clientX: number, clientY: number) => {
    const el = pageRefs.current[pageIndex];
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    };
  };

  const onPointerDown = (pageIndex: number, e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.fieldId) return;
    const pt = getLocalPoint(pageIndex, e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrawing({
      pageIndex,
      startX: pt.x,
      startY: pt.y,
      curX: pt.x,
      curY: pt.y,
    });
    setSelectedId(null);
  };

  const onPointerMove = (pageIndex: number, e: React.PointerEvent) => {
    if (!drawing || drawing.pageIndex !== pageIndex) return;
    const pt = getLocalPoint(pageIndex, e.clientX, e.clientY);
    setDrawing({ ...drawing, curX: pt.x, curY: pt.y });
  };

  const onPointerUp = (pageIndex: number) => {
    if (!drawing || drawing.pageIndex !== pageIndex) return;
    const page = pages.find((p) => p.pageIndex === pageIndex);
    if (!page) {
      setDrawing(null);
      return;
    }
    const x = Math.min(drawing.startX, drawing.curX);
    const y = Math.min(drawing.startY, drawing.curY);
    const w = Math.abs(drawing.curX - drawing.startX);
    const h = Math.abs(drawing.curY - drawing.startY);
    setDrawing(null);
    if (w < 12 || h < 10) return;

    if (activeKind === 'salary_words' && salaryFields.length === 0) {
      alert('קודם סמן שדה «סכום שכר» מספרי, ואז סמן «סכום במילים» המקושר אליו.');
      return;
    }

    const pdfRect = displayRectToPdf(
      { x, y, w, h },
      {
        width: page.width,
        height: page.height,
        displayWidth: page.displayWidth,
        displayHeight: page.displayHeight,
      }
    );

    const labelBase = TEMPLATE_FIELD_KIND_LABELS[activeKind];
    const countSame = fields.filter((f) => f.kind === activeKind).length + 1;
    const linked =
      activeKind === 'salary_words'
        ? linkSalaryId || salaryFields[0]?.id
        : undefined;

    const field: TemplateField = {
      id: newFieldId(),
      kind: activeKind,
      label:
        activeKind === 'signature'
          ? signerRole === 'employee'
            ? `חתימת עובד ${countSame}`
            : `חתימת מועדון ${countSame}`
                  : activeKind === 'salary_words'
                    ? `סכום במילים ${countSame}`
                    : activeKind === 'date_day'
                      ? `יום בחודש ${countSame}`
                      : activeKind === 'date_month'
                        ? `חודש ${countSame}`
                        : activeKind === 'date_year'
                          ? `שנה ${countSame}`
                          : `${labelBase} ${countSame}`,
      pageIndex,
      ...pdfRect,
      fontSize: activeKind === 'signature' ? undefined : 11,
      signerRole: activeKind === 'signature' ? signerRole : undefined,
      linkedSalaryFieldId: linked,
      monthFormat: activeKind === 'date_month' ? 'hebrew' : undefined,
    };
    onChangeFields([...fields, field]);
    setSelectedId(field.id);
  };

  const prepareSalaryWordsFor = (salaryFieldId: string) => {
    setActiveKind('salary_words');
    setLinkSalaryId(salaryFieldId);
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500 font-medium">
        טוען עמודי PDF לסימון שדות...
      </div>
    );
  }

  if (error) {
    return <div className="py-10 text-center text-sm text-rose-600 font-bold">{error}</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[min(78vh,920px)] min-h-[420px]">
      {/* Sidebar — scrolls independently */}
      <aside className="lg:w-[260px] shrink-0 flex flex-col gap-3 max-h-[38vh] lg:max-h-none lg:h-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        <div className="bg-[var(--brand-light)] border border-slate-200 rounded-2xl p-3.5 space-y-3 shrink-0">
          <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
            <MousePointer2 className="w-3.5 h-3.5 text-[var(--brand)]" />
            סוג שדה לסימון
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            בחר סוג, ואז גרור מלבן על המסמך במקום שיש להשלים.
          </p>
          <div className="space-y-1.5">
            {KIND_OPTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeKind === kind
                    ? 'text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-[var(--brand)]/40'
                }`}
                style={activeKind === kind ? { backgroundColor: 'var(--brand)' } : undefined}
              >
                {TEMPLATE_FIELD_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          {activeKind === 'signature' && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-600">תפקיד חותם</p>
              {(['employee', 'club'] as TemplateSignerRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSignerRole(role)}
                  className={`w-full text-right px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                    signerRole === role
                      ? 'bg-[var(--navy)] text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {role === 'employee' ? 'עובד / ספורטאי' : 'מועדון / מנהל'}
                </button>
              ))}
            </div>
          )}
          {activeKind === 'salary_words' && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                מקושר לסכום מספרי
              </p>
              {salaryFields.length === 0 ? (
                <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                  סמן קודם שדה «סכום שכר», ואז סמן את מיקום הסכום במילים.
                </p>
              ) : (
                <select
                  value={linkSalaryId}
                  onChange={(e) => setLinkSalaryId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  {salaryFields.map((sf) => (
                    <option key={sf.id} value={sf.id}>
                      {sf.label} (עמ׳ {sf.pageIndex + 1})
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-slate-500 leading-relaxed">
                בעת מילוי ההסכם, המספר יומר אוטומטית למילים (למשל 1,200 ← אלף מאתיים ₪).
              </p>
            </div>
          )}
          {(activeKind === 'date_day' ||
            activeKind === 'date_month' ||
            activeKind === 'date_year') && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-600">תאריך עריכת ההסכם</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                סמן את הריק המתאים בשורה «ביום ____ לחודש _______ שנת _______».
                הערך יתמלא אוטומטית מתאריך ההסכם באשף (יום / חודש בעברית / שנה).
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2 shrink-0">
          <h4 className="text-xs font-extrabold text-slate-900">
            תגיות מסומנות ({fields.length})
          </h4>
          {fields.length === 0 && (
            <p className="text-[11px] text-slate-400">עדיין לא סומנו תגיות</p>
          )}
          <div className="space-y-1.5 max-h-none">
            {fields.map((f) => (
              <div
                key={f.id}
                className={`flex items-stretch gap-1 rounded-xl border transition-all ${
                  selectedId === f.id
                    ? 'border-[var(--brand)] bg-[var(--brand-light)]'
                    : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className="flex-1 min-w-0 text-right px-2.5 py-2 text-[11px]"
                >
                  <div className="font-bold text-slate-800 truncate">{f.label}</div>
                  <div className="text-slate-400">
                    {TEMPLATE_FIELD_KIND_LABELS[f.kind]} · עמ׳ {f.pageIndex + 1}
                  </div>
                </button>
                <button
                  type="button"
                  title="מחק תגית"
                  aria-label={`מחק תגית ${f.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeField(f.id);
                  }}
                  className="shrink-0 px-2.5 text-rose-500 hover:text-white hover:bg-rose-600 rounded-l-xl transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shrink-0">
            <h4 className="text-xs font-extrabold text-slate-900">עריכת שדה</h4>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">תווית</span>
              <input
                type="text"
                value={selected.label}
                onChange={(e) => updateField(selected.id, { label: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </label>
            {selected.kind !== 'signature' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-500">גודל גופן</span>
                <input
                  type="number"
                  min={7}
                  max={28}
                  value={selected.fontSize || 11}
                  onChange={(e) =>
                    updateField(selected.id, { fontSize: Number(e.target.value) || 11 })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </label>
            )}
            {selected.kind === 'signature' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-500">תפקיד חותם</span>
                <select
                  value={selected.signerRole || 'employee'}
                  onChange={(e) =>
                    updateField(selected.id, {
                      signerRole: e.target.value as TemplateSignerRole,
                    })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                >
                  <option value="employee">עובד</option>
                  <option value="club">מועדון</option>
                </select>
              </label>
            )}
            {selected.kind === 'salary' && (
              <button
                type="button"
                onClick={() => prepareSalaryWordsFor(selected.id)}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--brand)] border border-[var(--brand)]/30 rounded-xl py-2 hover:bg-[var(--brand-light)] transition-all"
              >
                <Link2 className="w-3.5 h-3.5" />
                הוסף סכום במילים (סמן על המסמך)
              </button>
            )}
            {selected.kind === 'salary_words' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-500">מקושר לסכום</span>
                <select
                  value={selected.linkedSalaryFieldId || ''}
                  onChange={(e) =>
                    updateField(selected.id, { linkedSalaryFieldId: e.target.value })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                >
                  <option value="" disabled>
                    בחר שדה סכום
                  </option>
                  {salaryFields.map((sf) => (
                    <option key={sf.id} value={sf.id}>
                      {sf.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected.kind === 'date_month' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-500">פורמט חודש</span>
                <select
                  value={selected.monthFormat || 'hebrew'}
                  onChange={(e) =>
                    updateField(selected.id, {
                      monthFormat: e.target.value as 'hebrew' | 'number',
                    })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                >
                  <option value="hebrew">שם חודש בעברית (ינואר…)</option>
                  <option value="number">מספר חודש (1–12)</option>
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => removeField(selected.id)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-rose-600 border border-rose-200 rounded-xl py-2 hover:bg-rose-600 hover:text-white transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              מחק תגית
            </button>
          </div>
        )}
      </aside>

      {/* PDF preview — scrolls independently */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-100/60 p-4 space-y-6">
        {pages.map((page) => {
          const pageFields = fields.filter((f) => f.pageIndex === page.pageIndex);
          return (
            <div key={page.pageIndex} className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500">עמוד {page.pageIndex + 1}</div>
              <div
                ref={(el) => {
                  pageRefs.current[page.pageIndex] = el;
                }}
                className="relative inline-block max-w-full shadow-md border border-slate-200 rounded-lg overflow-hidden bg-white touch-none select-none cursor-crosshair"
                style={{ width: page.displayWidth }}
                onPointerDown={(e) => onPointerDown(page.pageIndex, e)}
                onPointerMove={(e) => onPointerMove(page.pageIndex, e)}
                onPointerUp={() => onPointerUp(page.pageIndex)}
              >
                <img
                  src={page.dataUrl}
                  alt={`עמוד ${page.pageIndex + 1}`}
                  width={page.displayWidth}
                  height={page.displayHeight}
                  className="block pointer-events-none"
                  draggable={false}
                />
                {pageFields.map((f) => {
                  const r = pdfRectToDisplay(f, page);
                  const isSel = f.id === selectedId;
                  const isWords = f.kind === 'salary_words';
                  const isDate =
                    f.kind === 'date_day' ||
                    f.kind === 'date_month' ||
                    f.kind === 'date_year';
                  return (
                    <div
                      key={f.id}
                      data-field-id={f.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(f.id);
                      }}
                      className={`absolute border-2 rounded-sm text-[10px] font-bold px-1 overflow-visible group/tag ${
                        f.kind === 'signature'
                          ? 'border-violet-500 bg-violet-500/20 text-violet-900'
                          : isWords
                            ? 'border-amber-500 bg-amber-500/20 text-amber-900'
                            : isDate
                              ? 'border-sky-500 bg-sky-500/20 text-sky-900'
                              : 'border-emerald-500 bg-emerald-500/20 text-emerald-900'
                      } ${isSel ? 'ring-2 ring-[var(--brand)] ring-offset-1' : ''}`}
                      style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                      title={f.label}
                    >
                      <span className="truncate block leading-tight pointer-events-none overflow-hidden">
                        {f.label}
                      </span>
                      <button
                        type="button"
                        title="מחק תגית"
                        aria-label={`מחק תגית ${f.label}`}
                        data-field-id={f.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          removeField(f.id);
                        }}
                        className={`absolute -top-2 -left-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm transition-opacity ${
                          isSel ? 'opacity-100' : 'opacity-0 group-hover/tag:opacity-100'
                        }`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {drawing && drawing.pageIndex === page.pageIndex && (
                  <div
                    className="absolute border-2 border-dashed border-[var(--brand)] bg-[var(--brand)]/15 pointer-events-none"
                    style={{
                      left: Math.min(drawing.startX, drawing.curX),
                      top: Math.min(drawing.startY, drawing.curY),
                      width: Math.abs(drawing.curX - drawing.startX),
                      height: Math.abs(drawing.curY - drawing.startY),
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
