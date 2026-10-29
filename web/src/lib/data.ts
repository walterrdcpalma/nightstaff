// Leituras partilhadas pelos ecrãs, como o jogador com sessão (RLS). Um erro lança: o ecrã mostra-o.
import type { NightSummary } from '../../../engine/index.ts';
import type { MyEntry } from './night.ts';
import type { LedgerRow, RankingDbRow } from './points.ts';
import type { RoomStatus } from './rooms.ts';
import { supabase } from './supabase.ts';
import type { GameStatus } from './today.ts';

export interface Room {
  id: number;
  code: string;
  admin_id: string;
  status: RoomStatus;
}

export interface Player {
  id: string;
  name: string;
}

export interface Game {
  id: number;
  start_date: string;
  status: GameStatus;
  /** Seed do desempate, gravada quando a partida acaba. */
  seed: number | null;
}

export interface ResolvedNight {
  night: number;
  summary: NightSummary;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** O meu jogador, ou `null` se ainda não escolhi o nome (primeiro login). */
export async function loadMe(userId: string): Promise<Player | null> {
  return ok(await supabase.from('players').select('id, name').eq('id', userId).maybeSingle());
}

/** As minhas salas (a RLS só mostra essas), com o número de jogadores. */
export async function loadRooms(): Promise<(Room & { players: number })[]> {
  const rows: (Room & { room_players: { count: number }[] })[] = ok(
    await supabase.from('rooms').select('id, code, admin_id, status, room_players(count)').order('id', { ascending: false }),
  );
  return rows.map(({ room_players, ...r }) => ({ ...r, players: room_players[0].count }));
}

/** Uma sala minha, ou `null` se já não estou nela. */
export async function loadRoom(roomId: number): Promise<Room | null> {
  return ok(await supabase.from('rooms').select('id, code, admin_id, status').eq('id', roomId).maybeSingle());
}

/** Jogadores da sala, por ordem de entrada. */
export async function loadRoomPlayers(roomId: number): Promise<Player[]> {
  const rows = ok(await supabase.from('room_players').select('players(id, name)').eq('room_id', roomId).order('joined_at'));
  // Relação muitos-para-um: o PostgREST devolve um objeto, mas o tipo gerado diz lista.
  return rows.map((r) => r.players as unknown as Player);
}

/** Partidas da sala que joguei (a RLS só mostra essas), da mais recente para a mais antiga. */
export async function loadGames(roomId: number): Promise<Game[]> {
  return ok(
    await supabase.from('games').select('id, start_date, status, seed').eq('room_id', roomId).order('id', { ascending: false }),
  );
}

/** Partidas a decorrer, de todas as minhas salas. */
export async function loadRunningGames(): Promise<(Game & { room_id: number })[]> {
  return ok(await supabase.from('games').select('id, room_id, start_date, status, seed').eq('status', 'running'));
}

/** As noites que já escolhi nas partidas dadas (a RLS só mostra as minhas ações). */
export async function loadMyChoices(gameIds: number[]): Promise<{ game_id: number; night: number }[]> {
  if (gameIds.length === 0) return [];
  return ok(await supabase.from('actions').select('game_id, night').in('game_id', gameIds));
}

/** Nomes dos jogadores que vejo (os das minhas salas e partidas). */
export async function loadNames(): Promise<Map<string, string>> {
  const rows: { id: string; name: string }[] = ok(await supabase.from('players').select('id, name'));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Jogadores de uma partida. */
export async function loadEnrolled(gameId: number): Promise<string[]> {
  const rows: { player_id: string }[] = ok(await supabase.from('game_players').select('player_id').eq('game_id', gameId));
  return rows.map((r) => r.player_id);
}

/** Ids das partidas com pelo menos uma noite resolvida, numa só leitura. */
export async function loadGamesWithNights(): Promise<Set<number>> {
  const rows: { game_id: number }[] = ok(await supabase.from('nights').select('game_id'));
  return new Set(rows.map((r) => r.game_id));
}

/** Noites resolvidas de uma partida (a RLS só mostra essas), por ordem. */
export async function loadNights(gameId: number): Promise<ResolvedNight[]> {
  return ok(await supabase.from('nights').select('night, summary').eq('game_id', gameId).order('night'));
}

/** Os meus movimentos numa noite (a RLS só mostra os meus). */
export async function loadMyEntries(gameId: number, night: number, userId: string): Promise<MyEntry[]> {
  return ok(
    await supabase
      .from('ledger')
      .select('delta, reason, target_id')
      .eq('game_id', gameId)
      .eq('night', night)
      .eq('player_id', userId)
      .order('id'),
  );
}

/** O meu ledger de uma partida: a RLS só mostra o meu, sempre (RULES.md §4 v5). */
export async function loadLedger(gameId: number): Promise<LedgerRow[]> {
  return ok(await supabase.from('ledger').select('night, player_id, delta, reason, target_id').eq('game_id', gameId).order('id'));
}

/** Ranking final de uma partida acabada (a RLS esconde-o durante a partida). */
export async function loadRanking(gameId: number): Promise<RankingDbRow[]> {
  return ok(await supabase.from('rankings').select('player_id, rank, points, successful_attacks').eq('game_id', gameId));
}
