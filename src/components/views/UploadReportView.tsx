import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { analyzeReportUpload } from '../../services/api';
import type { MedicalReport, NavRoute } from '../../types/medical';

interface UploadReportViewProps {
  onReportAnalyzed: (report: MedicalReport, allReports: MedicalReport[]) => void;
  onNavigate: (route: NavRoute) => void;
}

export const UploadReportView: React.FC<UploadReportViewProps> = ({
  onReportAnalyzed,
  onNavigate,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReport, setSuccessReport] = useState<MedicalReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile && rawText.trim().length < 20) {
      setError('Upload a medical report file (PDF, image, CSV, or TXT) or paste at least 20 characters of laboratory results.');
      return;
    }
    setError(null);
    setSubmitting(true);
    setSuccessReport(null);

    try {
      const res = await analyzeReportUpload({
        file: selectedFile || undefined,
        rawText: rawText.trim() || undefined,
        title: title.trim() || undefined,
        reportDate: reportDate || undefined,
      });
      setSuccessReport(res.report);
      onReportAnalyzed(res.report, res.reports);
      setSelectedFile(null);
      setRawText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to extract biomarkers from report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-6 space-y-5"
      >
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Ingest Laboratory Report
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Upload a clinical PDF, lab scan (PNG/JPG/WEBP), CSV export, or paste raw diagnostic text.
            MedLens extracts real biomarkers and maps them to anatomical systems.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Report Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Comprehensive Metabolic & Lipid Panel"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Collection / Report Date
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* File Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setSelectedFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-cyan-400 bg-cyan-500/10'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#070C18]/70 hover:border-cyan-500/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setSelectedFile(f);
              e.target.value = '';
            }}
          />
          <FileUp className="w-7 h-7 text-cyan-500 mx-auto mb-2" />
          {selectedFile ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {selectedFile.name}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {(selectedFile.size / 1024).toFixed(1)} KB · Click to replace file
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Drop laboratory PDF, image, CSV, or TXT file here
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Or click to browse local diagnostic documents (max 15 MB)
              </div>
            </div>
          )}
        </div>

        {/* Raw Text Input */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Or Paste Laboratory Text / Values Directly
          </label>
          <textarea
            rows={7}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste lab test rows (test name, measured value, unit, reference interval)..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] p-3 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successReport && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Extracted <strong>{successReport.parameters.length} biomarkers</strong> from{' '}
                {successReport.title}.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('analysis')}
                className="rounded-md bg-emerald-500/20 px-2.5 py-1 font-medium hover:bg-emerald-500/30 cursor-pointer"
              >
                View Analysis
              </button>
              <button
                type="button"
                onClick={() => onNavigate('anatomy')}
                className="rounded-md bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
              >
                Explore 3D Atlas
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <FileText className="w-3.5 h-3.5" />
            <span>Informational clinical decision support only — not a medical diagnosis.</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting & Mapping...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Run AI Extraction
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
