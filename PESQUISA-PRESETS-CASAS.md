# Pesquisa: presets de ícone das casas de aposta (rota `/casas`)

> 2026-07-28. Pergunta: quais são as casas de aposta **mais conhecidas e
> regulamentadas** no Brasil, e como dar a cada uma um ícone pronto em `/casas` sem
> depender de o admin ter a logo em disco? Irmã de `PESQUISA-PRESETS-DEALS.md`
> (presets de *acordo*) — esta cuida do preset de *identidade visual*.

## TL;DR

1. **26 casas** entraram no catálogo (`src/lib/housePresets.ts`), todas com
   autorização confirmada do **SPA/MF** e domínio `.bet.br`.
2. **As cores não foram escolhidas a olho.** Cada uma foi **medida na fonte oficial
   da própria casa** em 28/07/2026 — logo/favicon decodificada pixel a pixel, ou o
   `theme-color` que o site `.bet.br` declara. O campo `colorSource` registra o
   método usado em cada linha (§3).
3. **O ícone do preset NÃO é a logo oficial.** É uma marca autoral (monograma sobre a
   cor da casa), justamente pra não versionar marca registrada de terceiro no repo.
   Para quem quiser a logo real, cada preset carrega a URL oficial — baixa e sobe
   pelo upload que já existe no modal.
4. **Zero mudança no servidor.** O preset vira um data URL `image/svg+xml;base64` e
   entra pelo MESMO `uploadHouseLogo` que o upload manual já usa.
5. **4 casas conhecidas ficaram DE FORA de propósito** por não confirmarem
   autorização nesta coleta (§4) — inclusive duas que patrocinam clube da Série A.

## 1. Critério de seleção

"Mais famosas e regulamentadas" virou dois filtros que a casa tem que passar nos dois:

**a) Regulamentada** — constar na lista de empresas autorizadas a operar apostas de
quota fixa da **Secretaria de Prêmios e Apostas (SPA/MF)**, sob a Lei 14.790/2023.
Desde 01/01/2025 só a autorizada pode operar, e só ela recebe o domínio `.bet.br`.
Registramos a **empresa detentora** e o **número da portaria** de cada marca.

**b) Famosa** — dois sinais somados:
- **Patrocínio máster na Série A 2026** (12 clubes têm bet no peito): Betano
  (Flamengo, R$ 268 mi/ano), Superbet (Fluminense e São Paulo), Sportingbet
  (Palmeiras), Betnacional (Cruzeiro), Esportes da Sorte (Corinthians), Bet7k
  (Vitória), H2bet (Atlético-MG), Vbet (Botafogo), Viva Sorte (Athletico).
- **Já citada nas docs do projeto**: Superbet e SportingBet (casas-semente da OTG em
  `brand.ts`), Betano, KTO, bet365, Betfair, EstrelaBet e Brazino777
  (`PESQUISA-PRESETS-DEALS.md`), Stake e Esportiva Bet (`MIGRACAO-INFINITY-LEGADO.md`).

Rankings do tipo "as 20 melhores casas" foram **descartados como fonte**: quase todos
são `conteudo-publicitario` de afiliado, então ordenam por comissão, não por porte.

## 2. Método de medição da cor

O objetivo era a **cor de marca real**, não um chute. Três técnicas, em ordem de
confiança, todas contra o site oficial `.bet.br` da casa:

| `colorSource` | Como foi obtido | Confiança |
|---|---|---|
| `logo-oficial` | Logo/favicon oficial **decodificada pixel a pixel** (PNG via `zlib` + de-filtro de scanline; ICO via BMP BGRA), descartando transparente/branco/preto/cinza e tomando o tom saturado dominante | Alta — é a cor da arte |
| `theme-color` | `<meta name="theme-color">` ou `theme_color` do web manifest, **declarado pela própria casa** | Alta p/ a UI, média p/ a marca |
| `css-oficial` | Cor hex mais frequente no HTML/CSS servido pelo site oficial | Média |

Duas medições **cruzaram sozinhas** e serviram de controle: Betano deu `#ff3c00` tanto
no CSS quanto no `apple-icon`, e KTO deu `#da0000` no CSS e no favicon 300px. Superbet
e Sportingbet foram medidas nas logos **oficiais que o repo já hospeda**
(`public/brands/*.png`, baixadas do bucket da OTG).

