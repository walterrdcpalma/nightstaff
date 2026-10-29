import type { LedgerEntry, LedgerReason, PlayerId } from './types.ts';

/** Acertos para o desempate (RULES.md §5): ataques ganhos e bombas que renderam pontos. */
export const SUCCESS_REASONS: readonly LedgerReason[] = ['ATTACK_SUCCESS', 'BOMB_SUCCESS'];

export interface RankingEntry {
  playerId: PlayerId;
  points: number;
  successfulAttacks: number;
  /** Soma dos deltas negativos, em valor absoluto. */
  pointsLost: number;
  /** 1 = Funcionário do Mês. Empates completos partilham a posição (1, 1, 3...). */
  rank: number;
}

/** Ranking final a partir do ledger de todas as noites (RULES.md §5). */
export function finalRanking(players: PlayerId[], ledger: LedgerEntry[]): RankingEntry[] {
  const rows = new Map<PlayerId, RankingEntry>(
    players.map((p) => [p, { playerId: p, points: 0, successfulAttacks: 0, pointsLost: 0, rank: 0 }]),
  );
  for (const e of ledger) {
    const r = rows.get(e.playerId);
    if (!r) throw new Error(`Jogador desconhecido no ledger: ${e.playerId}`);
    r.points += e.delta;
    if (e.delta < 0) r.pointsLost -= e.delta;
    if (SUCCESS_REASONS.includes(e.reason)) r.successfulAttacks++;
  }

  const compare = (a: RankingEntry, b: RankingEntry) =>
    b.points - a.points || b.successfulAttacks - a.successfulAttacks || a.pointsLost - b.pointsLost;

  const sorted = [...rows.values()].sort(compare);
  sorted.forEach((r, i) => {
    r.rank = i > 0 && compare(sorted[i - 1], r) === 0 ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}
