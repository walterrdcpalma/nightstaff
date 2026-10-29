// resolve-night: chamada de hora a hora pelo pg_cron (CLAUDE.md "Resolução da noite").
// Converte a hora para Lisboa e aplica os passos que faltam ao ciclo mais recente: arrancar ou adiar a
// preparação, resolver noites, acabar o ciclo e criar o seguinte. Idempotente: correr 2 vezes não duplica nada.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { lisbonDate, nextStep, prepareNight, resolveNight } from '../../../engine/index.ts';
import type { CycleState, InvalidAction, Step, StoredAction } from '../../../engine/index.ts';

/** Limite de passos por chamada, para nunca ficar em ciclo infinito. Chega para recuperar vários ciclos. */
const MAX_STEPS = 100;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

interface Game extends CycleState {
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

async function latestGame(): Promise<Game | null> {
  const rows = check(
    await db
      .from('games')
      .select('id, start_date, status, game_players(count), nights(count)')
      .not('nights.resolved_at', 'is', null)
      .order('id', { ascending: false })
      .limit(1),
    'ler o ciclo',
  );
  const g = rows[0];
  if (!g) return null;
  return {
    id: g.id,
    startDate: g.start_date,
    status: g.status,
    players: g.game_players[0].count,
    resolvedNights: g.nights[0].count,
  };
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
  const stored: StoredAction[] = rows.map((r) => ({ night: r.night, playerId: r.player_id, type: r.type, targetId: r.target_id }));
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

async function apply(game: Game, step: Step): Promise<InvalidAction[]> {
  switch (step.kind) {
    case 'START':
      check(await db.from('games').update({ status: 'running' }).eq('id', game.id).eq('status', 'prep'), 'arrancar');
      return [];
    case 'POSTPONE':
      check(
        await db
          .from('games')
          .update({ start_date: step.startDate })
          .eq('id', game.id)
          .eq('status', 'prep')
          .eq('start_date', game.startDate),
        'adiar',
      );
      return [];
    case 'RESOLVE':
      return resolve(game, step.night);
    case 'FINISH':
      // A seed do desempate só se grava agora, para não ser conhecida durante o ciclo.
      check(
        await db.from('games').update({ status: 'finished', seed: randomSeed() }).eq('id', game.id).eq('status', 'running'),
        'acabar',
      );
      return [];
    case 'NEXT_CYCLE':
      check(await db.rpc('next_cycle', { p_game_id: game.id, p_start_date: step.startDate }), 'criar o ciclo seguinte');
      return [];
  }
}

Deno.serve(async () => {
  const today = lisbonDate(new Date());
  const done: (Step & { game: number; invalid: InvalidAction[] })[] = [];
  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const game = await latestGame();
      const step = game && nextStep(game, today);
      if (!game || !step) break;
      const invalid = await apply(game, step);
      if (invalid.length > 0) {
        // Uma ação inválida não bloqueia a noite: fica como STAY e fica no log.
        console.warn(`Ações inválidas tratadas como STAY (ciclo ${game.id}):`, JSON.stringify(invalid));
      }
      done.push({ game: game.id, ...step, invalid });
    }
  } catch (e) {
    console.error('resolve-night falhou:', e, 'feito:', JSON.stringify(done));
    return Response.json({ today, done, error: String(e) }, { status: 500 });
  }
  console.log(`resolve-night ${today}:`, JSON.stringify(done));
  return Response.json({ today, done });
});
