// Cenários de aceitação do CENARIOS.md. Se o motor der outro resultado, o motor está errado.
import { describe, expect, it } from 'vitest';
import { resolveNight } from './resolveNight.ts';
import type { Action, GameState, NightResult, PlayerId } from './types.ts';
import { validateAction } from './validateAction.ts';

const PLAYERS = ['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva', 'Filipe', 'Gil', 'Helena'];

const folga = (p: PlayerId): Action => ({ playerId: p, type: 'STAY' });
const seguranca = (p: PlayerId): Action => ({ playerId: p, type: 'DEFEND' });
const ataca = (p: PlayerId, t: PlayerId): Action => ({ playerId: p, type: 'ATTACK', targetId: t });
const bomba = (p: PlayerId, t: PlayerId): Action => ({ playerId: p, type: 'BOMB', targetId: t });

/** Seed com que o sorteio da noite 2 (Ana, Bruno, Carla → Helena) dá Bruno. */
const SEED_SORTEIO_BRUNO = 1;

const NIGHTS: { actions: Action[]; seed: number; deltas: Record<PlayerId, number> }[] = [
  {
    // Noite 1 — Básico
    actions: [
      ataca('Ana', 'Bruno'),
      folga('Bruno'),
      ataca('Carla', 'Duarte'),
      seguranca('Duarte'),
      ataca('Eva', 'Filipe'),
      ataca('Filipe', 'Gil'),
      folga('Gil'),
      folga('Helena'),
    ],
    seed: 1,
    deltas: { Ana: 10, Bruno: -10, Carla: -10, Duarte: 10, Eva: 0, Filipe: 10, Gil: -10, Helena: 2 },
  },
  {
    // Noite 2 — Sorteio, ataques cruzados e ação por defeito (Gil não escolheu)
    actions: [
      ataca('Ana', 'Helena'),
      ataca('Bruno', 'Helena'),
      ataca('Carla', 'Helena'),
      ataca('Duarte', 'Eva'),
      ataca('Eva', 'Duarte'),
      seguranca('Filipe'),
      folga('Helena'),
    ],
    seed: SEED_SORTEIO_BRUNO,
    deltas: { Ana: -10, Bruno: 10, Carla: -10, Duarte: 0, Eva: 0, Filipe: 2, Gil: 2, Helena: -10 },
  },
  {
    // Noite 3 — Bombas
    actions: [
      bomba('Ana', 'Gil'),
      ataca('Bruno', 'Gil'),
      ataca('Carla', 'Gil'),
      bomba('Duarte', 'Helena'),
      bomba('Eva', 'Filipe'),
      folga('Filipe'),
      folga('Gil'),
      seguranca('Helena'),
    ],
    seed: 1,
    deltas: { Ana: 30, Bruno: -10, Carla: -10, Duarte: -20, Eva: 10, Filipe: -10, Gil: -10, Helena: 10 },
  },
  {
    // Noite 4 — Várias bombas, arredondamento e defesa contra 2 ataques
    actions: [
      ataca('Ana', 'Duarte'),
      bomba('Bruno', 'Filipe'),
      bomba('Carla', 'Filipe'),
      seguranca('Duarte'),
      ataca('Eva', 'Duarte'),
      folga('Filipe'),
      ataca('Gil', 'Filipe'),
      bomba('Helena', 'Filipe'),
    ],
    seed: 1,
    deltas: { Ana: -10, Bruno: 6, Carla: 6, Duarte: 20, Eva: -10, Filipe: -10, Gil: -10, Helena: 6 },
  },
];

/** Joga as noites 1–4 por ordem, com as quotas a acumular. */
function playNights(): { results: NightResult[]; state: GameState } {
  const state: GameState = { players: PLAYERS, pastActions: [] };
  const results: NightResult[] = [];
  for (const n of NIGHTS) {
    results.push(resolveNight({ ...state, pastActions: [...state.pastActions] }, n.actions, n.seed));
    state.pastActions.push(...n.actions);
  }
  return { results, state };
}

function sumByPlayer(result: NightResult): Record<PlayerId, number> {
  const t = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  for (const e of result.ledger) t[e.playerId] += e.delta;
  return t;
}

