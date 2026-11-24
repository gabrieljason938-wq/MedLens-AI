export type NavRoute =
  | 'overview'
  | 'upload'
  | 'analysis'
  | 'anatomy'
  | 'insights'
  | 'assistant'
  | 'trends'
  | 'compare'
  | 'vault'
  | 'settings';

export type AnatomicalSystemId =
  | 'cardiovascular'
  | 'hepatic'
  | 'renal'
  | 'pulmonary'
  | 'endocrine'
  | 'hematologic'
  | 'metabolic'
  | 'neurological'
  | 'musculoskeletal'
  | 'immune';

export type ParameterStatus = 'optimal' | 'borderline' | 'high' | 'low' | 'critical';

export interface LabParameter {
  id: string;
  name: string;
  abbreviation?: string;
  value: number | null;
  displayValue: string;
  unit: string;
  referenceRange: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  status: ParameterStatus;
  system: AnatomicalSystemId;
  organTarget: string;
  clinicalNote: string;
}

export interface MedicalInsight {
  id: string;
  title: string;
  severity: 'informational' | 'attention' | 'priority';
  system: AnatomicalSystemId;
  summary: string;
  relatedParameters: string[];
  physicianQuestions: string[];
}

export interface MedicalReport {
  id: string;
  title: string;
  reportDate: string;
  uploadedAt: string;
  sourceFileName: string;
  sourceMimeType: string;
  laboratoryName?: string;
  patientReference?: string;
  overallSummary: string;
  systemsAffected: AnatomicalSystemId[];
  parameters: LabParameter[];
  insights: MedicalInsight[];
  followUpRecommendations: string[];
}

export interface ComparisonDelta {
  name: string;
  unit: string;
  system: AnatomicalSystemId;
  baselineValue: string;
  currentValue: string;
  baselineStatus: ParameterStatus | 'unknown';
  currentStatus: ParameterStatus | 'unknown';
  deltaText: string;
  direction: 'improved' | 'worsened' | 'unchanged' | 'changed';
}

export interface ComparisonResult {
  baselineReportId: string;
  currentReportId: string;
  executiveSummary: string;
  systemShifts: Array<{
    system: AnatomicalSystemId;
    trend: 'improved' | 'stable' | 'attention';
    note: string;
  }>;
  parameterDeltas: ComparisonDelta[];
}

export interface AnatomyModelAsset {
  id: string;
  name: string;
  url: string;
  source: 'uploaded' | 'configured' | 'server';
  sizeBytes?: number;
  loadedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'analysis' | 'alert' | 'system';
  read: boolean;
  targetRoute?: NavRoute;
}

export interface WorkspaceSettings {
  clinicianName: string;
  clinicianRole: string;
  institution: string;
  unitPreference: 'conventional' | 'si';
  modelAssetUrl: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  referencedParameters?: string[];
}

export interface SelectedOrganInfo {
  rawName: string;
  displayName: string;
  layerId: string;
  system: AnatomicalSystemId;
  meshUuid: string;
  center: [number, number, number];
  radius: number;
}

export interface AnatomicalLayerState {
  id: string;
  label: string;
  visible: boolean;
  opacity: number;
  meshCount: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}
