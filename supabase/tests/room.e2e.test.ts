// Uma sala inteira no Supabase local (T4, salas na T9): criar, entrar com o código, começar, 9 noites,
// resolução e reinício. Corre com `npm run test:db` (precisa de `npx supabase start`). No `npm test` fica em skip.
// O tempo avança recuando o `start_date` da partida um dia de cada vez: a função e o prazo da BD usam a hora real.
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, lisbonDate, nightOn } from '../../engine/index.ts';

const enabled = !!process.env.SUPABASE_E2E;

let url = '';
let key = '';
let anonKey = '';
const headers = () => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

async function call(base: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/${base}/${path}`, {
    ...init,
    headers: { ...headers(), Prefer: 'return=representation', ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const rest = (path: string, init?: RequestInit) => call('rest/v1', path, init);
const post = (path: string, body: unknown) => rest(path, { method: 'POST', body: JSON.stringify(body) });

/** Sessão de um jogador (o JWT que o browser teria), por magic link. */
const sessions = new Map<string, string>();
async function tokenOf(email: string): Promise<string> {
  if (!sessions.has(email)) {
    const link = await call('auth/v1', 'admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
    const session = await fetch(`${url}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    }).then((r) => r.json());
    sessions.set(email, session.access_token);
  }
  return sessions.get(email)!;
}

/** Chama uma função da sala como o jogador (chave pública + o seu JWT). Um erro devolve o código. */
async function rpcAs(email: string, fn: string, args: Record<string, unknown> = {}): Promise<{ data?: unknown; error?: string }> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${await tokenOf(email)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  // As funções sem resultado (leave_room, restart_room) respondem 204, sem corpo.
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return res.ok ? { data: body } : { error: body.message };
}

const TABLES = ['players', 'rooms', 'room_players', 'games', 'game_players', 'actions', 'nights', 'ledger', 'rankings'];

/**
 * Tudo o que a API devolve a um jogador com sessão (chave pública + o seu JWT), tabela a tabela, sem filtros:
 * é o que um browser malicioso conseguiria ler.
 */
