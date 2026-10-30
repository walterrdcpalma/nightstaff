// Cenários de aceitação do CENARIOS.md (regras v5). Se o motor der outro resultado, o motor está errado.
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
const desaparece = (p: PlayerId): Action => ({ playerId: p, type: 'VANISH' });

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
    deltas: { Ana: 10, Bruno: -10, Carla: -5, Duarte: 10, Eva: 5, Filipe: 5, Gil: -10, Helena: 2 },
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
    state.pastActions.push(...n.actions.map((a) => ({ ...a, night: i + 1 })));
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
const locationOf = (night: number, p: PlayerId) => results[night - 1].summary.players.find((s) => s.playerId === p)!.location;
const bonusWinners = (night: number) =>
  results[night - 1].ledger.filter((e) => e.reason === 'HOME_BONUS').map((e) => e.playerId);
/** O que o próprio jogador vê em privado: as suas linhas do ledger (razão, pontos e alvo, se houver). */
const privateOf = (night: number, p: PlayerId) =>
  results[night - 1].ledger.filter((e) => e.playerId === p).map((e) => [e.reason, e.delta, e.targetId ?? null]);
/** O resumo público só tem casa/fora e os apanhados (RULES.md §4). */
const publicKeys = (night: number) => [
  Object.keys(results[night - 1].summary).sort(),
  [...new Set(results[night - 1].summary.players.flatMap((s) => Object.keys(s)))].sort(),
];

