import { describe, expect, it } from 'vitest';
import { InvalidActionError, resolveNight } from './resolveNight.ts';
import type { Action, GameState, LedgerEntry, PlayerId } from './types.ts';

const PLAYERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const state: GameState = { players: PLAYERS, night: 1, pastActions: [] };

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
/** Como `entriesOf`, mas sem depender da ordem do ledger. */
const sortedEntriesOf = (ledger: LedgerEntry[], p: PlayerId) =>
  entriesOf(ledger, p).sort((x, y) => y.delta - x.delta);

function run(actions: Action[], seed = 1, night = 1) {
  const result = resolveNight({ ...state, night }, actions, seed);
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
  it('assalto à casa vazia com 1 atacante: atacante +5, alvo -5', () => {
    const r = run([attack('A', 'B'), attack('B', 'C')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 5, reason: 'ATTACK_BURGLARY' }]);
    expect(r.ledger.find((e) => e.playerId === 'A')!.targetId).toBe('B');
    // B perde 5 pelo assalto; o ataque dele a C conta normalmente.
    expect(sortedEntriesOf(r.ledger, 'B')).toEqual([
      { delta: 10, reason: 'ATTACK_SUCCESS' },
      { delta: -5, reason: 'BURGLARY_VICTIM' },
    ]);
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', attacks: 1, bombs: 0, draw: false, defended: false });
  });

  it('assalto com 2 atacantes: 5/2 arredonda para baixo (2 cada), sem sorteio nem perdedores', () => {
    const r = run([attack('A', 'B'), attack('C', 'B'), bomb('B', 'D')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 2, reason: 'ATTACK_BURGLARY' }]);
    expect(entriesOf(r.ledger, 'C')).toEqual([{ delta: 2, reason: 'ATTACK_BURGLARY' }]);
    expect(entriesOf(r.ledger, 'B')).toContainEqual({ delta: -5, reason: 'BURGLARY_VICTIM' });
    expect(r.summaryOf('B')).toMatchObject({ attacks: 2, draw: false });
  });

  it('assalto com 6 atacantes: 5/6 arredonda para 0, o alvo perde 5 na mesma', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const others = players.filter((p) => p !== 'B');
    const r = resolveNight({ players, night: 1, pastActions: [] }, [...others.map((p) => attack(p, 'B')), attack('B', 'A')], 1);
    for (const p of others.slice(1)) expect(r.ledger.filter((e) => e.playerId === p).map((e) => e.delta)).toEqual([0]);
    expect(r.ledger.filter((e) => e.playerId === 'B' && e.reason === 'BURGLARY_VICTIM').map((e) => e.delta)).toEqual([-5]);
  });

  it('bomba sozinha a quem está fora acerta na mesma: alvo -10, bombista +10', () => {
    const r = run([bomb('A', 'B'), attack('B', 'C')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 10, reason: 'BOMB_SUCCESS' }]);
    // B perde 10 pela bomba e ganha 10 pelo ataque dele a C, que ficou em casa.
    expect(sortedEntriesOf(r.ledger, 'B')).toEqual([
      { delta: 10, reason: 'ATTACK_SUCCESS' },
      { delta: -10, reason: 'VICTIM' },
    ]);
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', bombs: 1, draw: false, defended: false });
  });

  it('bomba + ataques a quem está fora: a bomba leva tudo, os ataques ficam a 0 (não "morrem") e o bolo é só 10', () => {
    const r = run([bomb('B', 'H'), attack('A', 'B'), attack('C', 'B'), bomb('D', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: 0, reason: 'ATTACK_AWAY_BOMBED' }]);
    expect(entriesOf(r.ledger, 'C')).toEqual([{ delta: 0, reason: 'ATTACK_AWAY_BOMBED' }]);
    expect(entriesOf(r.ledger, 'D')).toEqual([{ delta: 10, reason: 'BOMB_SUCCESS' }]);
    // B: +10 pela bomba em H (em casa), -10 pela bomba de D, e não perde os 5 do assalto.
    expect(r.totals.B).toBe(0);
    expect(entriesOf(r.ledger, 'B').map((e) => e.reason)).not.toContain('BURGLARY_VICTIM');
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', attacks: 2, bombs: 1, draw: false, defended: false });
  });

  it('2 bombas a quem está fora: 5 para cada bombista', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), attack('B', 'D'), attack('E', 'B')]);
    expect(r.totals).toMatchObject({ A: 5, C: 5, E: 0 });
    expect(entriesOf(r.ledger, 'B')).toContainEqual({ delta: -10, reason: 'VICTIM' });
  });

  it('3 bombas a quem está fora: 10/3 arredonda para baixo (3 cada)', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), bomb('D', 'B'), attack('B', 'E')]);
    expect(r.totals).toMatchObject({ A: 3, C: 3, D: 3, B: 0 });
  });

  it('ataques cruzados (A→B, B→A): cada um assalta a casa vazia do outro, +5 e -5', () => {
    const r = run([attack('A', 'B'), attack('B', 'A')]);
    expect(sortedEntriesOf(r.ledger, 'A')).toEqual([
      { delta: 5, reason: 'ATTACK_BURGLARY' },
      { delta: -5, reason: 'BURGLARY_VICTIM' },
    ]);
    expect(r.totals.A).toBe(0);
    expect(r.totals.B).toBe(0);
    expect(r.summaryOf('A')).toMatchObject({ location: 'AWAY', attacks: 1 });
    expect(r.summaryOf('B')).toMatchObject({ location: 'AWAY', attacks: 1 });
  });

  it('bombas cruzadas (A→B, B→A): as duas acertam, cada um +10 e -10', () => {
    const r = run([bomb('A', 'B'), bomb('B', 'A')]);
    expect(sortedEntriesOf(r.ledger, 'A')).toEqual([
      { delta: 10, reason: 'BOMB_SUCCESS' },
      { delta: -10, reason: 'VICTIM' },
    ]);
    expect(r.totals.A).toBe(0);
    expect(r.totals.B).toBe(0);
  });
});

