import { describe, it, expect } from 'vitest';
import { findAffiliateInList, userDocToAffiliate } from './affiliateLookup';

// Scan PURO do fallback de fetchAffiliateById: varre a lista completa da API
// quando o mirror local 404a. Casa por `id` ou `_id`, coage number→string e
// nunca lança (lista inválida/vazia/sem match → null). R19.
describe('findAffiliateInList', () => {
  it('acha o afiliado por a.id', () => {
    const lista = [{ id: 'a1', nome: 'Ana' }, { id: 'a2', nome: 'Bia' }];
    expect(findAffiliateInList(lista, 'a2')).toEqual({ id: 'a2', nome: 'Bia' });
  });

  it('acha por a._id quando o item não tem a.id (API varia o nome do campo)', () => {
    const lista = [{ _id: 'b1', nome: 'Caio' }, { _id: 'b2', nome: 'Duda' }];
    expect(findAffiliateInList(lista, 'b2')).toEqual({ _id: 'b2', nome: 'Duda' });
  });

  it('coage id number da lista vs string buscada ({id: 123} casa com "123")', () => {
    const lista = [{ id: 123, nome: 'Eva' }];
    expect(findAffiliateInList(lista, '123')).toEqual({ id: 123, nome: 'Eva' });
  });

  it('retorna null quando ninguém casa', () => {
    const lista = [{ id: 'a1' }, { id: 'a2' }];
    expect(findAffiliateInList(lista, 'inexistente')).toBeNull();
  });

  it('retorna null para lista não-array (null/undefined) — nunca lança', () => {
    expect(findAffiliateInList(null as any, 'x')).toBeNull();
    expect(findAffiliateInList(undefined as any, 'x')).toBeNull();
  });

  it('retorna null para lista vazia', () => {
    expect(findAffiliateInList([], 'x')).toBeNull();
  });
});

// Fallback do afiliado que existe SÓ como login (auto-cadastro pelo /register): sem
// mirror `affiliates` nem produção OTG, a ficha do admin sintetiza do doc `users`.
describe('userDocToAffiliate', () => {
  it('sintetiza id da rota + nome/e-mail/contato do doc de login', () => {
    const doc = { uid: 'u1', name: 'Teste 01', email: 'teste01@x.com', phone: '(11) 90000-0000', socialMedia: '@t01', cpf: '000', avatarUrl: 'http://a', role: 'client' };
    expect(userDocToAffiliate('u1', doc)).toEqual({
      id: 'u1', name: 'Teste 01', email: 'teste01@x.com', phone: '(11) 90000-0000',
      socialMedia: '@t01', cpf: '000', avatarUrl: 'http://a', source: 'user',
    });
  });

  it('mantém o id da ROTA mesmo quando difere do uid (affiliateId já vinculado)', () => {
    expect(userDocToAffiliate('aff_123', { uid: 'u9', name: 'Ana' }).id).toBe('aff_123');
  });

  it('sem nome cai no e-mail; sem e-mail nem nome → "Sem Nome"', () => {
    expect(userDocToAffiliate('u1', { email: 'só@email.com' }).name).toBe('só@email.com');
    expect(userDocToAffiliate('u1', {}).name).toBe('Sem Nome');
  });

  it('coage tudo a string e nunca lança p/ data inválida (null/não-objeto)', () => {
    expect(userDocToAffiliate('u1', null)).toMatchObject({ id: 'u1', name: 'Sem Nome', email: '', source: 'user' });
    expect(userDocToAffiliate('u1', 'lixo' as any)).toMatchObject({ name: 'Sem Nome', email: '' });
    expect(userDocToAffiliate(123 as any, { name: 42 }).name).toBe('42');
  });
});
