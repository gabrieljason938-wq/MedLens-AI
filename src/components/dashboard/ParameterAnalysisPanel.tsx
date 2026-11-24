import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Search,
  UploadCloud,
} from 'lucide-react';
import { SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import type {
  AnatomicalSystemId,
  MedicalReport,
  NavRoute,
} from '../../types/medical';
import { getStatusClasses, getStatusLabel } from '../../utils/formatters';

interface ParameterAnalysisPanelProps {
  activeReport: MedicalReport | null;
  selectedSystem: AnatomicalSystemId | null;
  onSelectSystem: (sys: AnatomicalSystemId | null) => void;
  onNavigate: (route: NavRoute) => void;
}

export const ParameterAnalysisPanel: React.FC<ParameterAnalysisPanelProps> = ({
  activeReport,
  selectedSystem,
  onSelectSystem,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'flagged'>('all');

  const filteredParams = useMemo(() => {
    if (!activeReport) return [];
    const q = query.trim().toLowerCase();
    return activeReport.parameters.filter((p) => {
      if (selectedSystem && p.system !== selectedSystem) return false;
      if (filterMode === 'flagged' && p.status === 'optimal') return false;
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
  }, [activeReport, selectedSystem, filterMode, query]);

  const counts = useMemo(() => {
    if (!activeReport) return { total: 0, flagged: 0 };
    const flagged = activeReport.parameters.filter((p) => p.status !== 'optimal').length;
    return { total: activeReport.parameters.length, flagged };
  }, [activeReport]);

  return (
    <section className="flex h-full min-h-[480px] lg:max-h-[560px] flex-col rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-4">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Biomarker Panel
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {selectedSystem
              ? `Filtered: ${SYSTEM_META_MAP[selectedSystem].label}`
              : activeReport
                ? `${counts.total} biomarkers · ${counts.flagged} flagged`
                : 'Awaiting laboratory report'}
          </p>
        </div>

        {selectedSystem && (
          <button
            type="button"
            onClick={() => onSelectSystem(null)}
            className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer shrink-0"
          >
            Show All
          </button>
        )}
      </div>

      {!activeReport ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center px-4 py-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-500 mb-3">
            <Activity className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No Medical Report Loaded
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 max-w-xs">
            Upload a laboratory PDF, clinical report image, CSV, or raw report text to extract
            structured biomarkers and map them onto the 3D atlas.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('upload')}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload Report
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search biomarker or organ..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#070C18] p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-[#111A2E] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('flagged')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                  filterMode === 'flagged'
                    ? 'bg-white dark:bg-[#111A2E] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Flagged
              </button>
            </div>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredParams.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No matching biomarkers in this view.
              </p>
            ) : (
              filteredParams.map((param) => {
                const cls = getStatusClasses(param.status);
                return (
                  <button
                    key={param.id}
                    type="button"
                    onClick={() => onSelectSystem(param.system)}
                    className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#070C18]/75 p-3 hover:border-cyan-500/45 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {param.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {param.organTarget} · {SYSTEM_META_MAP[param.system].label}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {param.displayValue} {param.unit}
                        </div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-400">
                          Ref: {param.referenceRange}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cls.text}`}>
                        {param.status === 'optimal' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {getStatusLabel(param.status)}
                      </span>
                      <span className="text-[11px] text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-0.5">
                        Focus 3D <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => onNavigate('analysis')}
              className="font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Open Full Lab Table
            </button>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="font-medium text-slate-600 dark:text-slate-300 hover:text-cyan-500 cursor-pointer"
            >
              Ask AI Assistant
            </button>
          </div>
        </>
      )}
    </section>
  );
};
