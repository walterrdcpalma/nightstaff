import { mulberry32 } from './rng.ts';
import { SALARY } from './types.ts';
import type { LedgerEntry, LedgerReason, PlayerId } from './types.ts';

/** Acertos para o desempate (RULES.md §5): Visitas (ganhas ou assaltos) e bombas, quando renderam pontos. */
export const SUCCESS_REASONS: readonly LedgerReason[] = ['ATTACK_SUCCESS', 'ATTACK_BURGLARY', 'BOMB_SUCCESS'];

const isSuccess = (e: LedgerEntry) => SUCCESS_REASONS.includes(e.reason) && e.delta > 0;

export interface RankingEntry {
  playerId: PlayerId;
  /** `SALARY + soma do ledger`. */
  points: number;
  successfulAttacks: number;
  /** Soma dos deltas negativos, em valor absoluto. */
  pointsLost: number;
  /** 1 = Funcionário do Mês. Sempre de 1 a N, sem posições repetidas. */
  rank: number;
}

/**
 * Ranking final a partir do ledger de todas as noites do ciclo (RULES.md §5). Desempate:
 * 1. mais ataques bem-sucedidos;
 * 2. confronto direto: acertos contra os outros empatados nos critérios anteriores (mini-liga).
 *    Conta uma só vez, com todo o grupo; quem continuar empatado passa ao critério seguinte;
 * 3. menos pontos perdidos;
 * 4. sorteio com a `seed` do ciclo.
 */
export function finalRanking(players: PlayerId[], ledger: LedgerEntry[], seed: number): RankingEntry[] {
  const rows = new Map<PlayerId, RankingEntry>(
    players.map((p) => [p, { playerId: p, points: SALARY, successfulAttacks: 0, pointsLost: 0, rank: 0 }]),
  );
  const hitTargets = new Map<PlayerId, PlayerId[]>(players.map((p) => [p, []]));
  for (const e of ledger) {
    const r = rows.get(e.playerId);
    if (!r) throw new Error(`Jogador desconhecido no ledger: ${e.playerId}`);
    r.points += e.delta;
    if (e.delta < 0) r.pointsLost -= e.delta;
    if (isSuccess(e)) {
      if (!e.targetId) throw new Error(`Acerto sem alvo no ledger: ${e.playerId} (${e.reason})`);
      r.successfulAttacks++;
      hitTargets.get(e.playerId)!.push(e.targetId);
    }
  }

  // Grupos empatados em pontos e acertos: o confronto direto só conta acertos dentro do grupo.
  const tieKey = (r: RankingEntry) => `${r.points}:${r.successfulAttacks}`;
  const groups = new Map<string, Set<PlayerId>>();
  for (const r of rows.values()) groups.set(tieKey(r), (groups.get(tieKey(r)) ?? new Set()).add(r.playerId));
  const headToHead = (r: RankingEntry) => {
    const group = groups.get(tieKey(r))!;
    return hitTargets.get(r.playerId)!.filter((t) => group.has(t)).length;
  };

  // Sorteio: um número por jogador, por ordem fixa, para não depender da ordem de `players`.
  const rng = mulberry32(seed);
  const draw = new Map([...players].sort().map((p) => [p, rng()]));

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.successfulAttacks - a.successfulAttacks ||
      headToHead(b) - headToHead(a) ||
      a.pointsLost - b.pointsLost ||
      draw.get(a.playerId)! - draw.get(b.playerId)! ||
      (a.playerId < b.playerId ? -1 : 1),
  );
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}
