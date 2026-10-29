// Ciclo inteiro no Supabase local (T4): preparação adiada, 9 noites, resolução e ciclo seguinte.
// Corre com `npm run test:db` (precisa de `npx supabase start`). No `npm test` fica em skip.
// O tempo avança recuando o `start_date` do ciclo um dia de cada vez: a função e o prazo da BD usam a hora real.
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, cycleDay, lisbonDate } from '../../engine/index.ts';

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

/**
 * Tudo o que a API devolve a um jogador com sessão (chave pública + o seu JWT), tabela a tabela, sem filtros:
 * é o que um browser malicioso conseguiria ler.
 */
async function everythingAs(email: string): Promise<Record<string, Record<string, unknown>[]>> {
  const link = await call('auth/v1', 'admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
  const session = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  }).then((r) => r.json());
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of ['players', 'games', 'game_players', 'actions', 'nights', 'ledger', 'rankings']) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
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
async function tick(): Promise<{ kind: string; night?: number; invalid: { error: string }[] }[]> {
  const res = await call('functions/v1', 'resolve-night', { method: 'POST', body: '{}' });
  return res.done;
}

interface Game {
  id: number;
  start_date: string;
  status: string;
  seed: number | null;
}
const latest = async (): Promise<Game> => (await rest('games?order=id.desc&limit=1'))[0];
const today = () => lisbonDate(new Date());

/** Passa um dia: recua o dia 1 do ciclo mais recente. */
async function nextDay() {
  const g = await latest();
  await rest(`games?id=eq.${g.id}`, { method: 'PATCH', body: JSON.stringify({ start_date: addDays(g.start_date, -1) }) });
}

/** Escolhe a ação de um jogador para a noite atual (passa pelo trigger de validação). */
async function choose(playerId: string, type: string, targetId: string | null = null) {
  const g = await latest();
  const night = cycleDay(g.start_date, today()) - 1;
  await post('actions', { game_id: g.id, night, player_id: playerId, type, target_id: targetId });
}

const ledger = async (gameId: number, night: number) =>
  ((await rest(`ledger?game_id=eq.${gameId}&night=eq.${night}`)) as { player_id: string; delta: number; reason: string }[])
    .map((e) => ({ player_id: e.player_id, delta: e.delta, reason: e.reason }))
    .sort((a, b) => a.player_id.localeCompare(b.player_id) || a.reason.localeCompare(b.reason));

