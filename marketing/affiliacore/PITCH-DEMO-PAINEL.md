# Pitch de demo do painel — 3 visões (master · afiliado · afiliado especial)

Roteiros para demonstração ao vivo (ou GIF gravado) usando a **demo nos
emuladores** (`.claude/skills/verify` → app em `http://localhost:3123`).
Números citados = seed de demo carregado em 22/07/2026; se re-seedar, os
valores mudam mas a narrativa se mantém. Senhas dos 3 logins: rode
`node scripts/provision/seed-demo.cjs --rotate` (imprime no console — nunca
commitar senha aqui).

GIFs gravados (22/07/2026, pasta Downloads do operador):
`pitch-1-master.gif` · `pitch-2-afiliado.gif` · `pitch-3-especial.gif`.

---

## Pitch 1 — Visão do MASTER (dono da agência) · ~90s

**Login:** `demo@affiliacore.com.br` → cai no `/admin`.

> "Essa é a visão de quem é dono da operação. Numa tela só: **133 afiliados**,
> **R$ 657 mil de comissão** no período, **R$ 1,47 milhão depositado** — e o
> número que planilha nenhuma te dá em tempo real: o **lucro líquido da
> agência, R$ 524 mil** — comissão recebida das casas menos o repasse aos
> afiliados, já calculado."

1. **Dashboard** — 4 cards do topo + funil da rede (8.624 cadastros → 3.660
   FTDs → 2.090 CPA qualificado). Filtro de **período** e de **casa** no topo:
   tudo na tela re-escopa junto (agregado sempre = soma dos cards).
2. **Desempenho por casa** — 6 casas (Superbet, Vai de Bet, KTO, BetMGM,
   Novibet, Betano), cada card com comissão da casa, **lucro líquido da casa**
   e repasse. *"Você enxerga qual casa te dá margem, não só volume."*
3. **Afiliados** (`/affiliates`) — a régua do negócio: **CPA e REV editáveis
   inline** por afiliado, chip "50 SEM CONFIGURAÇÃO" (ninguém fica com taxa
   fantasma — sem config ≠ R$ 0), ativar/desativar, busca, filtro por casa.
4. **Ranking** (`/ranking`) — ranking diário gerado pelo servidor, pódio com
   premiações (R$ 5k/2k/1k na demo). *"Gamificação que empurra a rede sem
   você mandar mensagem nenhuma."*
5. **Auditoria** (`/auditoria`) — trilha server-authoritative: quem alterou
   taxa (CPA 60 → 65), quem importou resultado, quem criou casa/afiliado —
   com autor e data. *"Governança para operação com dinheiro de verdade."*
6. **Casas** (`/casas`) — backoffice: casa nova + **import de resultados por
   planilha** sem depender de programador; casas OTG podem vir por API.
7. **Saques** (`/saques`) — fila com **R$ 129 mil pendentes** na demo:
   aprovar/rejeitar/pagar (PIX manual, sem gateway no meio). + **Acordos**
   (`/acordos`): deals por casa que viram links dos afiliados.

**Fecho:** *"Tudo que você viu — taxa, saque, resultado — deixa rastro na
auditoria. É a diferença entre uma agência e uma planilha."*

---

## Pitch 2 — Visão do AFILIADO · ~60s

**Login:** `afiliado@affiliacore.com.br` → portal próprio (demo: Yago Martins).

> "O afiliado loga e vê **só o que é dele** — nunca a margem da agência, nunca
> os outros afiliados. Transparência do lado dele, sigilo do seu."

1. **Dashboard próprio** — comissão total **R$ 1.974,11** com a quebra
   explícita: **CPA calculado R$ 1.755 (R$ 65/CPA)** + **REV share 22% =
   R$ 219,11**. Funil pessoal: 184 cadastros, 47 FTDs, 27 CPA qualificado,
   taxas de conversão. REV e CPA **por casa** (barras). Export **CSV**.
2. **Meus Links** (`/meus-links`) — um link por acordo, com **contador de
   cliques** (3.942 na demo). *"Ele sabe o que performa antes de fechar o mês."*
3. **Financeiro** (`/financeiro`) — carteira: apurado / pendente / aprovado /
   **pago (R$ 15 mil)** + botão **Solicitar saque** + histórico com status
   (inclusive rejeitado com motivo). *"O afiliado se serve sozinho — ninguém
   te chama no WhatsApp pra perguntar saldo."*
4. **Ranking** — ele vê o pódio e a **posição pessoal do dia (#30)**.

**Fecho:** *"Afiliado que enxerga o próprio número em tempo real confia — e
afiliado que confia produz."*

---

## Pitch 3 — Visão do AFILIADO ESPECIAL (gerente de rede) · ~60s

**Login:** `especial@affiliacore.com.br` → cai no **Painel da Rede** (demo:
Ana Souza, 3 sub-afiliados).

> "Esse é o diferencial: o **afiliado especial** é um mini-master dentro da
> plataforma. Ele recruta a própria rede e a gerencia sozinho — com teto que
> VOCÊ define."

1. **Painel da rede** (`/network`) — comissão total da rede **R$ 3.225,59** e
   o **lucro líquido DELE: R$ 2.529,24** (produção própria R$ 2.190 + spread
   sobre os subs − repasses R$ 696). Funil da rede inteira (262 cadastros,
   68 FTDs, R$ 21 mil depositado). Top 5 da rede com badge "VOCÊ".
2. **Meus afiliados** (`/network/afiliados`) — ele **define a taxa CPA/REV de
   cada sub**, sempre limitado ao **teto** dele (R$ 70/CPA · 25% REV na demo).
   A margem dele é o spread. Abre o painel individual de qualquer sub.
3. Mesmos recursos do afiliado comum: carteira, saque, links, ranking.

**Fecho:** *"O master define o teto; o especial monta a margem dele dentro
disso. A rede cresce em camadas **sem** você perder o controle — e sem
ninguém enxergar o que não deve: o sub não vê a rede, o especial não vê a
agência, e só o master vê tudo."*

---

## Ordem sugerida na call

1. Master (a dor do dono: margem + controle) → 2. Especial (o diferencial
competitivo / escala em rede) → 3. Afiliado (a experiência de quem ele vai
recrutar). Fechar voltando ao lucro líquido do `/admin`: *"esse número hoje
você não tem."*

## Gotchas de demo ao vivo

- Suba emuladores + seed + app pela receita da skill `verify`
  (`scripts/provision/README.md` § preview local da demo).
- Banner "Nova versão disponível" aparece **só em dev** — ignore ou remova
  antes do print (gotcha documentado na skill).
- Evite rolar até a seção de gráficos "Desempenho por Afiliado" do `/admin`
  com o seed grande: observado congelamento do render em 22/07/2026
  (pendente de investigação).
