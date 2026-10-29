import { NIGHTS, finalRanking, mulberry32, remainingQuota, resolveNight } from '../engine/index.ts';
import type { Action, GameState, LedgerEntry, NightSummary, PlayerId, RankingEntry } from '../engine/index.ts';
import type { Bot } from './bots.ts';

export { NIGHTS };

export interface Seat {
  playerId: PlayerId;
  bot: Bot;
}

export interface NightRecord {
  actions: Action[];
  ledger: LedgerEntry[];
  summary: NightSummary;
}

export interface GameResult {
  players: PlayerId[];
  nights: NightRecord[];
  ranking: RankingEntry[];
}

/** Joga um jogo completo. O mesmo `seed` dá sempre o mesmo jogo. */
export function playGame(seats: Seat[], seed: number): GameResult {
  const rng = mulberry32(seed);
  const players = seats.map((s) => s.playerId);
  const pastActions: Action[] = [];
  const nights: NightRecord[] = [];

  for (let night = 1; night <= NIGHTS; night++) {
    const state: GameState = { players, pastActions: [...pastActions] };
    const history = nights.map((n) => n.summary);
    const actions = seats.map(({ playerId, bot }) =>
      bot({ me: playerId, players, night, nights: NIGHTS, history, quota: remainingQuota(state, playerId) }, rng),
    );
    const { ledger, summary } = resolveNight(state, actions, Math.floor(rng() * 2 ** 32));
    nights.push({ actions, ledger, summary });
    pastActions.push(...actions);
  }

  return { players, nights, ranking: finalRanking(players, nights.flatMap((n) => n.ledger)) };
}
