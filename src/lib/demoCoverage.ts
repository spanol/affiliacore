// TRAVA DE COBERTURA DA DEMO — o que impede uma feature nova de nascer invisível
// na demonstração (que é a peça comercial: gravação de mídia, apresentação a lead,
// instância demo deployada).
//
// POR QUE EXISTE: a demo é semeada por scripts (scripts/provision/seed-demo.cjs +
// seed-demo-extras.cjs). Nada obrigava esses scripts a acompanhar o código, então a
// cada feature nova a demo ficava um pouco mais desatualizada — e o sintoma é
// SILENCIOSO: a tela abre, não dá erro, só mostra empty state. Foi o que se
// encontrou na auditoria de 2026-08-17: /conquistas 100% vazia, marketplace sem
// nenhum acordo gerenciado, 100% dos saques dizendo "Casa não informada", item
// "Suporte" ausente da sidebar por falta de um doc em `settings`.
//
// COMO FUNCIONA: os testes (demoCoverage.test.ts) leem os ARQUIVOS de verdade —
// firestore.rules, server.ts, src/services/* e os dois seeds — e cruzam:
//   1) toda coleção que o app usa está semeada OU tem isenção declarada com motivo;
//   2) toda isenção continua se referindo a uma coleção que existe (lista honesta);
//   3) todo valor dos enums de domínio (status de saque, tipo de deal, categoria de
//      aviso...) aparece nos seeds — enum novo sem dado na demo é o mesmo buraco.
//
// Ou seja: ao adicionar uma coleção ou um estado novo, o `npm test` FALHA até que a
// demo cubra o cenário ou que a isenção seja declarada aqui. É de propósito que a
// saída de erro liste o nome exato e o caminho do seed.
//
// Puro e sem Firebase: recebe o TEXTO dos arquivos e devolve os diffs.

/** Motivo declarado para uma coleção NÃO ter dado na demo. Sem motivo, não há isenção. */
export interface DemoExemption {
  /** Por que semear não faz sentido (aparece na mensagem de falha do teste). */
  reason: string;
}

/**
 * Coleções que o app usa e que a demo NÃO semeia por decisão consciente.
 * Adicionar uma entrada aqui é uma decisão de produto, não um atalho para calar o
 * teste: o motivo é lido por quem mexer na demo depois.
 */
export const DEMO_EXEMPTIONS: Record<string, DemoExemption> = {
  // --- Módulo OTG: a demo é OTG-free (VITE_OTG_ENABLED=false), que é o padrão de
  // venda white-label. As rotas nem são registradas e os itens somem da sidebar.
  affiliate_analytics: {
    reason: 'Funil "v1 OTG" no /afiliados/:id. A demo é OTG-free e o card traz o rótulo OTG na tela: semear seria incoerente com o posicionamento white-label.',
  },
  pending_affiliates: {
    reason: 'Roster OTG (/roster-otg). A rota é gateada por OTG_ENABLED e nem existe na demo.',
  },
  api_partners: {
    reason: 'Chaves da API de parceiros (/parceiros-api, gateada por OTG_ENABLED). Nenhuma tela lista a coleção e a chave crua nunca é gravada.',
  },

  // --- Material sensível ou efêmero: semear seria errado, não incompleto.
  auth_totp: {
    reason: 'Segredo do autenticador e hashes dos códigos de backup. É material criptográfico (rule read/write: if false, nem o admin lê): o 2FA se demonstra ativando na hora.',
  },
  phone_verifications: {
    reason: 'Desafio de OTP por SMS, efêmero e com TTL. Um código semeado nasce inválido.',
  },

  // --- Publicado pelo próprio runtime.
  app_meta: {
    reason: 'O servidor publica app_meta/version no boot (publishAppVersion). Semear à mão com versão diferente do bundle faria o banner "Nova versão disponível" aparecer indevidamente.',
  },
  postback_events: {
    reason: 'Ledger server-only dos disparos de postback da Fomento (rede Offer18); nenhuma tela o lê. O que a demo mostra é o efeito derivado dele em house_results, que já é semeado.',
  },
};

