import React, { useEffect, useRef, useState } from 'react';
import {
  AgreementTemplate,
  RoleType,
  TEMPLATE_FIELD_KIND_LABELS,
  TemplateField,
} from '../types';
import {
  Layers,
  Plus,
  FileText,
  ArrowLeft,
  Search,
  X,
  Trash2,
  Pencil,
  Upload,
  PenTool,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { PageBanner, fieldClass, fieldClassXs } from './ui/PageBanner';
import { TemplateFieldEditor } from './TemplateFieldEditor';
import {
  deleteTemplatePdf,
  fileToUint8Array,
  getTemplatePdf,
  saveTemplatePdf,
} from '../services/templatePdfStorage';
import { getPdfPageCount } from '../services/pdfUtils';

interface TemplateManagerProps {
  templates: AgreementTemplate[];
  roles: RoleType[];
  onUseTemplate: (template: AgreementTemplate) => void;
  onCreateTemplate: (newTemplate: AgreementTemplate) => void;
  onUpdateTemplate: (template: AgreementTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
}

type EditorMode = 'closed' | 'create' | 'edit';

function copyPdfBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  roles,
  onUseTemplate,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTemplateForDetails, setSelectedTemplateForDetails] =
    useState<AgreementTemplate | null>(null);

  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('הסכמי ספורטאים');
  const [description, setDescription] = useState('');
  const [recommendedRole, setRecommendedRole] = useState<RoleType>(
    roles[0] || 'שחקן/ית כדורמים'
  );
  const [sourceFileName, setSourceFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [fields, setFields] = useState<TemplateField[]>([]);
  /** epoch לרינדור — הבייטים ב-ref כדי למנוע בעיות עם Uint8Array ב-state */
  const [pdfEpoch, setPdfEpoch] = useState(0);
  const [hasPdf, setHasPdf] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldEditorRef = useRef<HTMLDivElement>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const editingIdRef = useRef<string | null>(null);

  const categories = ['ALL', ...Array.from(new Set(templates.map((t) => t.category)))];

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'ALL' || t.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.recommendedRole.toLowerCase().includes(q) ||
      t.sourceFileName.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const setPdfBytesSafe = (bytes: Uint8Array | null) => {
    pdfBytesRef.current = bytes ? copyPdfBytes(bytes) : null;
    setHasPdf(Boolean(bytes && bytes.byteLength > 0));
    setPdfEpoch((n) => n + 1);
  };

  const resetEditor = () => {
    setEditingId(null);
    editingIdRef.current = null;
    setName('');
    setCategory('הסכמי ספורטאים');
    setDescription('');
    setRecommendedRole(roles[0] || 'שחקן/ית כדורמים');
    setSourceFileName('');
    setPageCount(0);
    setFields([]);
    setPdfBytesSafe(null);
    setPdfLoading(false);
    setUploadError(null);
  };

  const closeEditor = () => {
    setEditorMode('closed');
    resetEditor();
  };

  const openCreate = () => {
    resetEditor();
    setEditorMode('create');
  };

  const openEdit = async (tpl: AgreementTemplate) => {
    const tplId = String(tpl.id || '').trim();
    if (!tplId) {
      alert('לפורמט חסר מזהה — לא ניתן לערוך');
      return;
    }
    setSelectedTemplateForDetails(null);
    setEditingId(tplId);
    editingIdRef.current = tplId;
    setName(tpl.name);
    setCategory(tpl.category);
    setDescription(tpl.description);
    setRecommendedRole(tpl.recommendedRole);
    setSourceFileName(tpl.sourceFileName);
    setPageCount(tpl.pageCount);
    setFields((tpl.fields || []).map((f) => ({ ...f })));
    setUploadError(null);
    setPdfBytesSafe(null);
    setPdfLoading(true);
    setEditorMode('edit');

    try {
      const bytes = await getTemplatePdf(tplId);
      if (!bytes || bytes.byteLength === 0) {
        setUploadError(
          'קובץ ה-PDF של הפורמט לא נמצא באחסון. העלה שוב את הקובץ כדי לפתוח את עורך התגיות על המסמך.'
        );
        setPdfBytesSafe(null);
        return;
      }
      setPdfBytesSafe(bytes);
    } catch (err) {
      console.error(err);
      setUploadError('שגיאה בטעינת קובץ ה-PDF. נסה שוב או העלה את הקובץ מחדש.');
      setPdfBytesSafe(null);
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPdf || pdfLoading || editorMode === 'closed') return;
    const t = window.setTimeout(() => {
      fieldEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [pdfEpoch, hasPdf, pdfLoading, editorMode]);

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('יש להעלות קובץ PDF בלבד (נוסח סופי מעורך הדין).');
      return;
    }
    try {
      const bytes = await fileToUint8Array(file);
      const pages = await getPdfPageCount(bytes);
      setPdfBytesSafe(bytes);
      setSourceFileName(file.name);
      setPageCount(pages);
      if (!name.trim()) {
        setName(file.name.replace(/\.pdf$/i, ''));
      }
    } catch (err) {
      console.error(err);
      setUploadError('שגיאה בקריאת קובץ ה-PDF');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('נא להזין שם לפורמט');
      return;
    }
    const pdfBytes = pdfBytesRef.current;
    if (!pdfBytes) {
      alert('נא להעלות קובץ PDF');
      return;
    }
    if (fields.length === 0) {
      const ok = window.confirm(
        'לא סומנו שדות על המסמך. לשמור בכל זאת? יהיה צורך לסמן שדות לפני מילוי לעובד.'
      );
      if (!ok) return;
    }

    // קובעים מראש — לא ליצור id חדש בטעות אחרי await
    const isEdit = editorMode === 'edit';
    const existingId = (editingIdRef.current || editingId || '').trim();
    if (isEdit && !existingId) {
      alert('שגיאה: מזהה הפורמט לעריכה חסר. סגור ופתח שוב את העריכה.');
      return;
    }
    const id = isEdit ? existingId : `tpl-${Date.now()}`;

    setSaving(true);
    try {
      await saveTemplatePdf(id, pdfBytes);
      const previous = templates.find((t) => t.id === id);
      const tpl: AgreementTemplate = {
        id,
        name: name.trim(),
        category,
        description,
        recommendedRole,
        createdAt: previous?.createdAt || new Date().toISOString().split('T')[0],
        sourceFileName,
        pageCount,
        fields,
      };
      if (isEdit) {
        onUpdateTemplate(tpl);
      } else {
        onCreateTemplate(tpl);
      }
      closeEditor();
    } catch (err) {
      console.error(err);
      alert('שגיאה בשמירת הפורמט');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (tpl: AgreementTemplate) => {
    if (!window.confirm(`למחוק את הפורמט «${tpl.name}»?`)) return;
    try {
      await deleteTemplatePdf(tpl.id);
    } catch (err) {
      console.error(err);
    }
    onDeleteTemplate(tpl.id);
    if (selectedTemplateForDetails?.id === tpl.id) setSelectedTemplateForDetails(null);
  };

  const fieldSummary = (tpl: AgreementTemplate) => {
    const sigs = tpl.fields.filter((f) => f.kind === 'signature').length;
    const salaries = tpl.fields.filter((f) => f.kind === 'salary').length;
    const salaryWords = tpl.fields.filter((f) => f.kind === 'salary_words').length;
    const emp = tpl.fields.filter((f) =>
      ['employee_name', 'id_number', 'phone', 'address', 'email'].includes(f.kind)
    ).length;
    return { sigs, salaries, salaryWords, emp, total: tpl.fields.length };
  };

  if (editorMode !== 'closed') {
    const pdfBytes = pdfBytesRef.current;

    return (
      <div className="space-y-6">
        <PageBanner
          icon={PenTool}
          title={editorMode === 'edit' ? 'עריכת פורמט PDF' : 'פורמט חדש מקובץ PDF'}
          subtitle="סמן תגיות על המסמך — פרטי עובד, שכר, תאריכים וחתימות"
          action={
            <button
              type="button"
              onClick={closeEditor}
              className="px-4 py-2.5 bg-white/15 text-white font-bold rounded-xl text-sm border border-white/25 hover:bg-white/25"
            >
              ביטול
            </button>
          }
        />

        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-slate-600">שם הפורמט</span>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="למשל: הסכם ספורטאי + כתב ויתור רפואי"
              />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">קובץ PDF מעורך הדין</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[var(--brand)]/40 bg-[var(--brand-light)] text-[var(--brand)] font-bold text-sm hover:border-[var(--brand)] transition-all"
              >
                <Upload className="w-4 h-4" />
                {sourceFileName ? 'החלף קובץ PDF' : 'העלה קובץ PDF'}
              </button>
              {sourceFileName && (
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  {sourceFileName} · {pageCount} עמודים
                  {fields.length > 0 ? ` · ${fields.length} תגיות` : ''}
                </p>
              )}
            </div>
          </div>

          {uploadError && (
            <div className="text-sm text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              {uploadError}
            </div>
          )}

          <div ref={fieldEditorRef} className="scroll-mt-4">
            {pdfLoading && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-14 text-center space-y-2">
                <Loader2 className="w-7 h-7 mx-auto animate-spin text-[var(--brand)]" />
                <p className="text-sm font-bold text-slate-700">
                  טוען את קובץ ה-PDF ואת התגיות הקיימות…
                </p>
                {fields.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {fields.length} שדות שמורים ייפתחו על המסמך לעריכה
                  </p>
                )}
              </div>
            )}

            {!pdfLoading && hasPdf && pdfBytes && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-[var(--brand-light)] border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-[var(--brand)]" />
                    עורך PDF ותגיות
                  </h3>
                  {fields.length > 0 && (
                    <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      {fields.length} תגיות על המסמך
                    </span>
                  )}
                </div>
                <div className="p-3 sm:p-4 bg-white">
                  <TemplateFieldEditor
                    key={`${editingId || 'new'}-${pdfEpoch}`}
                    pdfBytes={pdfBytes}
                    fields={fields}
                    onChangeFields={setFields}
                  />
                </div>
              </div>
            )}

            {!pdfLoading && !hasPdf && (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
                <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-700">
                  {editorMode === 'edit'
                    ? 'לא נטען PDF — העלה שוב את הקובץ כדי לערוך תגיות'
                    : 'העלה קובץ PDF כדי לפתוח את עורך התגיות'}
                </p>
              </div>
            )}
          </div>

          <details className="rounded-2xl border border-slate-100 bg-slate-50/80">
            <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-700 select-none">
              פרטים נוספים (קטגוריה, תיאור, תפקיד)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 pb-4">
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-slate-600">קטגוריה</span>
                <input
                  className={fieldClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-slate-600">תפקיד מומלץ</span>
                <select
                  className={fieldClass}
                  value={recommendedRole}
                  onChange={(e) => setRecommendedRole(e.target.value as RoleType)}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 block sm:col-span-2">
                <span className="text-xs font-bold text-slate-600">תיאור קצר</span>
                <input
                  className={fieldClass}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="מתי משתמשים בפורמט זה"
                />
              </label>
            </div>
          </details>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={closeEditor}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200"
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={saving || !hasPdf || pdfLoading}
              onClick={handleSave}
              className="px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow-md hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'שומר...' : editorMode === 'edit' ? 'שמור שינויים' : 'שמור פורמט'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Layers}
        title="פורמטי הסכם PDF"
        subtitle="העלה את נוסח עורך הדין כקובץ PDF, סמן שדות להשלמה ומקומות חתימה — והמסמך נשאר זהה ויזואלית"
        badge={
          <span className="inline-flex items-center gap-1.5 bg-white/20 border border-white/30 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold mb-1">
            <FileText className="w-3 h-3" />
            פורמטים מבוססי מסמך משפטי
          </span>
        }
        action={
          <button
            onClick={openCreate}
            className="px-5 py-3 text-white font-extrabold rounded-xl text-sm shadow-lg transition-all hover:opacity-95 flex items-center shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus className="w-5 h-5 ml-2" />
            העלה פורמט PDF
          </button>
        }
      />

      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפש פורמט לפי שם או קובץ..."
              className={`${fieldClassXs} pr-10 font-medium`}
            />
          </div>
          <div className="flex items-center space-x-2 space-x-reverse overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
                style={selectedCategory === cat ? { backgroundColor: 'var(--brand)' } : undefined}
              >
                {cat === 'ALL' ? 'כל הקטגוריות' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <Upload className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-extrabold text-slate-800 text-lg">אין עדיין פורמטי PDF</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            העלה את הסכם השכר בנוסח הסופי מעורך הדין, סמן את שדות העובד, סכומי השכר ומקומות
            החתימה (כולל נספחים), והשתמש בפורמט לחתימת עובדים.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl text-sm"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" />
            העלה פורמט ראשון
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTemplates.map((tpl) => {
            const summary = fieldSummary(tpl);
            return (
              <div
                key={tpl.id}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-[var(--brand)]/40 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="bg-[var(--brand-light)] text-[var(--navy)] text-xs font-bold px-3 py-1 rounded-lg border border-slate-200">
                      {tpl.category}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {tpl.pageCount} עמ׳
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg group-hover:text-[var(--brand)] transition-colors">
                      {tpl.name}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      {tpl.description || 'פורמט מבוסס PDF מעורך דין'}
                    </p>
                  </div>
                  <div className="bg-[var(--brand-light)] rounded-2xl p-3 border border-slate-100 space-y-1.5 text-xs text-slate-700">
                    <div className="truncate">
                      <span className="text-slate-500">קובץ: </span>
                      <strong>{tpl.sourceFileName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">שדות: </span>
                      <strong>{summary.total}</strong>
                      {summary.emp > 0 && ` · ${summary.emp} פרטי עובד`}
                      {summary.salaries > 0 && ` · ${summary.salaries} שכר`}
                      {summary.salaryWords > 0 && ` · ${summary.salaryWords} במילים`}
                      {summary.sigs > 0 && ` · ${summary.sigs} חתימות`}
                    </div>
                    <div>
                      <span className="text-slate-500">תפקיד מומלץ: </span>
                      {tpl.recommendedRole}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateForDetails(tpl)}
                    className="text-xs font-bold text-slate-600 hover:text-[var(--brand)] px-3 py-2 rounded-xl border border-slate-200 hover:bg-[var(--brand-light)] transition-all flex items-center"
                  >
                    <FileText className="w-3.5 h-3.5 ml-1.5 text-[var(--brand)]" />
                    פרטים
                  </button>
                  <button
                    type="button"
                    onClick={() => void openEdit(tpl)}
                    className="text-xs font-bold text-[var(--brand)] hover:text-white hover:bg-[var(--brand)] px-3 py-2 rounded-xl border border-[var(--brand)]/30 transition-all flex items-center"
                  >
                    <Pencil className="w-3.5 h-3.5 ml-1.5" />
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteTemplate(tpl)}
                    className="text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 px-3 py-2 rounded-xl border border-rose-200 transition-all flex items-center"
                  >
                    <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                    מחק
                  </button>
                  <button
                    type="button"
                    onClick={() => onUseTemplate(tpl)}
                    className="mr-auto text-xs font-bold text-white px-3 py-2 rounded-xl flex items-center"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    השתמש בפורמט
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTemplateForDetails && (
        <div className="fixed inset-0 bg-[var(--navy)]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  {selectedTemplateForDetails.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedTemplateForDetails.sourceFileName} ·{' '}
                  {selectedTemplateForDetails.pageCount} עמודים
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplateForDetails(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">{selectedTemplateForDetails.description}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedTemplateForDetails.fields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2 border border-slate-100"
                >
                  <span className="font-bold text-slate-800">{f.label}</span>
                  <span className="text-slate-500">
                    {TEMPLATE_FIELD_KIND_LABELS[f.kind]} · עמ׳ {f.pageIndex + 1}
                  </span>
                </div>
              ))}
              {selectedTemplateForDetails.fields.length === 0 && (
                <p className="text-xs text-amber-700 font-medium">
                  לא סומנו שדות — ערוך את הפורמט כדי לסמן מקומות למילוי וחתימה.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => void openEdit(selectedTemplateForDetails)}
                className="px-4 py-2 text-[var(--brand)] border border-[var(--brand)]/30 font-bold rounded-xl text-xs"
              >
                עריכה
              </button>
              <button
                type="button"
                onClick={() => {
                  const tpl = selectedTemplateForDetails;
                  setSelectedTemplateForDetails(null);
                  onUseTemplate(tpl);
                }}
                className="px-4 py-2 text-white font-bold rounded-xl text-xs"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                השתמש בפורמט
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
