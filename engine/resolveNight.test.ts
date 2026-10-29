import { describe, expect, it } from 'vitest';
import { resolveNight } from './resolveNight.ts';
import type { Action, GameState, LedgerEntry, PlayerId } from './types.ts';

const PLAYERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const state: GameState = { players: PLAYERS, pastActions: [] };

const stay = (p: PlayerId): Action => ({ playerId: p, type: 'STAY' });
const defend = (p: PlayerId): Action => ({ playerId: p, type: 'DEFEND' });
const attack = (p: PlayerId, t: PlayerId): Action => ({ playerId: p, type: 'ATTACK', targetId: t });
const bomb = (p: PlayerId, t: PlayerId): Action => ({ playerId: p, type: 'BOMB', targetId: t });

/** Soma do ledger por jogador (todos os jogadores presentes, 0 por defeito). */
function totals(ledger: LedgerEntry[]): Record<PlayerId, number> {
  const t = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  for (const e of ledger) t[e.playerId] += e.delta;
  return t;
}

const entriesOf = (ledger: LedgerEntry[], p: PlayerId) =>
  ledger.filter((e) => e.playerId === p).map(({ delta, reason }) => ({ delta, reason }));

function run(actions: Action[], seed = 1) {
  const result = resolveNight(state, actions, seed);
  const byPlayer = Object.fromEntries(result.summary.players.map((s) => [s.playerId, s]));
  return { ...result, totals: totals(result.ledger), summaryOf: (p: PlayerId) => byPlayer[p] };
}

describe('STAY por defeito', () => {
  it('sem ações, todos ficam em casa e ganham o bónus', () => {
    const r = run([]);
    for (const p of PLAYERS) {
      expect(r.totals[p]).toBe(2);
      expect(r.summaryOf(p)).toMatchObject({ location: 'HOME', homeBonus: true, attacks: 0, bombs: 0 });
    }
  });

  it('quem não escolhe é tratado como STAY (pode ser atacado e ganhar bónus)', () => {
    const r = run([attack('A', 'B')]);
    expect(r.totals.B).toBe(-10);
    expect(r.summaryOf('B').location).toBe('HOME');
    expect(r.totals.C).toBe(2);
  });

  it('STAY explícito é igual a não escolher', () => {
    expect(resolveNight(state, [stay('C'), attack('A', 'B')], 1)).toEqual(resolveNight(state, [attack('A', 'B')], 1));
  });
});

