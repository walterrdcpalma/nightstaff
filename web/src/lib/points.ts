// Lógica pura do ecrã de pontos: os meus pontos durante o ciclo e o ranking final (RULES.md §1, §4 e §5).
import { SALARY, finalRanking } from '../../../engine/index.ts';
import type { LedgerEntry, LedgerReason, RankingEntry } from '../../../engine/index.ts';
import { formatDelta, myResultLines } from './night.ts';
import type { MyEntry } from './night.ts';
import type { GameStatus } from './today.ts';

/** Linha do ledger, como vem da BD. */
export interface LedgerRow {
  night: number;
  player_id: string;
  delta: number;
  reason: LedgerReason;
  target_id: string | null;
}

/** Pontos de um jogador: salário + soma dos movimentos (RULES.md §1). Podem ficar abaixo de 0. */
export function points(rows: { delta: number }[]): number {
  return rows.reduce((sum, r) => sum + r.delta, SALARY);
}

export interface NightMovements {
  night: number;
  /** Soma da noite, ex.: "+12". */
  total: string;
  lines: string[];
}

/** Os meus movimentos, noite a noite (a mais recente primeiro). */
export function movementsByNight(mine: LedgerRow[], nameOf: (id: string) => string): NightMovements[] {
  const nights = [...new Set(mine.map((r) => r.night))].sort((a, b) => b - a);
  return nights.map((night) => {
    const rows: MyEntry[] = mine.filter((r) => r.night === night);
    return { night, total: formatDelta(rows.reduce((s, r) => s + r.delta, 0)), lines: myResultLines(rows, nameOf) };
  });
}

/** O ranking completo só se revela no dia 11, com o ciclo acabado (RULES.md §4). */
export function rankingVisible(status: GameStatus): boolean {
  return status === 'finished';
}

export interface RankingRow extends RankingEntry {
  name: string;
  /** Empatado em pontos com o jogador acima ou abaixo: a posição saiu do desempate (RULES.md §5). */
  tiebreak: boolean;
}

/**
 * Ranking final com o motor (`finalRanking`, desempates do RULES.md §5 e a seed do ciclo).
 * Entram os inscritos e quem aparecer no ledger (ex.: saiu a meio do ciclo).
 */
export function rankingRows(enrolled: string[], ledger: LedgerRow[], seed: number, nameOf: (id: string) => string): RankingRow[] {
  const players = [...new Set([...enrolled, ...ledger.map((r) => r.player_id)])];
  const entries: LedgerEntry[] = ledger.map((r) => ({
    playerId: r.player_id,
    delta: r.delta,
    reason: r.reason,
    ...(r.target_id && { targetId: r.target_id }),
  }));
  const ranking = finalRanking(players, entries, seed);
  return ranking.map((r, i) => ({
    ...r,
    name: nameOf(r.playerId),
    tiebreak: ranking[i - 1]?.points === r.points || ranking[i + 1]?.points === r.points,
  }));
}
