# Plano de lançamento — ebook "Agência, não aposta"

**Criado 2026-07-22.** Estado: texto do ebook CONGELADO em rascunho v1 (decisão do Vinicius) enquanto a esteira de venda é preparada. Base factual/benchmarks: `../PESQUISA.md`.

## O funil (visão)

```
Orgânico (IG @affiliacore.br + leads da LP + DMs ICP)  ─┐
SEO (affiliacore.com.br/ebook)                          ├─→ Página de vendas → Checkout Kiwify (R$47)
Tráfego pago (FASE 2, com guardrails Meta)             ─┘        ├─ Order bump: Kit de Operação (R$27)
                                                                  └─ (Upsell 1-click: só quando o curso existir)
                                                         → Comprador entra na régua → demo AffiliaCore (fim de funil SaaS)
```

**Decisão de upsell:** lançar **sem upsell** (o curso não existe; não prometer o que não está gravado). O bump carrega o ticket médio no dia 1. Quando o curso sair, liga-se o upsell 1-click (Kiwify suporta com cartão E Pix).

## Fases e donos

### Fase 0 — Assets (EU · este commit) ✅
- [x] Calculadora de comissão `.xlsx` real (6 abas com fórmulas) — peça central do bump → `bump/calculadora-comissao-v1.xlsx`
- [x] Checklist de compliance de peça publicitária → `bump/checklist-compliance-peca.md` (virar PDF na diagramação)
- [x] Modelo de contrato de sub-afiliado → `bump/modelo-contrato-subafiliado.md` (com aviso "revisar com advogado")
- [x] Copy completa da página de vendas → `COPY-LP.md`
- [x] Runbook Kiwify passo a passo → `KIWIFY-SETUP.md`

### Fase 1 — Plataforma (OPERADOR com o runbook; ~1h)
- [ ] Criar conta Kiwify (CPF/CNPJ + dados bancários — só você pode)
- [ ] Configurar produto + bump + checkout seguindo `KIWIFY-SETUP.md`
- [ ] Compra-teste real (cartão próprio) e reembolso — validar entrega + DRM + e-mails

### Fase 2 — Página de vendas (EU, após a Fase 1 me dar o link do checkout)
- [ ] Rota `/ebook` na landing affiliacore.com.br (projeto Firebase `affiliacore`, deploy `--config firebase.affiliacore.json --project www`) com a copy de `COPY-LP.md`
- [ ] Evento GA4/GTM `ebook_checkout_click` (stack já montado — skill `/web-analytics`)
- [ ] SEO on-page (title/meta/OG) — mesmo padrão da landing

### Fase 3 — Lançamento orgânico (EU preparo, OPERADOR aprova/publica)
Custo zero, canais que já existem:
- [ ] Série de 3–4 posts IG/FB via skill `/social-posts` (ângulo anti-guru; **sem termos de aposta nos criativos** — ver guardrails)
- [ ] E-mail/mensagem aos **leads já captados** na LP (Firestore do projeto affiliacore) — texto pronto em `COPY-LP.md` §e-mail
- [ ] DM para os leads quentes do IG (Eric e César — César é ICP exato) — oferta de cortesia ou pré-preço de fundador
- [ ] Bio do IG: link da página /ebook

### Fase 4 — Tráfego pago (DEPOIS de validar orgânico; EU + skill /meta-ads)
- [ ] Campanha pequena (R$10–20/dia) na BM existente OU BM/domínio apartados (recomendação da pesquisa se escalar)
- [ ] Guardrails abaixo obrigatórios; se reprovar 2×, parar e re-enquadrar (não insistir — risco de conta)

## Guardrails Meta (da PESQUISA.md §1.5 — LER ANTES de qualquer anúncio)

1. Criativo e página de destino do ANÚNCIO sem termos de aposta/bet/cassino — enquadrar como "**monte sua agência de marketing de performance em um mercado regulamentado**";
2. **O título "Agência, não aposta" contém "aposta"** → em anúncio, usar a variante de headline sem a palavra (ex.: "Monte sua agência de afiliados — o guia institucional AffiliaCore"). A capa do produto pode manter o título; o anúncio não;
3. A LP `/ebook` linkada em anúncio não deve linkar diretamente para casas/operadores (não linka mesmo — só checkout);
4. Não usar público lookalike de apostadores; público = empreendedores/marketing digital 25–44;
5. Registro: a política da Meta não tem exceção educacional escrita; o teste pequeno É o teste de política. Orçamento de teste é custo de pesquisa.

## Preço e metas (benchmarks da pesquisa)

| Item | Valor | Nota |
|---|---|---|
| Ebook | **R$ 47** | Taxa Kiwify 8,99%+R$2,49 → recebe ~R$ 40,28 |
| Bump "Kit de Operação" | **R$ 27** | Take esperado 30–40% dos compradores |
| Ticket médio esperado | ~R$ 56 | 47 + 27×0,33 |
| Conversão página (frio) | 1–3% | Orgânico/warm deve superar |
| Meta do 1º mês (validação) | 50 vendas | ≈ R$ 2,3–2,8 mil — o objetivo é validar funil e colher depoimentos, não caixa |

## Antes de escalar (checklist pré-lançamento — PESQUISA.md §7)
- [ ] Título final decidido (3 opções em `../rascunho/00-abertura.md`)
- [ ] Revisão Vinicius/Carlos do rascunho (em espera — texto congelado por decisão)
- [ ] Confirmar Anexo X CONAR + Portaria 1.964/2026 na íntegra (citações do cap. 3)
- [ ] Diagramar PDF (com DRM Social da Kiwify por cima)
- [ ] Compra-teste + reembolso OK
