import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  ExternalLink,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Z_ANATOMY_ATTRIBUTIONS,
  Z_ANATOMY_REFERENCE_CREDITS,
} from '../../data/zAnatomyAttribution';
import type { AnatomyModelAsset, WorkspaceSettings } from '../../types/medical';

interface SettingsViewProps {
  settings: WorkspaceSettings;
  modelAsset: AnatomyModelAsset | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onSaveSettings: (next: Partial<WorkspaceSettings>) => Promise<void>;
  onUploadModelFile: (file: File) => Promise<void>;
  onClearVault: () => Promise<void>;
  reportCount: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  modelAsset,
  isDark,
  onToggleTheme,
  onSaveSettings,
  onUploadModelFile,
  onClearVault,
  reportCount,
}) => {
  const [clinicianName, setClinicianName] = useState(settings.clinicianName);
  const [clinicianRole, setClinicianRole] = useState(settings.clinicianRole);
  const [institution, setInstitution] = useState(settings.institution);
  const [unitPreference, setUnitPreference] = useState<'conventional' | 'si'>(
    settings.unitPreference
  );
  const [modelAssetUrl, setModelAssetUrl] = useState(settings.modelAssetUrl);
  const [saving, setSaving] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await onSaveSettings({
        clinicianName,
        clinicianRole,
        institution,
        unitPreference,
        modelAssetUrl,
      });
      setStatusMessage('Workstation preferences saved.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleModelUpload = async (file: File) => {
    setUploadingModel(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await onUploadModelFile(file);
      setStatusMessage(`Loaded 3D anatomical asset: ${file.name}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to upload 3D model.');
    } finally {
      setUploadingModel(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-6 space-y-5"
      >
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Workstation Profile & Preferences
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure clinician metadata, display units, and interface theme.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={clinicianName}
              onChange={(e) => setClinicianName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Clinical Role
            </label>
            <input
              type="text"
              value={clinicianRole}
              onChange={(e) => setClinicianRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Institution / Practice
            </label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Preferred Unit System
            </label>
            <select
              value={unitPreference}
              onChange={(e) => setUnitPreference(e.target.value as 'conventional' | 'si')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value="conventional">Conventional (mg/dL, U/L)</option>
              <option value="si">SI International (mmol/L, µkat/L)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
              Workstation Theme
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Current: {isDark ? 'Deep Navy Clinical Dark' : 'Clinical Daylight'}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/50 cursor-pointer"
          >
            Switch to {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>

        <div className="pt-5 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Box className="w-4 h-4 text-cyan-500" />
                3D Anatomy Asset Configuration
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Upload a custom `.glb` / `.gltf` anatomy model or leave empty to use the integrated
                Z-Anatomy atlas (`/models/z-anatomy/manifest.json`).
              </p>
            </div>
            <input
              ref={modelInputRef}
              type="file"
              accept=".glb,.gltf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleModelUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploadingModel}
              onClick={() => modelInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingModel ? 'Uploading...' : 'Upload .GLB / .GLTF'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Active Model Asset URL / Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelAssetUrl}
                onChange={(e) => setModelAssetUrl(e.target.value)}
                placeholder="/models/z-anatomy/manifest.json"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              {modelAssetUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    setModelAssetUrl('');
                    await onSaveSettings({ modelAssetUrl: '' });
                    setStatusMessage('Cleared custom 3D model override.');
                  }}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:border-rose-500/50 cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
            {modelAsset && (
              <p className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                Active asset: {modelAsset.name} ({modelAsset.source})
              </p>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Clinical Vault Storage ({reportCount} reports)
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Permanently remove all extracted reports and biomarker histories from local server
            storage.
          </p>
        </div>

        {!confirmClear ? (
          <button
            type="button"
            disabled={reportCount === 0}
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Vault
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                await onClearVault();
                setConfirmClear(false);
                setStatusMessage('All reports cleared from vault.');
              }}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
            >
              Confirm Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-6 space-y-3">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Anatomical 3D Asset Attribution & Licenses
        </h3>
        <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
          {Z_ANATOMY_ATTRIBUTIONS.map((attr) => (
            <div
              key={attr.title}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {attr.title}
                </span>
                <a
                  href={attr.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline font-mono text-[11px]"
                >
                  {attr.license}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Authors: {attr.authors}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
                <a
                  href={attr.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  {attr.sourceUrl}
                </a>
                {attr.repoUrl && (
                  <a
                    href={attr.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    {attr.repoUrl}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Reference & derivative models: {Z_ANATOMY_REFERENCE_CREDITS.join(' · ')}.
        </p>
      </div>
    </div>
  );
};
