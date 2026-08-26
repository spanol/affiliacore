// GRAFO DE MÓDULOS — a declaração de como as coleções se conectam, e a TRAVA que
// obriga toda exclusão a decidir o destino dos dependentes.
//
// POR QUE EXISTE: o incidente das casas "Sports" (22–24/08/2026). Criar casa cria
// junto um acordo-rascunho; apagar a casa não encostava nele, e os 4 cards órfãos
// ficaram na vitrine do admin dias depois das casas sumirem. O acoplamento existia
// só na cabeça de quem escreveu o fluxo — nenhum lugar DECLARAVA "deals depende de
// houses", então nada cobrava a decisão de cascata quando a exclusão nasceu.
//
// COMO FUNCIONA (moduleGraph.test.ts, mesmo padrão da trava da demo):
//   1) toda coleção que o app usa (rules ∪ server.ts ∪ services) tem entrada aqui,
//      e toda entrada aqui ainda existe no app — o grafo não pode mentir;
//   2) toda aresta `dependeDe` aponta para coleção declarada — sem ponta solta;
//   3) toda rota `app.delete(...)` do server.ts tem um CONTRATO DE EXCLUSÃO, e
//      todo contrato ainda corresponde a uma rota viva;
//   4) o contrato de quem apaga a coleção X decide o destino de CADA coleção que
//      declara `dependeDe: [X]` — nem uma a mais, nem uma a menos. Coleção nova
//      que passar a depender de X QUEBRA o teste até alguém decidir a cascata;
//   5) o MAPA-MODULOS.md cita toda coleção e toda rota de exclusão — o desenho
//      não descola do código.
//
// Ou seja: o próximo "rascunho órfão" não passa do `npm test`. Adicionar uma
// dependência ou uma exclusão exige escrever a decisão AQUI, onde ela é lida.
//
// Puro e sem Firebase: recebe TEXTO dos arquivos e devolve diffs, como demoCoverage.

/** Um nó do grafo: uma coleção do Firestore e suas arestas de dependência. */
export interface ModuleNode {
  /** Agrupador humano — a "caixa" do MAPA-MODULOS.md em que a coleção vive. */
  modulo: string;
  /** O que a coleção guarda, numa linha. */
  descricao: string;
  /**
   * Coleções que os docs desta REFERENCIAM (chave estrangeira lógica: um campo
   * aqui carrega o id/slug de um doc de lá). É desta lista que a trava deriva os
   * dependentes de cada coleção — declare a aresta no lado que APONTA.
   */
  dependeDe?: string[];
}

/**
 * O destino de uma coleção dependente quando o doc do qual ela depende é apagado.
 * - 'apaga'          — os docs dependentes vão junto.
 * - 'apaga-rascunho' — só o dependente ainda intocado vai junto (regra pura decide).
 * - 'mantem'         — fica, por decisão (histórico/denormalizado); o motivo vai no MAPA.
 * - 'bloqueia'       — a exclusão é RECUSADA enquanto houver dependente vivo.
 */
export type CascadeAction = 'apaga' | 'apaga-rascunho' | 'mantem' | 'bloqueia';

export interface DeleteContract {
  /** Coleção que a rota apaga. */
  colecao: string;
  /** Decisão por coleção DEPENDENTE (as que declaram `dependeDe` desta). */
  cascata: Record<string, CascadeAction>;
  /** O doc apagado vai inteiro para `audit_logs.metadata.snapshot`? */
  snapshot: boolean;
  /** Guardas da própria rota (409/404), numa linha. */
  travas?: string;
}

