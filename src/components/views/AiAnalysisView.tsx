import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Search,
  UploadCloud,
} from 'lucide-react';
import { SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import type {
  AnatomicalSystemId,
  MedicalReport,
  NavRoute,
  ParameterStatus,
} from '../../types/medical';
import { formatReportDate, getStatusClasses, getStatusLabel } from '../../utils/formatters';

interface AiAnalysisViewProps {
  activeReport: MedicalReport | null;
  onSelectSystemAndExplore: (system: AnatomicalSystemId) => void;
  onNavigate: (route: NavRoute) => void;
}

export const AiAnalysisView: React.FC<AiAnalysisViewProps> = ({
  activeReport,
  onSelectSystemAndExplore,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ParameterStatus>('all');
  const [systemFilter, setSystemFilter] = useState<'all' | AnatomicalSystemId>('all');

  const rows = useMemo(() => {
    if (!activeReport) return [];
    const q = search.trim().toLowerCase();
    return activeReport.parameters.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (systemFilter !== 'all' && p.system !== systemFilter) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.abbreviation || '').toLowerCase().includes(q) &&
        !p.organTarget.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [activeReport, search, statusFilter, systemFilter]);

  if (!activeReport) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-10 text-center max-w-2xl mx-auto">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          No Analyzed Report Active
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Upload a laboratory document to view structured parameters, reference comparisons, and
          organ-level anatomical correlations.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          Upload Report
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {formatReportDate(activeReport.reportDate)} · {activeReport.sourceFileName}
              {activeReport.laboratoryName ? ` · ${activeReport.laboratoryName}` : ''}
            </div>
            <h2 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              {activeReport.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter parameter..."
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | ParameterStatus)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="optimal">Optimal</option>
              <option value="borderline">Borderline</option>
              <option value="high">Elevated</option>
              <option value="low">Low</option>
              <option value="critical">Critical</option>
            </select>

            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value as 'all' | AnatomicalSystemId)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Systems</option>
              {activeReport.systemsAffected.map((sys) => (
                <option key={sys} value={sys}>
                  {SYSTEM_META_MAP[sys].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {activeReport.overallSummary}
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Biomarker</th>
                <th className="py-2.5 px-3 font-medium text-right">Measured</th>
                <th className="py-2.5 px-3 font-medium">Reference</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium">System & Organ</th>
                <th className="py-2.5 pl-3 font-medium text-right">3D View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {rows.map((p) => {
                const cls = getStatusClasses(p.status);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-[#070C18]/70">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 max-w-md">
                        {p.clinicalNote}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {p.displayValue} {p.unit}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {p.referenceRange}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 font-medium ${cls.text}`}>
                        {p.status === 'optimal' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        {getStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {SYSTEM_META_MAP[p.system].label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.organTarget}
                      </div>
                    </td>
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectSystemAndExplore(p.system)}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
