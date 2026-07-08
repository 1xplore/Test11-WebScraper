import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Bell, Settings2, Activity, Boxes, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Login from '@/components/Login.jsx';

const navItems = [
  { to: '/', label: '招标线索', icon: Boxes, end: true },
  { to: '/platforms', label: '抓取来源', icon: Settings2 },
  { to: '/scope-rules', label: '匹配规则', icon: Activity },
  { to: '/error-logs', label: '错误日志', icon: AlertTriangle },
  { to: '/scrape-runs', label: '抓取日志', icon: Bell },
];

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="page-header-inner">
          <div className="brand">
            <div className="brand-mark">招</div>
            <span>招标线索看板</span>
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
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    isActive ? 'bg-[#dbeafe] text-[#0075de]' : 'text-slate-600 hover:bg-[#f6f5f4]'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-l border-[#e6e6e6] pl-4 ml-1">
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