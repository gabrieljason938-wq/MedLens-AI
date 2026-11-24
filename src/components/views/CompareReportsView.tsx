import React, { useState } from 'react';
import { AlertCircle, GitCompare, Loader2, UploadCloud } from 'lucide-react';
import { SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import { compareReportsByIds } from '../../services/api';
import type { ComparisonResult, MedicalReport, NavRoute } from '../../types/medical';
import { formatReportDate } from '../../utils/formatters';

interface CompareReportsViewProps {
  reports: MedicalReport[];
  onNavigate: (route: NavRoute) => void;
}

export const CompareReportsView: React.FC<CompareReportsViewProps> = ({
  reports,
  onNavigate,
}) => {
  const [baselineId, setBaselineId] = useState(reports[1]?.id || reports[0]?.id || '');
  const [currentId, setCurrentId] = useState(reports[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  if (reports.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-10 text-center max-w-2xl mx-auto">
        <GitCompare className="w-8 h-8 text-cyan-500 mx-auto mb-3" />
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          At Least Two Reports Required
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Upload at least two laboratory panels to run longitudinal AI delta comparisons.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          Upload Another Report
        </button>
      </div>
    );
  }

  const handleCompare = async () => {
    if (!baselineId || !currentId || baselineId === currentId) {
      setError('Please select two distinct reports to compare.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await compareReportsByIds(baselineId, currentId);
      setResult(res.comparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare reports.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Baseline Report
            </label>
            <select
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({formatReportDate(r.reportDate)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Current / Follow-Up Report
            </label>
            <select
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({formatReportDate(r.reportDate)})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleCompare()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <GitCompare className="w-4 h-4" />
                Compare Reports
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-6 space-y-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Comparative Clinical Synthesis
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {result.executiveSummary}
            </p>
          </div>

          {result.parameterDeltas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-4 font-medium">Biomarker</th>
                    <th className="py-2 px-3 font-medium">System</th>
                    <th className="py-2 px-3 font-medium text-right">Baseline</th>
                    <th className="py-2 px-3 font-medium text-right">Current</th>
                    <th className="py-2 pl-3 font-medium text-right">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {result.parameterDeltas.map((d, i) => (
                    <tr key={i}>
                      <td className="py-2.5 pr-4 font-semibold text-slate-900 dark:text-slate-100">
                        {d.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                        {SYSTEM_META_MAP[d.system]?.label || d.system}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {d.baselineValue} {d.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {d.currentValue} {d.unit}
                      </td>
                      <td
                        className={`py-2.5 pl-3 text-right font-mono tabular-nums font-medium ${
                          d.direction === 'improved'
                            ? 'text-emerald-500'
                            : d.direction === 'worsened'
                              ? 'text-amber-500'
                              : 'text-slate-500'
                        }`}
                      >
                        {d.deltaText}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
