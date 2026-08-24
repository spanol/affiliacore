# Série 4 · "O painel que o cliente construiu" (vídeos, ago–set/2026)

Ideação de 2026-08-24. Eixo: **o produto evoluiu em cima de uma operação real**
(Infinity, 1º cliente pagante, contrato 30/07). O feed está com material de
julho: os 3 reels "Por dentro do painel" (24–26/07) e os posts estáticos da
série 3 (06 a 11/08) mostram um painel que já não é o de hoje. Esta série
**substitui a vitrine**, não a complementa.

## O que mudou desde o material que está no ar (o inventário)

Entre 12/08 e 22/08 entraram, quase tudo por pedido da Infinity:

| Entregue | O que é | Onde se vê na demo |
|---|---|---|
| Loja de acordos | o afiliado pede a casa pela vitrine, sem WhatsApp | `/acordos`, `/parcerias`, `/meus-links` |
| Deal gerenciado | o gerente precifica o filho e o CPA da agência fica invisível | fila do gerente em `/parcerias` |
| Comissão do sub por casa | a taxa do sub deixou de ser "o contrato inteiro" | `/network/afiliados` com casa filtrada |
| Câmbio de verdade | casa em EUR/USD, repasse em R$, cotação ao vivo ou fixa, congelada na aprovação | modal de `/casas` e de `/acordos` |
| Vigência de taxa | mudar a comissão não reprecifica o que já foi gerado | carteira por janela |
| Integrações | resultado da casa entra sozinho (pull e postback) | `/integracoes` + botão Atualizar em `/casas` |
| Saque por casa | o afiliado saca uma casa por vez e o admin vê qual é | `/financeiro`, `/saques` |
| Conquistas | meta de faturamento vira placa e pedido de prêmio | `/conquistas` |
| Saúde da configuração | o painel diz o que falta configurar | card do `/admin` |
| Presets de casa | 31 casas com a logo oficial, cadastro em segundos | grade de `/casas` |
| Captação | solicitação de cadastro com 3 origens, incluindo indicação do gerente | `/solicitacoes` |
| KPIs de qualidade | NET/PL por afiliado, gated por casa | `/afiliados/:id` |

## Formato (o que mudou na produção)

O kit de vídeo virou pipeline: `marketing/video-tools/capture-scenes.mjs`
(puppeteer, cenas coreografadas na demo emulada) + `generator/gen-video-frames.mjs`
(moldura por marca, resvg) + a receita ffmpeg do `brand-reels`. Gravar uma cena
nova custa minutos, não uma tarde.

**Dois formatos nesta série:**

- **A · Módulo em 25s** (5 dos 8 vídeos). Moldura ember, janela 1024×576,
  título e bullets por cena, 1 a 3 cenas. É o formato dos reels de julho, agora
  com cenas mais curtas e texto grande na tela.
- **B · "Pediram, entregamos" em 15s** (3 dos 8). Abre com o pedido escrito em
  tela cheia (cartão de texto, sem screencast) e corta para a tela que resolve.
  É o formato da prova social sem depoimento gravado.

**Áudio (decidido em 24/08): as DUAS saídas por vídeo.** O dado medido nesta
conta é duro: reel com trending audio publicado pelo app do IG fez 194 alcance /
265 views; reel mudo agendado pelo MBS fez 3 / 6. Então o arquivo do FEED sai
mudo, com texto grande na tela, para receber o trending audio no app na hora de
publicar; e um segundo arquivo, NARRADO, fica para onboarding, WhatsApp e pitch.
Publicação do IG segue manual pelo app; o FB entra pelo MBS como higiene de marca.

**Prova social (decidido em 24/08): sem nome.** O formato B fala em "pedido real
de cliente". Nomear a Infinity exige um ok novo do Maurício e pode virar um vídeo
próprio depois.

## Calendário (2×/semana, ter e sex, 12h)

| # | Data | Formato | Vídeo |
|---|------|---------|-------|
| V1 | ter 25/08 | A | A loja de acordos |
| V2 | sex 28/08 | B | O CPA que o afiliado não vê |
| V3 | ter 01/09 | A | O resultado da casa entra sozinho |
| V4 | sex 04/09 | B | A comissão do sub, casa a casa |
| V5 | ter 08/09 | A | Casa em euro, repasse em real |
| V6 | sex 11/09 | A | A carteira e o saque por casa |
| V7 | ter 15/09 | B | O painel avisa o que falta |
| V8 | sex 18/09 | A | A mesma plataforma, a marca de cada agência |