Onde a casa declara um **par** de cores próprio (bet365 verde+amarelo, Betnacional
navy+dourado, BetMGM preto+dourado, Blaze escuro+vermelho), o par foi preservado:
fundo = `color`, monograma = `accent`. Sem par declarado, o monograma é o
branco/quase-preto de **maior contraste medido** sobre o fundo.

## 3. O catálogo (26 casas)

Ordenado por notoriedade no BR — é a ordem em que aparecem na grade do seletor.

| # | Casa | Cor | Origem da cor | Empresa autorizada | Portaria SPA/MF | Domínio |
|---|---|---|---|---|---|---|
| 1 | Betano | `#ff3c00` | logo-oficial | Kaizen Gaming Brasil LTDA | 246, 07/02/2025 | betano.bet.br |
| 2 | Superbet | `#fd0104` | logo-oficial | SPRBT Interactive Brasil LTDA | 2.090, 30/12/2024 | superbet.bet.br |
| 3 | Sportingbet | `#003dc4` | logo-oficial | Ventmear Brasil S.A. | 247, 07/02/2025 | sportingbet.bet.br |
| 4 | bet365 | `#126e51` + `#ffdf1b` | logo-oficial | HS do Brasil LTDA | 250, 07/02/2025 | bet365.bet.br |
| 5 | Betfair | `#ffb80c` | css-oficial | NSX Betfair Brasil S.A. | 2.291, 09/10/2025 | betfair.bet.br |
| 6 | Betnacional | `#131e32` + `#ebbd54` | logo-oficial | NSX Brasil S.A. | 1.814, 15/08/2025 | betnacional.bet.br |
| 7 | KTO | `#da0000` | logo-oficial | Apollo Operations LTDA | 2.093, 30/12/2024 | kto.bet.br |
| 8 | Esportes da Sorte | `#38e67d` | logo-oficial | Esportes Gaming Brasil LTDA | 1.559, 18/07/2025 | esportesdasorte.bet.br |
| 9 | EstrelaBet | `#ffd700` | css-oficial | EB Intermediacoes e Jogos S.A. | 1.762, 13/08/2025 | estrelabet.bet.br |
| 10 | Brazino777 | `#035d03` | logo-oficial | Futuras Apostas LTDA | 466, 10/03/2025 | brazino777.bet.br |
| 11 | Stake | `#1a2c38` | theme-color | Stake Brazil LTDA | 263, 07/02/2025 | stake.bet.br |
| 12 | Bet7k | `#a1cd3d` | css-oficial | Ana Gaming Brasil S.A. | 1.056, 14/05/2025 | 7k.bet.br |
| 13 | 7Games | `#1b1b1b` + `#f5d76e` | css-oficial | OIG Gaming Brazil LTDA | 2.096, 30/12/2024 | 7games.bet.br |
| 14 | Vbet | `#d80d83` | logo-oficial | SC Operating Brazil LTDA | 254, 07/02/2025 | vbet.bet.br |
| 15 | H2bet | `#77148e` + `#24cfa4` | css-oficial | H2 Licensed LTDA | 253, 07/02/2025 | h2.bet.br |
| 16 | Viva Sorte | `#ff7912` | css-oficial | Jogo Principal LTDA | 262, 18/02/2025 | vivasorte.bet.br |
| 17 | Novibet | `#0a1324` + `#29a8ac` | theme-color | NVBT Gaming LTDA | 249, 07/02/2025 | novibet.bet.br |
| 18 | Pixbet | `#ccff00` | theme-color | Pixbet Soluções Tecnológicas LTDA | 2.326, 14/10/2025 | pixbet.bet.br |
| 19 | Blaze | `#131521` + `#e60026` | theme-color | Foggo Entertainment LTDA | 471, 10/03/2025 | blaze.bet.br |
| 20 | Betsson | `#ff6600` | theme-color | Simulcasting Brasil Som e Imagem S.A. | 371, 24/02/2025 | betsson.bet.br |
| 21 | F12.Bet | `#58cc02` | theme-color | F12 do Brasil Jogos Eletrônicos LTDA | 1.423, 30/06/2025 | f12.bet.br |
| 22 | Aposta Ganha | `#ff3d00` | css-oficial | Aposta Ganha Loterias LTDA | 807, 23/03/2026 | apostaganha.bet.br |
| 23 | BR4BET | `#12b530` | theme-color | Sabiá Administração LTDA | 399, 24/02/2025 | br4.bet.br |
| 24 | BetMGM | `#0b0b0b` + `#b19661` | logo-oficial | Boa Lion S.A. | 2.098, 30/12/2024 | betmgm.bet.br |
| 25 | Lotogreen | `#1dbf24` | theme-color | Sabiá Administração LTDA | 399, 24/02/2025 | lotogreen.bet.br |
| 26 | MC Games | `#171d25` + `#f4b942` | theme-color | Sistema Lotérico de Pernambuco LTDA | 2.007, 09/09/2025 | mcgames.bet.br |

