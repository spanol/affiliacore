import { describe, it, expect } from 'vitest';
import {
  isPendingSignup,
  resolveRequestStatus,
  signupToRequest,
  leadToRequest,
  buildCaptureFeed,
  summarizeCapture,
  CaptureRequest,
} from './registrationRequests';

describe('isPendingSignup', () => {
  it('login SEM afiliado é solicitação (é quem fica preso no painel vazio)', () => {
    expect(isPendingSignup({ role: 'client', email: 'a@x.com' })).toBe(true);
    expect(isPendingSignup({ role: 'client', affiliateId: '   ' })).toBe(true);
  });

  it('login já vinculado não é solicitação', () => {
    expect(isPendingSignup({ role: 'client', affiliateId: 'AFF-1' })).toBe(false);
  });

  it('admin nunca entra na fila (é a agência, não o candidato)', () => {
    expect(isPendingSignup({ role: 'admin' })).toBe(false);
  });
});

describe('resolveRequestStatus', () => {
  it('AUSÊNCIA = pendente (a solicitação nasce sem carimbo)', () => {
    expect(resolveRequestStatus(undefined)).toBe('pending');
    expect(resolveRequestStatus(null)).toBe('pending');
    expect(resolveRequestStatus('')).toBe('pending');
    expect(resolveRequestStatus('lixo')).toBe('pending');
  });

  it('só "archived" explícito tira da fila', () => {
    expect(resolveRequestStatus('archived')).toBe('archived');
    expect(resolveRequestStatus(' Archived ')).toBe('archived');
  });
});

describe('signupToRequest / leadToRequest', () => {
  it('auto-cadastro vira solicitação com contato, origem rotulada e data ISO', () => {
    const r = signupToRequest('uid-1', {
      name: 'Guilherme Alan',
      email: 'g@x.com',
      phone: '11999',
      socialMedia: '@g',
      source: 'vitrine-affiliacore',
      createdAt: { toDate: () => new Date('2026-08-07T21:14:00.000Z') },
    });
    expect(r).toMatchObject({
      id: 'uid-1',
      kind: 'signup',
      name: 'Guilherme Alan',
      source: 'vitrine-affiliacore',
      status: 'pending',
      createdAt: '2026-08-07T21:14:00.000Z',
    });
    expect(r.sourceLabel).toBeTruthy();
  });

  it('lead traz o texto e a experiência; sem origem, source é null', () => {
    const r = leadToRequest('c1', {
      name: 'Ana',
      email: 'a@x.com',
      presentation: 'Trabalho com tráfego',
      affiliateExperience: 'sim',
    });
    expect(r).toMatchObject({
      kind: 'lead',
      presentation: 'Trabalho com tráfego',
      experienced: true,
      source: null,
      sourceLabel: '',
    });
  });

  it('data ilegível vira null em vez de derrubar a listagem', () => {
    expect(signupToRequest('u', { createdAt: 'nao-e-data' }).createdAt).toBeNull();
    expect(leadToRequest('c', { createdAt: {} }).createdAt).toBeNull();
  });
});

describe('buildCaptureFeed', () => {
  const req = (id: string, createdAt: string | null, name = id): CaptureRequest => ({
    id, kind: 'signup', name, email: '', phone: '', socialMedia: '',
    source: null, sourceLabel: '', status: 'pending', createdAt,
  });

  it('mais recente primeiro', () => {
    const out = buildCaptureFeed([
      req('velho', '2026-01-01T00:00:00.000Z'),
      req('novo', '2026-08-08T00:00:00.000Z'),
    ]);
    expect(out.map((r) => r.id)).toEqual(['novo', 'velho']);
  });

  it('sem data vai p/ o FIM (dado antigo não disputa o topo com o pedido de hoje)', () => {
    const out = buildCaptureFeed([
      req('sem-data', null),
      req('com-data', '2026-01-01T00:00:00.000Z'),
    ]);
    expect(out.map((r) => r.id)).toEqual(['com-data', 'sem-data']);
  });

  it('empate sem data desempata por nome', () => {
    const out = buildCaptureFeed([req('b', null, 'Bruno'), req('a', null, 'Ana')]);
    expect(out.map((r) => r.name)).toEqual(['Ana', 'Bruno']);
  });
});

describe('summarizeCapture', () => {
  const base = { email: '', phone: '', socialMedia: '', createdAt: null };
  const feed: CaptureRequest[] = [
    { ...base, id: '1', kind: 'signup', name: 'A', source: 'vitrine-affiliacore', sourceLabel: 'Vitrine AffiliaCore', status: 'pending' },
    { ...base, id: '2', kind: 'signup', name: 'B', source: 'vitrine-affiliacore', sourceLabel: 'Vitrine AffiliaCore', status: 'pending' },
    { ...base, id: '3', kind: 'lead', name: 'C', source: null, sourceLabel: '', status: 'pending' },
    { ...base, id: '4', kind: 'lead', name: 'D', source: null, sourceLabel: '', status: 'archived' },
  ];

  it('separa quem já tem login de quem só deixou contato', () => {
    expect(summarizeCapture(feed)).toMatchObject({ pending: 3, signups: 2, leads: 1, archived: 1 });
  });

  it('mede o canal: agrupa a fila por origem, maior primeiro', () => {
    expect(summarizeCapture(feed).bySource).toEqual([
      { source: 'vitrine-affiliacore', label: 'Vitrine AffiliaCore', count: 2 },
      { source: '', label: 'Direto', count: 1 },
    ]);
  });

  it('arquivado sai de TODAS as contagens (inclusive da origem)', () => {
    const so = summarizeCapture([{ ...base, id: 'x', kind: 'lead', name: 'X', source: 'ig', sourceLabel: 'ig', status: 'archived' }]);
    expect(so).toMatchObject({ pending: 0, archived: 1, bySource: [] });
  });

  it('fila vazia não quebra', () => {
    expect(summarizeCapture([])).toMatchObject({ pending: 0, bySource: [] });
  });
});
