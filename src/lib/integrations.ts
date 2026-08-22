// ============================================================================
// B7 · Integrações — camada única das integrações externas por instância.
// ----------------------------------------------------------------------------
// PROBLEMA que isto resolve: ligar/desligar uma integração ou trocar a chave
// exigia editar secret no Secret Manager + REDEPLOY, porque o conector lia
// `process.env.ESPORTIVA_*` direto. Agora a fonte é `integrations/{id}` no
// Firestore (server-only) e o env vira FALLBACK — o toggle passa a valer sem
// redeploy, que é o ganho real da feature.
//
// PRECEDÊNCIA (resolveConnectorSettings): doc do Firestore VENCE o env, campo a
// campo. Instância que ainda não abriu a tela (nenhum doc gravado) continua
// funcionando exatamente como antes, lendo o env — é o que torna a migração
// silenciosa e reversível.
//
// ⚠️ A `apiKey` é CREDENCIAL: nunca sai do servidor em claro (ver `maskSecret` /
// `toPublicIntegration`) e a coleção é a mais fechada que existe depois de
// `auth_totp` — `read, write: if false` nas rules, ou seja NEM o admin lê direto;
// todo acesso passa pelo endpoint com Admin SDK. Puro e sem Firebase: o servidor
// importa daqui (invariante do repo — server.ts não importa services/).
// ============================================================================

/** Campo extra de um conector, renderizado como input na tela. */
export interface IntegrationField {
  key: string;
  label: string;
  hint?: string;
  type?: 'text' | 'number';
  placeholder?: string;
}

export interface IntegrationSpec {
  id: string;
  label: string;
  description: string;
  /** Casa a que o conector se liga (Esportiva é uma CASA, não um gateway). */
  scope: 'house' | 'global';
  /**
   * true = UMA credencial atende VÁRIAS casas (rede, ex.: Fomento/Offer18).
   * O vínculo NÃO passa por `applyIntegrationLink` (que é 1:1 e limparia a casa
   * anterior): cada casa carrega a flag `integration` + o id externo dela
   * (`integrationExternalId`, ex.: o offer_id da rede) no próprio doc.
   */
  multiHouse?: boolean;
  /**
   * true = a rede EMPURRA o dado (postback/webhook) em vez de a gente puxar.
   * Não há rodada de pull nem botão "Atualizar": a chave é o SEGREDO da URL que
   * autentica o disparo. Separado de `multiHouse` de propósito: uma rede 1:N que
   * se puxa por relatório e um postback de casa única são combinações possíveis,
   * e quem fala com o usuário (avisos de configuração) precisa do eixo certo.
   */
  push?: boolean;
  /** Envs que serviam de fonte antes desta tela — viram fallback. */
  envKeys: { apiKey: string; house?: string; [k: string]: string | undefined };
  /** Casa assumida quando nem o doc nem o env dizem qual é. */
  defaultHouseSlug?: string;
  fields: IntegrationField[];
}

// Catálogo FECHADO: id desconhecido é recusado no endpoint (nada de coleção
// virando depósito de doc arbitrário). Integração nova entra aqui + um conector
// no PULL_CONNECTORS do server.
export const INTEGRATION_CATALOG: IntegrationSpec[] = [
  {
    id: 'esportiva-tap',
    label: 'Esportiva Bet (TAP by Smartico)',
    description:
      'Puxa o relatório de resultados da casa automaticamente (rodada horária + botão "Atualizar" em /casas), no lugar do export manual em planilha.',
    scope: 'house',
    envKeys: {
      apiKey: 'ESPORTIVA_API_KEY',
      house: 'ESPORTIVA_HOUSE_SLUG',
      apiBase: 'ESPORTIVA_API_BASE',
      cpaBase: 'ESPORTIVA_CPA_BASE',
    },
    defaultHouseSlug: 'esportiva-bet',
    fields: [
      {
        key: 'cpaBase',
        label: 'Valor do CPA na casa (R$)',
        type: 'number',
        placeholder: '120',
        hint: 'A API devolve a comissão em DINHEIRO; a CONTAGEM de CPA sai de dividir por este valor. Mudou na casa? Mude aqui no mesmo dia.',
      },
      {
        key: 'apiBase',
        label: 'Host da API (opcional)',
        placeholder: 'https://boapi3.smartico.ai',
        hint: 'Só mexa se a casa trocar de host. Os hosts api.aff.esportiva.bet e boapi.smartico.ai ficam atrás de Cloudflare e recusam a chamada.',
      },
    ],
  },
  {
    id: 'leonbet-r2d',
    label: 'LEON Bet (R2D Partners)',
    description:
      'Puxa o relatório de estatísticas da casa automaticamente (rodada diária), no lugar do export manual. A API já devolve CPA como contagem, sem precisar de régua.',
    scope: 'house',
    envKeys: {
      apiKey: 'LEONBET_API_TOKEN',
      house: 'LEONBET_HOUSE_SLUG',
      merchant: 'LEONBET_MERCHANT_ID',
    },
    defaultHouseSlug: 'leon-bet',
    fields: [
      {
        key: 'merchant',
        label: 'ID da marca (merchant)',
        type: 'number',
        placeholder: '1',
        hint: 'A conta R2D gerencia LEON/Twin/Slott no mesmo login (1 = LEON). Confira em "Statistics retrieval API" no painel deles.',
      },
    ],
  },
  {
    // A 1ª integração por POSTBACK (push): a rede chama a gente a cada conversão,
    // não há pull de relatório. A "chave" aqui é o SEGREDO da URL de postback, que
    // o admin inventa e cola nos dois lados. Ver src/lib/fomentoPostback.ts.
    id: 'fomento-offer18',
    label: 'Fomento (rede Offer18)',
    description:
      'Recebe o postback da rede a cada conversão: "lead" vira cadastro e "ftd" vira FTD e CPA na casa vinculada. ' +
      'Uma credencial atende várias casas: cada casa aponta a oferta dela no campo "ID da oferta" do modal de /casas. ' +
      'No painel da Fomento (Offers, postagem global), cole a URL desta instância: ' +
      'https://SEU-DOMINIO/api/postback/fomento?s=SEGREDO&offer={offerid}&event={event_token}&click={aff_click_id}&tag={sub_aff_id}&payout={payout}&currency={currency}&player={ig-user-id} ' +
      'trocando SEGREDO pelo valor salvo aqui.',
    scope: 'global',
    multiHouse: true,
    push: true,
    envKeys: { apiKey: 'FOMENTO_POSTBACK_SECRET' },
    fields: [],
  },
];

