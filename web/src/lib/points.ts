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

/** O ranking completo só se revela na resolução, com a partida acabada (RULES.md §4). */
export function rankingVisible(status: GameStatus): boolean {
  return status === 'finished';
}

/** Linha da tabela `rankings`, gravada pela resolve-night no fim da partida (o ledger dos outros nunca se lê). */
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
  /**
   * Empatado em pontos com outro jogador: a posição saiu do desempate (RULES.md §5). `ATTACKS` se os ataques
   * bem-sucedidos chegaram (ninguém empatado tem os mesmos); senão `LATER`: confronto direto, pontos perdidos
   * ou sorteio, que não se distinguem sem o ledger dos outros.
   */
  tiebreak: Tiebreak | null;
}

export type Tiebreak = 'ATTACKS' | 'LATER';

/** Texto do critério que desempatou. */
export const TIEBREAK_TEXT: Record<Tiebreak, string> = {
  ATTACKS: 'ataques bem-sucedidos',
  LATER: 'confronto direto, pontos perdidos ou sorteio',
};

/** Ranking final para o ecrã, por posição. */
export function rankingRows(rows: RankingDbRow[], nameOf: (id: string) => string): RankingRow[] {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  return sorted.map((r) => ({
    playerId: r.player_id,
    name: nameOf(r.player_id),
    rank: r.rank,
    points: r.points,
    successfulAttacks: r.successful_attacks,
    tiebreak: tiebreakOf(r, sorted),
  }));
}

function tiebreakOf(r: RankingDbRow, rows: RankingDbRow[]): Tiebreak | null {
  const tied = rows.filter((o) => o !== r && o.points === r.points);
  if (tied.length === 0) return null;
  return tied.some((o) => o.successful_attacks === r.successful_attacks) ? 'LATER' : 'ATTACKS';
}

/** "1 ataque bem-sucedido", "3 ataques bem-sucedidos". */
export function attacksText(n: number): string {
  return n === 1 ? '1 ataque bem-sucedido' : `${n} ataques bem-sucedidos`;
}
