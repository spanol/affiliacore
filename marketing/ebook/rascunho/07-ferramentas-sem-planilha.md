# CAPÍTULO 7 — Ferramentas: gerindo dinheiro sem planilha

O capítulo 6 mostrou o custo do improviso numa operação real. Este capítulo não é sobre software — é sobre **maturidade operacional**: quando a planilha ainda serve, quando ela vira um risco, e o que qualquer ferramenta (comprada, interna ou uma planilha muito disciplinada) precisa resolver para você dormir tranquilo.

## Fase 1 — quando a planilha ainda funciona

Sejamos honestos: toda agência começa em planilha, e para uma rede de meia dúzia de afiliados numa casa só, ela funciona. Não há vergonha nisso — é o certo no comecinho. Enquanto houver **uma fonte de dados e poucos afiliados**, a planilha é barata, flexível e suficiente.

## Fase 2 — os sinais de que ela venceu o prazo

A planilha quebra quando aparece a **segunda dimensão**: segunda casa, segunda moeda, primeiro sub-afiliado com override, primeira divergência de fechamento. A partir daí, cada fechamento vira uma tarde de VLOOKUP. Os sinais de que passou da hora:

- Você não responde em 1 minuto "quanto o afiliado X produziu este mês, por casa?";
- O fechamento depende de UMA pessoa que "sabe onde estão as abas";
- Afiliado pergunta o próprio extrato no WhatsApp — e a resposta demora;
- Duas fontes de dados (painel da casa + controle manual) nunca batem de primeira.

## Fase 3 — o custo invisível do improviso

Aqui está o ponto que quase ninguém contabiliza. O problema da planilha madura não é o trabalho que ela dá — é o **erro que ela esconde**. Relembre o capítulo 6: R$ 3.646,75 sumiram num único mês por um detalhe de paginação, e **ninguém sentiu falta**, porque diluído em dezenas de afiliados nenhum número parecia errado. Só a conciliação sistemática pegou.

Esse é o custo invisível, e ele tem três faces:

- **Dinheiro que vaza sem alarme** — você repassa a menos (ou a mais) sem saber, e o erro só aparece quando alguém reclama;
- **Confiança que evapora** — o afiliado que não entende o extrato assume calote (capítulo 5), e rede desconfiada não escala;
- **Tempo que não volta** — as horas de fechamento manual são horas que você não passou negociando casa nova ou ativando a cauda.

Nenhuma dessas três aparece numa fatura. É por isso que a decisão de sair da planilha quase sempre chega **tarde**: o custo é real, mas silencioso.

## O que qualquer ferramenta precisa resolver

Os sinais acima definem os critérios — não são "features", são o que a dor exige. Avalie qualquer solução (inclusive a nossa) por eles, agrupados em três garantias:

**Confiar nos números**
1. **Multi-casa com régua única** — consolidar N casas (integração E import manual) no mesmo relatório e moeda. Ferramenta que só enxerga uma fonte é espelho do painel da casa; você continua sem a SUA base.
2. **Agregado que fecha com o detalhamento** — o total TEM que ser a soma dos cards por casa e por afiliado, sempre. É o invariante que pega o vazamento silencioso.
3. **Comissão configurável por afiliado E por casa** — CPA aqui, RevShare ali, híbrido acolá; e ausência de configuração é **estado visível**, não zero disfarçado.

**Escalar com transparência**
4. **Portal do afiliado** — o sub vê a própria produção e extrato sozinho. Transparência é retenção (capítulo 5) e é escala: rede de 70 mandando mensagem no fechamento não é gestão, é call center.
5. **Sub-rede de verdade** — masters escopados vendo só a própria rede, override calculado automaticamente, sem "planilha paralela do master".
6. **Gamificação leve** — ranking/pódio apurado sozinho, com regra clara (inclusive de fuso horário — capítulo 6).

**Prestar contas e proteger**
7. **Trilha de auditoria imutável** — toda mudança de taxa/vínculo/resultado com autor + data + antes/depois. Resolve a briga de fechamento em 30 segundos e é o que uma casa séria espera de um parceiro.
8. **Exportação (CSV)** — para contador, casa parceira e para o próprio afiliado. Dado preso é dado inútil.
9. **Segurança de PII** — documentos e chaves de pagamento com acesso segregado por papel. LGPD não é opcional para quem gere rede.

## Onde a AffiliaCore entra

Este guia é da AffiliaCore, então aqui vai o único trecho de venda — curto e honesto: **os nove critérios acima são literalmente a especificação do nosso produto**, porque cada um nasceu de uma dor da instância nº 0 (capítulo 6). Plataforma white-label para agências de afiliados: multi-casa (integração + import manual), comissão por afiliado e por casa, agregado que bate com o detalhe, trilha de auditoria, portal do afiliado, sub-rede, ranking automático, exportação.

Não vamos dizer que você "precisa" dela no dia 1 — você viu que a planilha aguenta a fase 1. O argumento é outro: **quando a segunda dimensão chegar**, o custo de migrar do caos é muito maior que o de começar organizado. A AffiliaCore não é uma solução que o guia quer te empurrar; é a consequência lógica do diagnóstico das três fases acima. Se quiser vê-la rodando com dados de exemplo, o caminho está no fim do guia.

*(E se você usar outra ferramenta — ou construir a sua: cobre dela os nove critérios do mesmo jeito. O guia continua valendo.)*

---

> **Na prática — capítulo 7**
> - Planilha vale até a "segunda dimensão" (2ª casa, 1º sub-master, 1ª divergência). Planeje a saída dela ANTES disso.
> - O custo da planilha madura não é o trabalho — é o erro que ela esconde (dinheiro, confiança, tempo).
> - Avalie qualquer ferramenta pelos 9 critérios, com destaque para: régua única multi-fonte, agregado = Σ detalhes e trilha de auditoria.
