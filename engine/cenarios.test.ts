// Cenários de aceitação do CENARIOS.md (regras v3). Se o motor der outro resultado, o motor está errado.
import { describe, expect, it } from 'vitest';
import { finalRanking } from './ranking.ts';
import { resolveNight } from './resolveNight.ts';
import { SALARY } from './types.ts';
import type { Action, GameState, LedgerEntry, NightResult, PlayerId } from './types.ts';
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
    deltas: { Ana: 10, Bruno: -10, Carla: -5, Duarte: 10, Eva: 0, Filipe: 10, Gil: -10, Helena: 2 },
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
    deltas: { Ana: 30, Bruno: -10, Carla: -10, Duarte: -10, Eva: 10, Filipe: -10, Gil: -10, Helena: 10 },
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
    deltas: { Ana: -5, Bruno: 6, Carla: 6, Duarte: 20, Eva: -5, Filipe: -10, Gil: -10, Helena: 6 },
  },
];

/** Joga as noites 1–4 por ordem, com as quotas a acumular. */
function playNights(): { results: NightResult[]; state: GameState } {
  const state: GameState = { players: PLAYERS, night: 1, pastActions: [] };
  const results: NightResult[] = [];
  for (const [i, n] of NIGHTS.entries()) {
    results.push(resolveNight({ ...state, night: i + 1, pastActions: [...state.pastActions] }, n.actions, n.seed));
    state.pastActions.push(...n.actions);
  }
  return { results, state };
}

function sumByPlayer(result: NightResult): Record<PlayerId, number> {
  const t = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  for (const e of result.ledger) t[e.playerId] += e.delta;
  return t;
}

