import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './ui/App';
import { useTrickStore } from './store';

// `?debug` (TrickScene.tsx, docs/PERF-BUDGET.md) also exposes the store, from
// before the 3D code arrives, so a measurement can read its flags (status,
// flightId, stageReady) instead of inferring them from the frameloop.
if (new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __trickLabStore?: typeof useTrickStore }).__trickLabStore = useTrickStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
