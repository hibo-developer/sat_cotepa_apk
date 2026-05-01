import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { generarInformeParteDemoLocal } from './services/parteTrabajoInformeService';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const satPdfPreviewApi = {
    generarInformeDemo: generarInformeParteDemoLocal,
  };

  // Alias para evitar errores por variaciones/typos al invocarlo desde consola.
  window.__satPdfPreview = satPdfPreviewApi;
  window._satPdfPreview = satPdfPreviewApi;
  window._satPdfPrewiew = satPdfPreviewApi;
}

if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
