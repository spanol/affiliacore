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
