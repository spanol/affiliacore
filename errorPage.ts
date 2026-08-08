// Página de erro server-side, em HTML standalone. Usada quando a requisição é
// bloqueada ANTES de chegar ao SPA (ex.: dotfiles como /.git interceptados pelo
// Vite, ou um asset inexistente) — evita vazar o 403 cru do Vite com o caminho
// do disco.
//
// ⚠️ WHITE-LABEL: até 2026-08 esta página tinha "Agência Boost" e o roxo #7c3aed
// CRAVADOS no HTML — ou seja, toda instância (Infinity, Previsão…) via a marca de
// OUTRO cliente ao cair num 404 de asset. Aqui não há CSS do app (é HTML solto,
// fora do bundle), então a marca e as cores são resolvidas em runtime das MESMAS
// envs do resto do produto: `resolveBrand` p/ o nome e as ramps de
// `lib/theming` p/ accent e canvas. Instância sem env declarada cai nos defaults
// do index.css (âmbar sobre preto neutro), igual ao app.
import { resolveBrand } from './src/lib/branding';
import { buildAccentRamp, buildCanvasRamp } from './src/lib/theming';

interface ErrorPageOptions {
  status: number;
  title: string;
  message: string;
  /** Injetável nos testes; default = process.env (as envs da instância). */
  env?: Record<string, unknown> | null;
}

// Defaults = os mesmos tokens do @theme em src/index.css quando a instância não
// declara ACCENT/CANVAS (accent âmbar; ramp neutral do Tailwind).
const DEFAULT_ACCENT = { '400': '#fbbf24', '500': '#f59e0b', contrast: '#ffffff' };
const DEFAULT_CANVAS = { '800': '#262626', '900': '#171717', '950': '#0a0a0a' };

// A marca vem de env: um nome com `<` ou `&` quebraria o HTML (e title/message
// são texto, nunca markup). Escapa tudo que é interpolado.
const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderErrorPage({ status, title, message, env }: ErrorPageOptions): string {
  const e = env ?? process.env;
  const brand = resolveBrand(e as Record<string, unknown>);
  const accentRamp = buildAccentRamp((e as any)?.VITE_BRAND_ACCENT);
  const canvasRamp = buildCanvasRamp((e as any)?.VITE_BRAND_CANVAS);
  const accent = accentRamp ?? DEFAULT_ACCENT;
  const canvas = canvasRamp ?? DEFAULT_CANVAS;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${esc(status)} · ${esc(brand.name)}</title>
  <style>
    *{ box-sizing: border-box; margin: 0; padding: 0; }
    body{
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: ${canvas['950']};
      color: #e5e5e5;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
    }
    .card{
      width: 100%; max-width: 440px;
      background: ${canvas['900']};
      border: 1px solid ${canvas['800']};
      border-radius: 24px;
      padding: 48px 40px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
    }
    .badge{
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
      color: ${accent['400']};
      background: color-mix(in srgb, ${accent['500']} 12%, transparent);
      padding: 8px 14px; border-radius: 999px;
      margin-bottom: 28px;
    }
    .code{ font-size: 64px; font-weight: 900; line-height: 1; color: #fff; letter-spacing: -.04em; }
    h1{ margin-top: 16px; font-size: 18px; font-weight: 800; color: #fafafa; }
    p{ margin-top: 10px; font-size: 14px; color: #a3a3a3; line-height: 1.6; }
    a.btn{
      display: inline-block; margin-top: 32px;
      background: ${accent['500']}; color: ${accent.contrast}; text-decoration: none;
      font-size: 12px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase;
      padding: 14px 28px; border-radius: 14px;
      transition: filter .2s ease;
    }
    a.btn:hover{ filter: brightness(1.1); }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge" translate="no">${esc(brand.name)}</span>
    <div class="code">${esc(status)}</div>
    <h1>${esc(title)}</h1>
    <p>${esc(message)}</p>
    <a class="btn" href="/">Voltar ao início</a>
  </main>
</body>
</html>`;
}
