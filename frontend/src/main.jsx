import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { SettingsModalProvider } from '@/context/SettingsModalContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <SettingsModalProvider>
    <App />
  </SettingsModalProvider>
);