// @vitest-environment node
// A TRAVA de cobertura da demo rodando contra os arquivos DE VERDADE do repo.
//
// Quando um destes testes falha, o conserto NÃO é mexer no teste: é semear o
// cenário em scripts/provision/seed-demo-extras.cjs (ou declarar a isenção com
// motivo em src/lib/demoCoverage.ts). A mensagem de falha diz qual dos dois.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEMO_EXEMPTIONS,
  missingEnumValues,
  missingFromDemo,
  parseCodeCollections,
  parseRulesCollections,
  parseSecretBackedVars,
  parseUnionMembers,
  readYamlEnvValue,
  seededButUnused,
  staleExemptions,
  unneutralizedSecrets,
  unwiredDemoModules,
} from './demoCoverage';

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const SEED_BASE = 'scripts/provision/seed-demo.cjs';
const SEED_EXTRAS = 'scripts/provision/seed-demo-extras.cjs';

const seedSource = `${read(SEED_BASE)}\n${read(SEED_EXTRAS)}`;

const appCollections = (() => {
  const all = new Set<string>([
    ...parseRulesCollections(read('firestore.rules')),
    ...parseCodeCollections(read('server.ts')),
  ]);
  const servicesDir = path.join(ROOT, 'src/services');
  for (const file of fs.readdirSync(servicesDir)) {
    if (!file.endsWith('.ts') || file.includes('.test.')) continue;
    for (const name of parseCodeCollections(read(`src/services/${file}`))) all.add(name);
  }
  return [...all].sort();
})();

const seededCollections = parseCodeCollections(seedSource);

describe('cobertura da demo · coleções', () => {
  it('toda coleção que o app usa está semeada ou tem isenção declarada', () => {
    const missing = missingFromDemo({ appCollections, seededCollections });
    expect(
      missing,
      `Coleções sem dado na demo: ${missing.join(', ')}.\n`
      + `A demo é a peça comercial (gravação de mídia, apresentação a lead, instância deployada) e uma\n`
      + `coleção vazia vira tela em empty state, sem erro nenhum na cara de quem assiste.\n`
      + `Conserto: semear em ${SEED_EXTRAS}, ou declarar a isenção com motivo em\n`
      + `src/lib/demoCoverage.ts (DEMO_EXEMPTIONS).`,
    ).toEqual([]);
  });

  it('não há isenção órfã apontando para coleção que saiu do app', () => {
    const stale = staleExemptions({ appCollections });
    expect(
      stale,
      `Isenções órfãs em DEMO_EXEMPTIONS: ${stale.join(', ')}. Remova as entradas — a lista só`
      + ' serve enquanto cada motivo se referir a algo que ainda existe.',
    ).toEqual([]);
  });

  it('não há coleção semeada que o app não usa (nome errado no seed)', () => {
    const unused = seededButUnused({ appCollections, seededCollections });
    expect(
      unused,
      `Os seeds escrevem coleções que o app não lê: ${unused.join(', ')}. Provável erro de nome`
      + ' (o dado fica invisível na demo) ou sobra de feature removida.',
    ).toEqual([]);
  });

  it('reconhece as coleções centrais (o parser não silenciou)', () => {
    // Guarda contra o cenário pior: um parser que deixa de casar e faz todos os
    // testes acima passarem por vacuidade.
    expect(appCollections).toContain('house_results');
    expect(appCollections).toContain('withdrawal_requests');
    expect(appCollections.length).toBeGreaterThan(25);
    expect(seededCollections.length).toBeGreaterThan(25);
  });
});

describe('a demo DEPLOYADA (apphosting.demo.yaml)', () => {
  // Dado semeado não basta: o módulo que desenha a tela tem que estar ligado no
  // ambiente. Local o dev-demo.mjs liga; em produção quem liga é este yaml.
  const demoYaml = read('apphosting.demo.yaml');
  const baseYaml = read('apphosting.yaml');

  it('liga todo módulo cujo dado a demo semeia', () => {
    const unwired = unwiredDemoModules({ demoYaml, seededCollections });
    expect(
      unwired,
      `A demo semeia dado que o ambiente deployado não mostra. Flags a declarar em\n`
      + `apphosting.demo.yaml: ${unwired.join(', ')}.\n`
      + `Sem a flag a rota nem é registrada, o item some da sidebar e o endpoint responde 404 —\n`
      + `o dado semeado fica invisível, sem nenhum erro na tela de quem está assistindo.`,
    ).toEqual([]);
  });

  it('é OTG-free (padrão de venda white-label)', () => {
    expect(readYamlEnvValue(demoYaml, 'VITE_OTG_ENABLED')).toBe('false');
  });

  it('neutraliza os secrets do base que só existem no projeto da instância 0', () => {
    // A demo cria de verdade só estes dois (playbook § "Instância DEMO", passo 6).
    const secretsCreatedByInstance = ['FIREBASE_SERVICE_ACCOUNT_KEY', 'RANKING_CRON_SECRET'];
    const missing = unneutralizedSecrets({ baseYaml, instanceYaml: demoYaml, secretsCreatedByInstance });
    expect(
      missing,
      `Envs do apphosting.yaml base servidas por Secret Manager e sem override na demo:\n`
      + `${missing.join(', ')}.\n`
      + `Esses secrets só existem no projeto da instância 0: no projeto affiliacore o ROLLOUT FALHA\n`
      + `na validação de secret inexistente. Declare cada uma no apphosting.demo.yaml com\n`
      + `value: 'unused' (NUNCA string vazia — env vazio também reprova).`,
    ).toEqual([]);
  });

  it('o parser de yaml está funcionando (guarda contra vacuidade)', () => {
    expect(parseSecretBackedVars(baseYaml)).toContain('AFFILIATE_API_KEY');
    expect(readYamlEnvValue(demoYaml, 'AFFILIATE_API_KEY')).toBe('unused');
    expect(readYamlEnvValue(demoYaml, 'VITE_BRAND_NAME')).toBe('AffiliaCore Demo');
    expect(readYamlEnvValue(demoYaml, 'NAO_EXISTE_ESSA_VAR')).toBeNull();
  });
});