---

## V1 · A loja de acordos (25s, formato A)

**Gancho (0-2s, tela cheia):** "Seu afiliado quer entrar numa casa nova. Ele te
chama no WhatsApp?"

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/parcerias` (afiliado) | vitrine de casas, afiliado solicita uma | Ele pede pela vitrine |
| 2 | `/acordos` (admin) | solicitação chega, admin aprova com a taxa | Você aprova com a taxa |
| 3 | `/meus-links` (afiliado) | link já com a tag, termos do acordo no cartão | O link sai pronto |

**Legenda:**
> A conversa "consegue um link da casa X pra mim?" virava trinta mensagens e um
> link perdido no chat.
> Agora o afiliado pede pela vitrine, você aprova com a taxa que quiser e o link
> sai com a tag dele, junto dos termos do acordo: baseline, rollover, meta e
> ciclo.
> Tudo dentro do painel, com registro.
> Ambiente de demonstração, dados fictícios.

## V2 · O CPA que o afiliado não vê (15s, formato B)

**Cartão de abertura (0-4s):** "Pedido real de cliente: o gerente precisa
precificar o time dele sem ver quanto a agência ganha."

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/parcerias` (gerente) | fila "aguardando preço", gerente define a comissão do filho | O gerente precifica |
| 2 | `/meus-links` (afiliado) | cartão do acordo sem o CPA da agência | O afiliado vê o dele |

**Legenda:**
> Numa rede com gerente, quem precifica o afiliado é o gerente. Só que o CPA da
> agência não pode aparecer para ninguém no meio do caminho.
> Isso virou um tipo de acordo dentro da plataforma: o gerente define a comissão
> do filho direto, o afiliado enxerga só a dele e o link é emitido pela agência.
> Quem esconde o número é o servidor, não a tela.
> Ambiente de demonstração, dados fictícios.

## V3 · O resultado da casa entra sozinho (25s, formato A)

**Gancho:** "Quantas planilhas você abriu hoje?"

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/casas` | grade de casas, botão Atualizar numa casa integrada | A casa integrada atualiza |
| 2 | `/integracoes` | conector ligado, chave mascarada, última sincronização | Chave guardada no servidor |
| 3 | `/admin` | números do dia já refletindo a produção | O painel já tem o número |

**Legenda:**
> Casa integrada não pede planilha. O painel puxa o resultado no horário, ou
> recebe o evento da rede por postback, e o número já entra no lucro por casa.
> A chave de API fica no servidor, mascarada, e nunca volta para o navegador.
> Para a casa que ainda não tem API, o import por planilha continua ali.
> Ambiente de demonstração, dados fictícios.

## V4 · A comissão do sub, casa a casa (15s, formato B)

**Cartão de abertura:** "Pedido real de cliente: mexer na taxa de uma casa sem
mexer no contrato inteiro."

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/network/afiliados` | lista sem casa filtrada, sem colunas de taxa | Sem casa, sem preço |
| 2 | a mesma tela, com casa filtrada | colunas de CPA e REV daquela casa, edição inline | Preço por casa |

**Legenda:**
> Antes, mudar a comissão de um afiliado da equipe reprecificava todas as casas
> dele de uma vez. Um gesto no topo da tela e o repasse inteiro mudava.
> Agora a comissão do sub é por casa: escolha a casa, ajuste CPA e REV, e o
> resto do contrato dele fica exatamente onde estava.
> Ambiente de demonstração, dados fictícios.

## V5 · Casa em euro, repasse em real (25s, formato A)

