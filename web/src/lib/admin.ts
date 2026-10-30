// Painel de administração da app (T23, RULES.md §7 v10): todas as salas, só com metadados, separadas em correntes
// (lobby ou a decorrer) e fechadas (acabadas). Lógica pura, testada em admin.test.ts.
import { lisbonDate } from '../../../engine/index.ts';
import { botsNight, openNight } from './rooms.ts';
import type { RoomKind, RoomStatus } from './rooms.ts';

/** Uma linha da `admin_list_rooms()`, como a BD a devolve. */
export interface AdminRoomRow {
  room_id: number;
  code: string;
  kind: RoomKind;
  status: RoomStatus;
  admin_name: string;
  players: string[];
  created_at: string;
  /** Dia da noite 1 da partida atual; `null` no lobby. */
  start_date: string | null;
  resolved_nights: number;
  last_resolved_at: string | null;
}

export interface AdminRoom extends AdminRoomRow {
  /** Noite em curso, como em As minhas salas; `null` no lobby, acabada ou com o bairro a acordar. */
  night: number | null;
}

export const ROOM_KIND_TEXT: Record<RoomKind, string> = {
  people: '👥 Pessoas',
  bots: '🤖 Bots',
};

/** Noite em curso de uma sala a decorrer: nas de pessoas segue o relógio, nas de bots a última resolvida. */
export function adminNight(r: AdminRoomRow, today: string): number | null {
  if (r.status !== 'running' || r.start_date === null) return null;
  return r.kind === 'bots' ? botsNight(r.resolved_nights) : openNight(r.start_date, today);
}

/** Correntes (lobby ou a decorrer) e fechadas (acabadas), cada uma com as mais recentes primeiro. */
export function groupAdminRooms(rows: AdminRoomRow[], today: string): { current: AdminRoom[]; closed: AdminRoom[] } {
  const rooms = rows
    .map((r) => ({ ...r, night: adminNight(r, today) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.room_id - a.room_id);
  return { current: rooms.filter((r) => r.status !== 'finished'), closed: rooms.filter((r) => r.status === 'finished') };
}

/** As datas de uma sala, em Lisboa: criada, começou e (acabada) a última noite resolvida. */
export function adminDates(r: AdminRoomRow): string[] {
  const dates = [`Criada a ${lisbonDate(new Date(r.created_at))}`];
  if (r.start_date) dates.push(`Noite 1 a ${r.start_date}`);
  if (r.status === 'finished' && r.last_resolved_at) dates.push(`Acabou a ${lisbonDate(new Date(r.last_resolved_at))}`);
  return dates;
}
