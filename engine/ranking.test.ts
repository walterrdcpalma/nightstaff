import { describe, expect, it } from 'vitest';
import { rankPlayers } from './ranking.ts';
import type { LedgerEntry, LedgerReason } from './types.ts';

const e = (playerId: string, delta: number, reason: LedgerReason): LedgerEntry => ({ playerId, delta, reason });
const order = (ledger: LedgerEntry[], players = ['A', 'B', 'C']) =>
  rankPlayers(players, ledger).map((r) => [r.playerId, r.rank]);

describe('rankPlayers', () => {
  it('ordena por pontos e soma o ledger de várias noites', () => {
    const r = rankPlayers(['A', 'B', 'C'], [
      e('A', 10, 'ATTACK_SUCCESS'),
      e('B', 2, 'HOME_BONUS'),
      e('A', -10, 'VICTIM'),
      e('C', 10, 'DEFENSE'),
    ]);
    expect(r).toEqual([
      { playerId: 'C', points: 10, successfulAttacks: 0, pointsLost: 0, rank: 1 },
      { playerId: 'B', points: 2, successfulAttacks: 0, pointsLost: 0, rank: 2 },
      { playerId: 'A', points: 0, successfulAttacks: 1, pointsLost: 10, rank: 3 },
    ]);
  });

  it('jogadores sem entradas no ledger ficam com 0', () => {
    expect(rankPlayers(['A', 'B'], [e('A', -10, 'VICTIM')]).map((r) => [r.playerId, r.points])).toEqual([
      ['B', 0],
      ['A', -10],
    ]);
  });

  it('desempate 1: mais ataques bem-sucedidos', () => {
    // A e B com 10 pontos; B tem 2 acertos, A tem 1.
    const ledger = [
      e('A', 10, 'DEFENSE'),
      e('A', 10, 'ATTACK_SUCCESS'),
      e('A', -10, 'VICTIM'),
      e('B', 10, 'ATTACK_SUCCESS'),
      e('B', 10, 'ATTACK_SUCCESS'),
      e('B', -10, 'VICTIM'),
    ];
    expect(order(ledger, ['A', 'B'])).toEqual([['B', 1], ['A', 2]]);
  });

  it('bombas que renderam pontos contam como ataque bem-sucedido', () => {
    const ledger = [e('A', 10, 'ATTACK_SUCCESS'), e('B', 6, 'BOMB_SUCCESS'), e('B', 4, 'DEFENSE')];
    const r = rankPlayers(['A', 'B'], ledger);
    expect(r.map((x) => [x.playerId, x.successfulAttacks, x.rank])).toEqual([
      ['A', 1, 1],
      ['B', 1, 1],
    ]);
  });

  it('desempate 2: menos pontos perdidos', () => {
    // A e B com 10 pontos e 1 acerto; A perdeu 20, B perdeu 10.
    const ledger = [
      e('A', 10, 'ATTACK_SUCCESS'),
      e('A', 20, 'DEFENSE'),
      e('A', -20, 'BOMB_DEFENDED'),
      e('B', 10, 'ATTACK_SUCCESS'),
      e('B', 10, 'DEFENSE'),
      e('B', -10, 'VICTIM'),
    ];
    expect(order(ledger, ['A', 'B'])).toEqual([['B', 1], ['A', 2]]);
  });

  it('empate em tudo: vitória partilhada, e a posição seguinte salta', () => {
    const ledger = [e('A', 10, 'ATTACK_SUCCESS'), e('B', 10, 'ATTACK_SUCCESS'), e('C', 2, 'HOME_BONUS')];
    expect(order(ledger)).toEqual([['A', 1], ['B', 1], ['C', 3]]);
  });

  it('entradas com delta 0 não contam como acerto nem como perda', () => {
    const r = rankPlayers(['A'], [e('A', 0, 'ATTACK_TARGET_AWAY'), e('A', 0, 'BOMB_TARGET_AWAY')]);
    expect(r[0]).toMatchObject({ points: 0, successfulAttacks: 0, pointsLost: 0 });
  });

  it('jogador desconhecido no ledger lança erro', () => {
    expect(() => rankPlayers(['A'], [e('Z', 10, 'ATTACK_SUCCESS')])).toThrow(/Z/);
  });
});