**Gancho:** "A casa paga em euro. O seu afiliado recebe em real. Quem faz a
conta?"

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/casas` (modal) | moeda da casa, cotação ao vivo ou fixa | Escolha a moeda |
| 2 | `/acordos` | acordo em EUR, conversão exibida antes de aprovar | Veja em real antes |
| 3 | `/financeiro` (afiliado) | carteira em R$ | Ele recebe em real |

**Legenda:**
> Casa internacional fecha em euro ou dólar. O afiliado saca em real. No meio
> disso tem uma cotação, e cotação errada é dinheiro errado com cara de certo.
> A plataforma converte na hora de aprovar o acordo e congela a cotação usada:
> a receita da casa continua flutuando, o repasse já concedido não.
> Ao vivo ou com a cotação que você digitar. É escolha da agência.
> Ambiente de demonstração, dados fictícios.

## V6 · A carteira e o saque por casa (25s, formato A)

**Gancho:** "Onde seu afiliado vê quanto tem para receber?"

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/financeiro` (afiliado) | a receber, pendente, aprovado, pago, filtro por casa | A carteira dele |
| 2 | `/financeiro` | pedido de saque de uma casa, PIX | Saque por casa |
| 3 | `/saques` (admin) | fila com a casa explícita, aprovação | Você aprova com contexto |

**Legenda:**
> A pergunta "quanto eu tenho para receber?" é a que mais chega no suporte de
> uma agência.
> Na carteira o afiliado vê por casa: o que está a receber, o que está pendente,
> o que já foi aprovado e o que foi pago. Pede o saque de uma casa por vez, com
> PIX e nota fiscal.
> Do outro lado, a fila de saques chega com a casa escrita, não adivinhada.
> Ambiente de demonstração, dados fictícios.

## V7 · O painel avisa o que falta (15s, formato B)