export const MODULE_GRAPH: Record<string, ModuleNode> = {
  // --- Identidade & acesso ---------------------------------------------------
  users: { modulo: 'Identidade & acesso', descricao: 'Perfil de login (role, affiliateId, isSpecial — server-only).', dependeDe: ['affiliates'] },
  auth_totp: { modulo: 'Identidade & acesso', descricao: 'Segredo TOTP + hashes dos códigos de backup (rule if false).', dependeDe: ['users'] },
  phone_verifications: { modulo: 'Identidade & acesso', descricao: 'Desafio de OTP por SMS, efêmero.', dependeDe: ['users'] },
  invites: { modulo: 'Identidade & acesso', descricao: 'Convites de onboarding (single-use) e de rede (kind network, reutilizável).', dependeDe: ['affiliates'] },
  affiliate_email_aliases: { modulo: 'Identidade & acesso', descricao: 'E-mail (PII) do afiliado nativo — server-only, chave do cruzamento de import.', dependeDe: ['affiliates'] },

  // --- Afiliados (espelho & contrato) ---------------------------------------
  affiliates: { modulo: 'Afiliados', descricao: 'Espelho name-only (OTG sync ou nativo boost_*). Raiz de quase tudo.' },
  affiliate_statuses: { modulo: 'Afiliados', descricao: 'Ativo/inativo por afiliado.', dependeDe: ['affiliates'] },
  affiliate_configs: { modulo: 'Afiliados', descricao: 'Taxas do contrato: topo + byBrand por casa + history de vigência.', dependeDe: ['affiliates', 'houses'] },
  pending_affiliates: { modulo: 'Afiliados', descricao: 'Snapshot OTG de aprovados aguardando reconciliação (módulo OTG).', dependeDe: ['affiliates'] },
  affiliate_analytics: { modulo: 'Afiliados', descricao: 'Funil de cliques v1 OTG.', dependeDe: ['affiliates'] },

  // --- Rede ------------------------------------------------------------------
  affiliate_uplines: { modulo: 'Rede', descricao: 'Aresta filho→pai da árvore (server-only). Fonte da hierarquia.', dependeDe: ['affiliates'] },
  special_affiliates: { modulo: 'Rede', descricao: 'Registro do gerente: lista manual OU fromNetwork (derivado da árvore).', dependeDe: ['affiliates', 'users'] },
  affiliate_referrals: { modulo: 'Rede', descricao: 'Indicação de recruta pelo gerente, aguardando aprovação do master.', dependeDe: ['affiliates'] },

  // --- Casas & resultados ----------------------------------------------------
  houses: { modulo: 'Casas & resultados', descricao: 'Backoffice de casas: taxa padrão, moeda/câmbio, ISS, template de link, conector.', dependeDe: ['integrations'] },
  house_results: { modulo: 'Casas & resultados', descricao: 'Produção manual/pull/postback: agregado do dia + linhas por afiliado.', dependeDe: ['houses', 'affiliates'] },
  integrations: { modulo: 'Casas & resultados', descricao: 'Credencial de conector (rule if false) + alvo houseId (1:1, vive nos DOIS docs).', dependeDe: ['houses'] },
  postback_events: { modulo: 'Casas & resultados', descricao: 'Ledger de eventos S2S da rede (Fomento), reprocessável.', dependeDe: ['houses', 'affiliates'] },
  affiliate_tag_aliases: { modulo: 'Casas & resultados', descricao: 'Apelido tag→afiliado para atribuição de relatório/pull.', dependeDe: ['affiliates', 'houses'] },

  // --- Divulgação ------------------------------------------------------------
  affiliate_links: { modulo: 'Divulgação', descricao: 'Link /go/:code por afiliado×casa (ou pool standby sem dono).', dependeDe: ['affiliates', 'houses'] },
  link_clicks: { modulo: 'Divulgação', descricao: 'Clique individual do /go (com clickId).', dependeDe: ['affiliate_links'] },
  link_click_stats: { modulo: 'Divulgação', descricao: 'Contador diário de cliques por link.', dependeDe: ['affiliate_links'] },

  // --- Marketplace -----------------------------------------------------------
  deals: { modulo: 'Marketplace', descricao: 'Oferta da operadora (tipo direto/gerenciado, KPIs, câmbio). Casa nova cria rascunho.', dependeDe: ['houses'] },
  partnership_requests: { modulo: 'Marketplace', descricao: 'Parceria afiliado→deal (requested→priced→approved...; denormaliza operadora/label).', dependeDe: ['deals', 'affiliates', 'affiliate_links', 'houses'] },

  // --- Financeiro ------------------------------------------------------------
  withdrawal_requests: { modulo: 'Financeiro', descricao: 'Pedido de saque por casa (pending→approved→paid).', dependeDe: ['affiliates', 'houses'] },
  payment_profiles: { modulo: 'Financeiro', descricao: 'PIX + dados de nota do afiliado (mediado pelo servidor).', dependeDe: ['users'] },

  // --- Engajamento -----------------------------------------------------------
  notices: { modulo: 'Engajamento', descricao: 'Mural de avisos da agência (audiência por papel).' },
  user_notifications: { modulo: 'Engajamento', descricao: 'Notificação pessoal (sino).', dependeDe: ['users'] },
  direct_messages: { modulo: 'Engajamento', descricao: 'Mensagem direta admin→afiliado (popup, read receipt).', dependeDe: ['users'] },
  daily_rankings: { modulo: 'Engajamento', descricao: 'Pódio do dia (comissão bruta), gerado por cron/clique.', dependeDe: ['affiliates'] },
  ranking_prizes: { modulo: 'Engajamento', descricao: 'Prêmios por posição do ranking.' },
  achievement_tiers: { modulo: 'Engajamento', descricao: 'Placas de conquista por meta de faturamento.' },
  achievement_requests: { modulo: 'Engajamento', descricao: 'Pedido de prêmio ao bater a placa.', dependeDe: ['affiliates', 'achievement_tiers'] },
  contacts: { modulo: 'Engajamento', descricao: 'Formulário público de contato da LP.' },

  // --- Jurídico --------------------------------------------------------------
  legal_documents: { modulo: 'Jurídico', descricao: 'Termos versionados publicados pelo admin.' },
  legal_acceptances: { modulo: 'Jurídico', descricao: 'Aceite de cada usuário por versão.', dependeDe: ['legal_documents', 'users'] },

  // --- Plataforma ------------------------------------------------------------
  settings: { modulo: 'Plataforma', descricao: 'Configurações da instância (suporte, vitrine...) — admin-only.' },
  app_meta: { modulo: 'Plataforma', descricao: 'Versão do bundle publicada pelo boot (banner de atualização).' },
  audit_logs: { modulo: 'Plataforma', descricao: 'Trilha append-only. Desde 24/08, exclusões guardam o doc em metadata.snapshot.' },
  api_partners: { modulo: 'Plataforma', descricao: 'Chaves da API de parceiros (módulo OTG).' },
};

