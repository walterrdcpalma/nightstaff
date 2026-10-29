import { describe, expect, it } from 'vitest';
import { finalRanking } from './ranking.ts';
import type { LedgerEntry, LedgerReason, PlayerId } from './types.ts';

const e = (playerId: string, delta: number, reason: LedgerReason, targetId?: PlayerId): LedgerEntry => ({
  playerId,
  delta,
  reason,
  ...(targetId && { targetId }),
});
const hit = (playerId: PlayerId, targetId: PlayerId) => e(playerId, 10, 'ATTACK_SUCCESS', targetId);
const order = (ledger: LedgerEntry[], players = ['A', 'B', 'C'], seed = 1) =>
  finalRanking(players, ledger, seed).map((r) => [r.playerId, r.rank]);

describe('finalRanking', () => {
  it('ordena por pontos (50 de salário + ledger de várias noites)', () => {
    const r = finalRanking(['A', 'B', 'C'], [
      hit('A', 'B'),
      e('B', 2, 'HOME_BONUS'),
      e('A', -10, 'VICTIM'),
      e('C', 10, 'DEFENSE'),
    ], 1);
    expect(r).toEqual([
      { playerId: 'C', points: 60, successfulAttacks: 0, pointsLost: 0, rank: 1 },
      { playerId: 'B', points: 52, successfulAttacks: 0, pointsLost: 0, rank: 2 },
      { playerId: 'A', points: 50, successfulAttacks: 1, pointsLost: 10, rank: 3 },
    ]);
  });

  it('jogadores sem entradas no ledger ficam com o salário; pode-se ficar "sem salário" (abaixo de 0)', () => {
    const ledger = Array.from({ length: 6 }, () => e('A', -10, 'VICTIM'));
    expect(finalRanking(['A', 'B'], ledger, 1).map((r) => [r.playerId, r.points])).toEqual([
      ['B', 50],
      ['A', -10],
    ]);
  });

  it('desempate 1: mais ataques bem-sucedidos', () => {
    // A e B com 60 pontos; B tem 2 acertos, A tem 1.
    const ledger = [
      e('A', 10, 'DEFENSE'),
      hit('A', 'C'),
      e('A', -10, 'VICTIM'),
      hit('B', 'C'),
      hit('B', 'C'),
      e('B', -10, 'VICTIM'),
    ];
    expect(order(ledger)).toEqual([['B', 1], ['A', 2], ['C', 3]]);
  });

  it('bombas que renderam pontos contam como ataque bem-sucedido', () => {
    const ledger = [hit('A', 'C'), e('B', 6, 'BOMB_SUCCESS', 'C'), e('B', 4, 'DEFENSE')];
    expect(finalRanking(['A', 'B'], ledger, 1).map((x) => x.successfulAttacks)).toEqual([1, 1]);
  });

  it('movimentos com 0 pontos não contam como acerto nem como perda', () => {
    const r = finalRanking(['A'], [e('A', 0, 'ATTACK_TARGET_AWAY', 'B'), e('A', 0, 'BOMB_SUCCESS', 'B')], 1);
    expect(r[0]).toMatchObject({ points: 50, successfulAttacks: 0, pointsLost: 0 });
  });

  it('desempate 2: confronto direto entre 2 empatados', () => {
    // A e B: 60 pontos e 2 acertos. A acertou 1 vez em B; B nunca acertou em A.
    const ledger = [hit('A', 'B'), hit('A', 'C'), e('A', -10, 'VICTIM'), hit('B', 'C'), hit('B', 'C'), e('B', -10, 'VICTIM')];
    expect(order(ledger)).toEqual([['A', 1], ['B', 2], ['C', 3]]);
  });

  it('desempate 2: o confronto direto vem antes dos pontos perdidos', () => {
    // A e B: 60 pontos e 1 acerto. B perdeu menos, mas A acertou em B.
    const ledger = [hit('A', 'B'), e('A', 20, 'DEFENSE'), e('A', -20, 'VICTIM'), hit('B', 'C')];
    expect(order(ledger)).toEqual([['A', 1], ['B', 2], ['C', 3]]);
  });

  it('desempate 2: a mini-liga conta uma só vez; quem continua empatado passa aos pontos perdidos', () => {
    // A, B e C: 60 pontos e 2 acertos. Mini-liga: A→B 1, B→C 1, C→D 2 → A 1, B 1, C 0.
    // A e B continuam empatados (não há nova mini-liga entre os dois): B perdeu menos.
    const ledger = [
      ...[hit('A', 'B'), hit('A', 'D'), e('A', 10, 'DEFENSE'), e('A', -20, 'VICTIM')],
      ...[hit('B', 'C'), hit('B', 'D'), e('B', -10, 'VICTIM')],
      ...[hit('C', 'D'), hit('C', 'D'), e('C', -10, 'VICTIM')],
    ];
    expect(order(ledger, ['A', 'B', 'C', 'D'])).toEqual([['B', 1], ['A', 2], ['C', 3], ['D', 4]]);
  });

  it('desempate 3: menos pontos perdidos', () => {
    // A e B: 60 pontos e 1 acerto, sem confronto direto; A perdeu 20, B perdeu 10.
    const ledger = [
      hit('A', 'C'),
      e('A', 20, 'DEFENSE'),
      e('A', -20, 'BOMB_DEFENDED', 'C'),
      hit('B', 'C'),
      e('B', 10, 'DEFENSE'),
      e('B', -10, 'VICTIM'),
    ];
    expect(order(ledger)).toEqual([['B', 1], ['A', 2], ['C', 3]]);
  });

  it('desempate 4: sorteio reprodutível pela seed do ciclo, nunca vitória partilhada', () => {
    const ledger = [hit('A', 'C'), hit('B', 'C'), e('C', 2, 'HOME_BONUS')];
    const winners = new Set<PlayerId>();
    for (let seed = 0; seed < 50; seed++) {
      const r = order(ledger, ['A', 'B', 'C'], seed);
      expect(r.map(([, rank]) => rank)).toEqual([1, 2, 3]);
      expect(r[2][0]).toBe('C');
      // Não depende da ordem de `players`.
      expect(order(ledger, ['C', 'B', 'A'], seed)).toEqual(r);
      winners.add(r[0][0] as PlayerId);
    }
    expect(winners).toEqual(new Set(['A', 'B']));
  });

  it('empate a 3 em pontos, desfeito em cascata pelos critérios', () => {
    // A, B e C com 60 pontos. C tem 2 acertos; A e B têm 1, sem confronto direto, e A perdeu menos.
    const ledger = [
      hit('A', 'D'),
      hit('B', 'D'),
      e('B', 10, 'DEFENSE'),
      e('B', -10, 'VICTIM'),
      hit('C', 'D'),
      hit('C', 'D'),
      e('C', -10, 'VICTIM'),
      e('D', 10, 'DEFENSE'),
      e('D', 10, 'DEFENSE'),
    ];
    expect(order(ledger, ['A', 'B', 'C', 'D'])).toEqual([['D', 1], ['C', 2], ['A', 3], ['B', 4]]);
  });

  it('jogador desconhecido no ledger lança erro', () => {
    expect(() => finalRanking(['A'], [hit('Z', 'A')], 1)).toThrow(/Z/);
  });
});
