// Parte pura dos dados de demonstração (T7b): jogadores, noites jogadas pelos bots do sim/ e verificações.
// Sem I/O: o scripts/demo.ts grava na BD local. Testado em demo-plan.test.ts.
import { NIGHTS, mulberry32, remainingQuota, resolveNight } from '../engine/index.ts';
import type { Action, GameState, NightSummary, PlayerId } from '../engine/index.ts';
import { BOTS } from '../sim/bots.ts';
import type { Bot } from '../sim/bots.ts';

export interface DemoPlayer {
  id: PlayerId;
  name: string;
  email: string;
}

/** 6 jogadores; o Walter e os 3 primeiros têm os ids e emails do supabase/seed.sql. */
export const DEMO_PLAYERS: DemoPlayer[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Walter', email: 'walter@nightstaff.local' },
  { id: '00000000-0000-0000-0000-0000000000a1', name: 'Ana', email: 'ana@nightstaff.local' },
  { id: '00000000-0000-0000-0000-0000000000b2', name: 'Bruno', email: 'bruno@nightstaff.local' },
  { id: '00000000-0000-0000-0000-0000000000c3', name: 'Carla', email: 'carla@nightstaff.local' },
  { id: '00000000-0000-0000-0000-0000000000d4', name: 'Duarte', email: 'duarte@nightstaff.local' },
  { id: '00000000-0000-0000-0000-0000000000e5', name: 'Eva', email: 'eva@nightstaff.local' },
];
export const WALTER = DEMO_PLAYERS[0].id;

/** Só o Supabase local: 127.0.0.1 ou localhost. */
export function isLocalUrl(url: string | undefined): boolean {
  return !!url && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
}

/** Metade dos jogadores com o bot esperto, metade com o aleatório. */
const botOf = (players: PlayerId[], p: PlayerId): Bot => (players.indexOf(p) % 2 === 0 ? BOTS.smart : BOTS.random);

/**
 * Ações dos bots numa noite, para os jogadores `who`, a partir do que é público (resumos das noites
 * anteriores) e das quotas de cada um (`pastActions`).
 */
export function botActions(
  players: PlayerId[],
  who: PlayerId[],
  night: number,
  history: NightSummary[],
  pastActions: Action[],
  rng: () => number,
): Action[] {
  const state: GameState = { players, night, pastActions };
  return who.map((me) =>
    botOf(players, me)({ me, players, night, nights: NIGHTS, history, quota: remainingQuota(state, me) }, rng),
  );
}

/** As noites 1 a `count` jogadas só pelos bots. Os resumos vêm do `resolveNight`, como na BD. */
export function playNights(players: PlayerId[], count: number, seed: number): Action[][] {
  const rng = mulberry32(seed);
  const past: Action[] = [];
  const history: NightSummary[] = [];
  const nights: Action[][] = [];
  for (let night = 1; night <= count; night++) {
    const actions = botActions(players, players, night, history, [...past], rng);
    // O resumo não depende da seed da noite (só quem ganha o sorteio): os bots jogam igual na BD.
    history.push(resolveNight({ players, night, pastActions: [...past] }, actions, 1).summary);
    past.push(...actions);
    nights.push(actions);
  }
  return nights;
}

export interface Features {
  draw: boolean;
  reveal: boolean;
  bomb: boolean;
  burglary: boolean;
}

/** O que aconteceu nas noites dadas: sorteio, defesa com revelação, bomba e assalto a uma casa vazia. */
export function features(players: PlayerId[], nights: Action[][]): Features {
  const f: Features = { draw: false, reveal: false, bomb: false, burglary: false };
  const past: Action[] = [];
  nights.forEach((actions, i) => {
    const { ledger, summary } = resolveNight({ players, night: i + 1, pastActions: [...past] }, actions, 1);
    f.draw ||= summary.players.some((s) => s.draw);
    f.reveal ||= summary.players.some((s) => s.defended && s.revealedAttackers.length > 0);
    f.bomb ||= actions.some((a) => a.type === 'BOMB');
    f.burglary ||= ledger.some((e) => e.reason === 'ATTACK_BURGLARY');
    past.push(...actions);
  });
  return f;
}

/** Primeira seed em que as noites 1 a 4 têm tudo o que a demo precisa de mostrar. */
export function findDemoSeed(players: PlayerId[]): number {
  for (let seed = 1; seed < 100_000; seed++) {
    const f = features(players, playNights(players, 4, seed));
    if (f.draw && f.reveal && f.bomb && f.burglary) return seed;
  }
  throw new Error('Nenhuma seed com sorteio, defesa, bomba e assalto nas noites 1 a 4');
}