> **BR4BET e Lotogreen dividem a mesma portaria** (399) porque são duas marcas da
> mesma autorizada, a Sabiá Administração. A autorização é da EMPRESA, não da marca —
> por isso o catálogo guarda `legalEntity` além do nome comercial.

## 4. Casas conhecidas que ficaram DE FORA (e por quê)

Estas apareceram na triagem de notoriedade mas **não passaram no filtro de licença**
nesta coleta. Não estão no catálogo — mas o admin segue livre pra criar a casa à mão.

| Casa | Motivo | Observação |
|---|---|---|
| **Vaidebet** | Não localizada na lista de autorizadas | Patrocina o Remo na Série A 2026 |
| **Bet da Sorte** | Não localizada na lista consultada | Mas tem `.bet.br` no ar e aparece como autorizada em outra fonte — provável divergência de grafia acentuada ("BETdáSorte"); **reconferir no CSV oficial** |
| **Zeroum** | Opera por **decisão judicial**, não por autorização administrativa | Patrocina a Chapecoense |
| **Multibet** | Autorizada (portaria 525, 14/03/2025), mas **o site não respondeu à sondagem** — sem cor medida | Entra assim que a cor for medida |
| **Esportiva Bet** | Autorização não conferida **e** o favicon do site vem corrompido na origem (byte da assinatura PNG trocado por caractere de substituição UTF-8) | É a casa real da Infinity (`MIGRACAO-INFINITY-LEGADO.md`); só declara `theme-color: #323637`, uma cor de chrome, não de marca |

**Regra de manutenção:** só entra no catálogo quem tem os dois — licença confirmada e
cor medida na fonte oficial. Sem isso, o preset estaria afirmando algo que não foi
verificado.

### Casamento casa↔preset (apelidos e versões)

A agência batiza a casa como quiser no cadastro, então o casamento normaliza acento,
caixa e separador: `"Esportes da Sorte"`, `"esportes-da-sorte"` e `"EsportesDaSorte"`
caem na mesma chave. Isso já resolve `"Super Bet"` → Superbet e `"Bet 365"` → bet365.

Duas tolerâncias além disso:
- **Sufixo de versão** (`v?<dígitos>` no fim): `"Super Bet V2"` → Superbet. É o padrão
  de painel legado (a Infinity chama assim), mesma casa em instância nova. Restrito a
  esse formato de propósito — aceitar qualquer sobra faria `"StakeBet"` virar Stake.
- **Apelidos declarados** (`aliases`), só pro que a normalização não pega: `"7k"` →
  Bet7k, `"Viva Sorte Bet"` → Viva Sorte.

Casamento **exato sempre vence** a tolerância de versão, pra um preset de nome curto
não sequestrar uma casa que já casa exatamente com outro.

## 4.1 Experimento: e se usássemos as logos OFICIAIS? (28/07/2026)

Coletei as logos oficiais das 26 casas (apple-touch-icon / favicon / og:image do
próprio site `.bet.br`) e montei a comparação lado a lado com o ícone autoral.
**O resultado contrariou a expectativa** — logo oficial não é uniformemente melhor:

**Coleta:** 21 de 26 vieram. Falharam **H2bet** e **Betsson** (nenhum candidato
válido), e **BR4BET, F12.Bet e Lotogreen** baixaram o **mesmo arquivo byte a byte**
(favicon genérico de plataforma, 4.286 b) — detectado por hash, descartado.

