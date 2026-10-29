// Dados de demonstração para testar no browser (T7b). Só no Supabase LOCAL.
//   npm run demo [-- meio|terminado|prep]   limpa a BD local e cria um ciclo nesse estado (por omissão: meio)
//   npm run demo:noite                       resolve já a noite atual (quem não escolheu joga com os bots)
//   npm run demo:dia                         avança 1 dia (passagem de noite, dia 11, ciclo seguinte)
// Os dias passam recuando o `start_date` do ciclo; cada passagem chama a Edge Function `resolve-night`,
// que resolve com o `resolveNight` do engine/ e grava como em produção.
import { createClient } from '@supabase/supabase-js';
import { NIGHTS, addDays, cycleDay, lisbonDate, mulberry32 } from '../engine/index.ts';
import type { Action, NightSummary } from '../engine/index.ts';
import { DEMO_PLAYERS, WALTER, botActions, findDemoSeed, isLocalUrl, playNights } from './demo-plan.ts';

interface Proc {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  exit(code: number): never;
}
const proc = (globalThis as { process?: Proc }).process!;

/** URL e chave service_role do Supabase local (do ambiente ou de `npx supabase status`). Nunca no web/. */
async function localSupabase(): Promise<{ url: string; key: string }> {
  let url = proc.env.SUPABASE_URL;
  let key = proc.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const { execSync } = (await import('node:child_process' as string)) as {
      execSync: (cmd: string, opts: object) => string;
    };
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    url ??= status.API_URL;
    key ??= status.SERVICE_ROLE_KEY;
  }
  if (!isLocalUrl(url)) {
    console.error(`Recuso correr: o SUPABASE_URL não é local (${url}). A demo é só para o Supabase local.`);
    proc.exit(1);
  }
  return { url: url!, key: key! };
}

const { url, key } = await localSupabase();
const db = createClient(url, key, { auth: { persistSession: false } });
const players = DEMO_PLAYERS.map((p) => p.id);
const today = () => lisbonDate(new Date());

function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<T>;
}