describe('caso 2: alvo defende-se', () => {
  it('contra 1 atacante: atacante -5, defensor +10, atacante revelado', () => {
    const r = run([defend('B'), attack('A', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: -5, reason: 'ATTACK_DEFENDED' }]);
    expect(entriesOf(r.ledger, 'B')).toEqual([{ delta: 10, reason: 'DEFENSE' }]);
    expect(r.summaryOf('B')).toMatchObject({ location: 'HOME', defended: true, revealedAttackers: ['A'], homeBonus: false });
  });

  it('contra N=3 atacantes: cada um -5, defensor +30, sem sorteio', () => {
    const r = run([defend('B'), attack('A', 'B'), attack('C', 'B'), attack('D', 'B')]);
    expect([r.totals.A, r.totals.C, r.totals.D]).toEqual([-5, -5, -5]);
    expect(r.totals.B).toBe(30);
    expect(r.summaryOf('B')).toMatchObject({ draw: false, revealedAttackers: ['A', 'C', 'D'] });
  });

  it('contra B=1 bomba: bombista -10, defensor +10', () => {
    const r = run([defend('B'), bomb('A', 'B')]);
    expect(entriesOf(r.ledger, 'A')).toEqual([{ delta: -10, reason: 'BOMB_DEFENDED' }]);
    expect(r.totals.B).toBe(10);
    expect(r.summaryOf('B')).toMatchObject({ defended: true, bombs: 1, revealedAttackers: ['A'] });
  });

  it('contra B=2 bombas: cada bombista -10, defensor +20', () => {
    const r = run([defend('B'), bomb('A', 'B'), bomb('C', 'B')]);
    expect([r.totals.A, r.totals.C]).toEqual([-10, -10]);
    expect(r.totals.B).toBe(20);
  });

  it('contra N=2 e B=1: atacantes -5, bombista -10, defensor +30, todos revelados', () => {
    const r = run([defend('E'), bomb('A', 'E'), attack('H', 'E'), attack('C', 'E')]);
    expect(r.totals).toMatchObject({ A: -10, C: -5, H: -5, E: 30 });
    expect(r.summaryOf('E')).toMatchObject({ attacks: 2, bombs: 1, defended: true, revealedAttackers: ['A', 'C', 'H'] });
  });

  it('atacante travado pela defesa e assaltado enquanto está fora: perde os 5 da defesa e os 5 do assalto', () => {
    const r = run([defend('B'), attack('A', 'B'), attack('C', 'A')]);
    expect(r.totals.A).toBe(-10);
    expect(r.totals.C).toBe(5);
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
    // B defende-se de E. F assalta A (fora). G e H ficam em casa.
    const r = run([bomb('A', 'C'), attack('D', 'C'), defend('B'), attack('E', 'B'), attack('F', 'A')]);
    expect(r.totals).toEqual({ A: 15, B: 10, C: -10, D: -10, E: -5, F: 5, G: 2, H: 2 });
    expect(r.summary.players.map((s) => s.location)).toEqual(['AWAY', 'HOME', 'HOME', 'AWAY', 'AWAY', 'AWAY', 'HOME', 'HOME']);
  });

  it('o resumo segue a ordem de state.players', () => {
    const r = resolveNight({ players: ['Z', 'M', 'A'], night: 1, pastActions: [] }, [], 1);
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

describe('alvo no ledger', () => {
  it('cada movimento de quem atacou guarda o alvo; os do alvo não revelam o atacante', () => {
    const r = run([bomb('A', 'C'), attack('D', 'C'), defend('B'), attack('E', 'B'), attack('F', 'G'), attack('H', 'G')]);
    for (const e of r.ledger) {
      if (e.reason.startsWith('ATTACK_') || e.reason.startsWith('BOMB_')) {
        const a = [bomb('A', 'C'), attack('D', 'C'), attack('E', 'B'), attack('F', 'G'), attack('H', 'G')].find(
          (x) => x.playerId === e.playerId,
        )!;
        expect(e.targetId).toBe(a.targetId);
      } else {
        expect(e).not.toHaveProperty('targetId');
      }
    }
  });
});

describe('noite 9 a dobrar', () => {
  it('cada movimento conta a dobrar, incluindo o bónus de casa', () => {
    const actions = [bomb('A', 'C'), attack('D', 'C'), defend('B'), attack('E', 'B'), attack('F', 'A')];
    const normal = run(actions, 1, 8);
    const double = run(actions, 1, 9);
    expect(double.ledger).toEqual(normal.ledger.map((e) => ({ ...e, delta: e.delta * 2 })));
    expect(double.totals).toEqual({ A: 30, B: 20, C: -20, D: -20, E: -10, F: 10, G: 4, H: 4 });
    expect(double.summary).toEqual(normal.summary);
  });

  it('arredonda-se primeiro e só depois se multiplica: 3 bombas + N=1 dá 6 × 2 = 12', () => {
    const r = run([bomb('A', 'B'), bomb('C', 'B'), bomb('D', 'B'), attack('E', 'B')], 1, 9);
    expect(r.totals).toMatchObject({ A: 12, C: 12, D: 12, E: -20, B: -20 });
  });

  it('assalto na noite 9: arredonda primeiro, 5/2 = 2 × 2 = 4 para cada, alvo -10', () => {
    const r = run([attack('A', 'B'), attack('C', 'B'), bomb('B', 'D')], 1, 9);
    expect(r.totals).toMatchObject({ A: 4, C: 4 });
    expect(entriesOf(r.ledger, 'B')).toContainEqual({ delta: -10, reason: 'BURGLARY_VICTIM' });
  });

  it('o sorteio da noite 9 é o mesmo que noutra noite com a mesma seed', () => {
    const actions = [attack('A', 'B'), attack('C', 'B'), attack('D', 'B')];
    const winner = (night: number) => run(actions, 7, night).ledger.find((e) => e.reason === 'ATTACK_SUCCESS')!;
    expect(winner(9)).toEqual({ ...winner(1), delta: 20 });
  });

  it('noite fora de 1 a 9 lança erro', () => {
    for (const night of [0, 10, 1.5, NaN]) expect(() => run([], 1, night)).toThrow(RangeError);
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
    const s: GameState = { players: PLAYERS, night: 2, pastActions: [bomb('A', 'C')] };
    expect(() => resolveNight(s, [bomb('A', 'B')], 1)).toThrow(/QUOTA_EXHAUSTED/);
  });

  it('o erro diz qual o jogador e o código, para a resolve-night registar', () => {
    const err = (() => {
      try {
        run([stay('C'), attack('D', 'D')]);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(InvalidActionError);
    expect(err).toMatchObject({ playerId: 'D', code: 'SELF_TARGET' });
  });
});
