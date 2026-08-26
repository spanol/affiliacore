// Workflow REUTILIZÁVEL de caça a bugs do AffiliaCore — invocar com
// Workflow({name: 'caca-bugs-affiliacore'}). Rodado pela 1ª vez em 26/08/2026:
// 33 achados brutos, 8 confirmados (2 ALTA), todos consertados no dia (commit
// 7d95eef). As dimensões espelham as classes de bug REAIS do CLAUDE.md; ao
// ganhar uma classe nova de incidente, adicione a dimensão aqui.
export const meta = {
  name: 'caca-bugs-affiliacore',
  description: 'Caça bugs em 5 dimensões (dinheiro, escopo, cascata, estado, copy) e verifica cada achado adversarialmente',
  phases: [
    { title: 'Caçar', detail: '5 caçadores, um por dimensão de bug real do repo' },
    { title: 'Verificar', detail: 'um cético por achado, tentando refutar' },
  ],
}

const REPO = 'D:/code/boost-afiliiados'

const CONTEXTO = `Você caça bugs no repo ${REPO} (AffiliaCore, SPA React + Express em server.ts, Firestore).
ANTES de tudo leia o CLAUDE.md do repo, em especial a seção "Invariantes de domínio & convenções" — ela lista os bugs REAIS que já escaparam e os padrões que os impedem. Trabalhe SOMENTE LENDO (Read/Grep/Glob): não edite nada, não rode servidor, não toque em service-account.*.json nem em projeto Firebase real. Pode rodar npm test/lint se ajudar a confirmar algo.
Reporte SÓ bug plausível com cenário concreto de falha (entrada/estado → saída errada). Não reporte estilo, TODO, ou coisa que os invariantes do CLAUDE.md já declaram como decisão de design. Cada achado: title curto, file (caminho relativo), line, description com o cenário concreto, severity (alta = dinheiro errado/vazamento de dado/perda de dado; media = comportamento errado visível; baixa = borda rara).`