/**
 * Contratos de exclusão — um por rota `app.delete` do server.ts. As chaves de
 * `cascata` são EXATAMENTE os dependentes derivados do grafo (o teste cobra os
 * dois sentidos). 'mantem' é decisão, não omissão: o motivo vive no MAPA-MODULOS.md.
 */
export const DELETE_CONTRACTS: Record<string, DeleteContract> = {
  '/api/houses/:id': {
    colecao: 'houses',
    snapshot: true,
    travas: 'Nenhuma: apagar casa é sempre possível (o snapshot é a rede).',
    cascata: {
      affiliate_configs: 'mantem',      // byBrand[casa] é histórico de taxa; apagar reprecificaria extrato
      house_results: 'mantem',          // produção é histórico financeiro
      integrations: 'mantem',           // ⚠️ houseId fica apontando para slug morto (MAPA §observações)
      postback_events: 'mantem',        // ledger reprocessável
      affiliate_tag_aliases: 'mantem',  // vínculo tag→afiliado sobrevive a recriação da casa
      affiliate_links: 'mantem',        // ⚠️ /go continua redirecionando (MAPA §observações)
      deals: 'apaga-rascunho',          // isUntouchedDraftDeal e sem parceria; precificado fica (dealsKept)
      partnership_requests: 'mantem',   // denormalizam operadora/label, a tela do afiliado segue legível
      withdrawal_requests: 'mantem',    // saque vira "Casa não informada" no display, dinheiro não some
    },
  },
  '/api/deals/:id': {
    colecao: 'deals',
    snapshot: true,
    travas: 'Só acordo INATIVO e sem parceria viva (requested/priced/approved) — desativar encerra em cascata primeiro.',
    cascata: {
      partnership_requests: 'bloqueia', // viva bloqueia; encerrada fica (denormalizada)
    },
  },
  '/api/affiliate-links/:code': {
    colecao: 'affiliate_links',
    snapshot: true,
    travas: 'Só link do POOL (sem dono); link com affiliateId exige liberar para standby antes.',
    cascata: {
      link_clicks: 'mantem',            // histórico de clique
      link_click_stats: 'mantem',
      partnership_requests: 'bloqueia', // parceria referencia code de link COM dono, que a rota já recusa
    },
  },
  '/api/tag-aliases/:tag': {
    colecao: 'affiliate_tag_aliases',
    snapshot: false,
    travas: 'Nenhuma: desfazer o vínculo devolve a tag à fila de pendentes no próximo pull.',
    cascata: {},
  },
  '/api/legal-documents/:id': {
    colecao: 'legal_documents',
    snapshot: true,
    cascata: {
      legal_acceptances: 'mantem',      // prova de aceite sobrevive ao documento
    },
  },
  '/api/notices/:id': { colecao: 'notices', snapshot: false, cascata: {} },
  '/api/prizes/:id': { colecao: 'ranking_prizes', snapshot: false, cascata: {} },
  '/api/achievement-tiers/:id': {
    colecao: 'achievement_tiers',
    snapshot: false,
    cascata: {
      achievement_requests: 'mantem',   // ⚠️ pedido antigo referencia placa morta (MAPA §observações)
    },
  },
  '/api/house-results': {
    colecao: 'house_results',
    snapshot: false,
    travas: 'Limpeza por casa/data para reimportar; o import reescreve as datas presentes.',
    cascata: {},
  },
};

