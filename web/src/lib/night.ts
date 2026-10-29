// Lógica pura dos ecrãs Manhã e Bairro/Histórico (RULES.md §4). Testada em night.test.ts.
import type { LedgerReason, NightSummary } from '../../../engine/index.ts';

type NameOf = (id: string) => string;

/** Título da manhã, ex.: "Noite 3: 5 em casa, 3 fora." */
export function morningHeadline(night: number, summary: NightSummary): string {
  const home = summary.players.filter((p) => p.location === 'HOME').length;
  return `Noite ${night}: ${home} em casa, ${summary.players.length - home} fora.`;
}

/** Movimentos do próprio jogador (só ele os vê, RULES.md §4). */
export const REASON_TEXT: Record<LedgerReason, string> = {
  ATTACK_SUCCESS: '🗡️ Visita surpresa bem-sucedida',
  ATTACK_DRAW_WON: '🗡️ Ganhaste o sorteio da Visita surpresa',
  ATTACK_LOST_DRAW: '🗡️ Perdeste o sorteio',
  ATTACK_BOMBED: '🗡️ Havia um Despedimento coletivo no alvo',
  ATTACK_DEFENDED: '🗡️ O alvo tinha Segurança',
  ATTACK_BURGLARY: '🗡️ Assalto à casa vazia',
  ATTACK_AWAY_BOMBED: '🗡️ Casa vazia, mas o Despedimento coletivo levou tudo',
  BOMB_SUCCESS: '🔥 Despedimento coletivo',
  BOMB_DEFENDED: '🔥 O alvo tinha Segurança',
  VICTIM: '😵 Atacaram-te em casa',
  BOMBED: '🔥 Um Despedimento coletivo apanhou-te',
  BURGLARY_VICTIM: '😵 Assaltaram-te a casa vazia',
  DEFENSE: '🛡️ A tua Segurança apanhou',
  HOME_BONUS: '✨ Bónus de casa',
};

export interface MyEntry {
  delta: number;
  reason: LedgerReason;
  target_id: string | null;
}

/** "+10", "−5", "0". */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0';
}

/** Linhas do meu resultado, ex.: "🗡️ Visita surpresa bem-sucedida (Bruno): +10". */
export function myResultLines(entries: MyEntry[], nameOf: NameOf): string[] {
  return entries.map((e) => {
    // Na Segurança, o alvo é quem apanhei: "A tua Segurança apanhou Carla".
    const who = !e.target_id ? '' : e.reason === 'DEFENSE' ? ` ${nameOf(e.target_id)}` : ` (${nameOf(e.target_id)})`;
    return `${REASON_TEXT[e.reason]}${who}: ${formatDelta(e.delta)}`;
  });
}

export interface PrivateReport {
  /** O que me aconteceu, linha a linha, ou uma frase de noite tranquila. */
  lines: string[];
  /** Os meus pontos da noite, ex.: "+12". */
  total: string;
}

/** Manhã: o que me aconteceu nesta noite e os meus pontos dela. Só com o meu ledger (RULES.md §4, privado). */
export function privateReport(entries: MyEntry[], nameOf: NameOf): PrivateReport {
  const lines = entries.length > 0 ? myResultLines(entries, nameOf) : ['🌙 Noite tranquila: nada a registar.'];
  return { lines, total: formatDelta(entries.reduce((sum, e) => sum + e.delta, 0)) };
}

export type WindowLight = 'HOME' | 'AWAY' | null;

/**
 * Bairro: uma linha por jogador, com a janela de cada noite (1 a 9). `null` = noite ainda por resolver
 * ou jogador fora do ciclo nessa noite. Entra também quem saiu a meio e aparece nos resumos.
 */
export function historyGrid(enrolled: string[], nights: { night: number; summary: NightSummary }[]): Map<string, WindowLight[]> {
  const grid = new Map<string, WindowLight[]>();
  const row = (id: string) => grid.get(id) ?? grid.set(id, Array<WindowLight>(9).fill(null)).get(id)!;
  enrolled.forEach(row);
  for (const n of nights) for (const s of n.summary.players) row(s.playerId)[n.night - 1] = s.location;
  return grid;
}
