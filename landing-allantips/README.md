# Landing Allan Tips (allantips.agencyboost.com.br)

One-pager estática da comunidade de apostas do cliente (Figma "Carlos Santos", página **LP**).
Mesmo padrão da LP AffiliaCore (`landing/` + `firebase.affiliacore.json`): pasta estática + site
próprio no Firebase Hosting, **separado do app** (App Hosting não é afetado).

## Conteúdo

- `index.html` — página completa (CSS e JS inline, sem build).
- `img/hero.png` — arte do hero exportada do Figma (1920×898, foto + glow + fundo em uma imagem).
- `img/texture-sports.png` — textura de fundo das dobras 1 e 3 (alpha ~9% já embutido no PNG).
- `fonts/outfit-var.woff2` — Outfit variável (100–900), subset latin (cobre pt-BR).

Tokens do design: laranja `#FF8A00` · azul CTA `#1A56FF` · verde `#00FF66` · ciano `#00F0FF`
· card `#0D162A` · fonte **Outfit** (400/700/900).

## Deploy

Site do Hosting no projeto `agencia-boost-app` (alias `default`):

```bash
# one-time: criar o site
firebase hosting:sites:create allantips --project default

# deploy
firebase deploy --config firebase.allantips.json --project default --only hosting
```

Sobe em `https://allantips.web.app`. O subdomínio `allantips.agencyboost.com.br` é conectado
pelo operador no console (Hosting → site `allantips` → Add custom domain) + registro DNS
(CNAME/A) na zona de `agencyboost.com.br`.

## Pendências

- [ ] **Prints reais da dobra 2** ("Bilhetes que viraram green"): os 3 cards são placeholders
      do próprio design. Quando o cliente mandar os prints, trocar o conteúdo de cada
      `.print-card` por um `<img>` (o carrossel já funciona com N slides).
- [ ] **Links legais do rodapé** (Termos de uso / Política de privacidade / Jogo responsável)
      apontam para `#` — criar as páginas ou apontar para os destinos do cliente.
- [ ] CTA aponta para `https://bit.ly/4b1lB5o` (definido em 2026-07-13). Trocar aqui se o grupo mudar.
