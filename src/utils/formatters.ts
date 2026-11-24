import type { ParameterStatus } from '../types/medical';

export function getStatusLabel(status: ParameterStatus | 'unknown'): string {
  switch (status) {
    case 'optimal':
      return 'Optimal';
    case 'borderline':
      return 'Borderline';
    case 'high':
      return 'Elevated';
    case 'low':
      return 'Low';
    case 'critical':
      return 'Critical';
    default:
      return 'Reported';
  }
}

export function getStatusClasses(status: ParameterStatus | 'unknown'): {
  text: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case 'optimal':
      return {
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
      };
    case 'borderline':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
      };
    case 'high':
    case 'low':
      return {
        text: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
      };
    case 'critical':
      return {
        text: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/35',
      };
    default:
      return {
        text: 'text-slate-600 dark:text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/30',
      };
  }
}

export function formatReportDate(dateStr: string): string {
  if (!dateStr) return 'Undated';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