/**
 * Coleção que os seeds tocam SÓ para proteger (contam antes/depois do wipe) e que
 * jamais é semeada: os leads da landing dividem o banco com a demo no projeto
 * `affiliacore`. Não conta como cobertura nem como sobra.
 */
export const DEMO_GUARDED_COLLECTIONS = ['leads'];

/**
 * `match /databases/{db}/documents` é o envelope do firestore.rules, não uma
 * coleção. Fica fora dos dois lados da conta.
 */
const RULES_NON_COLLECTIONS = new Set(['databases']);

const dedupeSorted = (values: string[]): string[] => [...new Set(values)].sort();

/** Coleções declaradas no firestore.rules (`match /nome/{id}`). */
export function parseRulesCollections(rulesSource: string): string[] {
  const found = [...rulesSource.matchAll(/match\s+\/([A-Za-z_][A-Za-z0-9_]*)\s*\/\s*\{/g)].map((m) => m[1]);
  return dedupeSorted(found.filter((name) => !RULES_NON_COLLECTIONS.has(name)));
}

/**
 * Coleções acessadas em código (`collection('nome')` — Admin SDK no server.ts e
 * client SDK nos services). Serve tanto para o app quanto para os seeds: os dois
 * usam a mesma chamada.
 */
export function parseCodeCollections(source: string): string[] {
  const found = [...source.matchAll(/collection\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g)].map((m) => m[1]);
  return dedupeSorted(found);
}

/**
 * Valores de um enum de domínio escrito como união de literais
 * (`export type X = 'a' | 'b';`) ou como array de constantes
 * (`export const XS: X[] = ['a', 'b'];`). Aceita os dois porque o repo usa os dois,
 * e é o que faz o teste seguir sozinho quando alguém adiciona um estado novo.
 */
export function parseUnionMembers(source: string, symbolName: string): string[] {
  const declaration = new RegExp(
    `(?:type|const)\\s+${symbolName}\\b[^=]*=\\s*([^;]+);`,
    'm',
  ).exec(source);
  if (!declaration) return [];
  return dedupeSorted([...declaration[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]));
}

export interface CoverageInput {
  /** Coleções que o app usa (rules ∪ código). */
  appCollections: string[];
  /** Coleções que os seeds da demo escrevem. */
  seededCollections: string[];
  /** Isenções declaradas (default: DEMO_EXEMPTIONS). */
  exemptions?: Record<string, DemoExemption>;
}

/**
 * Coleções que o app usa, a demo não semeia e ninguém isentou. Cada nome aqui é uma
 * tela que abre vazia na demonstração.
 */
export function missingFromDemo({
  appCollections,
  seededCollections,
  exemptions = DEMO_EXEMPTIONS,
}: CoverageInput): string[] {
  const seeded = new Set(seededCollections);
  const guarded = new Set(DEMO_GUARDED_COLLECTIONS);
  return dedupeSorted(
    appCollections.filter((name) => !seeded.has(name) && !exemptions[name] && !guarded.has(name)),
  );
}

/**
 * Isenções que apontam para coleção que o app não usa mais. Mantém a lista honesta:
 * sem isso ela viraria um cemitério de nomes e a próxima pessoa não saberia o que
 * ainda vale.
 */
export function staleExemptions({
  appCollections,
  exemptions = DEMO_EXEMPTIONS,
}: Pick<CoverageInput, 'appCollections'> & { exemptions?: Record<string, DemoExemption> }): string[] {
  const app = new Set(appCollections);
  return dedupeSorted(Object.keys(exemptions).filter((name) => !app.has(name)));
}

/**
 * Coleções semeadas que o app não usa (nome errado no seed, ou coleção removida do
 * app e esquecida no seed). As protegidas (`leads`) não contam.
 */
export function seededButUnused({
  appCollections,
  seededCollections,
}: Pick<CoverageInput, 'appCollections' | 'seededCollections'>): string[] {
  const app = new Set(appCollections);
  const guarded = new Set(DEMO_GUARDED_COLLECTIONS);
  return dedupeSorted(seededCollections.filter((name) => !app.has(name) && !guarded.has(name)));
}

/**
 * Valores de um enum que NÃO aparecem no texto dos seeds. Busca o literal entre
 * aspas, do jeito que o seed grava (`status: 'paid'`), para não casar com uma
 * palavra solta dentro de uma frase de copy.
 */
export function missingEnumValues(members: string[], seedSource: string): string[] {
  return members.filter((member) => {
    const quoted = new RegExp(`['"]${member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    return !quoted.test(seedSource);
  });
}

// ---------------------------------------------------------------------------
// A demo DEPLOYADA (apphosting.demo.yaml) — dado semeado não basta: o módulo
// que desenha a tela precisa estar ligado naquele ambiente.
// ---------------------------------------------------------------------------

/**
 * Módulo opt-in por instância → coleções cujo dado só aparece com ele ligado.
 * Semear `deals` sem `VITE_MARKETPLACE_ENABLED` na demo deployada é dado
 * invisível: a rota nem é registrada e o item some da sidebar (foi o que se
 * achou ao destravar o deploy em 17/08/2026).
 */
export const DEMO_MODULE_FLAGS: Array<{
  flag: string;
  expected: string;
  gatedCollections: string[];
}> = [
  {
    flag: 'VITE_MARKETPLACE_ENABLED',
    expected: 'true',
    gatedCollections: ['deals', 'partnership_requests'],
  },
];

/** Valor de uma env declarada num apphosting*.yaml (`value:`), ou null. */
export function readYamlEnvValue(yamlSource: string, variable: string): string | null {
  const block = new RegExp(
    `-\\s*variable:\\s*${variable}\\s*\\n(?:\\s+#[^\\n]*\\n)*\\s+value:\\s*['"]?([^'"\\n]+)['"]?`,
  ).exec(yamlSource);
  return block ? block[1].trim() : null;
}

/** Envs do yaml base servidas por Secret Manager (`secret:` em vez de `value:`). */
export function parseSecretBackedVars(yamlSource: string): string[] {
  const found = [...yamlSource.matchAll(/-\s*variable:\s*([A-Z0-9_]+)\s*\n(?:\s+#[^\n]*\n)*\s+secret:/g)]
    .map((m) => m[1]);
  return dedupeSorted(found);
}

/**
 * Módulos que a demo semeia dado mas não liga no ambiente deployado. Cada item é
 * uma tela que existe local (onde o dev-demo liga a flag) e desaparece em produção.
 */
export function unwiredDemoModules({
  demoYaml,
  seededCollections,
  flags = DEMO_MODULE_FLAGS,
}: {
  demoYaml: string;
  seededCollections: string[];
  flags?: typeof DEMO_MODULE_FLAGS;
}): string[] {
  const seeded = new Set(seededCollections);
  return flags
    .filter(({ gatedCollections }) => gatedCollections.some((c) => seeded.has(c)))
    .filter(({ flag, expected }) => readYamlEnvValue(demoYaml, flag) !== expected)
    .map(({ flag }) => flag);
}

/**
 * Envs do base que a instância NÃO neutraliza com um `value:` plain e que também
 * não estão na lista de secrets que aquela instância cria de verdade.
 *
 * POR QUE: o yaml base referencia secrets que só existem no projeto da instância 0
 * (affiliate-api-key, otg-links-*, otg-dash-*). Num projeto novo, o rollout FALHA na
 * validação de secret inexistente — e falha DEPOIS de todo o resto do playbook, que
 * é o pior momento para descobrir. Ver o histórico em PRODUTIZACAO.md (lição de
 * 2026-07-07: `value: 'unused'`, nunca string vazia, que também reprova).
 */
export function unneutralizedSecrets({
  baseYaml,
  instanceYaml,
  secretsCreatedByInstance,
}: {
  baseYaml: string;
  instanceYaml: string;
  secretsCreatedByInstance: string[];
}): string[] {
  const created = new Set(secretsCreatedByInstance);
  return parseSecretBackedVars(baseYaml).filter(
    (variable) => !created.has(variable) && readYamlEnvValue(instanceYaml, variable) === null,
  );
}