| Veredito | Casas | Por quê |
|---|---|---|
| **Oficial ganha** | Betano, Superbet, Sportingbet, KTO, Brazino777, Stake, Bet7k, 7Games, Vbet | Símbolo forte e legível a 40px; reconhecimento imediato |
| **Oficial perde** | bet365, Betfair, Esportes da Sorte, Betnacional, Novibet, BetMGM, Blaze | Marca abstrata que não se lê a 40px (seta da Betfair, "e" da Esportes da Sorte), ou arte escura que some no tema escuro |
| **Oficial inutilizável** | EstrelaBet | Só existe como banner 1200×630 — proporção errada pra ícone |
| **Sem logo** | H2bet, Betsson, BR4BET, F12.Bet, Lotogreen | Ver coleta acima |

**O achado que importa:** individualmente algumas logos oficiais são melhores, mas
**como conjunto elas não formam sistema** — proporções, respiro e fundo variam por
casa, e várias são transparentes desenhadas só pro tema escuro delas. Numa lista, o
que faz escanear rápido é a uniformidade (mesma silhueta, mesmo peso óptico), e é
justamente isso que o conjunto oficial não tem. O autoral perde em reconhecimento
individual e ganha em leitura de lista.

**Decisão (revista em 29/07):** o conjunto passou a ser **híbrido** — logo oficial
onde ela existe e serve, autoral no resto. O problema da falta de sistema foi
resolvido na MOLDURA, não descartando as logos: toda logo oficial é embutida na
**mesma caixa 64×64 com o mesmo raio** do ícone autoral, então a lista continua
uniforme mesmo misturando as duas origens. Ver §4.2.

## 4.2 O conjunto híbrido (13 oficiais + 13 autorais)

Cada logo oficial é normalizada (PNG RGBA, moldura transparente cortada) e embutida
no SVG do preset como data URI. Dois modos, decididos pela **cobertura opaca medida**
na própria arte:

- **`tile`** (≥90% opaca — a logo já traz fundo próprio): preenche a moldura e é
  recortada pelo raio. É o caso da maioria (Betano, Superbet, KTO...).
- **`inset`** (transparente): entra com respiro sobre um fundo, e **o fundo é
  escolhido por contraste medido**, igual à regra do monograma.

### Critérios objetivos para uma logo oficial ser aceita

Nada de "escolhi a olho". Uma logo coletada só vira ícone se passar em todos:

1. **Decodificável** — PNG não-interlaçado ou ICO. Reprovou **Blaze** (PNG Adam7) e
   **EstrelaBet** (WebP).
2. **≥ 64px no menor lado** — abaixo disso borra ao ampliar. Reprovou **bet365** (31px),
   **Vbet** (32px) e **Esportes da Sorte** (16px).
3. **Proporção ≤ 2:1** — wordmark deitado vira tarja fina num ícone quadrado.
   Reprovou **Aposta Ganha** (1976×782 ≈ 2,5:1).
4. **Contraste ≥ 3:1** entre a tinta média da logo e o fundo (mesmo piso WCAG do
   monograma). Reprovou **BetMGM**: 2,98:1 contra o preto da marca — e o único asset
   dele é arte **fotográfica** (um leão), que vira borrão a 36px. **Novibet** media
   1,26:1 contra o navy dela, mas 14,7:1 contra o branco → passou com fundo claro.

**Resultado:** 13 com logo oficial (Betano, Superbet, Sportingbet, Betnacional, KTO,
Brazino777, Stake, Bet7k, 7Games, Viva Sorte, Pixbet, MC Games, Novibet) e 13
autorais (bet365, Betfair, Esportes da Sorte, EstrelaBet, Vbet, H2bet, Blaze, Betsson,
F12.Bet, Aposta Ganha, BR4BET, BetMGM, Lotogreen).

As artes-fonte ficam em **`scripts/house-logos/<slug>.png`** (168 kB no total), fora
de `public/` porque são material do gerador — quem é servido é só o SVG final. Trocar
uma logo é substituir o PNG e rodar `npm run icons:casas`; o teste anti-drift cobre os
dois caminhos, e o gerador **falha alto** se um preset declarar `officialIcon` sem a
arte correspondente.

O `officialLogoUrl` também foi enriquecido no caminho: de 6 para **19 casas** com link
verificado, então "baixar a logo oficial" no seletor resolve mesmo pras autorais.

