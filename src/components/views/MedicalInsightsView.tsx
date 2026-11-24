import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  MessageSquareText,
  UploadCloud,
} from 'lucide-react';
import { SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import type {
  AnatomicalSystemId,
  MedicalReport,
  NavRoute,
} from '../../types/medical';

interface MedicalInsightsViewProps {
  activeReport: MedicalReport | null;
  onSelectSystemAndExplore: (system: AnatomicalSystemId) => void;
  onNavigate: (route: NavRoute) => void;
}

export const MedicalInsightsView: React.FC<MedicalInsightsViewProps> = ({
  activeReport,
  onSelectSystemAndExplore,
  onNavigate,
}) => {
  if (!activeReport) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-10 text-center max-w-2xl mx-auto">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          No Clinical Insights Available
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Analyze a laboratory report to generate system-level clinical synthesis and physician
          discussion prompts.
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
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-6">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Executive Clinical Interpretation — {activeReport.title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {activeReport.overallSummary}
        </p>

        {activeReport.followUpRecommendations.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Recommended Follow-Up Actions
            </h3>
            <ul className="space-y-1.5">
              {activeReport.followUpRecommendations.map((rec, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeReport.insights.map((insight) => (
          <article
            key={insight.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-5 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
                  {SYSTEM_META_MAP[insight.system].label}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                    insight.severity === 'priority'
                      ? 'text-rose-500'
                      : insight.severity === 'attention'
                        ? 'text-amber-500'
                        : 'text-emerald-500'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  {insight.severity}
                </span>
              </div>

              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {insight.title}
              </h3>

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {insight.summary}
              </p>

              {insight.relatedParameters.length > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Related parameters: {insight.relatedParameters.join(' · ')}
                </div>
              )}

              {insight.physicianQuestions.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    <MessageSquareText className="w-3.5 h-3.5 text-cyan-500" />
                    Questions for Your Clinician
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 list-disc pl-4">
                    {insight.physicianQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onSelectSystemAndExplore(insight.system)}
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Inspect {SYSTEM_META_MAP[insight.system].label} in 3D
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
