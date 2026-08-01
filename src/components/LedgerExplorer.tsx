import React from 'react';
import { SalaryAgreement } from '../types';
import { 
  Blocks, 
  ShieldCheck, 
  Cpu, 
  ExternalLink, 
  CheckCircle2, 
  Layers, 
  Lock, 
  Hash,
  Database
} from 'lucide-react';
import { SALARY_SMART_CONTRACT_ADDRESS } from '../services/blockchain';
import { PageBanner } from './ui/PageBanner';

interface LedgerExplorerProps {
  agreements: SalaryAgreement[];
  onViewDocument: (agreement: SalaryAgreement) => void;
}

export const LedgerExplorer: React.FC<LedgerExplorerProps> = ({
  agreements,
  onViewDocument
}) => {
  const signedAgreements = agreements.filter(a => a.status === 'SIGNED' && a.blockchain);

  return (
    <div className="space-y-6">
      <PageBanner
        icon={Blocks}
        title="סייר הבלוקצ׳יין של הארגון (Enterprise Ledger)"
        subtitle="צפייה בבלוקים, בעסקאות, ב-Merkle Root ובחוזים החכמים המאבטחים את הסכמי השכר"
        action={
          <div className="bg-white/15 p-3 rounded-xl border border-white/25 text-xs space-y-1 font-mono">
            <div className="text-white/70">Smart Contract Address:</div>
            <div className="text-white font-bold">{SALARY_SMART_CONTRACT_ADDRESS}</div>
          </div>
        }
      />

      {/* Network Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">סה״כ בלוקים כרויים</div>
          <div className="text-2xl font-black text-slate-900 font-mono">18,459,289</div>
          <div className="text-[11px] font-bold mt-1" style={{ color: 'var(--accent)' }}>● Consensus Active (PoS)</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">הסכמי שכר חתומים מעוגנים</div>
          <div className="text-2xl font-black font-mono" style={{ color: 'var(--accent)' }}>{signedAgreements.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">100% Immutability Guarantee</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">זמן אישור בלוק ממוצע</div>
          <div className="text-2xl font-black font-mono text-[var(--brand)]">1.2 שניות</div>
          <div className="text-[11px] text-slate-500 mt-1">Zero Gas Penalty Fee</div>
        </div>
      </div>

      {/* Block Timeline List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div
          className="p-5 text-white border-b border-white/10 flex items-center justify-between"
          style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
        >
          <h3 className="font-bold text-base flex items-center">
            <Layers className="w-5 h-5 ml-2 text-white/90" />
            היסטוריית הבלוקים והעסקאות האחרונות
          </h3>
          <span className="text-xs text-white/70 font-mono">Realtime Ledger Feed</span>
        </div>

        <div className="divide-y divide-slate-200">
          {signedAgreements.map((agreement) => {
            const bc = agreement.blockchain;
            if (!bc) return null;

            return (
              <div key={agreement.id} className="p-5 hover:bg-[var(--brand-light)]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <span
                      className="text-white font-mono font-bold px-2.5 py-0.5 rounded text-xs"
                      style={{ backgroundColor: 'var(--brand)' }}
                    >
                      Block #{bc.blockNumber}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {agreement.title} ({agreement.employeeName})
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold text-[var(--brand-dark)] border"
                      style={{ backgroundColor: 'var(--brand-light)', borderColor: 'var(--brand)' }}
                    >
                      {agreement.role}
                    </span>
                  </div>

                  <div className="font-mono text-xs text-slate-600 space-y-1 pt-1">
                    <div className="truncate"><span className="text-slate-400">Tx Hash:</span> <span className="text-slate-800 font-bold">{bc.txHash}</span></div>
                    <div className="truncate"><span className="text-slate-400">Merkle Root:</span> <span className="text-slate-700">{bc.merkleRoot}</span></div>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between space-y-2">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(bc.timestamp).toLocaleString('he-IL')}
                  </span>
                  <button
                    onClick={() => onViewDocument(agreement)}
                    className="px-3 py-1.5 text-white font-bold rounded-lg text-xs hover:opacity-95 transition-all flex items-center"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                    צפה במסמך
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