function authOk(res: { error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

interface Game {
  id: number;
  start_date: string;
  status: string;
}
async function latestGame(): Promise<Game | null> {
  const res = await db.from('games').select('id, start_date, status').order('id', { ascending: false }).limit(1).maybeSingle();
  if (res.error) throw new Error(`ler o ciclo: ${res.error.message}`);
  return res.data;
}

/** Passa um dia: recua o dia 1 do ciclo mais recente e chama a resolve-night. */
async function nextDay(): Promise<string[]> {
  const g = (await latestGame())!;
  ok(await db.from('games').update({ start_date: addDays(g.start_date, -1) }).eq('id', g.id), 'avançar o dia');
  const res = await fetch(`${url}/functions/v1/resolve-night`, { method: 'POST', headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`resolve-night: ${res.status} ${await res.text()} (o Supabase local tem o edge runtime? \`npx supabase start\`)`);
  const body = (await res.json()) as { done: { kind: string; night?: number }[] };
  return body.done.map((d) => `${d.kind}${d.night ?? ''}`);
}

async function choose(gameId: number, night: number, actions: Action[]) {
  if (actions.length === 0) return;
  const rows = actions.map((a) => ({ game_id: gameId, night, player_id: a.playerId, type: a.type, target_id: a.targetId ?? null }));
  ok(await db.from('actions').insert(rows), `escolher a noite ${night}`);
}

/** Limpa a BD local e cria os 6 jogadores (o Walter com o email do seed.sql). */
async function reset() {
  ok(await db.from('games').delete().gte('id', 0), 'apagar ciclos');
  const { data } = await db.auth.admin.listUsers();
  for (const u of data.users) authOk(await db.auth.admin.deleteUser(u.id), 'apagar utilizadores');
  for (const p of DEMO_PLAYERS) {
    authOk(await db.auth.admin.createUser({ id: p.id, email: p.email, email_confirm: true }), `criar ${p.name}`);
  }
  ok(await db.from('players').insert(DEMO_PLAYERS.map(({ id, name }) => ({ id, name }))), 'criar jogadores');
}

/** Ciclo novo em preparação hoje, com os inscritos dados. */
async function newCycle(enrolled: string[]): Promise<Game> {
  const g = ok(await db.from('games').insert({ start_date: today() }).select().single(), 'criar o ciclo') as Game;
  ok(await db.from('game_players').insert(enrolled.map((p) => ({ game_id: g.id, player_id: p }))), 'inscrever');
  return g;
}

/** Arranca um ciclo com os 6 e joga as noites 1 a `upTo` com os bots. */
async function playCycle(upTo: number): Promise<Game> {
  const seed = findDemoSeed(players);
  const nights = playNights(players, NIGHTS, seed);
  const g = await newCycle(players);
  console.log(`  dia 2: ${await nextDay()}`);
  for (let n = 1; n <= upTo; n++) {
    await choose(g.id, n, nights[n - 1]);
    console.log(`  noite ${n}: ${await nextDay()}`);
  }
  return g;
}

/** Os jogadores que ainda não escolheram a noite atual jogam com os bots, e a noite resolve-se já. */
async function resolveNow() {
  const g = await latestGame();
  const night = g && g.status === 'running' ? cycleDay(g.start_date, today()) - 1 : 0;
  if (!g || night < 1 || night > NIGHTS) throw new Error('Não há nenhuma noite a decorrer (npm run demo -- meio).');
  const enrolled = ok(await db.from('game_players').select('player_id').eq('game_id', g.id), 'inscritos').map((r) => r.player_id);
  const stored = ok(await db.from('actions').select('night, player_id, type, target_id').eq('game_id', g.id), 'ações');
  const history = ok(await db.from('nights').select('summary').eq('game_id', g.id).order('night'), 'noites').map(
    (r) => r.summary as NightSummary,
  );
  const toAction = (r: (typeof stored)[number]): Action => ({ playerId: r.player_id, type: r.type, targetId: r.target_id });
  const past = stored.filter((r) => r.night < night).map(toAction);
  const chosen = new Set(stored.filter((r) => r.night === night).map((r) => r.player_id));
  const missing = enrolled.filter((p) => !chosen.has(p));
  // Fora do engine/, a seed dos bots pode vir do relógio.
  await choose(g.id, night, botActions(enrolled, missing, night, history, past, mulberry32(Date.now())));
  const who = missing.length === 1 ? '1 jogador escolheu' : `${missing.length} jogadores escolheram`;
  console.log(`Noite ${night}: ${who} pelos bots. ${await nextDay()}`);
}

const MAILPIT = 'http://127.0.0.1:54324';
const command = proc.argv[2] ?? 'meio';

try {
  switch (command) {
    case 'meio': {
      await reset();
      console.log('Ciclo a meio:');
      const g = await playCycle(4);
      const night5 = playNights(players, 5, findDemoSeed(players))[4].filter((a) => a.playerId !== WALTER);
      await choose(g.id, 5, night5);
      console.log('  noite 5 a decorrer: todos escolheram menos o Walter.');
      break;
    }
    case 'terminado':
      await reset();
      console.log('Ciclo terminado:');
      await playCycle(NIGHTS);
      console.log('  dia 11: ranking final e Funcionário do Mês.');
      break;
    case 'prep':
      await reset();
      await newCycle(players.filter((p) => p !== WALTER));
      console.log('Ciclo em preparação (dia 1): 5 inscritos; o Walter pode entrar.');
      break;
    case 'noite':
      await resolveNow();
      break;
    case 'dia':
      console.log(`Mais um dia: ${(await nextDay()).join(', ') || 'nada a resolver'}.`);
      break;
    default:
      throw new Error(`Comando desconhecido: ${command} (meio, terminado, prep, noite, dia)`);
  }
  if (['meio', 'terminado', 'prep'].includes(command)) {
    console.log(`Entra como walter@nightstaff.local; o magic link chega ao Mailpit (${MAILPIT}).`);
  }
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  proc.exitCode = 1;
}
