import { describe, it, expect } from 'vitest';
import { isBotUserAgent, appendSubid, clickStatDay } from './tracking';

describe('isBotUserAgent', () => {
  it('trata UA vazio/ausente como bot', () => {
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent('   ')).toBe(true);
  });

  it('detecta bots de preview / crawlers / scripts', () => {
    expect(isBotUserAgent('facebookexternalhit/1.1')).toBe(true);
    expect(isBotUserAgent('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isBotUserAgent('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBotUserAgent('curl/8.4.0')).toBe(true);
    expect(isBotUserAgent('python-requests/2.31.0')).toBe(true);
  });

  it('NÃO trata o in-app browser do Instagram (usuário real) como bot', () => {
    // Toque real num link dentro do app → in-app browser com "Instagram" no UA.
    const igInApp =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.0';
    expect(isBotUserAgent(igInApp)).toBe(false);
  });

  it('aceita browsers humanos comuns', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36')).toBe(false);
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/604.1')).toBe(false);
  });
});

describe('appendSubid', () => {
  it('acrescenta subid preservando params existentes (ex.: wm do afiliado)', () => {
    const out = appendSubid('https://brsportingbet.net/registro16279?wm=5710051', 'abc123');
    const u = new URL(out);
    expect(u.searchParams.get('wm')).toBe('5710051');
    expect(u.searchParams.get('subid')).toBe('abc123');
  });

  it('acrescenta subid em URL sem query', () => {
    expect(appendSubid('https://brsportingbet.net/registro16279', 'abc123')).toBe(
      'https://brsportingbet.net/registro16279?subid=abc123'
    );
  });

  it('sobrescreve um subid pré-existente (não duplica)', () => {
    const out = appendSubid('https://x.test/r?subid=old', 'new');
    expect(new URL(out).searchParams.getAll('subid')).toEqual(['new']);
  });

  it('faz fallback seguro para destino não-absoluto', () => {
    expect(appendSubid('/relativo', 'z')).toBe('/relativo?subid=z');
    expect(appendSubid('/r?a=1', 'z')).toBe('/r?a=1&subid=z');
  });
});

describe('clickStatDay · dia no fuso BR (não UTC)', () => {
  it('usa America/Sao_Paulo, não UTC — clique de madrugada UTC fica no dia BR anterior', () => {
    // 02:54 UTC = 23:54 BR do dia ANTERIOR → bucket 2026-06-16 (em UTC seria 06-17).
    expect(clickStatDay(new Date('2026-06-17T02:54:43Z'))).toBe('2026-06-16');
  });

  it('janela 21h–23:59 BR (00h–02h59 UTC) NÃO vaza para o dia seguinte (classe R12)', () => {
    // 01:30 UTC do dia 18 = 22:30 BR do dia 17 → continua 2026-06-17.
    expect(clickStatDay(new Date('2026-06-18T01:30:00Z'))).toBe('2026-06-17');
  });

  it('horário comercial BR fica no mesmo dia', () => {
    // 15:00 UTC = 12:00 BR → 2026-06-17.
    expect(clickStatDay(new Date('2026-06-17T15:00:00Z'))).toBe('2026-06-17');
  });
});
