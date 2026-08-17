import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  eurToBrl, parseEurBrlRate, formatBrl, fetchEurBrlRate, getCachedEurBrlRate,
  FALLBACK_EUR_BRL, FALLBACK_USD_BRL, resolveCpaCurrency, houseCpaToBrl, parseHouseCpaInput,
  convertHouseCpaInput, resolveFxMode, resolveMoneyCurrency, resolveFxRate, toBrl,
  formatMoney, parseFxRate, fetchFxQuotes, houseFxSpec,
  type FxQuotes,
} from './currency';

// Cotações de teste: fixas, para o resultado não depender de rede nem do cache.
const QUOTES: FxQuotes = {
  EUR: { rate: 6, live: true, fetchedAt: 1 },
  USD: { rate: 5.4, live: true, fetchedAt: 1 },
};

describe('eurToBrl', () => {
  it('multiplica EUR pela cotação', () => {
    expect(eurToBrl(30, 5.9)).toBeCloseTo(177);
    expect(eurToBrl(150, 6)).toBe(900);
  });

  it('guarda contra null/NaN/objeto (nunca propaga NaN)', () => {
    expect(eurToBrl(null, 6)).toBe(0);
    expect(eurToBrl(undefined, 6)).toBe(0);
    expect(eurToBrl(10, NaN)).toBe(0);
    expect(eurToBrl('abc' as any, 6)).toBe(0);
    expect(eurToBrl({} as any, 6)).toBe(0);
  });
});

describe('parseEurBrlRate', () => {
  it('extrai o bid da resposta da AwesomeAPI', () => {
    expect(parseEurBrlRate({ EURBRL: { bid: '5.91017', ask: '5.92417' } })).toBeCloseTo(5.91017);
  });

  it('cai p/ ask quando não há bid', () => {
    expect(parseEurBrlRate({ EURBRL: { ask: '6.10' } })).toBeCloseTo(6.1);
  });

  it('devolve null quando a forma não bate ou o valor é inválido', () => {
    expect(parseEurBrlRate({})).toBeNull();
    expect(parseEurBrlRate(null)).toBeNull();
    expect(parseEurBrlRate({ EURBRL: { bid: 'x' } })).toBeNull();
    expect(parseEurBrlRate({ EURBRL: { bid: '0' } })).toBeNull();
  });
});

describe('resolveCpaCurrency', () => {
  it('AUSÊNCIA = EUR (o defaultCpa histórico está todo em euro)', () => {
    expect(resolveCpaCurrency(undefined)).toBe('EUR');
    expect(resolveCpaCurrency(null)).toBe('EUR');
    expect(resolveCpaCurrency('')).toBe('EUR');
    expect(resolveCpaCurrency('lixo')).toBe('EUR');
  });

  it('só BRL explícito (qualquer caixa) tira a casa da conversão', () => {
    expect(resolveCpaCurrency('BRL')).toBe('BRL');
    expect(resolveCpaCurrency('brl')).toBe('BRL');
    expect(resolveCpaCurrency(' Brl ')).toBe('BRL');
    expect(resolveCpaCurrency('EUR')).toBe('EUR');
  });
});