describe('bónus de casa', () => {
  it('STAY e DEFEND não atacados ganham +2', () => {
    const r = run([stay('A'), defend('B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 2, reason: 'HOME_BONUS' }]);
    expect(entriesOf(r.ledger, 'B')).toEqual([{ delta: 2, reason: 'HOME_BONUS' }]);
  });

  it('quem está fora não ganha bónus, mesmo sem ser atacado', () => {
    const r = run([attack('A', 'C'), bomb('B', 'D')]);
    expect(r.ledger.some((e) => e.reason === 'HOME_BONUS' && (e.playerId === 'A' || e.playerId === 'B'))).toBe(false);
    expect(r.summaryOf('A')).toMatchObject({ location: 'AWAY', homeBonus: false });
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', homeBonus: false });
  });

  it('quem foi alvo não ganha bónus (STAY nem DEFEND)', () => {
    const r = run([attack('A', 'B'), defend('C'), attack('D', 'C')]);
    expect(r.summaryOf('B').homeBonus).toBe(false);
    expect(r.summaryOf('C').homeBonus).toBe(false);
    expect(r.ledger.filter((e) => e.reason === 'HOME_BONUS').map((e) => e.playerId)).toEqual(['E', 'F', 'G', 'H']);
  });
});

describe('caso 1: alvo fora', () => {
  it('um ataque a quem está fora falha sem pontos para ninguém', () => {
    const r = run([attack('A', 'B'), attack('B', 'C')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 0, reason: 'ATTACK_TARGET_AWAY' }]);
    expect(r.totals.A).toBe(0);
    // B não perde nada por ter sido atacado; o ataque dele a C conta normalmente.
    expect(entriesOf(r.ledger, 'B')).toEqual([{ delta: 10, reason: 'ATTACK_SUCCESS' }]);
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', attacks: 1, bombs: 0, draw: false });
  });

  it('vários ataques e bombas a quem está fora: ninguém ganha nem perde, sem sorteio', () => {
    const r = run([bomb('B', 'H'), attack('A', 'B'), attack('C', 'B'), bomb('D', 'B')]);
    expect(r.totals.A).toBe(0);
    expect(r.totals.C).toBe(0);
    expect(r.totals.D).toBe(0);
    expect(entriesOf(r.ledger, 'D')).toEqual([{ delta: 0, reason: 'BOMB_TARGET_AWAY' }]);
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', attacks: 2, bombs: 1, draw: false, defended: false });
  });

  it('ataques cruzados (A→B, B→A): os dois estão fora e ambos falham', () => {
    const r = run([attack('A', 'B'), attack('B', 'A')]);
    expect(r.totals.A).toBe(0);
    expect(r.totals.B).toBe(0);
    expect(r.summaryOf('A')).toMatchObject({ location: 'AWAY', attacks: 1 });
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', attacks: 1 });
  });

  it('bombas cruzadas (A→B, B→A) também falham', () => {
    const r = run([bomb('A', 'B'), bomb('B', 'A')]);
    expect(r.totals.A).toBe(0);
    expect(r.totals.B).toBe(0);
  });
});

describe('caso 2: alvo defende-se', () => {
  it('contra 1 atacante: atacante -10, defensor +10, atacante revelado', () => {
    const r = run([defend('B'), attack('A', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: -10, reason: 'ATTACK_DEFENDED' }]);
    expect(entriesOf(r.ledger, 'B')).toEqual([{ delta: 10, reason: 'DEFENSE' }]);
    expect(r.summaryOf('B')).toMatchObject({ location: 'HOME', defended: true, revealedAttackers: ['A'], homeBonus: false });
  });

  it('contra N=3 atacantes: cada um -10, defensor +30, sem sorteio', () => {
    const r = run([defend('B'), attack('A', 'B'), attack('C', 'B'), attack('D', 'B')]);
    expect([r.totals.A, r.totals.C, r.totals.D]).toEqual([-10, -10, -10]);
    expect(r.totals.B).toBe(30);
    expect(r.summaryOf('B')).toMatchObject({ draw: false, revealedAttackers: ['A', 'C', 'D'] });
  });

  it('contra B=1 bomba: bombista -20, defensor +10', () => {
    const r = run([defend('B'), bomb('A', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: -20, reason: 'BOMB_DEFENDED' }]);
    expect(r.totals.B).toBe(10);
    expect(r.summaryOf('B')).toMatchObject({ defended: true, bombs: 1, revealedAttackers: ['A'] });
  });

  it('contra B=2 bombas: cada bombista -20, defensor +20', () => {
    const r = run([defend('B'), bomb('A', 'B'), bomb('C', 'B')]);
    expect([r.totals.A, r.totals.C]).toEqual([-20, -20]);
    expect(r.totals.B).toBe(20);
  });

  it('contra N=2 e B=1: atacantes -10, bombista -20, defensor +30, todos revelados', () => {
    const r = run([defend('E'), bomb('A', 'E'), attack('H', 'E'), attack('C', 'E')]);
    expect(r.totals).toMatchObject({ A: -20, C: -10, H: -10, E: 30 });
    expect(r.summaryOf('E')).toMatchObject({ attacks: 2, bombs: 1, defended: true, revealedAttackers: ['A', 'C', 'H'] });
  });

  it('atacante travado pela defesa e atacado enquanto está fora: só perde os 10 da defesa', () => {
    const r = run([defend('B'), attack('A', 'B'), attack('C', 'A')]);
    expect(r.totals.A).toBe(-10);
    expect(r.totals.C).toBe(0);
  });
});

describe('caso 3: em casa sem defesa, sem bombas', () => {
  it('1 atacante: atacante +10, alvo -10', () => {
    const r = run([attack('A', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 10, reason: 'ATTACK_SUCCESS' }]);
    expect(entriesOf(r.ledger, 'B')).toEqual([{ delta: -10, reason: 'VICTIM' }]);
    expect(r.summaryOf('B')).toMatchObject({ attacks: 1, draw: false, defended: false, revealedAttackers: [] });
  });

  it('sorteio com 2 atacantes: um ganha +10, o outro perde -10, alvo -10', () => {
    const r = run([attack('A', 'B'), attack('C', 'B')]);
    const results = [r.totals.A, r.totals.C].sort((x, y) => x - y);
    expect(results).toEqual([-10, 10]);
    expect(r.totals.B).toBe(-10);
    // Sorteio anónimo: só os números.
    expect(r.summaryOf('B')).toMatchObject({ attacks: 2, draw: true, revealedAttackers: [] });
  });

  it('sorteio com 3 atacantes: 1 vencedor, 2 "morrem"', () => {
    const r = run([attack('A', 'B'), attack('C', 'B'), attack('D', 'B')]);
    expect(r.ledger.filter((e) => e.reason === 'ATTACK_SUCCESS')).toHaveLength(1);
    expect(r.ledger.filter((e) => e.reason === 'ATTACK_LOST_DRAW')).toHaveLength(2);
    expect(r.totals.A + r.totals.C + r.totals.D).toBe(-10);
    expect(r.totals.B).toBe(-10);
    expect(r.summaryOf('B')).toMatchObject({ attacks: 3, draw: true });
  });

  it('sorteio com 3: cada atacante consegue ganhar, com frequências parecidas', () => {
    const wins: Record<string, number> = { A: 0, C: 0, D: 0 };
    const runs = 3000;
    for (let seed = 0; seed < runs; seed++) {
      const r = run([attack('A', 'B'), attack('C', 'B'), attack('D', 'B')], seed);
      const winner = r.ledger.find((e) => e.reason === 'ATTACK_SUCCESS')!.playerId;
      wins[winner]++;
    }
    for (const w of Object.values(wins)) expect(w).toBeGreaterThan(runs / 3 - 150);
  });

  it('sorteio com 2: ambos os resultados acontecem com seeds diferentes', () => {
    const winners = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      winners.add(run([attack('A', 'B'), attack('C', 'B')], seed).ledger.find((e) => e.reason === 'ATTACK_SUCCESS')!.playerId);
    }
    expect(winners).toEqual(new Set(['A', 'C']));
  });

  it('o sorteio é reprodutível: mesma seed, mesmo resultado, qualquer que seja a ordem das ações', () => {
    const actions = [attack('A', 'B'), attack('C', 'B'), attack('D', 'B'), attack('E', 'F'), attack('G', 'F')];
    for (let seed = 0; seed < 20; seed++) {
      const r1 = resolveNight(state, actions, seed);
      expect(resolveNight(state, [...actions].reverse(), seed)).toEqual(r1);
      expect(resolveNight(state, actions, seed)).toEqual(r1);
    }
  });
});

describe('caso 3: em casa sem defesa, com bombas', () => {
  it('bomba sozinha: bombista +10, alvo -10, sem sorteio', () => {
    const r = run([bomb('A', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 10, reason: 'BOMB_SUCCESS' }]);
    expect(entriesOf(r.ledger, 'B')).toEqual([{ delta: -10, reason: 'VICTIM' }]);
    expect(r.summaryOf('B')).toMatchObject({ attacks: 0, bombs: 1, draw: false, revealedAttackers: [] });
  });

  it('1 bomba + N=1: atacante morre (-10), bombista leva o bolo 10+10=20', () => {
    const r = run([bomb('A', 'B'), attack('C', 'B')]);
    expect(r.totals).toMatchObject({ A: 20, B: -10, C: -10 });
    expect(entriesOf(r.ledger, 'C')).toEqual([{ delta: -10, reason: 'ATTACK_BOMBED' }]);
  });

  it('1 bomba + N=3: sem sorteio, atacantes -10 cada, bombista +40, alvo só -10', () => {
    const r = run([bomb('A', 'B'), attack('C', 'B'), attack('D', 'B'), attack('E', 'B')]);
    expect(r.totals).toMatchObject({ A: 40, B: -10, C: -10, D: -10, E: -10 });
    expect(r.summaryOf('B')).toMatchObject({ attacks: 3, bombs: 1, draw: false });
  });

  it('2 bombas sem atacantes: bolo 10 dividido por 2 = 5 cada', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B')]);
    expect(r.totals).toMatchObject({ A: 5, C: 5, B: -10 });
  });

  it('2 bombas + N=1: bolo 20, 10 cada', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), attack('D', 'B')]);
    expect(r.totals).toMatchObject({ A: 10, C: 10, D: -10, B: -10 });
  });

  it('2 bombas + N=2: bolo 30, 15 cada', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), attack('D', 'B'), attack('E', 'B')]);
    expect(r.totals).toMatchObject({ A: 15, C: 15, D: -10, E: -10, B: -10 });
  });

  it('3 bombas sem atacantes: 10/3 arredonda para baixo (3 cada), o resto perde-se', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), bomb('D', 'B')]);
    expect(r.totals).toMatchObject({ A: 3, C: 3, D: 3, B: -10 });
  });

  it('3 bombas + N=1: 20/3 arredonda para baixo (6 cada)', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), bomb('D', 'B'), attack('E', 'B')]);
    expect(r.totals).toMatchObject({ A: 6, C: 6, D: 6, E: -10, B: -10 });
  });

  it('7 bombas num só alvo: 10/7 = 1 cada', () => {
    const others = PLAYERS.filter((p) => p !== 'B');
    const r = run(others.map((p) => bomb(p, 'B')));
    for (const p of others) expect(r.totals[p]).toBe(1);
    expect(r.totals.B).toBe(-10);
  });
});

