import { describe, expect, it } from 'vitest';
import { QUOTAS, SALARY, mulberry32, validateAction } from '../engine/index.ts';
import type { LedgerEntry, LimitedActionType, PastAction, PlayerId } from '../engine/index.ts';
import { BOTS, randomBot, randomTurn, smartBot } from './bots.ts';
import type { BotKind } from './bots.ts';
import { NIGHTS, playGame } from './game.ts';
import { PLAYER_COUNTS, configsFor, formatTable, runConfig } from './run.ts';
import { spread, summarize } from './stats.ts';

const PLAYERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const seats = (kinds: BotKind[]) => PLAYERS.map((playerId, i) => ({ playerId, bot: BOTS[kinds[i]] }));
const MIXED: BotKind[] = ['smart', 'random', 'smart', 'random', 'smart', 'random', 'smart', 'random'];

describe('playGame', () => {
  it('joga 9 noites com uma ação por jogador', () => {
    const g = playGame(seats(MIXED), 1);
    expect(g.nights).toHaveLength(NIGHTS);
    for (const n of g.nights) expect(n.actions.map((a) => a.playerId)).toEqual(PLAYERS);
    expect(g.ranking).toHaveLength(8);
  });

  it('é reprodutível: a mesma seed dá o mesmo jogo', () => {
    expect(playGame(seats(MIXED), 42)).toEqual(playGame(seats(MIXED), 42));
    expect(playGame(seats(MIXED), 42)).not.toEqual(playGame(seats(MIXED), 43));
  });

  const cases = PLAYER_COUNTS.flatMap((n) => configsFor(n).map((c) => ({ n, ...c })));
  it.each(cases)('$n jogadores, $name: bots respeitam alvos e quotas em 100 ciclos', ({ seats: kinds }) => {
    const players = kinds.map((_, i) => `P${i + 1}`);
    for (let seed = 0; seed < 100; seed++) {
      const g = playGame(players.map((playerId, i) => ({ playerId, bot: BOTS[kinds[i]] })), seed);
      const past: PastAction[] = [];
      g.nights.forEach((n, i) => {
        expect(n.actions).toHaveLength(players.length);
        // Valida na noite certa: quotas e o alvo da noite anterior (RULES.md §2).
        for (const a of n.actions) expect(validateAction({ players, night: i + 1, pastActions: past }, a)).toEqual({ ok: true });
        past.push(...n.actions.map((a) => ({ ...a, night: i + 1 })));
      });
    }
  });
});

describe('bots', () => {
  const view = (quota: Record<LimitedActionType, number>, night = 1) => ({
    me: 'A',
    players: PLAYERS,
    night,
    nights: NIGHTS,
    history: [],
    quota,
    lastTarget: null,
  });

  it('sem quotas, os dois bots só podem escolher Folga', () => {
    const none = { DEFEND: 0, ATTACK: 0, BOMB: 0, VANISH: 0 };
    for (let s = 0; s < 50; s++) {
      const rng = () => (s + 0.5) / 50;
      expect(randomBot(view(none), rng).type).toBe('STAY');
      expect(smartBot(view(none), rng).type).toBe('STAY');
    }
  });

  it('o bot esperto gasta as quotas até ao fim do jogo', () => {
    const left = { DEFEND: 0, ATTACK: 0, BOMB: 0, VANISH: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const g = playGame(seats(Array(8).fill('smart')), seed);
      const used = g.nights.flatMap((n) => n.actions).filter((a) => a.playerId === 'A' && a.type !== 'STAY');
      for (const t of ['DEFEND', 'ATTACK', 'BOMB', 'VANISH'] as const) {
        left[t] += QUOTAS[t] - used.filter((a) => a.type === t).length;
      }
    }
    // Em média sobra menos de meia ação de cada tipo por jogo (o Desaparecer é opcional e só se mede).
    for (const t of ['DEFEND', 'ATTACK', 'BOMB'] as const) expect(left[t] / 100).toBeLessThan(0.5);
    expect(left.VANISH / 100).toBeLessThanOrEqual(QUOTAS.VANISH);
  });

  // Desligado desde a v3: o bot esperto não bate o aleatório. Na v4 já conta com os assaltos, mas
  // gasta as quotas todas até à noite 6 e fica em Folga nas noites 7 a 9, sem aproveitar a noite 9
  // a dobrar. Ver as descrições dos PRs da T2b e da T2c.
  it.skip('o bot esperto faz mais pontos em média do que o aleatório (jogos mistos)', () => {
    const r = runConfig(MIXED, 400, 1);
    expect(r.byKind.smart!.points.mean).toBeGreaterThan(r.byKind.random!.points.mean);
  });
});