describe('houseCpaToBrl', () => {
  it('moeda estrangeira converte pela cotação; BRL é o valor exato', () => {
    expect(houseCpaToBrl(30, { cpaCurrency: 'EUR' }, QUOTES)).toBeCloseTo(180);
    expect(houseCpaToBrl(100, { cpaCurrency: 'USD' }, QUOTES)).toBeCloseTo(540);
    expect(houseCpaToBrl(120, { cpaCurrency: 'BRL' }, QUOTES)).toBe(120);
  });

  it('casa antiga (sem moeda e sem regime) segue convertendo AO VIVO em euro', () => {
    // É o invariante que impede a mudança de regime de reinterpretar dado histórico.
    expect(houseCpaToBrl(40, undefined, QUOTES)).toBe(240);
    expect(houseCpaToBrl(40, {}, QUOTES)).toBe(240);
  });

  it('cotação FIXA da casa ignora o mercado', () => {
    expect(houseCpaToBrl(100, { cpaCurrency: 'USD', fxMode: 'fixed', fxRate: 5 }, QUOTES)).toBe(500);
  });

  // Zero aparece na tela como problema; o valor cru (US$ 100 lido como R$ 100)
  // passaria despercebido e erraria o lucro da agência em 5x.
  it('modo fixo SEM cotação devolve 0, não o valor cru', () => {
    expect(houseCpaToBrl(100, { cpaCurrency: 'USD', fxMode: 'fixed' }, QUOTES)).toBe(0);
    expect(houseCpaToBrl(100, { cpaCurrency: 'USD', fxMode: 'fixed', fxRate: 0 }, QUOTES)).toBe(0);
  });

  it('BRL não depende da cotação', () => {
    expect(houseCpaToBrl(120.5, { cpaCurrency: 'BRL' }, QUOTES)).toBe(120.5);
    expect(houseCpaToBrl(null, { cpaCurrency: 'BRL' }, QUOTES)).toBe(0);
  });
});

describe('regime de cotação (live × fixa × sem conversão)', () => {
  it('resolveFxMode respeita o default de cada lado (casa converteu sempre; acordo nunca)', () => {
    expect(resolveFxMode(undefined, 'live')).toBe('live');
    expect(resolveFxMode(undefined, 'none')).toBe('none');
    expect(resolveFxMode('lixo', 'none')).toBe('none');
    expect(resolveFxMode('FIXED', 'none')).toBe('fixed');
    expect(resolveFxMode('live', 'none')).toBe('live');
  });

  it('resolveMoneyCurrency aceita as três e cai no fallback do chamador', () => {
    expect(resolveMoneyCurrency('usd')).toBe('USD');
    expect(resolveMoneyCurrency(' Eur ')).toBe('EUR');
    expect(resolveMoneyCurrency('crypto')).toBe('BRL');
    expect(resolveMoneyCurrency('crypto', 'EUR')).toBe('EUR');
  });

  it('real vale 1 em qualquer regime, e "none" não converte', () => {
    expect(resolveFxRate({ currency: 'BRL', fxMode: 'live' }, QUOTES)).toBe(1);
    expect(resolveFxRate({ currency: 'USD', fxMode: 'none' }, QUOTES)).toBe(1);
  });

  it('ao vivo usa a cotação do dia; fixa usa a digitada', () => {
    expect(resolveFxRate({ currency: 'USD', fxMode: 'live' }, QUOTES)).toBe(5.4);
    expect(resolveFxRate({ currency: 'USD', fxMode: 'fixed', fxRate: 5.9 }, QUOTES)).toBe(5.9);
  });

  // A recusa é o ponto: null obriga quem chama a barrar a gravação.
  it('fixa SEM cotação é null (não inventa taxa)', () => {
    expect(resolveFxRate({ currency: 'EUR', fxMode: 'fixed' }, QUOTES)).toBeNull();
    expect(resolveFxRate({ currency: 'EUR', fxMode: 'fixed', fxRate: -1 }, QUOTES)).toBeNull();
    expect(toBrl(30, { currency: 'EUR', fxMode: 'fixed' }, QUOTES)).toBeNull();
  });

  // 45 × 5,4 = 243.00000000000003 em ponto flutuante, e esse número ia parar na taxa
  // gravada do afiliado (achado na verificação de 17/08).
  it('toBrl arredonda a centavos: o resultado é dinheiro', () => {
    expect(toBrl(45, { currency: 'USD', fxMode: 'fixed', fxRate: 5.4 }, QUOTES)).toBe(243);
    expect(toBrl(0.005, { currency: 'USD', fxMode: 'fixed', fxRate: 1 }, QUOTES)).toBe(0.01);
  });

  it('toBrl multiplica e nunca propaga NaN', () => {
    expect(toBrl(100, { currency: 'USD', fxMode: 'live' }, QUOTES)).toBeCloseTo(540);
    expect(toBrl('abc' as any, { currency: 'USD', fxMode: 'live' }, QUOTES)).toBe(0);
    expect(toBrl(null, { currency: 'BRL', fxMode: 'live' }, QUOTES)).toBe(0);
  });

  it('houseFxSpec traduz o doc da casa (ausências no default do lado casa)', () => {
    expect(houseFxSpec({})).toEqual({ currency: 'EUR', fxMode: 'live', fxRate: null });
    expect(houseFxSpec({ cpaCurrency: 'USD', fxMode: 'fixed', fxRate: 5 }))
      .toEqual({ currency: 'USD', fxMode: 'fixed', fxRate: 5 });
  });
});