async function everythingAs(email: string): Promise<Record<string, Record<string, unknown>[]>> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of TABLES) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${await tokenOf(email)}` },
    });
    expect(res.ok).toBe(true);
    out[table] = await res.json();
  }
  return out;
}

/** O que só pode ser do próprio jogador, ou público pelo RULES.md §4 v5. */
function expectNothingPrivateOfOthers(seen: Record<string, Record<string, unknown>[]>, me: string, finished: boolean) {
  for (const a of seen.actions) expect(a.player_id).toBe(me);
  for (const e of seen.ledger) expect(e.player_id).toBe(me);
  for (const n of seen.nights) {
    const summary = n.summary as { players: Record<string, unknown>[] };
    expect(Object.keys(summary).sort()).toEqual(['caught', 'players']);
    for (const p of summary.players) expect(Object.keys(p).sort()).toEqual(['location', 'playerId']);
  }
  if (!finished) expect(seen.rankings).toEqual([]);
  for (const r of seen.rankings) expect(Object.keys(r).sort()).toEqual(['game_id', 'player_id', 'points', 'rank', 'successful_attacks']);
}

/** Chama a resolve-night e devolve os passos feitos. */
async function tick(): Promise<{ kind: string; game: number; night?: number; invalid: { error: string }[] }[]> {
  const res = await call('functions/v1', 'resolve-night', { method: 'POST', body: '{}' });
  return res.done;
}

interface Game {
  id: number;
  room_id: number;
  start_date: string;
  status: string;
  seed: number | null;
}
const gameOf = async (roomId: number): Promise<Game> => (await rest(`games?room_id=eq.${roomId}&order=id.desc&limit=1`))[0];
const today = () => lisbonDate(new Date());

const ledger = async (gameId: number, night: number) =>
  ((await rest(`ledger?game_id=eq.${gameId}&night=eq.${night}`)) as { player_id: string; delta: number; reason: string }[])
    .map((e) => ({ player_id: e.player_id, delta: e.delta, reason: e.reason }))
    .sort((a, b) => a.player_id.localeCompare(b.player_id) || a.reason.localeCompare(b.reason));

describe.skipIf(!enabled)('uma sala no Supabase local', () => {
  const ids: Record<'ana' | 'bruno' | 'carla' | 'dina' | 'eva', string> = { ana: '', bruno: '', carla: '', dina: '', eva: '' };
  const emails: Record<string, string> = {};
  let room: { id: number; code: string };
  let game: Game;

  /** Passa um dia: recua a noite 1 da partida. */
  async function nextDay() {
    const g = await gameOf(room.id);
    await rest(`games?id=eq.${g.id}`, { method: 'PATCH', body: JSON.stringify({ start_date: addDays(g.start_date, -1) }) });
  }

  /** Escolhe a ação de um jogador para a noite atual (passa pelo trigger de validação). */
  async function choose(playerId: string, type: string, targetId: string | null = null) {
    const g = await gameOf(room.id);
    await post('actions', { game_id: g.id, night: nightOn(g.start_date, today()), player_id: playerId, type, target_id: targetId });
  }

  beforeAll(async () => {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
    url = status.API_URL;
    key = status.SERVICE_ROLE_KEY;
    anonKey = status.ANON_KEY;
    if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Só no Supabase local: ${url}`);

    await rest('rooms?id=gte.0', { method: 'DELETE' });
    for (const name of Object.keys(ids) as (keyof typeof ids)[]) {
      const user = await call('auth/v1', 'admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: `${name}-${Date.now()}@e2e.local`, email_confirm: true }),
      });
      ids[name] = user.id;
      emails[name] = user.email;
    }
  });

  afterAll(async () => {
    if (!url) return;
    await rest('rooms?id=gte.0', { method: 'DELETE' });
    for (const id of Object.values(ids)) if (id) await call('auth/v1', `admin/users/${id}`, { method: 'DELETE' });
  });

  it('primeiro login: sem nome não há salas; cada um cria o seu jogador com o nome', async () => {
    expect(await rpcAs(emails.ana, 'create_room')).toEqual({ error: 'NO_NAME' });
    for (const name of Object.keys(ids) as (keyof typeof ids)[]) {
      const res = await fetch(`${url}/rest/v1/players`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${await tokenOf(emails[name])}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ids[name], name }),
      });
      expect(res.status).toBe(201);
    }
  });

  it('a Ana cria a sala e os outros entram com o código; só a admin começa, e com 3 ou mais', async () => {
    room = (await rpcAs(emails.ana, 'create_room')).data as { id: number; code: string };
    expect(room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    expect(await rpcAs(emails.bruno, 'join_room', { p_code: room.code.toLowerCase() })).toEqual({ data: room.id });
    expect(await rpcAs(emails.ana, 'start_room', { p_room_id: room.id })).toEqual({ error: 'TOO_FEW_PLAYERS' });
    for (const p of ['carla', 'dina']) expect(await rpcAs(emails[p], 'join_room', { p_code: room.code })).toEqual({ data: room.id });
    expect(await rpcAs(emails.bruno, 'start_room', { p_room_id: room.id })).toEqual({ error: 'NOT_ADMIN' });
    expect(await tick()).toEqual([]);
  });

  it('Começar: a noite 1 abre já, hoje, e não há nada a resolver', async () => {
    const started = await rpcAs(emails.ana, 'start_room', { p_room_id: room.id });
    game = await gameOf(room.id);
    expect(started).toEqual({ data: game.id });
    expect(game).toMatchObject({ status: 'running', start_date: today(), seed: null });
    expect(await rpcAs(emails.eva, 'join_room', { p_code: room.code })).toEqual({ error: 'ROOM_NOT_IN_LOBBY' });
    expect(await tick()).toEqual([]);
  });

  it('a Eva, fora da sala, não vê nada dela', async () => {
    const seen = await everythingAs(emails.eva);
    expect(seen.players.map((p) => p.id)).toEqual([ids.eva]);
    for (const table of TABLES.filter((t) => t !== 'players')) expect(seen[table]).toEqual([]);
  });

  it('noite 1: resolve uma só vez, mesmo com 2 chamadas ao mesmo tempo', async () => {
    await choose(ids.ana, 'ATTACK', ids.bruno);
    await choose(ids.carla, 'DEFEND');
    await nextDay();
    await Promise.all([tick(), tick()]);
    expect(await tick()).toEqual([]);

    expect(await ledger(game.id, 1)).toEqual(
      [
        { player_id: ids.ana, delta: 10, reason: 'ATTACK_SUCCESS' },
        { player_id: ids.bruno, delta: -10, reason: 'VICTIM' },
        { player_id: ids.carla, delta: 2, reason: 'HOME_BONUS' },
        { player_id: ids.dina, delta: 2, reason: 'HOME_BONUS' },
      ].sort((a, b) => a.player_id.localeCompare(b.player_id)),
    );
    const [night] = await rest(`nights?game_id=eq.${game.id}&night=eq.1`);
    expect(night.resolved_at).not.toBeNull();
    expect(JSON.stringify(night.summary)).not.toMatch(/delta|points/);
  });

  it('noite 2: ação inválida fica como STAY, com log, e não bloqueia a noite', async () => {
    await choose(ids.ana, 'ATTACK', ids.carla);
    await choose(ids.carla, 'STAY');
    // A Carla sai da partida depois de escolhida a ação (só a service_role o pode fazer a meio).
    await rest(`game_players?game_id=eq.${game.id}&player_id=eq.${ids.carla}`, { method: 'DELETE' });
    await nextDay();

    const done = await tick();
    expect(done.map((s) => [s.game, s.kind, s.night])).toEqual([[game.id, 'RESOLVE', 2]]);
    expect(done[0].invalid.map((i) => i.error).sort()).toEqual(['UNKNOWN_PLAYER', 'UNKNOWN_TARGET']);
    expect((await ledger(game.id, 2)).map((e) => [e.delta, e.reason])).toEqual([
      [2, 'HOME_BONUS'],
      [2, 'HOME_BONUS'],
      [2, 'HOME_BONUS'],
    ]);
  });

  it('a meio da partida, a API não dá à Ana nada privado dos outros, nem nada da sala da Eva', async () => {
    const eva = (await rpcAs(emails.eva, 'create_room')).data as { id: number };
    // O Bruno já escolheu a noite 3 (Segurança: sem ataques, dá o mesmo bónus que a Folga): a Ana não o pode ver.
    await choose(ids.bruno, 'DEFEND');
    const seen = await everythingAs(emails.ana);
    expectNothingPrivateOfOthers(seen, ids.ana, false);
    expect(seen.actions.length).toBeGreaterThan(0);
    expect(seen.ledger.length).toBeGreaterThan(0);
    expect(seen.nights).toHaveLength(2);
    expect(seen.rooms.map((r) => r.id)).toEqual([room.id]);
    expect(seen.players.map((p) => p.id)).not.toContain(ids.eva);
    expect(seen.room_players.map((r) => r.room_id)).not.toContain(eva.id);
  });

  it('noites 3 a 8 sem ações: todos em Folga', async () => {
    for (let n = 3; n <= 8; n++) {
      await nextDay();
      expect((await tick()).map((s) => [s.kind, s.night])).toEqual([['RESOLVE', n]]);
    }
  });

  it('noite 9: conta a dobrar e a partida e a sala acabam, com a seed do desempate', async () => {
    await choose(ids.bruno, 'ATTACK', ids.ana);
    await nextDay();
    expect((await tick()).map((s) => [s.kind, s.night])).toEqual([['RESOLVE', 9], ['FINISH', undefined]]);
    expect(await gameOf(room.id)).toMatchObject({ id: game.id, status: 'finished' });
    expect((await gameOf(room.id)).seed).not.toBeNull();
    expect((await rest(`rooms?id=eq.${room.id}`))[0].status).toBe('finished');
    expect((await ledger(game.id, 9)).map((e) => e.delta).sort((a, b) => a - b)).toEqual([-20, 4, 20]);

    const all: { player_id: string; delta: number }[] = await rest(`ledger?game_id=eq.${game.id}`);
    const total = (id: string) => all.filter((e) => e.player_id === id).reduce((s, e) => s + e.delta, 0);
    expect([total(ids.ana), total(ids.bruno), total(ids.carla), total(ids.dina)]).toEqual([
      10 + 2 + 6 * 2 - 20,
      -10 + 2 + 6 * 2 + 20,
      2,
      2 + 2 + 6 * 2 + 4,
    ]);
    expect(await rest(`nights?game_id=eq.${game.id}&resolved_at=not.is.null&select=night`)).toHaveLength(9);

    // Ranking final gravado pela resolve-night (o ledger continua privado); a Carla saiu a meio e entra.
    const ranking: { player_id: string; rank: number; points: number }[] = await rest(`rankings?game_id=eq.${game.id}&order=rank`);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranking.map((r) => r.player_id).sort()).toEqual([ids.ana, ids.bruno, ids.carla, ids.dina].sort());
    for (const r of ranking) expect(r.points).toBe(50 + total(r.player_id));
  });

  it('depois do fim, nada a fazer: não se cria outra partida, e as salas contra bots ficam de fora', async () => {
    const [bots] = await post('rooms', { admin_id: ids.eva, kind: 'bots', status: 'running' });
    const [botsGame] = await post('games', { room_id: bots.id, start_date: addDays(today(), -5) });
    await nextDay();
    expect(await tick()).toEqual([]);
    expect(await rest(`nights?game_id=eq.${botsGame.id}`)).toEqual([]);
    expect(await rest(`games?room_id=eq.${room.id}&select=id`)).toEqual([{ id: game.id }]);
  });

  it('no fim, a API dá à Ana o ranking final, mas nunca o ledger nem as ações dos outros; a Eva continua sem ver nada', async () => {
    const seen = await everythingAs(emails.ana);
    expectNothingPrivateOfOthers(seen, ids.ana, true);
    expect(seen.rankings).toHaveLength(4);
    expect((await everythingAs(emails.eva)).rankings).toEqual([]);
  });

  it('a admin reinicia: lobby com o mesmo código e os mesmos jogadores, sem partida nova até Começar', async () => {
    expect(await rpcAs(emails.bruno, 'restart_room', { p_room_id: room.id })).toEqual({ error: 'NOT_ADMIN' });
    expect(await rpcAs(emails.ana, 'restart_room', { p_room_id: room.id })).toEqual({ data: null });
    expect((await rest(`rooms?id=eq.${room.id}`))[0]).toMatchObject({ status: 'lobby', code: room.code });
    expect(await rest(`room_players?room_id=eq.${room.id}`)).toHaveLength(4);
    expect(await tick()).toEqual([]);
    expect(await rpcAs(emails.eva, 'join_room', { p_code: room.code })).toEqual({ data: room.id });
  });
});
