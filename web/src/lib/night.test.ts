import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, LedgerReason } from '../../../engine/index.ts';
import { REASON_TEXT, formatDelta, morningHeadline, myResultLines, privateReport } from './night.ts';

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
    expect(summary.caught).toEqual(['carla']);
  });

  it('noite 2: sorteio, assaltos e bónus não aparecem no público', () => {
    const { summary } = summaryOf([atk('ana', 'helena'), atk('bruno', 'helena'), atk('carla', 'helena')]);
    expect(summary.caught).toEqual([]);
    expect(morningHeadline(2, summary)).toBe('Noite 2: 5 em casa, 3 fora.');
  });

  it('noite 4: vários apanhados na mesma noite', () => {
    const { summary } = summaryOf([atk('ana', 'duarte'), { playerId: 'duarte', type: 'DEFEND' }, atk('eva', 'duarte')]);
    expect(summary.caught).toEqual(['ana', 'eva']);
  });

  it('Desaparecer conta como fora', () => {
    const { summary } = summaryOf([{ playerId: 'ana', type: 'VANISH' }]);
    expect(morningHeadline(1, summary)).toBe('Noite 1: 7 em casa, 1 fora.');
  });

  it('nada do público tem pontos nem ações', () => {
    const { summary } = summaryOf([bomb('ana', 'gil'), atk('bruno', 'gil'), atk('carla', 'duarte')], 9);
    const text = morningHeadline(9, summary);
    expect(text).not.toMatch(/[+−-]\d|pontos|Despedimento|Reunião|sorteio/);
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
      '🗡️ Casa vazia, mas o Despedimento coletivo levou tudo (Gil): 0',
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

describe('relatório privado da manhã', () => {
  it('CENARIOS.md noite 2 pelo motor: cada um vê só o seu resultado e os seus pontos da noite', () => {
    const { ledger } = summaryOf([atk('ana', 'helena'), atk('bruno', 'helena'), atk('carla', 'helena')], 2);
    const mine = (p: string) =>
      ledger.filter((e) => e.playerId === p).map((e) => ({ delta: e.delta, reason: e.reason, target_id: e.targetId ?? null }));
    // A Helena sabe que foi atacada, mas não por quem.
    expect(privateReport(mine('helena'), nameOf)).toEqual({ lines: ['😵 Fizeram-te uma Visita surpresa em casa: −10'], total: '−10' });
    const winner = ['ana', 'bruno', 'carla'].find((p) => mine(p)[0].reason === 'ATTACK_DRAW_WON')!;
    expect(privateReport(mine(winner), nameOf)).toEqual({
      lines: ['🗡️ Ganhaste o sorteio da Visita surpresa (Helena): +10'],
      total: '+10',
    });
  });

  it('sem movimentos: noite tranquila e 0 pontos', () => {
    expect(privateReport([], nameOf)).toEqual({ lines: ['🌙 Noite tranquila: nada a registar.'], total: '0' });
  });
});