// --- Derivações e checagens (puras) -----------------------------------------

const sorted = (v: Iterable<string>): string[] => [...new Set(v)].sort();

/** Rotas `app.delete('...')` do server.ts, na ordem do arquivo. */
export function parseDeleteRoutes(serverSource: string): string[] {
  return sorted([...serverSource.matchAll(/app\.delete\(\s*'([^']+)'/g)].map((m) => m[1]));
}

/** Coleções que declaram `dependeDe` de `colecao` — os dependentes dela. */
export function dependentsOf(graph: Record<string, ModuleNode>, colecao: string): string[] {
  return sorted(Object.entries(graph).filter(([, n]) => n.dependeDe?.includes(colecao)).map(([name]) => name));
}

/** Coleções do app sem entrada no grafo. Cada nome é um módulo não mapeado. */
export function undeclaredCollections(appCollections: string[], graph: Record<string, ModuleNode>): string[] {
  return appCollections.filter((c) => !(c in graph)).sort();
}

/** Entradas do grafo que o app já não usa — o mapa não pode listar fantasma. */
export function staleGraphEntries(appCollections: string[], graph: Record<string, ModuleNode>): string[] {
  const app = new Set(appCollections);
  return Object.keys(graph).filter((c) => !app.has(c)).sort();
}

/** Arestas `dependeDe` apontando para coleção que não existe no grafo. */
export function danglingDependencies(graph: Record<string, ModuleNode>): string[] {
  const out: string[] = [];
  for (const [name, node] of Object.entries(graph)) {
    for (const dep of node.dependeDe ?? []) {
      if (!(dep in graph)) out.push(`${name} → ${dep}`);
    }
  }
  return out.sort();
}

/** Rotas de exclusão do server sem contrato declarado (e contratos órfãos). */
export function contractRouteDiff(
  serverRoutes: string[],
  contracts: Record<string, DeleteContract>,
): { semContrato: string[]; contratoOrfao: string[] } {
  const declared = new Set(Object.keys(contracts));
  const live = new Set(serverRoutes);
  return {
    semContrato: serverRoutes.filter((r) => !declared.has(r)).sort(),
    contratoOrfao: [...declared].filter((r) => !live.has(r)).sort(),
  };
}

/**
 * O coração da trava: para cada contrato, os dependentes derivados do grafo têm
 * que bater EXATAMENTE com as chaves de `cascata`. Faltando = dependência nova
 * sem decisão de cascata (a classe do rascunho órfão). Sobrando = cascata
 * declarada para quem já não depende (o grafo mentiria).
 */
export function cascadeDecisionDiff(
  graph: Record<string, ModuleNode>,
  contracts: Record<string, DeleteContract>,
): Array<{ route: string; faltamDecisao: string[]; decisaoOrfa: string[] }> {
  const out: Array<{ route: string; faltamDecisao: string[]; decisaoOrfa: string[] }> = [];
  for (const [route, contract] of Object.entries(contracts)) {
    const dependents = new Set(dependentsOf(graph, contract.colecao));
    const decided = new Set(Object.keys(contract.cascata));
    const faltamDecisao = [...dependents].filter((d) => !decided.has(d)).sort();
    const decisaoOrfa = [...decided].filter((d) => !dependents.has(d)).sort();
    if (faltamDecisao.length || decisaoOrfa.length) out.push({ route, faltamDecisao, decisaoOrfa });
  }
  return out;
}

/** Nomes (coleções/rotas) que o MAPA-MODULOS.md deixou de citar. */
export function missingFromDoc(names: string[], docSource: string): string[] {
  return names.filter((n) => !docSource.includes(n)).sort();
}
