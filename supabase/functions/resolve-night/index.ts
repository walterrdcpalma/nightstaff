// resolve-night: chamada de hora a hora pelo pg_cron (CLAUDE.md "Resolução da noite").
// Converte a hora para Lisboa e, em cada partida a decorrer numa sala de pessoas, resolve as noites que faltam
// e acaba a partida depois da noite 9. As salas contra bots ficam de fora. Idempotente: correr 2 vezes não
// duplica nada. Não cria partidas: é o admin que começa ou reinicia a sala.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { NIGHTS, finalRanking, lisbonDate, nextStep, prepareNight, resolveNight } from '../../../engine/index.ts';
import type { GameSchedule, InvalidAction, LedgerEntry, PastAction, Step } from '../../../engine/index.ts';

/** Passos por partida e por chamada: as 9 noites e o fim. Nunca fica em ciclo infinito. */
const MAX_STEPS = NIGHTS + 1;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

interface Game extends GameSchedule {
  id: number;
}

/** Seed de 32 bits com sinal, como as colunas `integer`. O motor usa-a com `>>> 0`. */
function randomSeed(): number {
  return crypto.getRandomValues(new Int32Array(1))[0];
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Ids das partidas a decorrer em salas de pessoas. */
async function runningGames(): Promise<number[]> {
  const rows = check(
    await db.from('games').select('id, rooms!inner(kind)').eq('status', 'running').eq('rooms.kind', 'people').order('id'),
    'ler as partidas',
  );
  return rows.map((g) => g.id);
}

/** Estado de uma partida a decorrer, ou `null` se já acabou. */
async function readGame(id: number): Promise<Game | null> {
  const g = check(
    await db
      .from('games')
      .select('id, start_date, status, nights(count)')
      // Filtro sobre o recurso embebido: conta só as noites resolvidas, sem filtrar a partida.
      // Não trocar por `nights!inner`, que esconderia as partidas ainda sem noites resolvidas.
      .not('nights.resolved_at', 'is', null)
      .eq('id', id)
      .single(),
    'ler a partida',
  );
  return g.status === 'running' ? { id: g.id, startDate: g.start_date, resolvedNights: g.nights[0].count } : null;
}

async function players(gameId: number): Promise<string[]> {
  const rows = check(await db.from('game_players').select('player_id').eq('game_id', gameId), 'ler os inscritos');
  return rows.map((r) => r.player_id).sort();
}

async function resolve(game: Game, night: number): Promise<InvalidAction[]> {
  const rows = check(
    await db.from('actions').select('night, player_id, type, target_id').eq('game_id', game.id).lte('night', night),
    'ler as ações',
  );
  const stored: PastAction[] = rows.map((r) => ({ night: r.night, playerId: r.player_id, type: r.type, targetId: r.target_id }));
  const input = prepareNight(await players(game.id), stored, night);
  const seed = randomSeed();
  const { ledger, summary } = resolveNight(input.state, input.actions, seed);
  check(
    await db.rpc('apply_night', {
      p_game_id: game.id,
      p_night: night,
      p_seed: seed,
      p_summary: summary,
      p_ledger: ledger.map((e) => ({ player_id: e.playerId, delta: e.delta, reason: e.reason, target_id: e.targetId ?? null })),
    }),
    `gravar a noite ${night}`,
  );
  return input.invalid;
}

/**
 * Acaba a partida (e a sala): ranking final pelo motor (RULES.md §5), com a seed do desempate gerada só agora,
 * para não ser conhecida durante a partida. Grava o ranking em `rankings`: o ledger de cada um continua privado.
 */
async function finish(game: Game) {
  const rows = check(
    await db.from('ledger').select('player_id, delta, reason, target_id').eq('game_id', game.id).order('id'),
    'ler o ledger',
  );
  const ledger: LedgerEntry[] = rows.map((r) => ({
    playerId: r.player_id,
    delta: r.delta,
    reason: r.reason,
    ...(r.target_id && { targetId: r.target_id }),
  }));
  // Entra também quem já não está na partida mas tem movimentos.
  const everyone = [...new Set([...(await players(game.id)), ...ledger.map((e) => e.playerId)])];
  const seed = randomSeed();
  const ranking = finalRanking(everyone, ledger, seed).map((r) => ({
    player_id: r.playerId,
    rank: r.rank,
    points: r.points,
    successful_attacks: r.successfulAttacks,
  }));
  check(await db.rpc('finish_game', { p_game_id: game.id, p_seed: seed, p_ranking: ranking }), 'acabar a partida');
}

async function apply(game: Game, step: Step): Promise<InvalidAction[]> {
  switch (step.kind) {
    case 'RESOLVE':
      return resolve(game, step.night);
    case 'FINISH':
      await finish(game);
      return [];
  }
}

type Done = Step & { game: number; invalid: InvalidAction[] };

/** Faz os passos que faltam a uma partida, um de cada vez, até não haver nada a fazer. */
async function catchUp(id: number, today: string, done: Done[]) {
  for (let i = 0; ; i++) {
    const game = await readGame(id);
    const step = game && nextStep(game, today);
    if (!game || !step) return;
    if (i === MAX_STEPS) {
      console.warn(`resolve-night parou a partida ${id} ao fim de ${MAX_STEPS} passos; falta: ${JSON.stringify(step)}`);
      return;
    }
    const invalid = await apply(game, step);
    if (invalid.length > 0) {
      // Uma ação inválida não bloqueia a noite: fica como STAY e fica no log.
      console.warn(`Ações inválidas tratadas como STAY (partida ${id}):`, JSON.stringify(invalid));
    }
    done.push({ game: id, ...step, invalid });
  }
}

Deno.serve(async () => {
  const today = lisbonDate(new Date());
  const done: Done[] = [];
  const errors: { game?: number; error: string }[] = [];
  try {
    // Uma partida com erro não impede as outras de serem resolvidas.
    for (const id of await runningGames()) {
      try {
        await catchUp(id, today, done);
      } catch (e) {
        errors.push({ game: id, error: String(e) });
      }
    }
  } catch (e) {
    errors.push({ error: String(e) });
  }
  if (errors.length > 0) {
    console.error('resolve-night falhou:', JSON.stringify(errors), 'feito:', JSON.stringify(done));
    return Response.json({ today, done, errors }, { status: 500 });
  }
  console.log(`resolve-night ${today}:`, JSON.stringify(done));
  return Response.json({ today, done });
});
