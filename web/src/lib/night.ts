// Lógica pura dos ecrãs Manhã e Bairro/Histórico (RULES.md §4). Testada em night.test.ts.
import type { LedgerReason, NightSummary, PlayerNightSummary } from '../../../engine/index.ts';

type NameOf = (id: string) => string;

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
export function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * O que o bairro viu de um jogador numa noite. Sem pontos (RULES.md §4):
 * em casa ou fora, ataques e bombas só com os números, defesa com os atacantes revelados, bónus de casa.
 */
export function playerLines(s: PlayerNightSummary, nameOf: NameOf): string[] {
  const lines: string[] = [];
  if (s.defended) {
    lines.push(`🛡️ A Segurança apanhou ${listNames(s.revealedAttackers.map(nameOf))}.`);
  } else {
    if (s.attacks > 0) {
      const visits = plural(s.attacks, 'Visita surpresa', 'Visitas surpresa');
      lines.push(s.draw ? `🗡️ ${s.attacks} atacantes, houve sorteio.` : `🗡️ ${visits}.`);
    }
    if (s.bombs > 0) lines.push(`💣 ${plural(s.bombs, 'Reunião de emergência', 'Reuniões de emergência')}.`);
  }
  if (s.homeBonus) lines.push('✨ Noite tranquila: bónus de casa.');
  return lines;
}

/** Título da manhã, ex.: "Noite 3: 5 em casa, 3 fora." */
export function morningHeadline(night: number, summary: NightSummary): string {
  const home = summary.players.filter((p) => p.location === 'HOME').length;
  return `Noite ${night}: ${home} em casa, ${summary.players.length - home} fora.`;
}

/** Movimentos do próprio jogador (só ele os vê, RULES.md §4). */
export const REASON_TEXT: Record<LedgerReason, string> = {
  ATTACK_SUCCESS: '🗡️ Visita surpresa bem-sucedida',
  ATTACK_LOST_DRAW: '🗡️ Perdeste o sorteio',
  ATTACK_BOMBED: '🗡️ Havia uma Reunião de emergência no alvo',
  ATTACK_DEFENDED: '🗡️ O alvo tinha Segurança',
  ATTACK_BURGLARY: '🗡️ Assalto à casa vazia',
  ATTACK_AWAY_BOMBED: '🗡️ Casa vazia, mas a Reunião de emergência levou tudo',
  BOMB_SUCCESS: '💣 Reunião de emergência',
  BOMB_DEFENDED: '💣 O alvo tinha Segurança',
  VICTIM: '😵 Apanharam-te',
  BURGLARY_VICTIM: '😵 Assaltaram-te a casa vazia',
  DEFENSE: '🛡️ A tua Segurança apanhou alguém',
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
  return entries.map((e) => `${REASON_TEXT[e.reason]}${e.target_id ? ` (${nameOf(e.target_id)})` : ''}: ${formatDelta(e.delta)}`);
}

export type Window = 'HOME' | 'AWAY' | null;

/**
 * Bairro: uma linha por jogador, com a janela de cada noite (1 a 9). `null` = noite ainda por resolver
 * ou jogador fora do ciclo nessa noite. Entra também quem saiu a meio e aparece nos resumos.
 */
export function historyGrid(enrolled: string[], nights: { night: number; summary: NightSummary }[]): Map<string, Window[]> {
  const grid = new Map<string, Window[]>();
  const row = (id: string) => grid.get(id) ?? grid.set(id, Array<Window>(9).fill(null)).get(id)!;
  enrolled.forEach(row);
  for (const n of nights) for (const s of n.summary.players) row(s.playerId)[n.night - 1] = s.location;
  return grid;
}
