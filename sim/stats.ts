import { ACTION_TYPES, SUCCESS_REASONS } from '../engine/index.ts';
import type { ActionType, LedgerReason, PlayerId } from '../engine/index.ts';
import type { BotKind } from './bots.ts';
import type { GameResult } from './game.ts';

export interface Spread {
  mean: number;
  /** Desvio padrão (populacional). */
  sd: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
}

export function spread(xs: number[]): Spread {
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { mean, sd, min: sorted[0], p10: at(0.1), p50: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1] };
}

export interface KindReport {
  seats: number;
  points: Spread;
  zeroOrLessPct: number;
  /** % de ciclos ganhos por este tipo de bot (vitória partilhada conta em fração). */
  winPct: number;
}

export interface Report {
  games: number;
  players: number;
  /** Acertos = ataques ganhos + bombas que renderam pontos (como no desempate do §5). */
  hitsPerGame: number;
  attackHitsPerGame: number;
  bombHitsPerGame: number;
  /** % das Visitas surpresa que renderam pontos. */
  attackHitPct: number;
  points: Spread;
  zeroOrLessPct: number;
  drawsPerGame: number;
  gamesWithDrawPct: number;
  bombsPerGame: number;
  /** Destino das bombas, em %. */
  bombOutcomePct: { hit: number; defended: number; targetAway: number };
  sharedWinPct: number;
  actionPct: Record<ActionType, number>;
  byKind: Partial<Record<BotKind, KindReport>>;
}

const pct = (n: number, total: number) => (total === 0 ? 0 : (100 * n) / total);

export function summarize(games: GameResult[], kindOf: (p: PlayerId) => BotKind): Report {
  const reasons = new Map<LedgerReason, number>();
  const actions = new Map<ActionType, number>(ACTION_TYPES.map((t) => [t, 0]));
  let draws = 0;
  let gamesWithDraw = 0;
  let sharedWins = 0;
  const finals: number[] = [];
  const finalsByKind = new Map<BotKind, number[]>();
  const winsByKind = new Map<BotKind, number>();

  for (const g of games) {
    let gameDraws = 0;
    for (const n of g.nights) {
      for (const e of n.ledger) reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);
      for (const a of n.actions) actions.set(a.type, actions.get(a.type)! + 1);
      gameDraws += n.summary.players.filter((s) => s.draw).length;
    }
    draws += gameDraws;
    if (gameDraws > 0) gamesWithDraw++;

    const winners = g.ranking.filter((r) => r.rank === 1);
    if (winners.length > 1) sharedWins++;
    for (const r of g.ranking) {
      const kind = kindOf(r.playerId);
      finals.push(r.points);
      finalsByKind.set(kind, [...(finalsByKind.get(kind) ?? []), r.points]);
      if (r.rank === 1) winsByKind.set(kind, (winsByKind.get(kind) ?? 0) + 1 / winners.length);
    }
  }

  const count = (r: LedgerReason) => reasons.get(r) ?? 0;
  const bombs = actions.get('BOMB')!;
  const totalActions = [...actions.values()].reduce((s, x) => s + x, 0);

  const byKind: Report['byKind'] = {};
  for (const [kind, points] of finalsByKind) {
    byKind[kind] = {
      seats: points.length / games.length,
      points: spread(points),
      zeroOrLessPct: pct(points.filter((p) => p <= 0).length, points.length),
      winPct: pct(winsByKind.get(kind) ?? 0, games.length),
    };
  }

  return {
    games: games.length,
    players: games[0]?.players.length ?? 0,
    hitsPerGame: SUCCESS_REASONS.reduce((s, r) => s + count(r), 0) / games.length,
    attackHitsPerGame: count('ATTACK_SUCCESS') / games.length,
    bombHitsPerGame: count('BOMB_SUCCESS') / games.length,
    attackHitPct: pct(count('ATTACK_SUCCESS'), actions.get('ATTACK')!),
    points: spread(finals),
    zeroOrLessPct: pct(finals.filter((p) => p <= 0).length, finals.length),
    drawsPerGame: draws / games.length,
    gamesWithDrawPct: pct(gamesWithDraw, games.length),
    bombsPerGame: bombs / games.length,
    bombOutcomePct: {
      hit: pct(count('BOMB_SUCCESS'), bombs),
      defended: pct(count('BOMB_DEFENDED'), bombs),
      targetAway: pct(count('BOMB_TARGET_AWAY'), bombs),
    },
    sharedWinPct: pct(sharedWins, games.length),
    actionPct: Object.fromEntries(ACTION_TYPES.map((t) => [t, pct(actions.get(t)!, totalActions)])) as Record<ActionType, number>,
    byKind,
  };
}
