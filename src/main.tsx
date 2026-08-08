import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyBrandToDocument } from './lib/brandingClient';
import { captureRegistrationSource } from './lib/registrationSource';

// P3: o index.html é o MESMO p/ todas as instâncias — título e favicon da marca
// entram aqui, no boot (antes do primeiro paint do React).
applyBrandToDocument();

// Origem do visitante (?src= / utm_source, ex.: vitrine da AffiliaCore) — capturada
// uma vez no boot e guardada na sessão; o form da Home e o /register a carimbam.
captureRegistrationSource(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
