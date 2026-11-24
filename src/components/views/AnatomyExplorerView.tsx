import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  ExternalLink,
  Search,
} from 'lucide-react';
import { ANATOMICAL_SYSTEMS, SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import {
  Z_ANATOMY_ATTRIBUTIONS,
  Z_ANATOMY_REFERENCE_CREDITS,
} from '../../data/zAnatomyAttribution';
import type {
  AnatomicalSystemId,
  AnatomyModelAsset,
  MedicalReport,
  NavRoute,
  SelectedOrganInfo,
} from '../../types/medical';
import { getStatusClasses, getStatusLabel } from '../../utils/formatters';
import { AnatomyViewer, type DiscoveredOrganEntry } from '../anatomy/AnatomyViewer';

interface AnatomyExplorerViewProps {
  activeReport: MedicalReport | null;
  selectedSystem: AnatomicalSystemId | null;
  onSelectSystem: (sys: AnatomicalSystemId | null) => void;
  modelAsset: AnatomyModelAsset | null;
  onUploadModelFile: (file: File) => Promise<void>;
  onNavigate: (route: NavRoute) => void;
  isDark: boolean;
}

export const AnatomyExplorerView: React.FC<AnatomyExplorerViewProps> = ({
  activeReport,
  selectedSystem,
  onSelectSystem,
  modelAsset,
  onUploadModelFile,
  onNavigate,
  isDark,
}) => {
  const [discoveredOrgans, setDiscoveredOrgans] = useState<DiscoveredOrganEntry[]>([]);
  const [selectedOrgan, setSelectedOrgan] = useState<SelectedOrganInfo | null>(null);
  const [organSearch, setOrganSearch] = useState('');
  const [rightTab, setRightTab] = useState<'biomarkers' | 'organs'>('biomarkers');

  const focusedSystem = selectedSystem ? SYSTEM_META_MAP[selectedSystem] : null;

  const systemCounts = useMemo(() => {
    const counts = new Map<AnatomicalSystemId, { total: number; flagged: number }>();
    if (!activeReport) return counts;
    for (const p of activeReport.parameters) {
      const current = counts.get(p.system) ?? { total: 0, flagged: 0 };
      current.total += 1;
      if (p.status !== 'optimal') current.flagged += 1;
      counts.set(p.system, current);
    }
    return counts;
  }, [activeReport]);

  const linkedParams = useMemo(() => {
    if (!activeReport) return [];
    if (!selectedSystem) return activeReport.parameters;
    return activeReport.parameters.filter((p) => p.system === selectedSystem);
  }, [activeReport, selectedSystem]);

  const filteredOrgans = useMemo(() => {
    const q = organSearch.trim().toLowerCase();
    return discoveredOrgans
      .filter((org) => {
        if (selectedSystem && org.system !== selectedSystem) return false;
        if (q && !org.displayName.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 120);
  }, [discoveredOrgans, selectedSystem, organSearch]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <aside className="xl:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-4 flex flex-col max-h-[700px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Anatomical Systems
            </h2>
            {(selectedSystem || selectedOrgan) && (
              <button
                type="button"
                onClick={() => {
                  onSelectSystem(null);
                  setSelectedOrgan(null);
                }}
                className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div className="mt-3 space-y-1.5 overflow-y-auto flex-1 pr-1">
            {ANATOMICAL_SYSTEMS.map((sys) => {
              const stats = systemCounts.get(sys.id) ?? { total: 0, flagged: 0 };
              const isSelected = selectedSystem === sys.id;

              return (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => {
                    setSelectedOrgan(null);
                    onSelectSystem(isSelected ? null : sys.id);
                  }}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#070C18]/70 hover:border-cyan-500/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {sys.label}
                    </span>
                    {stats.total > 0 && (
                      <span
                        className={`font-mono tabular-nums text-[11px] font-medium ${
                          stats.flagged > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {stats.total} {stats.flagged > 0 ? `(${stats.flagged} flagged)` : ''}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {sys.organFocus}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="xl:col-span-6">
          <AnatomyViewer
            activeReport={activeReport}
            selectedSystem={selectedSystem}
            onSelectSystem={onSelectSystem}
            selectedOrgan={selectedOrgan}
            onSelectOrgan={setSelectedOrgan}
            modelAsset={modelAsset}
            onUploadModelFile={onUploadModelFile}
            onNavigate={onNavigate}
            isDark={isDark}
            onOrgansDiscovered={setDiscoveredOrgans}
          />
        </div>

        <aside className="xl:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] p-4 flex flex-col max-h-[700px]">
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {selectedOrgan
                ? selectedOrgan.displayName
                : focusedSystem
                  ? focusedSystem.label
                  : 'Anatomical Inspector'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {selectedOrgan
                ? `Focused structure (${selectedOrgan.layerId}) · ${SYSTEM_META_MAP[selectedOrgan.system].label}`
                : focusedSystem
                  ? focusedSystem.description
                  : 'Click any organ in 3D or select from the directory below to focus camera and inspect biomarkers.'}
            </p>

            <div className="mt-3 flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800/70">
              <button
                type="button"
                onClick={() => setRightTab('biomarkers')}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  rightTab === 'biomarkers'
                    ? 'bg-white dark:bg-[#111A2E] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Biomarkers ({linkedParams.length})
              </button>
              <button
                type="button"
                onClick={() => setRightTab('organs')}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  rightTab === 'organs'
                    ? 'bg-white dark:bg-[#111A2E] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Organs ({discoveredOrgans.length})
              </button>
            </div>
          </div>

          {rightTab === 'organs' ? (
            <div className="mt-3 flex flex-col flex-1 min-h-0">
              <div className="relative mb-2.5">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={organSearch}
                  onChange={(e) => setOrganSearch(e.target.value)}
                  placeholder="Search anatomical structures..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                {filteredOrgans.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No matching structures in currently visible layers.
                  </p>
                ) : (
                  filteredOrgans.map((org) => {
                    const isFocused = selectedOrgan?.meshUuid === org.meshUuid;
                    return (
                      <button
                        key={org.meshUuid}
                        type="button"
                        onClick={() => {
                          setSelectedOrgan(org);
                          onSelectSystem(org.system);
                        }}
                        className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                          isFocused
                            ? 'border-cyan-500/50 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 font-medium'
                            : 'border-slate-200 dark:border-slate-800/70 bg-slate-50/60 dark:bg-[#070C18]/70 text-slate-700 dark:text-slate-300 hover:border-cyan-500/35'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate">{org.displayName}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                            {org.layerId} · {SYSTEM_META_MAP[org.system].label}
                          </div>
                        </div>
                        <Crosshair className="w-3.5 h-3.5 shrink-0 text-cyan-500 opacity-80" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
              {!activeReport ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No active medical report loaded. Upload a report to correlate biomarkers with
                  selected organs.
                </div>
              ) : linkedParams.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No extracted biomarkers in the active report map to{' '}
                  {focusedSystem?.label || 'this organ'}.
                </div>
              ) : (
                linkedParams.map((p) => {
                  const cls = getStatusClasses(p.status);
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#070C18]/70 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {p.name}
                        </div>
                        <div className="font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                          {p.displayValue} {p.unit}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">{p.organTarget}</span>
                        <span className={`inline-flex items-center gap-1 font-medium ${cls.text}`}>
                          {p.status === 'optimal' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {getStatusLabel(p.status)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {Z_ANATOMY_ATTRIBUTIONS.map((attr) => (
            <span key={attr.title} className="inline-flex items-center gap-1">
              <strong className="font-medium text-slate-700 dark:text-slate-200">
                {attr.title}
              </strong>
              <span>({attr.license})</span>
              <a
                href={attr.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-0.5"
              >
                Source <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </span>
          ))}
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-500">
          Includes adapted credits: {Z_ANATOMY_REFERENCE_CREDITS.join(' · ')}
        </div>
      </footer>
    </div>
  );
};
