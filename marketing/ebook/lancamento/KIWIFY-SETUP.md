# Runbook — configurar a venda do ebook na Kiwify

**Para: operador (Vinicius).** Tempo estimado: ~1h. Pré-requisitos: CPF ou CNPJ (recomendado: CNPJ da operação), dados bancários para saque, o PDF do ebook (quando diagramado — dá para configurar tudo antes com um PDF placeholder e trocar o arquivo depois).

**Taxas (conferidas em 2026-07-22, central de ajuda oficial):** 8,99% + R$ 2,49 por venda aprovada; sem mensalidade. Saque R$ 3,67 (PIX cai em ~2 min em horário comercial). Liberação: PIX D+2, cartão 15 dias (D+2 no cartão opcional custa +2% em tudo — **não ligar** no nosso volume).

## 1. Conta
1. kiwify.com.br → Criar conta (e-mail institucional — sugerido contato@affiliacore.com.br).
2. Completar cadastro fiscal: **usar o CNPJ** (emissão de NF e credibilidade no checkout).
3. Financeiro → cadastrar conta bancária/PIX do CNPJ.

## 2. Produto principal (o ebook)
1. Produtos → Criar produto → tipo **E-book / Arquivo**.
   - Nome: `Agência, não aposta — Guia AffiliaCore` (ajustar quando o título for batido).
   - Preço: **R$ 47,00** à vista (PIX e cartão; parcelamento irrelevante nesse ticket — pode deixar até 2×).
2. **Entrega: usar a Área de Membros da Kiwify** (grátis), NÃO anexo de e-mail — motivos (pesquisa §3): percepção de valor, upsell futuro do curso na mesma interface, hábito de login.
   - Criar área de membros → módulo único "O Guia" → aula 1 com o PDF para download + os capítulos como texto se quisermos depois.
3. **Proteção: ativar DRM Social** (Configurações do produto → E-book/PDF → DRM) — estampa nome/e-mail/CPF do comprador nas páginas do PDF.
4. Página de obrigado: padrão da Kiwify por enquanto (a LP própria vem na Fase 2).
5. E-mail de acesso: revisar o texto padrão — trocar para o tom institucional (2 linhas: o que comprou, onde acessa, e-mail de suporte).

## 3. Order bump — "Kit de Operação" (R$ 27)
1. Criar **segundo produto**: `Kit de Operação da Agência` — tipo Arquivo, também via área de membros. Conteúdo (3 arquivos, pasta `bump/` deste repo):
   - `calculadora-comissao-v1.xlsx` (calculadora com 6 abas — CPA, RevShare/NGR, Híbrido, Agência, Fluxo de caixa);
   - Checklist de compliance de peça (PDF a diagramar de `checklist-compliance-peca.md`);
   - Modelo de contrato de sub-afiliado (DOCX/PDF a gerar de `modelo-contrato-subafiliado.md`).
2. No produto PRINCIPAL → Checkout → **Order bump** → adicionar o Kit por **R$ 27**.
   - Texto do bump (curto, caixa de destaque): **"Leve junto o Kit de Operação: a calculadora de comissão (CPA/REV/NGR), o checklist de compliance e o modelo de contrato de sub-afiliado — as 3 ferramentas do capítulo 4 prontas para usar. + R$ 27"**
3. **Sem upsell por enquanto** (decisão do PLANO.md — só quando o curso existir).

## 4. Checkout
- Métodos: **PIX + cartão** (PIX primeiro — domina low ticket BR).
- Campos: mínimo (nome, e-mail, CPF — CPF é exigido pelo DRM e pela NF).
- Countdown/escassez falsa: **NÃO usar** (posicionamento anti-guru; e "chamada para ação com urgência" é exatamente o padrão de peça que criticamos).
- Depoimentos: deixar vazio no lançamento; preencher com os primeiros compradores reais.
- **Pixel/Analytics:** Configurações → Pixels → adicionar **GA4** (measurement ID do stack da landing — ver skill `/web-analytics`) para medir purchase; o clique LP→checkout a gente mede via GTM na Fase 2.

## 5. Programa de afiliados interno da Kiwify (decidir — sugestão: ligar depois)
A Kiwify tem marketplace onde afiliados vendem o ebook por comissão. É meta e on-brand ("afiliados vendendo o guia de afiliados"), MAS: perde-se controle da copy dos divulgadores — e nossa marca não pode aparecer em peça estilo guru. **Sugestão: lançar DESLIGADO; reavaliar no mês 2 com regra de material aprovado** (a Kiwify permite exigir aprovação de afiliado).

## 6. Teste de fogo (obrigatório antes de divulgar)
1. Compra real com cartão próprio (R$ 47 + bump R$ 27).
2. Conferir: e-mail de acesso chegou; área de membros abre; PDF baixa com DRM (seu nome estampado); xlsx abre com fórmulas funcionando; NF emitida.
3. Reembolsar a compra-teste pelo painel (garantia 7 dias) e conferir o fluxo de reembolso.
4. Me avisar com o **link do checkout** → eu sigo para a Fase 2 (LP /ebook + GTM).

## Referências de custo (para o financeiro)
| Evento | Valor |
|---|---|
| Venda ebook R$ 47 | recebe ~R$ 40,28 (taxa R$ 8,72) |
| Venda ebook+bump R$ 74 | recebe ~R$ 64,86 (taxa R$ 9,14) |
| Saque | R$ 3,67 |
| Liberação | PIX D+2 · cartão 15d |