describe('formatMoney', () => {
  it('usa o símbolo da moeda do acordo', () => {
    expect(formatMoney(100, 'USD')).toContain('100,00');
    expect(formatMoney(100, 'USD')).toMatch(/US\$/);
    expect(formatMoney(30, 'EUR')).toMatch(/€/);
    expect(formatMoney(120, 'BRL')).toMatch(/R\$/);
  });
  it('valor malformado vira zero, não NaN', () => {
    expect(formatMoney('abc' as any, 'USD')).toContain('0,00');
  });
});

describe('parseHouseCpaInput', () => {
  it('EUR é inteiro; BRL aceita centavos', () => {
    expect(parseHouseCpaInput('30', 'EUR')).toBe(30);
    expect(parseHouseCpaInput('30.9', 'EUR')).toBe(30);
    expect(parseHouseCpaInput('120.50', 'BRL')).toBe(120.5);
  });

  it('aceita vírgula pt-BR (num() só entende ponto)', () => {
    expect(parseHouseCpaInput('120,50', 'BRL')).toBe(120.5);
  });

  it('o ÚLTIMO separador é o decimal (milhar pt-BR não pode virar null → apagar o CPA)', () => {
    expect(parseHouseCpaInput('1.234,50', 'BRL')).toBe(1234.5);
    expect(parseHouseCpaInput('1,234,50', 'BRL')).toBe(1234.5);
    expect(parseHouseCpaInput('2.400', 'EUR')).toBe(2); // ponto = decimal aqui, e EUR trunca
  });

  it('vazio/inválido é null, NUNCA 0 (ausência ≠ R$0)', () => {
    expect(parseHouseCpaInput('', 'BRL')).toBeNull();
    expect(parseHouseCpaInput('   ', 'EUR')).toBeNull();
    expect(parseHouseCpaInput('abc', 'BRL')).toBeNull();
    expect(parseHouseCpaInput('-10', 'BRL')).toBeNull();
  });
});

describe('convertHouseCpaInput', () => {
  const eur = { currency: 'EUR', fxMode: 'live' } as const;
  const brl = { currency: 'BRL', fxMode: 'live' } as const;
  const usd = { currency: 'USD', fxMode: 'live' } as const;

  it('preserva o R$ efetivo ao trocar a moeda do campo', () => {
    expect(convertHouseCpaInput('30', eur, brl, QUOTES)).toBe('180');
    expect(convertHouseCpaInput('180', brl, eur, QUOTES)).toBe('30');
    expect(convertHouseCpaInput('540', brl, usd, QUOTES)).toBe('100');
  });

  it('converte direto entre duas moedas estrangeiras, passando pelo real', () => {
    // 100 USD = R$ 540 = 90 EUR nas cotações do teste.
    expect(convertHouseCpaInput('100', usd, eur, QUOTES)).toBe('90');
  });

  it('arredonda a volta p/ euro (177 ÷ 5,9 = 29,99… não pode virar 29)', () => {
    expect(convertHouseCpaInput('120,50', brl, eur, QUOTES)).toBe('20');
  });

  it('mesma moeda ou campo vazio não inventa valor', () => {
    expect(convertHouseCpaInput('30', eur, eur, QUOTES)).toBe('30');
    expect(convertHouseCpaInput('', eur, brl, QUOTES)).toBe('');
  });

  it('nunca converte p/ 0 euro: valor positivo tem piso de 1 (zero seria CONFIGURADO)', () => {
    expect(convertHouseCpaInput('3', brl, eur, QUOTES)).toBe('1');
    expect(convertHouseCpaInput('0,50', brl, eur, QUOTES)).toBe('1');
  });

  it('texto que não parseia volta como está — não apaga o CPA por um caractere', () => {
    expect(convertHouseCpaInput(',', brl, eur, QUOTES)).toBe(',');
    expect(convertHouseCpaInput('   ', brl, eur, QUOTES)).toBe('');
  });

  it('sem cotação válida mantém o valor (não zera o CPA da casa)', () => {
    const semCotacao = { currency: 'EUR', fxMode: 'fixed' } as const;
    expect(convertHouseCpaInput('30', semCotacao, brl, QUOTES)).toBe('30');
    expect(convertHouseCpaInput('30', eur, semCotacao, QUOTES)).toBe('30');
  });

  it('usa a cotação FIXA do lado que a tem, não a do mercado', () => {
    expect(convertHouseCpaInput('100', { currency: 'USD', fxMode: 'fixed', fxRate: 5 }, brl, QUOTES)).toBe('500');
  });
});

