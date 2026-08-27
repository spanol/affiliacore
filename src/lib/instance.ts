// P2 (produtização): a integração OTG vira MÓDULO desligável por instância.
// Fonte ÚNICA da decisão: a env VITE_OTG_ENABLED — ausente ou qualquer valor
// diferente de 'false' → ligada (a instância do Carlos não muda nada sem config);
// 'false' (case-insensitive) → instância OTG-free (white-label vendida roda 100%
// em casas manuais: /casas + import + afiliado nativo).
// O prefixo VITE_ é proposital: a MESMA env vale no bundle do cliente (embutida
// no build por instância do App Hosting) e no servidor (process.env em runtime).
// Não é credencial — é só um interruptor de módulo (nada sensível vaza no bundle).
// Puro e sem import.meta: o server.ts (tsx, sem Vite) importa daqui; o client usa
// o wrapper instanceClient.ts.
export function otgEnabled(raw: string | boolean | undefined | null): boolean {
  return String(raw ?? '').trim().toLowerCase() !== 'false';
}

// Marketplace de acordos/parcerias (P2/P3) como MÓDULO opt-in por instância. Ao
// contrário do OTG (default LIGADO), o marketplace é default DESLIGADO: ausente/qualquer
// valor ≠ 'true' → off. Assim a instância nº 0 (Boost/Carlos) e qualquer instância
// existente NÃO ganham as telas novas sem pedir — zero side effect. A instância que
// quer (ex.: Infinity) liga com VITE_MARKETPLACE_ENABLED='true'. Mesma env vale no
// bundle do cliente e no server (process.env). Não é credencial — só um interruptor.
export function marketplaceEnabled(raw: string | boolean | undefined | null): boolean {
  return String(raw ?? '').trim().toLowerCase() === 'true';
}

// REV Share como MÓDULO desligável por instância (call com o Jotta, 27/08/2026).
// Agência que fecha só CPA com as casas não tem o que mostrar no REV, e um card
// zerado ao lado da comissão só levanta a pergunta "cadê meu REV?". Mesmo default
// do OTG (LIGADO): ausente/qualquer valor ≠ 'false' → o REV aparece, então nenhuma
// instância existente muda sem pedir; 'false' esconde o REV das telas de RESULTADO
// do afiliado e do gerente.
// ATENÇÃO: é interruptor de EXIBIÇÃO, não de cálculo. A parcela REV continua sendo
// apurada e somada à comissão (esconder o número não pode mudar o dinheiro que o
// afiliado recebe); quem não quer pagar REV configura a taxa em 0. Por isso a
// configuração de REV (/afiliados, editor por casa) NÃO é escondida por esta flag.
export function revEnabled(raw: string | boolean | undefined | null): boolean {
  return String(raw ?? '').trim().toLowerCase() !== 'false';
}
