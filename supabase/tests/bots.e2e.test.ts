// Uma partida inteira contra 3 bots no Supabase local (T11, RULES.md §1.2): só com ⏭️ Passar o dia, como o
// browser o chama (chave pública + JWT do jogador). Corre com `npm run test:db`; no `npm test` fica em skip.
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NIGHTS } from '../../engine/index.ts';

const enabled = !!process.env.SUPABASE_E2E;

let url = '';
let key = '';
let anonKey = '';

async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const tokens = new Map<string, string>();
async function tokenOf(email: string): Promise<string> {
  if (!tokens.has(email)) {
    const link = await admin('auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
    const session = await fetch(`${url}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    }).then((r) => r.json());
    tokens.set(email, session.access_token);
  }
  return tokens.get(email)!;
}

/** Pedido como o jogador (chave pública + o seu JWT). */
async function as(email: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/${path}`, {
    ...init,
    headers: { apikey: anonKey, Authorization: `Bearer ${await tokenOf(email)}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** ⏭️ Passar o dia, como o browser (`supabase.functions.invoke`). */
const passDay = (email: string, roomId: number, night: number) =>
  as(email, 'functions/v1/resolve-night', { method: 'POST', body: JSON.stringify({ room_id: roomId, night }) });

describe.skipIf(!enabled)('uma partida contra 3 bots no Supabase local', () => {
  const users: Record<'ana' | 'bruno', { id: string; email: string }> = { ana: { id: '', email: '' }, bruno: { id: '', email: '' } };
  let room: { id: number; code: string };
  let gameId: number;
  let bots: string[];

  beforeAll(async () => {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
    url = status.API_URL;
    key = status.SERVICE_ROLE_KEY;
    anonKey = status.ANON_KEY;
    if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Só no Supabase local: ${url}`);
    for (const name of ['ana', 'bruno'] as const) {
      const user = await admin('auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: `${name}-bots-${Date.now()}@e2e.local`, email_confirm: true }),
      });
      users[name] = { id: user.id, email: user.email };
      await admin('rest/v1/players', { method: 'POST', body: JSON.stringify({ id: user.id, name }) });
    }
  });

  afterAll(async () => {
    if (!url) return;
    if (room) await admin(`rest/v1/rooms?id=eq.${room.id}`, { method: 'DELETE' });
    for (const u of Object.values(users)) if (u.id) await admin(`auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  });

  it('a Ana cria uma sala contra 3 bots, que começa logo na noite 1', async () => {
    const created = await as(users.ana.email, 'rest/v1/rpc/create_bots_room', { method: 'POST', body: JSON.stringify({ p_bots: 3 }) });
    expect(created.status).toBe(200);
    room = created.body;
    expect(room).toMatchObject({ kind: 'bots', status: 'running' });
    const [game] = await admin(`rest/v1/games?room_id=eq.${room.id}`);
    gameId = game.id;
    const players: { player_id: string; players: { name: string; bot_room_id: number | null } }[] = await admin(
      `rest/v1/game_players?game_id=eq.${gameId}&select=player_id,players(name,bot_room_id)`,
    );
    bots = players.filter((p) => p.players.bot_room_id === room.id).map((p) => p.player_id);
    expect(players.map((p) => p.players.name).sort()).toEqual(['Bot Cozinheira', 'Bot Porteiro', 'Bot Rececionista', 'ana']);
    expect(bots).toHaveLength(3);
  });

  it('o browser pode chamar a função (CORS)', async () => {
    const res = await fetch(`${url}/functions/v1/resolve-night`, { method: 'OPTIONS' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    await res.text();
  });

  it('só a admin passa o dia, e só a noite aberta', async () => {
    expect((await passDay(users.bruno.email, room.id, 1)).body).toEqual({ error: 'ROOM_NOT_FOUND' });
    expect((await passDay(users.ana.email, room.id, 2)).body).toEqual({ error: 'NIGHT_CHANGED', night: 1 });
  });

  it('9 noites só com Passar o dia: os bots escolhem ao calhas e dentro das regras; o relógio não conta', async () => {
    for (let night = 1; night <= NIGHTS; night++) {
      // A Ana visita um bot na noite 1 e fica de Folga no resto (sem escolha).
      if (night === 1) {
        const chosen = await as(users.ana.email, 'rest/v1/actions', {
          method: 'POST',
          body: JSON.stringify({ game_id: gameId, night, player_id: users.ana.id, type: 'ATTACK', target_id: bots[0] }),
        });
        expect(chosen.status).toBe(201);
      }
      const res = await passDay(users.ana.email, room.id, night);
      expect(res.status).toBe(200);
      const kinds = res.body.done.map((d: { kind: string }) => d.kind);
      expect(kinds).toEqual(night === NIGHTS ? ['RESOLVE', 'FINISH'] : ['RESOLVE']);
      for (const d of res.body.done) expect(d.invalid).toEqual([]);

      // Um duplo toque não salta a noite seguinte.
      if (night === 1) expect((await passDay(users.ana.email, room.id, 1)).body).toEqual({ error: 'NIGHT_CHANGED', night: 2 });
      // O pg_cron não mexe nas salas contra bots.
      if (night === 3) {
        const tick = await admin('functions/v1/resolve-night', { method: 'POST', body: '{}' });
        expect(tick.done.filter((d: { game: number }) => d.game === gameId)).toEqual([]);
      }
    }
    const actions: { night: number; player_id: string }[] = await admin(`rest/v1/actions?game_id=eq.${gameId}`);
    for (const bot of bots) expect(actions.filter((a) => a.player_id === bot)).toHaveLength(NIGHTS);
  });

  it('acaba com o ranking final e o Funcionário do Mês, que a Ana vê', async () => {
    expect((await admin(`rest/v1/rooms?id=eq.${room.id}`))[0].status).toBe('finished');
    const ledger: { player_id: string; delta: number }[] = await admin(`rest/v1/ledger?game_id=eq.${gameId}`);
    const total = (id: string) => ledger.filter((e) => e.player_id === id).reduce((s, e) => s + e.delta, 0);
    const seen = await as(users.ana.email, `rest/v1/rankings?game_id=eq.${gameId}&order=rank`);
    expect(seen.body.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3, 4]);
    for (const r of seen.body) expect(r.points).toBe(50 + total(r.player_id));
    expect(await passDay(users.ana.email, room.id, NIGHTS + 1)).toMatchObject({ body: { error: 'NOT_BOTS_NIGHT' } });
  });

  it('os bots não aparecem a mais ninguém', async () => {
    const seen = await as(users.bruno.email, 'rest/v1/players?select=id');
    expect(seen.body.map((p: { id: string }) => p.id)).toEqual([users.bruno.id]);
  });
});