## 5. Como usar

**No app** — `/casas` → **Nova casa** → o bloco **"Usar um preset de casa"** abre com a
grade das 26. Clicar numa:
- preenche **nome** e **slug** canônicos (ao criar);
- carrega o **ícone** na cor da casa;
- mostra a **empresa autorizada + portaria**, um link pro site oficial e, quando
  existe, o link direto pra **baixar a logo oficial**.

Para usar a logo real em vez do ícone autoral: baixe pelo link e clique em
**"Trocar logo"** — o upload manual vence o preset.

**No repo** — os SVGs ficam em `public/brands/presets/<slug>.svg` (26 arquivos), então
dá pra usar em qualquer lugar (landing, material comercial) sem passar pelo app.

## 6. Arquitetura

- **Catálogo estático e versionado** em `src/lib/housePresets.ts` — mesmo padrão de
  `DEFAULT_BRANDS` (`brand.ts`) e a arquitetura que `PESQUISA-PRESETS-DEALS.md` §4.1
  já recomendava: é dado de PRODUTO (vale pra toda instância), não dado de tenant, e
  corrigir um número vira um commit em vez de migração em N projetos Firebase.
- **O ícone é gerado por função pura** (`buildHouseIconSvg`), não desenhado à mão.
  `scripts/gen-house-icons.ts` (`npm run icons:casas`) só materializa em disco o que a
  função produz, e **remove o SVG de casa retirada do catálogo**.
- **Teste anti-drift**: `housePresets.test.ts` compara byte a byte os arquivos em
  `public/brands/presets` com a saída do catálogo — mexer na cor e esquecer de regerar
  quebra o teste, não o visual em produção.
- **Contraste é invariante testado**, não estética: o monograma tem que ficar ≥ 3:1
  sobre o fundo (piso do WCAG AA pra texto grande). Foi o teste que pegou o Betsson
  (`#ff6600` com monograma branco dava 2.94:1) e motivou trocar o limiar fixo de
  luminância pela escolha por **maior contraste medido**, que se auto-corrige pra
  qualquer casa nova.
- **Largura do texto fixada** (`textLength` + `lengthAdjust`): o SVG é carregado em
  `<img>`, um documento isolado que não enxerga as webfonts da página. Sem fixar, um
  monograma de 3 letras vazaria da caixa em quem não tem a fonte da lista.
- **Zero mudança no backend**: o preset vira `data:image/svg+xml;base64,...`, que é
  exatamente o formato que `uploadHouseLogo` (`server.ts`) já aceita — o teste valida
  o data URL contra a **mesma regex do servidor**.

## 7. Manutenção

O catálogo é uma foto de **28/07/2026**. O que envelhece:
- **Licenças** — a lista do SPA/MF muda toda semana (autorização nova, suspensão).
  Fonte primária: <https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/lista-de-empresas>
  (PDF + XLSX, atualizada em 13/05/2026 na consulta).
- **Cores** — rebrand acontece (Brazino777 aparece hoje com verde `#035d03` no
  manifest e no favicon, mas ainda tinha vermelho `#671412` no CSS servido — sinal de
  rebrand em curso). Refazer a medição é barato: é curl + decodificar o favicon.

## Fontes

- Lista oficial de autorizadas (SPA/MF): https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/lista-de-empresas
- Consulta de empresas autorizadas (serviço gov.br): https://www.gov.br/pt-br/servicos/consultar-as-empresas-autorizadas-a-operar-apostas-de-quota-fixa
- Empresa detentora + portaria por marca: https://www.lance.com.br/sites-de-apostas/bets-autorizadas.html (consultada em 28/07/2026)
- Patrocínio máster Série A 2026: https://www.poder360.com.br/poder-sportsmkt/brasileirao-2026-tem-12-clubes-com-patrocinio-master-de-bets/ · https://istoedinheiro.com.br/brasileirao-bets-patrocinador
- Cores: medidas nos sites `.bet.br` de cada casa em 28/07/2026 (ver §2)
- Interno: `PESQUISA-PRESETS-DEALS.md` (padrão de preset com proveniência), `PESQUISA-INTEGRACAO-CASAS.md` (mapa casa→plataforma), `MIGRACAO-INFINITY-LEGADO.md` (casas reais da Infinity)
