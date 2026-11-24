import React from 'react';
import { CheckCircle2, FolderLock, Trash2, UploadCloud } from 'lucide-react';
import type { MedicalReport, NavRoute } from '../../types/medical';
import { formatReportDate } from '../../utils/formatters';

interface ReportVaultViewProps {
  reports: MedicalReport[];
  activeReportId: string | null;
  onSelectReport: (id: string) => void;
  onDeleteReport: (id: string) => Promise<void>;
  onNavigate: (route: NavRoute) => void;
}

export const ReportVaultView: React.FC<ReportVaultViewProps> = ({
  reports,
  activeReportId,
  onSelectReport,
  onDeleteReport,
  onNavigate,
}) => {
  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-10 text-center max-w-2xl mx-auto">
        <FolderLock className="w-8 h-8 text-cyan-500 mx-auto mb-3" />
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Report Vault is Empty
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Analyzed laboratory reports are stored securely on the workstation backend for instant
          comparison and 3D anatomy inspection.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          Upload First Report
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {reports.map((report) => {
        const isActive = report.id === activeReportId;
        const flagged = report.parameters.filter((p) => p.status !== 'optimal').length;

        return (
          <div
            key={report.id}
            className={`rounded-xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#0B1120] ${
              isActive
                ? 'border-cyan-500/60'
                : 'border-slate-200 dark:border-slate-800/80'
            }`}
          >
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{formatReportDate(report.reportDate)}</span>
                <span>·</span>
                <span>{report.sourceFileName}</span>
                <span>·</span>
                <span className="font-mono tabular-nums">
                  {report.parameters.length} biomarkers ({flagged} flagged)
                </span>
              </div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {report.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                {report.overallSummary}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onSelectReport(report.id);
                  onNavigate('overview');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40'
                    : 'bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400'
                }`}
              >
                {isActive && <CheckCircle2 className="w-3.5 h-3.5" />}
                {isActive ? 'Active Report' : 'Activate'}
              </button>

              <button
                type="button"
                onClick={() => void onDeleteReport(report.id)}
                aria-label={`Delete ${report.title}`}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-500 hover:border-rose-500/40 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
