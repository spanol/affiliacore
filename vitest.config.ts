/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Config dedicada para testes — mantém o pipeline de build (vite.config.ts) intocado.
// Usa jsdom para testes de componente e expõe os matchers do jest-dom globalmente.
export default defineConfig({
  // cast: vitest empacota uma cópia aninhada do vite, gerando dois tipos Plugin
  // divergentes — só afeta a tipagem, não o runtime.
  plugins: [react()] as any,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // src/** + módulos server-side na raiz (ex.: otgLinksPull) que têm teste próprio.
    include: ['src/**/*.{test,spec}.{ts,tsx}', '*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/services/**', 'src/components/**'],
    },
  },
});
