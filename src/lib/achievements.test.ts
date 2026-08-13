import { describe, it, expect } from 'vitest';
import {
  totalsFromBrandRows,
  sanitizeTier,
  sanitizeTierPatch,
  parseMetaValue,
  tierProgress,
  sortTiers,
  nextTier,
  unlockedTiers,
  requestForTier,
  canRequestTier,
  tierMetaLabel,
  previewTotals,
  resolveAchievementScope,
  PREVIEW_FRACTION,
  TIER_IMAGE_MAX_CHARS,
  type AchievementTier,
} from './achievements';

const tier = (over: Partial<AchievementTier> = {}): AchievementTier => ({
  id: 't1',
  title: 'Placa de 10K',
  subtitle: 'SILVER',
  description: '',
  metaCpas: 0,
  metaCommission: 10_000,
  order: 0,
  active: true,
  imageUrl: '',
  ...over,
});

describe('parseMetaValue', () => {
  it('number finito é aceito', () => {
    expect(parseMetaValue(10000.5)).toBe(10000.5);
  });
  it('string com PONTO decimal', () => {
    expect(parseMetaValue('10000.50')).toBe(10000.5);
  });
  it('string pt-BR com vírgula decimal', () => {
    expect(parseMetaValue('10000,50')).toBe(10000.5);
  });
  it('string pt-BR completa com milhar e R$', () => {
    expect(parseMetaValue('R$ 10.000,50')).toBe(10000.5);
  });
  it('vazio/ausente vira 0 (meta ignorada), não erro', () => {
    expect(parseMetaValue('')).toBe(0);
    expect(parseMetaValue('   ')).toBe(0);
    expect(parseMetaValue(undefined)).toBe(0);
    expect(parseMetaValue(null)).toBe(0);
  });
  it.each([
    ['negativa', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('number inválido (%s) → null', (_label, v) => {
    expect(parseMetaValue(v)).toBeNull();
  });
  it.each([
    ['lixo', 'abc'],
    ['negativa em string', '-5'],
    ['objeto', {}],
  ])('entrada inválida (%s) → null', (_label, v) => {
    expect(parseMetaValue(v)).toBeNull();
  });
});

describe('sanitizeTier', () => {
  it('entrada válida completa → value saneado com defaults', () => {
    const r = sanitizeTier({ title: '  Placa de 10K  ', metaCommission: '10.000,00' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      title: 'Placa de 10K',
      subtitle: '',
      description: '',
      metaCpas: 0,
      metaCommission: 10_000,
      order: 0,
      active: true,
      imageUrl: '',
    });
  });
  it('sem título → erro', () => {
    expect(sanitizeTier({ metaCpas: 10 }).ok).toBe(false);
  });
  it('sem NENHUMA meta > 0 → erro (0 = ignorar, como no legado)', () => {
    const r = sanitizeTier({ title: 'X', metaCpas: 0, metaCommission: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/meta/i);
  });
  it('meta inválida → erro', () => {
    expect(sanitizeTier({ title: 'X', metaCpas: 'abc' }).ok).toBe(false);
  });
  it('ordem decimal/negativa → erro', () => {
    expect(sanitizeTier({ title: 'X', metaCpas: 1, order: 1.5 }).ok).toBe(false);
    expect(sanitizeTier({ title: 'X', metaCpas: 1, order: -1 }).ok).toBe(false);
  });
  it('imageUrl https e data:image são aceitas; outros esquemas não', () => {
    expect(sanitizeTier({ title: 'X', metaCpas: 1, imageUrl: 'https://cdn/placa.png' }).ok).toBe(true);
    expect(
      sanitizeTier({ title: 'X', metaCpas: 1, imageUrl: 'data:image/png;base64,iVBOR' }).ok,
    ).toBe(true);
    expect(sanitizeTier({ title: 'X', metaCpas: 1, imageUrl: 'http://inseguro/p.png' }).ok).toBe(false);
    expect(sanitizeTier({ title: 'X', metaCpas: 1, imageUrl: 'javascript:alert(1)' }).ok).toBe(false);
  });
  it('data URL acima do teto → erro (doc do Firestore e onSnapshot de todo mundo)', () => {
    const huge = `data:image/png;base64,${'A'.repeat(TIER_IMAGE_MAX_CHARS)}`;
    expect(sanitizeTier({ title: 'X', metaCpas: 1, imageUrl: huge }).ok).toBe(false);
  });
});

describe('sanitizeTierPatch', () => {
  it('só saneia campos presentes', () => {
    const r = sanitizeTierPatch({ title: ' Novo ', active: 0 });
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ title: 'Novo', active: false });
  });
  it('campo presente e inválido derruba o patch inteiro', () => {
    expect(sanitizeTierPatch({ title: 'Ok', metaCpas: 'abc' }).ok).toBe(false);
  });
  it('patch vazio → erro', () => {
    expect(sanitizeTierPatch({}).ok).toBe(false);
  });
  it('meta pode ser zerada no patch (validação combinada fica na rota)', () => {
    const r = sanitizeTierPatch({ metaCommission: '' });
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ metaCommission: 0 });
  });
});

