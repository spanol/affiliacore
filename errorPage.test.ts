// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderErrorPage } from './errorPage';

// A página de erro server-side é HTML SOLTO (fora do bundle/CSS do app), então a
// marca e as cores dela não vêm de classe Tailwind — são resolvidas em runtime
// das envs da instância. Estes testes travam justamente isso: até 2026-08 o
// arquivo tinha "Agência Boost" e o roxo #7c3aed cravados, e TODA label via a
// marca de outro cliente ao cair num 404 de asset.

const base = { status: 404, title: 'Página não encontrada', message: 'O endereço não existe.' };

describe('renderErrorPage · marca da instância', () => {
  it('usa o nome da instância no badge e no <title>', () => {
    const html = renderErrorPage({ ...base, env: { VITE_BRAND_NAME: 'Infinity Affiliates' } });
    expect(html).toContain('Infinity Affiliates');
    expect(html).toContain('<title>404 · Infinity Affiliates</title>');
  });

  it('sem env de marca cai no nome do PRODUTO (nunca numa label)', () => {
    const html = renderErrorPage({ ...base, env: {} });
    expect(html).toContain('AffiliaCore');
    expect(html).not.toMatch(/Boost/i);
  });

  it('não sobrou marca nem cor de cliente cravada no arquivo', () => {
    const html = renderErrorPage({ ...base, env: { VITE_BRAND_NAME: 'Previsão' } });
    expect(html).not.toMatch(/Agência Boost/i);
    expect(html).not.toContain('#7c3aed'); // roxo da Boost v1
    expect(html).not.toContain('#a78bfa');
  });

  it('pinta o botão com o ACCENT declarado (o que o 404 da Infinity não fazia)', () => {
    const html = renderErrorPage({ ...base, env: { VITE_BRAND_ACCENT: '#8332B9' } });
    // A ramp emite hsl(); o importante é não ser mais o navy/roxo fixo.
    expect(html).toMatch(/background: hsl\(/);
    expect(html).not.toContain('#7c3aed');
  });

  it('sem ACCENT declarado usa o âmbar default do index.css', () => {
    const html = renderErrorPage({ ...base, env: {} });
    expect(html).toContain('#f59e0b');
  });

  it('CANVAS declarado re-tinta o fundo; ausência = preto neutro', () => {
    const tinted = renderErrorPage({ ...base, env: { VITE_BRAND_CANVAS: '#26181C' } });
    expect(tinted).toMatch(/background: hsl\(/);
    const plain = renderErrorPage({ ...base, env: {} });
    expect(plain).toContain('#0a0a0a');
  });
});

describe('renderErrorPage · escaping', () => {
  it('escapa o que é interpolado (marca vem de env, título/mensagem são texto)', () => {
    const html = renderErrorPage({
      status: 403,
      title: 'Acesso <negado>',
      message: 'Rota "x" & cia',
      env: { VITE_BRAND_NAME: '<script>alert(1)</script>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Acesso &lt;negado&gt;');
    expect(html).toContain('Rota &quot;x&quot; &amp; cia');
  });

  it('mantém o status e a mensagem visíveis', () => {
    const html = renderErrorPage({ ...base, status: 403, env: {} });
    expect(html).toContain('<div class="code">403</div>');
    expect(html).toContain('O endereço não existe.');
  });
});
