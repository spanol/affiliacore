---
name: verify
description: Verificar mudanças do app na tela usando a demo nos EMULADORES (Firestore+Auth) — zero contato com projetos reais. Use para exercitar fluxos de admin/afiliado/Home pública com dados fictícios semeados.
---

# Verificação via demo nos emuladores

Receita completa (fonte canônica): `scripts/provision/README.md` § "Preview LOCAL da demo".
Requer firebase CLI + Java (mesma dependência do `npm run test:rules`).

```bash
# Um comando (background) — emuladores + seed + app em http://localhost:3123.
# O seed imprime as senhas dos 3 logins (admin/afiliado/especial) e as salva em
# .demo-runtime/affiliacore/latest-demo-credentials.txt
npm run dev
```

Emuladores já ativos? O comando reusa os dados como estão (restart rápido do
server não apaga o que você criou); `DEMO_RESEED=1 npm run dev` reseeda do zero.
Porta ocupada/alternativa: `PORT=3125 npm run dev`.

Dirija com o Chrome MCP. Fluxos que valem o smoke: `/` (Home pública deslogada),
login admin → `/admin`, `/ranking` (gerar ranking do dia — o seed garante
produção ONTEM), `/auditoria`; login afiliado → portal próprio.

## Gotchas

- **Banner "Nova versão disponível" aparece em dev** (server publica a versão do
  boot ≠ bundle dev). Para screenshots limpos, remova o node via JS antes do print.
- **`server.ts` roda código antigo até reiniciar o processo** (sem watch) —
  mudança de servidor exige matar o `npm run dev` e resubir (os emuladores
  sobrevivem e os dados ficam). Frontend tem HMR.
- Mudou `firestore.rules`? O emulator as carrega na subida — mate TAMBÉM o
  processo dos emuladores (portas 8080/9099) e rode `npm run dev` de novo.
- Clique em modal via coordenada pode cair no BACKDROP (fecha o modal) se o
  viewport re-zoomar — prefira refs do read_page.
- Ao terminar: matar o processo do `npm run dev` (ele derruba os emuladores que
  ele mesmo subiu). Nada a limpar (emulador é descartável, nunca toca prod).
