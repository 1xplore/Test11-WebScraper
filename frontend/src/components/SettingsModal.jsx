import React from 'react';
import { Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useSettingsModal } from '@/context/SettingsModalContext';
import AiConfigSettings from '@/components/AiConfigSettings';

const TABS = [
  { key: 'ai-config', label: 'AI 配置', icon: Sparkles, Component: AiConfigSettings },
];

export default function SettingsModal() {
  const { open, tab, openSettings, closeSettings } = useSettingsModal();
  const active = TABS.find((t) => t.key === tab) || TABS[0];
  const { Component } = active;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openSettings(tab) : closeSettings())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            设置
          </DialogTitle>
          <DialogDescription>系统级配置。当前只接入 AI 配置，后续可在此扩展更多 tab。</DialogDescription>
        </DialogHeader>

        <div className="border-b border-rule">
          <nav className="-mb-px flex gap-1" aria-label="设置分类">
            {TABS.map((t) => {
              const isActive = t.key === active.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => openSettings(t.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors',
                    isActive
                      ? 'border-accent text-accent font-medium'
                      : 'border-transparent text-ink-muted hover:text-ink hover:border-rule'
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-2">
          <Component />
        </div>
      </DialogContent>
    </Dialog>
  );
}
