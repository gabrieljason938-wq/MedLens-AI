import React from 'react';
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FolderLock,
  GitCompare,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Settings,
  TrendingUp,
  UploadCloud,
  X,
} from 'lucide-react';
import type { NavRoute } from '../../types/medical';

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  reportCount: number;
}

const NAV_ITEMS: Array<{
  id: NavRoute;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Report', icon: UploadCloud },
  { id: 'analysis', label: 'AI Analysis', icon: FileSearch },
  { id: 'anatomy', label: '3D Anatomy Explorer', icon: Layers },
  { id: 'insights', label: 'Medical Insights', icon: Lightbulb },
  { id: 'assistant', label: 'AI Assistant', icon: Bot },
  { id: 'trends', label: 'Health Trends', icon: TrendingUp },
  { id: 'compare', label: 'Compare Reports', icon: GitCompare },
  { id: 'vault', label: 'Report Vault', icon: FolderLock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  reportCount,
}) => {
  const handleSelect = (route: NavRoute) => {
    onNavigate(route);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#080E1C] transition-all duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-[72px]' : 'w-64'}`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelect('overview')}
            className="flex items-center gap-2.5 text-left cursor-pointer min-w-0"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-cyan-500">
              <Activity className="w-5 h-5" />
            </div>
            {!collapsed && (
              <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
                MedLens AI
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 lg:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/35'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 border border-transparent'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-500' : ''}`} />
                {!collapsed && (
                  <span className="flex-1 text-left whitespace-nowrap truncate">
                    {item.label}
                  </span>
                )}
                {!collapsed && item.id === 'vault' && reportCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                    {reportCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Upload Action */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelect('upload')}
            title={collapsed ? 'Upload Report' : undefined}
            className={`w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer whitespace-nowrap ${
              collapsed ? 'px-0' : ''
            }`}
          >
            <UploadCloud className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Analyze Report</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
