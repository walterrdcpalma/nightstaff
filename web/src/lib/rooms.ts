// Lógica pura das salas (RULES.md §1 v6): a lista "As minhas salas", o lobby, os códigos e o nome.
// Testada em rooms.test.ts.
import { MIN_PLAYERS, NIGHTS, nightOn } from '../../../engine/index.ts';

export type RoomStatus = 'lobby' | 'running' | 'finished';

export const ROOM_STATUS_TEXT: Record<RoomStatus, string> = {
  lobby: '📝 Lobby',
  running: '🌙 A decorrer',
  finished: '🏆 Acabada',
};

export interface RoomCard {
  id: number;
  code: string;
  status: RoomStatus;
  isAdmin: boolean;
  players: number;
  /** Noite aberta hoje, se a sala está a decorrer e a resolve-night já passou; senão `null`. */
  night: number | null;
  /** Já escolhi a ação da noite aberta. */
  chosen: boolean;
}

/** Noite aberta hoje numa partida a decorrer que começou em `startDate`, ou `null` (o bairro está a acordar). */
export function openNight(startDate: string, today: string): number | null {
  const night = nightOn(startDate, today);
  return night >= 1 && night <= NIGHTS ? night : null;
}

/** O que falta fazer numa sala, para a lista "As minhas salas". */
export function roomTodo(r: RoomCard): string {
  switch (r.status) {
    case 'lobby':
      if (!r.isAdmin) return 'À espera que o admin carregue em Começar.';
      return r.players >= MIN_PLAYERS ? 'Já podes carregar em Começar.' : `À espera de jogadores (${r.players}/${MIN_PLAYERS}).`;
    case 'running':
      if (r.night === null) return 'O bairro está a acordar…';
      return r.chosen ? `Noite ${r.night}: já escolheste.` : `Noite ${r.night}: escolhe até às 23:59.`;
    case 'finished':
      return r.isAdmin ? 'Acabou. Vê o Funcionário do Mês ou reinicia a sala.' : 'Acabou. Vê o Funcionário do Mês.';
  }
}

/** A sala está à minha espera: falta escolher a noite, ou sou admin e já posso começar. */
export function needsMe(r: RoomCard): boolean {
  if (r.status === 'running') return r.night !== null && !r.chosen;
  return r.status === 'lobby' && r.isAdmin && r.players >= MIN_PLAYERS;
}

/** Primeiro as salas à minha espera; depois as mais recentes. */
export function sortRooms(rooms: RoomCard[]): RoomCard[] {
  return [...rooms].sort((a, b) => Number(needsMe(b)) - Number(needsMe(a)) || b.id - a.id);
}

/** O admin pode carregar em Começar (o botão fica desligado com menos de 3). */
export function canStart(players: number): boolean {
  return players >= MIN_PLAYERS;
}

/** Código como a BD o guarda: maiúsculas, sem espaços. */
export function normalizeCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Erro do código antes de o mandar à BD, ou `null`. Os códigos não têm 0, O, 1, I nem L. */
export function codeError(input: string): string | null {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(normalizeCode(input))
    ? null
    : 'O código tem 6 caracteres (sem 0, O, 1, I nem L).';
}

/** Limite do nome, como na BD (`players_name_check`). */
export const NAME_MAX = 24;

/** Erro do nome que os outros vão ver, ou `null`. */
export function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Escreve um nome.';
  if (trimmed.length > NAME_MAX) return `No máximo ${NAME_MAX} caracteres.`;
  return null;
}

/** Erros das funções da sala (BD), em português de Portugal. */
export const ROOM_ERROR_TEXT: Record<string, string> = {
  NO_NAME: 'Primeiro escolhe o teu nome.',
  ROOM_NOT_FOUND: 'Não há nenhuma sala com esse código.',
  ROOM_NOT_IN_LOBBY: 'Essa sala já começou: só se entra ou sai no lobby.',
  NOT_ADMIN: 'Só o admin pode fazer isso.',
  TOO_FEW_PLAYERS: `São precisos pelo menos ${MIN_PLAYERS} jogadores.`,
  ROOM_NOT_FINISHED: 'A partida ainda não acabou.',
  NOT_PEOPLE_ROOM: 'Esta sala é contra bots.',
};

export function roomErrorText(message: string): string {
  return ROOM_ERROR_TEXT[message] ?? 'Algo correu mal. Tenta outra vez.';
}
