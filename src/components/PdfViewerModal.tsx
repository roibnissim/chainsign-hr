import React, { useEffect, useState } from 'react';
import { SalaryAgreement, Employee, AgreementTemplate } from '../types';
import {
  X,
  Download,
  ShieldCheck,
  FileText,
  Lock,
  CheckCircle2,
  Cpu,
  PenTool,
} from 'lucide-react';
import { getDownloadableAgreementPdf, downloadPdfFile } from '../services/agreementPdfDownload';
import { renderPdfPages, RenderedPdfPage } from '../services/pdfRenderer';
import { isAgreementExpiredOrInactive } from '../services/agreementValidity';

interface PdfViewerModalProps {
  agreement: SalaryAgreement | null;
  employees: Employee[];
  templates?: AgreementTemplate[];
  onClose: () => void;
  onOpenSigner: (agreement: SalaryAgreement) => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  agreement,
  employees,
  templates = [],
  onClose,
  onOpenSigner,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!agreement) return;
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);
    setPages([]);

    (async () => {
      try {
        const emp = employees.find((e) => e.id === agreement.employeeId);
        const bytes = await getDownloadableAgreementPdf(agreement, emp, templates);
        const rendered = await renderPdfPages(bytes, 700);
        if (!cancelled) setPages(rendered);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPreviewError('לא ניתן להציג את קובץ ה-PDF');
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agreement?.id, employees, templates]);

  if (!agreement) return null;

  const emp = employees.find((e) => e.id === agreement.employeeId);
  const isSigned = agreement.status === 'SIGNED';

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const pdfBytes = await getDownloadableAgreementPdf(agreement, emp, templates);
      const fileName = `${agreement.docNumber}_${agreement.employeeName.replace(/\s+/g, '_')}_Official.pdf`;
      downloadPdfFile(pdfBytes, fileName);
    } catch (err) {
      console.error(err);
      alert('שגיאה בהורדת הקובץ');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div
              className={`p-2 rounded-xl ${
                isSigned
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <h3 className="font-bold text-lg text-white">{agreement.title}</h3>
                <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  {agreement.docNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                תיוג עובד: {agreement.employeeName} | תפקיד: {agreement.role}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 sm:p-6 bg-slate-100 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {isSigned ? (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-500 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center">
                  <ShieldCheck className="w-4 h-4 ml-1.5 text-emerald-600" />
                  חתום ומעוגן
                </div>
              ) : (
                <div className="bg-sky-50 text-sky-800 border border-sky-300 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center">
                  <Lock className="w-4 h-4 ml-1.5 text-[var(--brand)]" />
                  ממתין לחתימה
                </div>
              )}
              {isAgreementExpiredOrInactive(agreement) && (
                <div className="bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl font-bold text-xs">
                  לא פעיל
                </div>
              )}
            </div>
            {agreement.templateId && (
              <span className="text-[11px] font-bold text-slate-500">פורמט PDF משפטי</span>
            )}
          </div>

          {loadingPreview && (
            <p className="text-center text-sm text-slate-500 py-16">טוען מסמך...</p>
          )}
          {previewError && (
            <p className="text-center text-sm text-rose-600 font-bold py-10">{previewError}</p>
          )}
          {!loadingPreview && !previewError && pages.length > 0 && (
            <div className="space-y-4">
              {pages.map((p) => (
                <img
                  key={p.pageIndex}
                  src={p.dataUrl}
                  alt={`עמוד ${p.pageIndex + 1}`}
                  className="w-full max-w-3xl mx-auto border border-slate-300 rounded-lg shadow bg-white"
                />
              ))}
            </div>
          )}

          {isSigned && agreement.signature && (
            <div className="bg-emerald-50/80 border border-emerald-500/60 rounded-2xl p-4 max-w-3xl mx-auto text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 flex items-center">
                  <CheckCircle2 className="w-4 h-4 ml-1.5" />
                  חתימה אלקטרונית
                </span>
                <span className="font-mono text-[10px] text-emerald-700">
                  {agreement.fieldSignatures?.length
                    ? `${agreement.fieldSignatures.length} מיקומי חתימה`
                    : 'SHA-256'}
                </span>
              </div>
              {agreement.blockchain && (
                <div className="bg-slate-900 text-white rounded-xl p-3 font-mono text-[11px] space-y-1">
                  <div className="text-emerald-400 font-bold flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" />
                    Block #{agreement.blockchain.blockNumber}
                  </div>
                  <div className="truncate text-amber-400">{agreement.blockchain.txHash}</div>
                </div>
              )}
            </div>
          )}

          {!isSigned && (
            <div className="bg-amber-50 border border-dashed border-amber-300 rounded-2xl p-5 text-center max-w-3xl mx-auto">
              <button
                onClick={() => {
                  onClose();
                  onOpenSigner(agreement);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs inline-flex items-center"
              >
                <PenTool className="w-4 h-4 ml-1.5" />
                {agreement.employeeSignedAt ||
                agreement.fieldSignatures?.some((fs) => fs.signerRole === 'employee')
                  ? 'המשך לחתימת מועדון'
                  : 'המשך חתימה / שליחה'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-slate-900 p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono">
            HASH:{' '}
            <span className="text-amber-400">
              {agreement.fileHash.substring(0, 24)}...
            </span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
            >
              סגור
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-extrabold rounded-xl text-xs flex items-center disabled:opacity-50"
            >
              <Download className="w-4 h-4 ml-1.5" />
              {downloading ? 'מייצר...' : 'הורד PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
