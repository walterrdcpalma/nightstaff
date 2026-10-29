// Lógica pura do ecrã de pontos: os meus pontos durante o ciclo e o ranking final (RULES.md §1, §4 e §5).
import { SALARY } from '../../../engine/index.ts';
import type { LedgerReason } from '../../../engine/index.ts';
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

/** Linha da tabela `rankings`, gravada pela resolve-night no fim do ciclo (o ledger dos outros nunca se lê). */
export interface RankingDbRow {
  player_id: string;
  rank: number;
  points: number;
  successful_attacks: number;
}

export interface RankingRow {
  playerId: string;
  name: string;
  /** 1 = Funcionário do Mês. */
  rank: number;
  points: number;
  successfulAttacks: number;
  /** Empatado em pontos com o jogador acima ou abaixo: a posição saiu do desempate (RULES.md §5). */
  tiebreak: boolean;
}

/** Ranking final para o ecrã, por posição. */
export function rankingRows(rows: RankingDbRow[], nameOf: (id: string) => string): RankingRow[] {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  return sorted.map((r, i) => ({
    playerId: r.player_id,
    name: nameOf(r.player_id),
    rank: r.rank,
    points: r.points,
    successfulAttacks: r.successful_attacks,
    tiebreak: sorted[i - 1]?.points === r.points || sorted[i + 1]?.points === r.points,
  }));
}

/** "1 ataque bem-sucedido", "3 ataques bem-sucedidos". */
export function attacksText(n: number): string {
  return n === 1 ? '1 ataque bem-sucedido' : `${n} ataques bem-sucedidos`;
}
