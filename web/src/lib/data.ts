// Leituras partilhadas pelos ecrãs, como o jogador com sessão (RLS). Um erro lança: o ecrã mostra-o.
import type { NightSummary } from '../../../engine/index.ts';
import type { MyEntry } from './night.ts';
import { supabase } from './supabase.ts';
import type { GameStatus } from './today.ts';

export interface Game {
  id: number;
  start_date: string;
  status: GameStatus;
}

export interface ResolvedNight {
  night: number;
  summary: NightSummary;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Ciclos, do mais recente para o mais antigo. */
export async function loadGames(): Promise<Game[]> {
  return ok(await supabase.from('games').select('id, start_date, status').order('id', { ascending: false }));
}

/** Nomes de todos os jogadores. */
export async function loadNames(): Promise<Map<string, string>> {
  const rows: { id: string; name: string }[] = ok(await supabase.from('players').select('id, name'));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Inscritos num ciclo. */
export async function loadEnrolled(gameId: number): Promise<string[]> {
  const rows: { player_id: string }[] = ok(await supabase.from('game_players').select('player_id').eq('game_id', gameId));
  return rows.map((r) => r.player_id);
}

/** Noites resolvidas de um ciclo (a RLS só mostra essas), por ordem. */
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
