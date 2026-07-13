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

afterEach(() => {
  cleanup();
});