export const findIntegrationSpec = (id: unknown): IntegrationSpec | null =>
  INTEGRATION_CATALOG.find((i) => i.id === String(id ?? '').trim()) ?? null;

/** Doc `integrations/{id}` como vive no Firestore. */
export interface IntegrationDoc {
  id: string;
  enabled: boolean;
  apiKey: string;
  houseId: string | null;
  config: Record<string, string>;
  updatedAt?: unknown;
  updatedBy?: string | null;
}

/** O que o CLIENTE recebe — a chave só como máscara, nunca em claro. */
export interface PublicIntegration {
  id: string;
  label: string;
  description: string;
  scope: 'house' | 'global';
  /** Rede 1:N (ver IntegrationSpec.multiHouse) — o modal de /casas pede o id externo. */
  multiHouse?: boolean;
  /** Recebe por postback (ver IntegrationSpec.push): não existe pull nem alvo 1:1. */
  push?: boolean;
  fields: IntegrationField[];
  enabled: boolean;
  hasKey: boolean;
  keyMask: string;
  /** true = a chave vem do env (Secret Manager), não desta tela. */
  keyFromEnv: boolean;
  houseId: string | null;
  config: Record<string, string>;
  configured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Máscara de exibição da chave: só o rabicho. NUNCA devolva a chave inteira ao
 * browser — o padrão do repo p/ credencial é o servidor guardar e o client ver
 * apenas que existe.
 */
export function maskSecret(value: unknown): string {
  const s = str(value);
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

/**
 * Normaliza o que o admin manda no PUT. Campo ausente = "não mexe" (undefined),
 * distinto de "apagar" (string vazia) — é o que permite salvar o toggle sem
 * reenviar a chave. `apiKey` só entra no patch quando veio texto: senão salvar a
 * tela (que recebe a chave MASCARADA, não a real) apagaria a credencial.
 */
export function sanitizeIntegrationPatch(
  input: unknown,
  spec: IntegrationSpec,
): Partial<Pick<IntegrationDoc, 'enabled' | 'apiKey' | 'houseId' | 'config'>> {
  const body = (input ?? {}) as Record<string, unknown>;
  const patch: Partial<Pick<IntegrationDoc, 'enabled' | 'apiKey' | 'houseId' | 'config'>> = {};

  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

  // Só grava chave nova quando o admin DIGITOU algo. `null` explícito remove.
  if (body.apiKey === null) patch.apiKey = '';
  else if (typeof body.apiKey === 'string' && body.apiKey.trim()) patch.apiKey = body.apiKey.trim();

  if (body.houseId === null) patch.houseId = null;
  else if (typeof body.houseId === 'string') patch.houseId = str(body.houseId) || null;

  if (body.config && typeof body.config === 'object' && !Array.isArray(body.config)) {
    const raw = body.config as Record<string, unknown>;
    const out: Record<string, string> = {};
    // Só os campos DECLARADOS no catálogo — chave desconhecida não entra no doc.
    for (const f of spec.fields) {
      if (raw[f.key] === undefined) continue;
      out[f.key] = str(raw[f.key]);
    }
    patch.config = out;
  }

  return patch;
}

export function integrationFromDoc(id: string, data: unknown): IntegrationDoc {
  const d = (data ?? {}) as Record<string, unknown>;
  const config: Record<string, string> = {};
  if (d.config && typeof d.config === 'object' && !Array.isArray(d.config)) {
    for (const [k, v] of Object.entries(d.config as Record<string, unknown>)) config[k] = str(v);
  }
  return {
    id,
    // Doc que existe sem `enabled` explícito conta como LIGADO: quem gravou a
    // chave pela tela quer usá-la; desligar é ato deliberado.
    enabled: d.enabled === undefined ? true : d.enabled === true,
    apiKey: str(d.apiKey),
    houseId: str(d.houseId) || null,
    config,
  };
}

/**
 * O que o conector realmente usa em runtime. Doc do Firestore VENCE o env campo
 * a campo; ausência total de doc = comportamento antigo (100% env).
 *
 * `enabled` é a única coisa que só existe no doc: sem doc, "configurado" segue
 * sendo "tem env" — instância que nunca abriu a tela não pode parar de puxar.
 */
export interface ConnectorSettings {
  enabled: boolean;
  apiKey: string;
  houseSlug: string;
  config: Record<string, string>;
  /** true = tem chave E está ligado (o que `configured()` responde ao /casas). */
  configured: boolean;
  /** De onde veio a chave em uso — só p/ exibição/diagnóstico. */
  keyFromEnv: boolean;
}

export function resolveConnectorSettings(
  spec: IntegrationSpec,
  doc: IntegrationDoc | null,
  env?: Record<string, unknown> | null,
  defaults: { houseSlug?: string } = {},
): ConnectorSettings {
  const e = (env ?? {}) as Record<string, unknown>;
  const envKey = str(e[spec.envKeys.apiKey]);
  const docKey = doc ? str(doc.apiKey) : '';
  const apiKey = docKey || envKey;

  const envHouse = spec.envKeys.house ? str(e[spec.envKeys.house]) : '';
  const houseSlug =
    (doc?.houseId ? str(doc.houseId) : '') || envHouse || str(defaults.houseSlug) || str(spec.defaultHouseSlug);

  const config: Record<string, string> = {};
  for (const f of spec.fields) {
    const envName = spec.envKeys[f.key];
    const fromEnv = envName ? str(e[envName]) : '';
    const fromDoc = str(doc?.config?.[f.key]);
    const value = fromDoc || fromEnv;
    if (value) config[f.key] = value;
  }

  const enabled = doc ? doc.enabled : true;
  return {
    enabled,
    apiKey,
    houseSlug,
    config,
    configured: enabled && !!apiKey,
    keyFromEnv: !docKey && !!envKey,
  };
}

/** Junta catálogo + doc + env no shape que a tela consome (chave mascarada). */
export function toPublicIntegration(
  spec: IntegrationSpec,
  doc: IntegrationDoc | null,
  env?: Record<string, unknown> | null,
  meta: { updatedAt?: string | null; updatedBy?: string | null; defaultHouseSlug?: string } = {},
): PublicIntegration {
  const settings = resolveConnectorSettings(spec, doc, env, { houseSlug: meta.defaultHouseSlug });
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    scope: spec.scope,
    multiHouse: spec.multiHouse === true,
    push: spec.push === true,
    fields: spec.fields,
    enabled: settings.enabled,
    hasKey: !!settings.apiKey,
    keyMask: maskSecret(settings.apiKey),
    keyFromEnv: settings.keyFromEnv,
    houseId: settings.houseSlug || null,
    config: settings.config,
    configured: settings.configured,
    updatedAt: meta.updatedAt ?? null,
    updatedBy: meta.updatedBy ?? null,
  };
}

/** Número positivo de um campo de config, com default (ex.: cpaBase). */
export function numericSetting(config: Record<string, string> | undefined, key: string, fallback: number): number {
  const n = Number(config?.[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ——— Origem dos resultados de uma CASA (o seletor do modal de /casas) ————————
//
// São DOIS eixos no banco, e é isso que confundia a tela: `dataSource`
// ('otg' | 'manual') diz de QUEM é o dado — da API da OTG ou gerido aqui — e
// `integration` diz COMO ele chega quando é gerido aqui (conector vs planilha).
// A Esportiva é `dataSource:'manual'` + `integration:'esportiva-tap'`: pull
// automático de verdade, mas o modal só olhava o 1º eixo e a exibia como "Upload
// manual". O seletor passa a falar em 3 modos, e a gravação recompõe os 2 campos
// — `dataSource` continua binário, então nada mais no app precisou mudar.
export type HouseResultsMode = 'otg' | 'integration' | 'manual';

export function houseResultsMode(house?: { dataSource?: string | null; integration?: string | null } | null): HouseResultsMode {
  if (!house) return 'manual'; // casa nova nasce recebendo upload
  if (house.dataSource === 'otg') return 'otg';
  return str(house.integration) ? 'integration' : 'manual';
}

/** Recompõe os dois campos a partir do modo escolhido na tela. */
export function houseModePayload(
  mode: HouseResultsMode,
  integrationId?: string | null,
): { dataSource: 'otg' | 'manual'; integration: string | null } {
  if (mode === 'otg') return { dataSource: 'otg', integration: null };
  if (mode === 'integration') return { dataSource: 'manual', integration: str(integrationId) || null };
  return { dataSource: 'manual', integration: null };
}
