import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyBrandToDocument } from './lib/brandingClient';

// P3: o index.html é o MESMO p/ todas as instâncias — título e favicon da marca
// entram aqui, no boot (antes do primeiro paint do React).
applyBrandToDocument();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
