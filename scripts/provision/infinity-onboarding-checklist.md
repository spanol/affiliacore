# Infinity — checklist de onboarding

> **2026-07-20 — INSTÂNCIA NO AR.** `https://infinity-server--infinity-affiliacore.us-east4.hosted.app`
> responde **HTTP 200** e o Admin SDK funciona por ADC (rota pública consultou o
> Firestore e devolveu 404 de negócio, não 500). Auth inicializado + e-mail/senha
> ativo (sonda saiu de `CONFIGURATION_NOT_FOUND` para `INVALID_LOGIN_CREDENTIALS`).
> Env overrides confirmados no log do build (12 aplicados, `--environment_name infinity`).
>
> **Custou 3 builds:** o backend original tinha sido criado sem o bootstrap de IAM
> da SA `firebase-app-hosting-compute@` (só tinha 1 papel). Resolvido apagando e
> recriando o backend — ver o GOTCHA de IAM no `README.md` §4.
>
> **Pendente:** (a) as rules do Firestore não foram deployadas nem verificadas
> nesta instância — rode `firebase deploy --only firestore:rules --project
> infinity-affiliacore` (idempotente); (b) 1º admin; (c) a instância ainda roda o
> commit `bdbd55c`, ANTERIOR aos fixes de logo (`58ad7a4`) e da landing (`7bf3824`)
> — precisa de um rollout novo depois do push.

Projeto alvo:
- `infinity-affiliacore`

Marca:
- nome: `Infinity`
- cor primária: `#8332B9`
- ambiente App Hosting: `infinity`
- backend App Hosting: `infinity-server`

## 1. Infra / Firebase
- [x] Projeto Firebase criado
- [x] App Web criado
- [x] Firestore criado
- [ ] Rules deployadas — **NÃO confirmado** (marcado como feito antes, mas a
      verificação de 2026-07-20 não conseguiu comprovar; deploy é idempotente,
      rode de novo)
- [x] Backend App Hosting criado
- [x] `apphosting.infinity.yaml` criado e commitado
- [x] `ranking-cron-secret` criado
- [x] Repositório GitHub conectado ao backend (`spanol/affiliacore`, branch `main`)
- [x] Environment `infinity` associado ao backend
- [x] Primeiro rollout concluído (build-2026-07-20-001, HTTP 200)

## 2. Credenciais / admin
- [x] Authentication > Email/senha habilitado
- [ ] Gerar `service-account.infinity.json`
- [ ] Rodar bootstrap do 1º admin
- [ ] Admin inicial confirmado no login

### Login sugerido para o 1º admin
- e-mail: `infinity@affiliacore.com.br`
- nome: `Admin Infinity`

### Comando de bootstrap
```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.infinity.json \
  node scripts/provision/bootstrap-admin.cjs --email infinity@affiliacore.com.br --name "Admin Infinity"
```

## 3. Branding / assets
- [x] Nome da marca aplicado
- [x] Accent `#8332B9` aplicado no YAML
- [x] Assets em `public/infinity/` apontados pelas envs
      (`VITE_BRAND_LOGO_URL` / `VITE_BRAND_FAVICON_URL`) — sem isso a instância
      subia com o logo da AffiliaCore
- [x] Logo desenhado a partir da referência do cliente (avatar do IG
      `@infinity.affiliates`): lemniscata + seta de crescimento e wordmark em
      curvas. `logo.svg` é **mono branco** (o app aplica `invert` no tema claro);
      cor em `logo-color-dark.svg` / `logo-color-light.svg`; `favicon.svg` colorido
- [ ] Validar o logo com o cliente (foi derivado do avatar do IG, não entregue
      por ele — confirmar antes de usar em material impresso/contrato)
- [ ] Se o cliente tiver o vetor original, substituir os 4 arquivos
- [ ] Revisar canvas/surface: o base herda o plum ember (`#26181C`/`#3F1D2B`)
      da AffiliaCore, que briga com o roxo `#8332B9` do cliente

## 4. Operação inicial da instância
- [ ] Criar primeira casa manual
- [ ] Importar primeira planilha modelo
- [ ] Criar primeiro convite de afiliado
- [ ] Validar dashboard admin
- [ ] Validar portal do afiliado
- [ ] Validar auditoria
- [ ] Validar ranking

## 5. Domínio / produção
- [ ] Adicionar domínio custom da Infinity
- [ ] Apontar DNS
- [ ] Aguardar certificado
- [ ] Atualizar Scheduler para o domínio final (se aplicável)

## 6. Checklist de aceite
- [ ] Login do admin funciona
- [ ] Sidebar mostra a marca Infinity
- [ ] Fluxo OTG está ausente (instância OTG-free)
- [ ] Upload/import de resultados funciona
- [ ] Convite e auto-cadastro funcionam
- [ ] Auditoria registra alterações
- [ ] Ranking gera entradas
- [ ] `POST /api/internal/daily-ranking` responde corretamente com secret