describe('cobertura da demo · a trava pega o caso novo', () => {
  // Prova que os testes acima não passam por vacuidade: com entrada sintética, a
  // coleção nova aparece como buraco e o enum novo também.
  it('coleção nova (nem semeada nem isenta) é apontada', () => {
    const missing = missingFromDemo({
      appCollections: ['houses', 'coisa_nova'],
      seededCollections: ['houses'],
      exemptions: {},
    });
    expect(missing).toEqual(['coisa_nova']);
  });

  it('isenção declarada silencia a coleção, e só ela', () => {
    const missing = missingFromDemo({
      appCollections: ['houses', 'coisa_nova', 'outra_nova'],
      seededCollections: ['houses'],
      exemptions: { coisa_nova: { reason: 'motivo declarado' } },
    });
    expect(missing).toEqual(['outra_nova']);
  });

  it('a coleção protegida (leads) não conta como buraco nem como sobra', () => {
    expect(missingFromDemo({
      appCollections: ['leads'],
      seededCollections: [],
      exemptions: {},
    })).toEqual([]);
    expect(seededButUnused({ appCollections: [], seededCollections: ['leads'] })).toEqual([]);
  });

  it('estado novo de um enum é apontado quando o seed não o grava', () => {
    const seed = "status: 'requested'";
    expect(missingEnumValues(['requested', 'estado_novo'], seed)).toEqual(['estado_novo']);
  });

  it('lê os membros tanto da união de tipos quanto do array de constantes', () => {
    expect(parseUnionMembers("export type X = 'a' | 'b';", 'X')).toEqual(['a', 'b']);
    expect(parseUnionMembers("export const XS: X[] = ['c', 'd'];", 'XS')).toEqual(['c', 'd']);
  });

  it('módulo desligado no yaml da demo é apontado quando há dado semeado', () => {
    const yamlSemFlag = "env:\n  - variable: VITE_OTG_ENABLED\n    value: 'false'\n";
    expect(unwiredDemoModules({ demoYaml: yamlSemFlag, seededCollections: ['deals'] }))
      .toEqual(['VITE_MARKETPLACE_ENABLED']);
    // sem dado semeado do módulo, a flag ausente não é problema
    expect(unwiredDemoModules({ demoYaml: yamlSemFlag, seededCollections: ['houses'] })).toEqual([]);
  });

  it('secret do base sem override na instância é apontado', () => {
    const base = "env:\n  - variable: MINHA_CHAVE\n    secret: minha-chave\n";
    expect(unneutralizedSecrets({ baseYaml: base, instanceYaml: 'env:\n', secretsCreatedByInstance: [] }))
      .toEqual(['MINHA_CHAVE']);
    expect(unneutralizedSecrets({
      baseYaml: base,
      instanceYaml: "env:\n  - variable: MINHA_CHAVE\n    value: 'unused'\n",
      secretsCreatedByInstance: [],
    })).toEqual([]);
  });

  it('toda isenção traz motivo escrito (a lista serve para quem vem depois)', () => {
    for (const [name, { reason }] of Object.entries(DEMO_EXEMPTIONS)) {
      expect(reason.length, `A isenção de ${name} precisa de um motivo de verdade.`).toBeGreaterThan(30);
    }
  });
});

describe('cobertura da demo · estados de domínio', () => {
  // Enum novo sem dado na demo é o mesmo buraco de uma coleção vazia: a aba existe
  // e nunca tem uma linha. O membro é lido do PRÓPRIO arquivo de domínio, então
  // adicionar um status ao produto quebra este teste até a demo mostrá-lo.
  const cases: Array<{ label: string; file: string; symbol: string }> = [
    { label: 'status de saque', file: 'src/lib/withdrawal.ts', symbol: 'WithdrawalStatus' },
    { label: 'status de parceria', file: 'src/lib/partnership.ts', symbol: 'PartnershipStatus' },
    { label: 'tipo de deal', file: 'src/lib/dealType.ts', symbol: 'DealTypeId' },
    { label: 'ciclo de pagamento do acordo', file: 'src/lib/deal.ts', symbol: 'PaymentCycle' },
    { label: 'status de solicitação de conquista', file: 'src/lib/achievements.ts', symbol: 'REQUEST_STATUSES' },
    { label: 'categoria de aviso', file: 'src/services/noticeService.ts', symbol: 'NoticeCategory' },
    { label: 'público do aviso', file: 'src/services/noticeService.ts', symbol: 'NoticeAudience' },
  ];

  for (const { label, file, symbol } of cases) {
    it(`a demo tem dado em todo ${label}`, () => {
      const members = parseUnionMembers(read(file), symbol);
      expect(members.length, `Não consegui ler os valores de ${symbol} em ${file}.`).toBeGreaterThan(1);
      const missing = missingEnumValues(members, seedSource);
      expect(
        missing,
        `${label}: a demo não tem nenhum registro em ${missing.join(', ')} (declarados em ${file}).\n`
        + `Sem isso a aba/filtro correspondente abre sempre vazia na demonstração.\n`
        + `Conserto: semear ao menos um registro de cada estado em ${SEED_EXTRAS}.`,
      ).toEqual([]);
    });
  }
});