describe.skipIf(!enabled)('resolve-night no Supabase local', () => {
  const ids: Record<'ana' | 'bruno' | 'carla' | 'dina', string> = { ana: '', bruno: '', carla: '', dina: '' };
  const emails: Record<string, string> = {};
  let first: Game;

  beforeAll(async () => {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
    url = status.API_URL;
    key = status.SERVICE_ROLE_KEY;
    anonKey = status.ANON_KEY;
    if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Só no Supabase local: ${url}`);

    await rest('games?id=gte.0', { method: 'DELETE' });
    for (const name of Object.keys(ids) as (keyof typeof ids)[]) {
      const user = await call('auth/v1', 'admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: `${name}-${Date.now()}@e2e.local`, email_confirm: true }),
      });
      ids[name] = user.id;
      emails[name] = user.email;
      await post('players', { id: user.id, name });
    }
    [first] = await post('games', { start_date: today() });
    await post('game_players', [{ game_id: first.id, player_id: ids.ana }, { game_id: first.id, player_id: ids.bruno }]);
  });

  afterAll(async () => {
    if (!url) return;
    await rest('games?id=gte.0', { method: 'DELETE' });
    for (const id of Object.values(ids)) if (id) await call('auth/v1', `admin/users/${id}`, { method: 'DELETE' });
  });

  it('dia 1: nada a fazer', async () => {
    expect(await tick()).toEqual([]);
  });

  it('dia 2 com 2 inscritos: a preparação repete-se no dia seguinte', async () => {
    await nextDay();
    expect((await tick()).map((s) => s.kind)).toEqual(['POSTPONE']);
    expect(await latest()).toMatchObject({ id: first.id, start_date: today(), status: 'prep' });
  });

  it('dia 2 com 4 inscritos: arranca, sem seed do ciclo', async () => {
    await post('game_players', [{ game_id: first.id, player_id: ids.carla }, { game_id: first.id, player_id: ids.dina }]);
    await nextDay();
    expect((await tick()).map((s) => s.kind)).toEqual(['START']);
    expect(await latest()).toMatchObject({ status: 'running', seed: null });
  });

  it('noite 1: resolve uma só vez, mesmo com 2 chamadas ao mesmo tempo', async () => {
    await choose(ids.ana, 'ATTACK', ids.bruno);
    await choose(ids.carla, 'DEFEND');
    await nextDay();
    await Promise.all([tick(), tick()]);
    expect(await tick()).toEqual([]);

    expect(await ledger(first.id, 1)).toEqual(
      [
        { player_id: ids.ana, delta: 10, reason: 'ATTACK_SUCCESS' },
        { player_id: ids.bruno, delta: -10, reason: 'VICTIM' },
        { player_id: ids.carla, delta: 2, reason: 'HOME_BONUS' },
        { player_id: ids.dina, delta: 2, reason: 'HOME_BONUS' },
      ].sort((a, b) => a.player_id.localeCompare(b.player_id)),
    );
    const [night] = await rest(`nights?game_id=eq.${first.id}&night=eq.1`);
    expect(night.resolved_at).not.toBeNull();
    expect(JSON.stringify(night.summary)).not.toMatch(/delta|points/);
  });

  it('noite 2: ação inválida fica como STAY, com log, e não bloqueia a noite', async () => {
    await choose(ids.ana, 'ATTACK', ids.carla);
    await choose(ids.carla, 'STAY');
    // A Carla sai do ciclo depois de escolhida a ação (só a service_role o pode fazer a meio do ciclo).
    await rest(`game_players?game_id=eq.${first.id}&player_id=eq.${ids.carla}`, { method: 'DELETE' });
    await nextDay();

    const done = await tick();
    expect(done.map((s) => [s.kind, s.night])).toEqual([['RESOLVE', 2]]);
    expect(done[0].invalid.map((i) => i.error).sort()).toEqual(['UNKNOWN_PLAYER', 'UNKNOWN_TARGET']);
    expect((await ledger(first.id, 2)).map((e) => [e.delta, e.reason])).toEqual([
      [2, 'HOME_BONUS'],
      [2, 'HOME_BONUS'],
      [2, 'HOME_BONUS'],
    ]);
  });

  it('a meio do ciclo, a API não dá à Ana nada privado dos outros (ações, ledger, ranking)', async () => {
    // O Bruno já escolheu a noite 3 (Segurança: sem ataques, dá o mesmo bónus que a Folga): a Ana não o pode ver.
    await choose(ids.bruno, 'DEFEND');
    const seen = await everythingAs(emails.ana);
    expectNothingPrivateOfOthers(seen, ids.ana, false);
    expect(seen.actions.length).toBeGreaterThan(0);
    expect(seen.ledger.length).toBeGreaterThan(0);
    expect(seen.nights).toHaveLength(2);
  });

  it('noites 3 a 8 sem ações: todos em Folga', async () => {
    for (let n = 3; n <= 8; n++) {
      await nextDay();
      expect((await tick()).map((s) => [s.kind, s.night])).toEqual([['RESOLVE', n]]);
    }
  });

  it('noite 9: conta a dobrar e o ciclo acaba, com a seed do desempate', async () => {
    await choose(ids.bruno, 'ATTACK', ids.ana);
    await nextDay();
    expect((await tick()).map((s) => [s.kind, s.night])).toEqual([['RESOLVE', 9], ['FINISH', undefined]]);
    expect(await latest()).toMatchObject({ id: first.id, status: 'finished' });
    expect((await latest()).seed).not.toBeNull();
    expect((await ledger(first.id, 9)).map((e) => e.delta).sort((a, b) => a - b)).toEqual([-20, 4, 20]);

    const all: { player_id: string; delta: number }[] = await rest(`ledger?game_id=eq.${first.id}`);
    const total = (id: string) => all.filter((e) => e.player_id === id).reduce((s, e) => s + e.delta, 0);
    expect([total(ids.ana), total(ids.bruno), total(ids.carla), total(ids.dina)]).toEqual([
      10 + 2 + 6 * 2 - 20,
      -10 + 2 + 6 * 2 + 20,
      2,
      2 + 2 + 6 * 2 + 4,
    ]);
    expect(await rest(`nights?game_id=eq.${first.id}&resolved_at=not.is.null&select=night`)).toHaveLength(9);

    // Ranking final gravado pela resolve-night (o ledger continua privado); a Carla saiu a meio e entra.
    const ranking: { player_id: string; rank: number; points: number }[] = await rest(
      `rankings?game_id=eq.${first.id}&order=rank`,
    );
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranking.map((r) => r.player_id).sort()).toEqual(Object.values(ids).sort());
    for (const r of ranking) expect(r.points).toBe(50 + total(r.player_id));
  });

  it('dia 11: nada a fazer', async () => {
    expect(await tick()).toEqual([]);
  });

  it('dia 11: a API dá à Ana o ranking final, mas nunca o ledger nem as ações dos outros', async () => {
    const seen = await everythingAs(emails.ana);
    expectNothingPrivateOfOthers(seen, ids.ana, true);
    expect(seen.rankings).toHaveLength(4);
  });

  it('dia seguinte à resolução: novo ciclo em preparação, com os mesmos inscritos', async () => {
    await nextDay();
    expect((await tick()).map((s) => s.kind)).toEqual(['NEXT_CYCLE']);
    const next = await latest();
    expect(next).toMatchObject({ status: 'prep', start_date: today(), seed: null });
    expect(next.id).toBeGreaterThan(first.id);
    const enrolled: { player_id: string }[] = await rest(`game_players?game_id=eq.${next.id}`);
    expect(enrolled.map((e) => e.player_id).sort()).toEqual([ids.ana, ids.bruno, ids.dina].sort());
    expect(await tick()).toEqual([]);
  });
});
