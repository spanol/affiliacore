# PoC-03 — HIGH: fail-open redirect para `/admin`

Ver [`reproduce.md`](./reproduce.md) para a explicação completa, passos manuais e
o patch. O teste automatizado está em
[`component-test.spec.tsx`](./component-test.spec.tsx).

**TL;DR:**
```bash
npx vitest run .security-pocs/poc-03-high-fail-open-redirect/component-test.spec.tsx
```
- VULNERABLE: `profile:null` → renderiza `ADMIN AREA`.
- PATCHED: `profile:null` → renderiza `PROFILE AREA` (menor privilégio).
