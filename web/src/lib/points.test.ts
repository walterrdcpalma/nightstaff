import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, LedgerReason } from '../../../engine/index.ts';
import { attacksText, movementsByNight, points, rankingRows, rankingVisible } from './points.ts';
import type { LedgerRow, RankingDbRow } from './points.ts';

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
    expect(rankingVisible('running')).toBe(false);
    expect(rankingVisible('finished')).toBe(true);
  });

  const db = (player_id: string, rank: number, points: number, successful_attacks = 0): RankingDbRow => ({
    player_id,
    rank,
    points,
    successful_attacks,
  });

  it('ordena pela posição gravada; o 1.º é o Funcionário do Mês', () => {
    const rows = rankingRows([db('carla', 3, 40), db('bruno', 1, 60, 1), db('ana', 2, 50)], nameOf);
    expect(rows.map((r) => [r.rank, r.name, r.points, r.tiebreak])).toEqual([
      [1, 'Bruno', 60, false],
      [2, 'Ana', 50, false],
      [3, 'Carla', 40, false],
    ]);
    expect(rows[0].successfulAttacks).toBe(1);
  });

  it('marca "desempate" quem está empatado em pontos com o de cima ou o de baixo', () => {
    const rows = rankingRows([db('ana', 1, 50, 3), db('bruno', 2, 50, 3), db('carla', 3, 40)], nameOf);
    expect(rows.map((r) => [r.name, r.tiebreak])).toEqual([
      ['Ana', true],
      ['Bruno', true],
      ['Carla', false],
    ]);
  });

  it('o ranking não precisa do ledger dos outros: só da tabela rankings', () => {
    expect(rankingRows([], nameOf)).toEqual([]);
  });
});

describe('textos', () => {
  it('ataques bem-sucedidos no singular e no plural', () => {
    expect(attacksText(0)).toBe('0 ataques bem-sucedidos');
    expect(attacksText(1)).toBe('1 ataque bem-sucedido');
    expect(attacksText(3)).toBe('3 ataques bem-sucedidos');
  });
});