const { results, state: afterNight4 } = playNights();
const summaryOf = (night: number, p: PlayerId) => results[night - 1].summary.players.find((s) => s.playerId === p)!;
const bonusWinners = (night: number) => results[night - 1].summary.players.filter((s) => s.homeBonus).map((s) => s.playerId);

describe('CENARIOS.md', () => {
  NIGHTS.forEach((n, i) => {
    it(`noite ${i + 1}: pontos de cada jogador`, () => {
      expect(sumByPlayer(results[i])).toEqual(n.deltas);
    });
  });

  it('noite 1: Carla fica revelada pela defesa do Duarte; só Helena ganha bónus', () => {
    expect(summaryOf(1, 'Duarte')).toMatchObject({ defended: true, revealedAttackers: ['Carla'], homeBonus: false });
    expect(summaryOf(1, 'Filipe')).toMatchObject({ location: 'AWAY', attacks: 1 });
    expect(bonusWinners(1)).toEqual(['Helena']);
  });

  it('noite 2: sorteio dá Bruno; resumo diz "3 atacantes na Helena, houve sorteio", sem nomes', () => {
    expect(results[1].ledger.find((e) => e.reason === 'ATTACK_SUCCESS')?.playerId).toBe('Bruno');
    expect(summaryOf(2, 'Helena')).toMatchObject({ attacks: 3, bombs: 0, draw: true, revealedAttackers: [] });
    expect(summaryOf(2, 'Duarte')).toMatchObject({ location: 'AWAY', attacks: 1 });
    expect(summaryOf(2, 'Eva')).toMatchObject({ location: 'AWAY', attacks: 1 });
    expect(summaryOf(2, 'Gil').location).toBe('HOME');
    expect(bonusWinners(2)).toEqual(['Filipe', 'Gil']);
  });

  it('noite 3: Duarte fica revelado pela defesa da Helena; sem sorteio; ninguém ganha bónus', () => {
    expect(summaryOf(3, 'Helena')).toMatchObject({ defended: true, bombs: 1, revealedAttackers: ['Duarte'] });
    expect(summaryOf(3, 'Gil')).toMatchObject({ attacks: 2, bombs: 1, draw: false, revealedAttackers: [] });
    expect(bonusWinners(3)).toEqual([]);
  });

  it('noite 4: Ana e Eva ficam reveladas; Filipe com 3 bombas e 1 ataque; ninguém ganha bónus', () => {
    expect(summaryOf(4, 'Duarte')).toMatchObject({ defended: true, attacks: 2, revealedAttackers: ['Ana', 'Eva'] });
    expect(summaryOf(4, 'Filipe')).toMatchObject({ attacks: 1, bombs: 3, draw: false });
    expect(bonusWinners(4)).toEqual([]);
  });

  it('totais após 4 noites', () => {
    const totals = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
    for (const r of results) for (const e of r.ledger) totals[e.playerId] += e.delta;
    expect(totals).toEqual({ Ana: 20, Bruno: -4, Carla: -24, Duarte: 10, Eva: 0, Filipe: -8, Gil: -28, Helena: 8 });
  });

  describe('noite 5: validação', () => {
    it('Ana tenta atacar → rejeitado (3 ataques usados nas noites 1, 2 e 4)', () => {
      expect(validateAction(afterNight4, ataca('Ana', 'Bruno'))).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
    });

    it('Duarte tenta Segurança → rejeitado (2 defesas usadas nas noites 1 e 4)', () => {
      expect(validateAction(afterNight4, seguranca('Duarte'))).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
    });

    it('Ana tenta bomba → rejeitado (bomba usada na noite 3)', () => {
      expect(validateAction(afterNight4, bomba('Ana', 'Bruno'))).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
    });

    it('Gil tenta atacar Gil → rejeitado (alvo próprio)', () => {
      expect(validateAction(afterNight4, ataca('Gil', 'Gil'))).toEqual({ ok: false, error: 'SELF_TARGET' });
    });

    it('Gil tenta atacar Ana → aceite (só usou 1 ataque)', () => {
      expect(validateAction(afterNight4, ataca('Gil', 'Ana'))).toEqual({ ok: true });
    });
  });
});
