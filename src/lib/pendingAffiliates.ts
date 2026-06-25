// Decide quais pré-cadastros (coleção `pending_affiliates`) AINDA aparecem na
// gestão de afiliados. Um pré-cadastro é SUPRIMIDO quando já tem representação na
// lista, por dois caminhos:
//
//  (a) por ID — o afiliado aceitou o convite e o login (`users/{uid}`) carrega o
//      MESMO affiliateId sintético (`pending_<nameKey>_<casa>`). O `uniqueAffiliates`
//      já tem essa linha (com login), então o pendente NÃO pode reaparecer.
//      Sem este check ele aparecia 2× — uma "com login" e outra "sem login" —
//      porque a linha do login não carrega `brand`, e a dedup por nameKey+casa
//      (abaixo) não casava `nameKey|` vs `nameKey|casa`. (bug Lucas Guimarães,
//      2026-06-25.)
//
//  (b) por nameKey+CASA — o afiliado real daquela casa já apareceu no relatório
//      (reconciliação). O afiliado é por casa na OTG, então o pendente de OUTRA
//      casa ainda deve aparecer; só some quando o real DAQUELA casa surge.
//
// Só entram os `status === 'pending'` (os `reconciled` já saíram da fila).

export interface PendingLike {
  id: string;
  status?: string;
  nameKey?: string;
  house?: string | null;
}

export function selectVisiblePending<T extends PendingLike>(
  pending: readonly T[] | null | undefined,
  presentIds: Set<string>,
  presentKeys: Set<string>,
  houseKey: (nameKey: string | undefined, brand: string | null | undefined) => string,
): T[] {
  return (pending ?? []).filter(
    (p) =>
      p.status === 'pending' &&
      !presentIds.has(String(p.id)) &&
      !presentKeys.has(houseKey(p.nameKey, p.house)),
  );
}
