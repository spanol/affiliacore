---
name: web-analytics
description: Fatos e IDs do stack de analytics/SEO da landing AffiliaCore (affiliacore.com.br) — Search Console, GTM, GA4, evento de lead e como verificar. Use ao mexer em SEO, analytics, tags ou medição de conversão da landing.
---

# Analytics & SEO da landing AffiliaCore (estado 2026-07-14)

As TÉCNICAS genéricas vivem nas skills user-level `/search-console` e
`/tagmanager`. Aqui são os FATOS desta instalação.

## Search Console

- Propriedade de DOMÍNIO `affiliacore.com.br`, verificada 14/07/2026 via TXT
  na GoDaddy (conta GoDaddy do VINICIUS — a do Carlos NÃO tem esse domínio;
  GoDaddy = 1 sessão por browser, conferir o avatar VS/CS).
- TXT: `google-site-verification=RoazIuo03vLSmNO76hNjJuzIqGAV6ey25Jzne9vmjvc`
  (host `@`; NÃO remover — a verificação depende dele).
- Sitemap `https://affiliacore.com.br/sitemap.xml` submetido → "Processado",
  1 página. robots.txt e sitemap.xml vivem em `landing/` (deploy junto).
- Indexação da home solicitada 14/07 (fila prioritária).
- Conta Google: viniciusspanol@gmail.com.

## GTM + GA4

- **Container GTM: `GTM-TDL8RHWQ`** (conta GTM "AffiliaCore", container
  "affiliacore.com.br"; account id 6366077357, container id 258314601).
  Versão 2 (14/07/2026): Tag do Google + evento lead_submit.
  **Versão 3 (23/07/2026): + evento ebook_checkout_click.**
- **GA4: conta "AffiliaCore" → propriedade "affiliacore.com.br"** · fluxo
  "Site AffiliaCore" (id 15257100200) · **Measurement ID `G-X5572SJY82`** ·
  fuso São Paulo · moeda BRL · métrica otimizada ON.
- Snippet GTM em `landing/index.html`: script no head (após meta charset) +
  noscript após `<body>`.
- **Evento de conversão `lead_submit`**: dataLayer.push no sucesso do form
  de leads (landing/index.html, handler do fetch ao Firestore). No GTM: tag
  "GA4 - lead_submit" + acionador "Evento lead_submit" (evento personalizado).
- **Evento `ebook_checkout_click`**: dataLayer.push no clique de qualquer CTA
  de compra da `/ebook` (`landing/ebook.html`, listener nos `a.js-checkout` →
  checkout Kiwify `pay.kiwify.com.br/83JFB9e`). No GTM: tag
  "GA4 - ebook_checkout_click" + acionador "Evento ebook_checkout_click"
  (evento personalizado). E2E verificado 23/07 (collect `en=ebook_checkout_click`
  com `tid=G-X5572SJY82`). Padrão idêntico ao lead_submit — replicar p/ novos
  eventos. A `/ebook` carrega o MESMO container/GA4 da home (funil unificado).
- A home (`index.html`) linka a `/ebook` (nav "Guia" + rodapé).
- Deploy da landing: `firebase deploy --config firebase.affiliacore.json
  --project www --only hosting`.

## Verificação rápida (E2E)

1. `curl -s https://affiliacore.com.br/ | grep -c GTM-TDL8RHWQ` → 2.
2. No browser (recarregar após ligar o tracking): network tem
   `gtm.js?id=GTM-TDL8RHWQ` 200, `gtag/js?id=G-X5572SJY82` 200 e
   `g/collect …en=page_view` com `tid=G-X5572SJY82`.
3. Conversão: enviar o form de lead (CUIDADO: grava lead real no Firestore
   `affiliacore` — apagar depois: `firebase firestore:delete leads -r -f
   --project www` apaga TODOS; preferir apagar o doc no console) e ver
   `en=lead_submit` no collect / evento no Realtime do GA4.

## Pendências conhecidas

- Aviso do stream GA4 "coleta não ativa" some sozinho após as primeiras
  visitas processarem (~24h).
- Link na bio do @affiliacore.br (app do celular) → affiliacore.com.br.