**Cartão de abertura:** "Painel novo, tudo zerado. Por onde começa?"

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/admin` | card Saúde da configuração, itens pendentes | O painel te diz |
| 2 | `/casas` | grade de presets, casa cadastrada com a logo oficial | Casa em segundos |

**Legenda:**
> Ninguém quer receber um sistema vazio e um manual de trinta páginas.
> O painel mostra o que ainda falta configurar: casa sem taxa, afiliado sem
> comissão, convite parado, conector sem chave. Cada aviso leva para a tela que
> resolve.
> E cadastrar casa é escolher na grade: as casas licenciadas já vêm com a logo
> oficial.
> Ambiente de demonstração, dados fictícios.

## V8 · A mesma plataforma, a marca de cada agência (25s, formato A)

**Gancho:** "Este é o mesmo painel. Duas vezes."

| Cena | Rota | O que aparece | Texto na moldura |
|---|---|---|---|
| 1 | `/` e `/login` (marca A) | landing e login na marca AffiliaCore | Uma marca |
| 2 | `/admin` (marca B, preview 3124) | o mesmo painel na identidade do cliente | Outra marca |
| 3 | `/client` (marca B) | domínio próprio do cliente no cabeçalho | O domínio é seu |

**Legenda:**
> Este é o mesmo painel, rodando duas vezes, com duas marcas.
> Sua agência entra com o nome, a cor e o domínio dela. O afiliado acessa o
> painel da sua agência, não o de um fornecedor.
> Cada instância tem o banco dela. Nada é compartilhado entre agências.
> Ambiente de demonstração, dados fictícios.

---

## V1 ENTREGUE (24/08)

Arquivos em `marketing/affiliacore/video/serie4/`:

- `s4-v1-loja-de-acordos.mp4` — 32s, 1080×1920, h264/30fps, **sem áudio**. É o
  arquivo do feed: sobe pelo app do IG com trending audio.
- `s4-v1-loja-de-acordos-narrado.mp4` — o mesmo vídeo com locução. A voz é a
  **sintética do Windows (Maria, pt-BR), em rascunho**: serve para WhatsApp e
  para aprovar o texto, e vale trocar por uma gravação sua mantendo os nomes dos
  WAVs em `narracao/`.
- `s4-v1-loja-de-acordos-capa.png` — capa (o cartão de gancho).
- `s4-v1-{hook,1,2,3,cta}.png` — as molduras, e `raw/` com os screencasts (fora
  do git, como no kit de apresentação).

Montagem: gancho 2,6s → vitrine do afiliado 8,7s → fila da agência 9,5s →
Meus Links 7,6s → cartão de marca 3,6s. As cenas são reais, gravadas em sequência
na demo: o pedido que a agência aprova na cena 2 é o que o afiliado fez na cena 1.

Ferramentas novas (as três valem para os próximos vídeos, é só acrescentar a
entrada em `VIDEOS`):

| Script | O que faz |
|---|---|
| `marketing/affiliacore/generator/gen-serie4-frames.mjs` | molduras da série, incluindo os cartões de tela cheia |
| `marketing/video-tools/capture-serie4.mjs` | coreografia das cenas na demo (uma persona por contexto do browser) |
| `marketing/video-tools/compose-serie4.mjs` | cartões + cenas emolduradas + concat, com `zoom` por cena |
| `marketing/video-tools/narrate-serie4.mjs` | encaixa as falas datadas nas janelas das cenas e muxa a versão narrada |

### Gotchas medidos nesta gravação (custaram três tomadas)

- **`evaluateOnNewDocument` roda antes de existir `documentElement`**, e
  `observer.observe(null)` LANÇA. A exceção aborta o script de inicialização
  inteiro em silêncio, então nada da limpeza roda. Observe o `document` e
  registre o `setInterval` ANTES do observer. O `capture-scenes.mjs` dos vídeos
  de apresentação tem o mesmo trecho e portanto a mesma falha latente.
- **O banner "Nova versão disponível" aparece no meio da cena** (o dev regera o
  `version.json` com a aba aberta). Remover o nó não resolve, o React o repõe:
  quem esconde é uma regra CSS (`[role="alert"].bottom-4`). Os toasts, que também
  são `role="alert"`, precisam continuar visíveis, e continuam.
- **O link da demo sai como `127.0.0.1:3123`.** Na gravação ele é reescrito para
  `app.suaagencia.com.br`, que é o que o afiliado de uma instância real vê.
- **`/acordos` tem ABAS** (Acordos · Solicitações · Aguardando link): a fila de
  aprovação não está na rolagem, está na aba "Solicitações".
- **A captura 1280×720 dentro da janela 1024×576 fica pequena no celular.** Cada
  cena leva `zoom` (recorte antes do scale); `1080:608:190:96` tira a sidebar e
  mantém a coluna da direita inteira.
- A voz sintética fala mais devagar que a leitura calibrada de 2,5 palavras por
  segundo. O `narrate-serie4.mjs` encaixa com `atempo` e avisa quando a fala não
  cabe: aí o certo é encurtar o texto, não espremer mais a voz.

## Produção (o passo a passo por vídeo)

1. `DEMO_FULL=1 npm run dev` (demo gigante nos emuladores, 3123). O V8 precisa
   também de uma 2ª marca: um `.cmd` de preview no padrão do da Infinity.
2. Estender `marketing/video-tools/capture-scenes.mjs` com as cenas novas
   (`/parcerias`, `/acordos`, `/casas`, `/integracoes`, `/saques`, `/solicitacoes`).
   Regra medida: trocar de rota no meio de uma gravação só por clique SPA na
   sidebar, senão pisca branco.
3. Molduras: `node marketing/affiliacore/generator/gen-video-frames.mjs` com os
   títulos desta série (hoje o arquivo tem os títulos dos vídeos de apresentação).
4. Composição: receita do `brand-reels` (SPEED=1.25, WIN=28,640,1024×576,
   BG=0x11070a) e concat das cenas. Capa = 1º frame.
5. FB pelo MBS (agendado); IG pelo app do operador, com trending audio.

## Guardrails

- Todo número em tela é da demo. A moldura declara "dados fictícios".
- Sem promessa de renda e sem casa ou operadora como recomendação de aposta. O
  produto é software de gestão white-label.
- **Citar a Infinity nominalmente exige um ok novo do Maurício.** O formato B
  desta série está escrito como "pedido real de cliente", sem nome, justamente
  para não depender disso. Com o ok, o V2 e o V4 podem nomear.
- Publicação imediata nunca. O padrão é agendar.

## Higiene do feed (ação do operador)

Os 3 reels de julho e os posts da série 3 mostram telas anteriores. Ao publicar
o V1, desafixar os reels antigos do topo do perfil e fixar V1, V3 e V8 (o trio
que melhor resume o produto hoje). Os antigos podem ficar no feed, só não na
vitrine.
