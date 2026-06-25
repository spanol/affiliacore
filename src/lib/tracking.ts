// Helpers do link de divulgação da agência (/go/:code). Puros e testáveis — o
// `server.ts` os usa no redirect público. A ideia: o afiliado compartilha o link
// da Boost; o servidor registra o clique, gera um `clickId`, passa-o como `subid`
// pra casa e redireciona pro `registerUrl` real do afiliado. Quando a OTG ligar o
// postback (subid→jogador), a atribuição por jogador acende sem retrabalho.
// Probe 2026-06-17: o subid sobrevive até a URL final de cadastro da casa
// (Short.io → Entain), convivendo com o `wm` (ref do afiliado).
import { resolveServerToday } from './scope';

// Bots de preview/crawler batem no link (unfurl de redes sociais, buscadores,
// scripts). NÃO podem contar como clique humano — senão o "andamento" mente.
// IMPORTANTE: NÃO incluímos "instagram" — ao TOCAR num link, o in-app browser do
// Instagram (usuário REAL) traz "Instagram" no UA; o preview do Meta é o
// `facebookexternalhit`, já coberto. "whatsapp" entra (o fetcher de preview tem
// "WhatsApp/" no UA); subcontar alguns toques in-app é preferível a inflar.
const BOT_UA =
  /bot|crawler|spider|slurp|facebookexternalhit|facebot|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|pinterest|skypeuripreview|bingpreview|googlebot|headless|phantomjs|puppeteer|playwright|curl\/|wget|python-requests|go-http-client|axios\/|node-fetch|okhttp|java\//i;

export function isBotUserAgent(ua?: string | null): boolean {
  if (!ua || !ua.trim()) return true; // sem UA = quase sempre bot/script
  return BOT_UA.test(ua);
}

// Acrescenta (ou sobrescreve) o `subid` na URL de destino preservando os params
// existentes (ex.: `wm`/webmaster do afiliado, `utm_*`). Robusto a URL inválida.
export function appendSubid(registerUrl: string, subid: string): string {
  try {
    const u = new URL(registerUrl);
    u.searchParams.set('subid', subid);
    return u.toString();
  } catch {
    // fallback defensivo se não for URL absoluta válida
    const sep = registerUrl.includes('?') ? '&' : '?';
    return `${registerUrl}${sep}subid=${encodeURIComponent(subid)}`;
  }
}

// Dia (YYYY-MM-DD) no fuso BR (America/Sao_Paulo) para a chave do contador diário
// de cliques. ANTES usava UTC (`toISOString`): o Cloud Run roda em UTC, então entre
// 21h e 23:59 BR o clique caía no bucket de AMANHÃ, desalinhando a série diária
// (mesma classe do R12 do ranking). Fonte ÚNICA do "dia BR" = resolveServerToday.
export function clickStatDay(date: Date): string {
  return resolveServerToday(date);
}
