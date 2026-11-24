import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp, UploadCloud } from 'lucide-react';
import type { MedicalReport, NavRoute } from '../../types/medical';
import { formatReportDate } from '../../utils/formatters';

interface HealthTrendsViewProps {
  reports: MedicalReport[];
  onNavigate: (route: NavRoute) => void;
  isDark: boolean;
}

export const HealthTrendsView: React.FC<HealthTrendsViewProps> = ({
  reports,
  onNavigate,
  isDark,
}) => {
  const parameterNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reports) {
      for (const p of r.parameters) {
        if (typeof p.value === 'number') {
          counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [reports]);

  const [selectedParam, setSelectedParam] = useState<string>('');
  const activeParam =
    selectedParam && parameterNames.includes(selectedParam)
      ? selectedParam
      : parameterNames[0] || '';

  const chartData = useMemo(() => {
    if (!activeParam) return [];
    return [...reports]
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
      .map((r) => {
        const match = r.parameters.find((p) => p.name === activeParam);
        return match && typeof match.value === 'number'
          ? {
              date: formatReportDate(r.reportDate),
              value: match.value,
              unit: match.unit,
              reportTitle: r.title,
            }
          : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [reports, activeParam]);

  if (reports.length === 0 || parameterNames.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-10 text-center max-w-2xl mx-auto">
        <TrendingUp className="w-8 h-8 text-cyan-500 mx-auto mb-3" />
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Longitudinal Trends Require Report History
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Upload two or more medical reports across dates to chart numeric biomarker shifts over
          time.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          Upload Report
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Biomarker Trajectory
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Track numeric laboratory shifts across {reports.length} stored report
              {reports.length === 1 ? '' : 's'}.
            </p>
          </div>

          <select
            value={activeParam}
            onChange={(e) => setSelectedParam(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            {parameterNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? '#1e293b' : '#e2e8f0'}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#0B1222' : '#ffffff',
                  borderColor: isDark ? '#1e293b' : '#cbd5e1',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#06b6d4' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
