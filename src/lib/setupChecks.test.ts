import { describe, it, expect } from 'vitest';
import {
  checkAffiliatesSemTaxa,
  checkAffiliatesSemAcesso,
  checkEspeciaisSemFlag,
  checkCasasSemIss,
  checkCasasManuaisSemRegua,
  checkPullSemChave,
  checkVinculoIntegracao,
  checkCasasOtgSemFonte,
  checkCasasSemAcordo,
  runSetupChecks,
} from './setupChecks';

describe('runSetupChecks', () => {
  it('sem dado nenhum, não inventa achado', () => {
    expect(runSetupChecks({})).toEqual([]);
    expect(runSetupChecks({ affiliates: [], houses: [], integrations: [] })).toEqual([]);
  });

  it('ordena por severidade: critical antes de warning antes de info', () => {
    const findings = runSetupChecks({
      affiliates: [
        { id: 'a1', name: 'Fulano' },
        { id: 'esp1', name: 'Gerente' },
      ],
      configs: { esp1: { cpaValue: 100 } },
      users: [{ uid: 'u1', affiliateId: 'esp1', isSpecial: false }],
      specials: { esp1: { affiliateId: 'esp1', active: true } },
    });
    const severities = findings.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2 } as const;
      return rank[a] - rank[b];
    }));
    expect(findings[0].id).toBe('especiais-sem-flag');
  });
});

describe('checkAffiliatesSemTaxa', () => {
  const roster = [
    { id: 'a1', name: 'Sem Config' },
    { id: 'a2', name: 'Com Config' },
  ];

  it('aponta quem não tem doc de config (presença do doc, não valor)', () => {
    const finding = checkAffiliatesSemTaxa(roster, { a2: { cpaValue: 0 } }, {}, []);
    expect(finding?.subjects).toEqual(['Sem Config']);
    expect(finding?.fixRoute).toBe('/affiliates');
    // Doc salvo em 0/0 conta como configurado (a decisão de zero é deliberada).
    expect(finding?.subjects).not.toContain('Com Config');
  });

  it('exclui pré-cadastro, sub de especial ativo e afiliado de login admin', () => {
    const finding = checkAffiliatesSemTaxa(
      [
        { id: 'pending_x', name: 'Pendente', isPending: true },
        { id: 'sub1', name: 'Sub do Especial' },
        { id: 'adm1', name: 'Afiliado do Admin' },
        { id: 'a1', name: 'Fulano' },
      ],
      {},
      { esp: { affiliateId: 'esp', active: true, subAffiliateIds: ['sub1'] } },
      [{ uid: 'u9', affiliateId: 'adm1', role: 'admin' }],
    );
    expect(finding?.subjects).toEqual(['Fulano']);
  });

  it('sub de especial INATIVO volta a contar', () => {
    const finding = checkAffiliatesSemTaxa(
      [{ id: 'sub1', name: 'Sub Solto' }],
      {},
      { esp: { affiliateId: 'esp', active: false, subAffiliateIds: ['sub1'] } },
      [],
    );
    expect(finding?.subjects).toEqual(['Sub Solto']);
  });

  it('todo mundo configurado devolve null', () => {
    expect(checkAffiliatesSemTaxa(roster, { a1: {}, a2: {} }, {}, [])).toBeNull();
  });
});

describe('checkAffiliatesSemAcesso', () => {
  it('aponta afiliado do roster sem nenhum login vinculado', () => {
    const finding = checkAffiliatesSemAcesso(
      [
        { id: 'a1', name: 'Com Login' },
        { id: 'a2', name: 'Sem Login' },
      ],
      [{ uid: 'u1', affiliateId: 'a1' }],
    );
    expect(finding?.severity).toBe('info');
    expect(finding?.subjects).toEqual(['Sem Login']);
  });

  it('ignora pré-cadastro (fluxo de convite próprio)', () => {
    expect(
      checkAffiliatesSemAcesso([{ id: 'p1', name: 'Pendente', isPending: true }], []),
    ).toBeNull();
  });
});

