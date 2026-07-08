import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import Dashboard from '@/pages/Dashboard.jsx';
import Platforms from '@/pages/Platforms.jsx';
import ScopeRules from '@/pages/ScopeRules.jsx';
import ScrapeRuns from '@/pages/ScrapeRuns.jsx';
import ErrorLogs from '@/pages/ErrorLogs.jsx';
import AppShell from '@/components/AppShell.jsx';

export default function App() {
  return (
    <TooltipProvider delayDuration={150}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/platforms" element={<Platforms />} />
            <Route path="/scope-rules" element={<ScopeRules />} />
            <Route path="/scrape-runs" element={<ScrapeRuns />} />
            <Route path="/error-logs" element={<ErrorLogs />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}