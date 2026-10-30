// T8 — Revisão final de segurança: os testes de RLS repetidos com o web real. Usa o próprio cliente do web
// (`web/src/lib/supabase.ts`, só com a chave pública) e as leituras do `web/src/lib/data.ts`, com sessões reais de
// 2 jogadores na mesma sala (Ana e Bruno, mais a Carla para chegar a 3) e de uma jogadora noutra sala (Eva).
// Critérios (CLAUDE.md, "Revisão final"): nenhuma ação de outro jogador é legível antes da resolução, e nenhuma
// pontuação de outro jogador é legível antes do fim da partida. Corre com `npm run test:db`.
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NIGHTS, addDays } from '../../engine/index.ts';

const enabled = !!process.env.SUPABASE_E2E;

let url = '';
let serviceKey = '';
type Web = typeof import('../../web/src/lib/data.ts');
type Client = typeof import('../../web/src/lib/supabase.ts')['supabase'];
let web: Web;
let supabase: Client;

/** Só o setup e o relógio usam a service_role (como a resolve-night); o que se testa usa o cliente do web. */
async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Entra no web como `email` (magic link), saindo da sessão anterior. */
async function signInAs(email: string) {
  await supabase.auth.signOut();
  const link = await admin('auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: link.hashed_token });
  if (error) throw error;
}

/** Tudo o que o browser consegue ler de uma tabela, sem filtros. */
async function everything(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data;
}

const TABLES = ['players', 'rooms', 'room_players', 'games', 'game_players', 'actions', 'nights', 'ledger', 'rankings'];

describe.skipIf(!enabled)('RLS com o web real (T8)', () => {
  const users: Record<'ana' | 'bruno' | 'carla' | 'eva', { id: string; email: string }> = {
    ana: { id: '', email: '' },
    bruno: { id: '', email: '' },
    carla: { id: '', email: '' },
    eva: { id: '', email: '' },
  };
  let roomId: number;
  let evaRoomId: number;
  let gameId: number;

  /** Passa `days` dias na partida e chama a resolve-night, como o pg_cron. */
  async function passDays(days: number) {
    const [g] = await admin(`rest/v1/games?id=eq.${gameId}`);
    await admin(`rest/v1/games?id=eq.${gameId}`, { method: 'PATCH', body: JSON.stringify({ start_date: addDays(g.start_date, -days) }) });
    await admin('functions/v1/resolve-night', { method: 'POST', body: '{}' });
  }

  beforeAll(async () => {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
    url = status.API_URL;
    serviceKey = status.SERVICE_ROLE_KEY;
    if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Só no Supabase local: ${url}`);
    // O web lê o URL e a chave pública do ambiente (web/.env.local); aqui, os do Supabase local.
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', status.ANON_KEY);
    ({ supabase } = await import('../../web/src/lib/supabase.ts'));
    web = await import('../../web/src/lib/data.ts');

    for (const name of Object.keys(users) as (keyof typeof users)[]) {
      const user = await admin('auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: `${name}-web-${Date.now()}@e2e.local`, email_confirm: true }),
      });
      users[name] = { id: user.id, email: user.email };
    }

    // Tudo pelo web: o nome no primeiro login, criar a sala, entrar com o código e Começar.
    for (const name of Object.keys(users) as (keyof typeof users)[]) {
      await signInAs(users[name].email);
      expect((await supabase.from('players').insert({ id: users[name].id, name })).error).toBeNull();
    }
    await signInAs(users.eva.email);
    evaRoomId = (await supabase.rpc('create_room')).data.id;
    await signInAs(users.ana.email);
    const room = (await supabase.rpc('create_room')).data;
    roomId = room.id;
    for (const name of ['bruno', 'carla'] as const) {
      await signInAs(users[name].email);
      expect((await supabase.rpc('join_room', { p_code: room.code })).error).toBeNull();
    }
    await signInAs(users.ana.email);
    gameId = (await supabase.rpc('start_room', { p_room_id: roomId })).data;
  });

  afterAll(async () => {
    if (!url) return;
    await supabase?.auth.signOut();
    for (const id of [roomId, evaRoomId]) if (id) await admin(`rest/v1/rooms?id=eq.${id}`, { method: 'DELETE' });
    for (const u of Object.values(users)) if (u.id) await admin(`auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
    vi.unstubAllEnvs();
  });

  it('antes da resolução, ninguém lê a ação de outro jogador', async () => {
    // O Bruno escolhe pelo ecrã Hoje (o mesmo upsert): Visita surpresa à Ana.
    await signInAs(users.bruno.email);
    const chosen = await supabase
      .from('actions')
      .upsert({ game_id: gameId, night: 1, player_id: users.bruno.id, type: 'ATTACK', target_id: users.ana.id }, {
        onConflict: 'game_id,night,player_id',
      });
    expect(chosen.error).toBeNull();
    expect(await web.loadMyActions(gameId)).toEqual([{ night: 1, type: 'ATTACK', target_id: users.ana.id }]);

    // A Ana, na mesma partida, não a vê: nem pelas leituras do web, nem a pedir a tabela inteira.
    await signInAs(users.ana.email);
    expect(await web.loadMyActions(gameId)).toEqual([]);
    expect(await everything('actions')).toEqual([]);
    expect((await supabase.from('actions').select('*').eq('player_id', users.bruno.id)).data).toEqual([]);
    // Nem tenta mudá-la: a RLS esconde a linha, e nada muda.
    const forged = await supabase.from('actions').update({ type: 'STAY', target_id: null }).eq('player_id', users.bruno.id).select();
    expect(forged.data ?? []).toEqual([]);
    // Ainda não há noites resolvidas, nem pontos de ninguém.
    expect(await web.loadNights(gameId)).toEqual([]);
    expect(await everything('ledger')).toEqual([]);
  });

  it('depois da resolução, só os próprios pontos; o resumo é só casa/fora e apanhados', async () => {
    await passDays(1);
    for (const me of ['ana', 'bruno', 'carla'] as const) {
      await signInAs(users[me].email);
      const ledger = await web.loadLedger(gameId);
      expect(ledger.length).toBeGreaterThan(0);
      for (const e of ledger) expect(e.player_id).toBe(users[me].id);
      expect(await everything('ledger')).toHaveLength(ledger.length);
      for (const a of await everything('actions')) expect(a.player_id).toBe(users[me].id);
      expect(await web.loadRanking(gameId)).toEqual([]);
      const [night] = await web.loadNights(gameId);
      expect(Object.keys(night.summary).sort()).toEqual(['caught', 'players']);
      for (const p of night.summary.players) expect(Object.keys(p).sort()).toEqual(['location', 'playerId']);
    }
    // A Ana foi atacada, mas não sabe por quem: o seu ledger só tem a sua linha.
    await signInAs(users.ana.email);
    expect((await web.loadLedger(gameId)).map((e) => [e.reason, e.target_id])).toEqual([['VICTIM', null]]);
  });

  it('a Eva, noutra sala, não lê nada da sala da Ana', async () => {
    await signInAs(users.eva.email);
    expect((await web.loadRooms()).map((r) => r.id)).toEqual([evaRoomId]);
    expect(await web.loadGames(roomId)).toEqual([]);
    expect(await web.loadRoom(roomId)).toBeNull();
    expect(await web.loadRoomPlayers(roomId)).toEqual([]);
    expect(await web.loadNights(gameId)).toEqual([]);
    expect(await web.loadEnrolled(gameId)).toEqual([]);
    expect([...(await web.loadNames()).keys()]).toEqual([users.eva.id]);
    for (const table of ['games', 'game_players', 'actions', 'nights', 'ledger', 'rankings']) expect(await everything(table)).toEqual([]);
  });

  it('no fim da partida, o ranking aparece a quem jogou, e o ledger e as ações dos outros nunca', async () => {
    // Passam as noites que faltam: a resolve-night resolve-as todas e acaba a partida numa só chamada.
    await passDays(NIGHTS);
    await signInAs(users.ana.email);
    const ranking = await web.loadRanking(gameId);
    expect(ranking.map((r) => r.player_id).sort()).toEqual([users.ana.id, users.bruno.id, users.carla.id].sort());
    for (const e of await everything('ledger')) expect(e.player_id).toBe(users.ana.id);
    for (const a of await everything('actions')) expect(a.player_id).toBe(users.ana.id);
    await signInAs(users.eva.email);
    expect(await everything('rankings')).toEqual([]);
  });

  it('sem sessão (só a chave pública), não se lê nada', async () => {
    await supabase.auth.signOut();
    for (const table of TABLES) expect(await everything(table)).toEqual([]);
    expect((await supabase.rpc('create_room')).error).not.toBeNull();
  });
});
