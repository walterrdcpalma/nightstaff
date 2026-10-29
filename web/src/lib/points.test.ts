import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, LedgerReason } from '../../../engine/index.ts';
import { movementsByNight, points, rankingRows, rankingVisible } from './points.ts';
import type { LedgerRow } from './points.ts';

const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);
const row = (night: number, player_id: string, delta: number, reason: LedgerReason, target_id: string | null = null): LedgerRow => ({
  night,
  player_id,
  delta,
  reason,
  target_id,
});

describe('os meus pontos', () => {
  it('salário de 50 + movimentos, também abaixo de 0', () => {
    expect(points([])).toBe(50);
    expect(points([{ delta: 10 }, { delta: -5 }])).toBe(55);
    expect(points([{ delta: -40 }, { delta: -20 }])).toBe(-10);
  });

  it('movimentos noite a noite, a mais recente primeiro, com a soma da noite', () => {
    const mine = [
      row(1, 'filipe', 10, 'ATTACK_SUCCESS', 'gil'),
      row(1, 'filipe', -5, 'BURGLARY_VICTIM'),
      row(2, 'filipe', 2, 'HOME_BONUS'),
    ];
    expect(movementsByNight(mine, nameOf)).toEqual([
      { night: 2, total: '+2', lines: ['✨ Bónus de casa: +2'] },
      {
        night: 1,
        total: '+5',
        lines: ['🗡️ Visita surpresa bem-sucedida (Gil): +10', '😵 Assaltaram-te a casa vazia: −5'],
      },
    ]);
  });

  it('CENARIOS.md noite 1 pelo motor: o Filipe fica com +5 e 55 pontos', () => {
    const P = ['ana', 'bruno', 'carla', 'duarte', 'eva', 'filipe', 'gil', 'helena'];
    const a = (playerId: string, targetId: string): Action => ({ playerId, type: 'ATTACK', targetId });
    const { ledger } = resolveNight(
      { players: P, night: 1, pastActions: [] },
      [a('ana', 'bruno'), a('carla', 'duarte'), { playerId: 'duarte', type: 'DEFEND' }, a('eva', 'filipe'), a('filipe', 'gil')],
      1,
    );
    const mine = ledger
      .filter((e) => e.playerId === 'filipe')
      .map((e) => row(1, e.playerId, e.delta, e.reason, e.targetId ?? null));
    expect(points(mine)).toBe(55);
    expect(movementsByNight(mine, nameOf)[0].total).toBe('+5');
  });
});

describe('ranking final (dia 11)', () => {
  it('só com o ciclo acabado', () => {
    expect(rankingVisible('prep')).toBe(false);
    expect(rankingVisible('running')).toBe(false);
    expect(rankingVisible('finished')).toBe(true);
  });

  it('ordena por pontos; o 1.º é o Funcionário do Mês', () => {
    const rows = rankingRows(['ana', 'bruno', 'carla'], [row(1, 'bruno', 10, 'ATTACK_SUCCESS', 'carla'), row(1, 'carla', -10, 'VICTIM')], 1, nameOf);
    expect(rows.map((r) => [r.rank, r.name, r.points, r.tiebreak])).toEqual([
      [1, 'Bruno', 60, false],
      [2, 'Ana', 50, false],
      [3, 'Carla', 40, false],
    ]);
  });

  it('CENARIOS.md C1: empate em pontos e acertos, ganha a Ana pelo confronto direto', () => {
    // Ana: 3 acertos (2 no Bruno); Bruno: 3 acertos (1 na Ana). Ambos com 50 + 30 − 30 = 50.
    const ledger = [
      row(1, 'ana', 10, 'ATTACK_SUCCESS', 'bruno'),
      row(2, 'ana', 10, 'ATTACK_SUCCESS', 'bruno'),
      row(3, 'ana', 10, 'ATTACK_SUCCESS', 'carla'),
      row(4, 'bruno', 10, 'ATTACK_SUCCESS', 'ana'),
      row(5, 'bruno', 10, 'ATTACK_SUCCESS', 'carla'),
      row(6, 'bruno', 10, 'ATTACK_SUCCESS', 'carla'),
      row(7, 'ana', -30, 'VICTIM'),
      row(7, 'bruno', -30, 'VICTIM'),
    ];
    const rows = rankingRows(['ana', 'bruno', 'carla'], ledger, 1, nameOf);
    expect(rows.slice(0, 2).map((r) => [r.name, r.points, r.tiebreak])).toEqual([
      ['Ana', 50, true],
      ['Bruno', 50, true],
    ]);
  });

  it('há sempre um só 1.º lugar, mesmo empatados em tudo (sorteio com a seed)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rows = rankingRows(['ana', 'bruno'], [], seed, nameOf);
      expect(rows.filter((r) => r.rank === 1)).toHaveLength(1);
    }
  });

  it('quem saiu a meio do ciclo e tem movimentos entra no ranking', () => {
    const rows = rankingRows(['ana'], [row(1, 'dina', 2, 'HOME_BONUS')], 1, nameOf);
    expect(rows.map((r) => r.name).sort()).toEqual(['Ana', 'Dina']);
  });
});
