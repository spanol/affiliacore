import { describe, it, expect } from 'vitest';
import { selectVisiblePending, PendingLike } from './pendingAffiliates';

// houseKey de teste no MESMO formato da página: `${nameKey}|${normalize(brand)}`.
const houseKey = (nk: string | undefined, brand: string | null | undefined) =>
  `${nk ?? ''}|${String(brand ?? '').toLowerCase()}`;

describe('selectVisiblePending · pré-cadastro não duplica com o login (bug Lucas Guimarães)', () => {
  const lucas: PendingLike = { id: 'pending_lucasguimaraes_sportingbet', status: 'pending', nameKey: 'lucasguimaraes', house: 'Sportingbet' };

  it('SUPRIME o pendente cujo id já é o affiliateId de um login (aceitou o convite)', () => {
    // o login carrega o id sintético, mas SEM brand → presentKeys tem "lucasguimaraes|"
    // (vazio), que não casa por nameKey+casa. A dedup por ID é quem segura.
    const presentIds = new Set(['pending_lucasguimaraes_sportingbet']);
    const presentKeys = new Set(['lucasguimaraes|']); // login sem brand
    expect(selectVisiblePending([lucas], presentIds, presentKeys, houseKey)).toEqual([]);
  });

  it('SUPRIME o pendente quando o nameKey+casa já apareceu (reconciliação por relatório)', () => {
    const presentIds = new Set<string>(['outro-id-real']);
    const presentKeys = new Set(['lucasguimaraes|sportingbet']);
    expect(selectVisiblePending([lucas], presentIds, presentKeys, houseKey)).toEqual([]);
  });

  it('MANTÉM o pendente quando não há representação (nem id nem nameKey+casa)', () => {
    expect(selectVisiblePending([lucas], new Set(), new Set(), houseKey)).toEqual([lucas]);
  });

  it('o pendente de OUTRA casa do mesmo nome ainda aparece (afiliado é por casa)', () => {
    const superbet: PendingLike = { id: 'pending_lucasguimaraes_superbet', status: 'pending', nameKey: 'lucasguimaraes', house: 'Superbet' };
    // login na SportingBet presente; o pendente Superbet (id e casa diferentes) sobrevive
    const presentIds = new Set(['pending_lucasguimaraes_sportingbet']);
    const presentKeys = new Set(['lucasguimaraes|sportingbet']);
    expect(selectVisiblePending([lucas, superbet], presentIds, presentKeys, houseKey)).toEqual([superbet]);
  });

  it('ignora status != pending (reconciled/etc.) e entrada vazia/nula', () => {
    const reconciled: PendingLike = { ...lucas, status: 'reconciled' };
    expect(selectVisiblePending([reconciled], new Set(), new Set(), houseKey)).toEqual([]);
    expect(selectVisiblePending(null, new Set(), new Set(), houseKey)).toEqual([]);
    expect(selectVisiblePending(undefined, new Set(), new Set(), houseKey)).toEqual([]);
  });
});
