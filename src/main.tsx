import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely handle global window-level environment errors (e.g., read-only window.fetch overrides by browser extensions or sandboxes)
if (typeof window !== 'undefined') {
  const isFetchError = (err: any) => {
    if (!err) return false;
    const msg = typeof err === 'string' ? err : (err.message || err.reason || String(err));
    return msg.includes("Cannot set property fetch") || 
           msg.includes("Failed to fetch") || 
           msg.includes("fetch");
  };

  window.addEventListener('error', (event) => {
    if (event.message && isFetchError(event.message)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason) {
      const reasonMsg = event.reason.message || String(event.reason);
      if (isFetchError(reasonMsg)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