describe('totalsFromBrandRows', () => {
  it('soma CPAs e o REPASSE por casa (taxa byBrand vence a de topo)', () => {
    const rows = [
      { id: 'superbet', qualified_cpa: 10, rvs: 0 },
      { id: 'stake', qualified_cpa: 5, rvs: 0 },
    ];
    const config = {
      affiliateId: 'A1',
      cpaValue: 100,
      revPercentage: 0,
      byBrand: { stake: { cpaValue: 160 } },
    } as any;
    // 10×100 (topo) + 5×160 (override da Stake)
    expect(totalsFromBrandRows(rows, config)).toEqual({ cpas: 15, commission: 1800 });
  });

  it('inclui o REV no repasse', () => {
    const rows = [{ id: 'casa', qualified_cpa: 0, rvs: 1000 }];
    const config = { affiliateId: 'A1', cpaValue: 0, revPercentage: 25 } as any;
    expect(totalsFromBrandRows(rows, config).commission).toBe(250);
  });

  it('sem config o repasse é 0 (ausência ≠ taxa), mas os CPAs continuam contando', () => {
    const rows = [{ id: 'casa', qualified_cpa: 7 }];
    expect(totalsFromBrandRows(rows, null)).toEqual({ cpas: 7, commission: 0 });
  });

  it('linhas vazias/nulas não quebram nem propagam NaN', () => {
    expect(totalsFromBrandRows(null, null)).toEqual({ cpas: 0, commission: 0 });
    expect(totalsFromBrandRows([{ id: 'x', qualified_cpa: 'abc' }], { cpaValue: 10 } as any)).toEqual({
      cpas: 0,
      commission: 0,
    });
  });
});

describe('tierProgress', () => {
  it('meta única de comissão: fração proporcional e clamp em 1', () => {
    const t = tier({ metaCommission: 10_000 });
    expect(tierProgress(t, { cpas: 0, commission: 2_500 }).fraction).toBe(0.25);
    expect(tierProgress(t, { cpas: 0, commission: 15_000 })).toEqual({ fraction: 1, unlocked: true });
  });
  it('duas metas definidas exigem AMBAS (fração = mínimo)', () => {
    const t = tier({ metaCpas: 10, metaCommission: 1_000 });
    const p = tierProgress(t, { cpas: 10, commission: 500 });
    expect(p.fraction).toBe(0.5);
    expect(p.unlocked).toBe(false);
    expect(tierProgress(t, { cpas: 10, commission: 1_000 }).unlocked).toBe(true);
  });
  it('tier sem meta nenhuma nunca desbloqueia', () => {
    expect(tierProgress(tier({ metaCpas: 0, metaCommission: 0 }), { cpas: 99, commission: 99 })).toEqual({
      fraction: 0,
      unlocked: false,
    });
  });
  it('totais ausentes/NaN não propagam (guard de num)', () => {
    const p = tierProgress(tier(), undefined as any);
    expect(p.fraction).toBe(0);
    expect(p.unlocked).toBe(false);
  });
});

describe('sortTiers / nextTier / unlockedTiers', () => {
  const silver = tier({ id: 's', title: 'Silver', metaCommission: 1_000, order: 0 });
  const gold = tier({ id: 'g', title: 'Gold', metaCommission: 5_000, order: 0 });
  const inativo = tier({ id: 'i', title: 'Oculto', metaCommission: 100, active: false });

  it('ordena por order e desempata por dificuldade', () => {
    expect(sortTiers([gold, silver]).map((t) => t.id)).toEqual(['s', 'g']);
    const priorizado = tier({ id: 'p', metaCommission: 9_999, order: 1 });
    expect(sortTiers([priorizado, gold]).map((t) => t.id)).toEqual(['g', 'p']);
  });
  it('nextTier: primeiro ativo ainda bloqueado; inativo não conta', () => {
    const totals = { cpas: 0, commission: 1_500 };
    expect(nextTier([inativo, gold, silver], totals)?.id).toBe('g');
    expect(nextTier([silver], { cpas: 0, commission: 2_000 })).toBeUndefined();
  });
  it('unlockedTiers: só ativos e atingidos', () => {
    const totals = { cpas: 0, commission: 1_500 };
    expect(unlockedTiers([inativo, gold, silver], totals).map((t) => t.id)).toEqual(['s']);
  });
});

