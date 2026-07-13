---
name: verify
description: Verificar mudanças do app na tela usando a demo nos EMULADORES (Firestore+Auth) — zero contato com projetos reais. Use para exercitar fluxos de admin/afiliado/Home pública com dados fictícios semeados.
---

# Verificação via demo nos emuladores

Receita completa (fonte canônica): `scripts/provision/README.md` § "Preview LOCAL da demo".
Requer Java (mesma dependência do `npm run test:rules`).

```bash
# 1) emuladores (background)
firebase emulators:start --only firestore,auth --project affiliacore

# 2) seed — imprime as senhas dos 3 logins (admin/afiliado/especial)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=affiliacore GOOGLE_CLOUD_PROJECT=affiliacore \
  node scripts/provision/seed-demo.cjs

# 3) app em modo demo (background) — http://localhost:3123
GOOGLE_APPLICATION_CREDENTIALS='' FIREBASE_SERVICE_ACCOUNT_KEY='' \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=affiliacore GOOGLE_CLOUD_PROJECT=affiliacore \
FIREBASE_WEBAPP_CONFIG='{"apiKey":"demo-local","authDomain":"127.0.0.1","projectId":"affiliacore","storageBucket":"affiliacore.firebasestorage.app","appId":"1:demo:web:demo"}' \
VITE_USE_EMULATORS=true VITE_OTG_ENABLED=false VITE_BRAND_NAME='AffiliaCore Demo' \
VITE_BRAND_ACCENT='#E11D48' VITE_BRAND_CANVAS='#26181C' VITE_BRAND_SURFACE='#3F1D2B' \
PORT=3123 npm run dev
```

Dirija com o Chrome MCP. Fluxos que valem o smoke: `/` (Home pública deslogada),
login admin → `/admin`, `/ranking` (gerar ranking do dia — o seed garante
produção ONTEM), `/auditoria`; login afiliado → portal próprio.

## Gotchas

- **Banner "Nova versão disponível" aparece em dev** (server publica a versão do
  boot ≠ bundle dev). Para screenshots limpos, remova o node via JS antes do print.
- **`server.ts` roda código antigo até reiniciar o processo** (sem watch) —
  mudança de servidor exige matar e resubir o passo 3. Frontend tem HMR.
- Mudou `firestore.rules`? O emulator carrega as rules do `firebase.json` na
  subida — reinicie o passo 1 para valerem.
- Clique em modal via coordenada pode cair no BACKDROP (fecha o modal) se o
  viewport re-zoomar — prefira refs do read_page.
- Ao terminar: matar os dois processos background. Nada a limpar (emulador é
  descartável, nunca toca prod).
