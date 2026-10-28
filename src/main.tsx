import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);

// Service worker solo en la web publicada (no en desarrollo ni dentro de un iframe de vista previa).
if ('serviceWorker' in navigator && import.meta.env.PROD && window.self === window.top && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
