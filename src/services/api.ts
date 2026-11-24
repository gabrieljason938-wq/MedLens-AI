import type {
  AnatomyModelAsset,
  ChatMessage,
  ComparisonResult,
  MedicalReport,
  WorkspaceSettings,
} from '../types/medical';

export interface BootstrapResponse {
  reports: MedicalReport[];
  settings: WorkspaceSettings;
  modelAsset: AnatomyModelAsset | null;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected server response (${res.status}).`);
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchBootstrapData(): Promise<BootstrapResponse> {
  const res = await fetch('/api/bootstrap');
  return parseJsonOrThrow<BootstrapResponse>(res);
}

export async function analyzeReportUpload(payload: {
  file?: File;
  rawText?: string;
  title?: string;
  reportDate?: string;
}): Promise<{ report: MedicalReport; reports: MedicalReport[] }> {
  const formData = new FormData();
  if (payload.file) formData.append('file', payload.file);
  if (payload.rawText) formData.append('rawText', payload.rawText);
  if (payload.title) formData.append('title', payload.title);
  if (payload.reportDate) formData.append('reportDate', payload.reportDate);

  const res = await fetch('/api/reports/analyze', {
    method: 'POST',
    body: formData,
  });
  return parseJsonOrThrow<{ report: MedicalReport; reports: MedicalReport[] }>(res);
}

export async function deleteReportById(
  id: string
): Promise<{ reports: MedicalReport[] }> {
  const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return parseJsonOrThrow<{ reports: MedicalReport[] }>(res);
}

export async function clearAllReports(): Promise<{ reports: MedicalReport[] }> {
  const res = await fetch('/api/reports', { method: 'DELETE' });
  return parseJsonOrThrow<{ reports: MedicalReport[] }>(res);
}

export async function saveWorkspaceSettings(
  next: Partial<WorkspaceSettings>
): Promise<{ settings: WorkspaceSettings; modelAsset: AnatomyModelAsset | null }> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
  return parseJsonOrThrow<{
    settings: WorkspaceSettings;
    modelAsset: AnatomyModelAsset | null;
  }>(res);
}

export async function uploadAnatomyModelFile(
  file: File
): Promise<{ modelAsset: AnatomyModelAsset }> {
  const formData = new FormData();
  formData.append('model', file);
  const res = await fetch('/api/anatomy/upload', {
    method: 'POST',
    body: formData,
  });
  return parseJsonOrThrow<{ modelAsset: AnatomyModelAsset }>(res);
}

export async function compareReportsByIds(
  baselineId: string,
  currentId: string
): Promise<{ comparison: ComparisonResult }> {
  const res = await fetch('/api/reports/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baselineId, currentId }),
  });
  return parseJsonOrThrow<{ comparison: ComparisonResult }>(res);
}

export async function sendClinicalChatMessage(payload: {
  reportId: string | null;
  message: string;
  history: ChatMessage[];
}): Promise<{ reply: string; referencedParameters: string[] }> {
  const res = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<{ reply: string; referencedParameters: string[] }>(res);
}