const FINDINGS = {
  type: 'object', required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', required: ['title', 'file', 'description', 'severity'],
        properties: {
          title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
          description: { type: 'string' }, severity: { enum: ['alta', 'media', 'baixa'] },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object', required: ['real', 'justificativa'],
  properties: {
    real: { type: 'boolean' },
    justificativa: { type: 'string' },
    severidade: { enum: ['alta', 'media', 'baixa'] },
    conserto: { type: 'string' },
  },
}

const DIMENSOES = [
  {
    key: 'dinheiro',
    effort: 'high',
    prompt: `${CONTEXTO}
DIMENSÃO: DINHEIRO. O histórico do repo: toda regressão de dinheiro veio de fórmula reimplementada inline fora de src/lib/commission.ts, ou de métrica AGREGADA multiplicada pela taxa de TOPO ignorando byBrand (caso de ontem: ClientDashboard/AffiliateDetails somavam agregado × topo; corrigido com payoutOverBrandRows, mas o §13 do BACKLOG lista superfícies restantes — NÃO as re-reporte). Procure:
- multiplicações de qualified_cpa/rvs por taxa fora de calcAffiliatePayout/calcAffiliatePayoutParts (grep por "qualified_cpa" e "rvs" em pages/ e components/ e server.ts);
- lugares que usam cpaValue||0 para display (ausência≠R$0, rateStatus é a régua);
- consumo de total_commission como repasse do afiliado (é receita da CASA);
- merge OTG+manual duplicado (manual somado 2x) ou faltando em visão por afiliado;
- conversão de moeda fora de src/lib/currency.ts, arredondamento de centavos.
Vá fundo nas telas: Financeiro, WithdrawalsAdmin, Ranking, Network, SpecialDashboard, SpecialSubAffiliates, exportExtract, server.ts (ranking, carteira, partner-api).`,
  },
  {
    key: 'escopo',
    effort: 'high',
    prompt: `${CONTEXTO}
DIMENSÃO: ESCOPO/SEGURANÇA. Histórico: IDOR no proxy (resolveScopedAffiliateIds é a barreira), coleção sensível lida direto do client, campo sensível zerado em vez de REMOVIDO (sanitizeDealForViewer remove cpaValue, zerar seria lido como taxa), campos server-only de users (role/affiliateId/isSpecial). Procure em server.ts:
- rota nova sem requireAdmin/requireAuth ou que confia em affiliateId do body/query em vez do token;
- rota que devolve dado além do escopo do papel (gerente vendo além do filho DIRETO, afiliado vendo dado de outro);
- dado sensível (taxa da agência, PII, e-mail de affiliate_email_aliases, chave de integração) vazando em resposta de rota não-admin;
- firestore.rules vs código: coleção com rule aberta que o client ainda lê direto (compare firestore.rules com src/services/*).
E no client: página que monta payload de escrita que as rules aceitariam mas o papel não deveria poder.`,
  },
  {
    key: 'cascata',
    effort: 'high',
    prompt: `${CONTEXTO}
DIMENSÃO: CASCATA/ÓRFÃOS. Caso real desta semana: criar casa cria acordo-rascunho; apagar a casa deixava o rascunho órfão na vitrine (corrigido ontem — NÃO re-reporte). O padrão: UMA ação grava/depende de VÁRIOS docs, e o inverso da ação não desfaz todos. Mapeie cada fluxo de criação/exclusão/desativação em server.ts e cheque o par:
- apagar afiliado/usuário: o que acontece com affiliate_configs, affiliate_links, affiliate_email_aliases, affiliate_tag_aliases, affiliate_uplines, special_affiliates, payment_profiles, partnership_requests, withdrawal_requests dele?
- desativar/apagar especial: subAffiliateIds, uplines, links de rede (kind:'network' só vale com dono ativo — quem checa?);
- trocar vínculo casa↔integração (applyIntegrationLink): sobra referência do lado antigo?
- accept-invite/aprovar solicitação: cria user+affiliate+alias+upline — e se falhar no meio? idempotência?
- withdrawal aprovado e a casa apagada; partnership aprovada e o link apagado; deal desativado e byBrand já gravado.
Reporte só onde o órfão causa efeito visível (tela mostrando fantasma, dinheiro contado errado, dado irrecuperável).`,
  },
  {
    key: 'estado',
    effort: 'medium',
    prompt: `${CONTEXTO}
DIMENSÃO: ESTADO/RACE no client. Histórico: portão do AuthContext (await entre setUser e fechar o gate entregava painel sem 2FA), mfaPending recalculado só em onAuthStateChanged. Procure em src/contexts e src/pages:
- useEffect async sem guarda de cancelamento onde a resposta tardia sobrescreve estado mais novo (troca rápida de filtro/range/conta);
- estado derivado de prop/perfil que não reseta quando a identidade muda;
- onSnapshot sem unsubscribe ou re-inscrito por dependência instável;
- loading que fica true para sempre num catch, ou false antes do dado (flash de vazio/empty state mentiroso);
- formulário/modal que reusa estado do item anterior ao reabrir.
Só reporte com cenário reproduzível concreto.`,
  },
  {
    key: 'copy',
    effort: 'low',
    prompt: `${CONTEXTO}
DIMENSÃO: COPY. Duas regras HARD do CLAUDE.md: (1) PROIBIDO travessão "—" no MEIO de frase em string visível ao usuário (UI, toast, erro de server.ts, planilha modelo) — placeholder '—' de valor vazio, "— nenhuma —" de select e meia-risca "–" de intervalo de datas são PERMITIDOS; (2) PROIBIDO "(s)"/"(is)" de plural — o certo é pluralize/plural de src/lib/plural.ts; parênteses de gênero "(a)" também são proibidos. Grep sistemático em src/ e server.ts por strings visíveis violando as duas regras. Cada violação real é UMA finding baixa (agrupe por arquivo se forem muitas no mesmo).`,
  },
]

phase('Caçar')
const rodadas = await parallel(DIMENSOES.map((d) => () =>
  agent(d.prompt, { label: `caça:${d.key}`, phase: 'Caçar', schema: FINDINGS, effort: d.effort })
))

// Barreira justificada: dedupe por arquivo+título ANTES da verificação (cara) e
// corte no teto de agentes.
const todos = rodadas.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, dim: DIMENSOES[i].key })))
const vistos = new Set()
const unicos = todos.filter((f) => {
  const k = `${f.file}::${(f.title || '').toLowerCase().slice(0, 40)}`
  if (vistos.has(k)) return false
  vistos.add(k)
  return true
})
const peso = { alta: 0, media: 1, baixa: 2 }
unicos.sort((a, b) => (peso[a.severity] ?? 3) - (peso[b.severity] ?? 3))
const paraVerificar = unicos.filter((f) => f.severity !== 'baixa').slice(0, 9)
const baixasSemVerificar = unicos.filter((f) => f.severity === 'baixa')
log(`${todos.length} achados brutos, ${unicos.length} únicos; verificando os ${paraVerificar.length} de severidade alta/média (${baixasSemVerificar.length} baixas passam sem verificação adversarial)`)

phase('Verificar')
const verificados = await parallel(paraVerificar.map((f) => () =>
  agent(`Você é um CÉTICO verificando um suposto bug no repo ${REPO}. Leia o código de verdade (Read/Grep) e tente REFUTAR o achado abaixo. Só confirme (real=true) se conseguir descrever o passo a passo concreto que produz o efeito errado, citando as linhas. Se o comportamento for decisão de design documentada (CLAUDE.md, comentário no código, BACKLOG), refute. Em caso de dúvida, real=false. NÃO edite nada.

ACHADO [${f.dim}/${f.severity}] ${f.title}
Arquivo: ${f.file}${f.line ? ':' + f.line : ''}
Descrição: ${f.description}`, { label: `verifica:${f.file.split('/').pop()}`, phase: 'Verificar', schema: VERDICT })
    .then((v) => ({ ...f, veredito: v }))
))

const confirmados = verificados.filter(Boolean).filter((f) => f.veredito?.real)
const refutados = verificados.filter(Boolean).filter((f) => !f.veredito?.real)
return {
  confirmados,
  refutados: refutados.map((f) => ({ title: f.title, file: f.file, porque: f.veredito?.justificativa })),
  baixasSemVerificar,
}