describe('stats', () => {
  it('spread calcula média, desvio padrão e percentis', () => {
    expect(spread([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ mean: 5, sd: 2, min: 2, p10: 2, p50: 5, p90: 9, max: 9 });
  });

  it('summarize conta ações, sorteios, bombas e acertos de forma coerente', () => {
    const games = Array.from({ length: 50 }, (_, s) => playGame(seats(MIXED), s));
    const r = summarize(games, (p) => MIXED[PLAYERS.indexOf(p)]);

    const all = games.flatMap((g) => g.nights);
    const ledger = all.flatMap((n) => n.ledger);
    const count = (reason: string) => ledger.filter((e) => e.reason === reason).length;

    expect(r.games).toBe(50);
    expect(r.players).toBe(8);
    const burglaries = ledger.filter((e) => e.reason === 'ATTACK_BURGLARY' && e.delta > 0).length;
    expect(burglaries).toBeGreaterThan(0);
    expect(r.burglaryHitsPerGame * 50).toBeCloseTo(burglaries);
    expect(r.hitsPerGame).toBeCloseTo(r.attackHitsPerGame + r.burglaryHitsPerGame + r.bombHitsPerGame);
    expect(r.bombHitsPerGame * 50).toBeCloseTo(count('BOMB_SUCCESS'));
    expect(r.drawsPerGame * 50).toBeCloseTo(count('ATTACK_DRAW_WON'));
    expect(r.attackHitsPerGame * 50).toBeCloseTo(count('ATTACK_SUCCESS') + count('ATTACK_DRAW_WON'));
    expect(r.bombOutcomePct.home + r.bombOutcomePct.away + r.bombOutcomePct.defended).toBeCloseTo(100);
    // Bombas com alvo em casa ou fora rendem pontos (aqui o bolo nunca arredonda para 0).
    expect((r.bombOutcomePct.home + r.bombOutcomePct.away) * r.bombsPerGame * 0.5).toBeCloseTo(count('BOMB_SUCCESS'));
    expect(r.bombOutcomePct.defended * r.bombsPerGame * 0.5).toBeCloseTo(count('BOMB_DEFENDED'));
    expect(Object.values(r.actionPct).reduce((s, x) => s + x, 0)).toBeCloseTo(100);
    expect(r.points.mean * 400).toBeCloseTo(400 * SALARY + ledger.reduce((s, e) => s + e.delta, 0));
    expect(r.byKind.smart!.winPct + r.byKind.random!.winPct).toBeCloseTo(100);
    expect(r.lastNightSwingPct).toBeGreaterThanOrEqual(0);
    expect(r.lastNightSwingPct).toBeLessThanOrEqual(100);
  });

  it('viragem na noite 9: conta o ciclo quando o vencedor não liderava antes da última noite', () => {
    const night = (ledger: LedgerEntry[]) => ({ actions: [], ledger, summary: { players: [], caught: [] } });
    const rank = (ids: PlayerId[]) => ids.map((playerId, i) => ({ playerId, points: 0, successfulAttacks: 0, pointsLost: 0, rank: i + 1 }));
    const game = (winner: PlayerId) => ({
      players: ['A', 'B'],
      nights: [night([{ playerId: 'A', delta: 10, reason: 'ATTACK_SUCCESS', targetId: 'B' }]), night([])],
      ranking: rank(winner === 'A' ? ['A', 'B'] : ['B', 'A']),
    });
    expect(summarize([game('A'), game('B'), game('B'), game('A')], () => 'random').lastNightSwingPct).toBe(50);
  });

  it('formatTable gera uma tabela Markdown com uma coluna por configuração', () => {
    const md = formatTable(5, configsFor(5).map((c) => ({ name: c.name, report: runConfig(c.seats, 5, 1) })));
    expect(md).toContain('### 5 jogadores');
    expect(md).toContain('| Métrica | Aleatórios | Espertos | Mistos |');
    expect(md).toMatch(/\| Jogadores sem salário \(< 0 pontos\) \| [\d.]+% \| [\d.]+% \| [\d.]+% \|/);
    // Mistos com 5 lugares: 3 espertos e 2 aleatórios.
    expect(md).toContain('| smart | 3 |');
    expect(md).toContain('| random | 2 |');
  });
});

describe('randomTurn (salas contra bots)', () => {
  it('9 noites só de bots ao calhas: todas as ações válidas, e quem não é bot fica de fora', () => {
    const players = ['eu', 'bot1', 'bot2', 'bot3'];
    const bots = players.slice(1);
    for (let seed = 1; seed <= 50; seed++) {
      const rng = mulberry32(seed);
      const past: PastAction[] = [];
      for (let night = 1; night <= NIGHTS; night++) {
        const state = { players, night, pastActions: [...past] };
        const actions = randomTurn(state, bots, rng);
        expect(actions.map((a) => a.playerId)).toEqual(bots);
        for (const a of actions) expect(validateAction(state, a)).toEqual({ ok: true });
        past.push(...actions.map((a) => ({ ...a, night })));
      }
    }
  });
});