const { results, state: playedNights } = playNights();
const afterNight4: GameState = { ...playedNights, night: 5 };
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
    expect(totals).toEqual({ Ana: 25, Bruno: -4, Carla: -19, Duarte: 20, Eva: 5, Filipe: -8, Gil: -28, Helena: 8 });
  });

  it('pontos após 4 noites (50 de salário + movimentos)', () => {
    const points = Object.fromEntries(
      finalRanking(PLAYERS, results.flatMap((r) => r.ledger), 1).map((r) => [r.playerId, r.points]),
    );
    expect(points).toEqual({ Ana: 75, Bruno: 46, Carla: 31, Duarte: 70, Eva: 55, Filipe: 42, Gil: 22, Helena: 58 });
    expect(SALARY).toBe(50);
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

describe('CENARIOS.md, cenário extra A: bomba num alvo fora', () => {
  const r = resolveNight(
    { players: ['Ana', 'Bruno', 'Carla', 'Duarte'], night: 1, pastActions: [] },
    [bomba('Ana', 'Bruno'), ataca('Bruno', 'Carla'), ataca('Carla', 'Bruno'), bomba('Duarte', 'Bruno')],
    1,
  );
  const of = (p: PlayerId) => r.ledger.filter((e) => e.playerId === p);

  it('Bruno -10, Ana +5, Duarte +5, Carla 0; o ataque do Bruno também falha', () => {
    const totals = Object.fromEntries(['Ana', 'Bruno', 'Carla', 'Duarte'].map((p) => [p, 0]));
    for (const e of r.ledger) totals[e.playerId] += e.delta;
    expect(totals).toEqual({ Ana: 5, Bruno: -10, Carla: 0, Duarte: 5 });
    expect(of('Bruno').map((e) => [e.reason, e.delta]).sort()).toEqual([
      ['ATTACK_TARGET_AWAY', 0],
      ['VICTIM', -10],
    ]);
    expect(of('Carla').map((e) => [e.reason, e.delta])).toEqual([['ATTACK_TARGET_AWAY', 0]]);
  });

  it('ninguém ganha bónus: ninguém ficou em casa', () => {
    expect(r.summary.players.filter((s) => s.homeBonus)).toEqual([]);
    expect(r.summary.players.every((s) => s.location === 'AWAY')).toBe(true);
  });
});

describe('CENARIOS.md, cenário extra B: noite 9 a dobrar', () => {
  it('Ana +20, Bruno -20, Carla -10, Duarte +20, Eva +4', () => {
    const players = ['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva'];
    const r = resolveNight(
      { players, night: 9, pastActions: [] },
      [ataca('Ana', 'Bruno'), folga('Bruno'), ataca('Carla', 'Duarte'), seguranca('Duarte'), folga('Eva')],
      1,
    );
    const totals = Object.fromEntries(players.map((p) => [p, 0]));
    for (const e of r.ledger) totals[e.playerId] += e.delta;
    expect(totals).toEqual({ Ana: 20, Bruno: -20, Carla: -10, Duarte: 20, Eva: 4 });
  });
});

describe('CENARIOS.md, cenário extra C: desempates', () => {
  const hit = (playerId: PlayerId, targetId: PlayerId): LedgerEntry => ({
    playerId,
    delta: 10,
    reason: 'ATTACK_SUCCESS',
    targetId,
  });
  const lost = (playerId: PlayerId, delta: number): LedgerEntry => ({ playerId, delta: -delta, reason: 'VICTIM' });
  const winner = (players: PlayerId[], ledger: LedgerEntry[], seed: number) =>
    finalRanking(players, ledger, seed)[0].playerId;

  it('C1. confronto direto: Ana acertou 2 vezes no Bruno e o Bruno 1 vez na Ana → ganha a Ana', () => {
    // Os dois com 3 acertos e os mesmos pontos (50 + 30 - 20 = 60).
    const ledger = [
      ...[hit('Ana', 'Bruno'), hit('Ana', 'Bruno'), hit('Ana', 'Carla'), lost('Ana', 10), lost('Ana', 10)],
      ...[hit('Bruno', 'Ana'), hit('Bruno', 'Carla'), hit('Bruno', 'Carla'), lost('Bruno', 10), lost('Bruno', 10)],
    ];
    const players = ['Bruno', 'Ana', 'Carla'];
    const r = finalRanking(players, ledger, 1);
    expect(r.slice(0, 2).map((x) => [x.playerId, x.points, x.successfulAttacks, x.pointsLost])).toEqual([
      ['Ana', 60, 3, 20],
      ['Bruno', 60, 3, 20],
    ]);
    for (let seed = 0; seed < 20; seed++) expect(winner(players, ledger, seed)).toBe('Ana');
  });

  it('C2. mini-liga com 3 empatados: Ana→Bruno 1, Bruno→Carla 2, Carla→Ana 1 → ganha o Bruno', () => {
    // Todos com 3 acertos e 70 pontos; os acertos contra o Duarte não contam na mini-liga.
    const ledger = [
      ...[hit('Ana', 'Bruno'), hit('Ana', 'Duarte'), hit('Ana', 'Duarte'), lost('Ana', 10)],
      ...[hit('Bruno', 'Carla'), hit('Bruno', 'Carla'), hit('Bruno', 'Duarte'), lost('Bruno', 10)],
      ...[hit('Carla', 'Ana'), hit('Carla', 'Duarte'), hit('Carla', 'Duarte'), lost('Carla', 10)],
    ];
    const players = ['Ana', 'Bruno', 'Carla', 'Duarte'];
    const r = finalRanking(players, ledger, 1);
    expect(r.slice(0, 3).map((x) => [x.points, x.successfulAttacks])).toEqual([[70, 3], [70, 3], [70, 3]]);
    for (let seed = 0; seed < 20; seed++) expect(winner(players, ledger, seed)).toBe('Bruno');
  });

  it('C3. uma Reunião que rendeu pontos no Bruno conta como 1 acerto contra o Bruno, para cada bombista', () => {
    // Noite real: Ana e Carla bombardeiam o Bruno em casa (5 cada).
    const players = ['Ana', 'Bruno', 'Carla'];
    const night = resolveNight({ players, night: 1, pastActions: [] }, [bomba('Ana', 'Bruno'), bomba('Carla', 'Bruno')], 1);
    const r = finalRanking(players, night.ledger, 1);
    expect(r.find((x) => x.playerId === 'Ana')!.successfulAttacks).toBe(1);
    expect(r.find((x) => x.playerId === 'Carla')!.successfulAttacks).toBe(1);
    // E conta no confronto direto: Ana e Bruno empatados (60, 1 acerto), o acerto da Ana foi no Bruno.
    const ledger: LedgerEntry[] = [
      { playerId: 'Ana', delta: 10, reason: 'BOMB_SUCCESS', targetId: 'Bruno' },
      hit('Bruno', 'Carla'),
    ];
    for (let seed = 0; seed < 20; seed++) expect(winner(players, ledger, seed)).toBe('Ana');
  });

  it('C4. empate em tudo: um só 1.º lugar, o mesmo com a mesma seed, e ambos ganham com seeds diferentes', () => {
    const ledger = [hit('Ana', 'Carla'), lost('Ana', 10), hit('Bruno', 'Carla'), lost('Bruno', 10)];
    const players = ['Ana', 'Bruno', 'Carla'];
    const winners = new Set<PlayerId>();
    for (let seed = 0; seed < 50; seed++) {
      const r = finalRanking(players, ledger, seed);
      expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
      expect(finalRanking(players, ledger, seed)).toEqual(r);
      expect(winner([...players].reverse(), ledger, seed)).toBe(r[0].playerId);
      winners.add(r[0].playerId);
    }
    expect(winners).toEqual(new Set(['Ana', 'Bruno']));
  });
});
