# Infinity — checklist de onboarding

> **Auditoria 2026-07-20** — estado verificado contra a nuvem, não declarado:
> backend `infinity-server` existe mas **sem repositório conectado** e a URL
> responde **404 (nenhum rollout concluído)**. `Authentication` responde
> `CONFIGURATION_NOT_FOUND` = **nunca inicializado** (bloqueia qualquer login).
> Verificado OK: projeto no Blaze, Firestore `(default)` criado, app Web
> registrado, `ranking-cron-secret` ENABLED e legível, e os **11 secrets** do
> `apphosting.yaml` base todos resolvidos no override (10 neutralizados +
> `ranking-cron-secret` real) — a validação de env do rollout deve passar.
> NÃO foi possível confirmar o deploy das rules (checagem exigia credencial);
> como o deploy é idempotente, rode de novo por segurança.

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
- [x] Rules deployadas
- [x] Backend App Hosting criado
- [x] `apphosting.infinity.yaml` criado e commitado
- [x] `ranking-cron-secret` criado
- [ ] Repositório GitHub conectado ao backend (`spanol/affiliacore`, branch `main`)
- [ ] Environment `infinity` associado ao backend
- [ ] Primeiro rollout concluído

## 2. Credenciais / admin
- [ ] Authentication > Email/senha habilitado
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
- [x] Placeholders roxos em `public/infinity/` apontados pelas envs
      (`VITE_BRAND_LOGO_URL` / `VITE_BRAND_FAVICON_URL`) — sem isso a instância
      subia com o logo da AffiliaCore
- [ ] Logo oficial entregue pelo cliente
- [ ] Favicon oficial entregue pelo cliente
- [ ] Trocar as duas envs pelas URLs oficiais quando os assets chegarem
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