describe('CENARIOS.md', () => {
  NIGHTS.forEach((n, i) => {
    it(`noite ${i + 1}: pontos de cada jogador`, () => {
      expect(sumByPlayer(results[i])).toEqual(n.deltas);
    });
  });

  it('noite 1: Carla aparece como apanhada (sem dizer onde); só o Duarte sabe que a apanhou; só Helena ganha bónus', () => {
    expect(results[0].summary.caught).toEqual(['Carla']);
    expect(privateOf(1, 'Duarte')).toEqual([['DEFENSE', 10, 'Carla']]);
    expect(locationOf(1, 'Filipe')).toBe('AWAY');
    expect(bonusWinners(1)).toEqual(['Helena']);
  });

  it('o resumo público de cada noite só tem casa/fora e os apanhados', () => {
    for (const night of [1, 2, 3, 4]) expect(publicKeys(night)).toEqual([['caught', 'players'], ['location', 'playerId']]);
  });

  it('noite 1: Eva assalta a casa vazia do Filipe (+5 / -5); Filipe acerta no Gil (+10)', () => {
    const of = (p: PlayerId) => results[0].ledger.filter((e) => e.playerId === p).map((e) => [e.reason, e.delta]);
    expect(of('Eva')).toEqual([['ATTACK_BURGLARY', 5]]);
    expect(of('Filipe').sort()).toEqual([['ATTACK_SUCCESS', 10], ['BURGLARY_VICTIM', -5]]);
  });

  it('noite 2: Duarte e Eva assaltam a casa vazia um do outro (+5 e -5 cada)', () => {
    for (const p of ['Duarte', 'Eva']) {
      const of = results[1].ledger.filter((e) => e.playerId === p).map((e) => [e.reason, e.delta]);
      expect(of.sort()).toEqual([['ATTACK_BURGLARY', 5], ['BURGLARY_VICTIM', -5]]);
    }
  });

  it('noite 2: o público só vê quem estava fora; cada um vê o seu resultado (sorteio dá Bruno)', () => {
    const away = results[1].summary.players.filter((s) => s.location === 'AWAY').map((s) => s.playerId);
    expect(away).toEqual(['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva']);
    expect(results[1].summary.caught).toEqual([]);
    // Privado: o Bruno ganhou o sorteio, a Ana e a Carla perderam-no, a Helena só sabe que foi atacada.
    expect(privateOf(2, 'Bruno')).toEqual([['ATTACK_DRAW_WON', 10, 'Helena']]);
    expect(privateOf(2, 'Ana')).toEqual([['ATTACK_LOST_DRAW', -10, 'Helena']]);
    expect(privateOf(2, 'Carla')).toEqual([['ATTACK_LOST_DRAW', -10, 'Helena']]);
    expect(privateOf(2, 'Helena')).toEqual([['VICTIM', -10, null]]);
    expect(locationOf(2, 'Gil')).toBe('HOME');
    expect(bonusWinners(2)).toEqual(['Filipe', 'Gil']);
  });

  it('noite 3: Duarte aparece como apanhado; o Gil e o Filipe sabem que foram bombardeados; ninguém ganha bónus', () => {
    expect(results[2].summary.caught).toEqual(['Duarte']);
    expect(privateOf(3, 'Helena')).toEqual([['DEFENSE', 10, 'Duarte']]);
    expect(privateOf(3, 'Gil')).toEqual([['BOMBED', -10, null]]);
    expect(privateOf(3, 'Filipe')).toEqual([['BOMBED', -10, null]]);
    expect(bonusWinners(3)).toEqual([]);
  });

  it('noite 4: Ana e Eva aparecem como apanhadas; o Duarte sabe que apanhou as duas; ninguém ganha bónus', () => {
    expect(results[3].summary.caught).toEqual(['Ana', 'Eva']);
    expect(privateOf(4, 'Duarte')).toEqual([
      ['DEFENSE', 10, 'Ana'],
      ['DEFENSE', 10, 'Eva'],
    ]);
    expect(bonusWinners(4)).toEqual([]);
  });

  it('totais após 4 noites', () => {
    const totals = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
    for (const r of results) for (const e of r.ledger) totals[e.playerId] += e.delta;
    expect(totals).toEqual({ Ana: 25, Bruno: -4, Carla: -19, Duarte: 20, Eva: 10, Filipe: -13, Gil: -28, Helena: 8 });
  });

  it('pontos após 4 noites (50 de salário + movimentos)', () => {
    const points = Object.fromEntries(
      finalRanking(PLAYERS, results.flatMap((r) => r.ledger), 1).map((r) => [r.playerId, r.points]),
    );
    expect(points).toEqual({ Ana: 75, Bruno: 46, Carla: 31, Duarte: 70, Eva: 60, Filipe: 37, Gil: 22, Helena: 58 });
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

    it('Gil tenta atacar Filipe → rejeitado (atacou o Filipe na noite 4)', () => {
      expect(validateAction(afterNight4, ataca('Gil', 'Filipe'))).toEqual({ ok: false, error: 'SAME_TARGET' });
    });

    it('Bruno tenta atacar Filipe → rejeitado (o Despedimento da noite 4 foi no Filipe e conta como ataque)', () => {
      expect(validateAction(afterNight4, ataca('Bruno', 'Filipe'))).toEqual({ ok: false, error: 'SAME_TARGET' });
    });

    it('Gil tenta atacar Ana → aceite (só usou 1 ataque e a Ana não foi o seu alvo na noite 4)', () => {
      expect(validateAction(afterNight4, ataca('Gil', 'Ana'))).toEqual({ ok: true });
    });

    it('Ana tenta Desaparecer → aceite (ainda não usou nenhum dos 2)', () => {
      expect(validateAction(afterNight4, desaparece('Ana'))).toEqual({ ok: true });
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

  it('Bruno -10 pela bomba, Ana +5, Duarte +5; Carla 0 na casa do Bruno (a bomba leva tudo)', () => {
    expect(of('Ana').map((e) => [e.reason, e.delta])).toEqual([['BOMB_SUCCESS', 5]]);
    expect(of('Duarte').map((e) => [e.reason, e.delta])).toEqual([['BOMB_SUCCESS', 5]]);
    expect(of('Bruno').filter((e) => e.reason === 'BOMBED').map((e) => e.delta)).toEqual([-10]);
    expect(of('Carla').filter((e) => e.targetId === 'Bruno').map((e) => [e.reason, e.delta])).toEqual([
      ['ATTACK_AWAY_BOMBED', 0],
    ]);
  });

  it('Bruno +5 / Carla -5: assalto à casa vazia da Carla, onde não havia bomba', () => {
    expect(of('Bruno').filter((e) => e.targetId === 'Carla').map((e) => [e.reason, e.delta])).toEqual([
      ['ATTACK_BURGLARY', 5],
    ]);
    expect(of('Carla').filter((e) => e.reason === 'BURGLARY_VICTIM').map((e) => e.delta)).toEqual([-5]);
  });

  it('no total da noite: Bruno -5, Ana +5, Duarte +5, Carla -5', () => {
    const totals = Object.fromEntries(['Ana', 'Bruno', 'Carla', 'Duarte'].map((p) => [p, 0]));
    for (const e of r.ledger) totals[e.playerId] += e.delta;
    expect(totals).toEqual({ Ana: 5, Bruno: -5, Carla: -5, Duarte: 5 });
  });

  it('ninguém ganha bónus: ninguém ficou em casa', () => {
    expect(r.ledger.filter((e) => e.reason === 'HOME_BONUS')).toEqual([]);
    expect(r.summary.players.every((s) => s.location === 'AWAY')).toBe(true);
  });
});

describe('CENARIOS.md, cenário extra D: assalto em grupo', () => {
  const players = ['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva'];
  const r = resolveNight(
    { players, night: 1, pastActions: [] },
    [ataca('Ana', 'Eva'), ataca('Bruno', 'Eva'), ataca('Carla', 'Eva'), folga('Duarte'), ataca('Eva', 'Duarte')],
    1,
  );

  it('Eva -5 pelo assalto; Ana, Bruno e Carla +1 cada (5 ÷ 3, os 2 de resto perdem-se)', () => {
    for (const p of ['Ana', 'Bruno', 'Carla']) {
      expect(r.ledger.filter((e) => e.playerId === p)).toEqual([
        { playerId: p, delta: 1, reason: 'ATTACK_BURGLARY', targetId: 'Eva' },
      ]);
    }
    expect(r.ledger.filter((e) => e.playerId === 'Eva' && e.reason === 'BURGLARY_VICTIM').map((e) => e.delta)).toEqual([-5]);
    expect(r.summary.players.find((s) => s.playerId === 'Eva')).toEqual({ playerId: 'Eva', location: 'AWAY' });
  });

  it('Eva +10, Duarte -10; no total, Eva +5; ninguém ganha bónus', () => {
    const totals = Object.fromEntries(players.map((p) => [p, 0]));
    for (const e of r.ledger) totals[e.playerId] += e.delta;
    expect(totals).toEqual({ Ana: 1, Bruno: 1, Carla: 1, Duarte: -10, Eva: 5 });
    expect(r.ledger.filter((e) => e.reason === 'HOME_BONUS')).toEqual([]);
  });

  it('cada assalto que rendeu pontos conta como 1 acerto contra a Eva (desempate)', () => {
    const ranking = finalRanking(players, r.ledger, 1);
    for (const p of ['Ana', 'Bruno', 'Carla']) {
      expect(ranking.find((x) => x.playerId === p)!.successfulAttacks).toBe(1);
    }
  });
});

describe('CENARIOS.md, cenário extra E: Desaparecer', () => {
  const players = ['Ana', 'Bruno', 'Carla', 'Duarte'];
  const r = resolveNight(
    { players, night: 1, pastActions: [] },
    [desaparece('Ana'), ataca('Bruno', 'Ana'), ataca('Carla', 'Duarte'), folga('Duarte')],
    1,
  );
  const totals = Object.fromEntries(players.map((p) => [p, 0]));
  for (const e of r.ledger) totals[e.playerId] += e.delta;

  it('Ana -5 e Bruno +5 (assalto à casa vazia); Carla +10 e Duarte -10; ninguém ganha bónus', () => {
    expect(totals).toEqual({ Ana: -5, Bruno: 5, Carla: 10, Duarte: -10 });
    expect(r.ledger.filter((e) => e.playerId === 'Ana').map((e) => e.reason)).toEqual(['BURGLARY_VICTIM']);
    expect(r.ledger.filter((e) => e.reason === 'HOME_BONUS')).toEqual([]);
  });

  it('público: Ana, Bruno e Carla fora; Duarte em casa; ninguém apanhado', () => {
    expect(r.summary).toEqual({
      players: [
        { playerId: 'Ana', location: 'AWAY' },
        { playerId: 'Bruno', location: 'AWAY' },
        { playerId: 'Carla', location: 'AWAY' },
        { playerId: 'Duarte', location: 'HOME' },
      ],
      caught: [],
    });
  });
});

describe('CENARIOS.md, cenário extra F: validação de Desaparecer e do alvo repetido', () => {
  const players = ['Ana', 'Bruno', 'Carla'];
  const at = (night: number, past: Action[]): GameState => ({
    players,
    night,
    pastActions: past.map((a, i) => ({ ...a, night: i + 1 })),
  });

  it('Desaparecer com alvo → rejeitado', () => {
    expect(validateAction(at(1, []), { playerId: 'Ana', type: 'VANISH', targetId: 'Bruno' })).toEqual({
      ok: false,
      error: 'UNEXPECTED_TARGET',
    });
  });

  it('terceiro Desaparecer no mesmo ciclo → rejeitado (quota de 2)', () => {
    expect(validateAction(at(3, [desaparece('Ana'), desaparece('Ana')]), desaparece('Ana'))).toEqual({
      ok: false,
      error: 'QUOTA_EXHAUSTED',
    });
  });

  it('atacar na noite 2 o alvo da noite 1 → rejeitado; na noite 3, depois de Desaparecer na 2 → aceite', () => {
    expect(validateAction(at(2, [ataca('Ana', 'Bruno')]), ataca('Ana', 'Bruno'))).toEqual({ ok: false, error: 'SAME_TARGET' });
    expect(validateAction(at(3, [ataca('Ana', 'Bruno'), desaparece('Ana')]), ataca('Ana', 'Bruno'))).toEqual({ ok: true });
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

  it('C3. um Despedimento que rendeu pontos no Bruno conta como 1 acerto contra o Bruno, para cada bombista', () => {
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
