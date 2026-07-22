# CAPÍTULO 6 — Caso real: a agência que virou a instância nº 0 da AffiliaCore

Tudo que este guia afirmou até aqui saiu de duas fontes: normas e contratos públicos — e **uma operação real**. A AffiliaCore não nasceu como startup de software procurando problema: nasceu dentro de uma agência de afiliados brasileira em operação, que se tornou a nossa **instância nº 0**. Este capítulo abre os dados históricos dessa operação (com a identidade da agência preservada) — incluindo os erros, porque são eles que ensinam.

## O retrato da operação

- **Rede com mais de 70 afiliados** cadastrados, entre afiliados diretos e uma sub-rede gerida por "afiliados especiais" (masters escopados dentro da própria agência — sim, a estrutura de agência se repete fractalmente lá dentro);
- **Multi-casa**: parte da produção vinha de **casas internacionais integradas via uma rede de afiliação global** (com painel, API e fechamento próprios), parte de **casas geridas manualmente** — planilha de resultados importada mês a mês. Essa convivência de fontes é a realidade da maioria das agências, e é onde a contabilidade quebra primeiro;
- **Comissão em duas moedas**: havia casa pagando **CPA em euro** — cada fechamento dependia da cotação do dia. Quem modela caixa em "R$ fixo por FTD" descobre o câmbio do jeito caro;
- **Cauda longa clássica**: num dia típico, **menos de 20 dos 70+ afiliados tinham produção**. O pódio diário era disputado por um grupo pequeno — com o topo passando de **R$ 2 mil de comissão bruta em um único dia bom**. A distância entre o topo e a cauda é o retrato honesto do negócio: a agência vive de ter *portfólio*, não de ter um craque.

## O dia em que a planilha mentiu: R$ 3.646,75

A melhor história desta operação não é de sucesso — é de **vazamento silencioso**.

Durante uma conciliação de rotina em meados de 2026, os números da agência não batiam com os da rede internacional parceira: o painel interno mostrava **R$ 3.646,75 a menos de comissão** num único mês do que a fonte oficial. Nenhum alarme tocou. Nenhum número parecia "errado". A diferença só apareceu porque existia uma rotina de conciliação comparando o agregado com o detalhamento por casa.

A causa, encontrada depois de auditoria: a API da rede parceira **paginava** os resultados em blocos de 50 registros — e o sistema lia apenas a primeira página. Com 72 afiliados produzindo no período, os últimos 22 simplesmente não entravam na conta do resumo. O total *parecia* completo. Não era.

As lições, na ordem que importam para você:

1. **O painel de terceiros é a versão de terceiros.** Você precisa da SUA base, alimentada pela fonte, e de uma rotina que compare os dois — agregado contra detalhamento, todo fechamento;
2. **Erro de dados não avisa.** Ninguém "sente falta" de R$ 3.646,75 diluídos em dezenas de afiliados. Só a conciliação sistemática pega;
3. **Quem paga a conta do vazamento é a confiança.** Se a agência repassa a menor sem saber, quem sofre o calote invisível é a rede — e rede desconfiada evapora (capítulo 5).

Contamos essa história contra nós mesmos por um motivo: **foi ela que definiu o que a AffiliaCore precisava ser.** Depois desse episódio, a regra interna virou lei de produto: todo número agregado tem que ser a soma verificável dos seus detalhamentos — se o painel mostra um total, ele TEM que bater com a soma por casa e por afiliado.

## Outras cicatrizes que viraram regra

- **"Sem taxa configurada" não é taxa zero.** Num afiliado recém-chegado, comissão não configurada aparecia como R$ 0 — indistinguível de "configurado para não receber". A operação aprendeu a tratar *ausência* de configuração como estado próprio, que grita na tela, em vez de um zero silencioso que vira briga no fechamento;
- **Mudança de taxa sem trilha é bomba-relógio.** Quem mudou o CPA de quem, quando, de quanto para quanto? Numa agência com dois sócios e um gestor, "acho que fui eu" não fecha auditoria. Toda mudança de dinheiro passou a gerar **registro imutável** (autor, data, valor antigo, valor novo) — a mesma trilha que uma casa séria mantém do lado dela;
- **Fuso horário rouba um dia.** Fechamento diário rodando em servidor UTC cortava o "dia" no horário errado para o Brasil — produção da noite caía no dia seguinte, e o pódio diário saía errado. Detalhe bobo? A rede que disputa o pódio não acha;
- **Resultado manual também é resultado.** As casas geridas por planilha entravam na conta com atraso e por caminhos separados do resto — até o dia em que o consolidado passou a somar as duas fontes com a mesma régua. Se a sua agência tem QUALQUER produção fora do painel automático, o seu número oficial é o consolidado, não o painel.

## O que este caso prova

Nada aqui é história de gênio. É uma agência normal, com problemas normais, que decidiu tratar **operação como produto**: conciliar, auditar, dar transparência à rede e transformar cada erro em regra de sistema. O resultado é o que hoje vendemos como software — mas a tese vale para você **mesmo que nunca use a AffiliaCore**: a agência que sobrevive não é a que mais recruta; é a que **não perde dinheiro em silêncio**.

---

> **Na prática — capítulo 6**
> - Institua a conciliação mensal: fonte oficial × sua base, agregado × detalhamento. Diferença é incidente, não detalhe.
> - Trate "não configurado" como estado visível, nunca como zero.
> - Toda mudança de taxa/comissão gera registro: quem, quando, de quanto, para quanto.
> - Consolide TODAS as fontes (API + manual) numa régua única antes de bater qualquer meta ou pódio.
