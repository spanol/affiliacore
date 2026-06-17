import { describe, it, expect } from 'vitest';
import { mapApprovedRows, normNameKey } from './otgLinksPull';

describe('otgLinksPull · normNameKey', () => {
  it('tira espaço, acento e caixa (ponte com o relatório)', () => {
    expect(normNameKey('Leonardo Portugal Vasconcelos')).toBe('leonardoportugalvasconcelos');
    expect(normNameKey('Bruno Eduardo Santos Rodrigues')).toBe('brunoeduardosantosrodrigues');
    expect(normNameKey('  José da Silva-Júnior  ')).toBe('josedasilvajunior');
    expect(normNameKey(null)).toBe('');
    expect(normNameKey(undefined)).toBe('');
  });
});

describe('otgLinksPull · mapApprovedRows', () => {
  it('mapeia a linha do link_requests para o formato do snapshot', () => {
    const raw = [{
      id: 'req-1',
      batch_id: 'batch-1',
      affiliate_name: 'Leonardo Portugal Vasconcelos',
      betting_house: 'Sportingbet',
      status: 'completed',
      email: 'leo@example.com',
      phone: '+5511999999999',
      social_link: 'https://instagram.com/leoportugal1',
      delivered_urls: [{ url: 'https://brsportingbet.net/registro16232' }],
      delivered_at: '2026-06-11T12:00:00.000Z',
    }];
    expect(mapApprovedRows(raw)[0]).toEqual({
      name: 'Leonardo Portugal Vasconcelos',
      nameKey: 'leonardoportugalvasconcelos',
      house: 'Sportingbet',
      email: 'leo@example.com',
      phone: '+5511999999999',
      social: 'https://instagram.com/leoportugal1',
      registerUrl: 'https://brsportingbet.net/registro16232',
      deliveredAt: '2026-06-11T12:00:00.000Z',
      requestId: 'req-1',
      batchId: 'batch-1',
    });
  });

  it('tolera campos ausentes (registerUrl/email/phone nulos)', () => {
    const row = mapApprovedRows([{ affiliate_name: 'Maria Sousa', betting_house: 'Superbet' }])[0];
    expect(row.registerUrl).toBeNull();
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.social).toBeNull();
    expect(row.nameKey).toBe('mariasousa');
  });

  it('delivered_urls vazio → registerUrl null (não quebra)', () => {
    expect(mapApprovedRows([{ affiliate_name: 'X', betting_house: 'Superbet', delivered_urls: [] }])[0].registerUrl).toBeNull();
  });
});
