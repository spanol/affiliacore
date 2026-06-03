# PoC-03 — HIGH: fail-open redirect para `/admin`

> Finding: [SECURITY-AUDIT.md → HIGH](../../SECURITY-AUDIT.md) · `src/App.tsx:125-135`
> CWE-636 (Not Failing Securely) · OWASP A01:2021 · CVSS 6.5 (contextual)

## A vulnerabilidade (1 parágrafo)

`DashboardRedirect` (`src/App.tsx:125-135`) decide para onde mandar o usuário logado.
Se `profile?.role` não é `'admin'` nem `'client'` (profile ausente, role vazio, doc
`users` ainda não resolvido), o fallback é `return <Navigate to="/admin" replace />`.
Isto é um **fail-open de autorização**: o default deveria ser a área de **menor
privilégio**. Sozinho não vaza dados (a rota `/admin` tem `ProtectedRoute` e os dados
têm rules/servidor), mas num app financeiro o default inseguro reduz a margem de erro
e — combinado com o CRITICAL-1 — agrava o impacto.

## Teste automatizado (`component-test.spec.tsx`)

```bash
npx vitest run .security-pocs/poc-03-high-fail-open-redirect/component-test.spec.tsx
```

- Grupo **VULNERABLE**: com `profile: null` o componente renderiza `ADMIN AREA`.
- Grupo **PATCHED**: com o fallback corrigido (`/profile`) renderiza `PROFILE AREA`,
  e o admin legítimo continua indo para `/admin`.

### (Opcional) testar o componente REAL em vez da cópia-espelho

Uma linha em `src/App.tsx`:

```diff
- function DashboardRedirect() {
+ export function DashboardRedirect() {
```

Depois, no spec, troque a cópia-espelho por:

```ts
import { DashboardRedirect } from '../../src/App';
```

(O `useAuth` já é mockado via `vi.mock('../../src/contexts/AuthContext')`.)

## Repro manual no Vite dev

1. `npm run dev` e logue com uma conta cujo doc `users` ainda **não** tenha `role`
   (ou simule: no DevTools, force `useAuth` a retornar `profile:null`).
2. Acesse `/` (que cai em `DashboardRedirect`).
3. **Observado:** a URL vira `/admin` e o shell de admin é carregado, disparando
   chamadas a endpoints admin.
4. **Esperado (pós-patch):** a URL vira `/profile`.

## Patch (1 linha)

```diff
- // Default fallback if role is missing but user is logged in
- return <Navigate to="/admin" replace />;
+ // Fail-safe: papel desconhecido => menor privilégio
+ return <Navigate to="/profile" replace />;
```

> **Status:** PoC ready (só precisa de `vitest`, que o projeto já tem). ~5 s.