describe('checkEspeciaisSemFlag', () => {
  const users = [{ uid: 'u1', affiliateId: 'esp1', isSpecial: false, email: 'g@x.com' }];

  it('especial ATIVO com login sem a flag é crítico', () => {
    const finding = checkEspeciaisSemFlag(
      { esp1: { affiliateId: 'esp1', active: true } },
      users,
      [{ id: 'esp1', name: 'Gerente' }],
    );
    expect(finding?.severity).toBe('critical');
    expect(finding?.subjects).toEqual(['Gerente']);
  });

  it('flag em dia, especial inativo ou sem login: silêncio', () => {
    expect(
      checkEspeciaisSemFlag({ esp1: { affiliateId: 'esp1', active: true } }, [
        { uid: 'u1', affiliateId: 'esp1', isSpecial: true },
      ]),
    ).toBeNull();
    expect(checkEspeciaisSemFlag({ esp1: { affiliateId: 'esp1', active: false } }, users)).toBeNull();
    // Sem login o caso é do check de acesso, não deste.
    expect(checkEspeciaisSemFlag({ esp1: { affiliateId: 'esp1', active: true } }, [])).toBeNull();
  });
});

describe('checkCasasSemIss', () => {
  it('só reclama quando HÁ casas com alíquota e outras sem (inconsistência)', () => {
    const finding = checkCasasSemIss([
      { slug: 'a', name: 'Casa A', issPercent: 5 },
      { slug: 'b', name: 'Casa B' },
    ]);
    expect(finding?.subjects).toEqual(['Casa B']);
    expect(finding?.fixRoute).toBe('/casas');
  });

  it('instância sem retenção nenhuma fica em silêncio', () => {
    expect(checkCasasSemIss([{ slug: 'a' }, { slug: 'b' }])).toBeNull();
  });

  it('casa inativa não conta em nenhum dos lados', () => {
    expect(
      checkCasasSemIss([
        { slug: 'a', issPercent: 5, active: false },
        { slug: 'b' },
      ]),
    ).toBeNull();
  });
});

describe('checkCasasManuaisSemRegua', () => {
  it('aponta casa manual sem conector e sem defaultCpa/defaultRev', () => {
    const finding = checkCasasManuaisSemRegua([
      { slug: 'a', name: 'Casa A', dataSource: 'manual' },
      { slug: 'b', name: 'Casa B', dataSource: 'manual', defaultCpa: 100 },
      { slug: 'c', name: 'Casa C', dataSource: 'manual', defaultRev: 20 },
      { slug: 'd', name: 'Casa OTG', dataSource: 'otg' },
      { slug: 'e', name: 'Com Pull', dataSource: 'manual', integration: 'esportiva-tap' },
    ]);
    expect(finding?.severity).toBe('info');
    expect(finding?.subjects).toEqual(['Casa A']);
  });
});

describe('checkPullSemChave', () => {
  const houses = [{ slug: 'esportiva-bet', name: 'Esportiva Bet', integration: 'esportiva-tap' }];

  it('conector sem chave ou desligado vira aviso com o motivo', () => {
    const semChave = checkPullSemChave(houses, [
      { id: 'esportiva-tap', label: 'TAP', enabled: true, hasKey: false, houseId: 'esportiva-bet' },
    ]);
    expect(semChave?.subjects[0]).toContain('sem chave');
    const desligado = checkPullSemChave(houses, [
      { id: 'esportiva-tap', label: 'TAP', enabled: false, hasKey: true, houseId: 'esportiva-bet' },
    ]);
    expect(desligado?.subjects[0]).toContain('desligado');
  });

  it('conector pronto não gera achado', () => {
    expect(
      checkPullSemChave(houses, [
        { id: 'esportiva-tap', enabled: true, hasKey: true, houseId: 'esportiva-bet' },
      ]),
    ).toBeNull();
  });
});

