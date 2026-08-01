import React, { useState, useRef } from 'react';
import { SalaryAgreement } from '../types';
import { 
  FileCheck2, 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Upload, 
  FileText, 
  Cpu, 
  CheckCircle2, 
  Download,
  Lock,
  Search,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { verifyPdfOnBlockchain, VerificationResult, calculateSHA256 } from '../services/blockchain';
import { PageBanner, fieldClassXs } from './ui/PageBanner';

interface BlockchainVerifierProps {
  agreements: SalaryAgreement[];
  onViewDocument: (agreement: SalaryAgreement) => void;
}

export const BlockchainVerifier: React.FC<BlockchainVerifierProps> = ({
  agreements,
  onViewDocument
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [manualHashInput, setManualHashInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // File Upload Process
  const processFile = async (file: File) => {
    setSelectedFile(file);
    setIsAnalyzing(true);
    setVerificationResult(null);

    try {
      const buffer = await file.arrayBuffer();
      // Brief simulated scanning delay for visual feedback
      await new Promise(r => setTimeout(r, 600));
      const result = await verifyPdfOnBlockchain(buffer, agreements);
      setVerificationResult(result);
    } catch (err) {
      console.error('File verification error:', err);
      alert('אירעה שגיאה בקריאת הקובץ');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Verify Manual SHA-256 Hash Search
  const handleManualHashVerify = async () => {
    if (!manualHashInput.trim()) return;
    setIsAnalyzing(true);
    const hashToSearch = manualHashInput.trim().toLowerCase();
    
    const match = agreements.find(
      a => a.fileHash.toLowerCase() === hashToSearch ||
           a.signature?.signatureHash.toLowerCase() === hashToSearch ||
           a.blockchain?.txHash.toLowerCase() === hashToSearch
    );

    await new Promise(r => setTimeout(r, 400));

    if (match && match.status === 'SIGNED' && match.blockchain) {
      setVerificationResult({
        isValid: true,
        matchType: 'EXACT_MATCH',
        calculatedHash: hashToSearch,
        matchedAgreement: match,
        blockchainRecord: match.blockchain,
        message: 'ה-HASH אומת בהצלחה! נמצאה רשומה מעוגנת תואמת בבלוקצ׳יין.',
        verifiedAt: new Date().toISOString()
      });
    } else {
      setVerificationResult({
        isValid: false,
        matchType: 'NOT_FOUND',
        calculatedHash: hashToSearch,
        message: 'לא נמצאה רשומה תואמת ל-HASH זה בבלוקצ׳יין של הארגון.',
        verifiedAt: new Date().toISOString()
      });
    }
    setIsAnalyzing(false);
  };

  return (
    <div className="space-y-6">
      <PageBanner
        icon={FileCheck2}
        title="כלי אימות בלוקצ׳יין קריפטוגרפי להסכמי PDF"
        subtitle="העלת קובץ PDF לבדיקת טביעת אצבע SHA-256 מול רשת הבלוקצ׳יין להבטחת מקוריות ואפס שינויים"
        action={
          <div className="flex items-center space-x-2 space-x-reverse bg-white/15 p-2 rounded-xl border border-white/25 text-xs font-mono text-white">
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span>SHA-256 Engine Ready</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Drag & Drop Dropzone */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsHovering(true); }}
            onDragLeave={() => setIsHovering(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-3 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[280px] ${
              isHovering 
                ? 'border-[var(--brand)] bg-[var(--brand-light)] scale-[1.01]' 
                : 'border-slate-300 hover:border-[var(--brand)] bg-white shadow-sm'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />

            <div className="p-4 rounded-2xl mb-4 border shadow-sm bg-[var(--brand-light)] text-[var(--brand)] border-[var(--brand)]/30">
              <Upload className="w-8 h-8" />
            </div>

            <h3 className="font-bold text-slate-900 text-lg">
              גרור לכאן קובץ PDF או לחץ לבחירה
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              המערכת תחשב מיידית את טביעת האצבע הדיגיטלית (Hash) ותשווה אותה מול הבלוקצ׳יין
            </p>

            <span
              className="mt-4 px-4 py-2 text-white font-bold rounded-xl text-xs hover:opacity-95 transition-all"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              בחר קובץ PDF לבדיקה
            </span>
          </div>

          {/* Manual Hash Search */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm">
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center">
              <Search className="w-4 h-4 ml-1.5 text-[var(--brand)]" />
              לחלופין, חפש ישירות לפי HASH או Tx Hash קריפטוגרפי:
            </label>
            <div className="flex space-x-2 space-x-reverse">
              <input
                type="text"
                value={manualHashInput}
                onChange={(e) => setManualHashInput(e.target.value)}
                placeholder="הכנס HASH רשום (לדוגמה: 0xa4b8f9e1c2d3...)"
                className={`flex-1 ${fieldClassXs} font-mono`}
              />
              <button
                onClick={handleManualHashVerify}
                className="px-4 py-2 text-white font-bold rounded-xl text-xs hover:opacity-95 transition-all"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                אמת HASH
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Verification Result Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm min-h-[380px] flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                <span>תוצאת בדיקת הבלוקצ׳יין</span>
                {isAnalyzing && (
                  <span className="text-xs font-bold flex items-center animate-pulse text-[var(--brand)]">
                    <RefreshCw className="w-3.5 h-3.5 ml-1 animate-spin" />
                    מחשב HASH...
                  </span>
                )}
              </h3>

              {!verificationResult && !isAnalyzing ? (
                <div className="text-center py-12 text-slate-400">
                  <Cpu className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-xs font-medium">טרם נבחר קובץ לבדיקה</p>
                  <p className="text-[11px] text-slate-400 mt-1">העלה קובץ PDF כדי לצפות בסטטוס האימות הקריפטוגרפי</p>
                </div>
              ) : verificationResult?.isValid ? (
                /* VALID VERIFICATION RESULT */
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div
                    className="border-2 rounded-2xl p-4 text-center text-white"
                    style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' }}
                  >
                    <CheckCircle2 className="w-10 h-10 text-white mx-auto mb-2" />
                    <h4 className="font-extrabold text-base">הקובץ מאומת ותקין ב-100%!</h4>
                    <p className="text-xs text-white/90 mt-1 font-medium">
                      טביעת האצבע תואמת במדויק לחתימה הרשומה בבלוקצ׳יין.
                    </p>
                  </div>

                  {/* Matched Document Details */}
                  {verificationResult.matchedAgreement && (
                    <div className="bg-[var(--brand-light)] border border-slate-200/60 rounded-xl p-3 text-xs space-y-2">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>מסמך:</span>
                        <span>{verificationResult.matchedAgreement.title}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>תיוג עובד:</span>
                        <span className="font-semibold text-slate-900">{verificationResult.matchedAgreement.employeeName}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>תיוג תפקיד:</span>
                        <span className="font-semibold text-[var(--brand-dark)]">{verificationResult.matchedAgreement.role}</span>
                      </div>
                      {verificationResult.blockchainRecord && (
                        <div className="pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-500 space-y-1">
                          <div>Block #: {verificationResult.blockchainRecord.blockNumber}</div>
                          <div className="truncate">Tx: {verificationResult.blockchainRecord.txHash}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => verificationResult.matchedAgreement && onViewDocument(verificationResult.matchedAgreement)}
                    className="w-full py-2.5 text-white font-bold rounded-xl text-xs hover:opacity-95 transition-all flex items-center justify-center"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    <ExternalLink className="w-4 h-4 ml-1.5" />
                    פתח לתצוגה מלאה בארכיון
                  </button>
                </div>
              ) : (
                /* INVALID / NOT FOUND RESULT */
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 text-rose-900 text-center">
                    <XCircle className="w-10 h-10 text-rose-600 mx-auto mb-2" />
                    <h4 className="font-extrabold text-base">הקובץ אינו מאומת!</h4>
                    <p className="text-xs text-rose-700 mt-1 font-medium">
                      {verificationResult?.message || 'לא נמצאה התאמה בין ה-HASH של קובץ זה לבלוקצ׳יין של הארגון.'}
                    </p>
                  </div>

                  <div className="bg-[var(--brand-light)] border border-slate-200/60 rounded-xl p-3 text-xs font-mono text-slate-600 break-all">
                    <span className="text-slate-400 text-[10px] block mb-1">HASH שחושב:</span>
                    {verificationResult?.calculatedHash}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Demo Pre-selected PDF Test */}
            <div className="pt-4 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-semibold block mb-2">בדוק מסמך לדוגמה מהמערכת:</span>
              <div className="flex flex-wrap gap-2">
                {agreements.slice(0, 2).map(a => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setManualHashInput(a.fileHash);
                      handleManualHashVerify();
                    }}
                    className="px-2.5 py-1 bg-[var(--brand-light)] hover:bg-white text-slate-700 rounded-lg text-[11px] font-mono border border-slate-200 transition-colors"
                  >
                    {a.docNumber} ({a.employeeName})
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
