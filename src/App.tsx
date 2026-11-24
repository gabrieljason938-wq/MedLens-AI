import React, { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { ANATOMICAL_SYSTEMS } from './data/anatomicalSystems';
import {
  clearAllReports,
  deleteReportById,
  fetchBootstrapData,
  saveWorkspaceSettings,
  uploadAnatomyModelFile,
} from './services/api';
import type {
  AnatomicalSystemId,
  AnatomyModelAsset,
  MedicalReport,
  NavRoute,
  NotificationItem,
  WorkspaceSettings,
} from './types/medical';
import { Sidebar } from './components/layout/Sidebar';
import { TopNav } from './components/layout/TopNav';
import { AnatomyViewer } from './components/anatomy/AnatomyViewer';
import { ParameterAnalysisPanel } from './components/dashboard/ParameterAnalysisPanel';
import { InsightsSummaryTray } from './components/dashboard/InsightsSummaryTray';
import { UploadReportView } from './components/views/UploadReportView';
import { AiAnalysisView } from './components/views/AiAnalysisView';
import { AnatomyExplorerView } from './components/views/AnatomyExplorerView';
import { MedicalInsightsView } from './components/views/MedicalInsightsView';
import { AiAssistantView } from './components/views/AiAssistantView';
import { HealthTrendsView } from './components/views/HealthTrendsView';
import { CompareReportsView } from './components/views/CompareReportsView';
import { ReportVaultView } from './components/views/ReportVaultView';
import { SettingsView } from './components/views/SettingsView';

const DEFAULT_SETTINGS: WorkspaceSettings = {
  clinicianName: 'Clinical Workstation',
  clinicianRole: 'Diagnostic Reviewer',
  institution: 'MedLens Clinical Unit',
  unitPreference: 'conventional',
  modelAssetUrl: '',
};

interface ViewportErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ViewportErrorBoundary extends Component<
  { children: React.ReactNode },
  ViewportErrorBoundaryState
> {
  state: ViewportErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ViewportErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[540px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-6 text-center">
          <div className="max-w-md">
            <AlertCircle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              3D Viewport Recovery Mode
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {this.state.message || 'An unexpected rendering issue occurred in the 3D stage.'}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-4 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              Reload 3D Viewport
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState<NavRoute>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);

  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<AnatomicalSystemId | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS);
  const [modelAsset, setModelAsset] = useState<AnatomyModelAsset | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    let active = true;
    fetchBootstrapData()
      .then((data) => {
        if (!active) return;
        setReports(data.reports);
        setSettings(data.settings);
        setModelAsset(data.modelAsset);
        if (data.reports.length > 0) {
          setActiveReportId(data.reports[0].id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setBootstrapError(err instanceof Error ? err.message : 'Unable to reach MedLens backend.');
      })
      .finally(() => {
        if (active) setLoadingBootstrap(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeReport = useMemo(
    () => reports.find((r) => r.id === activeReportId) || reports[0] || null,
    [reports, activeReportId]
  );

  const pushNotification = useCallback(
    (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
      setNotifications((prev) => [
        {
          ...item,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: false,
        },
        ...prev,
      ]);
    },
    []
  );

  const handleReportAnalyzed = (report: MedicalReport, allReports: MedicalReport[]) => {
    setReports(allReports);
    setActiveReportId(report.id);
    setSelectedSystem(null);

    const flagged = report.parameters.filter((p) => p.status !== 'optimal');
    pushNotification({
      title: `Report Analyzed: ${report.title}`,
      message: `${report.parameters.length} biomarkers extracted (${flagged.length} flagged for clinical review).`,
      type: flagged.length > 0 ? 'alert' : 'analysis',
      targetRoute: 'analysis',
    });
  };

  const handleDeleteReport = async (id: string) => {
    const res = await deleteReportById(id);
    setReports(res.reports);
    if (activeReportId === id) {
      setActiveReportId(res.reports[0]?.id || null);
    }
  };

  const handleClearVault = async () => {
    const res = await clearAllReports();
    setReports(res.reports);
    setActiveReportId(null);
    setSelectedSystem(null);
  };

  const handleSaveSettings = async (next: Partial<WorkspaceSettings>) => {
    const res = await saveWorkspaceSettings(next);
    setSettings(res.settings);
    setModelAsset(res.modelAsset);
  };

  const handleUploadModelFile = async (file: File) => {
    const res = await uploadAnatomyModelFile(file);
    setModelAsset(res.modelAsset);
    setSettings((prev) => ({ ...prev, modelAssetUrl: res.modelAsset.url }));
    pushNotification({
      title: '3D Anatomical Model Loaded',
      message: `${res.modelAsset.name} is now active in the 3D Anatomy Explorer.`,
      type: 'system',
      targetRoute: 'anatomy',
    });
  };

  const handleSelectSystemAndExplore = (system: AnatomicalSystemId) => {
    setSelectedSystem(system);
    setActiveRoute('anatomy');
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex bg-slate-50 dark:bg-[#050811] text-slate-900 dark:text-slate-100">
        <Sidebar
          activeRoute={activeRoute}
          onNavigate={setActiveRoute}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          reportCount={reports.length}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <TopNav
            activeRoute={activeRoute}
            reports={reports}
            activeReport={activeReport}
            onSelectReport={(id) => {
              setActiveReportId(id);
              setSelectedSystem(null);
            }}
            onNavigate={setActiveRoute}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
            notifications={notifications}
            onMarkAllNotificationsRead={() =>
              setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            }
            settings={settings}
          />

          <main className="flex-1 p-4 lg:p-6">
            {bootstrapError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bootstrapError}</span>
              </div>
            )}

            {loadingBootstrap ? (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-8 h-[540px] rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] animate-pulse" />
                <div className="xl:col-span-4 h-[540px] rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] animate-pulse" />
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeRoute}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  {activeRoute === 'overview' && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        <button
                          type="button"
                          onClick={() => setSelectedSystem(null)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            selectedSystem === null
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] text-slate-600 dark:text-slate-400 hover:border-cyan-500/40'
                          }`}
                        >
                          All Systems
                        </button>
                        {ANATOMICAL_SYSTEMS.map((sys) => {
                          const count = activeReport
                            ? activeReport.parameters.filter((p) => p.system === sys.id).length
                            : 0;
                          const isSelected = selectedSystem === sys.id;
                          return (
                            <button
                              key={sys.id}
                              type="button"
                              onClick={() => setSelectedSystem(isSelected ? null : sys.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                isSelected
                                  ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/50'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] text-slate-600 dark:text-slate-400 hover:border-cyan-500/40'
                              }`}
                            >
                              {sys.label}
                              {count > 0 ? ` · ${count}` : ''}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                        <div className="xl:col-span-8">
                          <ViewportErrorBoundary>
                            <AnatomyViewer
                              activeReport={activeReport}
                              selectedSystem={selectedSystem}
                              onSelectSystem={setSelectedSystem}
                              modelAsset={modelAsset}
                              onUploadModelFile={handleUploadModelFile}
                              onNavigate={setActiveRoute}
                              isDark={isDark}
                              compact
                            />
                          </ViewportErrorBoundary>
                        </div>

                        <div className="xl:col-span-4">
                          <ParameterAnalysisPanel
                            activeReport={activeReport}
                            selectedSystem={selectedSystem}
                            onSelectSystem={setSelectedSystem}
                            onNavigate={setActiveRoute}
                          />
                        </div>
                      </div>

                      <InsightsSummaryTray
                        activeReport={activeReport}
                        onSelectSystem={setSelectedSystem}
                        onNavigate={setActiveRoute}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          3D Anatomical Models: Z-Anatomy (CC BY-SA 4.0) · Derived from
                          BodyParts3D, DBCLS (CC BY-SA 2.1 Japan)
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveRoute('settings')}
                          className="text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                        >
                          View Full License & Credits
                        </button>
                      </div>
                    </div>
                  )}

                  {activeRoute === 'upload' && (
                    <UploadReportView
                      onReportAnalyzed={handleReportAnalyzed}
                      onNavigate={setActiveRoute}
                    />
                  )}

                  {activeRoute === 'analysis' && (
                    <AiAnalysisView
                      activeReport={activeReport}
                      onSelectSystemAndExplore={handleSelectSystemAndExplore}
                      onNavigate={setActiveRoute}
                    />
                  )}

                  {activeRoute === 'anatomy' && (
                    <ViewportErrorBoundary>
                      <AnatomyExplorerView
                        activeReport={activeReport}
                        selectedSystem={selectedSystem}
                        onSelectSystem={setSelectedSystem}
                        modelAsset={modelAsset}
                        onUploadModelFile={handleUploadModelFile}
                        onNavigate={setActiveRoute}
                        isDark={isDark}
                      />
                    </ViewportErrorBoundary>
                  )}

                  {activeRoute === 'insights' && (
                    <MedicalInsightsView
                      activeReport={activeReport}
                      onSelectSystemAndExplore={handleSelectSystemAndExplore}
                      onNavigate={setActiveRoute}
                    />
                  )}

                  {activeRoute === 'assistant' && (
                    <AiAssistantView
                      activeReport={activeReport}
                      onNavigate={setActiveRoute}
                    />
                  )}

                  {activeRoute === 'trends' && (
                    <HealthTrendsView
                      reports={reports}
                      onNavigate={setActiveRoute}
                      isDark={isDark}
                    />
                  )}

                  {activeRoute === 'compare' && (
                    <CompareReportsView
                      reports={reports}
                      onNavigate={setActiveRoute}
                    />
                  )}

                  {activeRoute === 'vault' && (
                    <ReportVaultView
                      reports={reports}
                      activeReportId={activeReport?.id || null}
                      onSelectReport={(id) => {
                        setActiveReportId(id);
                        setSelectedSystem(null);
                      }}
                      onDeleteReport={handleDeleteReport}
                      onNavigate={setActiveRoute}
                    />
                  )}

                  {activeRoute === 'settings' && (
                    <SettingsView
                      settings={settings}
                      modelAsset={modelAsset}
                      isDark={isDark}
                      onToggleTheme={() => setIsDark((d) => !d)}
                      onSaveSettings={handleSaveSettings}
                      onUploadModelFile={handleUploadModelFile}
                      onClearVault={handleClearVault}
                      reportCount={reports.length}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