describe('checkVinculoIntegracao', () => {
  it('casa apontando para conector que mira OUTRA casa é achado (uma vez só)', () => {
    const finding = checkVinculoIntegracao(
      [{ slug: 'esportiva-bet', name: 'Esportiva Bet', integration: 'esportiva-tap' }],
      [{ id: 'esportiva-tap', label: 'TAP', enabled: true, hasKey: true, houseId: 'outra-casa' }],
    );
    expect(finding?.subjects).toHaveLength(1);
    expect(finding?.subjects[0]).toContain('Esportiva Bet');
  });

  it('conector COM chave mirando casa não vinculada de volta é achado', () => {
    const finding = checkVinculoIntegracao(
      [{ slug: 'esportiva-bet', name: 'Esportiva Bet', integration: null }],
      [{ id: 'esportiva-tap', label: 'TAP', enabled: true, hasKey: true, houseId: 'esportiva-bet' }],
    );
    expect(finding?.subjects[0]).toContain('não está vinculada');
  });

  it('conector SEM chave com alvo default do catálogo não gera ruído', () => {
    // Sem doc e sem chave, houseId vem do default do catálogo: não é vínculo.
    expect(
      checkVinculoIntegracao(
        [{ slug: 'esportiva-bet', name: 'Esportiva Bet', integration: null }],
        [{ id: 'esportiva-tap', enabled: true, hasKey: false, houseId: 'esportiva-bet' }],
      ),
    ).toBeNull();
  });

  it('vínculo fechado dos dois lados fica em silêncio', () => {
    expect(
      checkVinculoIntegracao(
        [{ slug: 'esportiva-bet', name: 'Esportiva Bet', integration: 'esportiva-tap' }],
        [{ id: 'esportiva-tap', enabled: true, hasKey: true, houseId: 'esportiva-bet' }],
      ),
    ).toBeNull();
  });

  it('conector com chave mirando casa inexistente é achado', () => {
    const finding = checkVinculoIntegracao(
      [],
      [{ id: 'leonbet-r2d', label: 'R2D', enabled: true, hasKey: true, houseId: 'leon-bet' }],
    );
    expect(finding?.subjects[0]).toContain('não existe');
  });
});

describe('checkCasasOtgSemFonte', () => {
  const houses = [{ slug: 'superbet', name: 'Superbet', dataSource: 'otg' }];

  it('com a OTG desligada, casa de origem OTG fica órfã', () => {
    const finding = checkCasasOtgSemFonte(houses, false);
    expect(finding?.subjects).toEqual(['Superbet']);
  });

  it('com a OTG ligada (ou flag ausente) não há achado', () => {
    expect(checkCasasOtgSemFonte(houses, true)).toBeNull();
    expect(checkCasasOtgSemFonte(houses, undefined)).toBeNull();
  });
});

describe('checkCasasSemAcordo', () => {
  const casas = [
    { id: 'esportiva', slug: 'esportiva', name: 'Esportiva Bet' },
    { id: 'leon', slug: 'leon', name: 'LEON Bet' },
  ];

  it('lista as casas ativas que não têm acordo publicado', () => {
    const finding = checkCasasSemAcordo(casas, [{ houseId: 'esportiva' }], true);
    expect(finding?.id).toBe('casas-sem-acordo');
    expect(finding?.severity).toBe('info');
    expect(finding?.subjects).toEqual(['LEON Bet']);
    expect(finding?.fixRoute).toBe('/acordos');
  });

  it('cala a boca quando todas as casas já têm acordo', () => {
    expect(checkCasasSemAcordo(casas, [{ houseId: 'esportiva' }, { houseId: 'leon' }], true)).toBeNull();
  });

  // Sem vitrine, casa sem acordo não é pendência: o check nunca dispara e nem
  // depende da lista de acordos (que a instância desligada sequer consegue ler).
  it('não dispara com o marketplace desligado', () => {
    expect(checkCasasSemAcordo(casas, [], false)).toBeNull();
    expect(checkCasasSemAcordo(casas, [], undefined)).toBeNull();
  });

  it('casa pausada fica de fora', () => {
    const finding = checkCasasSemAcordo([{ id: 'x', slug: 'x', name: 'Pausada', active: false }], [], true);
    expect(finding).toBeNull();
  });

  it('o acordo casa pelo slug ou pelo id da casa', () => {
    expect(checkCasasSemAcordo([{ id: 'doc-1', slug: 'esportiva', name: 'Esportiva' }], [{ houseId: 'doc-1' }], true)).toBeNull();
  });
});
