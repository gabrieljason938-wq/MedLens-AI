import React, { useState } from 'react';
import {
  Bell,
  ChevronDown,
  Menu,
  Moon,
  Sun,
  User,
} from 'lucide-react';
import type {
  MedicalReport,
  NavRoute,
  NotificationItem,
  WorkspaceSettings,
} from '../../types/medical';
import { formatReportDate } from '../../utils/formatters';

interface TopNavProps {
  activeRoute: NavRoute;
  reports: MedicalReport[];
  activeReport: MedicalReport | null;
  onSelectReport: (id: string) => void;
  onNavigate: (route: NavRoute) => void;
  onOpenMobileMenu: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  notifications: NotificationItem[];
  onMarkAllNotificationsRead: () => void;
  settings: WorkspaceSettings;
}

const ROUTE_TITLES: Record<NavRoute, string> = {
  overview: 'Clinical Intelligence Workstation',
  upload: 'Upload & Extract Medical Report',
  analysis: 'AI Laboratory Analysis',
  anatomy: '3D Anatomy Explorer',
  insights: 'Medical Insights & Questions',
  assistant: 'Clinical AI Assistant',
  trends: 'Longitudinal Health Trends',
  compare: 'Compare Reports',
  vault: 'Report Vault',
  settings: 'Workstation Settings',
};

export const TopNav: React.FC<TopNavProps> = ({
  activeRoute,
  reports,
  activeReport,
  onSelectReport,
  onNavigate,
  onOpenMobileMenu,
  isDark,
  onToggleTheme,
  notifications,
  onMarkAllNotificationsRead,
  settings,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#070C18]/95 px-4 lg:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 lg:hidden cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>

        <h1 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
          {ROUTE_TITLES[activeRoute]}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {reports.length > 0 && (
          <div className="hidden md:flex items-center gap-2">
            <select
              value={activeReport?.id || ''}
              onChange={(e) => onSelectReport(e.target.value)}
              aria-label="Active medical report"
              className="max-w-[230px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              {reports.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.title} · {formatReportDate(rep.reportDate)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((o) => !o);
              setProfileOpen(false);
            }}
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 font-mono text-[10px] font-bold text-slate-950">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-3 shadow-xl z-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Clinical Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllNotificationsRead}
                    className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No notifications yet. Analyze a report to receive alerts.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        if (n.targetRoute) onNavigate(n.targetRoute);
                        setNotifOpen(false);
                      }}
                      className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#070C18] p-2.5 hover:border-cyan-500/40 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        <span className="truncate">{n.title}</span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {n.timestamp}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                        {n.message}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Switch */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle color theme"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 cursor-pointer"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Clinician Profile Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((o) => !o);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] px-2.5 py-1.5 text-xs hover:border-cyan-500/50 cursor-pointer"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="hidden sm:inline font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap max-w-[140px] truncate">
              {settings.clinicianName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-3 shadow-xl z-50 text-xs">
              <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {settings.clinicianName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {settings.clinicianRole} · {settings.institution}
                </div>
              </div>
              <div className="pt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('settings');
                    setProfileOpen(false);
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 cursor-pointer"
                >
                  Workstation Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('vault');
                    setProfileOpen(false);
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 cursor-pointer"
                >
                  Open Report Vault
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