describe('formatBrl', () => {
  it('formata em R$ pt-BR e guarda NaN', () => {
    expect(formatBrl(887)).toContain('887,00');
    expect(formatBrl(null)).toContain('0,00');
  });
});

describe('fetchEurBrlRate', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('em falha mantém o fallback (não quebra a tela)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const q = await fetchEurBrlRate(true);
    expect(q.rate).toBe(FALLBACK_EUR_BRL);
    expect(q.live).toBe(false);
  });

  it('atualiza o cache com a cotação ao vivo no sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ EURBRL: { bid: '5.85' } }),
    }));
    const q = await fetchEurBrlRate(true);
    expect(q.rate).toBeCloseTo(5.85);
    expect(q.live).toBe(true);
    expect(getCachedEurBrlRate()).toBeCloseTo(5.85);
  });

  it('reusa o cache dentro do TTL (não refaz o fetch)', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ EURBRL: { bid: '5.70' } }) });
    vi.stubGlobal('fetch', spy);
    await fetchEurBrlRate(true);     // popula o cache (1 chamada)
    await fetchEurBrlRate();          // dentro do TTL → sem novo fetch
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('cotações multi-moeda', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('parseFxRate lê a moeda pedida da resposta da AwesomeAPI', () => {
    const payload = { USDBRL: { bid: '5.42' }, EURBRL: { bid: '6.11' } };
    expect(parseFxRate(payload, 'USD')).toBeCloseTo(5.42);
    expect(parseFxRate(payload, 'EUR')).toBeCloseTo(6.11);
    expect(parseFxRate({}, 'USD')).toBeNull();
    expect(parseFxRate(null, 'EUR')).toBeNull();
  });

  it('uma chamada traz as duas moedas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ USDBRL: { bid: '5.42' }, EURBRL: { bid: '6.11' } }),
    }));
    const q = await fetchFxQuotes(true);
    expect(q.USD.rate).toBeCloseTo(5.42);
    expect(q.EUR.rate).toBeCloseTo(6.11);
    expect(q.USD.live).toBe(true);
  });

  // Uma resposta parcial não pode zerar a moeda que faltou: o cálculo de comissão
  // lê o cache de forma síncrona e leria 0 no meio de uma rodada.
  it('moeda ausente na resposta preserva o valor anterior', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ USDBRL: { bid: '5.42' }, EURBRL: { bid: '6.11' } }),
    }));
    await fetchFxQuotes(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ EURBRL: { bid: '6.20' } }),
    }));
    const q = await fetchFxQuotes(true);
    expect(q.EUR.rate).toBeCloseTo(6.2);
    expect(q.USD.rate).toBeCloseTo(5.42);
  });

  it('falha total mantém tudo e não lança', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const q = await fetchFxQuotes(true);
    expect(q.USD.rate).toBeGreaterThan(0);
    expect(q.EUR.rate).toBeGreaterThan(0);
  });

  it('os fallbacks são positivos (piso até o 1º fetch)', () => {
    expect(FALLBACK_USD_BRL).toBeGreaterThan(0);
    expect(FALLBACK_EUR_BRL).toBeGreaterThan(0);
  });
});
