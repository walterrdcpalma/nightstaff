import { describe, expect, it } from 'vitest';
import { QUOTAS, validateAction } from '../engine/index.ts';
import type { Action, LimitedActionType } from '../engine/index.ts';
import { BOTS, randomBot, smartBot } from './bots.ts';
import type { BotKind } from './bots.ts';
import { NIGHTS, playGame } from './game.ts';
import { CONFIGS, formatReport, runConfig } from './run.ts';
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

  it.each(CONFIGS)('bots de "$name" respeitam alvos e quotas em 200 jogos', ({ seats: kinds }) => {
    for (let seed = 0; seed < 200; seed++) {
      const g = playGame(seats(kinds), seed);
      const past: Action[] = [];
      for (const n of g.nights) {
        for (const a of n.actions) expect(validateAction({ players: PLAYERS, pastActions: past }, a)).toEqual({ ok: true });
        past.push(...n.actions);
      }
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
  });

  it('sem quotas, os dois bots só podem escolher Folga', () => {
    const none = { DEFEND: 0, ATTACK: 0, BOMB: 0 };
    for (let s = 0; s < 50; s++) {
      const rng = () => (s + 0.5) / 50;
      expect(randomBot(view(none), rng).type).toBe('STAY');
      expect(smartBot(view(none), rng).type).toBe('STAY');
    }
  });

  it('o bot esperto gasta as quotas até ao fim do jogo', () => {
    const left = { DEFEND: 0, ATTACK: 0, BOMB: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const g = playGame(seats(Array(8).fill('smart')), seed);
      const used = g.nights.flatMap((n) => n.actions).filter((a) => a.playerId === 'A' && a.type !== 'STAY');
      for (const t of ['DEFEND', 'ATTACK', 'BOMB'] as const) {
        left[t] += QUOTAS[t] - used.filter((a) => a.type === t).length;
      }
    }
    // Em média sobra menos de meia ação de cada tipo por jogo.
    for (const t of ['DEFEND', 'ATTACK', 'BOMB'] as const) expect(left[t] / 100).toBeLessThan(0.5);
  });

  it('o bot esperto faz mais pontos em média do que o aleatório (jogos mistos)', () => {
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
    expect(r.attackHitsPerGame * 50).toBe(count('ATTACK_SUCCESS'));
    expect(r.bombHitsPerGame * 50).toBe(count('BOMB_SUCCESS'));
    expect(r.drawsPerGame * 50).toBe(all.flatMap((n) => n.summary.players).filter((s) => s.draw).length);
    expect(r.bombOutcomePct.hit + r.bombOutcomePct.defended + r.bombOutcomePct.targetAway).toBeCloseTo(100);
    expect(Object.values(r.actionPct).reduce((s, x) => s + x, 0)).toBeCloseTo(100);
    expect(r.points.mean * 400).toBeCloseTo(ledger.reduce((s, e) => s + e.delta, 0));
    expect(r.byKind.smart!.winPct + r.byKind.random!.winPct).toBeCloseTo(100);
  });

  it('formatReport gera uma tabela Markdown', () => {
    const md = formatReport('teste', runConfig(MIXED, 5, 1));
    expect(md).toContain('### teste');
    expect(md).toContain('| Jogadores com 0 ou menos |');
    expect(md).toContain('| smart | 4 |');
  });
});
