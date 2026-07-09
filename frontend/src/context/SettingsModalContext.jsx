import React, { createContext, useContext, useState, useCallback } from 'react';

const SettingsModalContext = createContext(null);

export function SettingsModalProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('ai-config');

  const openSettings = useCallback((nextTab = 'ai-config') => {
    setTab(nextTab);
    setOpen(true);
  }, []);
  const closeSettings = useCallback(() => setOpen(false), []);

  return (
    <SettingsModalContext.Provider value={{ open, tab, openSettings, closeSettings }}>
      {children}
    </SettingsModalContext.Provider>
  );
}

export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) throw new Error('useSettingsModal must be used within SettingsModalProvider');
  return ctx;
}
