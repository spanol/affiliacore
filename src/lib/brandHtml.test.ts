import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveBrand } from './branding';
import { applyBrandToHtml, resolveBrandMeta } from './brandHtml';

const INDEX = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" sizes="110x110" href="/affiliacore/favicon.svg" />
    <link rel="shortcut icon" href="/affiliacore/favicon.svg" />
    <title translate="no">AffiliaCore</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

const render = (env: Record<string, unknown>) => {
  const brand = resolveBrand(env);
  return applyBrandToHtml(INDEX, brand, resolveBrandMeta(env, brand));
};

describe('applyBrandToHtml · marca da instância no HTML servido', () => {
  it('sem env, o HTML segue com a marca do produto', () => {
    const out = render({});
    expect(out).toContain('<title translate="no">AffiliaCore</title>');
    expect(out).toContain('<meta property="og:site_name" content="AffiliaCore" />');
  });

  it('instância da label carimba o nome no título e no card de preview', () => {
    const out = render({ VITE_BRAND_NAME: 'Infinity', VITE_BRAND_SHORT: 'Infinity' });
    expect(out).toContain('<title translate="no">Infinity</title>');
    expect(out).toContain('<meta property="og:title" content="Infinity" />');
    expect(out).toContain('<meta property="og:site_name" content="Infinity" />');
    expect(out).toContain('<meta name="twitter:title" content="Infinity" />');
    expect(out).not.toContain('>AffiliaCore<');
    expect(out).toContain('Painel de afiliados da Infinity.');
  });

  it('preserva os atributos do <title> (translate="no" barra a tradução automática)', () => {
    const out = render({ VITE_BRAND_NAME: 'Infinity' });
    expect(out).toMatch(/<title translate="no">/);
  });

  it('o favicon dos dois <link> passa a ser o da instância', () => {
    const out = render({ VITE_BRAND_FAVICON_URL: '/infinity/favicon.svg' });
    expect(out).not.toContain('/affiliacore/favicon.svg');
    expect(out.match(/href="\/infinity\/favicon\.svg"/g)).toHaveLength(2);
    // atributos vizinhos do link não podem ser perdidos
    expect(out).toContain('type="image/svg+xml"');
    expect(out).toContain('sizes="110x110"');
  });

  it('descrição é sobreponível por env', () => {
    const out = render({ VITE_BRAND_NAME: 'Infinity', VITE_BRAND_DESCRIPTION: 'Área do afiliado Infinity.' });
    expect(out).toContain('<meta name="description" content="Área do afiliado Infinity." />');
    expect(out).toContain('<meta property="og:description" content="Área do afiliado Infinity." />');
  });

  it('sem imagem configurada NÃO emite og:image (SVG quebraria o card) e o twitter fica summary', () => {
    const out = render({ VITE_BRAND_NAME: 'Infinity', VITE_BRAND_LOGO_URL: '/infinity/logo.svg' });
    expect(out).not.toContain('og:image');
    expect(out).not.toContain('twitter:image');
    expect(out).toContain('<meta name="twitter:card" content="summary" />');
  });

  it('com imagem configurada emite og:image + twitter:image e sobe p/ summary_large_image', () => {
    const out = render({ VITE_BRAND_OG_IMAGE_URL: 'https://cdn.infinity.com/og.png' });
    expect(out).toContain('<meta property="og:image" content="https://cdn.infinity.com/og.png" />');
    expect(out).toContain('<meta name="twitter:image" content="https://cdn.infinity.com/og.png" />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('nome com caractere de markup é escapado (env não injeta HTML)', () => {
    const out = render({ VITE_BRAND_NAME: 'A & B <script>' });
    expect(out).toContain('<title translate="no">A &amp; B &lt;script&gt;</title>');
    expect(out).toContain('content="A &amp; B &lt;script&gt;"');
    expect(out).not.toContain('<script>');
  });

  it('é IDEMPOTENTE: reaplicar não duplica as tags nem acumula bloco', () => {
    const brand = resolveBrand({ VITE_BRAND_NAME: 'Infinity' });
    const meta = resolveBrandMeta({ VITE_BRAND_NAME: 'Infinity' }, brand);
    const once = applyBrandToHtml(INDEX, brand, meta);
    const twice = applyBrandToHtml(once, brand, meta);
    expect(twice).toBe(once);
    expect(twice.match(/og:title/g)).toHaveLength(1);
  });

  it('o bloco entra dentro do <head>', () => {
    const out = render({ VITE_BRAND_NAME: 'Infinity' });
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'));
  });
});

describe('index.html DE VERDADE (regressão que só o build pegou)', () => {
  const real = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

  it('o comentário do topo cita <title> e NÃO pode ser confundido com a tag', () => {
    const brand = resolveBrand({ VITE_BRAND_NAME: 'Infinity' });
    const out = applyBrandToHtml(real, brand, resolveBrandMeta({}, brand));

    // O <head> tem que sobreviver inteiro: a 1ª versão casava o <title> citado
    // dentro do comentário e comia tudo até o </title> real.
    expect(out).toContain('<meta charset="UTF-8" />');
    expect(out).toContain('<meta name="viewport"');
    expect(out).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(out).toContain('<title translate="no">Infinity</title>');
    // e o comentário continua lá, intacto.
    expect(out).toContain('nome da marca no <title>');
  });

  it('produz HTML que o parser aceita (sem comentário aninhado)', () => {
    const brand = resolveBrand({ VITE_BRAND_NAME: 'Infinity' });
    const out = applyBrandToHtml(real, brand, resolveBrandMeta({}, brand));
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.title).toBe('Infinity');
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Infinity');
    expect(doc.querySelectorAll('script[type="module"]')).toHaveLength(1);
    expect(doc.querySelectorAll('title')).toHaveLength(1);
  });
});

describe('resolveBrandMeta', () => {
  it('descrição default trata a marca no feminino, igual ao resto do produto', () => {
    const brand = resolveBrand({ VITE_BRAND_SHORT: 'Infinity' });
    expect(resolveBrandMeta({}, brand).description).toBe(
      'Painel de afiliados da Infinity. Acompanhe resultados, comissões e materiais de divulgação.',
    );
  });

  it('env vazia/só espaços não sobrepõe', () => {
    const brand = resolveBrand({});
    const meta = resolveBrandMeta({ VITE_BRAND_DESCRIPTION: '  ', VITE_BRAND_OG_IMAGE_URL: '' }, brand);
    expect(meta.description).toContain('Painel de afiliados da AffiliaCore.');
    expect(meta.ogImageUrl).toBeNull();
  });
});
