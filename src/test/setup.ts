// Setup global dos testes (Vitest). Registra os matchers do jest-dom
// (toBeInTheDocument, toHaveClass, etc.) e limpa o DOM entre os testes.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom não implementa IntersectionObserver, que o motion usa no `whileInView`
// (Home/LP). Stub mínimo: nunca dispara — os elementos ficam no estado inicial,
// o suficiente p/ asserções de conteúdo.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
(globalThis as any).IntersectionObserver ??= IntersectionObserverStub;

// jsdom também não implementa matchMedia, que o ThemeProvider consulta p/ o
// `prefers-color-scheme` (fallback de quem não tem tema salvo nem
// VITE_BRAND_THEME). Sem este stub NENHUM teste consegue renderizar o
// ThemeProvider. Responde sempre "não prefere escuro": determinístico, e quem
// precisar do outro caminho seta `localStorage.theme` no próprio teste.
// O guard é obrigatório: este setup roda TAMBÉM nos testes com
// `// @vitest-environment node` (server.ts, instanceTheming), onde não há window.
if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
});
