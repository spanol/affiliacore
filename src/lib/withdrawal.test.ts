import { describe, it, expect } from 'vitest';
import { canTransitionWithdrawal, normalizeWithdrawalAmount, sumWithdrawalsByStatus, WithdrawalRequest } from './withdrawal';

describe('canTransitionWithdrawal · máquina de estados sem gateway', () => {
  it('pendente → aprovado/rejeitado; aprovado → pago/rejeitado', () => {
    expect(canTransitionWithdrawal('requested', 'approved')).toBe(true);
    expect(canTransitionWithdrawal('requested', 'rejected')).toBe(true);
    expect(canTransitionWithdrawal('approved', 'paid')).toBe(true);
    expect(canTransitionWithdrawal('approved', 'rejected')).toBe(true);
  });
  it('pago e rejeitado são TERMINAIS (nada volta deles)', () => {
    expect(canTransitionWithdrawal('paid', 'approved')).toBe(false);
    expect(canTransitionWithdrawal('paid', 'rejected')).toBe(false);
    expect(canTransitionWithdrawal('rejected', 'approved')).toBe(false);
    expect(canTransitionWithdrawal('rejected', 'requested')).toBe(false);
  });
  it('não pula direto pendente → pago (tem que passar por aprovado)', () => {
    expect(canTransitionWithdrawal('requested', 'paid')).toBe(false);
  });
  it('mesmo→mesmo é permitido (idempotência)', () => {
    expect(canTransitionWithdrawal('approved', 'approved')).toBe(true);
  });
});

describe('normalizeWithdrawalAmount', () => {
  it('número positivo válido → arredondado a centavos', () => {
    expect(normalizeWithdrawalAmount(100)).toBe(100);
    expect(normalizeWithdrawalAmount(99.999)).toBe(100);
    expect(normalizeWithdrawalAmount('50.5')).toBe(50.5);
  });
  it('zero, negativo, NaN, string não-numérica → null (nunca lança)', () => {
    expect(normalizeWithdrawalAmount(0)).toBeNull();
    expect(normalizeWithdrawalAmount(-10)).toBeNull();
    expect(normalizeWithdrawalAmount(NaN)).toBeNull();
    expect(normalizeWithdrawalAmount('lixo')).toBeNull();
    expect(normalizeWithdrawalAmount(null)).toBeNull();
    expect(normalizeWithdrawalAmount(undefined)).toBeNull();
    expect(normalizeWithdrawalAmount({})).toBeNull();
  });
});

describe('sumWithdrawalsByStatus', () => {
  const rows: WithdrawalRequest[] = [
    { id: '1', affiliateId: 'a', amount: 100, status: 'requested' },
    { id: '2', affiliateId: 'a', amount: 50, status: 'approved' },
    { id: '3', affiliateId: 'a', amount: 30, status: 'paid' },
    { id: '4', affiliateId: 'a', amount: 999, status: 'rejected' },
  ];
  it('sem filtro, soma TUDO (incl. rejeitado)', () => {
    expect(sumWithdrawalsByStatus(rows)).toBe(1179);
  });
  it('filtra por status(es)', () => {
    expect(sumWithdrawalsByStatus(rows, ['requested'])).toBe(100);
    expect(sumWithdrawalsByStatus(rows, ['approved', 'paid'])).toBe(80);
  });
  it('array vazio/inválido → 0, nunca lança', () => {
    expect(sumWithdrawalsByStatus([])).toBe(0);
    expect(sumWithdrawalsByStatus(null as any)).toBe(0);
  });
});
