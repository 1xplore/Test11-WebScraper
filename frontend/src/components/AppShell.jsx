import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Bell, Settings2, Activity, Boxes, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsModal } from '@/context/SettingsModalContext';
import Login from '@/components/Login.jsx';

const navItems = [
  { to: '/', label: '招标线索', icon: Boxes, end: true },
  { to: '/platforms', label: '抓取来源', icon: Settings2 },
  { to: '/scope-rules', label: '匹配规则', icon: Activity },
  { to: '/error-logs', label: '错误日志', icon: AlertTriangle },
  { to: '/scrape-runs', label: '抓取日志', icon: Bell },
];

export default function AppShell() {
  const { openSettings } = useSettingsModal();
  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="page-header-inner">
          <div className="brand">
            <div className="brand-mark">招</div>
            <span className="brand-text">招标线索看板</span>
            <span className="brand-sub">v0.1 · 本地模式</span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-colors leading-none',
                    isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-l border-rule pl-4 ml-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => openSettings('ai-config')}
              title="设置（AI 配置等）"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <Login />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}