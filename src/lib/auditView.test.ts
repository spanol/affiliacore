import { describe, it, expect } from 'vitest';
import {
  actionLabel,
  entityTypeLabel,
  entityDisplay,
  actorDisplay,
  logDateMillis,
  filterAuditLogs,
  paginate,
  uniqueEntityTypes,
  uniqueActions,
  uniqueActors,
  formatChange,
  type AuditLogEntry,
} from './auditView';

const log = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  action: 'house.create',
  entityType: 'house',
  entityId: 'betano',
  entityLabel: 'Betano',
  actorId: 'admin-1',
  actorName: 'Master',
  createdAt: '2026-06-30T12:00:00.000Z',
  ...over,
});

describe('actionLabel / entityTypeLabel', () => {
  it('mapeia ações conhecidas para pt-BR', () => {
    expect(actionLabel('affiliate.activate')).toBe('Ativou afiliado');
    expect(actionLabel('user.accept_invite')).toBe('Aceitou convite (auto-cadastro)');
  });
  it('ação desconhecida cai no próprio código (não some da UI)', () => {
    expect(actionLabel('algo.novo')).toBe('algo.novo');
    expect(actionLabel(null)).toBe('—');
  });
  it('rotula o tipo de entidade', () => {
    expect(entityTypeLabel('affiliate')).toBe('Afiliado');
    expect(entityTypeLabel('house_results')).toBe('Resultados');
    expect(entityTypeLabel('desconhecido')).toBe('desconhecido');
  });
});

describe('entityDisplay / actorDisplay', () => {
  it('entidade: nome > id > affiliateId > traço', () => {
    expect(entityDisplay(log())).toBe('Betano');
    expect(entityDisplay(log({ entityLabel: null }))).toBe('betano');
    expect(entityDisplay(log({ entityLabel: null, entityId: null, affiliateId: 'AFF-9' }))).toBe('AFF-9');
    expect(entityDisplay(log({ entityLabel: null, entityId: null, affiliateId: null }))).toBe('—');
  });
  it('ator: nome > e-mail > uid > Sistema', () => {
    expect(actorDisplay(log())).toBe('Master');
    expect(actorDisplay(log({ actorName: null, actorEmail: 'a@b.com' }))).toBe('a@b.com');
    expect(actorDisplay(log({ actorName: null, actorEmail: null }))).toBe('admin-1');
    expect(actorDisplay(log({ actorName: null, actorEmail: null, actorId: null }))).toBe('Sistema');
  });
});

describe('logDateMillis', () => {
  it('parseia ISO; ausente/inválido → 0', () => {
    expect(logDateMillis(log())).toBe(Date.parse('2026-06-30T12:00:00.000Z'));
    expect(logDateMillis(log({ createdAt: null }))).toBe(0);
    expect(logDateMillis(log({ createdAt: 'xxx' }))).toBe(0);
  });
});

describe('filterAuditLogs', () => {
  const logs: AuditLogEntry[] = [
    log({ action: 'house.create', entityType: 'house', actorId: 'admin-1', createdAt: '2026-06-28T10:00:00Z' }),
    log({ action: 'affiliate.activate', entityType: 'affiliate', actorId: 'admin-2', actorName: 'Outro', createdAt: '2026-06-29T10:00:00Z' }),
    log({ action: 'house.update', entityType: 'house', actorId: 'admin-1', createdAt: '2026-06-30T23:30:00Z', reason: 'corrigir nome' }),
  ];

  it('sem filtro → tudo', () => {
    expect(filterAuditLogs(logs)).toHaveLength(3);
  });
  it('por tipo de entidade', () => {
    expect(filterAuditLogs(logs, { entityType: 'house' })).toHaveLength(2);
  });
  it('por ação', () => {
    expect(filterAuditLogs(logs, { action: 'affiliate.activate' })).toHaveLength(1);
  });
  it('por ator (actorId exato)', () => {
    expect(filterAuditLogs(logs, { actor: 'admin-2' }).map((l) => l.action)).toEqual(['affiliate.activate']);
  });
  it('intervalo de datas é INCLUSIVO no dia final (cobre o dia inteiro)', () => {
    // dateTo = 2026-06-30 deve incluir o log das 23:30Z daquele dia
    const r = filterAuditLogs(logs, { dateFrom: '2026-06-29', dateTo: '2026-06-30' });
    expect(r.map((l) => l.action).sort()).toEqual(['affiliate.activate', 'house.update']);
  });
  it('busca livre bate em rótulo pt-BR, motivo e metadata', () => {
    expect(filterAuditLogs(logs, { search: 'ativou' })).toHaveLength(1); // rótulo da ação
    expect(filterAuditLogs(logs, { search: 'corrigir' })).toHaveLength(1); // reason
  });
  it('combina filtros (AND)', () => {
    expect(filterAuditLogs(logs, { entityType: 'house', actor: 'admin-1', search: 'update' })).toHaveLength(1);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);
  it('fatia a página pedida (1-based)', () => {
    const p = paginate(items, 1, 10);
    expect(p.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p).toMatchObject({ page: 1, total: 23, totalPages: 3 });
  });
  it('última página parcial', () => {
    expect(paginate(items, 3, 10).items).toEqual([21, 22, 23]);
  });
  it('clampeia página fora do intervalo', () => {
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });
  it('lista vazia → 1 página, sem itens', () => {
    expect(paginate([], 1, 10)).toMatchObject({ total: 0, totalPages: 1, items: [] });
  });
});

describe('uniques p/ os selects de filtro', () => {
  const logs: AuditLogEntry[] = [
    log({ entityType: 'house', action: 'house.create', actorId: 'a1', actorName: 'Zé' }),
    log({ entityType: 'affiliate', action: 'affiliate.activate', actorId: 'a2', actorName: 'Ana' }),
    log({ entityType: 'house', action: 'house.create', actorId: 'a1', actorName: 'Zé' }),
  ];
  it('tipos distintos ordenados por rótulo', () => {
    expect(uniqueEntityTypes(logs)).toEqual(['affiliate', 'house']); // Afiliado < Casa
  });
  it('ações distintas', () => {
    expect(uniqueActions(logs).sort()).toEqual(['affiliate.activate', 'house.create']);
  });
  it('atores distintos {id,label} ordenados por label', () => {
    expect(uniqueActors(logs)).toEqual([{ id: 'a2', label: 'Ana' }, { id: 'a1', label: 'Zé' }]);
  });
});

describe('formatChange', () => {
  it('mostra antes → depois, vazio vira traço', () => {
    expect(formatChange({ field: 'affiliateId', before: null, after: 'AFF-1' })).toBe('affiliateId: — → AFF-1');
    expect(formatChange({ field: 'active', before: true, after: false })).toBe('active: true → false');
  });
});
