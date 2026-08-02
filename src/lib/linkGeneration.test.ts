import { describe, it, expect } from 'vitest';
import {
  slugifyTag,
  suggestTag,
  buildTaggedUrl,
  tagParamForTemplate,
  DEFAULT_TAG_PARAM,
} from './linkGeneration';

const TEMPLATE = 'https://go.aff.esportiva.bet/urto4foy';

describe('slugifyTag', () => {
  it('reduz a [a-z0-9] preservando a letra que estava sob o acento', () => {
    expect(slugifyTag('Maurício Fernandes')).toBe('mauriciofernandes');
    expect(slugifyTag('  JOÃO  da Silva ')).toBe('joaodasilva');
  });

  it('texto sem letra nem dígito vira vazio (não vira lixo na URL)', () => {
    expect(slugifyTag('—')).toBe('');
    expect(slugifyTag(null)).toBe('');
  });
});

describe('suggestTag', () => {
  it('usa o nome do afiliado — é o que o admin reconhece na coluna AFP', () => {
    expect(suggestTag({ name: 'Maurício Fernandes' })).toBe('mauriciofernandes');
  });

  it('sem nome, cai no e-mail; sem e-mail, no sufixo do id — NUNCA vazio', () => {
    expect(suggestTag({ email: 'mauricio.mff@gmail.com' })).toBe('mauriciomff');
    // o id é slugificado ANTES do corte: os 6 últimos são de [a-z0-9], não do texto cru
    expect(suggestTag({ affiliateId: 'boost_9e639dc3-434c-459a-b37b-5d2e6447d078' })).toBe('aff47d078');
    expect(suggestTag({})).toBe('afiliado');
  });

  it('colisão ganha sufixo numérico (dois "Maurício" é o caso comum)', () => {
    expect(suggestTag({ name: 'Mauricio' }, ['mauricio'])).toBe('mauricio2');
    expect(suggestTag({ name: 'Mauricio' }, ['mauricio', 'mauricio2'])).toBe('mauricio3');
  });

  it('a comparação de "já usada" ignora caixa e acento', () => {
    expect(suggestTag({ name: 'Mauricio' }, ['MAURICIO'])).toBe('mauricio2');
  });

  it('prefixo da agência sobrevive ao corte de tamanho; o corpo é que encolhe', () => {
    const tag = suggestTag({ name: 'Fernando Henrique Cardoso da Silva Sauro' }, [], 'infinitw');
    expect(tag.startsWith('infinitw')).toBe(true);
    expect(tag.length).toBeLessThanOrEqual(24);
  });
});

describe('buildTaggedUrl', () => {
  it('template sem query ganha ?afp=<tag>', () => {
    expect(buildTaggedUrl(TEMPLATE, 'infinitw777')).toBe(`${TEMPLATE}?afp=infinitw777`);
  });

  it('preserva a query que já existe no template (utm, ext_marker…)', () => {
    const url = buildTaggedUrl('https://casa.bet/r?utm_source=Aff-T&ext_marker=infinity', 'tag01');
    expect(url).toContain('utm_source=Aff-T');
    expect(url).toContain('ext_marker=infinity');
    expect(url).toContain('afp=tag01');
  });

  it('TROCA o valor do parâmetro de rastreio que já veio no link — colar o link de outro afiliado não pode manter o dono antigo', () => {
    expect(buildTaggedUrl(`${TEMPLATE}?afp=infinitw280`, 'infinitw999')).toBe(`${TEMPLATE}?afp=infinitw999`);
    expect(buildTaggedUrl('https://casa.bet/r?btag=antigo', 'novo')).toBe('https://casa.bet/r?btag=novo');
  });

  it('respeita o placeholder do template cadastrado em /casas', () => {
    expect(buildTaggedUrl('https://casa.bet/r?ref={ref}', 'tag01')).toBe('https://casa.bet/r?ref=tag01');
    expect(buildTaggedUrl('https://casa.bet/{tag}/cadastro', 'tag01')).toBe('https://casa.bet/tag01/cadastro');
  });

  it('o placeholder é substituído em TODAS as ocorrências (regex global não pode pular a 2ª)', () => {
    expect(buildTaggedUrl('https://casa.bet/{ref}?afp={ref}', 'x1')).toBe('https://casa.bet/x1?afp=x1');
  });

  it('parâmetro escolhido só vale quando o template não traz nenhum', () => {
    expect(buildTaggedUrl(TEMPLATE, 'tag01', 'btag')).toBe(`${TEMPLATE}?btag=tag01`);
    // template manda: já tem afp → ignora a escolha
    expect(buildTaggedUrl(`${TEMPLATE}?afp=x`, 'tag01', 'btag')).toBe(`${TEMPLATE}?afp=tag01`);
  });

  it('template inválido ou tag vazia devolve vazio (quem chama recusa)', () => {
    expect(buildTaggedUrl('', 'tag')).toBe('');
    expect(buildTaggedUrl('nao-e-url', 'tag')).toBe('');
    expect(buildTaggedUrl('ftp://casa.bet/r', 'tag')).toBe('');
    expect(buildTaggedUrl(TEMPLATE, '')).toBe('');
  });

  it('duas chamadas seguidas com placeholder dão o MESMO resultado (o lastIndex do regex global não vaza)', () => {
    const t = 'https://casa.bet/r?ref={ref}';
    expect(buildTaggedUrl(t, 'a1')).toBe(buildTaggedUrl(t, 'a1'));
  });
});

describe('tagParamForTemplate', () => {
  it('devolve o parâmetro que o template já usa', () => {
    expect(tagParamForTemplate(`${TEMPLATE}?afp=x`)).toBe('afp');
    expect(tagParamForTemplate('https://casa.bet/r?btag=x')).toBe('btag');
  });

  it('template com placeholder não pede escolha', () => {
    expect(tagParamForTemplate('https://casa.bet/r?ref={ref}')).toBe('placeholder');
  });

  it('sem pista nenhuma, cai no padrão do mercado BR (afp)', () => {
    expect(tagParamForTemplate(TEMPLATE)).toBe(DEFAULT_TAG_PARAM);
    expect(tagParamForTemplate('lixo')).toBe(DEFAULT_TAG_PARAM);
    expect(tagParamForTemplate(TEMPLATE, 'subid')).toBe('subid');
  });
});