describe('noite completa', () => {
  it('várias situações em simultâneo', () => {
    // A bomba C (em casa) com D a atacar C também.
    // B defende-se de E. F ataca A (fora). G e H ficam em casa.
    const r = run([bomb('A', 'C'), attack('D', 'C'), defend('B'), attack('E', 'B'), attack('F', 'A')]);
    expect(r.totals).toEqual({ A: 20, B: 10, C: -10, D: -10, E: -10, F: 0, G: 2, H: 2 });
    expect(r.summary.players.map((s) => s.location)).toEqual(['AWAY', 'HOME', 'HOME', 'AWAY', 'AWAY', 'AWAY', 'HOME', 'HOME']);
  });

  it('o resumo segue a ordem de state.players', () => {
    const r = resolveNight({ players: ['Z', 'M', 'A'], pastActions: [] }, [], 1);
    expect(r.summary.players.map((s) => s.playerId)).toEqual(['Z', 'M', 'A']);
  });

  it('o resumo não contém pontos', () => {
    const r = run([bomb('A', 'C'), attack('D', 'C'), defend('B'), attack('E', 'B'), attack('F', 'G'), attack('H', 'G')]);
    for (const s of r.summary.players) {
      expect(Object.keys(s).sort()).toEqual(
        ['attacks', 'bombs', 'defended', 'draw', 'homeBonus', 'location', 'playerId', 'revealedAttackers'],
      );
    }
    expect(Object.keys(r.summary)).toEqual(['players']);
  });
});

describe('ações inválidas', () => {
  it('alvo próprio lança erro', () => {
    expect(() => run([attack('A', 'A')])).toThrow(/SELF_TARGET/);
  });

  it('ação duplicada para o mesmo jogador lança erro', () => {
    expect(() => run([attack('A', 'B'), stay('A')])).toThrow(/duplicada/);
  });

  it('quota esgotada lança erro', () => {
    const s: GameState = { players: PLAYERS, pastActions: [bomb('A', 'C')] };
    expect(() => resolveNight(s, [bomb('A', 'B')], 1)).toThrow(/QUOTA_EXHAUSTED/);
  });
});
