import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, LedgerReason, PlayerNightSummary } from '../../../engine/index.ts';
import { REASON_TEXT, formatDelta, historyGrid, listNames, morningHeadline, myResultLines, playerLines } from './night.ts';

const P = ['ana', 'bruno', 'carla', 'duarte', 'eva', 'filipe', 'gil', 'helena'];
const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);
const atk = (playerId: string, targetId: string): Action => ({ playerId, type: 'ATTACK', targetId });
const bomb = (playerId: string, targetId: string): Action => ({ playerId, type: 'BOMB', targetId });

/** Resumo real do motor para uma noite. */
function summaryOf(actions: Action[], night = 1) {
  const { summary } = resolveNight({ players: P, night, pastActions: [] }, actions, 1);
  const of = (id: string) => summary.players.find((s) => s.playerId === id)!;
  return { summary, lines: (id: string) => playerLines(of(id), nameOf) };
}

describe('resumo da manhã (RULES.md §4, cenários do CENARIOS.md)', () => {
  it('noite 1: ataque anónimo, defesa revela o atacante, bónus de casa', () => {
    const { summary, lines } = summaryOf([
      atk('ana', 'bruno'),
      atk('carla', 'duarte'),
      { playerId: 'duarte', type: 'DEFEND' },
      atk('eva', 'filipe'),
      atk('filipe', 'gil'),
    ]);
    expect(morningHeadline(1, summary)).toBe('Noite 1: 4 em casa, 4 fora.');
    expect(lines('bruno')).toEqual(['🗡️ 1 Visita surpresa.']);
    expect(lines('duarte')).toEqual(['🛡️ A Segurança apanhou Carla.']);
    expect(lines('filipe')).toEqual(['🗡️ 1 Visita surpresa.']); // assaltado fora de casa
    expect(lines('helena')).toEqual(['✨ Noite tranquila: bónus de casa.']);
    expect(lines('ana')).toEqual([]); // não se diz quem atacou quem
  });

  it('noite 2: sorteio só com os números, sem nomes', () => {
    const { lines } = summaryOf([atk('ana', 'helena'), atk('bruno', 'helena'), atk('carla', 'helena')]);
    expect(lines('helena')).toEqual(['🗡️ 3 atacantes, houve sorteio.']);
  });

  it('noite 3: bombas só com os números; defesa revela também o bombista', () => {
    const { lines } = summaryOf([
      bomb('ana', 'gil'),
      atk('bruno', 'gil'),
      atk('carla', 'gil'),
      bomb('duarte', 'helena'),
      { playerId: 'helena', type: 'DEFEND' },
    ]);
    expect(lines('gil')).toEqual(['🗡️ 2 Visitas surpresa.', '💣 1 Reunião de emergência.']);
    expect(lines('helena')).toEqual(['🛡️ A Segurança apanhou Duarte.']);
  });

  it('defesa contra vários revela todos', () => {
    const s: PlayerNightSummary = {
      playerId: 'duarte',
      location: 'HOME',
      attacks: 2,
      bombs: 1,
      defended: true,
      revealedAttackers: ['ana', 'eva', 'gil'],
      draw: false,
      homeBonus: false,
    };
    expect(playerLines(s, nameOf)).toEqual(['🛡️ A Segurança apanhou Ana, Eva e Gil.']);
  });

  it('o resumo nunca mostra pontos', () => {
    const { summary } = summaryOf([bomb('ana', 'gil'), atk('bruno', 'gil'), atk('carla', 'duarte')], 9);
    const all = summary.players.flatMap((s) => playerLines(s, nameOf)).join(' ');
    expect(all).not.toMatch(/[+−-]\d|pontos/);
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
        ],
        nameOf,
      ),
    ).toEqual([
      '🗡️ Visita surpresa bem-sucedida (Bruno): +10',
      '😵 Assaltaram-te a casa vazia: −5',
      '🗡️ Casa vazia, mas a Reunião de emergência levou tudo (Gil): 0',
    ]);
  });

  it('tem texto para todas as razões do ledger', () => {
    const reasons: LedgerReason[] = [
      'ATTACK_SUCCESS', 'ATTACK_LOST_DRAW', 'ATTACK_BOMBED', 'ATTACK_DEFENDED', 'ATTACK_BURGLARY', 'ATTACK_AWAY_BOMBED',
      'BOMB_SUCCESS', 'BOMB_DEFENDED', 'VICTIM', 'BURGLARY_VICTIM', 'DEFENSE', 'HOME_BONUS',
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
