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
  noSalaryPct: number;
  /** % de ciclos ganhos por este tipo de bot. */
  winPct: number;
}

export interface Report {
  games: number;
  players: number;
  /** Acertos = Visitas ganhas + assaltos + bombas que renderam pontos (como no desempate do §5). */
  hitsPerGame: number;
  /** Visitas que renderam pontos: ganhas em casa + assaltos à casa vazia. */
  attackHitsPerGame: number;
  burglaryHitsPerGame: number;
  bombHitsPerGame: number;
  /** % das Visitas surpresa que renderam pontos (ganhas ou assaltos). */
  attackHitPct: number;
  /** Pontos finais, já com o salário. */
  points: Spread;
  /** % de jogadores "sem salário": pontos finais abaixo de 0 (RULES.md §1). */
  noSalaryPct: number;
  drawsPerGame: number;
  gamesWithDrawPct: number;
  bombsPerGame: number;
  /** Destino das bombas, em %: alvo em casa sem defesa, alvo fora (acerta na mesma), alvo defendeu-se. */
  bombOutcomePct: { home: number; away: number; defended: number };
  /** % de ciclos em que o 1.º e o 2.º acabam com os mesmos pontos (o Funcionário do Mês sai do desempate). */
  tiebreakWinPct: number;
  /** % de ciclos em que o Funcionário do Mês não estava em 1.º (nem empatado) antes da noite 9. */
  lastNightSwingPct: number;
  actionPct: Record<ActionType, number>;
  byKind: Partial<Record<BotKind, KindReport>>;
}

const pct = (n: number, total: number) => (total === 0 ? 0 : (100 * n) / total);

export function summarize(games: GameResult[], kindOf: (p: PlayerId) => BotKind): Report {
  /** Acertos por razão: só os movimentos que renderam pontos, como no desempate. */
  const hits = new Map<LedgerReason, number>();
  const actions = new Map<ActionType, number>(ACTION_TYPES.map((t) => [t, 0]));
  const bombOutcomes = { home: 0, away: 0, defended: 0 };
  let draws = 0;
  let gamesWithDraw = 0;
  let tiebreakWins = 0;
  let lastNightSwings = 0;
  const finals: number[] = [];
  const finalsByKind = new Map<BotKind, number[]>();
  const winsByKind = new Map<BotKind, number>();

  for (const g of games) {
    let gameDraws = 0;
    for (const n of g.nights) {
      for (const e of n.ledger) if (SUCCESS_REASONS.includes(e.reason) && e.delta > 0) hits.set(e.reason, (hits.get(e.reason) ?? 0) + 1);
      for (const a of n.actions) actions.set(a.type, actions.get(a.type)! + 1);
      // O resumo público só tem casa/fora: o destino das bombas e os sorteios vêm do ledger.
      for (const e of n.ledger) {
        if (e.reason === 'BOMB_DEFENDED') bombOutcomes.defended++;
        if (e.reason === 'BOMB_SUCCESS') {
          const t = n.summary.players.find((s) => s.playerId === e.targetId)!;
          bombOutcomes[t.location === 'AWAY' ? 'away' : 'home']++;
        }
        if (e.reason === 'ATTACK_DRAW_WON') gameDraws++;
      }
    }
    draws += gameDraws;
    if (gameDraws > 0) gamesWithDraw++;

    if (g.ranking[0].points === g.ranking[1]?.points) tiebreakWins++;
    const before = new Map(g.players.map((p) => [p, 0]));
    for (const n of g.nights.slice(0, -1)) for (const e of n.ledger) before.set(e.playerId, before.get(e.playerId)! + e.delta);
    if (before.get(g.ranking[0].playerId)! < Math.max(...before.values())) lastNightSwings++;
    for (const r of g.ranking) {
      const kind = kindOf(r.playerId);
      finals.push(r.points);
      finalsByKind.set(kind, [...(finalsByKind.get(kind) ?? []), r.points]);
      if (r.rank === 1) winsByKind.set(kind, (winsByKind.get(kind) ?? 0) + 1);
    }
  }

  const count = (r: LedgerReason) => hits.get(r) ?? 0;
  const burglaryHits = count('ATTACK_BURGLARY');
  const bombs = actions.get('BOMB')!;
  const totalActions = [...actions.values()].reduce((s, x) => s + x, 0);

  const byKind: Report['byKind'] = {};
  for (const [kind, points] of finalsByKind) {
    byKind[kind] = {
      seats: points.length / games.length,
      points: spread(points),
      noSalaryPct: pct(points.filter((p) => p < 0).length, points.length),
      winPct: pct(winsByKind.get(kind) ?? 0, games.length),
    };
  }

  return {
    games: games.length,
    players: games[0]?.players.length ?? 0,
    hitsPerGame: SUCCESS_REASONS.reduce((s, r) => s + count(r), 0) / games.length,
    attackHitsPerGame: (count('ATTACK_SUCCESS') + count('ATTACK_DRAW_WON')) / games.length,
    burglaryHitsPerGame: burglaryHits / games.length,
    bombHitsPerGame: count('BOMB_SUCCESS') / games.length,
    attackHitPct: pct(count('ATTACK_SUCCESS') + count('ATTACK_DRAW_WON') + burglaryHits, actions.get('ATTACK')!),
    points: spread(finals),
    noSalaryPct: pct(finals.filter((p) => p < 0).length, finals.length),
    drawsPerGame: draws / games.length,
    gamesWithDrawPct: pct(gamesWithDraw, games.length),
    bombsPerGame: bombs / games.length,
    bombOutcomePct: {
      home: pct(bombOutcomes.home, bombs),
      away: pct(bombOutcomes.away, bombs),
      defended: pct(bombOutcomes.defended, bombs),
    },
    tiebreakWinPct: pct(tiebreakWins, games.length),
    lastNightSwingPct: pct(lastNightSwings, games.length),
    actionPct: Object.fromEntries(ACTION_TYPES.map((t) => [t, pct(actions.get(t)!, totalActions)])) as Record<ActionType, number>,
    byKind,
  };
}