describe('solicitações (requestForTier / canRequestTier)', () => {
  const t = tier();
  const totals = { cpas: 0, commission: 12_000 };

  it('desbloqueado e sem pedido vivo → pode solicitar', () => {
    expect(canRequestTier(t, totals, [])).toBe(true);
  });
  it('pedido pendente ou aprovado bloqueia novo pedido', () => {
    expect(canRequestTier(t, totals, [{ tierId: 't1', status: 'pending' }])).toBe(false);
    expect(canRequestTier(t, totals, [{ tierId: 't1', status: 'approved' }])).toBe(false);
  });
  it('pedido rejeitado NÃO bloqueia (pode pedir de novo)', () => {
    expect(requestForTier([{ tierId: 't1', status: 'rejected' }], 't1')).toBeUndefined();
    expect(canRequestTier(t, totals, [{ tierId: 't1', status: 'rejected' }])).toBe(true);
  });
  it('bloqueado ou inativo → não pode solicitar', () => {
    expect(canRequestTier(t, { cpas: 0, commission: 10 }, [])).toBe(false);
    expect(canRequestTier(tier({ active: false }), totals, [])).toBe(false);
  });
});

describe('tierMetaLabel', () => {
  it('formata CPAs, R$ e o combinado', () => {
    expect(tierMetaLabel({ metaCpas: 50, metaCommission: 0 })).toBe('50 CPAs');
    expect(tierMetaLabel({ metaCpas: 0, metaCommission: 10_000 })).toBe('R$ 10.000,00');
    expect(tierMetaLabel({ metaCpas: 50, metaCommission: 10_000 })).toBe('50 CPAs + R$ 10.000,00');
  });
});

describe('previewTotals (prévia do card no admin)', () => {
  it("'unlocked' desbloqueia o tier; 'progress' não", () => {
    const t = tier({ metaCpas: 0, metaCommission: 10_000 });
    expect(tierProgress(t, previewTotals(t, 'unlocked')).unlocked).toBe(true);
    expect(tierProgress(t, previewTotals(t, 'progress')).unlocked).toBe(false);
  });

  it('CPA é contagem inteira e nunca empata com a meta em progresso', () => {
    // 1 CPA × 0,65 arredondaria para 1 com round() — e desbloquearia sozinho.
    const t = tier({ metaCpas: 1, metaCommission: 0 });
    expect(previewTotals(t, 'progress').cpas).toBe(0);
    expect(tierProgress(t, previewTotals(t, 'progress')).unlocked).toBe(false);
    expect(previewTotals(t, 'unlocked').cpas).toBe(1);
  });

  it('usa a fração ilustrativa na comissão', () => {
    const t = tier({ metaCpas: 0, metaCommission: 10_000 });
    expect(previewTotals(t, 'progress').commission).toBe(10_000 * PREVIEW_FRACTION);
  });

  it('tier sem meta nenhuma não quebra (zera os totais)', () => {
    const t = tier({ metaCpas: 0, metaCommission: 0 });
    expect(previewTotals(t, 'unlocked')).toEqual({ cpas: 0, commission: 0 });
    expect(tierProgress(t, previewTotals(t, 'unlocked')).unlocked).toBe(false);
  });
});

describe('resolveAchievementScope (a placa conta a rede)', () => {
  it('afiliado comum e especial pedem o escopo do servidor', () => {
    // Mesma decisão para os dois: quem resolve a sub-rede é o servidor
    // (special_affiliates), então a página não precisa saber quem é especial.
    expect(resolveAchievementScope('client', 'aff_1')).toBe('scoped');
    expect(resolveAchievementScope(undefined, 'aff_1')).toBe('scoped');
  });

  it('admin que também é afiliado fica no próprio id', () => {
    // Sem isso ele herdaria a produção da agência inteira e desbloquearia tudo.
    expect(resolveAchievementScope('admin', 'aff_1')).toBe('self');
  });

  it('sem afiliado vinculado não busca escopo nenhum', () => {
    expect(resolveAchievementScope('client', '')).toBe('self');
    expect(resolveAchievementScope('admin', null)).toBe('self');
  });
});
