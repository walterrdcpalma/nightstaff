import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, LedgerReason } from '../../../engine/index.ts';
import { REASON_TEXT, caughtHeadline, formatDelta, historyGrid, listNames, morningHeadline, myResultLines } from './night.ts';

const P = ['ana', 'bruno', 'carla', 'duarte', 'eva', 'filipe', 'gil', 'helena'];
const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);
const atk = (playerId: string, targetId: string): Action => ({ playerId, type: 'ATTACK', targetId });
const bomb = (playerId: string, targetId: string): Action => ({ playerId, type: 'BOMB', targetId });

/** Resumo real do motor para uma noite. */
function summaryOf(actions: Action[], night = 1) {
  const { summary, ledger } = resolveNight({ players: P, night, pastActions: [] }, actions, 1);
  return { summary, ledger };
}

describe('resumo público da manhã (RULES.md §4 v5, cenários do CENARIOS.md)', () => {
  it('noite 1: casa/fora e a Carla apanhada, sem dizer onde', () => {
    const { summary } = summaryOf([
      atk('ana', 'bruno'),
      atk('carla', 'duarte'),
      { playerId: 'duarte', type: 'DEFEND' },
      atk('eva', 'filipe'),
      atk('filipe', 'gil'),
    ]);
    expect(morningHeadline(1, summary)).toBe('Noite 1: 4 em casa, 4 fora.');
    expect(caughtHeadline(summary, nameOf)).toBe('🚨 A Segurança apanhou Carla a meio de uma visita.');
  });

  it('noite 2: sorteio, assaltos e bónus não aparecem no público', () => {
    const { summary } = summaryOf([atk('ana', 'helena'), atk('bruno', 'helena'), atk('carla', 'helena')]);
    expect(caughtHeadline(summary, nameOf)).toBeNull();
    expect(morningHeadline(2, summary)).toBe('Noite 2: 5 em casa, 3 fora.');
  });

  it('noite 4: vários apanhados na mesma manchete', () => {
    const { summary } = summaryOf([atk('ana', 'duarte'), { playerId: 'duarte', type: 'DEFEND' }, atk('eva', 'duarte')]);
    expect(caughtHeadline(summary, nameOf)).toBe('🚨 A Segurança apanhou Ana e Eva a meio de uma visita.');
  });

  it('Desaparecer conta como fora', () => {
    const { summary } = summaryOf([{ playerId: 'ana', type: 'VANISH' }]);
    expect(morningHeadline(1, summary)).toBe('Noite 1: 7 em casa, 1 fora.');
  });

  it('nada do público tem pontos nem ações', () => {
    const { summary } = summaryOf([bomb('ana', 'gil'), atk('bruno', 'gil'), atk('carla', 'duarte')], 9);
    const text = [morningHeadline(9, summary), caughtHeadline(summary, nameOf) ?? ''].join(' ');
    expect(text).not.toMatch(/[+−-]\d|pontos|Reunião|sorteio/);
  });
});

describe('o meu resultado', () => {
  it('mostra os meus movimentos com o alvo e o sinal', () => {
    expect(
      myResultLines(
        [
          { delta: 10, reason: 'ATTACK_SUCCESS', target_id: 'bruno' },
          { delta: -5, reason: 'BURGLARY_VICTIM', target_id: null },
          { delta: 0, reason: 'ATTACK_AWAY_BOMBED', target_id: 'gil' },
          { delta: 10, reason: 'DEFENSE', target_id: 'carla' },
        ],
        nameOf,
      ),
    ).toEqual([
      '🗡️ Visita surpresa bem-sucedida (Bruno): +10',
      '😵 Assaltaram-te a casa vazia: −5',
      '🗡️ Casa vazia, mas a Reunião de emergência levou tudo (Gil): 0',
      '🛡️ A tua Segurança apanhou Carla: +10',
    ]);
  });

  it('tem texto para todas as razões do ledger', () => {
    const reasons: LedgerReason[] = [
      'ATTACK_SUCCESS', 'ATTACK_DRAW_WON', 'ATTACK_LOST_DRAW', 'ATTACK_BOMBED', 'ATTACK_DEFENDED', 'ATTACK_BURGLARY',
      'ATTACK_AWAY_BOMBED', 'BOMB_SUCCESS', 'BOMB_DEFENDED', 'VICTIM', 'BOMBED', 'BURGLARY_VICTIM', 'DEFENSE', 'HOME_BONUS',
    ];
    for (const r of reasons) expect(REASON_TEXT[r]).toBeTruthy();
    expect(formatDelta(-20)).toBe('−20');
  });
});

describe('bairro/histórico', () => {
  it('uma casa por jogador, janela acesa (em casa) ou apagada (fora) por noite', () => {
    const n1 = summaryOf([atk('ana', 'bruno')]).summary;
    const n2 = summaryOf([bomb('bruno', 'ana')]).summary;
    const grid = historyGrid(P, [
      { night: 1, summary: n1 },
      { night: 2, summary: n2 },
    ]);
    expect(grid.size).toBe(8);
    expect(grid.get('ana')!.slice(0, 3)).toEqual(['AWAY', 'HOME', null]); // noite 3 por resolver
    expect(grid.get('bruno')!.slice(0, 2)).toEqual(['HOME', 'AWAY']);
    expect(grid.get('ana')).toHaveLength(9);
  });

  it('quem saiu a meio do ciclo continua a aparecer nas noites em que jogou', () => {
    const n1 = summaryOf([]).summary;
    const grid = historyGrid(['ana'], [{ night: 1, summary: n1 }]);
    expect(grid.get('helena')![0]).toBe('HOME');
  });

  it('listNames', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Ana'])).toBe('Ana');
    expect(listNames(['Ana', 'Bruno', 'Carla'])).toBe('Ana, Bruno e Carla');
  });
});
