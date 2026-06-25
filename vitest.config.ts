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
      // Inclui as superfícies de MAIOR risco que a auditoria mostrou estarem fora da
      // métrica (Fase 5 / P0.12): dinheiro nas páginas, auth/escopo no server.ts e o
      // swap de usuário nos contexts. Sem isto o número global ESCONDE a superfície
      // testada (server.test.ts, AuthContext.test.tsx etc.) — reportava "inexistente"
      // em vez de medir. server.ts/otgLinksPull.ts são módulos server-side na raiz.
      include: [
        'src/lib/**',
        'src/services/**',
        'src/components/**',
        'src/pages/**',
        'src/contexts/**',
        'server.ts',
        'otgLinksPull.ts',
        'errorPage.ts',
      ],
      exclude: [
        '**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        '**/*.d.ts',
        'src/main.tsx',
      ],
      // Pisos por pasta (Fase 5): travam a cobertura ATUAL para não regredir e sobem
      // a cada fase. Só valem com `--coverage` (npm run coverage / CI), não no
      // `npm test`. Floors ~ medido−margem (2026-06-24): lib ~93/91/95, services
      // ~44/92/46, components ~18/75/57, contexts ~44/81/50, pages ~3/41/29,
      // server.ts ~30/51/28. Meta progressiva: pages e server.ts sobem nas próximas.
      thresholds: {
        statements: 18,
        branches: 72,
        functions: 50,
        lines: 18,
        'src/lib/**': { statements: 88, branches: 85, functions: 90, lines: 88 },
        'src/services/**': { statements: 40, branches: 82, functions: 42, lines: 40 },
        'src/components/**': { statements: 15, branches: 65, functions: 50, lines: 15 },
        'src/contexts/**': { statements: 38, branches: 72, functions: 45, lines: 38 },
        'src/pages/**': { statements: 2, branches: 32, functions: 22, lines: 2 },
        'server.ts': { statements: 26, branches: 45, functions: 24, lines: 26 },
      },
    },
  },
});
