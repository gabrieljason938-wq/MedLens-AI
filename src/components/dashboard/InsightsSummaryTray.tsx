import React from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  FileText,
  Lightbulb,
} from 'lucide-react';
import { SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import type {
  AnatomicalSystemId,
  MedicalReport,
  NavRoute,
} from '../../types/medical';
import { formatReportDate } from '../../utils/formatters';

interface InsightsSummaryTrayProps {
  activeReport: MedicalReport | null;
  onSelectSystem: (sys: AnatomicalSystemId) => void;
  onNavigate: (route: NavRoute) => void;
}

export const InsightsSummaryTray: React.FC<InsightsSummaryTrayProps> = ({
  activeReport,
  onSelectSystem,
  onNavigate,
}) => {
  if (!activeReport) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-500">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Clinical Synthesis & AI Insights
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              AI-generated medical summaries, correlated anatomical pathways, and follow-up
              physician questions will appear here once a report is analyzed.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap shrink-0"
        >
          Analyze First Report
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{activeReport.title}</span>
            <span>·</span>
            <span>{formatReportDate(activeReport.reportDate)}</span>
            {activeReport.laboratoryName && (
              <>
                <span>·</span>
                <span>{activeReport.laboratoryName}</span>
              </>
            )}
          </div>
          <h3 className="mt-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI Clinical Summary
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300 max-w-4xl">
            {activeReport.overallSummary}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('insights')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/50 cursor-pointer whitespace-nowrap"
          >
            <Lightbulb className="w-3.5 h-3.5 text-cyan-500" />
            All Insights
          </button>
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/12 border border-cyan-500/35 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
          >
            <Bot className="w-3.5 h-3.5" />
            Discuss Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {activeReport.insights.slice(0, 3).map((insight) => (
          <button
            key={insight.id}
            type="button"
            onClick={() => onSelectSystem(insight.system)}
            className="text-left rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#070C18]/75 p-3.5 hover:border-cyan-500/45 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
                {SYSTEM_META_MAP[insight.system].label}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                  insight.severity === 'priority'
                    ? 'text-rose-500'
                    : insight.severity === 'attention'
                      ? 'text-amber-500'
                      : 'text-emerald-500'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                {insight.severity}
              </span>
            </div>
            <div className="mt-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {insight.title}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-3">
              {insight.summary}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
};
