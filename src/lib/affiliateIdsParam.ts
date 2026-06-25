// Expansão do parâmetro `affiliateIds` para o formato que a OTG espera.
//
// A Affiliate API externa NÃO aceita `affiliateIds` separado por vírgula
// (devolve 0 linhas); ela espera o parâmetro REPETIDO
// (`affiliateIds=a&affiliateIds=b`). Tanto o proxy `/api/external` quanto a
// partner-api `/results` precisam expandir — antes a lógica vivia duplicada
// inline em duas rotas de `server.ts` (e divergia: uma tratava array, a outra
// só string). Esta é a fonte ÚNICA.
//
// Aceita string ("a,b"), array (["a","b"] ou ["a,b"], como o Express entrega
// quando o query param aparece repetido) ou ausência. Faz trim, descarta
// vazios e DEDUPLICA preservando a ordem da primeira ocorrência.
export function expandAffiliateIdsParam(value: unknown): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    for (const part of String(item).split(',')) {
      const id = part.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
